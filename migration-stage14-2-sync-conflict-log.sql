-- ══════════════════════════════════════════════════════════════
-- Stage 14.5 — Sync Conflict Log (Last-Write-Wins audit trail)
-- ══════════════════════════════════════════════════════════════
-- Cuando un cliente offline intenta hacer flush de respuestas y
-- el servidor ya tiene una versión más nueva, aplicamos LWW
-- automáticamente y registramos el conflicto.
-- Esto reemplaza al window.confirm() que bloqueaba al usuario.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sync_conflict_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,                 -- 'itr_response' | 'punch' | ...
  entity_id       TEXT NOT NULL,                 -- id de la entidad (compuesto si itr_responses)
  local_payload   JSONB NOT NULL,
  remote_payload  JSONB,
  local_ts        TIMESTAMPTZ NOT NULL,
  remote_ts       TIMESTAMPTZ,
  winner          TEXT NOT NULL CHECK (winner IN ('local','remote')),
  resolution      TEXT NOT NULL DEFAULT 'lww_auto'
                    CHECK (resolution IN ('lww_auto','manual_local','manual_remote')),
  resolved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes           TEXT,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflict_org_time
  ON sync_conflict_log(org_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_conflict_user_time
  ON sync_conflict_log(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_conflict_entity
  ON sync_conflict_log(entity_type, entity_id);

ALTER TABLE sync_conflict_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_conflict_select" ON sync_conflict_log;
CREATE POLICY "sync_conflict_select" ON sync_conflict_log
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

-- Sólo el propio usuario puede insertar conflictos (vía RPC para validar org)
DROP FUNCTION IF EXISTS log_sync_conflict(TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);

CREATE OR REPLACE FUNCTION log_sync_conflict(
  p_entity_type    TEXT,
  p_entity_id      TEXT,
  p_local_payload  JSONB,
  p_remote_payload JSONB,
  p_local_ts       TIMESTAMPTZ,
  p_remote_ts      TIMESTAMPTZ,
  p_winner         TEXT,
  p_notes          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID;
  v_id      UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT org_id INTO v_org_id
  FROM org_members
  WHERE user_id = v_user_id
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization membership';
  END IF;

  IF p_winner NOT IN ('local','remote') THEN
    RAISE EXCEPTION 'winner must be local or remote';
  END IF;

  INSERT INTO sync_conflict_log (
    org_id, user_id, entity_type, entity_id,
    local_payload, remote_payload, local_ts, remote_ts,
    winner, resolution, notes
  ) VALUES (
    v_org_id, v_user_id, p_entity_type, p_entity_id,
    p_local_payload, p_remote_payload, p_local_ts, p_remote_ts,
    p_winner, 'lww_auto', p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- DONE
-- ══════════════════════════════════════════════════════════════
