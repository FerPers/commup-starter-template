-- S20 — banco de carga reproducible (decisión de Luis 2026-10-20): org LOADTEST aparte en prod.
--
-- ⚠️ 2026-10-22: NO correr contra prod por la API de administración. La siembra apaga triggers con ALTER TABLE
-- (bloqueo ShareRowExclusive sobre tags, itrs, punches…): la API cortó la petición a los 2 min (524), la transacción
-- quedó viva en el servidor con esos bloqueos, las escrituras de la app se encolaron, se agotaron las conexiones y
-- prod quedó sin BD ~30 min (22:52–23:23 UTC) hasta reiniciar el proyecto. Usar una rama de Supabase o una BD local
-- (supabase start) y apuntar ahí run.mjs / bench.sql.
-- Escala: 10 áreas · 300 sistemas · 1.500 subsistemas · 50.000 tags · ~60.000 ITR · 10.000 punch · 450 certificados.
-- Meta: Control Tower, Mi trabajo y la lista de ITR con p95 < 1,5 s (ver bench.sql).
-- R2b (2026-10-22): matriz aceptada que reproduce los ITR sembrados + una regla con requisitos sin generar (12.500),
-- 500 exclusiones, 500 agregados a mano y códigos del cliente, para medir el registro «Requisitos ITR» y su Excel.
--
-- Uso:   node scripts/loadtest/run.mjs scripts/loadtest/seed.sql [--db-url <url-rama>]   (por defecto la BD local;
--        ≈ 3–5 min; si el banco ya existe, teardown.sql primero). El archivo va en bloques `-- @@chunk`, cada uno una
--        transacción corta que run.mjs manda por separado; en psql corre entero (los bloques en orden).
-- Borrar: node scripts/loadtest/run.mjs scripts/loadtest/teardown.sql [--db-url <url-rama>]
--
-- Miembros: owner = usuario de prueba demo-glp@commup.test (bench_user, para medir con RLS) y la cuenta de Luis como
-- admin (para verlo en el navegador). Durante la siembra se apagan SOLO los triggers de eventos (domain_events → webhooks / workflows:
-- serían 110k llamadas HTTP) y las guardas/derivados que exigen el flujo real (firmas, numeración, refresco de
-- certificados); cada bloque los vuelve a encender en su misma transacción.

-- @@chunk catálogos y jerarquía
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE systems DISABLE TRIGGER trg_events_systems;
ALTER TABLE subsystems DISABLE TRIGGER trg_events_subsystems;
-- Sembrar sobre un banco existente: primero teardown.sql (el borrado en cascada necesita apagar las guardas de borrado).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE id = '10ad7e57-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'LOADTEST ya existe: correr teardown.sql antes de volver a sembrar';
  END IF;
END $$;

INSERT INTO organizations (id, name, slug) SELECT org_id, 'LOADTEST (banco de carga)', 'loadtest-bench' FROM lt_ids;
INSERT INTO org_members (org_id, user_id, role, status) SELECT org_id, bench_user, 'owner', 'active' FROM lt_ids;
-- Cuenta de Luis como admin, para ver el banco en el navegador (aparece en su selector de organización).
INSERT INTO org_members (org_id, user_id, role, status)
SELECT org_id, 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366'::uuid, 'admin', 'active' FROM lt_ids
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366');
INSERT INTO projects (id, org_id, name, code) SELECT project_id, org_id, 'LOADTEST — Planta 50k', 'LT-50K' FROM lt_ids;

-- Fases (el trigger siembra un gate por fase) y catálogos.
INSERT INTO project_phases (org_id, code, name, order_index, certificate_name)
SELECT org_id, c, n, o, cert FROM lt_ids, (VALUES ('A', 'Mechanical Completion', 1, 'MC'), ('B', 'Pre-Commissioning', 2, 'RFPC'),
  ('C', 'Commissioning', 3, 'RFC'), ('SU', 'Start-Up', 4, 'RFSU')) v(c, n, o, cert);
INSERT INTO disciplines (org_id, code, name)
SELECT org_id, c, n FROM lt_ids, (VALUES ('INST', 'Instruments'), ('ELEC', 'Electrical'), ('MECH', 'Mechanical'), ('PIPE', 'Piping')) v(c, n);
INSERT INTO equipment_types (org_id, code, name)
SELECT org_id, c, n FROM lt_ids, (VALUES ('TX', 'Transmitter'), ('MTR', 'Motor'), ('PMP', 'Pump'), ('PL', 'Pipe line')) v(c, n);

