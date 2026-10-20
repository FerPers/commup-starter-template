-- S08 — Preservación (C-05/C-06/I-03, C-42; decisión D10). 2026-10-19.
--
-- D10: la próxima fecha avanza al FINALIZAR el registro, con cualquier resultado; un NOK genera punch.
-- C-06: se quita el trigger AFTER INSERT que avanzaba la fecha al primer toque (abrir ≠ hacer).
-- C-05/I-03: el inspector ejecuta por RPC (la RLS de UPDATE era solo de editores y finalizar afectaba 0 filas
--     sin error): `start_preservation_record` (idempotente, un registro abierto por plan),
--     `save_preservation_response`, `finalize_preservation_record` (no client). La escritura directa de
--     registros y respuestas queda para editores; las fotos, para roles de campo.
-- C-42: el historial de preservación ya no se borra en cascada con el tag ni con el plan (RESTRICT).
-- En prod hoy hay 0 planes y 0 registros: nada que migrar.

-- ── Trigger que avanzaba la fecha al insertar ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_preservation_next_due ON public.preservation_records;
DROP FUNCTION IF EXISTS public.update_preservation_next_due();

-- ── Un registro abierto por plan ──────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS preservation_records_one_open_per_plan ON public.preservation_records (plan_id) WHERE status = 'open';

-- ── Escritura directa: editores (registros, respuestas); fotos: roles de campo ────────────────────
DROP POLICY IF EXISTS preservation_records_insert ON public.preservation_records;
CREATE POLICY preservation_records_insert ON public.preservation_records FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.preservation_plans pp WHERE pp.id = preservation_records.plan_id
                      AND pp.project_id IN (SELECT public.get_my_editor_project_ids())));
DROP POLICY IF EXISTS pres_rec_resp_insert ON public.preservation_record_responses;
CREATE POLICY pres_rec_resp_insert ON public.preservation_record_responses FOR INSERT
  WITH CHECK (record_id IN (SELECT pr.id FROM public.preservation_records pr JOIN public.preservation_plans pp ON pp.id = pr.plan_id
                            WHERE public.is_project_editor(pp.project_id)));
DROP POLICY IF EXISTS preservation_attachments_insert ON public.preservation_attachments;
CREATE POLICY preservation_attachments_insert ON public.preservation_attachments FOR INSERT
  WITH CHECK (record_id IN (SELECT pr.id FROM public.preservation_records pr JOIN public.preservation_plans pp ON pp.id = pr.plan_id
                            WHERE public.is_project_field_member(pp.project_id)));

-- ── C-42: el historial no se borra en cascada ─────────────────────────────────────────────────────
ALTER TABLE public.preservation_records DROP CONSTRAINT preservation_records_tag_id_fkey,
  ADD CONSTRAINT preservation_records_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE RESTRICT;
ALTER TABLE public.preservation_records DROP CONSTRAINT preservation_records_plan_id_fkey,
  ADD CONSTRAINT preservation_records_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.preservation_plans(id) ON DELETE RESTRICT;
ALTER TABLE public.preservation_plans DROP CONSTRAINT preservation_plans_tag_id_fkey,
  ADD CONSTRAINT preservation_plans_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE RESTRICT;

-- ── RPC (archivos canónicos en supabase/functions-sql/) ──────────────────────────────────────────

