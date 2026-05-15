-- ══════════════════════════════════════════════════════════════
-- Stage 13.1 — API Keys (org-scoped, scoped permissions)
-- ══════════════════════════════════════════════════════════════
-- Base para autenticación de la API pública v1.
-- La aplicación usa el SHA-256 hex del token como lookup
-- (ver src/lib/api/auth.ts). Nunca almacenamos el token en claro.
--
-- Formato del token: sk_live_<64 hex chars>
-- El token se devuelve UNA sola vez desde el RPC `create_api_key`.
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabla --------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,                    -- primeros 12 chars, solo para UI
  key_hash      TEXT NOT NULL UNIQUE,             -- sha256 hex del token completo
  scopes        TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  CONSTRAINT api_keys_scopes_valid CHECK (
    scopes <@ ARRAY[
      'tags:read','tags:write',
      'itrs:read','itrs:write',
      'punches:read','punches:write',
      'certificates:read',
      'systems:read',
      'events:read',
      '*'
    ]::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org      ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys(key_hash);

-- 2. RLS ----------------------------------------------------------
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_select" ON api_keys;
CREATE POLICY "api_keys_select" ON api_keys
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

-- INSERT / UPDATE / DELETE vía RPC SECURITY DEFINER — no policies directas
-- para evitar que un cliente inserte un hash arbitrario.

-- 3. RPC: crear API key (retorna el token en claro UNA vez) -------
DROP FUNCTION IF EXISTS create_api_key(UUID, TEXT, TEXT[], TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION create_api_key(
  p_org_id     UUID,
  p_name       TEXT,
  p_scopes     TEXT[],
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id         UUID,
  token      TEXT,
  key_prefix TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token     TEXT;
  v_hash      TEXT;
  v_prefix    TEXT;
  v_key_id    UUID;
BEGIN
  IF NOT is_org_editor(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized to create API keys for this organization';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  IF p_scopes IS NULL OR array_length(p_scopes, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one scope is required';
  END IF;

  -- Generar token: sk_live_<64 hex chars>
  v_token  := 'sk_live_' || encode(gen_random_bytes(32), 'hex');
  v_hash   := encode(digest(v_token, 'sha256'), 'hex');
  v_prefix := substring(v_token from 1 for 12);

  INSERT INTO api_keys (org_id, name, key_prefix, key_hash, scopes, created_by, expires_at)
  VALUES (p_org_id, p_name, v_prefix, v_hash, p_scopes, auth.uid(), p_expires_at)
  RETURNING api_keys.id INTO v_key_id;

  RETURN QUERY SELECT v_key_id, v_token, v_prefix;
END $$;

GRANT EXECUTE ON FUNCTION create_api_key(UUID, TEXT, TEXT[], TIMESTAMPTZ) TO authenticated;

-- 4. RPC: revocar API key ----------------------------------------
DROP FUNCTION IF EXISTS revoke_api_key(UUID);

CREATE OR REPLACE FUNCTION revoke_api_key(p_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM api_keys WHERE id = p_key_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'API key not found';
  END IF;
  IF NOT is_org_editor(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized to revoke this API key';
  END IF;

  UPDATE api_keys
     SET revoked_at = now()
   WHERE id = p_key_id
     AND revoked_at IS NULL;
END $$;

GRANT EXECUTE ON FUNCTION revoke_api_key(UUID) TO authenticated;

COMMENT ON TABLE api_keys IS
  'Stage 13.1 — API keys for public REST API authentication. Token hash only; clear text returned once via create_api_key().';