-- Plantillas: fase A por disciplina + fase B y C para instrumentos y eléctrico.
INSERT INTO itr_templates (org_id, discipline_id, phase_id, code, title, is_active)
SELECT i.org_id, d.id, ph.id, ph.code || '-' || d.code, 'LT ' || ph.name || ' ' || d.name, true
FROM lt_ids i JOIN disciplines d ON d.org_id = i.org_id JOIN project_phases ph ON ph.org_id = i.org_id
WHERE ph.code = 'A' OR (ph.code IN ('B', 'C') AND d.code IN ('INST', 'ELEC'));

-- Jerarquía: 10 áreas × 30 sistemas × 5 subsistemas.
INSERT INTO areas (project_id, code, name)
SELECT project_id, 'A' || lpad(a::text, 2, '0'), 'Área ' || a FROM lt_ids, generate_series(1, 10) a;
INSERT INTO systems (project_id, area_id, code, name)
SELECT i.project_id, ar.id, ar.code || '-S' || lpad(s::text, 2, '0'), 'Sistema ' || ar.code || '-' || s
FROM lt_ids i JOIN areas ar ON ar.project_id = i.project_id, generate_series(1, 30) s;
INSERT INTO subsystems (project_id, system_id, code, name)
SELECT i.project_id, sy.id, sy.code || '-SS' || ss, 'Subsistema ' || sy.code || '-' || ss
FROM lt_ids i JOIN systems sy ON sy.project_id = i.project_id, generate_series(1, 5) ss;

ALTER TABLE systems ENABLE TRIGGER trg_events_systems;
ALTER TABLE subsystems ENABLE TRIGGER trg_events_subsystems;
COMMIT;

-- @@chunk tags 1-10000
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE tags DISABLE TRIGGER trg_events_tags;
-- 50.000 tags (≈ 33 por subsistema); 3 % críticos de seguridad. Tags 1–10000
INSERT INTO tags (project_id, subsystem_id, discipline_id, equipment_type_id, tag_number, description, criticality)
SELECT i.project_id, a.subs[1 + (n - 1) % 1500], a.discs[1 + n % 4], a.ets[1 + n % 4], 'LT-' || lpad(n::text, 6, '0'), 'Tag de carga ' || n,
       CASE WHEN n % 33 = 0 THEN 'safety' WHEN n % 11 = 0 THEN 'process' ELSE 'normal' END
FROM lt_ids i
CROSS JOIN LATERAL (SELECT
  (SELECT array_agg(id ORDER BY code) FROM subsystems WHERE project_id = i.project_id) AS subs,
  (SELECT array_agg(id ORDER BY code) FROM disciplines WHERE org_id = i.org_id) AS discs,
  (SELECT array_agg(id ORDER BY code) FROM equipment_types WHERE org_id = i.org_id) AS ets) a
CROSS JOIN generate_series(1, 10000) n;

ALTER TABLE tags ENABLE TRIGGER trg_events_tags;
COMMIT;

-- @@chunk tags 10001-20000
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE tags DISABLE TRIGGER trg_events_tags;
-- tags 10001–20000
INSERT INTO tags (project_id, subsystem_id, discipline_id, equipment_type_id, tag_number, description, criticality)
SELECT i.project_id, a.subs[1 + (n - 1) % 1500], a.discs[1 + n % 4], a.ets[1 + n % 4], 'LT-' || lpad(n::text, 6, '0'), 'Tag de carga ' || n,
       CASE WHEN n % 33 = 0 THEN 'safety' WHEN n % 11 = 0 THEN 'process' ELSE 'normal' END
FROM lt_ids i
CROSS JOIN LATERAL (SELECT
  (SELECT array_agg(id ORDER BY code) FROM subsystems WHERE project_id = i.project_id) AS subs,
  (SELECT array_agg(id ORDER BY code) FROM disciplines WHERE org_id = i.org_id) AS discs,
  (SELECT array_agg(id ORDER BY code) FROM equipment_types WHERE org_id = i.org_id) AS ets) a
CROSS JOIN generate_series(10001, 20000) n;

ALTER TABLE tags ENABLE TRIGGER trg_events_tags;
COMMIT;

