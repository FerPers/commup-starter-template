-- S05 — ITR: contenido, estados y numeración (C-10/A-28, C-34, C-15, C-20, C-23, C-26; decisión D7). 2026-10-19.
--
-- D7: el estado del ITR no se cambia a mano (ni en masa): sale del contenido y de las firmas. `refresh_itr_status`
--     lo recalcula (lo llaman las acciones al guardar respuestas o evidencias) y `guard_itr_derived` impide escribir
--     estado, avance y fecha de completado por REST. C-34: `itrs_update` solo para editores (planificación).
-- C-15: número atómico (`assign_itr_number` + `itr_number_counters`): « Rn» bajo candado por (proyecto, base).
-- C-20: casilla cuenta solo marcada; un «No» cuenta solo con observación (espejo en src/lib/itr/completion.ts).
-- C-23: `return_itr_to_executor` — el supervisor o cliente asignado devuelve con motivo; se retiran las firmas.
-- C-26: `sign_itr_atomic` valida el trazo (PNG base64, ~256 KB).
-- Funciones en su archivo canónico (supabase/functions-sql/) y emitidas completas.

CREATE TABLE IF NOT EXISTS public.itr_number_counters (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  base text NOT NULL,
  last_seq integer NOT NULL,
  PRIMARY KEY (project_id, base)
);
ALTER TABLE public.itr_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY itr_number_counters_select ON public.itr_number_counters FOR SELECT USING (public.is_project_member(project_id));
COMMENT ON TABLE public.itr_number_counters IS 'S05 (C-15): último « Rn» por (proyecto, base del número de ITR). Solo lo escribe assign_itr_number.';

DROP POLICY IF EXISTS itrs_update ON public.itrs;
CREATE POLICY itrs_update ON public.itrs FOR UPDATE
  USING (project_id IN (SELECT public.get_my_editor_project_ids()))
  WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));

