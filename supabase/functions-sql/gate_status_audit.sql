-- fn: public.gate_status_audit(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_audit(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_checked integer; v_drift integer;
BEGIN
  WITH c AS MATERIALIZED (
    SELECT st.system_id, st.version, st.gates, public.gate_status_compute(st.system_id) AS live
    FROM system_gate_status st
    WHERE st.project_id = p_project_id AND st.computed_version = st.version
  ), fixed AS (
    UPDATE system_gate_status st SET gates = c.live, computed_at = now()
    FROM c
    WHERE st.system_id = c.system_id AND c.live IS DISTINCT FROM c.gates AND st.version = c.version
    RETURNING st.system_id
  )
  SELECT (SELECT COUNT(*) FROM c), (SELECT COUNT(*) FROM fixed) INTO v_checked, v_drift;
  RETURN jsonb_build_object('checked', v_checked, 'drift', v_drift);
END;
$function$;
