-- SEC-006: analytics_project_forecast — cross-tenant read via SECURITY DEFINER.
--
-- The function bypasses RLS (DEFINER) and trusted the client-supplied
-- p_project_id with no membership check, so any authenticated user could
-- read another tenant's forecast (ITR totals, velocity, ETA, Cat-A punches)
-- by guessing/knowing a project UUID. It was the only analytics DEFINER
-- function without an internal guard.
--
-- Fix: convert to plpgsql and fail closed with is_project_member(), matching
-- accept_itr_suggestion / data_quality_list. Explicit ::bigint casts are
-- required because RETURN QUERY does not apply the assignment casts that
-- LANGUAGE sql functions did (SUM(bigint) yields numeric).

CREATE OR REPLACE FUNCTION public.analytics_project_forecast(p_project_id uuid)
RETURNS TABLE(
  project_id uuid,
  total_itrs bigint,
  itrs_approved bigint,
  itrs_remaining bigint,
  velocity_per_day numeric,
  days_to_complete_p50 numeric,
  eta_p50 date,
  confidence text,
  punch_a_open bigint,
  blockers bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
BEGIN
  IF NOT is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      SUM(ap.total_itrs)       AS total_itrs,
      SUM(ap.itrs_approved)    AS itrs_approved,
      SUM(ap.itrs_remaining)   AS itrs_remaining,
      SUM(ap.punch_a_open)     AS punch_a_open,
      AVG(av.velocity_per_day_30d) AS velocity_per_day
    FROM analytics_subsystem_progress ap
    JOIN analytics_subsystem_velocity av ON av.subsystem_id = ap.subsystem_id
    WHERE ap.project_id = p_project_id
  ),
  calc AS (
    SELECT
      base.total_itrs,
      base.itrs_approved,
      base.itrs_remaining,
      base.punch_a_open,
      base.velocity_per_day,
      CASE
        WHEN base.itrs_remaining = 0 THEN 0
        WHEN COALESCE(base.velocity_per_day, 0) <= 0 THEN NULL
        ELSE ROUND(base.itrs_remaining / base.velocity_per_day, 1)
      END AS days_p50
    FROM base
  )
  SELECT
    p_project_id,
    COALESCE(calc.total_itrs, 0)::bigint,
    COALESCE(calc.itrs_approved, 0)::bigint,
    COALESCE(calc.itrs_remaining, 0)::bigint,
    ROUND(COALESCE(calc.velocity_per_day, 0), 3)::numeric,
    calc.days_p50::numeric,
    CASE WHEN calc.days_p50 IS NULL THEN NULL
         ELSE (CURRENT_DATE + (calc.days_p50 || ' days')::INTERVAL)::DATE END,
    CASE
      WHEN calc.days_p50 IS NULL THEN 'low'
      WHEN calc.velocity_per_day >= 0.5 THEN 'high'
      WHEN calc.velocity_per_day >= 0.1 THEN 'medium'
      ELSE 'low'
    END::text,
    COALESCE(calc.punch_a_open, 0)::bigint,
    COALESCE(calc.punch_a_open, 0)::bigint  -- proxy: Cat A abiertos bloquean MC
  FROM calc;
END;
$$;
