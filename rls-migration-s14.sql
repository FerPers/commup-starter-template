-- ============================================================
-- CommUp — RLS Migration S14
-- Auditoría completa: habilitar RLS y agregar policies en todas las tablas
-- Pegar en Supabase SQL Editor y ejecutar
-- ============================================================

-- ── NOTA IMPORTANTE ─────────────────────────────────────────
-- Las policies existentes de tablas ya procesadas (projects, tags, itrs,
-- punches) se limpian y re-crean aquí para tener un estado canónico.
-- ─────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════
-- HELPER: función para obtener org_ids del usuario actual
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_org_editor(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
      AND role IN ('owner','admin','architect','leader')
  )
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id AND om.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION is_project_editor(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin','architect','leader')
  )
$$;

-- ══════════════════════════════════════════════════════════════
-- MODULE 1 — MULTI-TENANCY (ya tiene RLS, ampliar policies)
-- ══════════════════════════════════════════════════════════════

-- organizations: ya tiene SELECT, falta INSERT/UPDATE/DELETE para owners
DROP POLICY IF EXISTS "org_members_see_own_orgs" ON organizations;
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id IN (SELECT get_my_org_ids()));

CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND org_id = id AND role = 'owner')
  );

-- org_members
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_policy" ON org_members;
CREATE POLICY "org_members_select" ON org_members
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

CREATE POLICY "org_members_insert" ON org_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND org_id = NEW.org_id AND role IN ('owner','admin'))
  );

CREATE POLICY "org_members_update" ON org_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND org_id = org_id AND role IN ('owner','admin'))
  );

CREATE POLICY "org_members_delete" ON org_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM org_members om2 WHERE om2.user_id = auth.uid() AND om2.org_id = org_members.org_id AND om2.role IN ('owner','admin'))
  );

-- profiles: ya tiene ALL
-- (sin cambios)

-- ══════════════════════════════════════════════════════════════
-- MODULE 2 — CONFIGURATION
-- ══════════════════════════════════════════════════════════════

ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_phases_select" ON project_phases
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));
CREATE POLICY "project_phases_insert" ON project_phases
  FOR INSERT WITH CHECK (is_org_editor(org_id));
CREATE POLICY "project_phases_update" ON project_phases
  FOR UPDATE USING (is_org_editor(org_id));
CREATE POLICY "project_phases_delete" ON project_phases
  FOR DELETE USING (is_org_editor(org_id));

ALTER TABLE disciplines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disciplines_select" ON disciplines
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));
CREATE POLICY "disciplines_insert" ON disciplines
  FOR INSERT WITH CHECK (is_org_editor(org_id));
CREATE POLICY "disciplines_update" ON disciplines
  FOR UPDATE USING (is_org_editor(org_id));
CREATE POLICY "disciplines_delete" ON disciplines
  FOR DELETE USING (is_org_editor(org_id));

ALTER TABLE equipment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_types_select" ON equipment_types
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));
CREATE POLICY "equipment_types_insert" ON equipment_types
  FOR INSERT WITH CHECK (is_org_editor(org_id));
CREATE POLICY "equipment_types_update" ON equipment_types
  FOR UPDATE USING (is_org_editor(org_id));
CREATE POLICY "equipment_types_delete" ON equipment_types
  FOR DELETE USING (is_org_editor(org_id));

-- ══════════════════════════════════════════════════════════════
-- MODULE 3 — PROJECT HIERARCHY
-- ══════════════════════════════════════════════════════════════

-- projects: ya tiene SELECT + DELETE (S12). Agregar INSERT/UPDATE
DROP POLICY IF EXISTS "members_see_org_projects" ON projects;
DROP POLICY IF EXISTS "org_owners_can_delete_projects" ON projects;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND org_id = NEW.org_id AND role IN ('owner','admin','architect'))
  );

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND org_id = projects.org_id AND role IN ('owner','admin','architect'))
  );

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND org_id = projects.org_id AND role IN ('owner','admin'))
  );

-- areas
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "areas_select" ON areas
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "areas_insert" ON areas
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "areas_update" ON areas
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "areas_delete" ON areas
  FOR DELETE USING (is_project_editor(project_id));

-- systems
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "systems_select" ON systems
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "systems_insert" ON systems
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "systems_update" ON systems
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "systems_delete" ON systems
  FOR DELETE USING (is_project_editor(project_id));

-- subsystems
ALTER TABLE subsystems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subsystems_select" ON subsystems
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "subsystems_insert" ON subsystems
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "subsystems_update" ON subsystems
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "subsystems_delete" ON subsystems
  FOR DELETE USING (is_project_editor(project_id));

-- ══════════════════════════════════════════════════════════════
-- MODULE 4 — TAGS & ASSETS
-- ══════════════════════════════════════════════════════════════

