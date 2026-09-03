-- Sprint E (2026-09-03): subsystem_rollup con agregados agrupados en vez de
-- 3 subconsultas LATERAL por subsistema (500 subsistemas × 3 = 1.500 subconsultas).
-- Bajo RLS pasaba de 6,9 s (políticas por fila) → 1,4 s (set-based) → objetivo < 300 ms.
CREATE OR REPLACE FUNCTION public.subsystem_rollup(p_project_id uuid)
RETURNS TABLE(
  subsystem_id uuid, tag_count bigint, itr_total bigint, itr_approved bigint,
  open_punches_a bigint, open_punches_b bigint, open_punches_c bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH tg AS (
    SELECT subsystem_id, count(*) AS n FROM public.tags WHERE project_id = p_project_id GROUP BY subsystem_id
  ), it AS (
    SELECT subsystem_id, count(*) AS total, count(*) FILTER (WHERE status = 'approved') AS approved
    FROM public.itrs WHERE project_id = p_project_id GROUP BY subsystem_id
  ), pu AS (
    SELECT subsystem_id,
      count(*) FILTER (WHERE category = 'A') AS a,
      count(*) FILTER (WHERE category = 'B') AS b,
      count(*) FILTER (WHERE category = 'C') AS c
    FROM public.punches WHERE project_id = p_project_id AND status IN ('open', 'in_progress') GROUP BY subsystem_id
  )
  SELECT ss.id, coalesce(tg.n, 0), coalesce(it.total, 0), coalesce(it.approved, 0),
         coalesce(pu.a, 0), coalesce(pu.b, 0), coalesce(pu.c, 0)
  FROM public.subsystems ss
  LEFT JOIN tg ON tg.subsystem_id = ss.id
  LEFT JOIN it ON it.subsystem_id = ss.id
  LEFT JOIN pu ON pu.subsystem_id = ss.id
  WHERE ss.project_id = p_project_id
$$;

-- Búsqueda de tags por número de plano
CREATE INDEX IF NOT EXISTS idx_tags_pid_drawing_trgm ON public.tags USING gin (pid_drawing gin_trgm_ops);
