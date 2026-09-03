-- Sprint E (2026-09-03): agregados SQL para hub de proyecto, KPIs, dashboard y explorer.
-- Todas SECURITY INVOKER (RLS aplica). Antes estas pantallas traían todas las filas
-- de itrs/punches/certificates y contaban en JavaScript (tope 1000 filas de PostgREST).

CREATE OR REPLACE FUNCTION public.project_itr_phase_counts(p_project_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS TABLE(project_id uuid, phase_id uuid, status public.itr_status, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT i.project_id, i.phase_id, i.status, count(*)::bigint
  FROM public.itrs i
  WHERE (p_project_id IS NULL OR i.project_id = p_project_id)
    AND (p_org_id IS NULL OR i.project_id IN (SELECT id FROM public.projects WHERE org_id = p_org_id))
  GROUP BY i.project_id, i.phase_id, i.status
$$;

CREATE OR REPLACE FUNCTION public.project_punch_counts(p_project_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS TABLE(project_id uuid, category public.punch_category, status public.punch_status, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT pu.project_id, pu.category, pu.status, count(*)::bigint
  FROM public.punches pu
  WHERE (p_project_id IS NULL OR pu.project_id = p_project_id)
    AND (p_org_id IS NULL OR pu.project_id IN (SELECT id FROM public.projects WHERE org_id = p_org_id))
  GROUP BY pu.project_id, pu.category, pu.status
$$;

CREATE OR REPLACE FUNCTION public.project_cert_counts(p_project_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS TABLE(project_id uuid, status public.certificate_status, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.project_id, c.status, count(*)::bigint
  FROM public.certificates c
  WHERE (p_project_id IS NULL OR c.project_id = p_project_id)
    AND (p_org_id IS NULL OR c.project_id IN (SELECT id FROM public.projects WHERE org_id = p_org_id))
  GROUP BY c.project_id, c.status
$$;

-- Rollup por subsistema (explorer, KPIs por subsistema)
CREATE OR REPLACE FUNCTION public.subsystem_rollup(p_project_id uuid)
RETURNS TABLE(
  subsystem_id uuid, tag_count bigint, itr_total bigint, itr_approved bigint,
  open_punches_a bigint, open_punches_b bigint, open_punches_c bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    ss.id,
    coalesce(tg.n, 0), coalesce(it.total, 0), coalesce(it.approved, 0),
    coalesce(pu.a, 0), coalesce(pu.b, 0), coalesce(pu.c, 0)
  FROM public.subsystems ss
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM public.tags t WHERE t.subsystem_id = ss.id
  ) tg ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS total, count(*) FILTER (WHERE i.status = 'approved') AS approved
    FROM public.itrs i WHERE i.subsystem_id = ss.id
  ) it ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE p.category = 'A') AS a,
      count(*) FILTER (WHERE p.category = 'B') AS b,
      count(*) FILTER (WHERE p.category = 'C') AS c
    FROM public.punches p
    WHERE p.subsystem_id = ss.id AND p.status IN ('open', 'in_progress')
  ) pu ON true
  WHERE ss.project_id = p_project_id
$$;

REVOKE EXECUTE ON FUNCTION public.project_itr_phase_counts(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.project_punch_counts(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.project_cert_counts(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.subsystem_rollup(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.project_itr_phase_counts(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_punch_counts(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_cert_counts(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subsystem_rollup(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_itrs_project_phase_status ON public.itrs (project_id, phase_id, status);
CREATE INDEX IF NOT EXISTS idx_punches_subsystem_status ON public.punches (subsystem_id, status);
CREATE INDEX IF NOT EXISTS idx_certificates_project ON public.certificates (project_id);
