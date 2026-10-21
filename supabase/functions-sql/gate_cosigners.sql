-- fn: public.gate_cosigners(uuid,uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_cosigners(p_project_id uuid, p_gate_id uuid, p_capacity text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT u FROM public.capacity_holders(p_project_id, p_capacity) u WHERE public.capacity_designated(p_project_id, p_capacity)
  UNION
  SELECT u FROM public.project_role_members(p_project_id, (SELECT rg.cosign_roles FROM readiness_gates rg WHERE rg.id = p_gate_id)) u
  WHERE NOT public.capacity_designated(p_project_id, p_capacity)
$function$;
