-- ══════════════════════════════════════════════════════════════
-- Stage 13.4 — Webhooks outbound
-- ══════════════════════════════════════════════════════════════
-- Tablas:
--   · webhook_subscriptions — endpoints que quieren recibir eventos
--   · webhook_deliveries    — histórico de entregas (pending/delivered/abandoned)
--
-- Flujo:
--   1. INSERT en domain_events → trigger `dispatch_webhook_event`
--   2. Llama async (pg_net) a la Edge Function `webhook-dispatcher`
--      con {event_id} — ésta crea webhook_deliveries por cada sub
--      que matchea el org_id / project_id / event_type.
--   3. Un cron (o la misma función en modo retry) procesa
--      deliveries pendientes, firma con HMAC-SHA256(secret, body) y
--      POSTea al endpoint con reintentos exponenciales.
--
-- Requisitos:
--   · extension pg_net habilitada (ya la usa Stage 11.2)
--   · vault secret 'webhook_dispatcher_url' con la URL:
--     https://<proj>.supabase.co/functions/v1/webhook-dispatcher
--   · vault secret 'service_role_key' (ya existe por Stage 11.2)
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ══════════════════════════════════════════════════════════════
-- 1. webhook_subscriptions
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,   -- NULL = todos los proyectos del org
  name            TEXT NOT NULL,
  endpoint_url    TEXT NOT NULL,
  secret          TEXT NOT NULL,                                    -- se firma HMAC-SHA256 con esto
  event_types     TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],       -- '*' = todos
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_success_at TIMESTAMPTZ,
  last_error_at   TIMESTAMPTZ,
  failure_count   INT NOT NULL DEFAULT 0,
  CONSTRAINT webhook_subscriptions_url_https CHECK (endpoint_url LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_org     ON webhook_subscriptions(org_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_webhook_subs_project ON webhook_subscriptions(project_id) WHERE enabled;

-- ══════════════════════════════════════════════════════════════
-- 2. webhook_deliveries
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  domain_event_id    UUID NOT NULL REFERENCES domain_events(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','delivered','abandoned')),
  attempts           INT NOT NULL DEFAULT 0,
  next_retry_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_response_code INT,
  last_response_body TEXT,
  delivered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON webhook_deliveries(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub
  ON webhook_deliveries(subscription_id, created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- 3. RLS
-- ══════════════════════════════════════════════════════════════
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_subs_select" ON webhook_subscriptions;
CREATE POLICY "webhook_subs_select" ON webhook_subscriptions
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

-- INSERT/UPDATE/DELETE vía RPC SECURITY DEFINER para proteger secret
-- y asegurar que solo editores gestionen subs.

DROP POLICY IF EXISTS "webhook_deliveries_select" ON webhook_deliveries;
CREATE POLICY "webhook_deliveries_select" ON webhook_deliveries
  FOR SELECT USING (
    subscription_id IN (
      SELECT id FROM webhook_subscriptions
      WHERE org_id IN (SELECT get_my_org_ids())
    )
  );

-- Writes en webhook_deliveries: solo service role (edge function). Sin policies.

-- ══════════════════════════════════════════════════════════════
-- 4. RPC — crear subscription (retorna secret UNA vez)
-- ══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS create_webhook_subscription(UUID, UUID, TEXT, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION create_webhook_subscription(
  p_org_id       UUID,
  p_project_id   UUID,
  p_name         TEXT,
  p_endpoint_url TEXT,
  p_event_types  TEXT[] DEFAULT ARRAY['*']::text[]
)
RETURNS TABLE (id UUID, secret TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_id     UUID;
BEGIN
  IF NOT is_org_editor(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized to create webhooks for this organization';
  END IF;

  IF p_endpoint_url !~ '^https://' THEN
    RAISE EXCEPTION 'endpoint_url must be https';
  END IF;

  IF p_project_id IS NOT NULL THEN
    PERFORM 1 FROM projects WHERE id = p_project_id AND org_id = p_org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project_id does not belong to org_id';
    END IF;
  END IF;

  -- 32 bytes aleatorios → base64 sin padding (43 chars) → "whsec_<43>" = 49 chars
  v_secret := 'whsec_' || rtrim(encode(gen_random_bytes(32), 'base64'), '=');

  INSERT INTO webhook_subscriptions (org_id, project_id, name, endpoint_url, secret, event_types, created_by)
  VALUES (p_org_id, p_project_id, p_name, p_endpoint_url, v_secret, p_event_types, auth.uid())
  RETURNING webhook_subscriptions.id INTO v_id;

  RETURN QUERY SELECT v_id, v_secret;
END $$;

GRANT EXECUTE ON FUNCTION create_webhook_subscription(UUID, UUID, TEXT, TEXT, TEXT[]) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- 5. RPC — toggle enabled / revoke
-- ══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS set_webhook_enabled(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION set_webhook_enabled(p_sub_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM webhook_subscriptions WHERE id = p_sub_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Webhook subscription not found';
  END IF;
  IF NOT is_org_editor(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE webhook_subscriptions SET enabled = p_enabled WHERE id = p_sub_id;
END $$;

GRANT EXECUTE ON FUNCTION set_webhook_enabled(UUID, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS delete_webhook_subscription(UUID);

CREATE OR REPLACE FUNCTION delete_webhook_subscription(p_sub_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM webhook_subscriptions WHERE id = p_sub_id;
  IF v_org_id IS NULL THEN RETURN; END IF;
  IF NOT is_org_editor(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM webhook_subscriptions WHERE id = p_sub_id;
END $$;

GRANT EXECUTE ON FUNCTION delete_webhook_subscription(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- 6. RPC — incrementar failure_count (llamada desde edge function)
-- ══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS increment_webhook_failure_count(UUID);

CREATE OR REPLACE FUNCTION increment_webhook_failure_count(sub_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE webhook_subscriptions
     SET failure_count = failure_count + 1
   WHERE id = sub_id;
$$;

-- Solo service role la llama (edge function). Revocar execute del rol anon/authenticated:
REVOKE ALL ON FUNCTION increment_webhook_failure_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_webhook_failure_count(UUID) FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════
-- 7. Trigger — domain_events INSERT → dispatch webhook event
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION dispatch_webhook_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url         TEXT;
  v_service_key TEXT;
BEGIN
  -- Leer secrets del vault (fallo silencioso si faltan)
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'webhook_dispatcher_url';
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'webhook dispatcher: vault secrets missing';
    RETURN NEW;
  END;

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget async — no bloquea el INSERT original
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('event_id', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dispatch_webhook_event ON domain_events;
CREATE TRIGGER trg_dispatch_webhook_event
  AFTER INSERT ON domain_events
  FOR EACH ROW EXECUTE FUNCTION dispatch_webhook_event();

-- ══════════════════════════════════════════════════════════════
-- 8. Comentarios
-- ══════════════════════════════════════════════════════════════
COMMENT ON TABLE webhook_subscriptions IS
  'Stage 13.4 — Outbound webhook endpoints. secret is returned once via create_webhook_subscription().';
COMMENT ON TABLE webhook_deliveries IS
  'Stage 13.4 — Delivery log. Edge function `webhook-dispatcher` creates rows on domain_events INSERT and processes retries.';
COMMENT ON FUNCTION dispatch_webhook_event() IS
  'Fires pg_net POST to webhook-dispatcher on every new domain event. Fails silently if vault secrets missing.';

-- ══════════════════════════════════════════════════════════════
-- Setup de vault secrets (ejecutar UNA vez):
-- SELECT vault.create_secret(
--   'https://mdyljpgzvigzjpqluket.supabase.co/functions/v1/webhook-dispatcher',
--   'webhook_dispatcher_url'
-- );
-- (service_role_key ya existe desde Stage 11.2)
-- ══════════════════════════════════════════════════════════════
