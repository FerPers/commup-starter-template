-- A17 — proyecto de referencia para medir con el volumen de los primeros proyectos de Geopark (Luis, 2026-10-24:
-- 2.000–5.000 tags por proyecto; se mide el extremo alto). SOLO la BD LOCAL (supabase start): siembra con
-- `session_replication_role = replica` (sin triggers) y después marca gates y requisitos para recalcular.
--
--   psql "$(supabase status -o env | grep ^DB_URL= | cut -d= -f2- | tr -d '"')" -v ON_ERROR_STOP=1 -f scripts/loadtest/seed-reference.sql
--   (otra escala: -v tags=50000 -v areas=10; borrar: scripts/loadtest/teardown-reference.sql)
--
-- Org «REF-5K (medición A17)» con los usuarios locales de supabase/seed/00_actors.sql: owner@ (owner), leader@
-- (líder, supervisor de los ITR) e inspector@ (ejecutor; 300 ITR pendientes en Mi trabajo). Por defecto: 2 áreas ×
-- 10 sistemas × 5 subsistemas, 5.000 tags (250 por sistema), plantillas de 20 ítems (fase A por disciplina; B y C en
-- instrumentos y eléctrico) ≈ 10.000 ITR; el área A01 casi toda aprobada, con respuestas y dos firmas por ITR (lo que
-- llevan el PDF del ITR y el paquete de handover); 1.000 punch y certificados MC en A01.
\set ON_ERROR_STOP 1
\if :{?tags} \else \set tags 5000 \endif
\if :{?areas} \else \set areas 2 \endif
\set systems_per_area 10
\set subs_per_system 5

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = 'commup-catalogo' OR name = 'CommUp Catálogo') THEN
    RAISE EXCEPTION 'seed-reference: esta BD parece producción; solo la local';
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE id = '5e0f5000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'seed-reference: REF-5K ya existe (scripts/loadtest/teardown-reference.sql)';
  END IF;
END $$;

-- 1) Org, proyecto, catálogos y jerarquía CON triggers (gates por fase, alcance de disciplinas, dueños de sistema).
BEGIN;
INSERT INTO organizations (id, name, slug) VALUES ('5e0f5000-0000-4000-8000-000000000001', 'REF-5K (medición A17)', 'ref-5k');
INSERT INTO org_members (org_id, user_id, role, status) VALUES
  ('5e0f5000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a5', 'owner', 'active'),
  ('5e0f5000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a2', 'leader', 'active'),
  ('5e0f5000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a1', 'inspector', 'active');
INSERT INTO project_phases (org_id, code, name, order_index, certificate_name)
SELECT '5e0f5000-0000-4000-8000-000000000001', c, n, o, cert FROM (VALUES ('A', 'Mechanical Completion', 1, 'MC'),
  ('B', 'Pre-Commissioning', 2, 'RFPC'), ('C', 'Commissioning', 3, 'RFC'), ('SU', 'Start-Up', 4, 'RFSU')) v(c, n, o, cert);