-- @@chunk tags 20001-30000
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE tags DISABLE TRIGGER trg_events_tags;
-- tags 20001–30000
INSERT INTO tags (project_id, subsystem_id, discipline_id, equipment_type_id, tag_number, description, criticality)
SELECT i.project_id, a.subs[1 + (n - 1) % 1500], a.discs[1 + n % 4], a.ets[1 + n % 4], 'LT-' || lpad(n::text, 6, '0'), 'Tag de carga ' || n,
       CASE WHEN n % 33 = 0 THEN 'safety' WHEN n % 11 = 0 THEN 'process' ELSE 'normal' END
FROM lt_ids i
CROSS JOIN LATERAL (SELECT
  (SELECT array_agg(id ORDER BY code) FROM subsystems WHERE project_id = i.project_id) AS subs,
  (SELECT array_agg(id ORDER BY code) FROM disciplines WHERE org_id = i.org_id) AS discs,
  (SELECT array_agg(id ORDER BY code) FROM equipment_types WHERE org_id = i.org_id) AS ets) a
CROSS JOIN generate_series(20001, 30000) n;

ALTER TABLE tags ENABLE TRIGGER trg_events_tags;
COMMIT;

-- @@chunk tags 30001-40000
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE tags DISABLE TRIGGER trg_events_tags;
-- tags 30001–40000
INSERT INTO tags (project_id, subsystem_id, discipline_id, equipment_type_id, tag_number, description, criticality)
SELECT i.project_id, a.subs[1 + (n - 1) % 1500], a.discs[1 + n % 4], a.ets[1 + n % 4], 'LT-' || lpad(n::text, 6, '0'), 'Tag de carga ' || n,
       CASE WHEN n % 33 = 0 THEN 'safety' WHEN n % 11 = 0 THEN 'process' ELSE 'normal' END
FROM lt_ids i
CROSS JOIN LATERAL (SELECT
  (SELECT array_agg(id ORDER BY code) FROM subsystems WHERE project_id = i.project_id) AS subs,
  (SELECT array_agg(id ORDER BY code) FROM disciplines WHERE org_id = i.org_id) AS discs,
  (SELECT array_agg(id ORDER BY code) FROM equipment_types WHERE org_id = i.org_id) AS ets) a
CROSS JOIN generate_series(30001, 40000) n;

ALTER TABLE tags ENABLE TRIGGER trg_events_tags;
COMMIT;

-- @@chunk tags 40001-50000
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE tags DISABLE TRIGGER trg_events_tags;
-- tags 40001–50000
INSERT INTO tags (project_id, subsystem_id, discipline_id, equipment_type_id, tag_number, description, criticality)
SELECT i.project_id, a.subs[1 + (n - 1) % 1500], a.discs[1 + n % 4], a.ets[1 + n % 4], 'LT-' || lpad(n::text, 6, '0'), 'Tag de carga ' || n,
       CASE WHEN n % 33 = 0 THEN 'safety' WHEN n % 11 = 0 THEN 'process' ELSE 'normal' END
FROM lt_ids i
CROSS JOIN LATERAL (SELECT
  (SELECT array_agg(id ORDER BY code) FROM subsystems WHERE project_id = i.project_id) AS subs,
  (SELECT array_agg(id ORDER BY code) FROM disciplines WHERE org_id = i.org_id) AS discs,
  (SELECT array_agg(id ORDER BY code) FROM equipment_types WHERE org_id = i.org_id) AS ets) a
CROSS JOIN generate_series(40001, 50000) n;

ALTER TABLE tags ENABLE TRIGGER trg_events_tags;
COMMIT;

-- @@chunk itrs A01
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR: uno de fase A por tag; B y C para instrumentos y eléctrico (≈ 75k). Avance desigual por área:
-- áreas 1–3 casi todo aprobado, 4–7 a medias, 8–10 empezando.
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A01';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A02
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A02
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A02';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A03
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A03
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A03';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A04
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A04
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A04';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A05
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A05
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A05';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A06
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A06
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A06';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A07
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A07
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A07';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A08
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A08
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A08';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A09
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A09
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A09';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk itrs A10
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_derived_guard,
  DISABLE TRIGGER itrs_number_before_insert, DISABLE TRIGGER itrs_auto_document_refs, DISABLE TRIGGER itrs_certificate_base;
