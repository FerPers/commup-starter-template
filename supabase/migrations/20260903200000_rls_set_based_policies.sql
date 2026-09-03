-- Sprint E (2026-09-03): políticas RLS "set-based" para tablas de proyecto.
-- Hallazgo de la prueba de carga (50k tags / 250k ITRs): `is_project_member(project_id)`
-- es SECURITY DEFINER (no inlinable) y se evaluaba FILA POR FILA → un conteo de ITRs
-- tardaba 5,3 s y subsystem_rollup 6,9 s bajo RLS. Con `project_id IN (SELECT get_my_project_ids())`
-- el planificador evalúa el conjunto UNA vez (hashed subplan) y filtra por hash.

CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.get_my_editor_project_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid() AND om.role IN ('owner','admin','architect','leader')
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_project_ids() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_editor_project_ids() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_project_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_editor_project_ids() TO authenticated, service_role;

-- ── Tablas con project_id directo ────────────────────────────────────────
-- SELECT (miembro)
DROP POLICY IF EXISTS tags_select ON public.tags;
CREATE POLICY tags_select ON public.tags FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS itrs_select ON public.itrs;
CREATE POLICY itrs_select ON public.itrs FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS punches_select ON public.punches;
CREATE POLICY punches_select ON public.punches FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS subsystems_select ON public.subsystems;
CREATE POLICY subsystems_select ON public.subsystems FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS systems_select ON public.systems;
CREATE POLICY systems_select ON public.systems FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS areas_select ON public.areas;
CREATE POLICY areas_select ON public.areas FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS certificates_select ON public.certificates;
CREATE POLICY certificates_select ON public.certificates FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS domain_events_select ON public.domain_events;
CREATE POLICY domain_events_select ON public.domain_events FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS interlocks_select ON public.interlocks;
CREATE POLICY interlocks_select ON public.interlocks FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS loops_select ON public.loops;
CREATE POLICY loops_select ON public.loops FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS kpi_snapshots_select ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_select ON public.kpi_snapshots FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS preservation_plans_select ON public.preservation_plans;
CREATE POLICY preservation_plans_select ON public.preservation_plans FOR SELECT USING (project_id IN (SELECT public.get_my_project_ids()));

-- UPDATE (miembro) en itrs y punches (ejecución de campo)
DROP POLICY IF EXISTS itrs_update ON public.itrs;
CREATE POLICY itrs_update ON public.itrs FOR UPDATE USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS punches_update ON public.punches;
CREATE POLICY punches_update ON public.punches FOR UPDATE USING (project_id IN (SELECT public.get_my_project_ids()));
DROP POLICY IF EXISTS punches_insert ON public.punches;
CREATE POLICY punches_insert ON public.punches FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_project_ids()));

-- Editor (insert/update/delete) — mismo patrón con el conjunto de editor
DROP POLICY IF EXISTS itrs_insert ON public.itrs;
CREATE POLICY itrs_insert ON public.itrs FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS itrs_delete ON public.itrs;
CREATE POLICY itrs_delete ON public.itrs FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS punches_delete ON public.punches;
CREATE POLICY punches_delete ON public.punches FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS tags_insert ON public.tags;
CREATE POLICY tags_insert ON public.tags FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS tags_update ON public.tags;
CREATE POLICY tags_update ON public.tags FOR UPDATE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS subsystems_insert ON public.subsystems;
CREATE POLICY subsystems_insert ON public.subsystems FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS subsystems_update ON public.subsystems;
CREATE POLICY subsystems_update ON public.subsystems FOR UPDATE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS subsystems_delete ON public.subsystems;
CREATE POLICY subsystems_delete ON public.subsystems FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS systems_insert ON public.systems;
CREATE POLICY systems_insert ON public.systems FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS systems_update ON public.systems;
CREATE POLICY systems_update ON public.systems FOR UPDATE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS systems_delete ON public.systems;
CREATE POLICY systems_delete ON public.systems FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS areas_insert ON public.areas;
CREATE POLICY areas_insert ON public.areas FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS areas_update ON public.areas;
CREATE POLICY areas_update ON public.areas FOR UPDATE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS areas_delete ON public.areas;
CREATE POLICY areas_delete ON public.areas FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS certificates_insert ON public.certificates;
CREATE POLICY certificates_insert ON public.certificates FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS certificates_update ON public.certificates;
CREATE POLICY certificates_update ON public.certificates FOR UPDATE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS certificates_delete ON public.certificates;
CREATE POLICY certificates_delete ON public.certificates FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS kpi_snapshots_insert ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_insert ON public.kpi_snapshots FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS kpi_snapshots_update ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_update ON public.kpi_snapshots FOR UPDATE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS kpi_snapshots_delete ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_delete ON public.kpi_snapshots FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS preservation_plans_insert ON public.preservation_plans;
CREATE POLICY preservation_plans_insert ON public.preservation_plans FOR INSERT WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS preservation_plans_update ON public.preservation_plans;
CREATE POLICY preservation_plans_update ON public.preservation_plans FOR UPDATE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS preservation_plans_delete ON public.preservation_plans;
CREATE POLICY preservation_plans_delete ON public.preservation_plans FOR DELETE USING (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS loops_write ON public.loops;
CREATE POLICY loops_write ON public.loops FOR ALL USING (project_id IN (SELECT public.get_my_editor_project_ids())) WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
DROP POLICY IF EXISTS interlocks_write ON public.interlocks;
CREATE POLICY interlocks_write ON public.interlocks FOR ALL USING (project_id IN (SELECT public.get_my_editor_project_ids())) WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));

