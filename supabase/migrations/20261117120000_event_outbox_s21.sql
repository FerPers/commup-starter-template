-- S21: bus de eventos (outbox).
--   B-03 / I-17  Antes: cada fila escrita insertaba un evento con old/new completos y 3 triggers AFTER INSERT en
--                domain_events hacían 3 net.http_post (dos al mismo dispatcher: entregas duplicadas), aunque la org no
--                tuviera webhooks ni reglas. Ahora domain_events es un outbox: el trigger solo inserta (UPDATE guarda
--                las claves cambiadas en `old`; los cambios que solo tocan updated_at / progress_pct no emiten) y
--                outbox_dispatch(), cada minuto por pg_cron, reparte en lote: entregas de webhook, cola de push y
--                llamadas al evaluador de workflows solo si hay una regla activa para ese evento.
--                Import masivo: con la cabecera x-commup-bulk (solo service_role) no hay eventos por fila; la acción
--                emite un resumen.
--   I-08         Catálogo v1 en singular (tag/itr/punch/certificate/system/subsystem/signal/loop, = lo que ya
--                documentaba /api/v1/events) + eventos de negocio derivados de las transiciones de estado
--                (itr.approved, punch.closed, certificate.issued, gate.approved, transfer.completed…). UNIQUE
--                (subscription, event) en webhook_deliveries. Firma con event_id y timestamp en el dispatcher.
--                Reintentos versionados: pg_cron en esta migración (el job viejo no estaba en el repo).
--   B-11         Push con cola propia (push_outbox) que el cron reclama con SKIP LOCKED: ni ventana fija de 5 min
--                ni duplicados entre corridas solapadas.
--   B-30         Retención diaria: domain_events 365 días (la auditoría de /admin/audit los lee), entregas
--                terminadas 90, notificaciones leídas 180, respuestas de pg_net 2 días. activity_log no se toca.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Outbox
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.domain_events
  ADD COLUMN dispatched_at  timestamptz,
  ADD COLUMN schema_version smallint NOT NULL DEFAULT 1;

-- Lo existente ya pasó por el despacho viejo; nombres al catálogo v1 (singular).
UPDATE public.domain_events SET
  dispatched_at  = occurred_at,
  aggregate_type = CASE aggregate_type WHEN 'tags' THEN 'tag' WHEN 'itrs' THEN 'itr' WHEN 'punches' THEN 'punch'
                     WHEN 'certificates' THEN 'certificate' WHEN 'systems' THEN 'system' WHEN 'subsystems' THEN 'subsystem'
                     WHEN 'signals' THEN 'signal' WHEN 'loops' THEN 'loop' ELSE aggregate_type END,
  event_type     = regexp_replace(event_type, '^(tags|itrs|punches|certificates|systems|subsystems|signals|loops)\.',
                     CASE split_part(event_type, '.', 1) WHEN 'tags' THEN 'tag.' WHEN 'itrs' THEN 'itr.' WHEN 'punches' THEN 'punch.'
                       WHEN 'certificates' THEN 'certificate.' WHEN 'systems' THEN 'system.' WHEN 'subsystems' THEN 'subsystem.'
                       WHEN 'signals' THEN 'signal.' WHEN 'loops' THEN 'loop.' ELSE '' END);
UPDATE public.workflow_rules SET
  trigger_event = regexp_replace(trigger_event, '^(tags|itrs|punches|certificates|systems|subsystems|signals|loops)\.',
                    CASE split_part(trigger_event, '.', 1) WHEN 'tags' THEN 'tag.' WHEN 'itrs' THEN 'itr.' WHEN 'punches' THEN 'punch.'
                      WHEN 'certificates' THEN 'certificate.' WHEN 'systems' THEN 'system.' WHEN 'subsystems' THEN 'subsystem.'
                      WHEN 'signals' THEN 'signal.' WHEN 'loops' THEN 'loop.' ELSE '' END)
WHERE trigger_event ~ '^(tags|itrs|punches|certificates|systems|subsystems|signals|loops)\.';

CREATE INDEX domain_events_outbox_idx ON public.domain_events (occurred_at, id) WHERE dispatched_at IS NULL;
CREATE INDEX domain_events_occurred_brin ON public.domain_events USING brin (occurred_at);