-- tags: ya tiene SELECT+INSERT+UPDATE+DELETE (S13). Re-crear canónico.
DROP POLICY IF EXISTS "tags_select" ON tags;
DROP POLICY IF EXISTS "tags_insert" ON tags;
DROP POLICY IF EXISTS "tags_update" ON tags;
DROP POLICY IF EXISTS "tags_delete" ON tags;
DROP POLICY IF EXISTS "tags_insert_update_delete_policies" ON tags;

CREATE POLICY "tags_select" ON tags
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "tags_insert" ON tags
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "tags_update" ON tags
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "tags_delete" ON tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = tags.project_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin','architect')
    )
  );

-- cables
ALTER TABLE cables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cables_select" ON cables
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "cables_write" ON cables
  FOR ALL USING (is_project_editor(project_id));

-- signals (via tag → project)
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signals_select" ON signals
  FOR SELECT USING (
    tag_id IN (SELECT id FROM tags WHERE is_project_member(project_id))
  );
CREATE POLICY "signals_write" ON signals
  FOR ALL USING (
    tag_id IN (SELECT id FROM tags WHERE is_project_editor(project_id))
  );

-- loops
ALTER TABLE loops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loops_select" ON loops
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "loops_write" ON loops
  FOR ALL USING (is_project_editor(project_id));

-- loop_tags (via loop → project)
ALTER TABLE loop_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loop_tags_select" ON loop_tags
  FOR SELECT USING (
    loop_id IN (SELECT id FROM loops WHERE is_project_member(project_id))
  );
CREATE POLICY "loop_tags_write" ON loop_tags
  FOR ALL USING (
    loop_id IN (SELECT id FROM loops WHERE is_project_editor(project_id))
  );

-- interlocks
ALTER TABLE interlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interlocks_select" ON interlocks
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "interlocks_write" ON interlocks
  FOR ALL USING (is_project_editor(project_id));

-- ══════════════════════════════════════════════════════════════
-- MODULE 5 — PRESERVATION
-- ══════════════════════════════════════════════════════════════

-- preservation_procedures (org-scoped)
ALTER TABLE preservation_procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preservation_procedures_select" ON preservation_procedures
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));
CREATE POLICY "preservation_procedures_insert" ON preservation_procedures
  FOR INSERT WITH CHECK (is_org_editor(org_id));
CREATE POLICY "preservation_procedures_update" ON preservation_procedures
  FOR UPDATE USING (is_org_editor(org_id));
CREATE POLICY "preservation_procedures_delete" ON preservation_procedures
  FOR DELETE USING (is_org_editor(org_id));

-- preservation_plans (project-scoped)
ALTER TABLE preservation_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preservation_plans_select" ON preservation_plans
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "preservation_plans_insert" ON preservation_plans
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "preservation_plans_update" ON preservation_plans
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "preservation_plans_delete" ON preservation_plans
  FOR DELETE USING (is_project_editor(project_id));

-- preservation_records (project-scoped via tag)
ALTER TABLE preservation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preservation_records_select" ON preservation_records
  FOR SELECT USING (is_project_member(
    (SELECT project_id FROM preservation_plans WHERE id = plan_id)
  ));
-- Cualquier miembro puede registrar (inspectors también)
CREATE POLICY "preservation_records_insert" ON preservation_records
  FOR INSERT WITH CHECK (is_project_member(
    (SELECT project_id FROM preservation_plans WHERE id = NEW.plan_id)
  ));
CREATE POLICY "preservation_records_update" ON preservation_records
  FOR UPDATE USING (is_project_editor(
    (SELECT project_id FROM preservation_plans WHERE id = plan_id)
  ));
CREATE POLICY "preservation_records_delete" ON preservation_records
  FOR DELETE USING (is_project_editor(
    (SELECT project_id FROM preservation_plans WHERE id = plan_id)
  ));

-- preservation_attachments (via record → plan → project)
ALTER TABLE preservation_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preservation_attachments_select" ON preservation_attachments
  FOR SELECT USING (
    record_id IN (
      SELECT pr.id FROM preservation_records pr
      JOIN preservation_plans pp ON pp.id = pr.plan_id
      WHERE is_project_member(pp.project_id)
    )
  );
CREATE POLICY "preservation_attachments_insert" ON preservation_attachments
  FOR INSERT WITH CHECK (
    NEW.record_id IN (
      SELECT pr.id FROM preservation_records pr
      JOIN preservation_plans pp ON pp.id = pr.plan_id
      WHERE is_project_member(pp.project_id)
    )
  );
CREATE POLICY "preservation_attachments_delete" ON preservation_attachments
  FOR DELETE USING (
    record_id IN (
      SELECT pr.id FROM preservation_records pr
      JOIN preservation_plans pp ON pp.id = pr.plan_id
      WHERE is_project_editor(pp.project_id)
    )
  );