-- ITR del área A10
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number,
       st.status::itr_status, CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
       ARRAY['executor', 'supervisor'], CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 120) END
FROM lt_ids i
JOIN tags t ON t.project_id = i.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code <= 'A03' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' AND ar.code <= 'A07' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ph.code = 'A' THEN (ARRAY['not_started', 'not_started', 'in_progress'])[1 + abs(hashtext(t.tag_number)) % 3]
    WHEN ar.code <= 'A03' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE ar.code = 'A10';

ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_derived_guard,
  ENABLE TRIGGER itrs_number_before_insert, ENABLE TRIGGER itrs_auto_document_refs, ENABLE TRIGGER itrs_certificate_base;
COMMIT;

-- @@chunk asignaciones
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE itr_assignments DISABLE TRIGGER itr_assignments_integrity, DISABLE TRIGGER itr_assignments_client_guard;
-- 2.000 ITR pendientes asignados al usuario del banco (Mi trabajo a escala).
INSERT INTO itr_assignments (itr_id, user_id, role)
SELECT x.id, i.bench_user, 'executor'::signature_role FROM lt_ids i,
  LATERAL (SELECT id FROM itrs WHERE project_id = i.project_id AND status IN ('not_started', 'in_progress') ORDER BY itr_number LIMIT 2000) x;

ALTER TABLE itr_assignments ENABLE TRIGGER itr_assignments_integrity, ENABLE TRIGGER itr_assignments_client_guard;
COMMIT;

-- @@chunk matriz, excepciones y códigos del cliente (R2b)
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
-- R2b: matriz aceptada. Los tags llevan el tipo y la disciplina del mismo puesto (por código): MTR↔ELEC, PL↔INST,
-- PMP↔MECH, TX↔PIPE; cada tipo recibe las plantillas de su disciplina (= los ITR de arriba) y TX además B-INST, que
-- nadie generó (12.500 requisitos «falta»).
INSERT INTO equipment_type_templates (org_id, equipment_type_id, itr_template_id, status, source, reason)
SELECT i.org_id, et.id, tp.id, 'accepted', 'manual', 'LOADTEST'
FROM lt_ids i
JOIN (SELECT id, org_id, row_number() OVER (PARTITION BY org_id ORDER BY code) AS rn FROM equipment_types) et ON et.org_id = i.org_id
JOIN (SELECT id, org_id, row_number() OVER (PARTITION BY org_id ORDER BY code) AS rn FROM disciplines) d ON d.org_id = i.org_id AND d.rn = et.rn
JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.discipline_id = d.id;
INSERT INTO equipment_type_templates (org_id, equipment_type_id, itr_template_id, status, source, reason)
SELECT i.org_id, et.id, tp.id, 'accepted', 'manual', 'LOADTEST'
FROM lt_ids i JOIN equipment_types et ON et.org_id = i.org_id AND et.code = 'TX' JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.code = 'B-INST';
-- Excepciones: 500 exclusiones del A de su disciplina y 500 agregados de C-ELEC (en el alcance).
INSERT INTO tag_itr_overrides (org_id, project_id, tag_id, template_code, action, reason, created_by)
SELECT i.org_id, i.project_id, t.id, 'A-' || d.code, 'exclude', 'LOADTEST: excluido para el banco', i.bench_user
FROM lt_ids i JOIN tags t ON t.project_id = i.project_id JOIN disciplines d ON d.id = t.discipline_id
WHERE t.tag_number IN (SELECT 'LT-' || lpad((n * 97 % 50000 + 1)::text, 6, '0') FROM generate_series(1, 500) n);
INSERT INTO tag_itr_overrides (org_id, project_id, tag_id, template_code, action, created_by)
SELECT i.org_id, i.project_id, t.id, 'C-ELEC', 'add', i.bench_user
FROM lt_ids i JOIN tags t ON t.project_id = i.project_id JOIN disciplines d ON d.id = t.discipline_id AND d.code <> 'ELEC'
WHERE t.tag_number IN (SELECT 'LT-' || lpad((n * 89 % 50000 + 2)::text, 6, '0') FROM generate_series(1, 600) n)
ON CONFLICT (tag_id, template_code) DO NOTHING;
-- Códigos del cliente: defecto de la org para todas las plantillas y del proyecto para las de fase C.
INSERT INTO template_client_codes (org_id, project_id, template_code, client_code)
SELECT i.org_id, NULL, upper(tp.code), 'CLI-' || tp.code FROM lt_ids i JOIN itr_templates tp ON tp.org_id = i.org_id;
INSERT INTO template_client_codes (org_id, project_id, template_code, client_code)
SELECT i.org_id, i.project_id, upper(tp.code), 'PRJ-' || tp.code FROM lt_ids i JOIN itr_templates tp ON tp.org_id = i.org_id AND tp.code LIKE 'C-%';

