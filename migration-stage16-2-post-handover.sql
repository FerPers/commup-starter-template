-- ══════════════════════════════════════════════════════════════
-- Stage 16.2 — Post-Handover Tracking (Punches Cat B en Ops)
-- ══════════════════════════════════════════════════════════════
-- Tras la MC, los punches Cat B no desaparecen: se transfieren a
-- Operaciones con ownership explícito, estado propio, target date
-- y historial completo. Dashboard dedicado para Ops.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Columnas nuevas en punches ──────────────────────────────
ALTER TABLE punches
  ADD COLUMN IF NOT EXISTS post_handover_status TEXT
    CHECK (post_handover_status IN (
      'active','transferred_to_ops','in_progress_ops',
      'deferred','resolved_ops','verified_ops','closed_final','cancelled_ops'
    ));
ALTER TABLE punches
  ADD COLUMN IF NOT EXISTS transferred_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transferred_to_user_id  UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS ops_target_date         DATE,
  ADD COLUMN IF NOT EXISTS ops_notes               TEXT;

CREATE INDEX IF NOT EXISTS idx_punch_post_handover_active
  ON punches(post_handover_status)
  WHERE post_handover_status IS NOT NULL
    AND post_handover_status NOT IN ('closed_final','cancelled_ops');

-- ── 2. Historial de eventos post-handover ─────────────────────
CREATE TABLE IF NOT EXISTS punch_post_handover_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_id      UUID NOT NULL REFERENCES punches(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL
    CHECK (event_type IN ('transferred','status_change','note_added','evidence_attached','closed')),
  from_status   TEXT,
  to_status     TEXT,
  performed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT,
  evidence_urls TEXT[] NOT NULL DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS idx_punch_pho_events_punch
  ON punch_post_handover_events(punch_id, performed_at DESC);

-- ── 3. RLS ─────────────────────────────────────────────────────
ALTER TABLE punch_post_handover_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "punch_pho_events_select" ON punch_post_handover_events;
CREATE POLICY "punch_pho_events_select" ON punch_post_handover_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM punches pu
      WHERE pu.id = punch_post_handover_events.punch_id
        AND is_project_member(pu.project_id)
    )
  );

-- writes vía RPCs SECURITY DEFINER — sin policies INSERT directas

-- ── 4. RPC: transferir punch a Ops ────────────────────────────
DROP FUNCTION IF EXISTS transfer_punch_to_ops(UUID, UUID, DATE, TEXT);

CREATE OR REPLACE FUNCTION transfer_punch_to_ops(
  p_punch_id            UUID,
  p_transferred_to      UUID,
  p_ops_target_date     DATE DEFAULT NULL,
  p_notes               TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  v_category   TEXT;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.category::text, pu.post_handover_status
    INTO v_project_id, v_category, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Punch not found';
  END IF;

  IF NOT is_project_member(v_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_category <> 'B' THEN
    RAISE EXCEPTION 'Only Cat B punches can be transferred to Operations';
  END IF;

  UPDATE punches SET
    post_handover_status   = 'transferred_to_ops',
    transferred_at         = now(),
    transferred_to_user_id = p_transferred_to,
    ops_target_date        = COALESCE(p_ops_target_date, ops_target_date),
    ops_notes              = COALESCE(p_notes, ops_notes),
    assigned_to            = p_transferred_to
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id, 'transferred', COALESCE(v_cur_status, 'active'),
    'transferred_to_ops', auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_punch_to_ops(UUID, UUID, DATE, TEXT) TO authenticated;

-- ── 5. RPC: actualizar estado Ops ─────────────────────────────
DROP FUNCTION IF EXISTS update_punch_ops_status(UUID, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION update_punch_ops_status(
  p_punch_id     UUID,
  p_new_status   TEXT,
  p_notes        TEXT DEFAULT NULL,
  p_target_date  DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.post_handover_status
    INTO v_project_id, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Punch not found'; END IF;
  IF NOT is_project_member(v_project_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  IF p_new_status NOT IN (
    'in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops'
  ) THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN CURRENT_DATE ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur_status, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_punch_ops_status(UUID, TEXT, TEXT, DATE) TO authenticated;

-- ── 6. Vista: dashboard Ops por proyecto ──────────────────────
CREATE OR REPLACE VIEW ops_dashboard AS
SELECT
  pu.project_id,
  pu.id                AS punch_id,
  pu.punch_number,
  pu.description,
  pu.priority,
  pu.post_handover_status,
  pu.transferred_at,
  pu.transferred_to_user_id,
  pu.ops_target_date,
  pu.ops_notes,
  pu.target_date,
  pu.closed_date,
  pu.subsystem_id,
  sub.code             AS subsystem_code,
  sys.code             AS system_code,
  sys.name             AS system_name,
  pu.tag_id,
  t.tag_number,
  pro.full_name        AS assigned_to_name
FROM punches pu
JOIN subsystems sub ON sub.id = pu.subsystem_id
JOIN systems    sys ON sys.id = sub.system_id
LEFT JOIN tags     t   ON t.id = pu.tag_id
LEFT JOIN profiles pro ON pro.id = pu.transferred_to_user_id
WHERE pu.category = 'B'
  AND pu.post_handover_status IS NOT NULL;

GRANT SELECT ON ops_dashboard TO authenticated;
