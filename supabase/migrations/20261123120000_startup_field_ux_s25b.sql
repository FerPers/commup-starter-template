-- S25b: correcciones de F6–F7 — UX de campo.
--   E-21  Line-up: posición encontrada (as_found_position) separada de la que se deja (found_position, la que se
--         verifica); n.º de candado / sello (obligatorio uno de los dos si queda LO/LC); observaciones desde la UI.
--         El hash de la hoja suma encontrada/candado/sello solo si existen.
--   E-23  Pasos con rango esperado (expected_min / expected_max / expected_unit). Un valor numérico fuera de rango
--         queda marcado (procedure_run_steps.out_of_range) y exige comentario; la UI propone detener con el criterio.
--         El hash de la revisión suma el rango solo si existe; nuevas revisiones y copias lo heredan.
--   E-29  equipment_types.lineup_candidate / critical_valve (configurables en /admin/config) reemplazan el filtro
--         por nombre de categoría y la lista fija de códigos al generar un line-up; orden de recorrido por P&ID.
--   generate_handover_package: rango, valor fuera de rango y encontrada/candado/sello.

ALTER TABLE public.lineup_items
  ADD COLUMN IF NOT EXISTS as_found_position text,
  ADD COLUMN IF NOT EXISTS lock_number       text,
  ADD COLUMN IF NOT EXISTS seal_number       text;
ALTER TABLE public.lineup_items DROP CONSTRAINT IF EXISTS lineup_items_as_found_check;
ALTER TABLE public.lineup_items ADD CONSTRAINT lineup_items_as_found_check
  CHECK (as_found_position IS NULL OR as_found_position IN ('open', 'closed', 'locked_open', 'locked_closed', 'auto', 'manual', 'throttled', 'other'));

ALTER TABLE public.procedure_steps
  ADD COLUMN IF NOT EXISTS expected_min  numeric,
  ADD COLUMN IF NOT EXISTS expected_max  numeric,
  ADD COLUMN IF NOT EXISTS expected_unit text;
ALTER TABLE public.procedure_steps DROP CONSTRAINT IF EXISTS procedure_steps_range_check;
ALTER TABLE public.procedure_steps ADD CONSTRAINT procedure_steps_range_check
  CHECK (expected_min IS NULL OR expected_max IS NULL OR expected_min <= expected_max);
ALTER TABLE public.procedure_run_steps ADD COLUMN IF NOT EXISTS out_of_range boolean NOT NULL DEFAULT false;

ALTER TABLE public.equipment_types
  ADD COLUMN IF NOT EXISTS lineup_candidate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS critical_valve   boolean NOT NULL DEFAULT false;
-- Backfill con la regla anterior (categoría «Válvulas» y códigos de válvulas de seguridad / corte).
UPDATE public.equipment_types SET
  lineup_candidate = lower(COALESCE(category, '')) LIKE 'v_lvula%' OR lower(COALESCE(category, '')) LIKE 'valve%'
                     OR code IN ('ESDV', 'XV', 'SDV', 'BDV', 'PSV', 'HV-ESD'),
  critical_valve   = code IN ('ESDV', 'XV', 'SDV', 'BDV', 'PSV', 'HV-ESD');

