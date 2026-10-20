-- fn: public.compute_system_gates(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_system_gates(p_system_id uuid)
 RETURNS TABLE(gate_id uuid, gate_code text, gate_name text, gate_order integer, gate_phase_id uuid, requires_previous boolean, approval_roles text[], required_signatures text[], cosign_roles text[], computed_level text, status text, criteria jsonb, approval jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.compute_system_gates_upto(p_system_id, NULL)
$function$;