-- evaluate_itr_capture  (supabase/functions-sql/evaluate_itr_capture.sql)
CREATE OR REPLACE FUNCTION public.evaluate_itr_capture(p_itr_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH RECURSIVE
items AS MATERIALIZED (
  SELECT i.*, r.value_text, r.value_numeric, r.value_bool, r.value_option, r.remarks,
    i.option_outcomes ->> r.value_option AS selection_outcome,
    CASE WHEN i.item_type::text='continuity' THEN public.evaluate_itr_continuity(r.value_text) END AS continuity,
    CASE WHEN i.item_type::text='table' THEN public.evaluate_itr_table(i.options, r.value_text, pg_catalog.jsonb_array_length(itr.source_rows)) END AS table_eval,
    CASE WHEN i.item_type::text='select' THEN CASE i.option_outcomes ->> r.value_option WHEN 'pass' THEN true WHEN 'fail' THEN false ELSE NULL END
    WHEN i.item_type::text='measurement' AND r.value_numeric IS NOT NULL
      AND (i.acceptance_min IS NOT NULL OR i.acceptance_max IS NOT NULL)
      THEN r.value_numeric::text NOT IN ('NaN','Infinity','-Infinity')
        AND (i.acceptance_min IS NULL OR r.value_numeric>=i.acceptance_min)
        AND (i.acceptance_max IS NULL OR r.value_numeric<=i.acceptance_max)
      ELSE r.is_passed END AS is_passed,
    CASE i.item_type::text
      WHEN 'checkbox' THEN r.value_bool::text
      WHEN 'yes_no' THEN r.value_bool::text
      WHEN 'number' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'measurement' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'select' THEN r.value_option
      ELSE r.value_text
    END AS condition_actual,
    COALESCE(r.value_numeric IS NOT NULL AND r.value_numeric::text NOT IN ('NaN', 'Infinity', '-Infinity'), false) AS finite_number,
    EXISTS (
      SELECT 1 FROM public.itr_attachments a
      WHERE a.itr_id = p_itr_id AND a.item_id = i.id
        AND a.file_url ~ '[^[:space:]]' AND a.file_type LIKE 'image/%'
    ) AS has_photo,
    EXISTS (
      SELECT 1 FROM public.itr_attachments a
      WHERE a.itr_id = p_itr_id AND a.item_id = i.id
        AND a.file_url ~ '[^[:space:]]' AND a.file_type = 'application/pdf'
    ) AS has_document
  FROM public.itrs itr
  JOIN public.itr_template_items i ON i.template_id = itr.template_id
  LEFT JOIN public.itr_responses r ON r.itr_id = itr.id AND r.item_id = i.id
  WHERE itr.id = p_itr_id
),
walk AS (
  SELECT i.id AS origin, i.id, i.condition_item_id, i.condition_value,
    ARRAY[i.id] AS path, true AS matches
  FROM items i
  UNION ALL
  SELECT w.origin, p.id, p.condition_item_id, p.condition_value,
    w.path || p.id,
    w.matches AND COALESCE(p.condition_actual = w.condition_value, false)
  FROM walk w
  JOIN items p ON p.id = w.condition_item_id
  WHERE NOT p.id = ANY(w.path)
),
visibility AS (
  SELECT w.origin,
    bool_or(w.condition_item_id IS NOT NULL AND (
      w.condition_value IS NULL OR w.condition_item_id = ANY(w.path)
      OR NOT EXISTS (SELECT 1 FROM items p WHERE p.id = w.condition_item_id)
    )) AS invalid,
    bool_and(w.matches) AND bool_or(w.condition_item_id IS NULL) AS applicable
  FROM walk w GROUP BY w.origin
),
evaluated AS (
  SELECT i.id, (i.is_required OR i.selection_outcome='not_applicable') IS TRUE AS is_required, i.is_critical, i.is_passed, i.selection_outcome, i.continuity, i.table_eval,
    v.invalid, v.applicable AND NOT v.invalid AS applicable,
    COALESCE(
      (NOT i.requires_photo OR i.has_photo)
      AND (NOT i.requires_document OR i.has_document)
      AND (NOT i.requires_measurement OR i.finite_number)
      AND CASE i.item_type::text
        WHEN 'continuity' THEN (i.continuity->>'is_complete')::boolean
        WHEN 'table' THEN (i.table_eval->>'is_complete')::boolean
        WHEN 'text' THEN i.value_text ~ '[^[:space:]]'
        WHEN 'number' THEN i.finite_number
        WHEN 'measurement' THEN i.finite_number
        -- S05 (C-20): una casilla cuenta solo marcada (desmarcarla no la deja «respondida»); un «No» pide observación.
        WHEN 'checkbox' THEN i.value_bool IS TRUE
        WHEN 'yes_no' THEN i.value_bool IS TRUE OR (i.value_bool IS FALSE AND i.remarks ~ '[^[:space:]]')
        WHEN 'select' THEN i.value_option ~ '[^[:space:]]'
          AND pg_catalog.jsonb_typeof(i.options) = 'array'
          AND i.options @> pg_catalog.jsonb_build_array(i.value_option)
          AND (i.selection_outcome IS DISTINCT FROM 'not_applicable' OR i.remarks ~ '[^[:space:]]')
        WHEN 'date' THEN i.value_text ~ '^\d{4}-\d{2}-\d{2}$'
          AND pg_catalog.pg_input_is_valid(i.value_text, 'date')
        WHEN 'photo' THEN i.has_photo
        ELSE false
      END, false
    ) AS filled
  FROM items i JOIN visibility v ON v.origin = i.id
),
counts AS (
  SELECT count(*) FILTER (WHERE applicable) AS applicable_count,
    count(*) FILTER (WHERE applicable AND is_required) AS required_count,
    count(*) FILTER (WHERE applicable AND filled) AS completed_count,
    count(*) FILTER (WHERE applicable AND is_required AND filled) AS completed_required_count,
    count(*) FILTER (WHERE invalid) AS invalid_count,
    COALESCE(bool_or(applicable AND ((is_critical AND is_passed IS FALSE) OR selection_outcome='fail' OR (continuity->>'has_fail')::boolean OR (table_eval->>'has_fail')::boolean)), false) AS has_critical_fail,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable), '[]'::jsonb) AS applicable_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE invalid), '[]'::jsonb) AS invalid_condition_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable AND is_required AND NOT filled), '[]'::jsonb) AS missing_required_item_ids
  FROM evaluated
), result AS (
  SELECT *, applicable_count > 0 AND invalid_count = 0
    AND completed_required_count = required_count AS is_complete FROM counts
)
SELECT pg_catalog.jsonb_build_object(
  'is_complete', is_complete,
  'progress_pct', CASE WHEN is_complete THEN 100 WHEN required_count > 0
    THEN LEAST(99, FLOOR(completed_required_count::numeric * 100 / required_count)) ELSE 0 END,
  'has_critical_fail', has_critical_fail,
  'applicable_count', applicable_count,
  'required_count', required_count,
  'completed_count', completed_count,
  'completed_required_count', completed_required_count,
  'applicable_item_ids', applicable_item_ids,
  'invalid_condition_item_ids', invalid_condition_item_ids,
  'missing_required_item_ids', missing_required_item_ids
) FROM result;
$function$;


