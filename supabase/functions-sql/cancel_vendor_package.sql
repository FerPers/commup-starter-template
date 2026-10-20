-- fn: public.cancel_vendor_package(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.cancel_vendor_package(p_package_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w record; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, true);
  -- S13 (F-34): un paquete movilizado también se puede terminar anticipadamente (contrato rescindido), con motivo ≥ 10.
  IF (w.pkg).status NOT IN ('planned', 'mobilized') THEN RAISE EXCEPTION 'Solo se cancela un paquete planificado o movilizado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  IF (w.pkg).status = 'mobilized' AND length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Indica el motivo de la terminación anticipada (mín. 10 caracteres)' USING ERRCODE = '22023';
  END IF;
  UPDATE vendor_packages SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason, updated_at = now()
   WHERE id = (w.pkg).id;
END;
$function$;