-- start_preservation_record  (supabase/functions-sql/start_preservation_record.sql)
CREATE OR REPLACE FUNCTION public.start_preservation_record(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_plan preservation_plans; v_id uuid;
BEGIN
  -- S08 (C-05/C-06/I-03): abrir la ejecución no cuenta como mantenimiento hecho (la fecha avanza al finalizar)
  -- y es idempotente: un solo registro abierto por plan (índice único), así dos toques no crean dos.
  SELECT * INTO v_plan FROM preservation_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_field_member(v_plan.project_id) THEN
    RAISE EXCEPTION 'Sin permiso para ejecutar la preservación' USING ERRCODE = '42501';
  END IF;
  IF v_plan.status <> 'active' THEN RAISE EXCEPTION 'El plan no está activo' USING ERRCODE = 'P0001'; END IF;

  SELECT id INTO v_id FROM preservation_records WHERE plan_id = p_plan_id AND status = 'open';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO preservation_records (plan_id, tag_id, performed_by, performed_at, result, status)
  VALUES (p_plan_id, v_plan.tag_id, auth.uid(), now(), 'na', 'open')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;


-- save_preservation_response  (supabase/functions-sql/save_preservation_response.sql)
CREATE OR REPLACE FUNCTION public.save_preservation_response(p_record_id uuid, p_item_id uuid, p_value_bool boolean DEFAULT NULL::boolean, p_value_numeric numeric DEFAULT NULL::numeric, p_value_text text DEFAULT NULL::text, p_is_passed boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rec preservation_records; v_plan preservation_plans;
BEGIN
  -- S08 (C-05): el inspector guarda y corrige respuestas de un registro abierto (antes la RLS de UPDATE era
  -- solo de editores y el upsert fallaba, o afectaba 0 filas sin error).
  SELECT * INTO v_rec FROM preservation_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_plan FROM preservation_plans WHERE id = v_rec.plan_id;
  IF auth.uid() IS NULL OR NOT public.is_project_field_member(v_plan.project_id) THEN
    RAISE EXCEPTION 'Sin permiso para ejecutar la preservación' USING ERRCODE = '42501';
  END IF;
  IF v_rec.status <> 'open' THEN RAISE EXCEPTION 'El registro ya fue finalizado' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM preservation_procedure_items WHERE id = p_item_id AND procedure_id = v_plan.procedure_id) THEN
    RAISE EXCEPTION 'El ítem no pertenece al procedimiento del plan' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO preservation_record_responses (record_id, item_id, value_bool, value_numeric, value_text, is_passed, responded_at, responded_by)
  VALUES (p_record_id, p_item_id, p_value_bool, p_value_numeric, NULLIF(btrim(COALESCE(p_value_text, '')), ''), p_is_passed, now(), auth.uid())
  ON CONFLICT (record_id, item_id) DO UPDATE SET
    value_bool = EXCLUDED.value_bool, value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    is_passed = EXCLUDED.is_passed, responded_at = EXCLUDED.responded_at, responded_by = EXCLUDED.responded_by;
END;
$function$;


-- finalize_preservation_record  (supabase/functions-sql/finalize_preservation_record.sql)
CREATE OR REPLACE FUNCTION public.finalize_preservation_record(p_record_id uuid, p_result preservation_result, p_remarks text DEFAULT NULL::text, p_punch_category punch_category DEFAULT NULL::punch_category)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec preservation_records; v_plan preservation_plans; v_tag tags; v_proc preservation_procedures;
  v_org uuid; v_remarks text := NULLIF(btrim(COALESCE(p_remarks, '')), '');
  v_punch uuid; v_number text;
BEGIN
  -- S08 (C-05/C-06/I-03, D10): finalizar es lo que cuenta. En una transacción: cierra el registro, avanza la
  -- próxima fecha del plan (con cualquier resultado) y, si el resultado es NOK, levanta el punch (obligatorio).
  SELECT * INTO v_rec FROM preservation_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_plan FROM preservation_plans WHERE id = v_rec.plan_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT public.is_project_field_member(v_plan.project_id) THEN
    RAISE EXCEPTION 'Sin permiso para ejecutar la preservación' USING ERRCODE = '42501';
  END IF;
  IF v_rec.status <> 'open' THEN RAISE EXCEPTION 'Este registro ya fue finalizado' USING ERRCODE = 'P0001'; END IF;
  IF p_result = 'nok' AND p_punch_category IS NULL THEN
    RAISE EXCEPTION 'Un resultado NOK genera un punch: indica su categoría' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tag FROM tags WHERE id = v_plan.tag_id;
  SELECT * INTO v_proc FROM preservation_procedures WHERE id = v_plan.procedure_id;
  SELECT org_id INTO v_org FROM projects WHERE id = v_plan.project_id;

  IF p_result = 'nok' THEN
    INSERT INTO punches (project_id, subsystem_id, tag_id, preservation_record_id, category, description, discipline_id,
                         raised_by, punch_number, status, priority, created_via)
    VALUES (v_plan.project_id, v_tag.subsystem_id, v_tag.id, p_record_id, p_punch_category,
            '[Preservación NOK] ' || COALESCE(v_proc.code, 'PRES') || ' en ' || v_tag.tag_number
              || COALESCE(' — ' || NULLIF(v_proc.title, ''), '') || COALESCE(E'\n' || v_remarks, ''),
            v_tag.discipline_id, auth.uid(), '', 'open',
            CASE WHEN p_punch_category = 'A' THEN 'critical'::punch_priority ELSE 'major'::punch_priority END, 'preservation')
    RETURNING id, punch_number INTO v_punch, v_number;
  END IF;

  UPDATE preservation_records SET result = p_result, remarks = v_remarks, status = 'finalized', performed_by = auth.uid(),
    performed_at = now(), punch_raised = v_punch IS NOT NULL, punch_id = v_punch
  WHERE id = p_record_id;
  UPDATE preservation_plans SET last_performed_date = CURRENT_DATE, next_due_date = CURRENT_DATE + COALESCE(v_proc.interval_days, 0)
  WHERE id = v_plan.id;

  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'preservation_record', p_record_id, 'finalized',
          jsonb_build_object('planId', v_plan.id, 'tagId', v_tag.id, 'result', p_result, 'punchNumber', v_number,
                             'nextDueDate', CURRENT_DATE + COALESCE(v_proc.interval_days, 0)));
  RETURN jsonb_build_object('punch_number', v_number, 'next_due_date', CURRENT_DATE + COALESCE(v_proc.interval_days, 0));
END;
$function$;


REVOKE ALL ON FUNCTION public.start_preservation_record(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_preservation_response(uuid, uuid, boolean, numeric, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_preservation_record(uuid, public.preservation_result, text, public.punch_category) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_preservation_record(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_preservation_response(uuid, uuid, boolean, numeric, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_preservation_record(uuid, public.preservation_result, text, public.punch_category) TO authenticated, service_role;