DROP FUNCTION IF EXISTS public.set_lineup_item(uuid, text, text, timestamptz, boolean, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.set_lineup_item(p_item_id uuid, p_found text, p_remarks text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_check_expected boolean DEFAULT false, p_expected_set_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_verified_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_as_found text DEFAULT NULL::text, p_lock_number text DEFAULT NULL::text, p_seal_number text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
        v_lock text := public.mgmt_text(p_lock_number, 60); v_seal text := public.mgmt_text(p_seal_number, 60);
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id FOR UPDATE;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  -- S25 (E-21): p_found = posición en que se DEJA la válvula (la que se verifica); p_as_found = como se encontró.
  IF p_found IS NULL THEN RAISE EXCEPTION 'Indica la posición en que queda' USING ERRCODE = '22023'; END IF;
  IF p_as_found IS NOT NULL AND p_as_found NOT IN ('open', 'closed', 'locked_open', 'locked_closed', 'auto', 'manual', 'throttled', 'other') THEN
    RAISE EXCEPTION 'Posición encontrada no válida' USING ERRCODE = '22023';
  END IF;
  IF p_found IN ('locked_open', 'locked_closed') AND v_lock IS NULL AND v_seal IS NULL THEN
    RAISE EXCEPTION 'Una válvula bloqueada (LO/LC) necesita el n.º de candado o de sello' USING ERRCODE = '22023';
  END IF;
  IF p_check_expected AND (it.set_at IS DISTINCT FROM p_expected_set_at OR it.verified_at IS DISTINCT FROM p_expected_verified_at) THEN
    IF it.found_position IS NOT DISTINCT FROM p_found THEN RETURN 'redundant'; END IF;
    RAISE EXCEPTION 'La fila cambió en el servidor después de tu captura' USING ERRCODE = 'CU409';
  END IF;
  UPDATE lineup_items SET found_position = p_found, remarks = public.mgmt_text(p_remarks, 1000), set_by = auth.uid(),
         as_found_position = p_as_found, lock_number = v_lock, seal_number = v_seal,
         set_at = public.startup_field_time(p_captured_at, s.issued_at),
         synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END,
         verified_by = NULL, verified_at = NULL WHERE id = it.id;
  UPDATE lineup_sheets SET status = 'in_progress', updated_at = now() WHERE id = s.id AND status = 'issued';
  RETURN 'applied';
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_lineup_sheet(p_sheet_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s lineup_sheets%ROWTYPE; v_role text; v_bad integer; v_hash text;
BEGIN
  SELECT * INTO s FROM lineup_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hoja no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'in_progress' THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  SELECT COUNT(*) INTO v_bad FROM lineup_items WHERE sheet_id = s.id
     AND (found_position IS DISTINCT FROM required_position OR (is_critical AND verified_at IS NULL));
  IF v_bad > 0 THEN RAISE EXCEPTION '% fila(s) sin alinear o críticas sin verificar', v_bad USING ERRCODE = 'P0001'; END IF;
  UPDATE lineup_sheets SET status = 'superseded', superseded_at = now(), updated_at = now()
   WHERE system_id = s.system_id AND purpose = s.purpose AND status = 'verified' AND id <> s.id;
  v_hash := encode(sha256(convert_to(jsonb_build_object('number', s.number, 'system', s.system_id, 'items',
              (SELECT jsonb_agg(jsonb_build_object('ord', ord, 'tag', tag_id, 'label', label, 'req', required_position, 'found', found_position,
                 'critical', is_critical, 'set_by', set_by, 'set_at', set_at, 'verified_by', verified_by, 'verified_at', verified_at)
                 -- S25 (E-21): encontrada, candado y sello solo si se cargaron (las hojas anteriores conservan su hash).
                 || jsonb_strip_nulls(jsonb_build_object('as_found', as_found_position, 'lock', lock_number, 'seal', seal_number)) ORDER BY ord)
               FROM lineup_items WHERE sheet_id = s.id))::text, 'UTF8')), 'hex');
  UPDATE lineup_sheets SET status = 'verified', verified_by = auth.uid(), verified_at = now(), content_hash = v_hash, updated_at = now() WHERE id = s.id;
  RETURN v_hash;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_lineup_sheet(p_project_id uuid, p_system_id uuid, p_title text, p_purpose text DEFAULT 'startup'::text, p_procedure_id uuid DEFAULT NULL::uuid, p_generate boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL THEN RAISE EXCEPTION 'El line-up necesita un sistema' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF p_procedure_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedures WHERE id = p_procedure_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El procedimiento no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  v_seq := public.mgmt_next_seq('lineup_sheets', p_project_id);
  INSERT INTO lineup_sheets (org_id, project_id, seq, number, system_id, title, purpose, procedure_id, created_by)
  VALUES (v_org, p_project_id, v_seq, 'LU-' || lpad(v_seq::text, 4, '0'), p_system_id, public.mgmt_text(p_title, 200), COALESCE(p_purpose, 'startup'), p_procedure_id, auth.uid())
  RETURNING id INTO v_id;
  IF COALESCE(p_generate, true) THEN
    INSERT INTO lineup_items (sheet_id, project_id, ord, tag_id, is_critical)
    -- S25 (E-29): candidatas y críticas por los flags del tipo de equipo (no por el nombre de la categoría); orden
    -- de recorrido por P&ID y luego tag.
    SELECT v_id, p_project_id, row_number() OVER (ORDER BY t.pid_drawing NULLS LAST, t.tag_number), t.id, et.critical_valve
    FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
    JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE ss.system_id = p_system_id AND t.project_id = p_project_id AND et.lineup_candidate;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.procedure_write_content(r public.procedure_revisions, p_sections jsonb, p_steps jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE e jsonb; i integer := 0; v_clean jsonb := '{}'::jsonb; k text; v_min numeric; v_max numeric;
BEGIN
  IF p_sections IS NOT NULL THEN
    IF jsonb_typeof(p_sections) <> 'object' THEN RAISE EXCEPTION 'Secciones no válidas' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_sections) LOOP
      IF NOT (k = ANY (public.procedure_section_keys())) THEN RAISE EXCEPTION 'Sección desconocida: %', k USING ERRCODE = '22023'; END IF;
      IF public.mgmt_text(p_sections ->> k, 20000) IS NOT NULL THEN v_clean := v_clean || jsonb_build_object(k, public.mgmt_text(p_sections ->> k, 20000)); END IF;
    END LOOP;
    UPDATE procedure_revisions SET sections = v_clean, updated_at = now() WHERE id = r.id;
  END IF;
  IF p_steps IS NOT NULL THEN
    IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) > 500 THEN RAISE EXCEPTION 'Pasos no válidos' USING ERRCODE = '22023'; END IF;
    DELETE FROM procedure_steps WHERE revision_id = r.id;
    FOR e IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
      i := i + 1;
      IF NULLIF(e ->> 'tag_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tags WHERE id = (e ->> 'tag_id')::uuid AND project_id = r.project_id) THEN
        RAISE EXCEPTION 'El tag del paso % no pertenece al proyecto', i USING ERRCODE = '22023';
      END IF;
      IF public.mgmt_text(e ->> 'action', 4000) IS NULL THEN RAISE EXCEPTION 'El paso % no tiene acción', i USING ERRCODE = '22023'; END IF;
      -- S25 (E-23): rango esperado opcional (mín/máx/unidad) para avisar un valor fuera de rango en campo.
      v_min := CASE WHEN btrim(COALESCE(e ->> 'expected_min', '')) ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(btrim(e ->> 'expected_min'), ',', '.')::numeric END;
      v_max := CASE WHEN btrim(COALESCE(e ->> 'expected_max', '')) ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(btrim(e ->> 'expected_max'), ',', '.')::numeric END;
      IF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min > v_max THEN
        RAISE EXCEPTION 'Paso %: el mínimo es mayor que el máximo', i USING ERRCODE = '22023';
      END IF;
      INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria,
                                   expected_min, expected_max, expected_unit)
      VALUES (r.id, r.project_id, i, public.mgmt_text(e ->> 'action', 4000), public.mgmt_text(e ->> 'responsible', 200),
              public.mgmt_text(e ->> 'expected_value', 500), NULLIF(e ->> 'tag_id', '')::uuid, COALESCE((e ->> 'is_hold_point')::boolean, false),
              CASE WHEN COALESCE((e ->> 'is_hold_point')::boolean, false) THEN COALESCE(NULLIF(e ->> 'hold_capacity', ''), 'commissioning') END,
              public.mgmt_text(e ->> 'stop_criteria', 2000), v_min, v_max, public.mgmt_text(e ->> 'expected_unit', 30));
    END LOOP;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.procedure_revision_hash(p_revision_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'procedure', p.number, 'title', p.title, 'rev', r.rev, 'sections', r.sections,
    'steps', COALESCE((SELECT jsonb_agg(jsonb_build_object('ord', s.ord, 'action', s.action, 'responsible', s.responsible,
                'expected', s.expected_value, 'tag', s.tag_id, 'hold', s.is_hold_point, 'capacity', s.hold_capacity,
                'stop', s.stop_criteria)
                -- S25 (E-23): el rango solo entra si existe (las revisiones anteriores conservan su hash).
                || jsonb_strip_nulls(jsonb_build_object('min', s.expected_min, 'max', s.expected_max, 'unit', s.expected_unit)) ORDER BY s.ord)
              FROM procedure_steps s WHERE s.revision_id = r.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
  FROM procedure_revisions r JOIN procedures p ON p.id = r.procedure_id WHERE r.id = p_revision_id;
$function$;

CREATE OR REPLACE FUNCTION public.new_procedure_revision(p_procedure_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE p procedures%ROWTYPE; v_role text; v_cur procedure_revisions%ROWTYPE; v_id uuid; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_revisions WHERE procedure_id = p.id AND status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'Ya hay una revisión abierta de %', p.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_cur FROM procedure_revisions WHERE id = p.current_revision_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'El procedimiento aún no tiene revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la nueva revisión' USING ERRCODE = '22023'; END IF;
  INSERT INTO procedure_revisions (procedure_id, org_id, project_id, rev, sections, change_reason, created_by)
  VALUES (p.id, p.org_id, p.project_id, (SELECT MAX(rev) + 1 FROM procedure_revisions WHERE procedure_id = p.id), v_cur.sections, v_reason, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria,
                               expected_min, expected_max, expected_unit)
  SELECT v_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria,
         expected_min, expected_max, expected_unit
  FROM procedure_steps WHERE revision_id = v_cur.id;
  -- S13 (F-12): la nueva revisión hereda las referencias a documentos, llevadas a la revisión vigente de cada uno
  -- (si cambió, el panel lo muestra como actualizado y el envío/aprobación lo valida igual).
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, procedure_revision_id, created_by)
  SELECT dr.project_id, dr.document_id, COALESCE(d.current_revision_id, dr.revision_id), 'procedure_revision', v_id, auth.uid()
  FROM document_references dr JOIN documents d ON d.id = dr.document_id
  WHERE dr.procedure_revision_id = v_cur.id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.copy_procedure(p_source_procedure_id uuid, p_target_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s procedures%ROWTYPE; v_src procedure_revisions%ROWTYPE; v_role text; v_new uuid; v_rev uuid;
BEGIN
  SELECT * INTO s FROM procedures WHERE id = p_source_procedure_id;
  IF NOT FOUND OR NOT public.is_project_member(s.project_id) THEN RAISE EXCEPTION 'Procedimiento de origen no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p_target_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_target_project_id AND org_id = s.org_id) THEN RAISE EXCEPTION 'El proyecto destino es de otra organización' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_src FROM procedure_revisions WHERE id = COALESCE(s.current_revision_id,
    (SELECT id FROM procedure_revisions WHERE procedure_id = s.id ORDER BY rev DESC LIMIT 1));
  v_new := public.create_procedure(p_target_project_id, s.title, s.kind, NULL);
  SELECT id INTO v_rev FROM procedure_revisions WHERE procedure_id = v_new AND rev = 0;
  UPDATE procedure_revisions SET sections = v_src.sections, change_reason = 'Copiado de ' || s.number WHERE id = v_rev;
  INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria,
                               expected_min, expected_max, expected_unit)
  SELECT v_rev, p_target_project_id, st.ord, st.action, st.responsible, st.expected_value,
         (SELECT t2.id FROM tags t1 JOIN tags t2 ON t2.tag_number = t1.tag_number AND t2.project_id = p_target_project_id WHERE t1.id = st.tag_id LIMIT 1),
         st.is_hold_point, st.hold_capacity, st.stop_criteria, st.expected_min, st.expected_max, st.expected_unit
  FROM procedure_steps st WHERE st.revision_id = v_src.id;
  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_run_step(p_run_id uuid, p_step_id uuid, p_actual text DEFAULT NULL::text, p_comment text DEFAULT NULL::text, p_na boolean DEFAULT false, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text; v_to text;
        v_comment text := public.mgmt_text(p_comment, 2000); v_floor timestamptz; v_at timestamptz; v_num numeric; v_oor boolean := false;
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status = 'at_hold' THEN RAISE EXCEPTION 'La ejecución está detenida en un hold point: debe liberarse antes de seguir' USING ERRCODE = 'P0001'; END IF;
  IF r.status <> 'in_progress' THEN RAISE EXCEPTION 'La ejecución no está en curso (%)', r.status USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF rs.status <> 'pending' THEN RAISE EXCEPTION 'El paso % ya fue registrado', rs.ord USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = p_run_id AND ord < rs.ord AND status NOT IN ('done', 'released', 'na')) THEN
    RAISE EXCEPTION 'Completa los pasos anteriores antes del paso %', rs.ord USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  IF p_na THEN
    IF st.is_hold_point THEN RAISE EXCEPTION 'Un hold point no puede marcarse N/A' USING ERRCODE = 'P0001'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué el paso no aplica' USING ERRCODE = '22023'; END IF;
    v_to := 'na';
  ELSE
    -- S25 (E-23): con rango esperado, un valor numérico fuera de rango exige explicarlo (y queda marcado).
    IF (st.expected_min IS NOT NULL OR st.expected_max IS NOT NULL) AND btrim(COALESCE(p_actual, '')) ~ '^-?[0-9]+([.,][0-9]+)?$' THEN
      v_num := replace(btrim(p_actual), ',', '.')::numeric;
      v_oor := (st.expected_min IS NOT NULL AND v_num < st.expected_min) OR (st.expected_max IS NOT NULL AND v_num > st.expected_max);
      IF v_oor AND (v_comment IS NULL OR length(v_comment) < 3) THEN
        RAISE EXCEPTION 'El valor % está fuera del rango esperado: explica por qué se continúa (o detén la ejecución)', btrim(p_actual) USING ERRCODE = '22023';
      END IF;
    END IF;
    v_to := CASE WHEN st.is_hold_point THEN 'at_hold' ELSE 'done' END;
  END IF;
  SELECT GREATEST(r.started_at, MAX(GREATEST(done_at, COALESCE(released_at, done_at)))) INTO v_floor
    FROM procedure_run_steps WHERE run_id = p_run_id AND ord < rs.ord;
  v_at := public.startup_field_time(p_captured_at, COALESCE(v_floor, r.started_at));
  UPDATE procedure_run_steps SET status = v_to, actual_value = public.mgmt_text(p_actual, 500), comment = v_comment, done_by = auth.uid(), done_at = v_at,
         out_of_range = v_oor,
         synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END
   WHERE run_id = p_run_id AND step_id = p_step_id;
  UPDATE procedure_runs SET status = CASE WHEN v_to = 'at_hold' THEN 'at_hold' ELSE status END, updated_at = now() WHERE id = p_run_id;
  RETURN v_to;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_handover_package(p_project_id uuid, p_system_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- S24 (D17, E-05/F-22): paquete de handover v3 — todo F1–F8 por sistema, con firmas (nombre + empresa congelada) y hashes.
-- S25: comentario de liberación de holds, línea de tiempo de la ejecución, competencias sin anuladas y reconocimientos del traspaso.
DECLARE
  v_org_id  uuid;
  v_scope   uuid[];
  v_project jsonb;
  v_systems jsonb;
  v_punches jsonb;
  v_certs   jsonb;
BEGIN
  SELECT p.org_id INTO v_org_id FROM projects p WHERE p.id = p_project_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(s.id), '{}') INTO v_scope FROM systems s
  WHERE s.project_id = p_project_id
    AND (p_system_ids IS NULL OR cardinality(p_system_ids) = 0 OR s.id = ANY (p_system_ids));

  SELECT jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'client', p.client, 'location', p.location,
           'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date, 'timezone', p.timezone,
           'org_name', o.name)
  INTO v_project FROM projects p JOIN organizations o ON o.id = p.org_id WHERE p.id = p_project_id;

  WITH gates AS (
    -- Estado de gates del motor (refresca los sucios); service role no pasa por la verificación de pertenencia.
    SELECT g.system_id, g.gates FROM public.compute_project_gates(p_project_id) g WHERE g.system_id = ANY (v_scope)
  ),
  sys_sub AS (
    SELECT sub.system_id, sub.id AS subsystem_id FROM subsystems sub WHERE sub.system_id = ANY (v_scope)
  ),
  sys_tags AS (
    SELECT ss.system_id, t.* FROM sys_sub ss JOIN tags t ON t.subsystem_id = ss.subsystem_id
  ),
  sys_itrs AS (
    -- Con tag, cuenta el subsistema del tag; sin tag, el del ITR (igual que v2).
    SELECT ss.system_id, i.*, t.tag_number
    FROM itrs i LEFT JOIN tags t ON t.id = i.tag_id
    JOIN sys_sub ss ON ss.subsystem_id = COALESCE(t.subsystem_id, i.subsystem_id)
    WHERE i.project_id = p_project_id
  ),
  sys_punches AS (
    SELECT ss.system_id, pu.* FROM sys_sub ss JOIN punches pu ON pu.subsystem_id = ss.subsystem_id AND pu.project_id = p_project_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'system_id',   s.id,
      'code',        s.code,
      'name',        s.name,
      'description', s.description,
      'tag_count',    (SELECT count(*) FROM sys_tags st WHERE st.system_id = s.id),
      'itr_count',    (SELECT count(*) FROM sys_itrs si WHERE si.system_id = s.id),
      'itr_approved', (SELECT count(*) FROM sys_itrs si WHERE si.system_id = s.id AND si.status = 'approved'),
      'punch_summary', jsonb_build_object(
        'cat_a_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'A' AND sp.status IN ('open', 'in_progress')),
        'cat_b_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'B' AND sp.status IN ('open', 'in_progress')),
        'cat_c_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'C' AND sp.status IN ('open', 'in_progress')),
        'total_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.status IN ('open', 'in_progress'))),
      'itrs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'itr_id', si.id, 'itr_number', si.itr_number, 'status', si.status, 'progress_pct', si.progress_pct,
          'scheduled_date', si.scheduled_date, 'completed_date', si.completed_date, 'tag_number', si.tag_number,
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('role', sig.role, 'user_id', sig.user_id, 'name', public.profile_full_name(sig.user_id),
                     'company', sig.signer_company, 'signed_at', sig.signed_at, 'signature_url', sig.signature_url) ORDER BY sig.signed_at)
            FROM itr_signatures sig WHERE sig.itr_id = si.id), '[]'::jsonb)
        ) ORDER BY si.itr_number)
        FROM sys_itrs si WHERE si.system_id = s.id), '[]'::jsonb),
      'tags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'tag_id', st.id, 'tag_number', st.tag_number, 'description', st.description, 'manufacturer', st.manufacturer,
          'model', st.model, 'serial_number', st.serial_number, 'status', st.status, 'criticality', st.criticality
        ) ORDER BY st.tag_number)
        FROM sys_tags st WHERE st.system_id = s.id), '[]'::jsonb),

      -- Etapa de propiedad vigente (F6).
      'ownership', (SELECT jsonb_build_object('stage', so.stage, 'since', so.since) FROM system_ownership so WHERE so.system_id = s.id),

      -- Gates: estado calculado + aprobación vigente con multifirma + declaraciones manuales vigentes.
      'gates', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'gate_id', ge ->> 'gate_id', 'code', ge ->> 'code', 'name', ge ->> 'name', 'order', (ge ->> 'order')::int,
          'status', ge ->> 'status',
          'approval', (
            SELECT jsonb_build_object(
              'status', a.status, 'approved_by', public.profile_full_name(a.approved_by), 'approved_role', a.approved_role,
              'company', a.approved_company, 'approved_at', a.approved_at, 'completed_at', a.completed_at,
              'conditions', a.conditions, 'notes', a.notes,
              'signatures', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('capacity', sg.capacity, 'name', public.profile_full_name(sg.user_id),
                         'company', sg.signer_company, 'signed_at', sg.signed_at, 'comments', sg.comments) ORDER BY sg.signed_at)
                FROM system_gate_signatures sg WHERE sg.approval_id = a.id), '[]'::jsonb))
            FROM system_gate_approvals a
            WHERE a.system_id = s.id AND a.gate_id = (ge ->> 'gate_id')::uuid AND a.revoked_at IS NULL
            ORDER BY a.approved_at DESC LIMIT 1),
          'attestations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('criterion', gc.kind, 'label', gc.params ->> 'label', 'comment', at.comment,
                     'file_path', at.file_path, 'by', public.profile_full_name(at.attested_by), 'at', at.attested_at) ORDER BY at.attested_at)
            FROM system_gate_attestations at JOIN gate_criteria gc ON gc.id = at.criterion_id
            WHERE at.system_id = s.id AND gc.gate_id = (ge ->> 'gate_id')::uuid AND at.revoked_at IS NULL), '[]'::jsonb)
        ) ORDER BY (ge ->> 'order')::int, ge ->> 'code')
        FROM gates gg, jsonb_array_elements(gg.gates) ge WHERE gg.system_id = s.id), '[]'::jsonb),

      -- PSSR del sistema con firmas por capacidad y resumen de ítems.
      'pssr', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'review_id', r.id, 'review_number', r.review_number, 'title', r.title, 'status', r.status,
          'submitted_by', public.profile_full_name(r.submitted_by), 'submitted_at', r.submitted_at,
          'approved_by', public.profile_full_name(r.approved_by), 'approved_at', r.approved_at,
          'items', (SELECT jsonb_build_object('total', count(*), 'yes', count(*) FILTER (WHERE it.status = 'si'),
                      'na', count(*) FILTER (WHERE it.status = 'na'), 'no', count(*) FILTER (WHERE it.status = 'no'))
                    FROM pssr_review_items it WHERE it.review_id = r.id),
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('capacity', ps.capacity, 'discipline', ps.discipline,
                     'name', public.profile_full_name(ps.user_id), 'signed_at', ps.signed_at) ORDER BY ps.signed_at)
            FROM pssr_signatures ps WHERE ps.review_id = r.id), '[]'::jsonb)
        ) ORDER BY r.created_at)
        FROM pssr_reviews r WHERE r.system_id = s.id), '[]'::jsonb),

      -- Procedimientos: revisión vigente (hash, verificación en campo) y última ejecución completada con pasos y holds.
      'procedures', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'procedure_id', pr.id, 'number', pr.number, 'title', pr.title, 'kind', pr.kind,
          'revision', (
            SELECT jsonb_build_object('revision_id', rv.id, 'rev', rv.rev, 'status', rv.status,
                     'approved_by', public.profile_full_name(rv.approved_by), 'approved_at', rv.approved_at,
                     'field_verified_by', public.profile_full_name(rv.field_verified_by), 'field_verified_at', rv.field_verified_at,
                     'walkdown_note', rv.walkdown_note, 'content_hash', rv.content_hash)
            FROM procedure_revisions rv WHERE rv.id = pr.current_revision_id),
          'last_run', (
            SELECT jsonb_build_object('run_id', ru.id, 'number', ru.number, 'status', ru.status,
                     'started_by', public.profile_full_name(ru.started_by), 'started_at', ru.started_at,
                     'completed_by', public.profile_full_name(ru.completed_by), 'completed_at', ru.completed_at,
                     'steps', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('ord', rs.ord, 'action', ps.action, 'expected', ps.expected_value,
                                'expected_min', ps.expected_min, 'expected_max', ps.expected_max, 'expected_unit', ps.expected_unit,
                                'actual', rs.actual_value, 'out_of_range', rs.out_of_range, 'status', rs.status, 'comment', rs.comment,
                                'hold', ps.is_hold_point, 'done_by', public.profile_full_name(rs.done_by), 'done_at', rs.done_at,
                                'released_by', public.profile_full_name(rs.released_by), 'released_at', rs.released_at,
                                'release_role', rs.release_role, 'release_comment', rs.release_comment) ORDER BY rs.ord)
                       FROM procedure_run_steps rs JOIN procedure_steps ps ON ps.id = rs.step_id
                       WHERE rs.run_id = ru.id), '[]'::jsonb),
                     'timeline', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('kind', ev.kind, 'by', public.profile_full_name(ev.user_id),
                                'at', COALESCE(ev.field_at, ev.recorded_at), 'comment', ev.comment) ORDER BY COALESCE(ev.field_at, ev.recorded_at))
                       FROM procedure_run_events ev WHERE ev.run_id = ru.id), '[]'::jsonb))
            FROM procedure_runs ru WHERE ru.procedure_id = pr.id AND ru.status = 'completed'
            ORDER BY ru.completed_at DESC LIMIT 1)
        ) ORDER BY pr.number)
        FROM procedures pr WHERE pr.system_id = s.id), '[]'::jsonb),

      -- Line-ups verificados vigentes (no reemplazados) con sus posiciones.
      'lineups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sheet_id', ls.id, 'number', ls.number, 'title', ls.title, 'status', ls.status,
          'issued_by', public.profile_full_name(ls.issued_by), 'issued_at', ls.issued_at,
          'verified_by', public.profile_full_name(ls.verified_by), 'verified_at', ls.verified_at, 'content_hash', ls.content_hash,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('ord', li.ord, 'tag', t.tag_number, 'label', li.label,
                     'required', li.required_position, 'found', li.found_position, 'as_found', li.as_found_position,
                     'lock_number', li.lock_number, 'seal_number', li.seal_number, 'critical', li.is_critical, 'remarks', li.remarks,
                     'set_by', public.profile_full_name(li.set_by), 'set_at', li.set_at,
                     'verified_by', public.profile_full_name(li.verified_by), 'verified_at', li.verified_at) ORDER BY li.ord)
            FROM lineup_items li LEFT JOIN tags t ON t.id = li.tag_id WHERE li.sheet_id = ls.id), '[]'::jsonb)
        ) ORDER BY ls.number)
        FROM lineup_sheets ls WHERE ls.system_id = s.id AND ls.status = 'verified'), '[]'::jsonb),

      -- Bitácora de arranque: hitos y eventos no anulados, con testigo y parámetros.
      'startup_events', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', ev.number, 'kind', ev.kind, 'milestone', ev.milestone, 'category', ev.category, 'occurred_at', ev.occurred_at,
          'title', ev.title, 'description', ev.description, 'status', ev.status,
          'recorded_by', public.profile_full_name(ev.recorded_by), 'witness_capacity', ev.witness_capacity, 'backdate_reason', ev.backdate_reason,
          'witness_by', public.profile_full_name(ev.witness_by), 'witness_at', ev.witness_at,
          'params', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('label', pa.label, 'value', pa.value, 'value_text', pa.value_text, 'unit', pa.unit,
                     'quality', pa.quality, 'sampled_at', pa.sampled_at, 'source', pa.source) ORDER BY pa.label)
            FROM startup_event_params pa WHERE pa.event_id = ev.id), '[]'::jsonb)
        ) ORDER BY ev.occurred_at)
        FROM startup_events ev WHERE ev.system_id = s.id AND ev.status <> 'voided'), '[]'::jsonb),

      -- Traspasos completados con checklist, excepciones justificadas y las dos firmas.
      'transfers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', tr.number, 'from_stage', tr.from_stage, 'to_stage', tr.to_stage, 'is_reversal', tr.is_reversal,
          'reason', tr.reason, 'checklist', tr.checklist, 'exceptions', tr.exceptions,
          'requested_by', public.profile_full_name(tr.requested_by), 'requested_at', tr.requested_at,
          'commissioning', jsonb_build_object('name', public.profile_full_name(tr.commissioning_signed_by),
                             'company', tr.commissioning_company, 'signed_at', tr.commissioning_signed_at),
          'operations', jsonb_build_object('name', public.profile_full_name(tr.operations_signed_by),
                             'company', tr.operations_company, 'signed_at', tr.operations_signed_at),
          'commissioning_ack', to_jsonb(tr.commissioning_ack), 'operations_ack', to_jsonb(tr.operations_ack),
          'completed_at', tr.completed_at, 'content_hash', tr.content_hash
        ) ORDER BY tr.seq)
        FROM ownership_transfers tr WHERE tr.system_id = s.id AND tr.status = 'completed'), '[]'::jsonb),

      -- Competencias: personas por turno exigidas y nivel vigente de cada persona evaluada en el sistema.
      'competencies', jsonb_build_object(
        'required_per_shift', COALESCE((SELECT ct.required FROM system_competency_targets ct WHERE ct.system_id = s.id), 2),
        'personnel', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', op.full_name, 'company', op.company, 'position', op.position, 'shift', op.shift,
                   'level', public.person_system_level(op.id, s.id),
                   'assessed_at', (SELECT max(cr.assessed_at) FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL),
                   'expires_at', (SELECT cr.expires_at FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL
                                  ORDER BY cr.assessed_at DESC, cr.created_at DESC LIMIT 1)
                 ) ORDER BY op.shift NULLS LAST, op.full_name)
          FROM ops_personnel op
          WHERE op.project_id = p_project_id AND op.active
            AND EXISTS (SELECT 1 FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL)), '[]'::jsonb)),

      'spares', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('kind', cs.kind, 'item', cs.item, 'part_number', cs.part_number, 'tag', t.tag_number,
                 'critical', cs.is_critical, 'qty_required', cs.qty_required, 'qty_available', cs.qty_available,
                 'status', cs.status, 'eta', cs.eta, 'notes', cs.notes) ORDER BY cs.is_critical DESC, cs.item)
        FROM critical_spares cs LEFT JOIN tags t ON t.id = cs.tag_id WHERE cs.system_id = s.id), '[]'::jsonb),

      -- Pruebas de desempeño: revisión vigente, intentos evaluados y PTC con sus tres firmas.
      'performance', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'test_id', pt.id, 'number', pt.number, 'title', pt.title, 'status', pt.status,
          'revision', (SELECT jsonb_build_object('rev', tr2.rev, 'status', tr2.status, 'content_hash', tr2.content_hash,
                         'approved_by', public.profile_full_name(tr2.approved_by), 'approved_at', tr2.approved_at)
                       FROM performance_test_revisions tr2 WHERE tr2.id = pt.current_revision_id),
          'runs', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('run_id', ru.id, 'number', ru.number, 'attempt', ru.attempt, 'status', ru.status,
                     'formal_started_at', ru.formal_started_at, 'closed_at', ru.closed_at, 'result', ru.result,
                     'result_reason', ru.result_reason, 'result_by', public.profile_full_name(ru.result_by), 'result_at', ru.result_at,
                     'evaluation_hash', ru.evaluation_hash) ORDER BY ru.attempt)
            FROM performance_runs ru WHERE ru.test_id = pt.id AND ru.status IN ('closed', 'evaluated')), '[]'::jsonb),
          'certificates', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('number', pc.number, 'status', pc.status, 'run_id', pc.run_id, 'content_hash', pc.content_hash,
                     'commissioning', jsonb_build_object('name', public.profile_full_name(pc.commissioning_signed_by),
                                        'company', pc.commissioning_company, 'signed_at', pc.commissioning_signed_at),
                     'operations', jsonb_build_object('name', public.profile_full_name(pc.operations_signed_by),
                                        'company', pc.operations_company, 'signed_at', pc.operations_signed_at),
                     'client', jsonb_build_object('name', public.profile_full_name(pc.client_signed_by),
                                        'company', pc.client_company, 'signed_at', pc.client_signed_at)) ORDER BY pc.seq)
            FROM performance_certificates pc WHERE pc.test_id = pt.id AND pc.status IN ('accepted', 'pending_signatures')), '[]'::jsonb)
        ) ORDER BY pt.number)
        FROM performance_tests pt WHERE pt.primary_system_id = s.id AND pt.status <> 'withdrawn'), '[]'::jsonb),

      -- Registro documental del sistema: revisión vigente de cada documento ligado.
      'documents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('document_id', d.id, 'number', d.number, 'title', d.title, 'doc_type', d.doc_type,
                 'company', (SELECT c.name FROM companies c WHERE c.id = d.company_id),
                 'revision', (SELECT jsonb_build_object('revision_id', dr.id, 'rev', dr.rev, 'status', dr.status, 'issued_on', dr.issued_on,
                                'file_name', dr.file_name, 'file_path', dr.file_path, 'external_url', dr.external_url)
                              FROM document_revisions dr WHERE dr.id = d.current_revision_id)
               ) ORDER BY d.number)
        FROM documents d JOIN document_systems ds ON ds.document_id = d.id WHERE ds.system_id = s.id), '[]'::jsonb),

      -- Paquetes de vendor del sistema: FAT/SAT, hallazgos, reporte final y recomendaciones (con MOC).
      'vendors', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', vp.number, 'title', vp.title, 'status', vp.status,
          'company', (SELECT c.name FROM companies c WHERE c.id = vp.company_id),
          'mobilized_at', vp.mobilized_at, 'demobilized_at', vp.demobilized_at,
          'activities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('kind', va.kind, 'title', va.title, 'performed_on', va.performed_on, 'result', va.result,
                     'retest', va.retest_of IS NOT NULL,
                     'findings', (SELECT count(*) FROM vendor_findings vf WHERE vf.activity_id = va.id)) ORDER BY va.created_at)
            FROM vendor_activities va WHERE va.package_id = vp.id), '[]'::jsonb),
          'final_report', (SELECT jsonb_build_object('report_date', vr.report_date, 'issued_by', public.profile_full_name(vr.issued_by),
                             'issued_at', vr.issued_at, 'activities', vr.activities, 'issues', vr.issues)
                           FROM vendor_reports vr WHERE vr.package_id = vp.id AND vr.kind = 'final' ORDER BY vr.issued_at DESC LIMIT 1),
          'recommendations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('seq', rc.seq, 'description', rc.description, 'status', rc.status,
                     'requires_moc', rc.requires_moc, 'moc_reference', rc.moc_reference,
                     'decided_by', public.profile_full_name(rc.decided_by), 'decided_at', rc.decided_at) ORDER BY rc.seq)
            FROM vendor_recommendations rc WHERE rc.package_id = vp.id), '[]'::jsonb)
        ) ORDER BY vp.number)
        FROM vendor_packages vp JOIN vendor_package_systems vs ON vs.package_id = vp.id
        WHERE vs.system_id = s.id AND vp.status <> 'cancelled'), '[]'::jsonb)
    ) ORDER BY s.code), '[]'::jsonb)
  INTO v_systems
  FROM systems s WHERE s.id = ANY (v_scope);

  -- Punch Cat B abiertos o transferidos (los que se heredan con excepción).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'punch_id', pu.id, 'punch_number', pu.punch_number, 'category', pu.category, 'description', pu.description,
    'status', pu.status, 'priority', pu.priority, 'raised_by', pu.raised_by, 'assigned_to', pu.assigned_to,
    'target_date', pu.target_date, 'closed_date', pu.closed_date, 'subsystem_id', pu.subsystem_id, 'tag_id', pu.tag_id,
    'created_at', pu.created_at
  ) ORDER BY pu.punch_number), '[]'::jsonb)
  INTO v_punches
  FROM punches pu JOIN subsystems sub ON sub.id = pu.subsystem_id
  WHERE pu.project_id = p_project_id AND pu.category = 'B' AND sub.system_id = ANY (v_scope);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'certificate_id', c.id, 'certificate_number', c.certificate_number, 'title', c.title, 'status', c.status,
    'issued_date', c.issued_date, 'issued_by', c.issued_by, 'approved_by', c.approved_by,
    'system_id', COALESCE(c.system_id, sub.system_id), 'subsystem_id', c.subsystem_id, 'document_url', c.document_url,
    'signatures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', cs.role, 'name', public.profile_full_name(cs.user_id), 'signed_at', cs.signed_at)
             ORDER BY cs.signed_at)
      FROM certificate_signatures cs WHERE cs.certificate_id = c.id), '[]'::jsonb)
  ) ORDER BY c.certificate_number), '[]'::jsonb)
  INTO v_certs
  FROM certificates c LEFT JOIN subsystems sub ON sub.id = c.subsystem_id
  WHERE c.project_id = p_project_id AND COALESCE(c.system_id, sub.system_id) = ANY (v_scope);

  RETURN jsonb_build_object('handover_package', jsonb_build_object(
    'schema_version', '3.0',
    'generated_at',   to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'org_id',         v_org_id,
    'project',        v_project,
    'systems',        v_systems,
    'punch_items',    v_punches,
    'certificates',   v_certs));
END;
$function$;


REVOKE ALL ON FUNCTION public.set_lineup_item(uuid, text, text, timestamptz, boolean, timestamptz, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_lineup_item(uuid, text, text, timestamptz, boolean, timestamptz, timestamptz, text, text, text) TO authenticated, service_role;
