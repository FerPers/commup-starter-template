-- Sprint E (2026-09-03): listas de tags y punches paginadas en servidor.
-- Vistas planas security_invoker (RLS de las tablas base aplica) + conteos en SQL.

CREATE OR REPLACE VIEW public.tag_list_v WITH (security_invoker = true) AS
SELECT
  tg.id, tg.project_id, p.org_id, tg.tag_number, tg.description, tg.status,
  tg.manufacturer, tg.model, tg.serial_number, tg.preservation_required, tg.pid_drawing, tg.created_at,
  tg.discipline_id, d.code AS discipline_code, d.name AS discipline_name, d.color AS discipline_color,
  tg.equipment_type_id, et.code AS equipment_type_code, et.name AS equipment_type_name,
  tg.subsystem_id, ss.code AS subsystem_code, ss.name AS subsystem_name,
  ss.system_id, s.code AS system_code, s.name AS system_name,
  s.area_id, a.code AS area_code, a.name AS area_name,
  (tg.tag_number || ' ' || coalesce(tg.description, '') || ' ' || coalesce(tg.manufacturer, '') || ' '
     || coalesce(tg.model, '') || ' ' || coalesce(tg.pid_drawing, '') || ' ' || coalesce(ss.code, '')) AS search_text
FROM public.tags tg
JOIN public.projects p ON p.id = tg.project_id
LEFT JOIN public.disciplines d ON d.id = tg.discipline_id
LEFT JOIN public.equipment_types et ON et.id = tg.equipment_type_id
LEFT JOIN public.subsystems ss ON ss.id = tg.subsystem_id
LEFT JOIN public.systems s ON s.id = ss.system_id
LEFT JOIN public.areas a ON a.id = s.area_id;

REVOKE ALL ON public.tag_list_v FROM anon, public;
GRANT SELECT ON public.tag_list_v TO authenticated, service_role;

-- Pestañas por disciplina con conteo (opcionalmente acotado a un subsistema)
CREATE OR REPLACE FUNCTION public.tag_discipline_counts(p_project_id uuid, p_subsystem_id uuid DEFAULT NULL)
RETURNS TABLE(discipline_code text, discipline_name text, discipline_color text, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT d.code, d.name, d.color, count(*)::bigint
  FROM public.tags tg
  JOIN public.disciplines d ON d.id = tg.discipline_id
  WHERE tg.project_id = p_project_id
    AND (p_subsystem_id IS NULL OR tg.subsystem_id = p_subsystem_id)
  GROUP BY d.code, d.name, d.color
  ORDER BY d.code
$$;
REVOKE EXECUTE ON FUNCTION public.tag_discipline_counts(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tag_discipline_counts(uuid, uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_tags_project_tag_number ON public.tags (project_id, tag_number);

-- ── Punches ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.punch_list_v WITH (security_invoker = true) AS
SELECT
  pu.id, pu.project_id, p.org_id, p.name AS project_name, p.code AS project_code,
  pu.punch_number, pu.category, pu.description, pu.status, pu.priority,
  pu.target_date, pu.closed_date, pu.created_at, pu.itr_id, pu.assigned_to, pu.raised_by,
  rb.full_name AS raised_by_name, ab.full_name AS assigned_to_name,
  pu.discipline_id, d.code AS discipline_code, d.name AS discipline_name, d.color AS discipline_color,
  pu.tag_id, tg.tag_number, tg.description AS tag_description,
  pu.subsystem_id, ss.code AS subsystem_code, ss.name AS subsystem_name,
  ss.system_id, s.code AS system_code, s.name AS system_name,
  (pu.punch_number || ' ' || coalesce(pu.description, '') || ' ' || coalesce(tg.tag_number, '') || ' '
     || coalesce(ss.code, '') || ' ' || coalesce(ab.full_name, '') || ' ' || coalesce(p.name, '')) AS search_text
FROM public.punches pu
JOIN public.projects p ON p.id = pu.project_id
LEFT JOIN public.profiles rb ON rb.id = pu.raised_by
LEFT JOIN public.profiles ab ON ab.id = pu.assigned_to
LEFT JOIN public.disciplines d ON d.id = pu.discipline_id
LEFT JOIN public.tags tg ON tg.id = pu.tag_id
LEFT JOIN public.subsystems ss ON ss.id = pu.subsystem_id
LEFT JOIN public.systems s ON s.id = ss.system_id;

REVOKE ALL ON public.punch_list_v FROM anon, public;
GRANT SELECT ON public.punch_list_v TO authenticated, service_role;

-- Conteos categoría × estado para las tarjetas resumen
CREATE OR REPLACE FUNCTION public.punch_summary_counts(p_project_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS TABLE(category public.punch_category, status public.punch_status, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT pu.category, pu.status, count(*)::bigint
  FROM public.punches pu
  WHERE (p_project_id IS NULL OR pu.project_id = p_project_id)
    AND (p_org_id IS NULL OR pu.project_id IN (SELECT id FROM public.projects WHERE org_id = p_org_id))
  GROUP BY pu.category, pu.status
$$;
REVOKE EXECUTE ON FUNCTION public.punch_summary_counts(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.punch_summary_counts(uuid, uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_punches_project_created ON public.punches (project_id, created_at DESC);
