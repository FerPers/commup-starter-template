-- fn: public.gate_status_refresh_dirty()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_refresh_dirty()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_p uuid; v_n integer := 0;
BEGIN
  FOR v_p IN
    SELECT DISTINCT st.project_id FROM system_gate_status st
    WHERE st.computed_version IS DISTINCT FROM st.version
    LIMIT 50
  LOOP
    PERFORM count(*) FROM public.compute_project_gates(v_p);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;