-- ══════════════════════════════════════════════════════════════
-- MODULE 6 — ITR TEMPLATES
-- ══════════════════════════════════════════════════════════════

-- itr_templates (org-scoped)
ALTER TABLE itr_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itr_templates_select" ON itr_templates
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));
CREATE POLICY "itr_templates_insert" ON itr_templates
  FOR INSERT WITH CHECK (is_org_editor(org_id));
CREATE POLICY "itr_templates_update" ON itr_templates
  FOR UPDATE USING (is_org_editor(org_id));
CREATE POLICY "itr_templates_delete" ON itr_templates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND org_id = itr_templates.org_id AND role IN ('owner','admin','architect'))
  );

-- itr_template_sections (via template → org)
ALTER TABLE itr_template_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itr_template_sections_select" ON itr_template_sections
  FOR SELECT USING (
    template_id IN (SELECT id FROM itr_templates WHERE org_id IN (SELECT get_my_org_ids()))
  );
CREATE POLICY "itr_template_sections_write" ON itr_template_sections
  FOR ALL USING (
    template_id IN (SELECT id FROM itr_templates WHERE is_org_editor(org_id))
  );

-- itr_template_items (via template → org)
ALTER TABLE itr_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itr_template_items_select" ON itr_template_items
  FOR SELECT USING (
    template_id IN (SELECT id FROM itr_templates WHERE org_id IN (SELECT get_my_org_ids()))
  );
CREATE POLICY "itr_template_items_write" ON itr_template_items
  FOR ALL USING (
    template_id IN (SELECT id FROM itr_templates WHERE is_org_editor(org_id))
  );

-- ══════════════════════════════════════════════════════════════
-- MODULE 7 — ITR INSTANCES
-- ══════════════════════════════════════════════════════════════

-- itrs: ya tiene RLS habilitado. Re-crear canónico.
DROP POLICY IF EXISTS "itrs_select" ON itrs;
DROP POLICY IF EXISTS "itrs_insert" ON itrs;
DROP POLICY IF EXISTS "itrs_update" ON itrs;
DROP POLICY IF EXISTS "itrs_delete" ON itrs;

CREATE POLICY "itrs_select" ON itrs
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "itrs_insert" ON itrs
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "itrs_update" ON itrs
  FOR UPDATE USING (is_project_member(project_id));  -- cualquier miembro actualiza progreso
CREATE POLICY "itrs_delete" ON itrs
  FOR DELETE USING (is_project_editor(project_id));

-- itr_assignments
ALTER TABLE itr_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itr_assignments_select" ON itr_assignments
  FOR SELECT USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_assignments_insert" ON itr_assignments
  FOR INSERT WITH CHECK (
    NEW.itr_id IN (SELECT id FROM itrs WHERE is_project_editor(project_id))
  );
CREATE POLICY "itr_assignments_update" ON itr_assignments
  FOR UPDATE USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_editor(project_id))
  );
CREATE POLICY "itr_assignments_delete" ON itr_assignments
  FOR DELETE USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_editor(project_id))
  );

-- itr_responses (cualquier miembro puede responder)
ALTER TABLE itr_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itr_responses_select" ON itr_responses
  FOR SELECT USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_responses_insert" ON itr_responses
  FOR INSERT WITH CHECK (
    NEW.itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_responses_update" ON itr_responses
  FOR UPDATE USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_responses_delete" ON itr_responses
  FOR DELETE USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_editor(project_id))
  );

-- itr_signatures
ALTER TABLE itr_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itr_signatures_select" ON itr_signatures
  FOR SELECT USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_signatures_insert" ON itr_signatures
  FOR INSERT WITH CHECK (
    NEW.itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_signatures_delete" ON itr_signatures
  FOR DELETE USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_editor(project_id))
  );

-- itr_attachments
ALTER TABLE itr_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itr_attachments_select" ON itr_attachments
  FOR SELECT USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_attachments_insert" ON itr_attachments
  FOR INSERT WITH CHECK (
    NEW.itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );
CREATE POLICY "itr_attachments_delete" ON itr_attachments
  FOR DELETE USING (
    itr_id IN (SELECT id FROM itrs WHERE is_project_member(project_id))
  );

-- ══════════════════════════════════════════════════════════════
-- MODULE 8 — PUNCH LIST
-- ══════════════════════════════════════════════════════════════

-- punches: ya tiene RLS habilitado. Re-crear canónico.
DROP POLICY IF EXISTS "punches_select" ON punches;
DROP POLICY IF EXISTS "punches_insert" ON punches;
DROP POLICY IF EXISTS "punches_update" ON punches;
DROP POLICY IF EXISTS "punches_delete" ON punches;

CREATE POLICY "punches_select" ON punches
  FOR SELECT USING (is_project_member(project_id));
