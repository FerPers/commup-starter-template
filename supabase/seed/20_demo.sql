-- A50 (2026-10-24): demo LOCAL restablecible (`npm run demo:reset`), encima de 00_actors.sql y 10_e2e.sql en el mismo
-- proyecto del E2E. Une lo que antes era supabase/seed/review.sql (colas de «Mi trabajo» por rol) con los casos de
-- liberación y parte de scripts/demo-data/. Datos sintéticos; casos y resultado esperado en docs/DEMO-LOCAL.md.
-- Solo Supabase local: nunca contra prod.

-- ── Más tags ────────────────────────────────────────────────────────────────
INSERT INTO public.tags (id, subsystem_id, project_id, discipline_id, tag_number, description) VALUES
  ('e2e00000-0000-4000-8000-0000000000f2', 'e2e00000-0000-4000-8000-0000000000c3', 'e2e00000-0000-4000-8000-0000000000b1',
   'e2e00000-0000-4000-8000-0000000000d1', 'FT-E2E-002', 'Transmisor de flujo E2E'),
  ('e2e00000-0000-4000-8000-0000000000f3', 'e2e00000-0000-4000-8000-0000000000c3', 'e2e00000-0000-4000-8000-0000000000b1',
   'e2e00000-0000-4000-8000-0000000000d1', 'XV-E2E-003', 'Válvula de corte E2E');

-- ── ITR: uno más por ejecutar (inspector) y uno completado esperando la firma del cliente ───────────────────────
-- Las firmas requeridas del ITR salen de su plantilla: la del cliente es otra plantilla (ejecutor + cliente).
INSERT INTO public.itr_templates (id, org_id, discipline_id, phase_id, code, title, required_signatures) VALUES
  ('e2e00000-0000-4000-8000-000000000012', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000d1',
   'e2e00000-0000-4000-8000-0000000000d2', 'I05A', 'Prueba de carrera de válvula (E2E, testigo cliente)', ARRAY['executor', 'client']);
INSERT INTO public.itr_template_sections (id, template_id, title, order_index) VALUES
  ('e2e00000-0000-4000-8000-000000000013', 'e2e00000-0000-4000-8000-000000000012', 'Prueba', 1);
INSERT INTO public.itr_template_items (id, section_id, template_id, description, item_type, order_index, item_number) VALUES
  ('e2e00000-0000-4000-8000-000000000025', 'e2e00000-0000-4000-8000-000000000013', 'e2e00000-0000-4000-8000-000000000012',
   'Carrera completa abierta/cerrada sin trabas', 'checkbox', 1, '1.1');

INSERT INTO public.itrs (id, template_id, subsystem_id, project_id, phase_id, tag_id, itr_number, status,
                         completed_date, progress_pct, required_signatures) VALUES
  ('e2e00000-0000-4000-8000-000000000032', 'e2e00000-0000-4000-8000-000000000010', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000d2', 'e2e00000-0000-4000-8000-0000000000f2',
   'E2E-0002', 'not_started', NULL, 0, ARRAY['executor', 'supervisor']),
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-000000000012', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000d2', 'e2e00000-0000-4000-8000-0000000000f3',
   'E2E-0003', 'completed', current_date - 1, 100, ARRAY['executor', 'client']);
INSERT INTO public.itr_assignments (itr_id, user_id, role) VALUES
  ('e2e00000-0000-4000-8000-000000000032', 'e2e00000-0000-4000-8000-0000000000a1', 'executor'),
  ('e2e00000-0000-4000-8000-000000000032', 'e2e00000-0000-4000-8000-0000000000a2', 'supervisor'),
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-0000000000a1', 'executor'),
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-0000000000a3', 'client');
INSERT INTO public.itr_responses (itr_id, item_id, value_bool, is_passed, responded_by) VALUES
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-000000000025', true, true, 'e2e00000-0000-4000-8000-0000000000a1');
INSERT INTO public.itr_signatures (itr_id, user_id, role, signed_at) VALUES
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-0000000000a1', 'executor', now() - interval '1 day');

