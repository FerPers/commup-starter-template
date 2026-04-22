-- ══════════════════════════════════════════════════════════════
-- Stage 16.4 — Auto-Commissioning Assisted (ITR suggestions)
-- ══════════════════════════════════════════════════════════════
-- Tras cada batch IIoT, si una señal respondió en rango, estable
-- y existe un ITR de loop/functional pendiente para su tag, el
-- motor genera una sugerencia "cerrar ITR" que el inspector puede
-- aceptar o rechazar desde la UI.
-- ══════════════════════════════════════════════════════════════

-- 1. Nuevo action_type en el enum de workflow engine (Stage 11)
DO $$ BEGIN
  ALTER TYPE workflow_action_type ADD VALUE IF NOT EXISTS 'suggest_close_itr';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. itr_suggestions
CREATE TABLE IF NOT EXISTS itr_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id)       ON DELETE CASCADE,
  itr_id            UUID NOT NULL REFERENCES itrs(id)           ON DELETE CASCADE,
  rule_id           UUID REFERENCES workflow_rules(id)          ON DELETE SET NULL,
  signal_id         UUID REFERENCES signals(id)                 ON DELETE SET NULL,
  signal_tag        TEXT,
  signal_value      DOUBLE PRECISION,
  signal_unit       TEXT,
  sampled_at        TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','expired','superseded')),
  message           TEXT,
  pre_filled_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  resolved_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT
);

CREATE INDEX IF NOT EXISTS idx_itr_suggestions_itr_pending
  ON itr_suggestions(itr_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_itr_suggestions_project_pending
  ON itr_suggestions(project_id, suggested_at DESC) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_itr_suggestions_pending_unique
  ON itr_suggestions(itr_id, rule_id) WHERE status = 'pending';

-- 3. RLS
ALTER TABLE itr_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "itr_suggestions_select" ON itr_suggestions;
CREATE POLICY "itr_suggestions_select" ON itr_suggestions
  FOR SELECT USING (is_project_member(project_id));

-- 4. Evaluator de reglas signal.ingested contra un batch dado
DROP FUNCTION IF EXISTS evaluate_signal_rules_for_batch(UUID);

CREATE OR REPLACE FUNCTION evaluate_signal_rules_for_batch(p_batch_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id     UUID;
  v_created    INT := 0;
  rule_rec     RECORD;
  sig_rec      RECORD;
  itr_rec      RECORD;
  v_tolerance  NUMERIC;
  v_stable_sec INT;
  v_max_dev    NUMERIC;
  v_expires_h  INT;
  v_template_match TEXT[];
  v_min_ok     NUMERIC;
  v_max_ok     NUMERIC;
  v_latest_val DOUBLE PRECISION;
  v_latest_at  TIMESTAMPTZ;
  v_window_ok  BOOLEAN;
  v_msg        TEXT;
BEGIN
  SELECT org_id INTO v_org_id FROM signal_sample_batches WHERE id = p_batch_id;
  IF v_org_id IS NULL THEN RETURN 0; END IF;

  FOR rule_rec IN
    SELECT wr.id, wr.action_payload, wr.name
    FROM workflow_rules wr
    WHERE wr.org_id = v_org_id
      AND wr.enabled = TRUE
      AND wr.trigger_event = 'signal.ingested'
      AND wr.action_type   = 'suggest_close_itr'
  LOOP
    v_tolerance       := COALESCE((rule_rec.action_payload->>'tolerance_pct')::numeric, 2.0);
    v_stable_sec      := COALESCE((rule_rec.action_payload->>'stability_window_sec')::int, 30);
    v_max_dev         := COALESCE((rule_rec.action_payload->>'max_deviation_pct')::numeric, 0.5);
    v_expires_h       := COALESCE((rule_rec.action_payload->>'expires_hours')::int, 4);
    v_template_match  := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(rule_rec.action_payload->'itr_template_match')),
      ARRAY['loop','functional']::text[]
    );

    FOR sig_rec IN
      SELECT DISTINCT sig.id       AS signal_id,
                      sig.signal_tag,
                      sig.eng_unit,
                      sig.range_min,
                      sig.range_max,
                      sig.tag_id,
                      t.project_id
      FROM signal_samples ss
      JOIN signals sig  ON sig.id = ss.signal_id
      JOIN tags    t    ON t.id   = sig.tag_id
      JOIN projects p   ON p.id   = t.project_id
      WHERE ss.source_batch = p_batch_id
        AND p.org_id = v_org_id
        AND sig.range_min IS NOT NULL
        AND sig.range_max IS NOT NULL
    LOOP
      IF sig_rec.range_max IS NULL OR sig_rec.range_min IS NULL
         OR sig_rec.range_max <= sig_rec.range_min THEN CONTINUE; END IF;

      v_min_ok := sig_rec.range_min - (sig_rec.range_max - sig_rec.range_min) * v_tolerance / 100.0;
      v_max_ok := sig_rec.range_max + (sig_rec.range_max - sig_rec.range_min) * v_tolerance / 100.0;

      SELECT ss.value, ss.sampled_at
        INTO v_latest_val, v_latest_at
        FROM signal_samples ss
       WHERE ss.signal_id = sig_rec.signal_id
         AND ss.source_batch = p_batch_id
       ORDER BY ss.sampled_at DESC LIMIT 1;

      IF v_latest_val IS NULL THEN CONTINUE; END IF;
      IF v_latest_val NOT BETWEEN v_min_ok AND v_max_ok THEN CONTINUE; END IF;

      SELECT
        bool_and(ss.quality = 0)
          AND (MAX(ss.value) - MIN(ss.value)) <= ABS(AVG(ss.value)) * v_max_dev / 100.0
          AND COUNT(*) >= 3
      INTO v_window_ok
      FROM signal_samples ss
      WHERE ss.signal_id = sig_rec.signal_id
        AND ss.sampled_at >= v_latest_at - (v_stable_sec || ' seconds')::interval
        AND ss.sampled_at <= v_latest_at;

      IF v_window_ok IS DISTINCT FROM TRUE THEN CONTINUE; END IF;

      FOR itr_rec IN
        SELECT i.id, i.itr_number
        FROM itrs i
        JOIN itr_templates tpl ON tpl.id = i.template_id
        WHERE i.tag_id = sig_rec.tag_id
          AND i.project_id = sig_rec.project_id
          AND i.status IN ('not_started','in_progress')
          AND EXISTS (
            SELECT 1 FROM unnest(v_template_match) kw
            WHERE tpl.title ILIKE ('%' || kw || '%')
               OR tpl.code  ILIKE ('%' || kw || '%')
          )
      LOOP
        v_msg := format('Signal %s responded within range (%s %s) — suggest closing ITR %s',
                        sig_rec.signal_tag,
                        round(v_latest_val::numeric, 3),
                        COALESCE(sig_rec.eng_unit, ''),
                        itr_rec.itr_number);

        INSERT INTO itr_suggestions(
          org_id, project_id, itr_id, rule_id, signal_id, signal_tag,
          signal_value, signal_unit, sampled_at, message,
          pre_filled_data, expires_at
        )
        VALUES (
          v_org_id, sig_rec.project_id, itr_rec.id, rule_rec.id, sig_rec.signal_id,
          sig_rec.signal_tag, v_latest_val, sig_rec.eng_unit, v_latest_at, v_msg,
          jsonb_build_object(
            'measured_value', v_latest_val,
            'test_result',    'pass_provisional',
            'auto_timestamp', v_latest_at
          ),
          now() + (v_expires_h || ' hours')::interval
        )
        ON CONFLICT (itr_id, rule_id) WHERE status = 'pending' DO NOTHING;

        v_created := v_created + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION evaluate_signal_rules_for_batch(UUID) TO authenticated;

