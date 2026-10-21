-- fn: public.outbox_dispatch(integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.outbox_dispatch(p_limit integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_events integer; v_deliveries integer; v_wf uuid[]; v_due boolean;
  v_key text; v_wf_url text; v_hook_url text; v_id uuid; v_calls integer := 0;
BEGIN
  WITH ev AS MATERIALIZED (
    SELECT d.id, d.org_id, d.project_id, d.event_type FROM domain_events d
    WHERE d.dispatched_at IS NULL
    ORDER BY d.occurred_at, d.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), dl AS (
    INSERT INTO webhook_deliveries (subscription_id, domain_event_id, status, attempts, next_retry_at)
    SELECT s.id, ev.id, 'pending', 0, now()
    FROM ev JOIN webhook_subscriptions s ON s.org_id = ev.org_id AND s.enabled
     AND (s.project_id IS NULL OR s.project_id = ev.project_id)
     AND ('*' = ANY (s.event_types) OR ev.event_type = ANY (s.event_types))
    ON CONFLICT (subscription_id, domain_event_id) DO NOTHING
    RETURNING 1
  ), up AS (
    UPDATE domain_events d SET dispatched_at = now() FROM ev WHERE d.id = ev.id RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM up), (SELECT COUNT(*) FROM dl),
         (SELECT array_agg(ev.id) FROM ev WHERE EXISTS (
            SELECT 1 FROM workflow_rules r WHERE r.org_id = ev.org_id AND r.enabled AND r.trigger_event = ev.event_type))
    INTO v_events, v_deliveries, v_wf;

  SELECT EXISTS (SELECT 1 FROM webhook_deliveries w WHERE w.status = 'pending' AND w.next_retry_at <= now()) INTO v_due;

  IF cardinality(COALESCE(v_wf, '{}')) > 0 OR v_due THEN
    BEGIN
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
      SELECT decrypted_secret INTO v_wf_url FROM vault.decrypted_secrets WHERE name = 'edge_function_url';
      SELECT decrypted_secret INTO v_hook_url FROM vault.decrypted_secrets WHERE name = 'webhook_dispatcher_url';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'outbox_dispatch: vault secrets missing';
    END;
    IF v_key IS NOT NULL THEN
      IF v_wf_url IS NOT NULL THEN
        FOREACH v_id IN ARRAY COALESCE(v_wf, '{}') LOOP
          PERFORM net.http_post(url := v_wf_url, body := jsonb_build_object('event_id', v_id),
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
            timeout_milliseconds := 5000);
          v_calls := v_calls + 1;
        END LOOP;
      END IF;
      IF v_due AND v_hook_url IS NOT NULL THEN
        PERFORM net.http_post(url := v_hook_url, body := jsonb_build_object('mode', 'retry'),
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          timeout_milliseconds := 5000);
        v_calls := v_calls + 1;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('events', v_events, 'deliveries', v_deliveries,
                            'workflow_events', cardinality(COALESCE(v_wf, '{}')), 'http_calls', v_calls);
END;
$function$;
