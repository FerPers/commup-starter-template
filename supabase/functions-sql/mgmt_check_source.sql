-- fn: public.mgmt_check_source(uuid,text,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.mgmt_check_source(p_project_id uuid, p_kind text, p_source_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ok boolean := true;
BEGIN
  IF p_kind IN ('pssr', 'constraint', 'tq') AND p_source_id IS NULL THEN
    RAISE EXCEPTION 'Falta el registro de origen' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'pssr' THEN
    v_ok := EXISTS (SELECT 1 FROM pssr_review_items i JOIN pssr_reviews r ON r.id = i.review_id
                    WHERE i.id = p_source_id AND r.project_id = p_project_id);
  ELSIF p_kind = 'constraint' THEN
    v_ok := EXISTS (SELECT 1 FROM project_constraints WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'tq' THEN
    v_ok := EXISTS (SELECT 1 FROM technical_queries WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'performance' AND p_source_id IS NOT NULL THEN
    v_ok := EXISTS (SELECT 1 FROM performance_runs WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'gate' THEN
    -- S23 (D-12): condición de una aprobación de gate del proyecto.
    v_ok := p_source_id IS NOT NULL AND EXISTS (SELECT 1 FROM system_gate_approvals WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'vendor' AND p_source_id IS NOT NULL THEN
    v_ok := EXISTS (SELECT 1 FROM vendor_packages WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'El origen no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
END;
$function$;
