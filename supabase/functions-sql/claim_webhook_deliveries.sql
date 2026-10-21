-- fn: public.claim_webhook_deliveries(integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.claim_webhook_deliveries(p_limit integer DEFAULT 100)
 RETURNS TABLE(delivery_id uuid, subscription_id uuid, attempts integer, endpoint_url text, secret text, enabled boolean, event_id uuid, event_type text, payload jsonb, occurred_at timestamp with time zone, schema_version smallint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH c AS (
    SELECT w.id FROM webhook_deliveries w
    WHERE w.status = 'pending' AND w.next_retry_at <= now()
    ORDER BY w.next_retry_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE webhook_deliveries w SET next_retry_at = now() + interval '5 minutes'
    FROM c WHERE w.id = c.id
    RETURNING w.id, w.subscription_id, w.attempts, w.domain_event_id
  )
  SELECT u.id, u.subscription_id, u.attempts, s.endpoint_url, s.secret, s.enabled,
         d.id, d.event_type, d.payload, d.occurred_at, d.schema_version
  FROM u
  JOIN webhook_subscriptions s ON s.id = u.subscription_id
  JOIN domain_events d ON d.id = u.domain_event_id
$function$;