-- ── Tablas hijas (por itr_id / tag_id / punch_id / plan_id): EXISTS correlacionado por PK ──
DROP POLICY IF EXISTS itr_assignments_select ON public.itr_assignments;
CREATE POLICY itr_assignments_select ON public.itr_assignments FOR SELECT USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_assignments_insert ON public.itr_assignments;
CREATE POLICY itr_assignments_insert ON public.itr_assignments FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_editor_project_ids())));
DROP POLICY IF EXISTS itr_assignments_update ON public.itr_assignments;
CREATE POLICY itr_assignments_update ON public.itr_assignments FOR UPDATE USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_editor_project_ids())));
DROP POLICY IF EXISTS itr_assignments_delete ON public.itr_assignments;
CREATE POLICY itr_assignments_delete ON public.itr_assignments FOR DELETE USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_editor_project_ids())));

DROP POLICY IF EXISTS itr_signatures_select ON public.itr_signatures;
CREATE POLICY itr_signatures_select ON public.itr_signatures FOR SELECT USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_signatures_insert ON public.itr_signatures;
CREATE POLICY itr_signatures_insert ON public.itr_signatures FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_signatures_delete ON public.itr_signatures;
CREATE POLICY itr_signatures_delete ON public.itr_signatures FOR DELETE USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_editor_project_ids())));

DROP POLICY IF EXISTS itr_responses_select ON public.itr_responses;
CREATE POLICY itr_responses_select ON public.itr_responses FOR SELECT USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_responses_insert ON public.itr_responses;
CREATE POLICY itr_responses_insert ON public.itr_responses FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_responses_update ON public.itr_responses;
CREATE POLICY itr_responses_update ON public.itr_responses FOR UPDATE USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_responses_delete ON public.itr_responses;
CREATE POLICY itr_responses_delete ON public.itr_responses FOR DELETE USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_editor_project_ids())));

DROP POLICY IF EXISTS itr_attachments_select ON public.itr_attachments;
CREATE POLICY itr_attachments_select ON public.itr_attachments FOR SELECT USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_attachments_insert ON public.itr_attachments;
CREATE POLICY itr_attachments_insert ON public.itr_attachments FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS itr_attachments_delete ON public.itr_attachments;
CREATE POLICY itr_attachments_delete ON public.itr_attachments FOR DELETE USING (EXISTS (SELECT 1 FROM public.itrs i WHERE i.id = itr_id AND i.project_id IN (SELECT public.get_my_project_ids())));

DROP POLICY IF EXISTS signals_select ON public.signals;
CREATE POLICY signals_select ON public.signals FOR SELECT USING (EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS signals_write ON public.signals;
CREATE POLICY signals_write ON public.signals FOR ALL USING (EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.project_id IN (SELECT public.get_my_editor_project_ids()))) WITH CHECK (EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.project_id IN (SELECT public.get_my_editor_project_ids())));

DROP POLICY IF EXISTS punch_comments_select ON public.punch_comments;
CREATE POLICY punch_comments_select ON public.punch_comments FOR SELECT USING (EXISTS (SELECT 1 FROM public.punches pu WHERE pu.id = punch_id AND pu.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS punch_comments_insert ON public.punch_comments;
CREATE POLICY punch_comments_insert ON public.punch_comments FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.punches pu WHERE pu.id = punch_id AND pu.project_id IN (SELECT public.get_my_project_ids())));

DROP POLICY IF EXISTS preservation_records_select ON public.preservation_records;
CREATE POLICY preservation_records_select ON public.preservation_records FOR SELECT USING (EXISTS (SELECT 1 FROM public.preservation_plans pp WHERE pp.id = plan_id AND pp.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS preservation_records_insert ON public.preservation_records;
CREATE POLICY preservation_records_insert ON public.preservation_records FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.preservation_plans pp WHERE pp.id = plan_id AND pp.project_id IN (SELECT public.get_my_project_ids())));
DROP POLICY IF EXISTS preservation_records_update ON public.preservation_records;
CREATE POLICY preservation_records_update ON public.preservation_records FOR UPDATE USING (EXISTS (SELECT 1 FROM public.preservation_plans pp WHERE pp.id = plan_id AND pp.project_id IN (SELECT public.get_my_editor_project_ids())));
DROP POLICY IF EXISTS preservation_records_delete ON public.preservation_records;
CREATE POLICY preservation_records_delete ON public.preservation_records FOR DELETE USING (EXISTS (SELECT 1 FROM public.preservation_plans pp WHERE pp.id = plan_id AND pp.project_id IN (SELECT public.get_my_editor_project_ids())));

-- ── Búsqueda: índices trigram para ilike en columnas base ─────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_tags_tag_number_trgm ON public.tags USING gin (tag_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tags_description_trgm ON public.tags USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_itrs_itr_number_trgm ON public.itrs USING gin (itr_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_punches_punch_number_trgm ON public.punches USING gin (punch_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_punches_description_trgm ON public.punches USING gin (description gin_trgm_ops);
