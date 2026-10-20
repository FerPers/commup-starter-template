-- fn: public.decide_vendor_recommendation(uuid,text,text,boolean)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.decide_vendor_recommendation(p_id uuid, p_decision text, p_reason text, p_requires_moc boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r vendor_recommendations%ROWTYPE; w record; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO r FROM vendor_recommendations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recomendación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(r.package_id, true);
  IF r.status <> 'proposed' THEN RAISE EXCEPTION 'La recomendación ya fue decidida' USING ERRCODE = 'P0001'; END IF;
  -- S13 (F-34): segregación de funciones, quien propone no decide.
  IF r.proposed_by = auth.uid() THEN RAISE EXCEPTION 'Quien propone la recomendación no puede decidirla' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Decisión no válida' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'rejected' AND (v_reason IS NULL OR length(v_reason) < 3) THEN RAISE EXCEPTION 'Indica el motivo del rechazo' USING ERRCODE = '22023'; END IF;
  UPDATE vendor_recommendations SET status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason,
         requires_moc = COALESCE(p_requires_moc, requires_moc)
   WHERE id = r.id;
END;
$function$;