-- ── Punch ───────────────────────────────────────────────────────────────────
-- A abierto y B en curso asignados al inspector; C levantado por el cliente y resuelto por el inspector (el cliente
-- lo verifica); B levantado por el inspector y resuelto por el líder (el inspector lo verifica).
INSERT INTO public.punches (id, project_id, subsystem_id, tag_id, punch_number, category, description, discipline_id,
                            raised_by, assigned_to, status, priority, target_date, resolved_at, resolved_by) VALUES
  ('e2e00000-0000-4000-8000-000000000041', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f1', '', 'A', 'Falta el prensaestopas del cable de señal',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-0000000000a1',
   'open', 'critical', current_date + 2, NULL, NULL),
  ('e2e00000-0000-4000-8000-000000000042', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f2', '', 'B', 'Placa de identificación ilegible',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-0000000000a1',
   'in_progress', 'major', current_date - 3, NULL, NULL),
  ('e2e00000-0000-4000-8000-000000000043', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f3', '', 'C', 'Pintura dañada en el actuador',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a3', 'e2e00000-0000-4000-8000-0000000000a1',
   'in_progress', 'minor', current_date + 10, now() - interval '2 hours', 'e2e00000-0000-4000-8000-0000000000a1'),
  ('e2e00000-0000-4000-8000-000000000044', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f1', '', 'B', 'Soporte del transmisor flojo',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-0000000000a2',
   'in_progress', 'major', current_date + 5, now() - interval '1 hour', 'e2e00000-0000-4000-8000-0000000000a2');

-- ── Preservación vencida a cargo del inspector ──────────────────────────────
INSERT INTO public.preservation_procedures (id, org_id, code, title, frequency, interval_days, discipline_id) VALUES
  ('e2e00000-0000-4000-8000-000000000051', 'e2e00000-0000-4000-8000-000000000001', 'PR-I-01',
   'Inspección visual y desecante', 'weekly', 7, 'e2e00000-0000-4000-8000-0000000000d1');
INSERT INTO public.preservation_plans (id, tag_id, project_id, procedure_id, responsible_user_id, start_date, next_due_date, status) VALUES
  ('e2e00000-0000-4000-8000-000000000052', 'e2e00000-0000-4000-8000-0000000000f3', 'e2e00000-0000-4000-8000-0000000000b1',
   'e2e00000-0000-4000-8000-000000000051', 'e2e00000-0000-4000-8000-0000000000a1', current_date - 30, current_date - 4, 'active');

-- ── Gestión diaria: TQ al cliente (por responder), TQ del cliente (respondida) y acción del cliente ────────────────
INSERT INTO public.technical_queries (id, org_id, project_id, seq, number, subject, question, discipline_id, system_id,
                                      addressed_to, required_by, status, issued_by, issued_at, raised_by,
                                      response, responded_by, responded_by_name, responded_at) VALUES
  ('e2e00000-0000-4000-8000-000000000061', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   1, 'TQ-0001', 'Rango del transmisor PT-E2E-001', '¿Se calibra a 0–10 bar o a 0–16 bar como dice la hoja de datos rev. B?',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000c2', 'client', current_date + 3, 'issued',
   'e2e00000-0000-4000-8000-0000000000a2', now() - interval '1 day', 'e2e00000-0000-4000-8000-0000000000a2',
   NULL, NULL, NULL, NULL),
  ('e2e00000-0000-4000-8000-000000000062', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   2, 'TQ-0002', 'Color de la placa de válvulas', '¿Las placas de las válvulas de corte van en rojo o en amarillo?',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000c2', 'engineering', current_date + 7, 'answered',
   'e2e00000-0000-4000-8000-0000000000a3', now() - interval '3 days', 'e2e00000-0000-4000-8000-0000000000a3',
   'Amarillo, según la especificación de rotulado del proyecto.', 'e2e00000-0000-4000-8000-0000000000a2', 'Leo Líder',
   now() - interval '5 hours');

