-- ══════════════════════════════════════════════════════════════
-- Stage 10.1 — RLS completo (cierre de gaps)
-- ══════════════════════════════════════════════════════════════
-- Audita: policies faltantes en tablas con RLS enabled pero
-- cobertura parcial/nula. NO toca tablas con UPDATE intencionalmente
-- bloqueado (patrón audit/inmutable).
-- ══════════════════════════════════════════════════════════════

-- ── 1. profiles ───────────────────────────────────────────────
-- Hoy: RLS ON, 0 policies → todo bloqueado salvo service-role.
-- Solo acceso al propio perfil; nombres de otros se resuelven
-- server-side (service-role) para UI.

DROP POLICY IF EXISTS "profiles_select_self" ON profiles;
CREATE POLICY "profiles_select_self" ON profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ── 2. preservation_procedure_items ───────────────────────────
-- Child de preservation_procedures (org-scoped). Mismas reglas
-- que el padre.

DROP POLICY IF EXISTS "pres_proc_items_select" ON preservation_procedure_items;
CREATE POLICY "pres_proc_items_select" ON preservation_procedure_items
  FOR SELECT USING (
    procedure_id IN (
      SELECT id FROM preservation_procedures
      WHERE org_id IN (SELECT get_my_org_ids())
    )
  );

DROP POLICY IF EXISTS "pres_proc_items_insert" ON preservation_procedure_items;
CREATE POLICY "pres_proc_items_insert" ON preservation_procedure_items
  FOR INSERT WITH CHECK (
    procedure_id IN (
      SELECT id FROM preservation_procedures WHERE is_org_editor(org_id)
    )
  );

DROP POLICY IF EXISTS "pres_proc_items_update" ON preservation_procedure_items;
CREATE POLICY "pres_proc_items_update" ON preservation_procedure_items
  FOR UPDATE USING (
    procedure_id IN (
      SELECT id FROM preservation_procedures WHERE is_org_editor(org_id)
    )
  );

DROP POLICY IF EXISTS "pres_proc_items_delete" ON preservation_procedure_items;
CREATE POLICY "pres_proc_items_delete" ON preservation_procedure_items
  FOR DELETE USING (
    procedure_id IN (
      SELECT id FROM preservation_procedures WHERE is_org_editor(org_id)
    )
  );

-- ── 3. preservation_record_responses ──────────────────────────
-- Child de preservation_records (project-scoped vía plan).

DROP POLICY IF EXISTS "pres_rec_resp_select" ON preservation_record_responses;
CREATE POLICY "pres_rec_resp_select" ON preservation_record_responses
  FOR SELECT USING (
    record_id IN (
      SELECT pr.id
      FROM preservation_records pr
      JOIN preservation_plans pp ON pp.id = pr.plan_id
      WHERE is_project_member(pp.project_id)
    )
  );

DROP POLICY IF EXISTS "pres_rec_resp_insert" ON preservation_record_responses;
CREATE POLICY "pres_rec_resp_insert" ON preservation_record_responses
  FOR INSERT WITH CHECK (
    record_id IN (
      SELECT pr.id
      FROM preservation_records pr
      JOIN preservation_plans pp ON pp.id = pr.plan_id
      WHERE is_project_member(pp.project_id)
    )
  );

DROP POLICY IF EXISTS "pres_rec_resp_update" ON preservation_record_responses;
CREATE POLICY "pres_rec_resp_update" ON preservation_record_responses
  FOR UPDATE USING (
    record_id IN (
      SELECT pr.id
      FROM preservation_records pr
      JOIN preservation_plans pp ON pp.id = pr.plan_id
      WHERE is_project_editor(pp.project_id)
    )
  );

DROP POLICY IF EXISTS "pres_rec_resp_delete" ON preservation_record_responses;
CREATE POLICY "pres_rec_resp_delete" ON preservation_record_responses
  FOR DELETE USING (
    record_id IN (
      SELECT pr.id
      FROM preservation_records pr
      JOIN preservation_plans pp ON pp.id = pr.plan_id
      WHERE is_project_editor(pp.project_id)
    )
  );

-- ── 4. punch_counters ─────────────────────────────────────────
-- Escrito por trigger SECURITY DEFINER (bypass RLS). Solo
-- permitimos SELECT a miembros del proyecto; writes quedan
-- denegados desde cliente, permitidos vía trigger.

DROP POLICY IF EXISTS "punch_counters_select" ON punch_counters;
CREATE POLICY "punch_counters_select" ON punch_counters
  FOR SELECT USING (is_project_member(project_id));

-- ── 5. kpi_snapshots ──────────────────────────────────────────
-- Ya tiene SELECT. Agregar writes (editores del proyecto).

DROP POLICY IF EXISTS "kpi_snapshots_insert" ON kpi_snapshots;
CREATE POLICY "kpi_snapshots_insert" ON kpi_snapshots
  FOR INSERT WITH CHECK (is_project_editor(project_id));

DROP POLICY IF EXISTS "kpi_snapshots_update" ON kpi_snapshots;
CREATE POLICY "kpi_snapshots_update" ON kpi_snapshots
  FOR UPDATE USING (is_project_editor(project_id));

DROP POLICY IF EXISTS "kpi_snapshots_delete" ON kpi_snapshots;
CREATE POLICY "kpi_snapshots_delete" ON kpi_snapshots
  FOR DELETE USING (is_project_editor(project_id));

-- ── 6. organizations — fix bug + completar ops ────────────────
-- BUG actual en org_update: "org_members.org_id = org_members.id"
-- (self-join erróneo → siempre falso, owners no pueden editar).

DROP POLICY IF EXISTS "org_update" ON organizations;
CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.org_id  = organizations.id
        AND org_members.role    = 'owner'::org_member_role
    )
  );

DROP POLICY IF EXISTS "org_insert" ON organizations;
CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "org_delete" ON organizations;
CREATE POLICY "org_delete" ON organizations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.org_id  = organizations.id
        AND org_members.role    = 'owner'::org_member_role
    )
  );
