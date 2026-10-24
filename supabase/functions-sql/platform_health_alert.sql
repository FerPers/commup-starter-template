-- fn: public.platform_health_alert()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.platform_health_alert()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c jsonb; prev platform_health_state; op record; v_n integer := 0; v_detail text; v_key text;
BEGIN
  -- A15 (pg_cron `platform-health`, cada 5 min): un chequeo que PASA a rojo avisa a los operadores (campana y push) y
  -- uno que sale de rojo avisa que se resolvió. Ámbar solo se ve en la página. El estado queda en platform_health_state.
  FOR c IN SELECT value FROM jsonb_array_elements(platform_health_checks()) LOOP
    v_key := c->>'key';
    SELECT * INTO prev FROM platform_health_state WHERE key = v_key;
    v_detail := CASE c->>'code'
      WHEN 'no_runs' THEN 'Sin corridas registradas.'
      WHEN 'last_failed' THEN 'La última corrida falló: ' || COALESCE(c->>'message', 'sin mensaje') || '.'
      WHEN 'stale' THEN 'Sin una corrida correcta hace ' || (c->>'minutes') || ' min.'
      WHEN 'stuck' THEN 'Una corrida lleva ' || (c->>'minutes') || ' min sin terminar.'
      WHEN 'queue_age' THEN (c->>'n') || ' en cola; lo más antiguo espera hace ' || COALESCE(c->>'minutes', '0') || ' min.'
      WHEN 'overdue' THEN (c->>'n') || ' entregas pendientes con el reintento vencido.'
      ELSE COALESCE(c->>'n', '') || ' en las últimas horas.' END;
    IF c->>'status' = 'fail' AND prev.status IS DISTINCT FROM 'fail' THEN
      FOR op IN SELECT user_id, org_id FROM platform_operators LOOP
        v_n := v_n + notify_users(op.org_id, ARRAY[op.user_id], 'platform_health_alert', 'Salud de la plataforma: ' || (c->>'label'),
          v_detail, '/admin/health', jsonb_build_object('check', v_key), v_key || ':' || floor(extract(epoch FROM now()))::bigint);
      END LOOP;
    ELSIF c->>'status' <> 'fail' AND prev.status = 'fail' THEN
      FOR op IN SELECT user_id, org_id FROM platform_operators LOOP
        v_n := v_n + notify_users(op.org_id, ARRAY[op.user_id], 'platform_health_recovered', 'Resuelto: ' || (c->>'label'),
          'Volvió a la normalidad.', '/admin/health', jsonb_build_object('check', v_key), v_key || ':ok:' || floor(extract(epoch FROM now()))::bigint);
      END LOOP;
    END IF;
    INSERT INTO platform_health_state (key, status, since, detail, checked_at) VALUES (v_key, c->>'status', now(), v_detail, now())
    ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, checked_at = now(),
      since = CASE WHEN platform_health_state.status = EXCLUDED.status THEN platform_health_state.since ELSE now() END;
  END LOOP;
  RETURN v_n;
END;
$function$;