INSERT INTO public.actions (id, org_id, project_id, seq, number, title, description, source_kind, system_id, owner_id,
                            due_date, priority, verification_method, status, created_by) VALUES
  ('e2e00000-0000-4000-8000-000000000071', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   1, 'ACC-0001', 'Enviar la hoja de datos firmada del PT-E2E-001', 'La pide el TQ-0001 para cerrar el rango.',
   'manual', 'e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000a3',
   current_date + 4, 'high', 'document', 'open', 'e2e00000-0000-4000-8000-0000000000a2'),
  ('e2e00000-0000-4000-8000-000000000072', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   2, 'ACC-0002', 'Revisar el torque de las bridas del XV-E2E-003', NULL,
   'manual', 'e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000a1',
   current_date + 1, 'medium', 'field', 'open', 'e2e00000-0000-4000-8000-0000000000a2');

-- ── P&ID para el visor (red-line, pines, límites) ───────────────────────────
-- El PDF lo sube scripts/demo/pid.mjs (dentro de `npm run demo:reset`) a project-documents/<project>/<document>/rev-A.pdf.
INSERT INTO public.documents (id, org_id, project_id, number, title, doc_type) VALUES
  ('e2e00000-0000-4000-8000-0000000000e1', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   'PID-E2E-001', 'P&ID unidad E2E, hoja 1', 'pid');
INSERT INTO public.document_revisions (id, document_id, project_id, seq, rev, status, issued_on, file_path, file_name) VALUES
  ('e2e00000-0000-4000-8000-0000000000e2', 'e2e00000-0000-4000-8000-0000000000e1', 'e2e00000-0000-4000-8000-0000000000b1',
   1, 'A', 'ifc', current_date - 20,
   'e2e00000-0000-4000-8000-0000000000b1/e2e00000-0000-4000-8000-0000000000e1/rev-A.pdf', 'PID-E2E-001_A.pdf');
UPDATE public.documents SET current_revision_id = 'e2e00000-0000-4000-8000-0000000000e2' WHERE id = 'e2e00000-0000-4000-8000-0000000000e1';

-- ═══ A50: casos de liberación ═══════════════════════════════════════════════════════════════════════════════════
-- Área A200 «Servicios» con un sistema por estado de la liberación A (Completamiento mecánico). Todo pasa por las RPC
-- de la app con la identidad de cada actor (request.jwt.claims), así que respeta las mismas reglas que la pantalla:
-- dos firmas de ITR (inspector ejecuta, líder supervisa), aprobación de Comisionamiento (owner) y co-firmas de
-- Operaciones (admin) y HSE (arquitecta), cada una de una persona distinta.
--
--   A200-S01 Aire de instrumentos   sano: ITR aprobados, liberación A aprobada con todas las firmas
--   A200-S02 Agua de servicio       listo: ITR aprobados, falta aprobar (cola de quien aprueba)
--   A200-S03 Gas combustible        pendiente de firmas: aprobado por Comisionamiento, falta HSE
--   A200-S04 Nitrógeno              regresado: aprobado con todas las firmas y después se reabrió un ITR
--   A200-S05 Drenajes cerrados      sin información: sin tags ni ITR (alcance desconocido, no «0 pendientes»)
--   A100-S01 Sistema E2E (arriba)   bloqueado: ITR sin aprobar y un punch Cat A abierto
DO $demo$
DECLARE
  v_org   uuid := 'e2e00000-0000-4000-8000-000000000001';
  v_proj  uuid := 'e2e00000-0000-4000-8000-0000000000b1';
  v_phase uuid := 'e2e00000-0000-4000-8000-0000000000d2';
  v_disc  uuid := 'e2e00000-0000-4000-8000-0000000000d1';
  v_area  uuid := 'e2e00000-0000-4000-8000-000000000201';
  v_tpl   uuid := 'e2e00000-0000-4000-8000-000000000241';
  u_insp  uuid := 'e2e00000-0000-4000-8000-0000000000a1';
  u_lead  uuid := 'e2e00000-0000-4000-8000-0000000000a2';
  u_arch  uuid := 'e2e00000-0000-4000-8000-0000000000a4';
  u_own   uuid := 'e2e00000-0000-4000-8000-0000000000a5';
  u_adm   uuid := 'e2e00000-0000-4000-8000-0000000000a6';
  v_gate  uuid;
  v_sys   uuid;
  v_sub   uuid;
  v_tag   uuid;
  v_itr   uuid;
  v_appr  uuid;
  v_reopen uuid;
  r record;
  n int := 0;
