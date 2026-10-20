-- fn: public.preservation_due_counts(uuid[],integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.preservation_due_counts(p_project_ids uuid[], p_days integer DEFAULT 7)
 RETURNS TABLE(project_id uuid, active bigint, overdue bigint, due_soon bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT pp.project_id,
         count(*) FILTER (WHERE pp.status = 'active'),
         count(*) FILTER (WHERE public.preservation_is_overdue(pp.status, pp.next_due_date, public.tz_today(pr.timezone))),
         count(*) FILTER (WHERE pp.status = 'active' AND pp.next_due_date >= public.tz_today(pr.timezone)
                            AND pp.next_due_date <= public.tz_today(pr.timezone) + greatest(p_days, 0))
  FROM public.preservation_plans pp
  JOIN public.projects pr ON pr.id = pp.project_id  -- S10 (D-05): «hoy» de cada proyecto
  WHERE pp.project_id = ANY (p_project_ids)
  GROUP BY pp.project_id
$function$;