-- inspectors pueden crear punches
CREATE POLICY "punches_insert" ON punches
  FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "punches_update" ON punches
  FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "punches_delete" ON punches
  FOR DELETE USING (is_project_editor(project_id));

-- punch_comments
ALTER TABLE punch_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "punch_comments_select" ON punch_comments
  FOR SELECT USING (
    punch_id IN (SELECT id FROM punches WHERE is_project_member(project_id))
  );
CREATE POLICY "punch_comments_insert" ON punch_comments
  FOR INSERT WITH CHECK (
    NEW.punch_id IN (SELECT id FROM punches WHERE is_project_member(project_id))
  );
CREATE POLICY "punch_comments_delete" ON punch_comments
  FOR DELETE USING (user_id = auth.uid());

-- punch_attachments
ALTER TABLE punch_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "punch_attachments_select" ON punch_attachments
  FOR SELECT USING (
    punch_id IN (SELECT id FROM punches WHERE is_project_member(project_id))
  );
CREATE POLICY "punch_attachments_insert" ON punch_attachments
  FOR INSERT WITH CHECK (
    NEW.punch_id IN (SELECT id FROM punches WHERE is_project_member(project_id))
  );
CREATE POLICY "punch_attachments_delete" ON punch_attachments
  FOR DELETE USING (
    punch_id IN (SELECT id FROM punches WHERE is_project_editor(project_id))
  );

-- ══════════════════════════════════════════════════════════════
-- MODULE 9 — CERTIFICATES
-- ══════════════════════════════════════════════════════════════

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certificates_select" ON certificates
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "certificates_insert" ON certificates
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "certificates_update" ON certificates
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "certificates_delete" ON certificates
  FOR DELETE USING (is_project_editor(project_id));

-- certificate_punch_exceptions
ALTER TABLE certificate_punch_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cert_punch_exceptions_select" ON certificate_punch_exceptions
  FOR SELECT USING (
    certificate_id IN (SELECT id FROM certificates WHERE is_project_member(project_id))
  );
CREATE POLICY "cert_punch_exceptions_insert" ON certificate_punch_exceptions
  FOR INSERT WITH CHECK (
    NEW.certificate_id IN (SELECT id FROM certificates WHERE is_project_editor(project_id))
  );
CREATE POLICY "cert_punch_exceptions_delete" ON certificate_punch_exceptions
  FOR DELETE USING (
    certificate_id IN (SELECT id FROM certificates WHERE is_project_editor(project_id))
  );

-- ══════════════════════════════════════════════════════════════
-- MODULE 10 — WORK PLANS & KPIs
-- ══════════════════════════════════════════════════════════════

ALTER TABLE work_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_plans_select" ON work_plans
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "work_plans_insert" ON work_plans
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "work_plans_update" ON work_plans
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "work_plans_delete" ON work_plans
  FOR DELETE USING (is_project_editor(project_id));

-- work_plan_items (via work_plan → project)
ALTER TABLE work_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_plan_items_select" ON work_plan_items
  FOR SELECT USING (
    work_plan_id IN (SELECT id FROM work_plans WHERE is_project_member(project_id))
  );
CREATE POLICY "work_plan_items_insert" ON work_plan_items
  FOR INSERT WITH CHECK (
    NEW.work_plan_id IN (SELECT id FROM work_plans WHERE is_project_editor(project_id))
  );
CREATE POLICY "work_plan_items_update" ON work_plan_items
  FOR UPDATE USING (
    work_plan_id IN (SELECT id FROM work_plans WHERE is_project_member(project_id))
  );
CREATE POLICY "work_plan_items_delete" ON work_plan_items
  FOR DELETE USING (
    work_plan_id IN (SELECT id FROM work_plans WHERE is_project_editor(project_id))
  );

-- kpi_snapshots (solo lectura para usuarios; escritura por system/service role)
ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_snapshots_select" ON kpi_snapshots
  FOR SELECT USING (is_project_member(project_id));

-- ══════════════════════════════════════════════════════════════
-- P&ID DOCUMENTS (tabla creada fuera del schema principal)
-- ══════════════════════════════════════════════════════════════
-- VERIFICAR que la tabla existe antes de ejecutar:
-- SELECT to_regclass('public.pid_documents');

ALTER TABLE pid_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pid_documents_select" ON pid_documents
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "pid_documents_insert" ON pid_documents
  FOR INSERT WITH CHECK (is_project_editor(project_id));
CREATE POLICY "pid_documents_update" ON pid_documents
  FOR UPDATE USING (is_project_editor(project_id));
CREATE POLICY "pid_documents_delete" ON pid_documents
  FOR DELETE USING (is_project_editor(project_id));

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN (ejecutar después para confirmar estado)
-- ══════════════════════════════════════════════════════════════
/*
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Tablas con RLS habilitado:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
*/
