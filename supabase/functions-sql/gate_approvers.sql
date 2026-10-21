-- fn: public.gate_approvers(uuid,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_approvers(p_project_id uuid, p_gate_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT u FROM public.project_role_members(p_project_id, (SELECT rg.approval_roles FROM readiness_gates rg WHERE rg.id = p_gate_id)) u
  WHERE NOT public.capacity_designated(p_project_id, 'commissioning') OR public.has_capacity(p_project_id, 'commissioning', u)
$function$;
