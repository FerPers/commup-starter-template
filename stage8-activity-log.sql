-- ============================================================
-- Stage 8 — Activity Log + Org Assets Storage
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  entity_type TEXT NOT NULL,  -- 'certificate' | 'itr' | 'punch' | 'user' | 'pssr'
  entity_id   UUID,
  action      TEXT NOT NULL,  -- 'issued' | 'approved' | 'rejected' | 'revoked' | 'invited' | etc.
  payload     JSONB,          -- additional context (before/after data)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_select" ON activity_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "activity_log_insert" ON activity_log
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_org_date
  ON activity_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON activity_log(entity_type, entity_id);

-- ============================================================
-- Storage bucket for org assets (logo)
-- Run in Supabase Dashboard → Storage → New bucket
-- OR via the SQL below (requires pg_net or Storage API):
-- ============================================================
-- NOTE: Create the bucket manually in Supabase Dashboard:
--   Name: org-assets
--   Public: true
--   File size limit: 2097152  (2 MB)
--   Allowed MIME types: image/jpeg, image/png, image/webp, image/svg+xml
--
-- Then add these Storage policies:
--   "org-assets SELECT" → public read (no auth required)
--   "org-assets INSERT" → authenticated users who are admin/owner of the org
