-- S09 (2026-10-19) — índices de FK y filtros calientes (B-05, B-09) y limpieza de redundantes (B-27).
--
-- SIN TRANSACCIÓN: CREATE/DROP INDEX CONCURRENTLY no corre dentro de BEGIN … COMMIT. Se aplica una
-- sentencia por vez (`supabase db query --linked` por línea) y después se registra la versión en
-- supabase_migrations.schema_migrations. Todas son idempotentes (IF [NOT] EXISTS): si una falla a mitad,
-- se reintenta el archivo; un índice que quedó INVALID se borra con DROP INDEX CONCURRENTLY y se repite.

-- B-05: FKs y filtros sin índice
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user ON public.org_members (user_id, org_id) INCLUDE (role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subsystems_system ON public.subsystems (system_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_systems_area ON public.systems (area_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_punches_tag ON public.punches (tag_id) WHERE tag_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_punches_itr ON public.punches (itr_id) WHERE itr_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_punches_assigned_open ON public.punches (assigned_to) WHERE status IN ('open', 'in_progress');
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_itr_assignments_user ON public.itr_assignments (user_id, role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_itr_attachments_itr ON public.itr_attachments (itr_id, item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_punch_attachments_punch ON public.punch_attachments (punch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_punch_comments_punch ON public.punch_comments (punch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_ss_phase ON public.certificates (subsystem_id, phase_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_system ON public.certificates (system_id) WHERE system_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_itrs_template ON public.itrs (template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_itr_tpl_items_template ON public.itr_template_items (template_id, section_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_itr_tpl_sections_template ON public.itr_template_sections (template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wpi_plan ON public.work_plan_items (work_plan_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wpi_itr ON public.work_plan_items (itr_id) WHERE itr_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wpi_assignee_open ON public.work_plan_items (assigned_to) WHERE status IN ('not_started', 'in_progress');
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_plans_project ON public.work_plans (project_id, plan_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pssr_reviews_system ON public.pssr_reviews (system_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pssr_review_items_review ON public.pssr_review_items (review_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pres_records_tag ON public.preservation_records (tag_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pres_plans_project ON public.preservation_plans (project_id, status, next_due_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pres_attach_record ON public.preservation_attachments (record_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loop_tags_tag ON public.loop_tags (tag_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cables_from_tag ON public.cables (from_tag_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cables_to_tag ON public.cables (to_tag_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_itrs_project_completed ON public.itrs (project_id, completed_date) WHERE completed_date IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_punches_project_closed ON public.punches (project_id, closed_date) WHERE closed_date IS NOT NULL;

-- B-27: duplicados exactos y prefijos cubiertos (idx_scan = 0 o cubiertos por otro índice en prod, 2026-10-19)
DROP INDEX CONCURRENTLY IF EXISTS public.api_keys_hash_idx;       -- = api_keys_key_hash_key (UNIQUE)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_api_keys_hash;       -- = api_keys_key_hash_key (UNIQUE)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_api_keys_org;        -- = api_keys_org_idx
DROP INDEX CONCURRENTLY IF EXISTS public.idx_tags_project_tag_number;  -- = tags_project_id_tag_number_key (UNIQUE)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_itrs_project;        -- prefijo de idx_itrs_project_phase_status / _created
DROP INDEX CONCURRENTLY IF EXISTS public.idx_punches_project;     -- prefijo de idx_punches_project_created
DROP INDEX CONCURRENTLY IF EXISTS public.idx_punches_subsystem;   -- prefijo de idx_punches_subsystem_status
DROP INDEX CONCURRENTLY IF EXISTS public.idx_itrs_status;         -- baja selectividad, 0 scans
DROP INDEX CONCURRENTLY IF EXISTS public.idx_punches_status;      -- baja selectividad, 0 scans
DROP INDEX CONCURRENTLY IF EXISTS public.idx_punches_category;    -- baja selectividad, 0 scans