BEGIN
  SELECT id INTO v_gate FROM readiness_gates WHERE org_id = v_org AND phase_id = v_phase;

  INSERT INTO areas (id, project_id, name, code) VALUES (v_area, v_proj, 'Servicios', 'A200');

  INSERT INTO itr_templates (id, org_id, discipline_id, phase_id, code, title) VALUES
    (v_tpl, v_org, v_disc, v_phase, 'I04A', 'Inspección visual de instrumento (demo)');
  INSERT INTO itr_template_sections (id, template_id, title, order_index) VALUES
    ('e2e00000-0000-4000-8000-000000000242', v_tpl, 'Inspección', 1);
  INSERT INTO itr_template_items (id, section_id, template_id, description, item_type, order_index, item_number) VALUES
    ('e2e00000-0000-4000-8000-000000000243', 'e2e00000-0000-4000-8000-000000000242', v_tpl, 'Montaje y soportes conformes', 'checkbox', 1, '1.1'),
    ('e2e00000-0000-4000-8000-000000000244', 'e2e00000-0000-4000-8000-000000000242', v_tpl, 'Placa de identificación legible', 'checkbox', 2, '1.2');

  FOR r IN SELECT * FROM (VALUES
    (1, 'A200-S01', 'Aire de instrumentos', 'healthy',  ARRAY['PT-2101', 'PDT-2102']),
    (2, 'A200-S02', 'Agua de servicio',     'ready',    ARRAY['FT-2201', 'LT-2202']),
    (3, 'A200-S03', 'Gas combustible',      'pending',  ARRAY['PT-2301', 'TT-2302']),
    (4, 'A200-S04', 'Nitrógeno',            'regressed',ARRAY['PT-2401', 'FT-2402']),
    (5, 'A200-S05', 'Drenajes cerrados',    'empty',    ARRAY[]::text[])
  ) AS v(i, code, name, kase, tags) LOOP
    v_sys := ('e2e00000-0000-4000-8000-00000000021' || r.i)::uuid;
    v_sub := ('e2e00000-0000-4000-8000-00000000022' || r.i)::uuid;
    INSERT INTO systems (id, area_id, project_id, name, code) VALUES (v_sys, v_area, v_proj, r.name, r.code);
    INSERT INTO subsystems (id, system_id, project_id, name, code) VALUES (v_sub, v_sys, v_proj, r.name, r.code || '-01');

    FOR k IN 1 .. coalesce(array_length(r.tags, 1), 0) LOOP
      n := n + 1;
      v_tag := ('e2e00000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid;
      v_itr := ('e2e00000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid;
      INSERT INTO tags (id, subsystem_id, project_id, discipline_id, tag_number, description)
      VALUES (v_tag, v_sub, v_proj, v_disc, r.tags[k], 'Instrumento de ' || lower(r.name));
      INSERT INTO itrs (id, template_id, subsystem_id, project_id, phase_id, tag_id, itr_number)
      VALUES (v_itr, v_tpl, v_sub, v_proj, v_phase, v_tag, 'DEMO-' || lpad(n::text, 4, '0'));
      INSERT INTO itr_assignments (itr_id, user_id, role) VALUES (v_itr, u_insp, 'executor'), (v_itr, u_lead, 'supervisor');
      INSERT INTO itr_responses (itr_id, item_id, value_bool, is_passed, responded_by) VALUES
        (v_itr, 'e2e00000-0000-4000-8000-000000000243', true, true, u_insp),
        (v_itr, 'e2e00000-0000-4000-8000-000000000244', true, true, u_insp);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', u_insp, 'role', 'authenticated')::text, true);
      PERFORM sign_itr_atomic(v_itr, 'executor');
      PERFORM set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
      PERFORM sign_itr_atomic(v_itr, 'supervisor');
      IF r.kase = 'regressed' AND v_reopen IS NULL THEN v_reopen := v_itr; END IF;
    END LOOP;

    IF r.kase IN ('healthy', 'pending', 'regressed') THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', u_own, 'role', 'authenticated')::text, true);
      v_appr := approve_system_gate(v_sys, v_gate, '[]'::jsonb, 'Liberación de la demo');
      PERFORM set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
      PERFORM sign_system_gate(v_appr, 'operations', 'Recibido por Operaciones');
      IF r.kase <> 'pending' THEN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', u_arch, 'role', 'authenticated')::text, true);
        PERFORM sign_system_gate(v_appr, 'hse', 'Sin observaciones de HSE');
      END IF;
    END IF;
  END LOOP;

  -- Regresión: después de liberar, la arquitecta reabre un ITR (p. ej. por una lectura mal transcrita).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_arch, 'role', 'authenticated')::text, true);
  PERFORM reopen_itr_atomic(v_reopen, 'Lectura mal transcrita: se repite la inspección');
  PERFORM set_config('request.jwt.claims', '', true);
