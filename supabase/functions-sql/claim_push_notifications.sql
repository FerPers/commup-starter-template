-- fn: public.claim_push_notifications(integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.claim_push_notifications(p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, org_id uuid, recipient_user_id uuid, kind text, title text, body text, link_url text, payload jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH c AS (
    DELETE FROM notification_push_outbox po
    WHERE po.notification_id IN (
      SELECT q.notification_id FROM notification_push_outbox q ORDER BY q.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING po.notification_id
  )
  SELECT n.id, n.org_id, n.recipient_user_id, n.kind, n.title, n.body, n.link_url, n.payload, n.created_at
  FROM notifications n JOIN c ON c.notification_id = n.id
  WHERE n.read_at IS NULL
  ORDER BY n.created_at
$function$;
