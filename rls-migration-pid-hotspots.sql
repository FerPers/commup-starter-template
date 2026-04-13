-- ============================================================
-- Migration: RLS for pid_hotspots
-- Apply this in Supabase SQL Editor (or as a migration file)
-- ============================================================

-- Step 1: Enable RLS (idempotent)
ALTER TABLE pid_hotspots ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop policies if they already exist (idempotent re-run safety)
DROP POLICY IF EXISTS "pid_hotspots_select" ON pid_hotspots;
DROP POLICY IF EXISTS "pid_hotspots_insert" ON pid_hotspots;
DROP POLICY IF EXISTS "pid_hotspots_update" ON pid_hotspots;
DROP POLICY IF EXISTS "pid_hotspots_delete" ON pid_hotspots;

-- Step 3: Recreate policies
-- SELECT: any project member can view hotspots
CREATE POLICY "pid_hotspots_select" ON pid_hotspots
  FOR SELECT USING (is_project_member(project_id));

-- INSERT: project editors only (owner / admin / architect / leader)
CREATE POLICY "pid_hotspots_insert" ON pid_hotspots
  FOR INSERT WITH CHECK (is_project_editor(project_id));

-- UPDATE: project editors only
CREATE POLICY "pid_hotspots_update" ON pid_hotspots
  FOR UPDATE USING (is_project_editor(project_id));

-- DELETE: project editor OR the user who created the hotspot
CREATE POLICY "pid_hotspots_delete" ON pid_hotspots
  FOR DELETE USING (
    is_project_editor(project_id)
    OR created_by = auth.uid()
  );