END $demo$;

-- ── Planificación (de scripts/demo-data/seed_skyline_plans_demo.sql) ────────────────────────────────────────────
-- Fechas por sistema × liberación relativas al «hoy» del proyecto: vencidas, de esta semana y futuras; A200-S03 solo
-- con pronóstico y A200-S05 sin fecha (bandeja «Sin fecha» del skyline).
WITH plan(code, a_days, forecast_only) AS (VALUES
  ('A100-S01', -9, false), ('A200-S01', -14, false), ('A200-S02', 3, false), ('A200-S03', -2, true), ('A200-S04', -12, false)
),
gates(code, shift) AS (VALUES ('A', 0), ('B', 28), ('C', 56), ('D', 84)),
rows AS (
  SELECT s.id AS system_id, g.id AS gate_id, project_today(s.project_id) + p.a_days + gs.shift AS d, p.forecast_only,
         abs(hashtext(s.code)) % 7 AS slip  -- el pronóstico va 0–6 días detrás del compromiso (determinista)
  FROM plan p
  JOIN systems s ON s.project_id = 'e2e00000-0000-4000-8000-0000000000b1' AND s.code = p.code
  JOIN gates gs ON true
  JOIN readiness_gates g ON g.org_id = 'e2e00000-0000-4000-8000-000000000001' AND g.code = gs.code AND g.is_active
)
INSERT INTO system_gate_plans (system_id, gate_id, org_id, project_id, forecast_date, forecast_at, commitment_date, commitment_at)
SELECT system_id, gate_id, 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1', d + slip, now(),
       CASE WHEN forecast_only THEN NULL ELSE d END, CASE WHEN forecast_only THEN NULL ELSE now() END
FROM rows;

-- ── Equipos de prueba (de scripts/demo-data/seed_test_equipment_demo.sql) ───────────────────────────────────────
-- Uno vigente, uno por vencer (< 30 días) y uno vencido, siempre relativo a hoy.
INSERT INTO public.test_equipment (org_id, code, kind, make, model, serial_number, owner_company, certificate_number, calibrated_on, calibration_due)
VALUES
  ('e2e00000-0000-4000-8000-000000000001', 'CAL-01', 'loop_calibrator', 'Fluke', '754', '4417021', 'Instrumentos del Llano Ltda.', 'MET-2025-1187', current_date - 345, current_date + 20),
  ('e2e00000-0000-4000-8000-000000000001', 'PG-01', 'pressure_gauge', 'WIKA', 'CPG1500', 'WK-88231', 'Montajes Andinos S.A.S.', 'LAB-PR-2025-0093', current_date - 380, current_date - 15),
  ('e2e00000-0000-4000-8000-000000000001', 'MM-01', 'multimeter', 'Fluke', '87V', '99120345', 'Montajes Andinos S.A.S.', 'MET-2026-0221', current_date - 60, current_date + 305);