-- sign_itr_atomic  (supabase/functions-sql/sign_itr_atomic.sql)
CREATE OR REPLACE FUNCTION public.sign_itr_atomic(p_itr_id uuid, p_role text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; e jsonb; roles text[]; uid uuid:=auth.uid(); org uuid; result_status text; eq_block text;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
-- S04 (C-01/I-05, D4): firmas requeridas congeladas en el ITR, en orden ejecutor → supervisor → cliente.
roles:=public.itr_signing_roles(v.required_signatures);
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
-- S05 (C-26): el trazo es un PNG en base64 de hasta ~256 KB (igual que el certificado).
IF p_signature_image IS NOT NULL AND (p_signature_image NOT LIKE 'data:image/png;base64,%' OR length(p_signature_image) > 350000) THEN RAISE EXCEPTION 'Invalid signature image'; END IF;
IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
-- S04 (A-08, D6): una persona no firma dos roles del mismo ITR.
IF EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND user_id=uid) THEN RAISE EXCEPTION 'Signer already signed this ITR in another role'; END IF;
IF EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=p_itr_id AND NOT EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=p_itr_id AND a.role=s.role AND a.user_id=s.user_id)) THEN RAISE EXCEPTION 'Existing signature assignment mismatch'; END IF;
IF EXISTS(SELECT 1 FROM unnest(roles[1:array_position(roles,p_role)-1]) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN RAISE EXCEPTION 'Previous signature required'; END IF;
e:=public.evaluate_itr_capture(p_itr_id);
IF NOT COALESCE((e->>'is_complete')::boolean,false) OR COALESCE((e->>'has_critical_fail')::boolean,true) THEN RAISE EXCEPTION 'Applicable content incomplete or rejected'; END IF;
eq_block:=public.itr_test_equipment_blocker(p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
-- Fase 8: no se firma contra una revisión de documento superada.
eq_block:=public.document_references_blocker('itr',p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
result_status:=CASE WHEN NOT EXISTS(SELECT 1 FROM unnest(roles) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN 'approved' ELSE 'completed' END;
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=CURRENT_DATE WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;


-- refresh_itr_status  (supabase/functions-sql/refresh_itr_status.sql)
CREATE OR REPLACE FUNCTION public.refresh_itr_status(p_itr_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; e jsonb; v_status text; v_complete boolean; v_fail boolean;
BEGIN
  -- S05 (C-34/C-10): el estado y el avance del ITR SALEN del contenido (evaluate_itr_capture) y de las firmas;
  -- nadie los escribe por REST (guard_itr_derived). Lo llaman las acciones tras guardar respuestas o evidencias.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN
    RAISE EXCEPTION 'ITR unavailable' USING ERRCODE = '42501';
  END IF;
  IF v.status = 'approved' OR EXISTS (SELECT 1 FROM itr_signatures WHERE itr_id = p_itr_id) THEN
    RETURN jsonb_build_object('status', v.status, 'progress_pct', v.progress_pct, 'changed', false);
  END IF;
  e := public.evaluate_itr_capture(p_itr_id);
  v_complete := COALESCE((e->>'is_complete')::boolean, false);
  v_fail := COALESCE((e->>'has_critical_fail')::boolean, false);
  v_status := CASE WHEN v_fail THEN 'rejected' WHEN v_complete THEN 'completed'
                   WHEN COALESCE((e->>'completed_count')::int, 0) > 0 THEN 'in_progress' ELSE 'not_started' END;
  UPDATE itrs SET status = v_status::itr_status, progress_pct = COALESCE((e->>'progress_pct')::numeric, 0),
    completed_date = CASE WHEN v_complete AND NOT v_fail THEN COALESCE(v.completed_date, CURRENT_DATE) ELSE NULL END
  WHERE id = p_itr_id;
  RETURN jsonb_build_object('status', v_status, 'progress_pct', COALESCE((e->>'progress_pct')::numeric, 0), 'changed', v_status IS DISTINCT FROM v.status::text);
END;
$function$;


-- guard_itr_derived  (supabase/functions-sql/guard_itr_derived.sql)
CREATE OR REPLACE FUNCTION public.guard_itr_derived()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- S05 (C-34/C-10, D7): estado, avance y fecha de completado solo los escriben las funciones confiables
  -- (refresh_itr_status, sign_itr_atomic, reopen…). Antes cualquier miembro, incluso el cliente, los cambiaba
  -- por REST, y el cambio masivo de estado dejaba ITR «completados» sin contenido.
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.itrs'::regclass))
     AND (NEW.status, NEW.progress_pct, NEW.completed_date) IS DISTINCT FROM (OLD.status, OLD.progress_pct, OLD.completed_date) THEN
    RAISE EXCEPTION 'El estado y el avance del ITR se calculan de su contenido y sus firmas' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;


-- assign_itr_number  (supabase/functions-sql/assign_itr_number.sql)
CREATE OR REPLACE FUNCTION public.assign_itr_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_base text := btrim(NEW.itr_number); v_last int; v_existing int; v_next int;
BEGIN
  -- S05 (C-15): numeración atómica. El cliente manda la base («E01A/PT-101»); si ya existe en el proyecto, se le
  -- agrega « Rn» con un contador por (proyecto, base) bajo candado: sin choques por revisión de plantilla, por
  -- carrera entre dos asignaciones, ni números repetidos después de borrar un R2.
  IF v_base IS NULL OR v_base = '' THEN RAISE EXCEPTION 'ITR number required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text || '|' || v_base, 0));
  SELECT last_seq INTO v_last FROM itr_number_counters WHERE project_id = NEW.project_id AND base = v_base;
  -- Sin regex armada con el texto: prefijo exacto «base R» y el resto solo dígitos.
  SELECT COALESCE(MAX(CASE WHEN itr_number = v_base THEN 1 ELSE substr(itr_number, length(v_base) + 3)::int END), 0)
    INTO v_existing FROM itrs
   WHERE project_id = NEW.project_id
     AND (itr_number = v_base OR (left(itr_number, length(v_base) + 2) = v_base || ' R' AND substr(itr_number, length(v_base) + 3) ~ '^[0-9]{1,6}$'));
  IF COALESCE(v_last, 0) = 0 AND v_existing = 0 THEN
    NEW.itr_number := v_base; v_next := 1;
  ELSE
    v_next := GREATEST(COALESCE(v_last, 0), v_existing) + 1;
    NEW.itr_number := v_base || ' R' || v_next;
  END IF;
  INSERT INTO itr_number_counters (project_id, base, last_seq) VALUES (NEW.project_id, v_base, v_next)
  ON CONFLICT (project_id, base) DO UPDATE SET last_seq = EXCLUDED.last_seq;
  RETURN NEW;
END;
$function$;


-- return_itr_to_executor  (supabase/functions-sql/return_itr_to_executor.sql)
CREATE OR REPLACE FUNCTION public.return_itr_to_executor(p_itr_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; v_org uuid; v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), ''); v_sigs jsonb; v_exec uuid; v_role text;
BEGIN
  -- S05 (C-23): quien debe firmar después del ejecutor (supervisor o cliente asignado) devuelve el ITR con
  -- observaciones: se retiran las firmas puestas, el ejecutor corrige y vuelve a firmar. Auditado y notificado.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
  IF v.status = 'approved' THEN RAISE EXCEPTION 'Un ITR aprobado se reabre con la reapertura auditada' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM itr_signatures WHERE itr_id = p_itr_id AND role = 'executor') THEN
    RAISE EXCEPTION 'El ejecutor todavía no firmó: no hay nada que devolver' USING ERRCODE = 'P0001';
  END IF;
  SELECT a.role::text INTO v_role FROM itr_assignments a
   WHERE a.itr_id = p_itr_id AND a.user_id = auth.uid() AND a.role::text <> 'executor' AND a.role::text = ANY (v.required_signatures)
   LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Solo el supervisor o el cliente asignado devuelve el ITR' USING ERRCODE = '42501'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Explica qué hay que corregir (mínimo 10 caracteres)' USING ERRCODE = '22023'; END IF;

  SELECT org_id INTO v_org FROM projects WHERE id = v.project_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('role', role, 'user_id', user_id, 'signed_at', signed_at)), '[]') INTO v_sigs FROM itr_signatures WHERE itr_id = p_itr_id;
  DELETE FROM itr_signatures WHERE itr_id = p_itr_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'itr', p_itr_id, 'returned', jsonb_build_object('reason', v_reason, 'byRole', v_role, 'previousSignatures', v_sigs));
  SELECT user_id INTO v_exec FROM itr_assignments WHERE itr_id = p_itr_id AND role = 'executor';
  IF v_exec IS NOT NULL AND v_exec <> auth.uid() THEN
    INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
    VALUES (v_org, v_exec, 'itr_returned', 'ITR devuelto: ' || v.itr_number, left(v_reason, 280),
            '/projects/' || v.project_id || COALESCE('/tags/' || v.tag_id || '/itrs/' || p_itr_id, '/itrs'),
            jsonb_build_object('itrId', p_itr_id, 'projectId', v.project_id, 'reason', v_reason));
  END IF;
  RETURN jsonb_build_object('project_id', v.project_id, 'tag_id', v.tag_id, 'itr_number', v.itr_number);