INSERT INTO disciplines (org_id, code, name)
SELECT '5e0f5000-0000-4000-8000-000000000001', c, n FROM (VALUES ('INST', 'Instruments'), ('ELEC', 'Electrical'), ('MECH', 'Mechanical'), ('PIPE', 'Piping')) v(c, n);
INSERT INTO equipment_types (org_id, code, name)
SELECT '5e0f5000-0000-4000-8000-000000000001', c, n FROM (VALUES ('TX', 'Transmitter'), ('MTR', 'Motor'), ('PMP', 'Pump'), ('PL', 'Pipe line')) v(c, n);
INSERT INTO projects (id, org_id, name, code) VALUES ('5e0f5000-0000-4000-8000-000000000002', '5e0f5000-0000-4000-8000-000000000001', 'REF-5K — Estación de referencia', 'REF-5K');
INSERT INTO areas (project_id, code, name)
SELECT '5e0f5000-0000-4000-8000-000000000002', 'A' || lpad(a::text, 2, '0'), 'Área ' || a FROM generate_series(1, :areas) a;
INSERT INTO systems (project_id, area_id, code, name)
SELECT ar.project_id, ar.id, ar.code || '-S' || lpad(s::text, 2, '0'), 'Sistema ' || ar.code || '-' || s
FROM areas ar, generate_series(1, :systems_per_area) s WHERE ar.project_id = '5e0f5000-0000-4000-8000-000000000002';
INSERT INTO subsystems (project_id, system_id, code, name)
SELECT sy.project_id, sy.id, sy.code || '-SS' || ss, 'Subsistema ' || sy.code || '-' || ss
FROM systems sy, generate_series(1, :subs_per_system) ss WHERE sy.project_id = '5e0f5000-0000-4000-8000-000000000002';
-- Plantillas de 20 ítems: 12 selecciones con resultado, 4 textos, 3 mediciones con límites y 1 fecha.
INSERT INTO itr_templates (org_id, discipline_id, phase_id, code, title, is_active, required_signatures)
SELECT d.org_id, d.id, ph.id, ph.code || '-' || d.code, 'REF ' || ph.name || ' ' || d.name, true, ARRAY['executor', 'supervisor']
FROM disciplines d JOIN project_phases ph ON ph.org_id = d.org_id
WHERE d.org_id = '5e0f5000-0000-4000-8000-000000000001' AND (ph.code = 'A' OR (ph.code IN ('B', 'C') AND d.code IN ('INST', 'ELEC')));
INSERT INTO itr_template_sections (template_id, title, order_index)
SELECT id, 'Verificación', 0 FROM itr_templates WHERE org_id = '5e0f5000-0000-4000-8000-000000000001';
INSERT INTO itr_template_items (template_id, section_id, item_number, description, description_es, item_type, is_required, options, option_outcomes, unit, acceptance_min, acceptance_max, order_index)
SELECT s.template_id, s.id, k::text || '.0', 'Check ' || k, 'Verificación ' || k || ' del elemento según el procedimiento aplicable.',
  (CASE WHEN k <= 12 THEN 'select' WHEN k <= 16 THEN 'text' WHEN k <= 19 THEN 'measurement' ELSE 'date' END)::itr_item_type, true,
  CASE WHEN k <= 12 THEN '["Conforme", "No conforme", "No aplica"]'::jsonb END,
  CASE WHEN k <= 12 THEN '{"Conforme": "pass", "No conforme": "fail", "No aplica": "not_applicable"}'::jsonb ELSE '{}'::jsonb END,
  CASE WHEN k BETWEEN 17 AND 19 THEN 'MΩ' END, CASE WHEN k BETWEEN 17 AND 19 THEN 100 END, NULL, k
FROM itr_template_sections s JOIN itr_templates t ON t.id = s.template_id, generate_series(1, 20) k
WHERE t.org_id = '5e0f5000-0000-4000-8000-000000000001';
COMMIT;

-- 2) Volumen SIN triggers.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO tags (project_id, subsystem_id, discipline_id, equipment_type_id, tag_number, description, criticality, manufacturer, model)
SELECT '5e0f5000-0000-4000-8000-000000000002', a.subs[1 + (n - 1) % cardinality(a.subs)], a.discs[1 + n % 4], a.ets[1 + n % 4],
  'REF-' || lpad(n::text, 5, '0'), 'Elemento de referencia ' || n,
  CASE WHEN n % 33 = 0 THEN 'safety' WHEN n % 11 = 0 THEN 'process' ELSE 'normal' END, 'Fabricante ' || (n % 7), 'Modelo ' || (n % 13)
