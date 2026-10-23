-- fn: public.org_gate_policy(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.org_gate_policy(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'regressed_previous', CASE WHEN p.v ->> 'regressed_previous' = 'condition' THEN 'condition' ELSE 'block' END,
    'regressed_dependency', CASE WHEN p.v ->> 'regressed_dependency' = 'block' THEN 'block' ELSE 'condition' END,
    'cat_a_regresses_approved', COALESCE((p.v ->> 'cat_a_regresses_approved')::boolean, false),
    -- R5: ITR requeridos sin generar (off · warn = condición · block); por defecto, condición.
    'missing_requirements', CASE WHEN p.v ->> 'missing_requirements' IN ('off', 'block') THEN p.v ->> 'missing_requirements' ELSE 'warn' END)
  FROM (SELECT COALESCE((SELECT settings -> 'gate_policy' FROM organizations WHERE id = p_org_id), '{}'::jsonb) AS v) p
$function$;