-- Fuera los 3 HTTP por evento.
DROP TRIGGER IF EXISTS on_domain_event_inserted ON public.domain_events;
DROP TRIGGER IF EXISTS trg_dispatch_webhook_event ON public.domain_events;
DROP TRIGGER IF EXISTS trg_dispatch_workflow_evaluator ON public.domain_events;
DROP FUNCTION IF EXISTS public.notify_webhook_dispatcher();
DROP FUNCTION IF EXISTS public.dispatch_webhook_event();
DROP FUNCTION IF EXISTS public.dispatch_workflow_evaluator();

ALTER TABLE public.webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_sub_event_key UNIQUE (subscription_id, domain_event_id);

-- Cola de push (B-11): la llena outbox_dispatch con los tipos que el cron sabe notificar.
CREATE TABLE public.push_outbox (
  event_id  uuid PRIMARY KEY REFERENCES public.domain_events (id) ON DELETE CASCADE,
  queued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_outbox_queued_idx ON public.push_outbox (queued_at);
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_outbox FROM anon, authenticated;

-- = PUSH_EVENT_TYPES en src/lib/constants/domain-events.ts (test de paridad).
CREATE OR REPLACE FUNCTION public.push_event_types()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY['itr.rejected', 'itr.returned', 'punch.created', 'punch.assigned', 'certificate.issued']
$function$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Emisión
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Cambio de fila (catálogo v1) + eventos de negocio de las transiciones de estado de ITR, punch y certificado.
CREATE OR REPLACE FUNCTION public.emit_domain_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agg     text := CASE TG_TABLE_NAME WHEN 'tags' THEN 'tag' WHEN 'itrs' THEN 'itr' WHEN 'punches' THEN 'punch'
                      WHEN 'certificates' THEN 'certificate' WHEN 'systems' THEN 'system' WHEN 'subsystems' THEN 'subsystem'
                      WHEN 'signals' THEN 'signal' WHEN 'loops' THEN 'loop' ELSE TG_TABLE_NAME END;
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_id      uuid;
  v_project uuid;
  v_org     uuid;
  v_changed text[];
  v_events  jsonb := '[]'::jsonb;
  v_prev    text;
  v_next    text;
  v_type    text;
BEGIN
  -- S21 (B-03): import masivo. Solo el service role puede pedirlo (un usuario no puede ocultar sus cambios de la
  -- auditoría); la acción emite un evento de resumen.
  IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
     AND COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-commup-bulk', '') <> '' THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row     := COALESCE(v_new, v_old);
  v_id      := (v_row ->> 'id')::uuid;
  v_project := (v_row ->> 'project_id')::uuid;

  -- signals no tiene project_id: por su lazo o su tag.
  IF v_project IS NULL AND TG_TABLE_NAME = 'signals' THEN
    SELECT l.project_id INTO v_project FROM loops l WHERE l.id = (v_row ->> 'loop_id')::uuid;
    IF v_project IS NULL THEN
      SELECT t.project_id INTO v_project FROM tags t WHERE t.id = (v_row ->> 'tag_id')::uuid;
    END IF;
  END IF;
  IF v_project IS NULL THEN RETURN NULL; END IF;
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = v_project;
  IF v_org IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    v_events := jsonb_build_array(jsonb_build_object('t', v_agg || '.created', 'p', jsonb_build_object('new', v_new)));
    IF v_agg = 'punch' AND v_new ->> 'assigned_to' IS NOT NULL THEN
      v_type := 'punch.assigned';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_events := jsonb_build_array(jsonb_build_object('t', v_agg || '.deleted', 'p', jsonb_build_object('old', v_old)));
  ELSE
    -- I-17: el autosave del ITR solo mueve progress_pct; eso no es un evento.
    SELECT array_agg(k ORDER BY k) INTO v_changed
    FROM jsonb_object_keys(v_new) k
    WHERE v_new -> k IS DISTINCT FROM v_old -> k AND k NOT IN ('updated_at', 'progress_pct');
    IF v_changed IS NULL THEN RETURN NULL; END IF;

    v_events := jsonb_build_array(jsonb_build_object('t', v_agg || '.updated', 'p', jsonb_build_object(
      'changed', to_jsonb(v_changed),
      'old', (SELECT jsonb_object_agg(k, v_old -> k) FROM unnest(v_changed) k),
      'new', v_new)));

    v_prev := v_old ->> 'status';
    v_next := v_new ->> 'status';
    IF v_prev IS DISTINCT FROM v_next THEN
      v_type := CASE v_agg
        WHEN 'itr' THEN CASE v_next WHEN 'completed' THEN 'itr.completed' WHEN 'approved' THEN 'itr.approved'
                                    WHEN 'rejected' THEN 'itr.rejected'
                                    ELSE CASE v_prev WHEN 'approved' THEN 'itr.reopened' WHEN 'completed' THEN 'itr.returned' END END
        WHEN 'punch' THEN CASE v_next WHEN 'closed' THEN 'punch.closed' WHEN 'cancelled' THEN 'punch.cancelled'
                                      ELSE CASE WHEN v_prev IN ('closed', 'cancelled') THEN 'punch.reopened' END END
        WHEN 'certificate' THEN CASE v_next WHEN 'issued' THEN 'certificate.issued' WHEN 'rejected' THEN 'certificate.rejected'
                                            ELSE CASE WHEN v_prev = 'issued' THEN 'certificate.revoked' END END
      END;
    END IF;
    IF v_type IS NULL AND v_agg = 'punch' AND v_new ->> 'assigned_to' IS NOT NULL
       AND v_new -> 'assigned_to' IS DISTINCT FROM v_old -> 'assigned_to' THEN
      v_type := 'punch.assigned';
    END IF;
  END IF;

  IF v_type IS NOT NULL THEN
    v_events := v_events || jsonb_build_array(jsonb_build_object('t', v_type, 'p', jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'project_id', v_project,
      'number', COALESCE(v_new ->> 'itr_number', v_new ->> 'punch_number', v_new ->> 'certificate_number'),
      'status', v_next, 'previous_status', v_prev,
      'subsystem_id', v_new ->> 'subsystem_id', 'tag_id', v_new ->> 'tag_id', 'phase_id', v_new ->> 'phase_id',
      'category', v_new ->> 'category', 'assigned_to', v_new ->> 'assigned_to'))));
  END IF;

  INSERT INTO domain_events (org_id, project_id, aggregate_type, aggregate_id, event_type, payload, actor_id)
  SELECT v_org, v_project, v_agg, v_id, e ->> 't', e -> 'p', auth.uid()
  FROM jsonb_array_elements(v_events) e;
  RETURN NULL;