FROM (SELECT
  (SELECT array_agg(id ORDER BY code) FROM subsystems WHERE project_id = '5e0f5000-0000-4000-8000-000000000002') AS subs,
  (SELECT array_agg(id ORDER BY code) FROM disciplines WHERE org_id = '5e0f5000-0000-4000-8000-000000000001') AS discs,
  (SELECT array_agg(id ORDER BY code) FROM equipment_types WHERE org_id = '5e0f5000-0000-4000-8000-000000000001') AS ets) a,
  generate_series(1, :tags) n;

-- ITR: A01 casi todo aprobado en fase A y un tercio en B/C; el resto, a medias o sin empezar.
INSERT INTO itrs (project_id, subsystem_id, tag_id, template_id, phase_id, itr_number, status, progress_pct, required_signatures, requires_test_equipment, completed_date)
SELECT t.project_id, t.subsystem_id, t.id, tp.id, tp.phase_id, tp.code || '/' || t.tag_number, st.status::itr_status,
  CASE st.status WHEN 'approved' THEN 100 WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END,
  ARRAY['executor', 'supervisor'], false, CASE WHEN st.status IN ('approved', 'completed') THEN current_date - (abs(hashtext(t.tag_number)) % 90) END
FROM tags t JOIN subsystems sub ON sub.id = t.subsystem_id JOIN systems sy ON sy.id = sub.system_id JOIN areas ar ON ar.id = sy.area_id
JOIN itr_templates tp ON tp.org_id = '5e0f5000-0000-4000-8000-000000000001' AND tp.discipline_id = t.discipline_id
JOIN project_phases ph ON ph.id = tp.phase_id
CROSS JOIN LATERAL (SELECT CASE
    WHEN ph.code = 'A' AND ar.code = 'A01' THEN CASE WHEN abs(hashtext(t.tag_number)) % 50 = 0 THEN 'in_progress' ELSE 'approved' END
    WHEN ph.code = 'A' THEN (ARRAY['approved', 'approved', 'in_progress', 'not_started', 'completed'])[1 + abs(hashtext(t.tag_number)) % 5]
    WHEN ar.code = 'A01' THEN (ARRAY['approved', 'in_progress', 'not_started'])[1 + abs(hashtext(t.tag_number || ph.code)) % 3]
    ELSE 'not_started' END AS status) st
WHERE t.project_id = '5e0f5000-0000-4000-8000-000000000002';

-- Respuestas (todos los ítems) en los ITR aprobados o completados; firmas del ejecutor y del supervisor en los aprobados.
INSERT INTO itr_responses (itr_id, item_id, value_text, value_numeric, value_option, is_passed, responded_at, responded_by, captured_at)
SELECT i.id, it.id,
  CASE WHEN it.item_type::text = 'text' THEN 'Verificado en campo conforme a planos y especificaciones.' WHEN it.item_type::text = 'date' THEN to_char(i.completed_date, 'YYYY-MM-DD') END,
  CASE WHEN it.item_type::text = 'measurement' THEN 250 + (abs(hashtext(i.id::text || it.id::text)) % 500) END,
  CASE WHEN it.item_type::text = 'select' THEN 'Conforme' END, true, now(), 'e2e00000-0000-4000-8000-0000000000a1', now()
FROM itrs i JOIN itr_template_items it ON it.template_id = i.template_id
WHERE i.project_id = '5e0f5000-0000-4000-8000-000000000002' AND i.status IN ('approved', 'completed');
INSERT INTO itr_assignments (itr_id, user_id, role)
SELECT i.id, u.user_id, u.role::signature_role FROM itrs i,
  (VALUES ('e2e00000-0000-4000-8000-0000000000a1'::uuid, 'executor'), ('e2e00000-0000-4000-8000-0000000000a2'::uuid, 'supervisor')) u(user_id, role)
WHERE i.project_id = '5e0f5000-0000-4000-8000-000000000002' AND i.status IN ('approved', 'completed');
INSERT INTO itr_signatures (itr_id, user_id, role, signed_at)
SELECT i.id, u.user_id, u.role::signature_role, i.completed_date::timestamptz + interval '10 hours' FROM itrs i,
  (VALUES ('e2e00000-0000-4000-8000-0000000000a1'::uuid, 'executor'), ('e2e00000-0000-4000-8000-0000000000a2'::uuid, 'supervisor')) u(user_id, role)