-- 5. Hookear el evaluador al final de la ingesta (reemplaza 16.3)
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
  v_suggestions    INT := 0;
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

  BEGIN
    v_suggestions := evaluate_signal_rules_for_batch(v_batch_id);
  EXCEPTION WHEN OTHERS THEN
    v_suggestions := -1;
  END;

  RETURN jsonb_build_object(
    'batch_id',     v_batch_id,
    'accepted',     v_accepted,
    'rejected',     v_rejected,
    'total',        v_total,
    'errors',       v_errors,
    'suggestions_created', v_suggestions,
    'idempotent_replay', false
  );
END;
$$;

-- 6. Accept / reject RPCs
DROP FUNCTION IF EXISTS accept_itr_suggestion(UUID, TEXT);
CREATE OR REPLACE FUNCTION accept_itr_suggestion(
  p_suggestion_id UUID,
  p_note          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  v_itr_id     UUID;
BEGIN
  SELECT s.project_id, s.itr_id INTO v_project_id, v_itr_id
    FROM itr_suggestions s
   WHERE s.id = p_suggestion_id AND s.status = 'pending';

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Suggestion not found or not pending'; END IF;
  IF NOT is_project_member(v_project_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE itr_suggestions SET
    status          = 'accepted',
    resolved_by     = auth.uid(),
    resolved_at     = now(),
    resolution_note = p_note
  WHERE id = p_suggestion_id;

  RETURN v_itr_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_itr_suggestion(UUID, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS reject_itr_suggestion(UUID, TEXT);
CREATE OR REPLACE FUNCTION reject_itr_suggestion(
  p_suggestion_id UUID,
  p_note          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT s.project_id INTO v_project_id
    FROM itr_suggestions s
   WHERE s.id = p_suggestion_id AND s.status = 'pending';

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Suggestion not found or not pending'; END IF;
  IF NOT is_project_member(v_project_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE itr_suggestions SET
    status          = 'rejected',
    resolved_by     = auth.uid(),
    resolved_at     = now(),
    resolution_note = p_note
  WHERE id = p_suggestion_id;

  RETURN p_suggestion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_itr_suggestion(UUID, TEXT) TO authenticated;