END;
$function$;


DROP TRIGGER IF EXISTS itrs_derived_guard ON public.itrs;
CREATE TRIGGER itrs_derived_guard BEFORE UPDATE ON public.itrs FOR EACH ROW EXECUTE FUNCTION public.guard_itr_derived();
DROP TRIGGER IF EXISTS itrs_number_before_insert ON public.itrs;
CREATE TRIGGER itrs_number_before_insert BEFORE INSERT ON public.itrs FOR EACH ROW EXECUTE FUNCTION public.assign_itr_number();

REVOKE ALL ON FUNCTION public.refresh_itr_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.return_itr_to_executor(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_itr_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.return_itr_to_executor(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_itr_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_itr_derived() FROM PUBLIC, anon, authenticated;

-- Contadores sembrados con lo que ya existe (base = número sin « Rn»).
INSERT INTO public.itr_number_counters (project_id, base, last_seq)
SELECT project_id, regexp_replace(itr_number, ' R[0-9]+$', ''), MAX(COALESCE(substring(itr_number FROM ' R([0-9]+)$')::int, 1))
FROM public.itrs GROUP BY 1, 2
ON CONFLICT (project_id, base) DO UPDATE SET last_seq = GREATEST(public.itr_number_counters.last_seq, EXCLUDED.last_seq);

-- C-20: recalcular el estado de los ITR sin firmas con la regla nueva (como dueño: guard_itr_derived lo permite).
UPDATE public.itrs i SET
  status = (CASE WHEN (e->>'has_critical_fail')::boolean THEN 'rejected' WHEN (e->>'is_complete')::boolean THEN 'completed'
                 WHEN (e->>'completed_count')::int > 0 THEN 'in_progress' ELSE 'not_started' END)::public.itr_status,
  progress_pct = (e->>'progress_pct')::numeric
FROM (SELECT id, public.evaluate_itr_capture(id) AS e FROM public.itrs
      WHERE status <> 'approved' AND NOT EXISTS (SELECT 1 FROM public.itr_signatures s WHERE s.itr_id = itrs.id)) x
WHERE i.id = x.id;