WHERE i.project_id = '5e0f5000-0000-4000-8000-000000000002' AND i.status = 'approved';
-- Mi trabajo del inspector: 300 ITR pendientes asignados.
INSERT INTO itr_assignments (itr_id, user_id, role)
SELECT x.id, 'e2e00000-0000-4000-8000-0000000000a1', 'executor' FROM (
  SELECT id FROM itrs WHERE project_id = '5e0f5000-0000-4000-8000-000000000002' AND status IN ('not_started', 'in_progress') ORDER BY itr_number LIMIT 300) x;

-- 1.000 punch (10 % A, 30 % B, 60 % C; 60 % cerrados) y certificados MC emitidos en A01.
INSERT INTO punches (project_id, subsystem_id, tag_id, discipline_id, punch_number, category, description, raised_by, status)
SELECT t.project_id, t.subsystem_id, t.id, t.discipline_id, 'P-' || lpad(n::text, 5, '0'),
  (CASE WHEN n % 10 = 0 THEN 'A' WHEN n % 10 < 4 THEN 'B' ELSE 'C' END)::punch_category, 'Punch de referencia ' || n,
  'e2e00000-0000-4000-8000-0000000000a1', (CASE WHEN n % 5 < 3 THEN 'closed' WHEN n % 5 = 3 THEN 'in_progress' ELSE 'open' END)::punch_status
FROM generate_series(1, greatest(:tags / 5, 1)) n
JOIN tags t ON t.project_id = '5e0f5000-0000-4000-8000-000000000002' AND t.tag_number = 'REF-' || lpad(((n * 7) % :tags + 1)::text, 5, '0');
INSERT INTO certificates (project_id, subsystem_id, phase_id, certificate_number, title, status, issued_date, issued_by)
SELECT sub.project_id, sub.id, ph.id, 'MC/' || sub.code, 'MC — ' || sub.code, 'issued', current_date - 10, 'e2e00000-0000-4000-8000-0000000000a2'
FROM subsystems sub JOIN systems sy ON sy.id = sub.system_id JOIN areas ar ON ar.id = sy.area_id
JOIN project_phases ph ON ph.org_id = '5e0f5000-0000-4000-8000-000000000001' AND ph.code = 'A'
WHERE sub.project_id = '5e0f5000-0000-4000-8000-000000000002' AND ar.code = 'A01';
COMMIT;

-- 3) Lo materializado se recalcula al leer: marcar gates y requisitos, y estadísticas.
SELECT public.gate_status_mark(array_agg(id)) FROM systems WHERE project_id = '5e0f5000-0000-4000-8000-000000000002';
SELECT public.tag_requirements_mark_projects(ARRAY['5e0f5000-0000-4000-8000-000000000002'::uuid]);
ANALYZE tags; ANALYZE itrs; ANALYZE itr_responses; ANALYZE itr_signatures; ANALYZE itr_assignments; ANALYZE punches; ANALYZE certificates;
SELECT (SELECT count(*) FROM systems WHERE project_id = p) AS systems, (SELECT count(*) FROM tags WHERE project_id = p) AS tags,
  (SELECT count(*) FROM itrs WHERE project_id = p) AS itrs, (SELECT count(*) FROM itrs WHERE project_id = p AND status = 'approved') AS approved,
  (SELECT count(*) FROM itr_responses r JOIN itrs i ON i.id = r.itr_id WHERE i.project_id = p) AS responses,
  (SELECT count(*) FROM punches WHERE project_id = p) AS punches, (SELECT count(*) FROM certificates WHERE project_id = p) AS certificates
FROM (SELECT '5e0f5000-0000-4000-8000-000000000002'::uuid AS p) x;
