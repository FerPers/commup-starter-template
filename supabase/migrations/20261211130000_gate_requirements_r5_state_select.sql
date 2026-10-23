-- R5 (corrección): compute_system_gates_upto corre como el usuario (SECURITY INVOKER) y el criterio
-- requirements_generated lee tag_requirement_state para marcar `stale`; sin permiso de lectura, la ficha del sistema
-- y la matriz de liberación fallaban con «permission denied for table tag_requirement_state» (42501).
-- Misma regla que tag_requirement_rows: lectura para los miembros del proyecto; escribir sigue siendo solo de las
-- funciones internas y service_role.

CREATE POLICY tag_requirement_state_select ON public.tag_requirement_state FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
GRANT SELECT ON public.tag_requirement_state TO authenticated;
