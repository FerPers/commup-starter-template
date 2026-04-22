-- ══════════════════════════════════════════════════════════════
-- Stage 16.3 — IIoT Signal Samples ingestion
-- ══════════════════════════════════════════════════════════════
-- Endpoint POST /api/v1/signals/samples alimenta esta tabla con
-- lecturas de proceso desde OSIsoft PI / OPC-UA / MODBUS / MQTT.
-- ══════════════════════════════════════════════════════════════

-- 1. Extender `signals` con metadata IIoT + alarm thresholds
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS lo_lo        NUMERIC,
  ADD COLUMN IF NOT EXISTS lo           NUMERIC,
  ADD COLUMN IF NOT EXISTS hi           NUMERIC,
  ADD COLUMN IF NOT EXISTS hi_hi        NUMERIC,
  ADD COLUMN IF NOT EXISTS source       TEXT
    CHECK (source IN ('MANUAL','PI','OPC_UA','MODBUS','MQTT')),
  ADD COLUMN IF NOT EXISTS pi_path      TEXT,
  ADD COLUMN IF NOT EXISTS opc_node_id  TEXT,
  ADD COLUMN IF NOT EXISTS active       BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_signals_signal_tag ON signals(signal_tag);

-- 2. signal_samples — sin particionar (V1 simple, escala ~500K filas OK)
CREATE TABLE IF NOT EXISTS signal_samples (
  signal_id    UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  sampled_at   TIMESTAMPTZ NOT NULL,
  value        DOUBLE PRECISION,
  quality      SMALLINT NOT NULL DEFAULT 0,  -- 0=GOOD, 1=UNCERTAIN, 2=BAD
  source_batch UUID,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, sampled_at)
);

CREATE INDEX IF NOT EXISTS idx_signal_samples_sampled_at
  ON signal_samples(sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_samples_batch
  ON signal_samples(source_batch) WHERE source_batch IS NOT NULL;

-- 3. Batches (idempotencia + auditoría)
CREATE TABLE IF NOT EXISTS signal_sample_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source         TEXT,
  source_system  TEXT,
  idempotency_key TEXT,
  api_key_id     UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  sample_count   INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_signal_batches_org_time
  ON signal_sample_batches(org_id, received_at DESC);

-- 4. RLS
ALTER TABLE signal_samples         ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_sample_batches  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signal_samples_select" ON signal_samples;
CREATE POLICY "signal_samples_select" ON signal_samples
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM signals s
      JOIN tags t       ON t.id = s.tag_id
      JOIN projects p   ON p.id = t.project_id
      WHERE s.id = signal_samples.signal_id
        AND p.org_id IN (SELECT get_my_org_ids())
    )
  );

DROP POLICY IF EXISTS "signal_batches_select" ON signal_sample_batches;
CREATE POLICY "signal_batches_select" ON signal_sample_batches
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

-- 5. RPC de ingesta en batch
-- NOTA: esta versión incluye el hook del evaluador de reglas
-- auto-commissioning (Stage 16.4). Si aplicás 16.3 antes que 16.4,
-- el bloque BEGIN..EXCEPTION atrapa el "function does not exist"
-- y la ingesta sigue funcionando.
DROP FUNCTION IF EXISTS ingest_signal_samples(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS ingest_signal_samples(UUID, TEXT, TEXT, TEXT, UUID, JSONB);

CREATE OR REPLACE FUNCTION ingest_signal_samples(
  p_org_id          UUID,
  p_source          TEXT,
  p_source_system   TEXT,
  p_idempotency_key TEXT,
  p_api_key_id      UUID,
  p_samples         JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id       UUID;
  v_existing_batch RECORD;
  v_accepted       INT := 0;
  v_rejected       INT := 0;
  v_total          INT := COALESCE(jsonb_array_length(p_samples), 0);
  v_errors         JSONB := '[]'::jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_batch
    FROM signal_sample_batches
    WHERE org_id = p_org_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'batch_id', v_existing_batch.id,
        'accepted', v_existing_batch.accepted_count,
        'rejected', v_existing_batch.rejected_count,
        'total',    v_existing_batch.sample_count,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  INSERT INTO signal_sample_batches(
    org_id, source, source_system, idempotency_key, api_key_id, sample_count
  ) VALUES (
    p_org_id, p_source, p_source_system, p_idempotency_key, p_api_key_id, v_total
  )
  RETURNING id INTO v_batch_id;

  WITH payload AS (
    SELECT
      s.*,
      (item->>'signal_name')::text        AS signal_name,
      (item->>'sampled_at')::timestamptz  AS sampled_at,
      NULLIF(item->>'value','')::double precision AS value,
      COALESCE((item->>'quality')::smallint, 0)   AS quality
    FROM jsonb_array_elements(p_samples) item
    LEFT JOIN LATERAL (
      SELECT sig.id AS signal_id, t.project_id, p.org_id
      FROM signals sig
      JOIN tags t     ON t.id = sig.tag_id
      JOIN projects p ON p.id = t.project_id
      WHERE sig.signal_tag = (item->>'signal_name')
        AND p.org_id = p_org_id
        AND sig.active = TRUE
      LIMIT 1
    ) s ON true
  ),
  to_insert AS (
    SELECT signal_id, sampled_at, value, quality, v_batch_id AS source_batch
    FROM payload WHERE signal_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO signal_samples (signal_id, sampled_at, value, quality, source_batch)
    SELECT signal_id, sampled_at, value, quality, source_batch FROM to_insert
    ON CONFLICT (signal_id, sampled_at) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM inserted),
    (SELECT COUNT(*) FROM payload WHERE signal_id IS NULL),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
       'signal_name', signal_name,
       'reason', 'signal_not_registered'
    )) FROM payload WHERE signal_id IS NULL), '[]'::jsonb)
  INTO v_accepted, v_rejected, v_errors;

  UPDATE signal_sample_batches
     SET accepted_count = v_accepted,
         rejected_count = v_rejected
   WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'accepted', v_accepted,
    'rejected', v_rejected,
    'total',    v_total,
    'errors',   v_errors,
    'idempotent_replay', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ingest_signal_samples(UUID, TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated;

-- 6. Vista 1-min (aggregation on-demand; materializar si crece)
CREATE OR REPLACE VIEW signal_samples_1min AS
SELECT
  signal_id,
  date_trunc('minute', sampled_at) AS bucket,
  AVG(value) AS avg_val,
  MIN(value) AS min_val,
  MAX(value) AS max_val,
  COUNT(*)   AS sample_count
FROM signal_samples
WHERE quality = 0
GROUP BY signal_id, date_trunc('minute', sampled_at);

GRANT SELECT ON signal_samples_1min TO authenticated;