END;
$function$;

-- Eventos de negocio de readiness: gate aprobado (con todas sus firmas) o revocado, traspaso completado.
CREATE OR REPLACE FUNCTION public.emit_business_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_agg  text;
  v_payload jsonb;
BEGIN
  IF TG_TABLE_NAME = 'system_gate_approvals' THEN
    v_agg := 'gate';
    -- Por ramas: OLD no existe en un INSERT.
    IF TG_OP = 'INSERT' THEN
      IF NEW.revoked_at IS NULL AND NEW.status IN ('approved', 'approved_with_conditions') THEN v_type := 'gate.approved'; END IF;
    ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      v_type := 'gate.revoked';
    ELSIF NEW.revoked_at IS NULL AND NEW.status IN ('approved', 'approved_with_conditions')
          AND OLD.status NOT IN ('approved', 'approved_with_conditions') THEN
      v_type := 'gate.approved';
    END IF;
    IF v_type IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'id', NEW.id, 'project_id', NEW.project_id, 'system_id', NEW.system_id, 'system_code', s.code,
             'gate_id', NEW.gate_id, 'gate_code', g.code, 'status', NEW.status, 'approved_at', NEW.approved_at,
             'revoked_at', NEW.revoked_at))
      INTO v_payload
    FROM systems s, readiness_gates g WHERE s.id = NEW.system_id AND g.id = NEW.gate_id;
  ELSIF TG_TABLE_NAME = 'ownership_transfers' THEN
    v_agg := 'transfer';
    IF NEW.status = 'completed' THEN
      IF TG_OP = 'INSERT' THEN
        v_type := 'transfer.completed';
      ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
        v_type := 'transfer.completed';
      END IF;
    END IF;
    IF v_type IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'id', NEW.id, 'project_id', NEW.project_id, 'number', NEW.number, 'system_id', NEW.system_id,
             'system_code', s.code, 'from_stage', NEW.from_stage, 'to_stage', NEW.to_stage,
             'is_reversal', NEW.is_reversal, 'completed_at', NEW.completed_at))
      INTO v_payload
    FROM systems s WHERE s.id = NEW.system_id;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO domain_events (org_id, project_id, aggregate_type, aggregate_id, event_type, payload, actor_id)
  VALUES (NEW.org_id, NEW.project_id, v_agg, NEW.id, v_type, COALESCE(v_payload, '{}'::jsonb), auth.uid());
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_business_events_gate_approvals AFTER INSERT OR UPDATE ON public.system_gate_approvals
  FOR EACH ROW EXECUTE FUNCTION public.emit_business_event();
