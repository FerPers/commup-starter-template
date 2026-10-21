-- fn: public.cleanup_event_retention()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.cleanup_event_retention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deliveries integer; v_events integer; v_push integer; v_notifs integer; v_http integer := 0;
BEGIN
  DELETE FROM webhook_deliveries
  WHERE status IN ('delivered', 'abandoned') AND created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deliveries = ROW_COUNT;

  DELETE FROM domain_events WHERE id IN (
    SELECT d.id FROM domain_events d
    WHERE d.occurred_at < now() - interval '365 days' AND d.dispatched_at IS NOT NULL
    LIMIT 50000);
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM notification_push_outbox WHERE queued_at < now() - interval '7 days';
  GET DIAGNOSTICS v_push = ROW_COUNT;

  DELETE FROM notifications WHERE id IN (
    SELECT n.id FROM notifications n
    WHERE n.read_at IS NOT NULL AND n.created_at < now() - interval '180 days'
    LIMIT 50000);
  GET DIAGNOSTICS v_notifs = ROW_COUNT;

  BEGIN
    DELETE FROM net._http_response WHERE created < now() - interval '2 days';
    GET DIAGNOSTICS v_http = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RAISE WARNING 'cleanup_event_retention: sin acceso a net._http_response';
  END;

  RETURN jsonb_build_object('webhook_deliveries', v_deliveries, 'domain_events', v_events, 'notification_push_outbox', v_push,
                            'notifications', v_notifs, 'http_responses', v_http);
END;
$function$;