COMMIT;

-- @@chunk punch y certificados
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ALTER TABLE punches DISABLE TRIGGER trg_events_punches, DISABLE TRIGGER punches_guard, DISABLE TRIGGER punch_number_before_insert,
  DISABLE TRIGGER punches_certificate_base;
ALTER TABLE certificates DISABLE TRIGGER trg_events_certificates;
-- 10.000 punch: 10 % A, 30 % B, 60 % C; 60 % cerrados.
INSERT INTO punches (project_id, subsystem_id, tag_id, discipline_id, punch_number, category, description, raised_by, status, assigned_to)
SELECT t.project_id, t.subsystem_id, t.id, t.discipline_id, 'P-' || lpad(n::text, 5, '0'),
       (CASE WHEN n % 10 = 0 THEN 'A' WHEN n % 10 < 4 THEN 'B' ELSE 'C' END)::punch_category,
       'Punch de carga ' || n, i.bench_user,
       (CASE WHEN n % 5 < 3 THEN 'closed' WHEN n % 5 = 3 THEN 'in_progress' ELSE 'open' END)::punch_status,
       CASE WHEN n % 20 = 0 THEN i.bench_user END
FROM lt_ids i
CROSS JOIN generate_series(1, 10000) n
JOIN tags t ON t.project_id = i.project_id AND t.tag_number = 'LT-' || lpad(((n * 7) % 50000 + 1)::text, 6, '0');

-- Certificados MC emitidos en los subsistemas de las áreas 1–3.
INSERT INTO certificates (project_id, subsystem_id, phase_id, certificate_number, title, status, issued_date, issued_by)
SELECT i.project_id, sub.id, ph.id, 'MC/' || sub.code, 'MC — ' || sub.code, 'issued', current_date - 10, i.bench_user
FROM lt_ids i JOIN subsystems sub ON sub.project_id = i.project_id JOIN systems sy ON sy.id = sub.system_id
JOIN areas ar ON ar.id = sy.area_id JOIN project_phases ph ON ph.org_id = i.org_id AND ph.code = 'A'
WHERE ar.code <= 'A03';

ALTER TABLE punches ENABLE TRIGGER trg_events_punches, ENABLE TRIGGER punches_guard, ENABLE TRIGGER punch_number_before_insert,
  ENABLE TRIGGER punches_certificate_base;
ALTER TABLE certificates ENABLE TRIGGER trg_events_certificates;
COMMIT;

-- @@chunk análisis y conteo
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS SELECT
  '10ad7e57-0000-4000-8000-000000000001'::uuid AS org_id,
  '10ad7e57-0000-4000-8000-000000000002'::uuid AS project_id,
  '41d8f81c-28f9-458c-af3f-b754795b2c52'::uuid AS bench_user;
ANALYZE tags; ANALYZE itrs; ANALYZE equipment_type_templates; ANALYZE tag_itr_overrides; ANALYZE template_client_codes; ANALYZE punches; ANALYZE subsystems; ANALYZE systems; ANALYZE itr_assignments; ANALYZE certificates;

SELECT (SELECT count(*) FROM systems WHERE project_id = (SELECT project_id FROM lt_ids)) AS systems,
       (SELECT count(*) FROM subsystems WHERE project_id = (SELECT project_id FROM lt_ids)) AS subsystems,
       (SELECT count(*) FROM tags WHERE project_id = (SELECT project_id FROM lt_ids)) AS tags,
       (SELECT count(*) FROM itrs WHERE project_id = (SELECT project_id FROM lt_ids)) AS itrs,
       (SELECT count(*) FROM punches WHERE project_id = (SELECT project_id FROM lt_ids)) AS punches,
       (SELECT count(*) FROM certificates WHERE project_id = (SELECT project_id FROM lt_ids)) AS certificates;
COMMIT;