CREATE TRIGGER trg_business_events_transfers AFTER INSERT OR UPDATE ON public.ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION public.emit_business_event();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Despacho (solo service_role / pg_cron)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Toma en orden los eventos sin despachar (SKIP LOCKED: dos corridas no se pisan), crea las entregas de webhook y la
-- cola de push, y los marca. Llama al evaluador de workflows solo por los eventos con una regla activa, y al
-- dispatcher de webhooks solo si hay entregas vencidas. Sin suscripciones ni reglas: cero llamadas HTTP.
CREATE OR REPLACE FUNCTION public.outbox_dispatch(p_limit integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_events integer; v_deliveries integer; v_push integer; v_wf uuid[]; v_due boolean;
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
  ), po AS (
    INSERT INTO push_outbox (event_id)
    SELECT ev.id FROM ev WHERE ev.event_type = ANY (public.push_event_types())
    ON CONFLICT (event_id) DO NOTHING
    RETURNING 1
  ), up AS (
    UPDATE domain_events d SET dispatched_at = now() FROM ev WHERE d.id = ev.id RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM up), (SELECT COUNT(*) FROM dl), (SELECT COUNT(*) FROM po),
         (SELECT array_agg(ev.id) FROM ev WHERE EXISTS (
            SELECT 1 FROM workflow_rules r WHERE r.org_id = ev.org_id AND r.enabled AND r.trigger_event = ev.event_type))
    INTO v_events, v_deliveries, v_push, v_wf;

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

  RETURN jsonb_build_object('events', v_events, 'deliveries', v_deliveries, 'push', v_push,
                            'workflow_events', cardinality(COALESCE(v_wf, '{}')), 'http_calls', v_calls);
END;
$function$;

-- Entregas vencidas para el dispatcher. Las reserva 5 min (next_retry_at): una corrida solapada no las repite.
CREATE OR REPLACE FUNCTION public.claim_webhook_deliveries(p_limit integer DEFAULT 100)
 RETURNS TABLE(delivery_id uuid, subscription_id uuid, attempts integer, endpoint_url text, secret text, enabled boolean,
               event_id uuid, event_type text, payload jsonb, occurred_at timestamptz, schema_version smallint)
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

-- Eventos para el cron de push: los saca de la cola al reclamarlos (corridas solapadas no los repiten).
CREATE OR REPLACE FUNCTION public.claim_push_events(p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, org_id uuid, project_id uuid, aggregate_type text, aggregate_id uuid, event_type text,
               payload jsonb, occurred_at timestamptz)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH c AS (
    DELETE FROM push_outbox po
    WHERE po.event_id IN (
      SELECT q.event_id FROM push_outbox q ORDER BY q.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING po.event_id
  )
  SELECT d.id, d.org_id, d.project_id, d.aggregate_type, d.aggregate_id, d.event_type, d.payload, d.occurred_at
  FROM domain_events d JOIN c ON c.event_id = d.id
  ORDER BY d.occurred_at
$function$;

-- B-30: retención diaria (pg_cron). Lotes acotados para no alargar la transacción.
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

  DELETE FROM push_outbox WHERE queued_at < now() - interval '7 days';
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

  RETURN jsonb_build_object('webhook_deliveries', v_deliveries, 'domain_events', v_events, 'push_outbox', v_push,
                            'notifications', v_notifs, 'http_responses', v_http);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.outbox_dispatch(integer), public.claim_webhook_deliveries(integer),
  public.claim_push_events(integer), public.cleanup_event_retention(), public.emit_business_event(),
  public.push_event_types()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbox_dispatch(integer), public.claim_webhook_deliveries(integer),
  public.claim_push_events(integer), public.cleanup_event_retention(), public.push_event_types()
  TO service_role;

-- Programación versionada (el job «webhook-dispatcher-retry» se creó fuera del repo).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('webhook-dispatcher-retry', 'domain-events-outbox', 'event-retention');
SELECT cron.schedule('domain-events-outbox', '* * * * *', 'SELECT public.outbox_dispatch()');
SELECT cron.schedule('event-retention', '30 3 * * *', 'SELECT public.cleanup_event_retention()');
