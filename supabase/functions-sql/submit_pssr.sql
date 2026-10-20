-- fn: public.submit_pssr(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.submit_pssr(p_review_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r pssr_reviews%ROWTYPE; v_role text; v_n integer; v_block text;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('draft', 'in_progress', 'rejected') THEN RAISE EXCEPTION 'El PSSR ya fue enviado o aprobado' USING ERRCODE = 'P0001'; END IF;
  v_n := public.pssr_items_pending(r.id);
  IF v_n > 0 THEN RAISE EXCEPTION '% ítem(s) sin completar o con estado NO', v_n USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pssr_review_items WHERE review_id = r.id) THEN RAISE EXCEPTION 'El PSSR no tiene ítems' USING ERRCODE = 'P0001'; END IF;
  v_block := public.pssr_punch_blocker(r.id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;
  UPDATE pssr_reviews SET status = 'pending_approval', submitted_by = auth.uid(), submitted_at = now(), updated_at = now() WHERE id = r.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'submitted', jsonb_build_object('projectId', r.project_id));
END;
$function$;
