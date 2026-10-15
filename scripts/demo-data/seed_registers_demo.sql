-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO «Refinería Los Andes» — registros controlados (fase 3, sesión 4 del plan readiness)
--
-- Historia de ~6 semanas: utilities adelantados (pruebas verificadas, ciegas retiradas,
-- generación energizada), proceso a mitad de camino (prueba con ciegas instaladas que
-- bloquean RFC, bypass activo que bloquea RFSU, un test pack rechazado y repetido) y
-- fraccionamiento/almacenamiento planificado.
--
-- Idempotente: crea las líneas que falten (tags), borra y recrea los registros marcados
-- data.demo_seed = true, y avanza TPK-0001/TPK-0002 (creados a mano). CIE-0001 NO se toca
-- (queda para la prueba de dos personas). Respeta las reglas de la RPC a mano: quien autoriza
-- ≠ quien propuso; quien verifica ≠ quien retiró. Ejecutar como service role (MCP / SQL editor).
--
-- Ojo: editar un registro sembrado desde la UI quita la marca demo_seed (cleanRegisterData);
-- en ese caso una nueva corrida lo dejaría y crearía otro con número nuevo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Contexto ───────────────────────────────────────────────────────────────
CREATE TEMP TABLE IF NOT EXISTS seed_ctx (k text PRIMARY KEY, v uuid);
TRUNCATE seed_ctx;
INSERT INTO seed_ctx VALUES
  ('org',     'e12c53b2-85fd-462f-86f3-bba318aa77ee'),
  ('project', 'abc47484-59d3-4f51-8966-7fb4f1174ba8'),
  -- Las tres personas de DEMO (rotan como proponente/autorizador/verificador).
  ('u0', 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366'),  -- owner (Outlook)
  ('u1', '2c520c87-f080-445f-bb40-155d6edca46c'),  -- admin (lf.perdomo+smtp)
  ('u2', '41d8f81c-28f9-458c-af3f-b754795b2c52');  -- owner (Demo GLP)

CREATE TEMP TABLE IF NOT EXISTS seed_ids (k text PRIMARY KEY, id uuid);
TRUNCATE seed_ids;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM seed_ctx WHERE k = p $$;

-- ── 1. Line list: ~40 líneas nuevas (mismo tipo/disciplina que PL-102) ──────────
INSERT INTO tags (subsystem_id, project_id, discipline_id, equipment_type_id, tag_number, description, fluid_type, pid_drawing)
SELECT ss.id, pg_temp.ctx('project'), ref.discipline_id, ref.equipment_type_id, l.tag, l.descr, l.fluid, l.pid
FROM (VALUES
  ('A100-S01', '6"-P-1101-A1A',   'Línea 6" crudo de pozos a recibo',              'Crudo', 'PID-A100-001'),
  ('A100-S01', '4"-P-1102-A1A',   'Línea 4" crudo a medición fiscal',              'Crudo', 'PID-A100-002'),
  ('A100-S01', '3"-P-1103-A1A',   'Línea 3" drenaje de recibo',                    'Crudo', 'PID-A100-002'),
  ('A100-S02', '8"-G-1201-B1A',   'Línea 8" gas de entrada a compresión',          'Gas',   'PID-A100-010'),
  ('A100-S02', '6"-G-1202-B1A',   'Línea 6" descarga compresor C-103',             'Gas',   'PID-A100-011'),
  ('A100-S02', '2"-G-1203-B1A',   'Línea 2" recirculación antisurge',              'Gas',   'PID-A100-011'),
  ('A200-S01', '6"-P-2101-A1A',   'Línea 6" entrada a separador trifásico',        'Crudo', 'PID-A200-001'),
  ('A200-S01', '4"-P-2102-A1A',   'Línea 4" salida de crudo del separador',        'Crudo', 'PID-A200-001'),
  ('A200-S01', '3"-W-2103-A1A',   'Línea 3" agua de producción',                   'Agua',  'PID-A200-002'),
  ('A200-S02', '4"-P-2201-A1A',   'Línea 4" crudo a deshidratador',                'Crudo', 'PID-A200-010'),
  ('A200-S02', '3"-P-2202-A1A',   'Línea 3" crudo deshidratado',                   'Crudo', 'PID-A200-010'),
  ('A200-S02', '2"-W-2203-A1A',   'Línea 2" agua separada del deshidratador',      'Agua',  'PID-A200-011'),
  ('A200-S03', '4"-P-2301-A1A',   'Línea 4" crudo a estabilizadora',               'Crudo', 'PID-A200-020'),
  ('A200-S03', '3"-G-2302-B1A',   'Línea 3" vapores de cabeza',                    'Gas',   'PID-A200-020'),
  ('A200-S03', '2"-P-2303-A1A',   'Línea 2" fondo de estabilizadora',              'Crudo', 'PID-A200-021'),
  ('A300-S01', '6"-G-3101-B2A',   'Línea 6" alimentación a deetanizadora',         'Gas',   'PID-A300-001'),
  ('A300-S01', '4"-LPG-3102-B2A', 'Línea 4" fondo de deetanizadora',               'GLP',   'PID-A300-001'),
  ('A300-S01', '3"-G-3103-B2A',   'Línea 3" gas de cabeza a combustible',          'Gas',   'PID-A300-002'),
  ('A300-S02', '4"-LPG-3201-B2A', 'Línea 4" alimentación a depropanizadora',       'GLP',   'PID-A300-010'),
  ('A300-S02', '3"-LPG-3202-B2A', 'Línea 3" propano de cabeza',                    'GLP',   'PID-A300-010'),
  ('A300-S02', '2"-LPG-3203-B2A', 'Línea 2" reflujo de depropanizadora',           'GLP',   'PID-A300-011'),
  ('A300-S03', '4"-LPG-3301-B2A', 'Línea 4" alimentación a debutanizadora',        'GLP',   'PID-A300-020'),
  ('A300-S03', '3"-P-3302-A1A',   'Línea 3" gasolina natural de fondo',            'Crudo', 'PID-A300-020'),
  ('A300-S03', '2"-LPG-3303-B2A', 'Línea 2" butano de cabeza',                     'GLP',   'PID-A300-021'),
  ('OS01-S01', '10"-P-4101-A1A',  'Línea 10" llenado de tanques de crudo',         'Crudo', 'PID-OS01-001'),
  ('OS01-S01', '8"-P-4102-A1A',   'Línea 8" succión de bombas de transferencia',   'Crudo', 'PID-OS01-001'),
  ('OS01-S01', '6"-P-4103-A1A',   'Línea 6" recirculación de tanques',             'Crudo', 'PID-OS01-002'),
  ('OS01-S02', '6"-LPG-4201-B2A', 'Línea 6" llenado de esferas de GLP',            'GLP',   'PID-OS01-010'),
  ('OS01-S02', '4"-LPG-4202-B2A', 'Línea 4" despacho a cargadero',                 'GLP',   'PID-OS01-011'),
  ('OS01-S02', '3"-LPG-4203-B2A', 'Línea 3" retorno de vapores de cargadero',      'GLP',   'PID-OS01-011'),
  ('U100-S01', '2"-IA-5101-C1A',  'Cabezal 2" de aire de instrumentos',            'Aire',  'PID-U100-001'),
  ('U100-S01', '1"-IA-5102-C1A',  'Ramal 1" aire de instrumentos a A100',          'Aire',  'PID-U100-001'),
  ('U100-S01', '1"-IA-5103-C1A',  'Ramal 1" aire de instrumentos a A200',          'Aire',  'PID-U100-002'),
  ('U100-S02', '2"-N-5201-C1A',   'Cabezal 2" de nitrógeno',                       'N2',    'PID-U100-010'),
  ('U100-S02', '3"-SW-5202-C1A',  'Cabezal 3" de agua de servicio',                'Agua',  'PID-U100-011'),
  ('U100-S02', '2"-N-5203-C1A',   'Ramal 2" nitrógeno de purga a compresión',      'N2',    'PID-U100-010'),
  ('U200-S01', '2"-FG-6101-B1A',  'Línea 2" gas combustible a generadores',        'Gas',   'PID-U200-001'),
  ('U200-S01', '1"-FG-6102-B1A',  'Línea 1" gas de arranque de generadores',       'Gas',   'PID-U200-001'),
  ('U200-S01', '2"-DO-6103-A1A',  'Línea 2" diésel de respaldo a generadores',     'Diésel','PID-U200-002')
) AS l(sys, tag, descr, fluid, pid)
JOIN systems sy ON sy.project_id = pg_temp.ctx('project') AND sy.code = l.sys
JOIN subsystems ss ON ss.system_id = sy.id AND ss.code = l.sys || '-SS01'
CROSS JOIN (SELECT discipline_id, equipment_type_id FROM tags WHERE project_id = pg_temp.ctx('project') AND tag_number = 'PL-102') ref
ON CONFLICT (project_id, tag_number) DO NOTHING;

-- ── 2. Limpieza de la corrida anterior ──────────────────────────────────────
DELETE FROM register_items WHERE project_id = pg_temp.ctx('project') AND data ->> 'demo_seed' = 'true';
DELETE FROM register_events WHERE item_id IN (SELECT id FROM register_items WHERE project_id = pg_temp.ctx('project') AND number IN ('TPK-0001', 'TPK-0002')) AND action = 'transition';

-- ── 3. Helper: un registro con su ciclo, personas, fechas, eventos y tags ─────────
-- p_status: estado final. Si es 'cancelled', p_reached = último estado alcanzado antes de cancelar.
-- p_i rota las personas: propone u[i], autoriza u[i+1], activa u[i], retira u[i+2], verifica u[i].
-- p_days: hace cuántos días se propuso; cada paso ocurre p_step días después del anterior.
CREATE OR REPLACE FUNCTION pg_temp.seed_reg(
  p_key text, p_kind text, p_sys text, p_title text, p_desc text, p_status text, p_data jsonb,
  p_days numeric, p_step numeric, p_i int, p_tags text[], p_role text DEFAULT 'subject',
  p_reached text DEFAULT NULL, p_cancel text DEFAULT NULL, p_comments jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_project uuid := pg_temp.ctx('project');
  v_org uuid := pg_temp.ctx('org');
  v_type register_types%ROWTYPE;
  v_sys uuid;
  v_seq int;
  v_id uuid;
  v_order text[] := ARRAY['proposed', 'authorized', 'active', 'removed', 'verified'];
  v_last text := CASE WHEN p_status = 'cancelled' THEN p_reached ELSE p_status END;
  v_n int := array_position(ARRAY['proposed', 'authorized', 'active', 'removed', 'verified'], CASE WHEN p_status = 'cancelled' THEN p_reached ELSE p_status END);
  v_who uuid[];
  v_at timestamptz[];
  v_t0 timestamptz := date_trunc('hour', now()) - (p_days || ' days')::interval + interval '8 hours';
  v_tag text;
  v_tag_id uuid;
  k int;
BEGIN
  IF v_n IS NULL THEN RAISE EXCEPTION 'Estado no válido para %: %', p_key, p_status; END IF;
  SELECT * INTO v_type FROM register_types WHERE org_id = v_org AND kind = p_kind;
  SELECT id INTO v_sys FROM systems WHERE project_id = v_project AND code = p_sys;
  IF v_sys IS NULL AND p_sys IS NOT NULL THEN RAISE EXCEPTION 'Sistema % no existe', p_sys; END IF;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM register_items WHERE project_id = v_project AND type_id = v_type.id;

  -- Personas y fechas por paso (índices 1..5 = proposed..verified; 6 = cancelación).
  v_who := ARRAY[
    pg_temp.ctx('u' || (p_i % 3)), pg_temp.ctx('u' || ((p_i + 1) % 3)), pg_temp.ctx('u' || (p_i % 3)),
    pg_temp.ctx('u' || ((p_i + 2) % 3)), pg_temp.ctx('u' || (p_i % 3)), pg_temp.ctx('u' || ((p_i + 1) % 3))];
  v_at := ARRAY[]::timestamptz[];
  FOR k IN 1..6 LOOP
    v_at := v_at || (v_t0 + ((k - 1) * p_step || ' days')::interval + ((k * 37) % 300 || ' minutes')::interval);
  END LOOP;

  INSERT INTO register_items (org_id, project_id, type_id, kind, seq, number, title, description, system_id, owner_id, status, data,
    proposed_by, proposed_at, authorized_by, authorized_at, activated_by, activated_at, removed_by, removed_at, verified_by, verified_at,
    cancelled_by, cancelled_at, cancel_reason, created_at, updated_at)
  VALUES (v_org, v_project, v_type.id, p_kind, v_seq, v_type.prefix || '-' || lpad(v_seq::text, 4, '0'), p_title, p_desc, v_sys, v_who[1],
    p_status, p_data || '{"demo_seed": true}'::jsonb,
    v_who[1], v_at[1],
    CASE WHEN v_n >= 2 THEN v_who[2] END, CASE WHEN v_n >= 2 THEN v_at[2] END,
    CASE WHEN v_n >= 3 THEN v_who[3] END, CASE WHEN v_n >= 3 THEN v_at[3] END,
    CASE WHEN v_n >= 4 THEN v_who[4] END, CASE WHEN v_n >= 4 THEN v_at[4] END,
    CASE WHEN v_n >= 5 THEN v_who[5] END, CASE WHEN v_n >= 5 THEN v_at[5] END,
    CASE WHEN p_status = 'cancelled' THEN v_who[6] END, CASE WHEN p_status = 'cancelled' THEN v_at[v_n + 1] END, p_cancel,
    v_at[1], CASE WHEN p_status = 'cancelled' THEN v_at[v_n + 1] ELSE v_at[v_n] END)
  RETURNING id INTO v_id;

  INSERT INTO register_events (item_id, org_id, project_id, action, to_status, user_id, created_at)
  VALUES (v_id, v_org, v_project, 'created', 'proposed', v_who[1], v_at[1]);
  FOR k IN 2..v_n LOOP
    INSERT INTO register_events (item_id, org_id, project_id, action, from_status, to_status, user_id, comment, created_at)
    VALUES (v_id, v_org, v_project, 'transition', v_order[k - 1], v_order[k], v_who[k], p_comments ->> v_order[k], v_at[k]);
  END LOOP;
  IF p_status = 'cancelled' THEN
    INSERT INTO register_events (item_id, org_id, project_id, action, from_status, to_status, user_id, comment, created_at)
    VALUES (v_id, v_org, v_project, 'transition', v_last, 'cancelled', v_who[6], p_cancel, v_at[v_n + 1]);
  END IF;

  FOREACH v_tag IN ARRAY COALESCE(p_tags, ARRAY[]::text[]) LOOP
    SELECT id INTO v_tag_id FROM tags WHERE project_id = v_project AND tag_number = v_tag;
    IF v_tag_id IS NULL THEN RAISE EXCEPTION 'Tag % no existe (registro %)', v_tag, p_key; END IF;
    INSERT INTO register_item_tags (item_id, tag_id, project_id, role) VALUES (v_id, v_tag_id, v_project, p_role) ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO seed_ids VALUES (p_key, v_id);
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.seed_link(p_pack text, p_other text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO register_item_links (item_id, linked_item_id, project_id)
  SELECT a.id, b.id, pg_temp.ctx('project') FROM seed_ids a, seed_ids b WHERE a.k = p_pack AND b.k = p_other
  ON CONFLICT DO NOTHING
$$;

-- ── 4. Test packs (TPK-0003…) ───────────────────────────────────────────────
SELECT pg_temp.seed_reg('tp_u100_01', 'test_pack', 'U100-S01', 'Aire de instrumentos — cabezal y ramales a A100/A200', NULL, 'verified',
  '{"pack_ref":"TP-U100-01","test_type":"pneumatic","medium":"air","design_pressure":10,"test_pressure":11,"hold_minutes":30,"boundary":"Desde descarga de secadores hasta válvulas de bloqueo de cada ramal","achieved_pressure":11.2,"result":"accepted","witness":"R. Mendoza (HSE cliente)"}',
  40, 3, 0, ARRAY['2"-IA-5101-C1A', '1"-IA-5102-C1A', '1"-IA-5103-C1A'], 'line',
  p_comments => '{"active":"Sin caída de presión en 30 min. Testigo del cliente firma el registro.","verified":"Ciegas retiradas y sistema restituido; ver CIE de la prueba."}');
SELECT pg_temp.seed_reg('tp_u100_02', 'test_pack', 'U100-S02', 'Nitrógeno y agua de servicio — cabezales', NULL, 'verified',
  '{"pack_ref":"TP-U100-02","test_type":"hydrostatic","medium":"water","design_pressure":12,"test_pressure":18,"hold_minutes":60,"boundary":"Cabezales de N2 y agua de servicio hasta primeras válvulas de usuario","achieved_pressure":18.1,"result":"accepted","witness":"R. Mendoza (HSE cliente)"}',
  38, 3, 1, ARRAY['2"-N-5201-C1A', '3"-SW-5202-C1A', '2"-N-5203-C1A', 'PL-106'], 'line');
SELECT pg_temp.seed_reg('tp_u200_01', 'test_pack', 'U200-S01', 'Gas combustible y diésel a generadores', NULL, 'verified',
  '{"pack_ref":"TP-U200-01","test_type":"hydrostatic","medium":"water","design_pressure":15,"test_pressure":22.5,"hold_minutes":60,"achieved_pressure":22.6,"result":"accepted","witness":"J. Rincón (inspector QA/QC)"}',
  36, 3, 2, ARRAY['2"-FG-6101-B1A', '1"-FG-6102-B1A', '2"-DO-6103-A1A', 'PL-107'], 'line');
SELECT pg_temp.seed_reg('tp_a100_02', 'test_pack', 'A100-S02', 'Gas de entrada y descarga del compresor C-103', NULL, 'active',
  '{"pack_ref":"TP-A100-02","test_type":"pneumatic","medium":"nitrogen","design_pressure":45,"test_pressure":49.5,"hold_minutes":30,"boundary":"Entre ESDV-7621003 y brida de succión de C-103; PSV-7621005 retirada y cegada","achieved_pressure":49.6,"result":"accepted","witness":"R. Mendoza (HSE cliente)"}',
  12, 2.5, 0, ARRAY['8"-G-1201-B1A', '6"-G-1202-B1A', '2"-G-1203-B1A'], 'line',
  p_comments => '{"active":"Prueba aceptada. Pendiente retirar ciegas y reinstalar PSV-7621005 antes de restituir."}');
SELECT pg_temp.seed_reg('tp_a200_01', 'test_pack', 'A200-S01', 'Entrada y salida de crudo del separador trifásico', NULL, 'cancelled',
  '{"pack_ref":"TP-A200-01","test_type":"hydrostatic","medium":"water","design_pressure":20,"test_pressure":30,"hold_minutes":60,"achieved_pressure":24.5,"result":"rejected","witness":"J. Rincón (inspector QA/QC)"}',
  24, 2, 1, ARRAY['6"-P-2101-A1A', '4"-P-2102-A1A'], 'line', p_reached => 'active',
  p_cancel => 'Prueba rechazada: fuga en junta de brida 4" aguas arriba de FV-107. Se cambia la junta y se repite como TP-A200-01R.');
SELECT pg_temp.seed_reg('tp_a200_01r', 'test_pack', 'A200-S01', 'Separador trifásico — repetición tras cambio de junta', 'Repetición de TP-A200-01 (rechazada por fuga en brida).', 'removed',
  '{"pack_ref":"TP-A200-01R","test_type":"hydrostatic","medium":"water","design_pressure":20,"test_pressure":30,"hold_minutes":60,"achieved_pressure":30.2,"result":"accepted","witness":"J. Rincón (inspector QA/QC)"}',
  14, 2.5, 2, ARRAY['6"-P-2101-A1A', '4"-P-2102-A1A', '3"-W-2103-A1A'], 'line',
  p_comments => '{"removed":"Sistema drenado y restituido. Falta verificación independiente."}');
SELECT pg_temp.seed_reg('tp_a200_02', 'test_pack', 'A200-S02', 'Deshidratación de crudo — entrada, salida y agua separada', NULL, 'authorized',
  '{"pack_ref":"TP-A200-02","test_type":"hydrostatic","medium":"water","design_pressure":18,"test_pressure":27,"hold_minutes":60}',
  6, 2, 0, ARRAY['4"-P-2201-A1A', '3"-P-2202-A1A', '2"-W-2203-A1A'], 'line');
SELECT pg_temp.seed_reg('tp_os02_01', 'test_pack', 'OS01-S02', 'Esferas de GLP — llenado y despacho', NULL, 'authorized',
  '{"pack_ref":"TP-OS02-01","test_type":"pneumatic","medium":"nitrogen","design_pressure":17,"test_pressure":18.7,"hold_minutes":30}',
  5, 2, 1, ARRAY['6"-LPG-4201-B2A', '4"-LPG-4202-B2A', '3"-LPG-4203-B2A'], 'line');
SELECT pg_temp.seed_reg('tp_a300_01', 'test_pack', 'A300-S01', 'Deetanizadora — alimentación, fondo y gas de cabeza', NULL, 'proposed',
  '{"pack_ref":"TP-A300-01","test_type":"hydrostatic","medium":"water","design_pressure":32}',
  3, 1, 2, ARRAY['6"-G-3101-B2A', '4"-LPG-3102-B2A', '3"-G-3103-B2A'], 'line');
SELECT pg_temp.seed_reg('tp_os01_02', 'test_pack', 'OS01-S01', 'Tanques de crudo — llenado, succión y recirculación', NULL, 'proposed',
  '{"pack_ref":"TP-OS01-02","test_type":"hydrostatic","medium":"water","design_pressure":10}',
  2, 1, 0, ARRAY['10"-P-4101-A1A', '8"-P-4102-A1A', '6"-P-4103-A1A'], 'line');

-- ── 5. Ciegas (CIE-0002…) ───────────────────────────────────────────────────
SELECT pg_temp.seed_reg('cie_u100_01', 'blind', 'U100-S01', 'Spade en descarga de secadores para TP-U100-01', NULL, 'verified',
  '{"blind_type":"spade","size":"2\" #300","rating":"ASME B16.48","location":"Brida de salida del secador, aguas arriba de PV-103","purpose":"pressure_test","label_number":"CG-0101"}',
  41, 3, 1, ARRAY['PV-103']);
SELECT pg_temp.seed_reg('cie_u100_02', 'blind', 'U100-S02', 'Ciega en ocho en cabezal de N2 para TP-U100-02', NULL, 'verified',
  '{"blind_type":"spectacle","size":"2\" #150","location":"Límite con paquete de generación de N2","purpose":"pressure_test","label_number":"CG-0102"}',
  39, 3, 2, ARRAY['PV-101']);
SELECT pg_temp.seed_reg('cie_a100_02a', 'blind', 'A100-S02', 'Spade aguas abajo de ESDV-7621003 para TP-A100-02', NULL, 'active',
  '{"blind_type":"spade","size":"8\" #600","rating":"ASME B16.48","location":"Brida aguas abajo de ESDV-7621003","purpose":"pressure_test","label_number":"CG-0412"}',
  13, 2.5, 2, ARRAY['ESDV-7621003']);
SELECT pg_temp.seed_reg('cie_a100_02b', 'blind', 'A100-S02', 'Brida ciega en entrada de PSV-7621005 (PSV retirada)', NULL, 'active',
  '{"blind_type":"blind_flange","size":"3\" #600","location":"Boquilla de entrada de PSV-7621005","purpose":"pressure_test","label_number":"CG-0413"}',
  13, 2.5, 0, ARRAY['PSV-7621005']);
SELECT pg_temp.seed_reg('cie_a200_01', 'blind', 'A200-S01', 'Spade en entrada del separador para TP-A200-01R', NULL, 'removed',
  '{"blind_type":"spade","size":"6\" #300","location":"Brida de entrada al separador, aguas arriba de XV-116","purpose":"pressure_test","label_number":"CG-0207"}',
  15, 2.5, 1, ARRAY['XV-116'],
  p_comments => '{"removed":"Retirada tras la prueba; junta nueva instalada. Falta verificación."}');

-- ── 6. Temporales (TMP-…) ───────────────────────────────────────────────────
SELECT pg_temp.seed_reg('tmp_1', 'temporary', 'A100-S02', 'Strainer temporal de arranque en succión de C-103', NULL, 'active',
  '{"category":"strainer","location":"Succión del compresor C-103 (STR-104)","purpose":"Retener residuos de construcción durante el arranque","planned_removal":"2026-11-15","risk":"ΔP alta: vigilar PDI de succión cada turno"}',
  10, 2, 1, ARRAY['STR-104']);
SELECT pg_temp.seed_reg('tmp_2', 'temporary', 'A300-S01', 'Strainer temporal en succión de bomba de fondo', NULL, 'authorized',
  '{"category":"strainer","location":"Succión de bomba de fondo de deetanizadora (STR-105)","purpose":"Protección de sellos durante el lavado","planned_removal":"2026-12-01"}',
  4, 2, 2, ARRAY['STR-105']);
SELECT pg_temp.seed_reg('tmp_3', 'temporary', 'U200-S02', 'Alimentación provisional de MCC-102 desde generador portátil', NULL, 'removed',
  '{"category":"temp_power","location":"Sala eléctrica principal, MCC-102","purpose":"Pruebas de motores antes de energizar desde SWG-104","risk":"Bloqueo y etiquetado en el interruptor principal; cable provisional señalizado"}',
  30, 4, 0, ARRAY['MCC-102'],
  p_comments => '{"removed":"Generador desconectado; MCC-102 ya alimentado desde SWG-104 (ver ENE)."}');
SELECT pg_temp.seed_reg('tmp_4', 'temporary', 'A200-S01', 'Manguera de flushing entre separador y drenaje cerrado', NULL, 'verified',
  '{"category":"hose","location":"Drenaje de V-104 a sistema cerrado","purpose":"Lavado de líneas previo a la prueba hidrostática","planned_removal":"2026-09-30"}',
  33, 3, 2, ARRAY['VL-104']);

-- ── 7. Reinstalaciones (REI-…) ──────────────────────────────────────────────
SELECT pg_temp.seed_reg('rei_1', 'reinstatement', 'A100-S02', 'Reinstalar PSV-7621005 tras TP-A100-02', NULL, 'active',
  '{"temporary_condition":"PSV retirada a taller para calibración; boquilla cegada (CIE de la prueba)","final_condition":"PSV calibrada a 45 barg, instalada con juntas nuevas y precinto","reference":"TP-A100-02 / certificado de calibración PSV-7621005"}',
  13, 2.5, 1, ARRAY['PSV-7621005']);
SELECT pg_temp.seed_reg('rei_2', 'reinstatement', 'U100-S01', 'Reinstalar PT-103 retirado para TP-U100-01', NULL, 'verified',
  '{"temporary_condition":"Transmisor retirado y toma con tapón durante la prueba","final_condition":"PT-103 instalado, manifold abierto, lazo verificado","reference":"TP-U100-01"}',
  40, 3, 2, ARRAY['PT-103']);
SELECT pg_temp.seed_reg('rei_3', 'reinstatement', 'A200-S01', 'Reinstalar FV-107 (spool de flushing instalado)', NULL, 'active',
  '{"temporary_condition":"Válvula de control retirada; spool temporal para lavado y prueba","final_condition":"FV-107 instalada y con carrera verificada","reference":"TP-A200-01R"}',
  16, 3, 0, ARRAY['FV-107']);

-- ── 8. Bypasses (BYP-…) ─────────────────────────────────────────────────────
SELECT pg_temp.seed_reg('byp_1', 'bypass', 'A100-S02', 'Forzado del cierre de ESDV-7621003 por PT-101 (PAHH)', NULL, 'active',
  '{"protection_function":"Cierre de ESDV-7621003 por alta-alta presión en PT-101","method":"logic_force","reason":"Arranque de C-103 en recirculación con lazo PT-101 en calibración","risk_mitigation":"Operador dedicado en campo con manómetro local; alarma PAH activa; permiso de trabajo PT-2231","max_duration_hours":12}',
  2, 0.5, 0, ARRAY['ESDV-7621003', 'PT-101'],
  p_comments => '{"active":"Forzado aplicado en el SIS por el ingeniero de control; queda en bitácora de sala."}');
SELECT pg_temp.seed_reg('byp_2', 'bypass', 'U100-S01', 'Inhibición del disparo por baja presión de aire (PT-103)', NULL, 'verified',
  '{"protection_function":"Disparo por baja-baja presión de aire de instrumentos","method":"inhibit","reason":"Llenado inicial del cabezal tras la prueba","risk_mitigation":"Sin usuarios conectados aguas abajo; vigilancia continua","max_duration_hours":4,"restoration_check":"Inhibición retirada; prueba funcional del disparo a 4,2 barg OK"}',
  20, 1, 1, ARRAY['PT-103']);
SELECT pg_temp.seed_reg('byp_3', 'bypass', 'A200-S01', 'Inhibición de LSHH del separador (LT-109) para llenado', NULL, 'authorized',
  '{"protection_function":"Cierre de entrada por muy alto nivel en separador (LT-109)","method":"inhibit","reason":"Llenado inicial y calibración en sitio de LT-109","risk_mitigation":"Llenado controlado a bajo caudal; visor de nivel vigilado","max_duration_hours":8}',
  3, 1, 2, ARRAY['LT-109']);

-- ── 9. Energizaciones (ENE-…) ───────────────────────────────────────────────
SELECT pg_temp.seed_reg('ene_1', 'energization', 'U200-S01', 'Energización de SWG-104 (tablero principal de generación)', NULL, 'active',
  '{"equipment":"SWG-104","boundary":"Barra principal de 13,8 kV y salidas a MCC-102/103","authority":"Jefe eléctrico de comisionamiento","certificate":"CE-U200-001","energized_on":"2026-09-22"}',
  25, 2, 1, ARRAY['SWG-104']);
SELECT pg_temp.seed_reg('ene_2', 'energization', 'U200-S02', 'Energización de MCC-102 (servicios de utilities)', NULL, 'active',
  '{"equipment":"MCC-102","boundary":"Barras de 480 V del MCC-102; salidas a motores de U100","authority":"Jefe eléctrico de comisionamiento","certificate":"CE-U200-004","energized_on":"2026-10-03"}',
  16, 2, 2, ARRAY['MCC-102']);
SELECT pg_temp.seed_reg('ene_3', 'energization', 'A100-S01', 'Energización de MCC-101 (recibo de crudo)', NULL, 'authorized',
  '{"equipment":"MCC-101","boundary":"Barras de 480 V del MCC-101","authority":"Jefe eléctrico de comisionamiento"}',
  4, 2, 0, ARRAY['MCC-101']);

-- ── 10. Vínculos pack ↔ ciegas ──────────────────────────────────────────────
SELECT pg_temp.seed_link('tp_u100_01', 'cie_u100_01');
SELECT pg_temp.seed_link('tp_u100_02', 'cie_u100_02');
SELECT pg_temp.seed_link('tp_a100_02', 'cie_a100_02a');
SELECT pg_temp.seed_link('tp_a100_02', 'cie_a100_02b');
SELECT pg_temp.seed_link('tp_a200_01r', 'cie_a200_01');

-- ── 11. TPK-0001 / TPK-0002 (creados a mano): se integran a la historia ──────────
-- Se proponen «hace 4–5 días» para que el ciclo quede en orden cronológico.
UPDATE register_items SET proposed_at = now() - interval '5 days', created_at = now() - interval '5 days'
WHERE project_id = pg_temp.ctx('project') AND number IN ('TPK-0001', 'TPK-0002');
UPDATE register_events e SET created_at = now() - interval '5 days'
FROM register_items r WHERE e.item_id = r.id AND e.action = 'created' AND r.project_id = pg_temp.ctx('project') AND r.number IN ('TPK-0001', 'TPK-0002');
-- TPK-0001 queda «Aprobado para prueba» esperando su ciega CIE-0001 (que no se toca).
UPDATE register_items SET
  status = 'authorized', title = 'Recibo de crudo — descarga a medición',
  data = data || '{"design_pressure":10,"boundary":"Desde válvulas de pozo hasta XV-108; ciega CIE-0001 aguas abajo de XV-108"}'::jsonb,
  authorized_by = pg_temp.ctx('u1'), authorized_at = now() - interval '1 day', updated_at = now() - interval '1 day'
WHERE project_id = pg_temp.ctx('project') AND number = 'TPK-0001';
INSERT INTO register_item_tags (item_id, tag_id, project_id, role)
SELECT r.id, t.id, r.project_id, 'line' FROM register_items r JOIN tags t ON t.project_id = r.project_id
WHERE r.project_id = pg_temp.ctx('project') AND r.number = 'TPK-0001' AND t.tag_number IN ('6"-P-1101-A1A', '4"-P-1102-A1A', '3"-P-1103-A1A')
ON CONFLICT DO NOTHING;
INSERT INTO register_events (item_id, org_id, project_id, action, from_status, to_status, user_id, comment, created_at)
SELECT id, org_id, project_id, 'transition', 'proposed', 'authorized', pg_temp.ctx('u1'), 'Aprobado; instalar CIE-0001 antes de presurizar.', now() - interval '1 day'
FROM register_items WHERE project_id = pg_temp.ctx('project') AND number = 'TPK-0001';

-- TPK-0002: prueba neumática hecha y aceptada; las líneas quedan «en prueba».
UPDATE register_items SET
  status = 'active', title = 'Tanques de crudo — líneas de llenado (PL-101/103)',
  data = data || '{"achieved_pressure":8.1,"result":"accepted","witness":"J. Rincón (inspector QA/QC)"}'::jsonb,
  authorized_by = pg_temp.ctx('u2'), authorized_at = now() - interval '3 days',
  activated_by = pg_temp.ctx('u0'), activated_at = now() - interval '20 hours', updated_at = now() - interval '20 hours'
WHERE project_id = pg_temp.ctx('project') AND number = 'TPK-0002';
INSERT INTO register_events (item_id, org_id, project_id, action, from_status, to_status, user_id, comment, created_at)
SELECT id, org_id, project_id, 'transition', s.f, s.t, s.u, s.c, s.at
FROM register_items r,
  (VALUES ('proposed', 'authorized', pg_temp.ctx('u2'), NULL::text, now() - interval '3 days'),
          ('authorized', 'active', pg_temp.ctx('u0'), 'Sin caída de presión en 30 min.', now() - interval '20 hours')) AS s(f, t, u, c, at)
WHERE r.project_id = pg_temp.ctx('project') AND r.number = 'TPK-0002';

-- Resumen
SELECT kind, status, count(*) FROM register_items WHERE project_id = pg_temp.ctx('project') GROUP BY 1, 2 ORDER BY 1, 2;
