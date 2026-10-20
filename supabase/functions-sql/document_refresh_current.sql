-- fn: public.document_refresh_current(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.document_refresh_current(p_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_cur uuid;
BEGIN
  -- S13 (F-03): vigente = la de fecha de emisión más reciente (no la última registrada), así cargar el historial
  -- después de la vigente no la desplaza; a igual fecha, la última registrada. Las anuladas (F-24) no cuentan.
  SELECT id INTO v_cur FROM document_revisions
   WHERE document_id = p_document_id AND status NOT IN ('draft', 'void')
   ORDER BY issued_on DESC NULLS LAST, seq DESC LIMIT 1;
  UPDATE documents SET current_revision_id = v_cur, updated_at = now() WHERE id = p_document_id;
  RETURN v_cur;
END;
$function$;
