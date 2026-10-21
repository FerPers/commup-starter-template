-- fn: public.notification_push_enqueue_trg()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.notification_push_enqueue_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO notification_push_outbox (notification_id)
  SELECT n.id FROM new_rows n
  WHERE EXISTS (SELECT 1 FROM push_subscriptions s
                WHERE s.user_id = n.recipient_user_id AND s.org_id = n.org_id AND s.enabled)
  ON CONFLICT (notification_id) DO NOTHING;
  RETURN NULL;
END;
$function$;
