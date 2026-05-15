-- ============================================================
-- Stage 17 — activity_log table (idempotent)
-- Run in Supabase SQL editor
--
-- Origin: stage8-activity-log.sql was authored but never applied in
-- prod (sesión 16 audit). Helper `logActivity` (src/lib/log-activity.ts)
-- has been firing fire-and-forget INSERTs that silently fail against
-- the missing table. This migration creates the table + RLS + indexes
-- so the audit trail starts persisting.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  action      TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_log_select ON activity_log;
CREATE POLICY activity_log_select ON activity_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS activity_log_insert ON activity_log;
CREATE POLICY activity_log_insert ON activity_log
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_activity_log_org_date
  ON activity_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON activity_log(entity_type, entity_id);

-- ============================================================
-- Enable realtime on notifications so the in-app bell can subscribe.
-- Idempotent: only adds the table if it's not already in the publication.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

