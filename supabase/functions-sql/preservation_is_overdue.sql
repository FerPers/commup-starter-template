-- fn: public.preservation_is_overdue(public.preservation_plan_status,date,date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.preservation_is_overdue(p_status public.preservation_plan_status, p_next_due date, p_ref date DEFAULT CURRENT_DATE)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_status = 'active' AND p_next_due < p_ref
$function$;
