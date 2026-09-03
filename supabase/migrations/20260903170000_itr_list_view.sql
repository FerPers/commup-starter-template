-- Sprint E (2026-09-03): listado de ITRs paginado en servidor.
-- Vista plana (security_invoker → RLS de itrs/tags/… aplica) con las columnas
-- que la lista filtra, ordena y busca, más un search_text para ilike.
-- Los embeds (asignaciones, firmas) se cargan aparte solo para la página visible.

CREATE OR REPLACE VIEW public.itr_list_v WITH (security_invoker = true) AS
SELECT
  i.id, i.project_id, i.itr_number, i.status, i.progress_pct, i.scheduled_date,
  i.completed_date, i.created_at, i.tag_id, i.template_id, i.phase_id, i.subsystem_id,
  t.tag_number, t.description AS tag_description,
  tp.code AS template_code, tp.title AS template_title,
  d.code AS discipline_code, d.name AS discipline_name, d.color AS discipline_color,
  ph.code AS phase_code, ph.name AS phase_name, ph.color AS phase_color,
  p.org_id, p.name AS project_name, p.code AS project_code,
  (i.itr_number || ' ' || coalesce(t.tag_number, '') || ' ' || coalesce(t.description, '')
     || ' ' || coalesce(tp.code, '') || ' ' || coalesce(tp.title, '') || ' ' || coalesce(p.name, '')) AS search_text
FROM public.itrs i
JOIN public.projects p ON p.id = i.project_id
LEFT JOIN public.tags t ON t.id = i.tag_id
LEFT JOIN public.itr_templates tp ON tp.id = i.template_id
LEFT JOIN public.disciplines d ON d.id = tp.discipline_id
LEFT JOIN public.project_phases ph ON ph.id = i.phase_id;

REVOKE ALL ON public.itr_list_v FROM anon, public;
GRANT SELECT ON public.itr_list_v TO authenticated, service_role;

-- Conteo por estado (tarjetas resumen) sin traer las filas.
-- SECURITY INVOKER: solo cuenta lo que el usuario puede ver por RLS.
CREATE OR REPLACE FUNCTION public.itr_status_counts(p_project_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS TABLE(status public.itr_status, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT i.status, count(*)::bigint
  FROM public.itrs i
  WHERE (p_project_id IS NULL OR i.project_id = p_project_id)
    AND (p_org_id IS NULL OR i.project_id IN (SELECT id FROM public.projects WHERE org_id = p_org_id))
  GROUP BY i.status
$$;

REVOKE EXECUTE ON FUNCTION public.itr_status_counts(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.itr_status_counts(uuid, uuid) TO authenticated, service_role;

-- Orden por defecto de la lista (más recientes primero) por proyecto.
CREATE INDEX IF NOT EXISTS idx_itrs_project_created ON public.itrs (project_id, created_at DESC);
