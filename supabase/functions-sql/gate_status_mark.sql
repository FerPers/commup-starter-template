-- fn: public.gate_status_mark(uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_mark(p_system_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH l AS (
    SELECT st.system_id FROM system_gate_status st
    WHERE st.system_id = ANY (p_system_ids)
    ORDER BY st.system_id
    FOR UPDATE
  )
  UPDATE system_gate_status st SET version = st.version + 1
  FROM l WHERE st.system_id = l.system_id
$function$;
