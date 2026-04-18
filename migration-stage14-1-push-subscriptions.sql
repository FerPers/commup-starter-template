-- ══════════════════════════════════════════════════════════════
-- Stage 14.4 — Push Notifications (Web Push + VAPID)
-- ══════════════════════════════════════════════════════════════
-- Tabla de subscriptions por usuario+device. Una misma cuenta
-- puede tener múltiples devices (móvil, tablet, escritorio).
--
-- Topics soportados (ver TOPIC_CONFIG en PushNotificationManager.tsx):
--   itr_returned, punch_assigned, punch_cat_a, cert_ready,
--   system_alerts, my_items_only
--
-- Dispatcher: pendiente — Edge Function `push-dispatcher` análoga a
-- `webhook-dispatcher`. Por ahora la API expone subscribe/unsubscribe
-- y la cola se construye sobre `domain_events`.
-- ══════════════════════════════════════════════════════════════

-- 1. Tabla --------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  p256dh          TEXT NOT NULL,
  auth_secret     TEXT NOT NULL,
  topics          TEXT[] NOT NULL DEFAULT ARRAY['itr_returned','punch_cat_a','cert_ready']::text[],
  device_info     JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_user_unique UNIQUE (user_id, endpoint),
  CONSTRAINT push_subscriptions_topics_valid CHECK (
    topics <@ ARRAY[
      'itr_returned','punch_assigned','punch_cat_a',
      'cert_ready','system_alerts','my_items_only'
    ]::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_push_subs_org      ON push_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user     ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_enabled  ON push_subscriptions(enabled) WHERE enabled = true;

-- updated_at trigger reusing the global helper if exists
CREATE OR REPLACE FUNCTION push_subs_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_subs_updated_at ON push_subscriptions;
CREATE TRIGGER push_subs_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION push_subs_set_updated_at();

-- 2. RLS ----------------------------------------------------------
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_select_own" ON push_subscriptions;
CREATE POLICY "push_subs_select_own" ON push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE vía RPC SECURITY DEFINER para validar org membership.

-- 3. RPCs ---------------------------------------------------------
DROP FUNCTION IF EXISTS upsert_push_subscription(TEXT, TEXT, TEXT, TEXT[], JSONB);

CREATE OR REPLACE FUNCTION upsert_push_subscription(
  p_endpoint    TEXT,
  p_p256dh      TEXT,
  p_auth_secret TEXT,
  p_topics      TEXT[],
  p_device_info JSONB DEFAULT '{}'::jsonb
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

  -- Pick the user's first org membership; multi-org users can switch later
  SELECT org_id INTO v_org_id
  FROM org_members
  WHERE user_id = v_user_id
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization membership';
  END IF;

  INSERT INTO push_subscriptions (
    org_id, user_id, endpoint, p256dh, auth_secret, topics, device_info, enabled, failure_count
  ) VALUES (
    v_org_id, v_user_id, p_endpoint, p_p256dh, p_auth_secret, p_topics, p_device_info, true, 0
  )
  ON CONFLICT (user_id, endpoint) DO UPDATE
    SET p256dh        = EXCLUDED.p256dh,
        auth_secret   = EXCLUDED.auth_secret,
        topics        = EXCLUDED.topics,
        device_info   = EXCLUDED.device_info,
        enabled       = true,
        failure_count = 0,
        updated_at    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS delete_push_subscription(TEXT);

CREATE OR REPLACE FUNCTION delete_push_subscription(p_endpoint TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM push_subscriptions
  WHERE user_id = v_user_id AND endpoint = p_endpoint;
END;
$$;

DROP FUNCTION IF EXISTS update_push_subscription_topics(TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION update_push_subscription_topics(
  p_endpoint TEXT,
  p_topics   TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE push_subscriptions
  SET topics = p_topics, updated_at = now()
  WHERE user_id = v_user_id AND endpoint = p_endpoint;
END;
$$;

-- Increment failure_count (only callable by service role from dispatcher)
DROP FUNCTION IF EXISTS bump_push_subscription_failure(UUID);

CREATE OR REPLACE FUNCTION bump_push_subscription_failure(p_sub_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE push_subscriptions
  SET failure_count   = failure_count + 1,
      last_failure_at = now(),
      enabled         = CASE WHEN failure_count + 1 >= 5 THEN false ELSE enabled END
  WHERE id = p_sub_id;
END;
$$;

REVOKE ALL ON FUNCTION bump_push_subscription_failure(UUID) FROM public;

-- ══════════════════════════════════════════════════════════════
-- DONE — Stage 14.4 push_subscriptions table + RPCs
-- ══════════════════════════════════════════════════════════════
