-- ══════════════════════════════════════════════════════════════
-- Patch Stage 14.1b — Fix upsert_push_subscription
-- ══════════════════════════════════════════════════════════════
-- Bug: the original RPC did `ORDER BY created_at` on org_members,
-- but org_members uses `joined_at` (see supabase-schema.sql).
-- This caused: column "created_at" does not exist
-- when users toggled notifications ON in /admin/notifications.
-- ══════════════════════════════════════════════════════════════

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

  SELECT org_id INTO v_org_id
  FROM org_members
  WHERE user_id = v_user_id
  ORDER BY joined_at
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
