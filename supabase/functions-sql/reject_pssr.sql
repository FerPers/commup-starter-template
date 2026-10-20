-- fn: public.reject_pssr(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.reject_pssr(p_review_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r pssr_reviews%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000); v_sigs jsonb;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores rechazan el PSSR' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Solo se rechaza un PSSR enviado a aprobación' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo del rechazo' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id, 'capacity', capacity, 'signed_at', signed_at)), '[]') INTO v_sigs
  FROM pssr_signatures WHERE review_id = r.id;
  DELETE FROM pssr_signatures WHERE review_id = r.id;
  UPDATE pssr_reviews SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejected_reason = v_reason, updated_at = now()
   WHERE id = r.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'rejected', jsonb_build_object('projectId', r.project_id, 'reason', v_reason, 'voided_signatures', v_sigs));
END;
$function$;
