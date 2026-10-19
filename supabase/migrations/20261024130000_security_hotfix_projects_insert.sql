-- Hotfix de seguridad (revisión integral 2026-10-19, hallazgo I-13; verificado en prod): la política projects_insert
-- comparaba org_members.org_id consigo misma, así que un owner/admin/architect de CUALQUIER org podía insertar
-- proyectos en otra org conociendo su id. Se compara con la org de la fila nueva.
DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert ON public.projects FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.org_id = projects.org_id
      AND om.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role, 'architect'::org_member_role])));
