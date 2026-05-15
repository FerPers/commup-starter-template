--
-- PostgreSQL database dump
--

\restrict xH47aHm3BcaoeAmXf6AM40Y2pF3dVYWpCUmUxs3iCSBF6hdRRSHi3c0qpzCcXZO

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: alert_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
);


--
-- Name: cert_signature_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cert_signature_role AS ENUM (
    'completion',
    'client',
    'authority'
);


--
-- Name: certificate_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.certificate_status AS ENUM (
    'pending',
    'in_review',
    'issued',
    'rejected'
);


--
-- Name: itr_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.itr_item_type AS ENUM (
    'checkbox',
    'text',
    'number',
    'measurement',
    'select',
    'photo',
    'signature',
    'date',
    'yes_no'
);


--
-- Name: itr_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.itr_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'approved',
    'rejected'
);


--
-- Name: org_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_member_role AS ENUM (
    'owner',
    'admin',
    'architect',
    'leader',
    'inspector',
    'client'
);


--
-- Name: preservation_frequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.preservation_frequency AS ENUM (
    'daily',
    'weekly',
    'biweekly',
    'monthly',
    'quarterly'
);


--
-- Name: preservation_plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.preservation_plan_status AS ENUM (
    'active',
    'suspended',
    'completed'
);


--
-- Name: preservation_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.preservation_result AS ENUM (
    'ok',
    'nok',
    'na'
);


--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    'planning',
    'active',
    'on_hold',
    'completed',
    'cancelled'
);


--
-- Name: punch_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.punch_category AS ENUM (
    'A',
    'B',
    'C'
);


--
-- Name: punch_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.punch_priority AS ENUM (
    'critical',
    'major',
    'minor'
);


--
-- Name: punch_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.punch_status AS ENUM (
    'open',
    'in_progress',
    'closed',
    'cancelled'
);


--
-- Name: signal_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.signal_type AS ENUM (
    'AI',
    'AO',
    'DI',
    'DO',
    'PI',
    'PO'
);


--
-- Name: signature_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.signature_role AS ENUM (
    'executor',
    'supervisor',
    'client'
);


--
-- Name: tag_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tag_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'on_hold'
);


--
-- Name: work_plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.work_plan_status AS ENUM (
    'draft',
    'published',
    'in_progress',
    'completed'
);


--
-- Name: workflow_action_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workflow_action_type AS ENUM (
    'block_certificate',
    'notify_user',
    'create_punch',
    'change_system_state',
    'webhook_call',
    'suggest_close_itr'
);


--
-- Name: accept_itr_suggestion(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_itr_suggestion(p_suggestion_id uuid, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_project_id UUID;
  v_itr_id     UUID;
BEGIN
  SELECT s.project_id, s.itr_id
    INTO v_project_id, v_itr_id
    FROM itr_suggestions s
   WHERE s.id = p_suggestion_id AND s.status = 'pending';

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Suggestion not found or not pending'; END IF;
  IF NOT is_project_member(v_project_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE itr_suggestions SET
    status          = 'accepted',
    resolved_by     = auth.uid(),
    resolved_at     = now(),
    resolution_note = p_note
  WHERE id = p_suggestion_id;

  RETURN v_itr_id;
END;
$$;


--
-- Name: analytics_project_forecast(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.analytics_project_forecast(p_project_id uuid) RETURNS TABLE(project_id uuid, total_itrs bigint, itrs_approved bigint, itrs_remaining bigint, velocity_per_day numeric, days_to_complete_p50 numeric, eta_p50 date, confidence text, punch_a_open bigint, blockers bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH base AS (
    SELECT
      SUM(ap.total_itrs)       AS total_itrs,
      SUM(ap.itrs_approved)    AS itrs_approved,
      SUM(ap.itrs_remaining)   AS itrs_remaining,
      SUM(ap.punch_a_open)     AS punch_a_open,
      AVG(av.velocity_per_day_30d) AS velocity_per_day
    FROM analytics_subsystem_progress ap
    JOIN analytics_subsystem_velocity av ON av.subsystem_id = ap.subsystem_id
    WHERE ap.project_id = p_project_id
  ),
  calc AS (
    SELECT
      total_itrs,
      itrs_approved,
      itrs_remaining,
      punch_a_open,
      velocity_per_day,
      CASE
        WHEN itrs_remaining = 0 THEN 0
        WHEN COALESCE(velocity_per_day, 0) <= 0 THEN NULL
        ELSE ROUND(itrs_remaining / velocity_per_day, 1)
      END AS days_p50
    FROM base
  )
  SELECT
    p_project_id,
    COALESCE(total_itrs, 0),
    COALESCE(itrs_approved, 0),
    COALESCE(itrs_remaining, 0),
    ROUND(COALESCE(velocity_per_day, 0), 3),
    days_p50,
    CASE WHEN days_p50 IS NULL THEN NULL ELSE (CURRENT_DATE + (days_p50 || ' days')::INTERVAL)::DATE END,
    CASE
      WHEN days_p50 IS NULL THEN 'low'
      WHEN velocity_per_day >= 0.5 THEN 'high'
      WHEN velocity_per_day >= 0.1 THEN 'medium'
      ELSE 'low'
    END,
    COALESCE(punch_a_open, 0),
    COALESCE(punch_a_open, 0)  -- proxy: Cat A abiertos bloquean MC
  FROM calc;
$$;


--
-- Name: bump_push_subscription_failure(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_push_subscription_failure(p_sub_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE push_subscriptions
  SET failure_count   = failure_count + 1,
      last_failure_at = now(),
      enabled         = CASE WHEN failure_count + 1 >= 5 THEN false ELSE enabled END
  WHERE id = p_sub_id;
END;
$$;


--
-- Name: cleanup_signal_samples_retention(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_signal_samples_retention() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.signal_samples
  WHERE sampled_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: FUNCTION cleanup_signal_samples_retention(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cleanup_signal_samples_retention() IS 'Retention job: deletes signal_samples older than 90 days. Invoked by pg_cron daily.';


--
-- Name: compute_project_readiness(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_project_readiness(p_project_id uuid) RETURNS TABLE(system_id uuid, system_code text, system_name text, area_code text, area_name text, itr_total integer, itr_approved integer, itr_pct numeric, open_punches_a integer, open_punches_b integer, open_punches_c integer, ready_mc boolean, ready_rfsu boolean, ready_rfc boolean, blockers jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    s.id,
    s.code,
    s.name,
    a.code,
    a.name,
    r.itr_total,
    r.itr_approved,
    r.itr_pct,
    r.open_punches_a,
    r.open_punches_b,
    r.open_punches_c,
    r.ready_mc,
    r.ready_rfsu,
    r.ready_rfc,
    r.blockers
  FROM systems s
  JOIN areas a ON a.id = s.area_id
  CROSS JOIN LATERAL compute_system_readiness(s.id) r
  WHERE s.project_id = p_project_id
  ORDER BY a.code, s.code;
$$;


--
-- Name: compute_system_readiness(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_system_readiness(p_system_id uuid) RETURNS TABLE(system_id uuid, itr_total integer, itr_approved integer, itr_pct numeric, open_punches_a integer, open_punches_b integer, open_punches_c integer, ready_mc boolean, ready_rfsu boolean, ready_rfc boolean, blockers jsonb)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_itr_total    integer := 0;
  v_itr_approved integer := 0;
  v_itr_pct      numeric := 0;
  v_a            integer := 0;
  v_b            integer := 0;
  v_c            integer := 0;
  v_mc           boolean;
  v_rfsu         boolean;
  v_rfc          boolean;
  v_blockers     jsonb   := '[]'::jsonb;
BEGIN
  -- ── ITR stats vía subsystems ────────────────────────────────
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE i.status = 'approved')::int
  INTO v_itr_total, v_itr_approved
  FROM itrs i
  JOIN subsystems ss ON ss.id = i.subsystem_id
  WHERE ss.system_id = p_system_id;

  IF v_itr_total > 0 THEN
    v_itr_pct := ROUND((v_itr_approved::numeric / v_itr_total) * 100, 2);
  END IF;

  -- ── Punches abiertos por categoría ──────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE p.category = 'A')::int,
    COUNT(*) FILTER (WHERE p.category = 'B')::int,
    COUNT(*) FILTER (WHERE p.category = 'C')::int
  INTO v_a, v_b, v_c
  FROM punches p
  JOIN subsystems ss ON ss.id = p.subsystem_id
  WHERE ss.system_id = p_system_id
    AND p.status IN ('open', 'in_progress');

  -- ── Gates de readiness ──────────────────────────────────────
  v_mc   := (v_itr_total > 0) AND (v_itr_approved = v_itr_total) AND (v_a = 0);
  v_rfsu := v_mc AND (v_b = 0);
  v_rfc  := v_rfsu AND (v_c = 0);

  -- ── Blockers (orden: severidad descendente) ─────────────────
  IF v_itr_total = 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'no_itrs',
      'severity','high',
      'message', 'No ITRs defined for this system'
    ));
  ELSIF v_itr_approved < v_itr_total THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'itrs_incomplete',
      'severity','high',
      'message', format('%s of %s ITRs approved (%s%%)',
                        v_itr_approved, v_itr_total, v_itr_pct),
      'pending', v_itr_total - v_itr_approved
    ));
  END IF;

  IF v_a > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'punches_a_open',
      'severity','high',
      'message', format('%s Category A punch(es) open — blocks MC', v_a),
      'count',   v_a
    ));
  END IF;

  IF v_b > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'punches_b_open',
      'severity','medium',
      'message', format('%s Category B punch(es) open — blocks RFSU', v_b),
      'count',   v_b
    ));
  END IF;

  IF v_c > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'punches_c_open',
      'severity','low',
      'message', format('%s Category C punch(es) open — blocks RFC', v_c),
      'count',   v_c
    ));
  END IF;

  RETURN QUERY SELECT
    p_system_id,
    v_itr_total,
    v_itr_approved,
    v_itr_pct,
    v_a, v_b, v_c,
    v_mc, v_rfsu, v_rfc,
    v_blockers;
END;
$$;


--
-- Name: create_api_key(uuid, text, text[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_api_key(p_org_id uuid, p_name text, p_scopes text[], p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(id uuid, token text, key_prefix text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: create_webhook_subscription(uuid, uuid, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_webhook_subscription(p_org_id uuid, p_project_id uuid, p_name text, p_endpoint_url text, p_event_types text[] DEFAULT ARRAY['*'::text]) RETURNS TABLE(id uuid, secret text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: data_quality_list(uuid, text, text, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.data_quality_list(p_org_id uuid, p_category text DEFAULT NULL::text, p_severity text DEFAULT NULL::text, p_project_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0) RETURNS TABLE(severity text, category text, entity_type text, entity_id uuid, entity_label text, project_id uuid, description text, suggested_fix text, fix_url text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    dq.severity, dq.category, dq.entity_type, dq.entity_id, dq.entity_label,
    dq.project_id, dq.description, dq.suggested_fix, dq.fix_url
  FROM data_quality_issues dq
  WHERE dq.org_id = p_org_id
    AND (p_category IS NULL OR dq.category = p_category)
    AND (p_severity IS NULL OR dq.severity = p_severity)
    AND (p_project_id IS NULL OR dq.project_id = p_project_id)
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = p_org_id AND om.user_id = auth.uid()
    )
  ORDER BY
    CASE dq.severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 ELSE 2 END,
    dq.category,
    dq.entity_label
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: data_quality_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.data_quality_summary(p_org_id uuid) RETURNS TABLE(severity text, category text, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    dq.severity,
    dq.category,
    COUNT(*)
  FROM data_quality_issues dq
  WHERE dq.org_id = p_org_id
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = p_org_id AND om.user_id = auth.uid()
    )
  GROUP BY dq.severity, dq.category
  ORDER BY dq.severity, dq.category;
$$;


--
-- Name: delete_push_subscription(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_push_subscription(p_endpoint text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM push_subscriptions
  WHERE user_id = v_user_id AND endpoint = p_endpoint;
END;
$$;


--
-- Name: delete_webhook_subscription(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_webhook_subscription(p_sub_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: dispatch_webhook_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_webhook_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
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


--
-- Name: FUNCTION dispatch_webhook_event(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.dispatch_webhook_event() IS 'Fires pg_net POST to webhook-dispatcher on every new domain event. Fails silently if vault secrets missing.';


--
-- Name: dispatch_workflow_evaluator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_workflow_evaluator() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_url           TEXT;
  v_service_key   TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'edge_function_url';
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'workflow evaluator: vault secrets missing';
    RETURN NEW;
  END;

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'workflow evaluator: vault secrets missing';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object('event_id', NEW.id),
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;


--
-- Name: emit_domain_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.emit_domain_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_aggregate_type TEXT := TG_TABLE_NAME;
  v_aggregate_id   UUID;
  v_project_id     UUID;
  v_org_id         UUID;
  v_event_type     TEXT;
  v_payload        JSONB;
  v_old_jsonb      JSONB;
  v_new_jsonb      JSONB;
  v_changed_keys   TEXT[];
BEGIN
  -- ── Resolver aggregate_id y project_id según TG_OP ──────────
  IF TG_OP = 'DELETE' THEN
    v_old_jsonb    := to_jsonb(OLD);
    v_aggregate_id := (v_old_jsonb->>'id')::uuid;
    v_project_id   := (v_old_jsonb->>'project_id')::uuid;
  ELSE
    v_new_jsonb    := to_jsonb(NEW);
    v_aggregate_id := (v_new_jsonb->>'id')::uuid;
    v_project_id   := (v_new_jsonb->>'project_id')::uuid;
  END IF;

  -- ── Caso especial: signals (no tiene project_id directo) ────
  IF v_project_id IS NULL AND TG_TABLE_NAME = 'signals' THEN
    -- Primero intenta via loop_id → loops.project_id
    IF TG_OP = 'DELETE' THEN
      SELECT l.project_id INTO v_project_id
      FROM loops l WHERE l.id = (v_old_jsonb->>'loop_id')::uuid;
    ELSE
      SELECT l.project_id INTO v_project_id
      FROM loops l WHERE l.id = (v_new_jsonb->>'loop_id')::uuid;
    END IF;

    -- Fallback via tag_id → tags.project_id
    IF v_project_id IS NULL THEN
      IF TG_OP = 'DELETE' THEN
        SELECT t.project_id INTO v_project_id
        FROM tags t WHERE t.id = (v_old_jsonb->>'tag_id')::uuid;
      ELSE
        SELECT t.project_id INTO v_project_id
        FROM tags t WHERE t.id = (v_new_jsonb->>'tag_id')::uuid;
      END IF;
    END IF;
  END IF;

  -- Si no podemos resolver project_id, no emitimos (silencioso)
  IF v_project_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Derivar org_id del project ──────────────────────────────
  SELECT p.org_id INTO v_org_id FROM projects p WHERE p.id = v_project_id;
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Construir event_type y payload según TG_OP ──────────────
  IF TG_OP = 'INSERT' THEN
    v_event_type := v_aggregate_type || '.created';
    v_payload    := jsonb_build_object('new', v_new_jsonb);

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_jsonb := to_jsonb(OLD);
    -- Calcular campos cambiados
    SELECT ARRAY_AGG(key) INTO v_changed_keys
    FROM jsonb_each(v_new_jsonb) AS new_kv(key, value)
    WHERE new_kv.value IS DISTINCT FROM (v_old_jsonb->new_kv.key);

    -- Si no cambió nada, no emitir
    IF v_changed_keys IS NULL OR array_length(v_changed_keys, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    v_event_type := v_aggregate_type || '.updated';
    v_payload := jsonb_build_object(
      'old',     v_old_jsonb,
      'new',     v_new_jsonb,
      'changed', to_jsonb(v_changed_keys)
    );

  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := v_aggregate_type || '.deleted';
    v_payload    := jsonb_build_object('old', v_old_jsonb);
  END IF;

  -- ── INSERT en domain_events (bypass RLS vía SECURITY DEFINER)
  INSERT INTO domain_events(
    org_id, project_id, aggregate_type, aggregate_id,
    event_type, payload, actor_id
  ) VALUES (
    v_org_id, v_project_id, v_aggregate_type, v_aggregate_id,
    v_event_type, v_payload, auth.uid()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


--
-- Name: evaluate_signal_rules_for_batch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_signal_rules_for_batch(p_batch_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id     UUID;
  v_created    INT := 0;
  rule_rec     RECORD;
  sig_rec      RECORD;
  itr_rec      RECORD;
  v_tolerance  NUMERIC;
  v_stable_sec INT;
  v_max_dev    NUMERIC;
  v_expires_h  INT;
  v_template_match TEXT[];
  v_min_ok     NUMERIC;
  v_max_ok     NUMERIC;
  v_latest_val DOUBLE PRECISION;
  v_latest_at  TIMESTAMPTZ;
  v_window_ok  BOOLEAN;
  v_ok_value   BOOLEAN;
  v_msg        TEXT;
BEGIN
  SELECT org_id INTO v_org_id FROM signal_sample_batches WHERE id = p_batch_id;
  IF v_org_id IS NULL THEN RETURN 0; END IF;

  -- Por cada regla activa del org que dispare en signal.ingested
  FOR rule_rec IN
    SELECT wr.id, wr.action_payload, wr.name
    FROM workflow_rules wr
    WHERE wr.org_id = v_org_id
      AND wr.enabled = TRUE
      AND wr.trigger_event = 'signal.ingested'
      AND wr.action_type   = 'suggest_close_itr'
  LOOP
    v_tolerance       := COALESCE((rule_rec.action_payload->>'tolerance_pct')::numeric, 2.0);
    v_stable_sec      := COALESCE((rule_rec.action_payload->>'stability_window_sec')::int, 30);
    v_max_dev         := COALESCE((rule_rec.action_payload->>'max_deviation_pct')::numeric, 0.5);
    v_expires_h       := COALESCE((rule_rec.action_payload->>'expires_hours')::int, 4);
    v_template_match  := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(rule_rec.action_payload->'itr_template_match')),
      ARRAY['loop','functional']::text[]
    );

    -- Signals afectados por el batch
    FOR sig_rec IN
      SELECT DISTINCT sig.id       AS signal_id,
                      sig.signal_tag,
                      sig.eng_unit,
                      sig.range_min,
                      sig.range_max,
                      sig.tag_id,
                      t.project_id
      FROM signal_samples ss
      JOIN signals sig  ON sig.id = ss.signal_id
      JOIN tags    t    ON t.id   = sig.tag_id
      JOIN projects p   ON p.id   = t.project_id
      WHERE ss.source_batch = p_batch_id
        AND p.org_id = v_org_id
        AND sig.range_min IS NOT NULL
        AND sig.range_max IS NOT NULL
    LOOP
      -- span check
      IF sig_rec.range_max IS NULL OR sig_rec.range_min IS NULL
         OR sig_rec.range_max <= sig_rec.range_min THEN CONTINUE; END IF;

      v_min_ok := sig_rec.range_min - (sig_rec.range_max - sig_rec.range_min) * v_tolerance / 100.0;
      v_max_ok := sig_rec.range_max + (sig_rec.range_max - sig_rec.range_min) * v_tolerance / 100.0;

      -- último valor del batch para la señal
      SELECT ss.value, ss.sampled_at
        INTO v_latest_val, v_latest_at
        FROM signal_samples ss
       WHERE ss.signal_id = sig_rec.signal_id
         AND ss.source_batch = p_batch_id
       ORDER BY ss.sampled_at DESC LIMIT 1;

      IF v_latest_val IS NULL THEN CONTINUE; END IF;
      v_ok_value := v_latest_val BETWEEN v_min_ok AND v_max_ok;
      IF NOT v_ok_value THEN CONTINUE; END IF;

      -- Estabilidad + calidad buena en la ventana
      SELECT
        bool_and(ss.quality = 0)
          AND (MAX(ss.value) - MIN(ss.value)) <= ABS(AVG(ss.value)) * v_max_dev / 100.0
          AND COUNT(*) >= 3
      INTO v_window_ok
      FROM signal_samples ss
      WHERE ss.signal_id = sig_rec.signal_id
        AND ss.sampled_at >= v_latest_at - (v_stable_sec || ' seconds')::interval
        AND ss.sampled_at <= v_latest_at;

      IF v_window_ok IS DISTINCT FROM TRUE THEN CONTINUE; END IF;

      -- Encontrar ITR pendiente para este tag cuyo template matchee keywords
      FOR itr_rec IN
        SELECT i.id, i.itr_number
        FROM itrs i
        JOIN itr_templates tpl ON tpl.id = i.template_id
        WHERE i.tag_id = sig_rec.tag_id
          AND i.project_id = sig_rec.project_id
          AND i.status IN ('not_started','in_progress')
          AND (
            EXISTS (
              SELECT 1 FROM unnest(v_template_match) kw
              WHERE tpl.title ILIKE ('%' || kw || '%')
                 OR tpl.code  ILIKE ('%' || kw || '%')
            )
          )
      LOOP
        v_msg := format('Signal %s responded within range (%s %s) — suggest closing ITR %s',
                        sig_rec.signal_tag,
                        round(v_latest_val::numeric, 3),
                        COALESCE(sig_rec.eng_unit, ''),
                        itr_rec.itr_number);

        INSERT INTO itr_suggestions(
          org_id, project_id, itr_id, rule_id, signal_id, signal_tag,
          signal_value, signal_unit, sampled_at, message,
          pre_filled_data, expires_at
        )
        VALUES (
          v_org_id, sig_rec.project_id, itr_rec.id, rule_rec.id, sig_rec.signal_id,
          sig_rec.signal_tag, v_latest_val, sig_rec.eng_unit, v_latest_at, v_msg,
          jsonb_build_object(
            'measured_value', v_latest_val,
            'test_result',    'pass_provisional',
            'auto_timestamp', v_latest_at
          ),
          now() + (v_expires_h || ' hours')::interval
        )
        ON CONFLICT (itr_id, rule_id) WHERE status = 'pending' DO NOTHING;

        v_created := v_created + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_created;
END;
$$;


--
-- Name: generate_handover_package(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_handover_package(p_project_id uuid, p_system_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_id  UUID;
  v_project JSONB;
  v_systems JSONB;
  v_punches JSONB;
  v_certs   JSONB;
  v_result  JSONB;
BEGIN
  SELECT p.org_id INTO v_org_id FROM projects p WHERE p.id = p_project_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM org_members om
    WHERE om.org_id = v_org_id AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'id',       p.id,
    'name',     p.name,
    'code',     p.code,
    'client',   p.client,
    'location', p.location,
    'status',   p.status,
    'start_date', p.start_date,
    'end_date',   p.end_date
  ) INTO v_project
  FROM projects p
  WHERE p.id = p_project_id;

  WITH scoped_systems AS (
    SELECT s.*
    FROM systems s
    WHERE s.project_id = p_project_id
      AND (p_system_ids IS NULL OR array_length(p_system_ids, 1) IS NULL
           OR s.id = ANY(p_system_ids))
  ),
  sys_tags AS (
    SELECT ss.id AS system_id, t.*
    FROM scoped_systems ss
    JOIN subsystems sub ON sub.system_id = ss.id
    JOIN tags t         ON t.subsystem_id = sub.id
  ),
  sys_itrs AS (
    SELECT ss.id AS system_id, i.*, t.tag_number, t.description AS tag_description
    FROM scoped_systems ss
    JOIN subsystems sub ON sub.system_id = ss.id
    LEFT JOIN tags t    ON t.subsystem_id = sub.id
    JOIN itrs i         ON (i.tag_id = t.id OR (i.tag_id IS NULL AND i.subsystem_id = sub.id))
                        AND i.project_id = p_project_id
  ),
  sys_punches AS (
    SELECT ss.id AS system_id, p.*
    FROM scoped_systems ss
    JOIN subsystems sub ON sub.system_id = ss.id
    JOIN punches p      ON p.subsystem_id = sub.id
                        AND p.project_id  = p_project_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'system_id',   s.id,
      'code',        s.code,
      'name',        s.name,
      'description', s.description,
      'tag_count',      (SELECT COUNT(*) FROM sys_tags    st WHERE st.system_id = s.id),
      'itr_count',      (SELECT COUNT(*) FROM sys_itrs    si WHERE si.system_id = s.id),
      'itr_approved',   (SELECT COUNT(*) FROM sys_itrs    si WHERE si.system_id = s.id AND si.status = 'approved'),
      'punch_summary', jsonb_build_object(
        'cat_a_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'A' AND sp.status IN ('open','in_progress')),
        'cat_b_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'B' AND sp.status IN ('open','in_progress')),
        'cat_c_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'C' AND sp.status IN ('open','in_progress')),
        'total_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.status IN ('open','in_progress'))
      ),
      'itrs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'itr_id',         si.id,
          'itr_number',     si.itr_number,
          'status',         si.status,
          'progress_pct',   si.progress_pct,
          'scheduled_date', si.scheduled_date,
          'completed_date', si.completed_date,
          'tag_number',     si.tag_number,
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'role',      sig.role,
              'user_id',   sig.user_id,
              'signed_at', sig.signed_at,
              'signature_url', sig.signature_url
            ))
            FROM itr_signatures sig WHERE sig.itr_id = si.id
          ), '[]'::jsonb)
        ) ORDER BY si.itr_number)
        FROM sys_itrs si WHERE si.system_id = s.id
      ), '[]'::jsonb),
      'tags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'tag_id',      st.id,
          'tag_number',  st.tag_number,
          'description', st.description,
          'manufacturer', st.manufacturer,
          'model',       st.model,
          'serial_number', st.serial_number,
          'status',      st.status
        ) ORDER BY st.tag_number)
        FROM sys_tags st WHERE st.system_id = s.id
      ), '[]'::jsonb)
    )
    ORDER BY s.code
  )
  INTO v_systems
  FROM scoped_systems s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'punch_id',     pu.id,
    'punch_number', pu.punch_number,
    'category',     pu.category,
    'description',  pu.description,
    'status',       pu.status,
    'priority',     pu.priority,
    'raised_by',    pu.raised_by,
    'assigned_to',  pu.assigned_to,
    'target_date',  pu.target_date,
    'closed_date',  pu.closed_date,
    'subsystem_id', pu.subsystem_id,
    'tag_id',       pu.tag_id,
    'created_at',   pu.created_at
  ) ORDER BY pu.punch_number), '[]'::jsonb)
  INTO v_punches
  FROM punches pu
  JOIN subsystems sub ON sub.id = pu.subsystem_id
  WHERE pu.project_id = p_project_id
    AND pu.category = 'B'
    AND (p_system_ids IS NULL OR array_length(p_system_ids, 1) IS NULL
         OR sub.system_id = ANY(p_system_ids));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'certificate_id',     c.id,
    'certificate_number', c.certificate_number,
    'title',              c.title,
    'status',             c.status,
    'issued_date',        c.issued_date,
    'issued_by',          c.issued_by,
    'approved_by',        c.approved_by,
    'system_id',          c.system_id,
    'subsystem_id',       c.subsystem_id,
    'document_url',       c.document_url
  ) ORDER BY c.certificate_number), '[]'::jsonb)
  INTO v_certs
  FROM certificates c
  WHERE c.project_id = p_project_id
    AND (p_system_ids IS NULL OR array_length(p_system_ids, 1) IS NULL
         OR c.system_id = ANY(p_system_ids));

  v_result := jsonb_build_object(
    'handover_package', jsonb_build_object(
      'schema_version', '2.0',
      'generated_at',   to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'org_id',         v_org_id,
      'project',        v_project,
      'systems',        COALESCE(v_systems, '[]'::jsonb),
      'punch_items',    v_punches,
      'certificates',   v_certs
    )
  );

  RETURN v_result;
END;
$$;


--
-- Name: generate_punch_number(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_punch_number(p_project_id uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_next int;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN punch_number ~ '^\d+$' THEN punch_number::int ELSE 0 END
  ), 0) + 1
  INTO v_next
  FROM punches
  WHERE project_id = p_project_id;
  
  RETURN LPAD(v_next::text, 5, '0');
END;
$_$;


--
-- Name: get_my_org_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_org_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
$$;


--
-- Name: get_org_member_emails(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_org_member_emails(p_org_id uuid) RETURNS TABLE(user_id uuid, email text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT m.user_id, u.email
  FROM org_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.org_id = p_org_id;
$$;


--
-- Name: increment_webhook_failure_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_webhook_failure_count(sub_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE webhook_subscriptions
     SET failure_count = failure_count + 1
   WHERE id = sub_id;
$$;


--
-- Name: ingest_signal_samples(uuid, text, text, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_signal_samples(p_org_id uuid, p_source text, p_source_system text, p_idempotency_key text, p_api_key_id uuid, p_samples jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_batch_id       UUID;
  v_existing_batch RECORD;
  v_accepted       INT := 0;
  v_rejected       INT := 0;
  v_total          INT := COALESCE(jsonb_array_length(p_samples), 0);
  v_errors         JSONB := '[]'::jsonb;
  v_suggestions    INT := 0;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_batch
    FROM signal_sample_batches
    WHERE org_id = p_org_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'batch_id', v_existing_batch.id,
        'accepted', v_existing_batch.accepted_count,
        'rejected', v_existing_batch.rejected_count,
        'total',    v_existing_batch.sample_count,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  INSERT INTO signal_sample_batches(
    org_id, source, source_system, idempotency_key, api_key_id, sample_count
  ) VALUES (
    p_org_id, p_source, p_source_system, p_idempotency_key, p_api_key_id, v_total
  )
  RETURNING id INTO v_batch_id;

  WITH payload AS (
    SELECT
      s.*,
      (item->>'signal_name')::text        AS signal_name,
      (item->>'sampled_at')::timestamptz  AS sampled_at,
      NULLIF(item->>'value','')::double precision AS value,
      COALESCE((item->>'quality')::smallint, 0)   AS quality
    FROM jsonb_array_elements(p_samples) item
    LEFT JOIN LATERAL (
      SELECT sig.id AS signal_id, t.project_id, p.org_id
      FROM signals sig
      JOIN tags t     ON t.id = sig.tag_id
      JOIN projects p ON p.id = t.project_id
      WHERE sig.signal_tag = (item->>'signal_name')
        AND p.org_id = p_org_id
        AND sig.active = TRUE
      LIMIT 1
    ) s ON true
  ),
  to_insert AS (
    SELECT signal_id, sampled_at, value, quality, v_batch_id AS source_batch
    FROM payload WHERE signal_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO signal_samples (signal_id, sampled_at, value, quality, source_batch)
    SELECT signal_id, sampled_at, value, quality, source_batch FROM to_insert
    ON CONFLICT (signal_id, sampled_at) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM inserted),
    (SELECT COUNT(*) FROM payload WHERE signal_id IS NULL),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
       'signal_name', signal_name,
       'reason', 'signal_not_registered'
    )) FROM payload WHERE signal_id IS NULL), '[]'::jsonb)
  INTO v_accepted, v_rejected, v_errors;

  UPDATE signal_sample_batches
     SET accepted_count = v_accepted,
         rejected_count = v_rejected
   WHERE id = v_batch_id;

  -- Trigger reglas auto-commissioning (best-effort; errores no rompen ingesta)
  BEGIN
    v_suggestions := evaluate_signal_rules_for_batch(v_batch_id);
  EXCEPTION WHEN OTHERS THEN
    v_suggestions := -1;
  END;

  RETURN jsonb_build_object(
    'batch_id',     v_batch_id,
    'accepted',     v_accepted,
    'rejected',     v_rejected,
    'total',        v_total,
    'errors',       v_errors,
    'suggestions_created', v_suggestions,
    'idempotent_replay', false
  );
END;
$$;


--
-- Name: is_catalog_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_catalog_org(target_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = target_org_id
      AND COALESCE((settings->>'is_template_catalog')::boolean, false) = true
  );
$$;


--
-- Name: is_org_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_admin(p_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
      AND role IN ('owner', 'admin')
  )
$$;


--
-- Name: is_org_editor(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_editor(p_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
      AND role IN ('owner','admin','architect','leader')
  )
$$;


--
-- Name: is_project_editor(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_project_editor(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin','architect','leader')
  )
$$;


--
-- Name: is_project_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_project_member(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id AND om.user_id = auth.uid()
  )
$$;


--
-- Name: log_sync_conflict(text, text, jsonb, jsonb, timestamp with time zone, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_sync_conflict(p_entity_type text, p_entity_id text, p_local_payload jsonb, p_remote_payload jsonb, p_local_ts timestamp with time zone, p_remote_ts timestamp with time zone, p_winner text, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization membership';
  END IF;

  IF p_winner NOT IN ('local','remote') THEN
    RAISE EXCEPTION 'winner must be local or remote';
  END IF;

  INSERT INTO sync_conflict_log (
    org_id, user_id, entity_type, entity_id,
    local_payload, remote_payload, local_ts, remote_ts,
    winner, resolution, notes
  ) VALUES (
    v_org_id, v_user_id, p_entity_type, p_entity_id,
    p_local_payload, p_remote_payload, p_local_ts, p_remote_ts,
    p_winner, 'lww_auto', p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: next_punch_number_atomic(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_punch_number_atomic(p_project_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_existing INTEGER;
  v_next     INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN punch_number ~ '^P-\d+$'
         THEN SUBSTRING(punch_number FROM 3)::int
         ELSE 0 END
  ), 0)
  INTO v_existing
  FROM punches WHERE project_id = p_project_id;

  INSERT INTO punch_counters (project_id, last_seq)
  VALUES (p_project_id, GREATEST(v_existing, 0) + 1)
  ON CONFLICT (project_id) DO UPDATE
    SET last_seq = GREATEST(punch_counters.last_seq, v_existing) + 1
  RETURNING last_seq INTO v_next;

  RETURN 'P-' || LPAD(v_next::text, 4, '0');
END;
$_$;


--
-- Name: notify_webhook_dispatcher(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_webhook_dispatcher() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_url         TEXT;
  v_service_key TEXT;
BEGIN
  -- Read from vault (silent fail if missing)
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'webhook_dispatcher_url';
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  -- If no webhook dispatcher URL configured, skip silently
  IF v_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object('event_id', NEW.id),
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;


--
-- Name: push_subs_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.push_subs_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: reject_itr_suggestion(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_itr_suggestion(p_suggestion_id uuid, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT s.project_id INTO v_project_id
    FROM itr_suggestions s
   WHERE s.id = p_suggestion_id AND s.status = 'pending';

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Suggestion not found or not pending'; END IF;
  IF NOT is_project_member(v_project_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE itr_suggestions SET
    status          = 'rejected',
    resolved_by     = auth.uid(),
    resolved_at     = now(),
    resolution_note = p_note
  WHERE id = p_suggestion_id;

  RETURN p_suggestion_id;
END;
$$;


--
-- Name: revoke_api_key(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_api_key(p_key_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_webhook_enabled(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_webhook_enabled(p_sub_id uuid, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: tg_workflow_rules_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_workflow_rules_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;


--
-- Name: transfer_punch_to_ops(uuid, uuid, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_punch_to_ops(p_punch_id uuid, p_transferred_to uuid, p_ops_target_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_project_id UUID;
  v_category   TEXT;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.category::text, pu.post_handover_status
    INTO v_project_id, v_category, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Punch not found';
  END IF;

  -- Validar membresía solo si hay user autenticado (UI). Para service_role el endpoint
  -- API ya validó org_id matching antes de invocar.
  IF auth.uid() IS NOT NULL AND NOT is_project_member(v_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_category <> 'B' THEN
    RAISE EXCEPTION 'Only Cat B punches can be transferred to Operations';
  END IF;

  UPDATE punches SET
    post_handover_status   = 'transferred_to_ops',
    transferred_at         = now(),
    transferred_to_user_id = p_transferred_to,
    ops_target_date        = COALESCE(p_ops_target_date, ops_target_date),
    ops_notes              = COALESCE(p_notes, ops_notes),
    assigned_to            = p_transferred_to
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id, 'transferred', COALESCE(v_cur_status, 'active'),
    'transferred_to_ops', auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$$;


--
-- Name: trg_set_punch_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_set_punch_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.punch_number IS NULL OR NEW.punch_number = '' THEN
    NEW.punch_number := next_punch_number_atomic(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_preservation_next_due(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_preservation_next_due() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE preservation_plans
  SET
    last_performed_date = NEW.performed_at::DATE,
    next_due_date = NEW.performed_at::DATE + (
      SELECT interval_days FROM preservation_procedures
      WHERE id = preservation_plans.procedure_id
    )
  WHERE id = NEW.plan_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_punch_ops_status(uuid, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_punch_ops_status(p_punch_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_target_date date DEFAULT NULL::date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_project_id UUID;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.post_handover_status
    INTO v_project_id, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Punch not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT is_project_member(v_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_new_status NOT IN (
    'in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops'
  ) THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN CURRENT_DATE ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur_status, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$$;


--
-- Name: update_push_subscription_topics(text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_push_subscription_topics(p_endpoint text, p_topics text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE push_subscriptions
  SET topics = p_topics, updated_at = now()
  WHERE user_id = v_user_id AND endpoint = p_endpoint;
END;
$$;


--
-- Name: upsert_push_subscription(text, text, text, text[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth_secret text, p_topics text[], p_device_info jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: user_in_project_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_in_project_org(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects pr
    JOIN org_members om ON om.org_id = pr.org_id
    WHERE pr.id = p_project_id
      AND om.user_id = auth.uid()
  )
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    action text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid,
    user_id uuid,
    role text,
    severity public.alert_severity DEFAULT 'info'::public.alert_severity NOT NULL,
    title text NOT NULL,
    message text,
    source_event_id uuid,
    read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itrs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itrs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    template_id uuid NOT NULL,
    tag_id uuid,
    subsystem_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase_id uuid NOT NULL,
    itr_number text NOT NULL,
    status public.itr_status DEFAULT 'not_started'::public.itr_status NOT NULL,
    scheduled_date date,
    completed_date date,
    progress_pct numeric(5,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    location text,
    client text,
    start_date date,
    end_date date,
    status public.project_status DEFAULT 'planning'::public.project_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: punches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    subsystem_id uuid NOT NULL,
    tag_id uuid,
    itr_id uuid,
    preservation_record_id uuid,
    punch_number text NOT NULL,
    category public.punch_category NOT NULL,
    description text NOT NULL,
    discipline_id uuid NOT NULL,
    raised_by uuid NOT NULL,
    assigned_to uuid,
    status public.punch_status DEFAULT 'open'::public.punch_status NOT NULL,
    priority public.punch_priority DEFAULT 'major'::public.punch_priority NOT NULL,
    target_date date,
    closed_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_via text DEFAULT 'manual'::text,
    post_handover_status text,
    transferred_at timestamp with time zone,
    transferred_to_user_id uuid,
    ops_target_date date,
    ops_notes text,
    CONSTRAINT punches_post_handover_status_check CHECK ((post_handover_status = ANY (ARRAY['active'::text, 'transferred_to_ops'::text, 'in_progress_ops'::text, 'deferred'::text, 'resolved_ops'::text, 'verified_ops'::text, 'closed_final'::text, 'cancelled_ops'::text])))
);


--
-- Name: COLUMN punches.created_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.punches.created_via IS 'Origin: manual | workflow | import';


--
-- Name: subsystems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subsystems (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    system_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    current_phase_id uuid,
    completion_pct numeric(5,2) DEFAULT 0 NOT NULL
);


--
-- Name: systems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.systems (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    area_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    current_phase_id uuid
);


--
-- Name: analytics_subsystem_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_subsystem_progress WITH (security_invoker='on') AS
 SELECT s.id AS subsystem_id,
    s.project_id,
    p.org_id,
    s.name AS subsystem_name,
    s.code AS subsystem_code,
    s.completion_pct,
    sys.id AS system_id,
    sys.name AS system_name,
    count(DISTINCT i.id) AS total_itrs,
    count(DISTINCT i.id) FILTER (WHERE (i.status = 'approved'::public.itr_status)) AS itrs_approved,
    count(DISTINCT i.id) FILTER (WHERE (i.status = 'rejected'::public.itr_status)) AS itrs_rejected,
    count(DISTINCT i.id) FILTER (WHERE (i.status = 'in_progress'::public.itr_status)) AS itrs_in_progress,
    count(DISTINCT i.id) FILTER (WHERE (i.status = 'not_started'::public.itr_status)) AS itrs_not_started,
    count(DISTINCT i.id) FILTER (WHERE (i.status = 'completed'::public.itr_status)) AS itrs_completed,
    count(DISTINCT i.id) FILTER (WHERE (i.status <> 'approved'::public.itr_status)) AS itrs_remaining,
    count(DISTINCT pu.id) FILTER (WHERE ((pu.category = 'A'::public.punch_category) AND (pu.status <> ALL (ARRAY['closed'::public.punch_status, 'cancelled'::public.punch_status])))) AS punch_a_open,
    count(DISTINCT pu.id) FILTER (WHERE ((pu.category = 'B'::public.punch_category) AND (pu.status <> ALL (ARRAY['closed'::public.punch_status, 'cancelled'::public.punch_status])))) AS punch_b_open,
    count(DISTINCT pu.id) FILTER (WHERE ((pu.category = 'C'::public.punch_category) AND (pu.status <> ALL (ARRAY['closed'::public.punch_status, 'cancelled'::public.punch_status])))) AS punch_c_open,
    count(DISTINCT pu.id) FILTER (WHERE (pu.status = 'closed'::public.punch_status)) AS punches_closed
   FROM ((((public.subsystems s
     JOIN public.projects p ON ((p.id = s.project_id)))
     JOIN public.systems sys ON ((sys.id = s.system_id)))
     LEFT JOIN public.itrs i ON ((i.subsystem_id = s.id)))
     LEFT JOIN public.punches pu ON ((pu.subsystem_id = s.id)))
  GROUP BY s.id, s.project_id, p.org_id, s.name, s.code, s.completion_pct, sys.id, sys.name;


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    system_id uuid,
    subsystem_id uuid,
    phase_id uuid NOT NULL,
    certificate_number text NOT NULL,
    title text NOT NULL,
    status public.certificate_status DEFAULT 'pending'::public.certificate_status NOT NULL,
    issued_date date,
    issued_by uuid,
    approved_by uuid,
    document_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_blocked boolean DEFAULT false NOT NULL,
    block_reason text,
    notes text
);


--
-- Name: domain_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domain_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    actor_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_bottlenecks; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_bottlenecks WITH (security_invoker='on') AS
 WITH recent_rejects AS (
         SELECT (((de.payload -> 'new'::text) ->> 'subsystem_id'::text))::uuid AS subsystem_id,
            count(*) AS n
           FROM public.domain_events de
          WHERE ((de.aggregate_type = 'itrs'::text) AND (de.event_type = 'itrs.updated'::text) AND (((de.payload -> 'new'::text) ->> 'status'::text) = 'rejected'::text) AND (de.occurred_at >= (now() - '30 days'::interval)))
          GROUP BY (((de.payload -> 'new'::text) ->> 'subsystem_id'::text))::uuid
        ), stalled AS (
         SELECT s.id AS subsystem_id
           FROM (public.subsystems s
             LEFT JOIN public.domain_events de ON (((de.aggregate_type = 'itrs'::text) AND (de.event_type = 'itrs.updated'::text) AND ((((de.payload -> 'new'::text) ->> 'subsystem_id'::text))::uuid = s.id) AND (((de.payload -> 'new'::text) ->> 'status'::text) = 'approved'::text) AND (de.occurred_at >= (now() - '14 days'::interval)))))
          GROUP BY s.id
         HAVING (count(de.*) = 0)
        )
 SELECT ap.subsystem_id,
    ap.project_id,
    ap.org_id,
    ap.subsystem_code,
    ap.subsystem_name,
    ap.system_id,
    ap.system_name,
    ap.itrs_remaining,
    ap.punch_a_open,
    ap.punch_b_open,
    ap.punch_c_open,
    COALESCE(rj.n, (0)::bigint) AS recent_rejects,
    ap.total_itrs,
    ap.itrs_approved,
    LEAST((100)::bigint, ((((
        CASE
            WHEN (ap.punch_a_open > 0) THEN 40
            ELSE 0
        END +
        CASE
            WHEN ((st.subsystem_id IS NOT NULL) AND (ap.itrs_remaining > 0)) THEN 25
            ELSE 0
        END) +
        CASE
            WHEN ((ap.total_itrs > 0) AND (((ap.punch_a_open + ap.punch_b_open) + ap.punch_c_open) > ap.total_itrs)) THEN 20
            ELSE 0
        END) +
        CASE
            WHEN ((EXISTS ( SELECT 1
               FROM public.certificates c
              WHERE ((c.subsystem_id = ap.subsystem_id) AND (c.status <> 'issued'::public.certificate_status)))) AND (ap.punch_a_open > 0)) THEN 10
            ELSE 0
        END) + LEAST((15)::bigint, (COALESCE(rj.n, (0)::bigint) * 5)))) AS bottleneck_score,
    array_remove(ARRAY[
        CASE
            WHEN (ap.punch_a_open > 0) THEN 'punch_a_open'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((st.subsystem_id IS NOT NULL) AND (ap.itrs_remaining > 0)) THEN 'no_velocity_14d'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((ap.total_itrs > 0) AND (((ap.punch_a_open + ap.punch_b_open) + ap.punch_c_open) > ap.total_itrs)) THEN 'punch_ratio_high'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((EXISTS ( SELECT 1
               FROM public.certificates c
              WHERE ((c.subsystem_id = ap.subsystem_id) AND (c.status <> 'issued'::public.certificate_status)))) AND (ap.punch_a_open > 0)) THEN 'cert_blocked'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (COALESCE(rj.n, (0)::bigint) > 0) THEN 'recent_rejections'::text
            ELSE NULL::text
        END], NULL::text) AS reasons
   FROM ((public.analytics_subsystem_progress ap
     LEFT JOIN recent_rejects rj ON ((rj.subsystem_id = ap.subsystem_id)))
     LEFT JOIN stalled st ON ((st.subsystem_id = ap.subsystem_id)));


--
-- Name: VIEW analytics_bottlenecks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.analytics_bottlenecks IS 'Score 0..100 por subsystem. Ordenar DESC para cuellos de botella críticos.';


--
-- Name: analytics_subsystem_velocity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_subsystem_velocity WITH (security_invoker='on') AS
 WITH approvals AS (
         SELECT (((de.payload -> 'new'::text) ->> 'subsystem_id'::text))::uuid AS subsystem_id,
            de.occurred_at
           FROM public.domain_events de
          WHERE ((de.aggregate_type = 'itrs'::text) AND (de.event_type = 'itrs.updated'::text) AND (((de.payload -> 'new'::text) ->> 'status'::text) = 'approved'::text) AND (((de.payload -> 'old'::text) ->> 'status'::text) IS DISTINCT FROM 'approved'::text))
        )
 SELECT s.id AS subsystem_id,
    s.project_id,
    p.org_id,
    count(a.*) FILTER (WHERE (a.occurred_at >= (now() - '30 days'::interval))) AS approvals_30d,
    count(a.*) FILTER (WHERE (a.occurred_at >= (now() - '90 days'::interval))) AS approvals_90d,
    round(((count(a.*) FILTER (WHERE (a.occurred_at >= (now() - '30 days'::interval))))::numeric / 30.0), 3) AS velocity_per_day_30d
   FROM ((public.subsystems s
     JOIN public.projects p ON ((p.id = s.project_id)))
     LEFT JOIN approvals a ON ((a.subsystem_id = s.id)))
  GROUP BY s.id, s.project_id, p.org_id;


--
-- Name: VIEW analytics_subsystem_velocity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.analytics_subsystem_velocity IS 'Velocidad de aprobaciones ITR por subsystem desde domain_events (ventanas 30d/90d).';


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT api_keys_scopes_valid CHECK ((scopes <@ ARRAY['tags:read'::text, 'tags:write'::text, 'itrs:read'::text, 'itrs:write'::text, 'punches:read'::text, 'punches:write'::text, 'certificates:read'::text, 'systems:read'::text, 'events:read'::text, 'handover:read'::text, 'handover:write'::text, 'signals:read'::text, 'signals:write'::text, '*'::text]))
);


--
-- Name: TABLE api_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.api_keys IS 'Stage 13.1 — API keys for public REST API authentication. Token hash only; clear text returned once via create_api_key().';


--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text
);


--
-- Name: cables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cables (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    subsystem_id uuid,
    cable_number text NOT NULL,
    from_tag_id uuid,
    to_tag_id uuid,
    cable_type text,
    size text,
    length_m numeric(10,2),
    status public.tag_status DEFAULT 'not_started'::public.tag_status NOT NULL
);


--
-- Name: certificate_punch_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificate_punch_exceptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    certificate_id uuid NOT NULL,
    punch_id uuid NOT NULL,
    justification text NOT NULL,
    approved_by uuid NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: certificate_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificate_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    certificate_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.cert_signature_role NOT NULL,
    signature_image text,
    comments text,
    signed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itr_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_signatures (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.signature_role NOT NULL,
    signature_url text,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    signature_image text
);


--
-- Name: loop_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loop_tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    loop_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    role_in_loop text
);


--
-- Name: loops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loops (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    subsystem_id uuid NOT NULL,
    loop_number text NOT NULL,
    description text,
    discipline_id uuid NOT NULL,
    status public.tag_status DEFAULT 'not_started'::public.tag_status NOT NULL
);


--
-- Name: signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tag_id uuid NOT NULL,
    loop_id uuid,
    signal_tag text NOT NULL,
    description text,
    signal_type public.signal_type NOT NULL,
    eng_unit text,
    range_min numeric,
    range_max numeric,
    service text,
    alarm_setpoints text,
    origin text,
    destination text,
    pid_drawing text,
    loop_diagram text,
    wiring_diagram text,
    notes text,
    lo_lo numeric,
    lo numeric,
    hi numeric,
    hi_hi numeric,
    source text,
    pi_path text,
    opc_node_id text,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT signals_source_check CHECK ((source = ANY (ARRAY['MANUAL'::text, 'PI'::text, 'OPC_UA'::text, 'MODBUS'::text, 'MQTT'::text])))
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    subsystem_id uuid NOT NULL,
    project_id uuid NOT NULL,
    discipline_id uuid NOT NULL,
    equipment_type_id uuid,
    tag_number text NOT NULL,
    description text NOT NULL,
    manufacturer text,
    model text,
    serial_number text,
    status public.tag_status DEFAULT 'not_started'::public.tag_status NOT NULL,
    preservation_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pid_drawing text,
    range_min numeric,
    range_max numeric,
    eng_unit text,
    sp_h numeric,
    sp_hh numeric,
    sp_l numeric,
    sp_ll numeric,
    signal_type text,
    sil_level text DEFAULT 'None'::text,
    io_address text,
    junction_box text,
    revision text,
    datasheet_number text,
    fluid_type text,
    mounting_typical text,
    nfc_uid text
);


--
-- Name: data_quality_issues; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.data_quality_issues WITH (security_invoker='on') AS
 SELECT 'critical'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    'ITR aprobado sin firma de ejecutor'::text AS description,
    'Solicitar firma antes de validar aprobación'::text AS suggested_fix,
    ((('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id) AS fix_url
   FROM (public.itrs i
     JOIN public.projects p ON ((p.id = i.project_id)))
  WHERE ((i.status = 'approved'::public.itr_status) AND (NOT (EXISTS ( SELECT 1
           FROM public.itr_signatures s
          WHERE ((s.itr_id = i.id) AND (s.role = 'executor'::public.signature_role))))))
UNION ALL
 SELECT 'warning'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    ('ITR con progreso 100% pero status='::text || i.status) AS description,
    'Revisar estado del ITR y avanzar a completed/approved'::text AS suggested_fix,
    ((('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id) AS fix_url
   FROM (public.itrs i
     JOIN public.projects p ON ((p.id = i.project_id)))
  WHERE ((i.progress_pct >= (100)::numeric) AND (i.status <> ALL (ARRAY['approved'::public.itr_status, 'completed'::public.itr_status])))
UNION ALL
 SELECT 'error'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    (('ITR aprobado con progreso '::text || COALESCE(i.progress_pct, (0)::numeric)) || '%'::text) AS description,
    'Completar todos los items antes de aprobar, o revisar aprobación'::text AS suggested_fix,
    ((('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id) AS fix_url
   FROM (public.itrs i
     JOIN public.projects p ON ((p.id = i.project_id)))
  WHERE ((i.status = 'approved'::public.itr_status) AND (COALESCE(i.progress_pct, (0)::numeric) < (100)::numeric))
UNION ALL
 SELECT 'error'::text AS severity,
    'date_logic'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    (((('ITR con completed_date ('::text || i.completed_date) || ') anterior a created_at ('::text) || (i.created_at)::date) || ')'::text) AS description,
    'Corregir fechas. Posible carga manual incorrecta.'::text AS suggested_fix,
    ((('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id) AS fix_url
   FROM (public.itrs i
     JOIN public.projects p ON ((p.id = i.project_id)))
  WHERE ((i.completed_date IS NOT NULL) AND (i.completed_date < (i.created_at)::date))
UNION ALL
 SELECT 'critical'::text AS severity,
    'punch_orphans'::text AS category,
    'punch'::text AS entity_type,
    pu.id AS entity_id,
    pu.punch_number AS entity_label,
    pu.project_id,
    pr.org_id,
    (('Punch Cat A '::text || pu.punch_number) || ' sin ejecutor asignado'::text) AS description,
    'Asignar ejecutor responsable. Bloquea Mechanical Completion.'::text AS suggested_fix,
    ((('/projects/'::text || pu.project_id) || '/punch-list/'::text) || pu.id) AS fix_url
   FROM (public.punches pu
     JOIN public.projects pr ON ((pr.id = pu.project_id)))
  WHERE ((pu.category = 'A'::public.punch_category) AND (pu.status <> ALL (ARRAY['closed'::public.punch_status, 'cancelled'::public.punch_status])) AND (pu.assigned_to IS NULL))
UNION ALL
 SELECT 'error'::text AS severity,
    'date_logic'::text AS category,
    'punch'::text AS entity_type,
    pu.id AS entity_id,
    pu.punch_number AS entity_label,
    pu.project_id,
    pr.org_id,
    (('Punch '::text || pu.punch_number) || ' con closed_date anterior a creación'::text) AS description,
    'Corregir fechas del punch'::text AS suggested_fix,
    ((('/projects/'::text || pu.project_id) || '/punch-list/'::text) || pu.id) AS fix_url
   FROM (public.punches pu
     JOIN public.projects pr ON ((pr.id = pu.project_id)))
  WHERE ((pu.closed_date IS NOT NULL) AND (pu.closed_date < (pu.created_at)::date))
UNION ALL
 SELECT 'warning'::text AS severity,
    'loop_coverage'::text AS category,
    'loop'::text AS entity_type,
    l.id AS entity_id,
    l.loop_number AS entity_label,
    l.project_id,
    pr.org_id,
    (('Loop '::text || l.loop_number) || ' sin instrumentos asignados'::text) AS description,
    'Vincular tags al loop desde el módulo de Loops'::text AS suggested_fix,
    ((('/projects/'::text || l.project_id) || '/loops/'::text) || l.id) AS fix_url
   FROM (public.loops l
     JOIN public.projects pr ON ((pr.id = l.project_id)))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.loop_tags lt
          WHERE (lt.loop_id = l.id))))
UNION ALL
 SELECT 'critical'::text AS severity,
    'certificate_prereqs'::text AS category,
    'certificate'::text AS entity_type,
    c.id AS entity_id,
    c.certificate_number AS entity_label,
    c.project_id,
    pr.org_id,
    (('Certificado '::text || c.certificate_number) || ' emitido con Cat A abiertos'::text) AS description,
    'Revisar y cerrar punches Cat A, o registrar excepción formal'::text AS suggested_fix,
    ((('/projects/'::text || c.project_id) || '/certificates/'::text) || c.id) AS fix_url
   FROM (public.certificates c
     JOIN public.projects pr ON ((pr.id = c.project_id)))
  WHERE ((c.status = 'issued'::public.certificate_status) AND (c.subsystem_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.punches pu
          WHERE ((pu.subsystem_id = c.subsystem_id) AND (pu.category = 'A'::public.punch_category) AND (pu.status <> ALL (ARRAY['closed'::public.punch_status, 'cancelled'::public.punch_status])) AND (NOT (EXISTS ( SELECT 1
                   FROM public.certificate_punch_exceptions cpe
                  WHERE ((cpe.certificate_id = c.id) AND (cpe.punch_id = pu.id)))))))))
UNION ALL
 SELECT 'warning'::text AS severity,
    'system_completeness'::text AS category,
    'subsystem'::text AS entity_type,
    s.id AS entity_id,
    s.code AS entity_label,
    s.project_id,
    pr.org_id,
    (('Subsistema '::text || s.code) || ' tiene tags pero 0 ITRs'::text) AS description,
    'Generar o asignar ITRs desde templates para cubrir los tags'::text AS suggested_fix,
    ((('/projects/'::text || s.project_id) || '/explorer?subsystem='::text) || s.id) AS fix_url
   FROM (public.subsystems s
     JOIN public.projects pr ON ((pr.id = s.project_id)))
  WHERE ((EXISTS ( SELECT 1
           FROM public.tags t
          WHERE (t.subsystem_id = s.id))) AND (NOT (EXISTS ( SELECT 1
           FROM public.itrs i
          WHERE (i.subsystem_id = s.id)))))
UNION ALL
 SELECT 'warning'::text AS severity,
    'system_completeness'::text AS category,
    'signal'::text AS entity_type,
    sg.id AS entity_id,
    sg.signal_tag AS entity_label,
    t.project_id,
    pr.org_id,
    (('Señal '::text || sg.signal_tag) || ' sin loop asignado'::text) AS description,
    'Vincular la señal a un loop o marcar como independiente'::text AS suggested_fix,
    ((('/projects/'::text || t.project_id) || '/tags/'::text) || sg.tag_id) AS fix_url
   FROM ((public.signals sg
     JOIN public.tags t ON ((t.id = sg.tag_id)))
     JOIN public.projects pr ON ((pr.id = t.project_id)))
  WHERE (sg.loop_id IS NULL)
UNION ALL
 SELECT 'warning'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    pr.org_id,
    (((('ITR '::text || i.itr_number) || ' rechazado '::text) || cnt.n) || ' veces (posible problema sistemático)'::text) AS description,
    'Revisar causa raíz: alcance, capacitación o procedimiento'::text AS suggested_fix,
    ((('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id) AS fix_url
   FROM ((public.itrs i
     JOIN public.projects pr ON ((pr.id = i.project_id)))
     JOIN ( SELECT (((de.payload -> 'new'::text) ->> 'id'::text))::uuid AS itr_id,
            count(*) AS n
           FROM public.domain_events de
          WHERE ((de.aggregate_type = 'itrs'::text) AND (de.event_type = 'itrs.updated'::text) AND (((de.payload -> 'new'::text) ->> 'status'::text) = 'rejected'::text))
          GROUP BY (((de.payload -> 'new'::text) ->> 'id'::text))::uuid
         HAVING (count(*) >= 3)) cnt ON ((cnt.itr_id = i.id)));


--
-- Name: VIEW data_quality_issues; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.data_quality_issues IS 'Vista UNION ALL de reglas de calidad de datos. RLS aplicada por tablas base.';


--
-- Name: disciplines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disciplines (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL
);


--
-- Name: equipment_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text
);


--
-- Name: handover_package_systems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.handover_package_systems (
    package_id uuid NOT NULL,
    system_id uuid NOT NULL
);


--
-- Name: handover_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.handover_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    version text DEFAULT '2.0'::text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    json_path text,
    pdf_path text,
    signature_hash text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT handover_packages_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'GENERATING'::text, 'ISSUED'::text, 'FAILED'::text, 'SUPERSEDED'::text])))
);


--
-- Name: interlocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interlocks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    subsystem_id uuid NOT NULL,
    interlock_number text NOT NULL,
    description text NOT NULL,
    cause_tag_id uuid,
    effect_tag_id uuid,
    set_point text,
    action text
);


--
-- Name: itr_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.signature_role NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itr_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_attachments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    item_id uuid,
    response_id uuid,
    file_url text NOT NULL,
    file_type text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid NOT NULL
);


--
-- Name: itr_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_responses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    item_id uuid NOT NULL,
    value_text text,
    value_numeric numeric,
    value_bool boolean,
    value_option text,
    remarks text,
    is_passed boolean,
    responded_at timestamp with time zone,
    responded_by uuid
);


--
-- Name: itr_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    itr_id uuid NOT NULL,
    rule_id uuid,
    signal_id uuid,
    signal_tag text,
    signal_value double precision,
    signal_unit text,
    sampled_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    pre_filled_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    suggested_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_note text,
    CONSTRAINT itr_suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'superseded'::text])))
);


--
-- Name: itr_template_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_template_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    section_id uuid NOT NULL,
    template_id uuid NOT NULL,
    description text NOT NULL,
    item_type public.itr_item_type DEFAULT 'checkbox'::public.itr_item_type NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    is_critical boolean DEFAULT false NOT NULL,
    requires_photo boolean DEFAULT false NOT NULL,
    requires_measurement boolean DEFAULT false NOT NULL,
    options jsonb,
    unit text,
    acceptance_min numeric,
    acceptance_max numeric,
    acceptance_text text,
    order_index integer NOT NULL,
    item_number text,
    description_es text,
    condition_item_id uuid,
    condition_value text
);


--
-- Name: COLUMN itr_template_items.condition_item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.itr_template_items.condition_item_id IS 'If set, this item is only shown when the referenced item has condition_value';


--
-- Name: COLUMN itr_template_items.condition_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.itr_template_items.condition_value IS 'Expected value of condition_item_id for this item to be visible';


--
-- Name: itr_template_items_backup_pre_split; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_template_items_backup_pre_split (
    id uuid,
    section_id uuid,
    template_id uuid,
    description text,
    item_type public.itr_item_type,
    is_required boolean,
    is_critical boolean,
    requires_photo boolean,
    requires_measurement boolean,
    options jsonb,
    unit text,
    acceptance_min numeric,
    acceptance_max numeric,
    acceptance_text text,
    order_index integer,
    item_number text,
    description_es text,
    condition_item_id uuid,
    condition_value text
);


--
-- Name: itr_template_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_template_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    template_id uuid NOT NULL,
    title text NOT NULL,
    order_index integer NOT NULL
);


--
-- Name: itr_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itr_templates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    discipline_id uuid NOT NULL,
    equipment_type_id uuid,
    phase_id uuid NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_global boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_snapshots (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    area_id uuid,
    system_id uuid,
    subsystem_id uuid,
    phase_id uuid,
    total_itrs integer DEFAULT 0 NOT NULL,
    completed_itrs integer DEFAULT 0 NOT NULL,
    total_punches_a integer DEFAULT 0 NOT NULL,
    open_punches_a integer DEFAULT 0 NOT NULL,
    total_punches_b integer DEFAULT 0 NOT NULL,
    open_punches_b integer DEFAULT 0 NOT NULL,
    total_tags integer DEFAULT 0 NOT NULL,
    total_preservation integer DEFAULT 0 NOT NULL,
    overdue_preservation integer DEFAULT 0 NOT NULL,
    completion_pct numeric(5,2) DEFAULT 0 NOT NULL,
    snapshot_date date NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    link_url text,
    payload jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    locale text DEFAULT 'es'::text,
    dashboard_layout jsonb,
    CONSTRAINT profiles_locale_check CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text])))
);


--
-- Name: COLUMN profiles.dashboard_layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.dashboard_layout IS 'Per-user dashboard widget layout. NULL → role-based default. Shape: { widgets: [{ id, hidden }] }.';


--
-- Name: ops_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ops_dashboard WITH (security_invoker='on') AS
 SELECT pu.project_id,
    pu.id AS punch_id,
    pu.punch_number,
    pu.description,
    pu.priority,
    pu.post_handover_status,
    pu.transferred_at,
    pu.transferred_to_user_id,
    pu.ops_target_date,
    pu.ops_notes,
    pu.target_date,
    pu.closed_date,
    pu.subsystem_id,
    sub.code AS subsystem_code,
    sys.code AS system_code,
    sys.name AS system_name,
    pu.tag_id,
    t.tag_number,
    pro.full_name AS assigned_to_name
   FROM ((((public.punches pu
     JOIN public.subsystems sub ON ((sub.id = pu.subsystem_id)))
     JOIN public.systems sys ON ((sys.id = sub.system_id)))
     LEFT JOIN public.tags t ON ((t.id = pu.tag_id)))
     LEFT JOIN public.profiles pro ON ((pro.id = pu.transferred_to_user_id)))
  WHERE ((pu.category = 'B'::public.punch_category) AND (pu.post_handover_status IS NOT NULL));


--
-- Name: org_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.org_member_role DEFAULT 'inspector'::public.org_member_role NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    plan text DEFAULT 'free'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pid_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pid_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    drawing_number text NOT NULL,
    title text,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size integer,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pid_hotspots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pid_hotspots (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    pid_document_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    project_id uuid NOT NULL,
    org_id uuid NOT NULL,
    page_num integer DEFAULT 1 NOT NULL,
    x_pct numeric(6,4) NOT NULL,
    y_pct numeric(6,4) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: preservation_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preservation_attachments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    record_id uuid NOT NULL,
    file_url text NOT NULL,
    file_type text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: preservation_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preservation_plans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tag_id uuid NOT NULL,
    project_id uuid NOT NULL,
    procedure_id uuid NOT NULL,
    responsible_user_id uuid,
    start_date date NOT NULL,
    end_date date,
    last_performed_date date,
    next_due_date date NOT NULL,
    status public.preservation_plan_status DEFAULT 'active'::public.preservation_plan_status NOT NULL
);


--
-- Name: preservation_procedure_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preservation_procedure_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    procedure_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    label text NOT NULL,
    item_type text NOT NULL,
    unit text,
    min_value numeric,
    max_value numeric,
    is_critical boolean DEFAULT false NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT preservation_procedure_items_item_type_check CHECK ((item_type = ANY (ARRAY['checkbox'::text, 'measurement'::text, 'number'::text, 'text'::text, 'yes_no'::text])))
);


--
-- Name: preservation_procedures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preservation_procedures (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    equipment_type_id uuid,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    frequency public.preservation_frequency NOT NULL,
    interval_days integer NOT NULL,
    requires_photo boolean DEFAULT false NOT NULL,
    requires_signature boolean DEFAULT true NOT NULL,
    discipline_id uuid
);


--
-- Name: preservation_record_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preservation_record_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    record_id uuid NOT NULL,
    item_id uuid NOT NULL,
    value_bool boolean,
    value_numeric numeric,
    value_text text,
    is_passed boolean,
    responded_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_by uuid NOT NULL
);


--
-- Name: preservation_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preservation_records (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    plan_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    performed_by uuid NOT NULL,
    performed_at timestamp with time zone NOT NULL,
    result public.preservation_result NOT NULL,
    remarks text,
    punch_raised boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    punch_id uuid,
    status text DEFAULT 'open'::text NOT NULL,
    CONSTRAINT preservation_records_status_check CHECK ((status = ANY (ARRAY['open'::text, 'finalized'::text])))
);


--
-- Name: project_phases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_phases (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    order_index integer NOT NULL,
    color text DEFAULT '#3B82F6'::text NOT NULL,
    certificate_name text
);


--
-- Name: pssr_review_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pssr_review_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    template_item_id uuid,
    item_order integer NOT NULL,
    category text NOT NULL,
    element text NOT NULL,
    requirement text NOT NULL,
    notes_hint text,
    status text DEFAULT 'pending'::text NOT NULL,
    responsible text,
    actions text,
    completion_date date,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pssr_review_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'si'::text, 'no'::text, 'na'::text])))
);


--
-- Name: pssr_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pssr_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    system_id uuid NOT NULL,
    template_id uuid,
    review_number text NOT NULL,
    title text DEFAULT 'Pre-Startup Safety Review'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    rfsu_certificate_id uuid,
    notes text,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    review_due_date date,
    last_overdue_notif_at timestamp with time zone,
    CONSTRAINT pssr_reviews_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: pssr_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pssr_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    user_id uuid NOT NULL,
    discipline text,
    signature_data text NOT NULL,
    signed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pssr_template_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pssr_template_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    item_order integer NOT NULL,
    category text NOT NULL,
    element text NOT NULL,
    requirement text NOT NULL,
    notes_hint text,
    is_required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pssr_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pssr_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: punch_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punch_attachments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    punch_id uuid NOT NULL,
    file_url text NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: punch_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punch_comments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    punch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: punch_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punch_counters (
    project_id uuid NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL
);


--
-- Name: punch_post_handover_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punch_post_handover_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    punch_id uuid NOT NULL,
    event_type text NOT NULL,
    from_status text,
    to_status text,
    performed_by uuid,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    evidence_urls text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT punch_post_handover_events_event_type_check CHECK ((event_type = ANY (ARRAY['transferred'::text, 'status_change'::text, 'note_added'::text, 'evidence_attached'::text, 'closed'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth_secret text NOT NULL,
    topics text[] DEFAULT ARRAY['itr_returned'::text, 'punch_cat_a'::text, 'cert_ready'::text] NOT NULL,
    device_info jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_subscriptions_topics_valid CHECK ((topics <@ ARRAY['itr_returned'::text, 'punch_assigned'::text, 'punch_cat_a'::text, 'cert_ready'::text, 'system_alerts'::text, 'my_items_only'::text]))
);


--
-- Name: signal_sample_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_sample_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    source text,
    source_system text,
    idempotency_key text,
    api_key_id uuid,
    sample_count integer DEFAULT 0 NOT NULL,
    accepted_count integer DEFAULT 0 NOT NULL,
    rejected_count integer DEFAULT 0 NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: signal_samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_samples (
    signal_id uuid NOT NULL,
    sampled_at timestamp with time zone NOT NULL,
    value double precision,
    quality smallint DEFAULT 0 NOT NULL,
    source_batch uuid,
    ingested_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: signal_samples_1min; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.signal_samples_1min WITH (security_invoker='on') AS
 SELECT signal_id,
    date_trunc('minute'::text, sampled_at) AS bucket,
    avg(value) AS avg_val,
    min(value) AS min_val,
    max(value) AS max_val,
    count(*) AS sample_count
   FROM public.signal_samples
  WHERE (quality = 0)
  GROUP BY signal_id, (date_trunc('minute'::text, sampled_at));


--
-- Name: sync_conflict_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_conflict_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    local_payload jsonb NOT NULL,
    remote_payload jsonb,
    local_ts timestamp with time zone NOT NULL,
    remote_ts timestamp with time zone,
    winner text NOT NULL,
    resolution text DEFAULT 'lww_auto'::text NOT NULL,
    resolved_by uuid,
    notes text,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sync_conflict_log_resolution_check CHECK ((resolution = ANY (ARRAY['lww_auto'::text, 'manual_local'::text, 'manual_remote'::text]))),
    CONSTRAINT sync_conflict_log_winner_check CHECK ((winner = ANY (ARRAY['local'::text, 'remote'::text])))
);


--
-- Name: tag_360; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tag_360 WITH (security_invoker='true') AS
 WITH itr_agg AS (
         SELECT i.tag_id,
            count(*) AS itr_total,
            count(*) FILTER (WHERE (i.status = 'approved'::public.itr_status)) AS itr_approved,
            count(*) FILTER (WHERE (i.status <> 'approved'::public.itr_status)) AS itr_open
           FROM public.itrs i
          WHERE (i.tag_id IS NOT NULL)
          GROUP BY i.tag_id
        ), punch_agg AS (
         SELECT p.tag_id,
            count(*) FILTER (WHERE ((p.category = 'A'::public.punch_category) AND (p.status = ANY (ARRAY['open'::public.punch_status, 'in_progress'::public.punch_status])))) AS open_punches_a,
            count(*) FILTER (WHERE ((p.category = 'B'::public.punch_category) AND (p.status = ANY (ARRAY['open'::public.punch_status, 'in_progress'::public.punch_status])))) AS open_punches_b,
            count(*) FILTER (WHERE ((p.category = 'C'::public.punch_category) AND (p.status = ANY (ARRAY['open'::public.punch_status, 'in_progress'::public.punch_status])))) AS open_punches_c,
            count(*) FILTER (WHERE (p.status = ANY (ARRAY['open'::public.punch_status, 'in_progress'::public.punch_status]))) AS open_punches_total
           FROM public.punches p
          WHERE (p.tag_id IS NOT NULL)
          GROUP BY p.tag_id
        ), cert_agg AS (
         SELECT c.subsystem_id,
            count(*) FILTER (WHERE (c.status = 'issued'::public.certificate_status)) AS certs_issued,
            max(c.issued_date) FILTER (WHERE (c.status = 'issued'::public.certificate_status)) AS last_cert_date,
            string_agg(DISTINCT ph.code, ', '::text ORDER BY ph.code) FILTER (WHERE (c.status = 'issued'::public.certificate_status)) AS certs_summary
           FROM (public.certificates c
             LEFT JOIN public.project_phases ph ON ((ph.id = c.phase_id)))
          WHERE (c.subsystem_id IS NOT NULL)
          GROUP BY c.subsystem_id
        ), preserv_agg AS (
         SELECT pp.tag_id,
            count(*) FILTER (WHERE (pp.status = 'active'::public.preservation_plan_status)) AS preservation_active_plans,
            min(pp.next_due_date) FILTER (WHERE (pp.status = 'active'::public.preservation_plan_status)) AS preservation_next_due
           FROM public.preservation_plans pp
          GROUP BY pp.tag_id
        ), hotspot_agg AS (
         SELECT h.tag_id,
            count(*) AS pid_hotspot_count,
            (array_agg(d_1.drawing_number ORDER BY h.created_at))[1] AS first_pid_drawing,
            (array_agg(h.pid_document_id ORDER BY h.created_at))[1] AS first_pid_doc_id
           FROM (public.pid_hotspots h
             JOIN public.pid_documents d_1 ON ((d_1.id = h.pid_document_id)))
          GROUP BY h.tag_id
        )
 SELECT t.id AS tag_id,
    t.project_id,
    pr.org_id,
    t.tag_number,
    t.description,
    (t.status)::text AS tag_status,
    t.manufacturer,
    t.model,
    t.serial_number,
    t.preservation_required,
    t.pid_drawing,
    t.signal_type,
    t.sil_level,
    t.io_address,
    d.id AS discipline_id,
    d.code AS discipline_code,
    d.name AS discipline_name,
    d.color AS discipline_color,
    sub.id AS subsystem_id,
    sub.code AS subsystem_code,
    sub.name AS subsystem_name,
    sys.id AS system_id,
    sys.code AS system_code,
    sys.name AS system_name,
    a.id AS area_id,
    a.code AS area_code,
    a.name AS area_name,
    (COALESCE(ia.itr_total, (0)::bigint))::integer AS itr_total,
    (COALESCE(ia.itr_approved, (0)::bigint))::integer AS itr_approved,
    (COALESCE(ia.itr_open, (0)::bigint))::integer AS itr_open,
        CASE
            WHEN (COALESCE(ia.itr_total, (0)::bigint) = 0) THEN 0
            ELSE (round((((ia.itr_approved)::numeric / (ia.itr_total)::numeric) * (100)::numeric)))::integer
        END AS itr_pct,
        CASE
            WHEN (COALESCE(ia.itr_total, (0)::bigint) = 0) THEN 'grey'::text
            WHEN (ia.itr_approved = ia.itr_total) THEN 'green'::text
            WHEN (ia.itr_approved > 0) THEN 'yellow'::text
            ELSE 'grey'::text
        END AS itr_semaforo,
    (COALESCE(pa.open_punches_a, (0)::bigint))::integer AS open_punches_a,
    (COALESCE(pa.open_punches_b, (0)::bigint))::integer AS open_punches_b,
    (COALESCE(pa.open_punches_c, (0)::bigint))::integer AS open_punches_c,
    (COALESCE(pa.open_punches_total, (0)::bigint))::integer AS open_punches_total,
    (COALESCE(ca.certs_issued, (0)::bigint))::integer AS certs_issued,
    ca.last_cert_date,
    ca.certs_summary,
    pra.preservation_next_due,
    (COALESCE(pra.preservation_active_plans, (0)::bigint))::integer AS preservation_active_plans,
    (COALESCE(ha.pid_hotspot_count, (0)::bigint))::integer AS pid_hotspot_count,
    ha.first_pid_drawing,
    ha.first_pid_doc_id,
        CASE
            WHEN (COALESCE(pa.open_punches_a, (0)::bigint) > 0) THEN 'red'::text
            WHEN (COALESCE(ia.itr_total, (0)::bigint) = 0) THEN 'grey'::text
            WHEN ((ia.itr_approved = ia.itr_total) AND (COALESCE(pa.open_punches_b, (0)::bigint) = 0)) THEN 'green'::text
            ELSE 'yellow'::text
        END AS semaforo_global
   FROM ((((((((((public.tags t
     JOIN public.projects pr ON ((pr.id = t.project_id)))
     JOIN public.subsystems sub ON ((sub.id = t.subsystem_id)))
     JOIN public.systems sys ON ((sys.id = sub.system_id)))
     JOIN public.areas a ON ((a.id = sys.area_id)))
     JOIN public.disciplines d ON ((d.id = t.discipline_id)))
     LEFT JOIN itr_agg ia ON ((ia.tag_id = t.id)))
     LEFT JOIN punch_agg pa ON ((pa.tag_id = t.id)))
     LEFT JOIN cert_agg ca ON ((ca.subsystem_id = sub.id)))
     LEFT JOIN preserv_agg pra ON ((pra.tag_id = t.id)))
     LEFT JOIN hotspot_agg ha ON ((ha.tag_id = t.id)));


--
-- Name: VIEW tag_360; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.tag_360 IS 'Stage 12 Digital Twin — agregado 360° por tag (ITRs, punches, certs, preservation, P&ID hotspots, semáforo).';


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    domain_event_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    last_response_code integer,
    last_response_body text,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'abandoned'::text])))
);


--
-- Name: TABLE webhook_deliveries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_deliveries IS 'Stage 13.4 — Delivery log. Edge function `webhook-dispatcher` creates rows on domain_events INSERT and processes retries.';


--
-- Name: webhook_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid,
    name text NOT NULL,
    endpoint_url text NOT NULL,
    secret text NOT NULL,
    event_types text[] DEFAULT ARRAY['*'::text] NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    last_success_at timestamp with time zone,
    last_error_at timestamp with time zone,
    failure_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT webhook_subscriptions_url_https CHECK ((endpoint_url ~~ 'https://%'::text))
);


--
-- Name: TABLE webhook_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_subscriptions IS 'Stage 13.4 — Outbound webhook endpoints. secret is returned once via create_webhook_subscription().';


--
-- Name: work_plan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_plan_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    work_plan_id uuid NOT NULL,
    itr_id uuid NOT NULL,
    assigned_to uuid NOT NULL,
    status public.tag_status DEFAULT 'not_started'::public.tag_status NOT NULL,
    remarks text,
    p6_activity_id text,
    p6_wbs_code text,
    planned_start date,
    planned_finish date,
    actual_start date,
    actual_finish date,
    duration_days integer,
    p6_sync_at timestamp with time zone,
    title text
);


--
-- Name: COLUMN work_plan_items.p6_activity_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.work_plan_items.p6_activity_id IS 'Primavera P6 Activity ID for bi-directional sync. Stage 13.4';


--
-- Name: work_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_plans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    discipline_id uuid NOT NULL,
    leader_id uuid NOT NULL,
    plan_date date NOT NULL,
    status public.work_plan_status DEFAULT 'draft'::public.work_plan_status NOT NULL,
    notes text
);


--
-- Name: workflow_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid NOT NULL,
    event_id uuid NOT NULL,
    org_id uuid NOT NULL,
    matched boolean NOT NULL,
    action_result jsonb,
    error_message text,
    executed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    trigger_event text NOT NULL,
    condition_jsonlogic jsonb DEFAULT '{}'::jsonb NOT NULL,
    action_type public.workflow_action_type NOT NULL,
    action_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    priority smallint DEFAULT 100 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: areas areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);


--
-- Name: areas areas_project_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_project_id_code_key UNIQUE (project_id, code);


--
-- Name: cables cables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cables
    ADD CONSTRAINT cables_pkey PRIMARY KEY (id);


--
-- Name: cables cables_project_id_cable_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cables
    ADD CONSTRAINT cables_project_id_cable_number_key UNIQUE (project_id, cable_number);


--
-- Name: certificate_punch_exceptions certificate_punch_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_punch_exceptions
    ADD CONSTRAINT certificate_punch_exceptions_pkey PRIMARY KEY (id);


--
-- Name: certificate_signatures certificate_signatures_certificate_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_signatures
    ADD CONSTRAINT certificate_signatures_certificate_id_role_key UNIQUE (certificate_id, role);


--
-- Name: certificate_signatures certificate_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_signatures
    ADD CONSTRAINT certificate_signatures_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_project_id_certificate_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_project_id_certificate_number_key UNIQUE (project_id, certificate_number);


--
-- Name: disciplines disciplines_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disciplines
    ADD CONSTRAINT disciplines_org_id_code_key UNIQUE (org_id, code);


--
-- Name: disciplines disciplines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disciplines
    ADD CONSTRAINT disciplines_pkey PRIMARY KEY (id);


--
-- Name: domain_events domain_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_pkey PRIMARY KEY (id);


--
-- Name: equipment_types equipment_types_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_types
    ADD CONSTRAINT equipment_types_org_id_code_key UNIQUE (org_id, code);


--
-- Name: equipment_types equipment_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_types
    ADD CONSTRAINT equipment_types_pkey PRIMARY KEY (id);


--
-- Name: handover_package_systems handover_package_systems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handover_package_systems
    ADD CONSTRAINT handover_package_systems_pkey PRIMARY KEY (package_id, system_id);


--
-- Name: handover_packages handover_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handover_packages
    ADD CONSTRAINT handover_packages_pkey PRIMARY KEY (id);


--
-- Name: interlocks interlocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interlocks
    ADD CONSTRAINT interlocks_pkey PRIMARY KEY (id);


--
-- Name: interlocks interlocks_project_id_interlock_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interlocks
    ADD CONSTRAINT interlocks_project_id_interlock_number_key UNIQUE (project_id, interlock_number);


--
-- Name: itr_assignments itr_assignments_itr_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_assignments
    ADD CONSTRAINT itr_assignments_itr_id_role_key UNIQUE (itr_id, role);


--
-- Name: itr_assignments itr_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_assignments
    ADD CONSTRAINT itr_assignments_pkey PRIMARY KEY (id);


--
-- Name: itr_attachments itr_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_attachments
    ADD CONSTRAINT itr_attachments_pkey PRIMARY KEY (id);


--
-- Name: itr_responses itr_responses_itr_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_responses
    ADD CONSTRAINT itr_responses_itr_id_item_id_key UNIQUE (itr_id, item_id);


--
-- Name: itr_responses itr_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_responses
    ADD CONSTRAINT itr_responses_pkey PRIMARY KEY (id);


--
-- Name: itr_signatures itr_signatures_itr_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_signatures
    ADD CONSTRAINT itr_signatures_itr_id_role_key UNIQUE (itr_id, role);


--
-- Name: itr_signatures itr_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_signatures
    ADD CONSTRAINT itr_signatures_pkey PRIMARY KEY (id);


--
-- Name: itr_suggestions itr_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_suggestions
    ADD CONSTRAINT itr_suggestions_pkey PRIMARY KEY (id);


--
-- Name: itr_template_items itr_template_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_template_items
    ADD CONSTRAINT itr_template_items_pkey PRIMARY KEY (id);


--
-- Name: itr_template_sections itr_template_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_template_sections
    ADD CONSTRAINT itr_template_sections_pkey PRIMARY KEY (id);


--
-- Name: itr_templates itr_templates_org_id_code_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_templates
    ADD CONSTRAINT itr_templates_org_id_code_version_key UNIQUE (org_id, code, version);


--
-- Name: itr_templates itr_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_templates
    ADD CONSTRAINT itr_templates_pkey PRIMARY KEY (id);


--
-- Name: itrs itrs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itrs
    ADD CONSTRAINT itrs_pkey PRIMARY KEY (id);


--
-- Name: itrs itrs_project_id_itr_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itrs
    ADD CONSTRAINT itrs_project_id_itr_number_key UNIQUE (project_id, itr_number);


--
-- Name: kpi_snapshots kpi_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_pkey PRIMARY KEY (id);


--
-- Name: loop_tags loop_tags_loop_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_tags
    ADD CONSTRAINT loop_tags_loop_id_tag_id_key UNIQUE (loop_id, tag_id);


--
-- Name: loop_tags loop_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_tags
    ADD CONSTRAINT loop_tags_pkey PRIMARY KEY (id);


--
-- Name: loops loops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loops
    ADD CONSTRAINT loops_pkey PRIMARY KEY (id);


--
-- Name: loops loops_project_id_loop_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loops
    ADD CONSTRAINT loops_project_id_loop_number_key UNIQUE (project_id, loop_number);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: org_members org_members_org_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_org_id_user_id_key UNIQUE (org_id, user_id);


--
-- Name: org_members org_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: pid_documents pid_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_documents
    ADD CONSTRAINT pid_documents_pkey PRIMARY KEY (id);


--
-- Name: pid_documents pid_documents_project_id_drawing_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_documents
    ADD CONSTRAINT pid_documents_project_id_drawing_number_key UNIQUE (project_id, drawing_number);


--
-- Name: pid_hotspots pid_hotspots_pid_document_id_tag_id_page_num_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_hotspots
    ADD CONSTRAINT pid_hotspots_pid_document_id_tag_id_page_num_key UNIQUE (pid_document_id, tag_id, page_num);


--
-- Name: pid_hotspots pid_hotspots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_hotspots
    ADD CONSTRAINT pid_hotspots_pkey PRIMARY KEY (id);


--
-- Name: preservation_attachments preservation_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_attachments
    ADD CONSTRAINT preservation_attachments_pkey PRIMARY KEY (id);


--
-- Name: preservation_plans preservation_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_plans
    ADD CONSTRAINT preservation_plans_pkey PRIMARY KEY (id);


--
-- Name: preservation_procedure_items preservation_procedure_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_procedure_items
    ADD CONSTRAINT preservation_procedure_items_pkey PRIMARY KEY (id);


--
-- Name: preservation_procedures preservation_procedures_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_procedures
    ADD CONSTRAINT preservation_procedures_org_id_code_key UNIQUE (org_id, code);


--
-- Name: preservation_procedures preservation_procedures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_procedures
    ADD CONSTRAINT preservation_procedures_pkey PRIMARY KEY (id);


--
-- Name: preservation_record_responses preservation_record_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_record_responses
    ADD CONSTRAINT preservation_record_responses_pkey PRIMARY KEY (id);


--
-- Name: preservation_record_responses preservation_record_responses_record_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_record_responses
    ADD CONSTRAINT preservation_record_responses_record_id_item_id_key UNIQUE (record_id, item_id);


--
-- Name: preservation_records preservation_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_records
    ADD CONSTRAINT preservation_records_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_phases project_phases_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_org_id_code_key UNIQUE (org_id, code);


--
-- Name: project_phases project_phases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_pkey PRIMARY KEY (id);


--
-- Name: projects projects_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_org_id_code_key UNIQUE (org_id, code);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: pssr_review_items pssr_review_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_review_items
    ADD CONSTRAINT pssr_review_items_pkey PRIMARY KEY (id);


--
-- Name: pssr_reviews pssr_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_pkey PRIMARY KEY (id);


--
-- Name: pssr_reviews pssr_reviews_project_id_system_id_review_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_project_id_system_id_review_number_key UNIQUE (project_id, system_id, review_number);


--
-- Name: pssr_signatures pssr_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_signatures
    ADD CONSTRAINT pssr_signatures_pkey PRIMARY KEY (id);


--
-- Name: pssr_signatures pssr_signatures_review_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_signatures
    ADD CONSTRAINT pssr_signatures_review_id_user_id_key UNIQUE (review_id, user_id);


--
-- Name: pssr_template_items pssr_template_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_template_items
    ADD CONSTRAINT pssr_template_items_pkey PRIMARY KEY (id);


--
-- Name: pssr_templates pssr_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_templates
    ADD CONSTRAINT pssr_templates_pkey PRIMARY KEY (id);


--
-- Name: punch_attachments punch_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_attachments
    ADD CONSTRAINT punch_attachments_pkey PRIMARY KEY (id);


--
-- Name: punch_comments punch_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_comments
    ADD CONSTRAINT punch_comments_pkey PRIMARY KEY (id);


--
-- Name: punch_counters punch_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_counters
    ADD CONSTRAINT punch_counters_pkey PRIMARY KEY (project_id);


--
-- Name: punch_post_handover_events punch_post_handover_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_post_handover_events
    ADD CONSTRAINT punch_post_handover_events_pkey PRIMARY KEY (id);


--
-- Name: punches punches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_pkey PRIMARY KEY (id);


--
-- Name: punches punches_project_id_punch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_project_id_punch_number_key UNIQUE (project_id, punch_number);


--
-- Name: push_subscriptions push_subscriptions_endpoint_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_user_unique UNIQUE (user_id, endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: signal_sample_batches signal_sample_batches_org_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_sample_batches
    ADD CONSTRAINT signal_sample_batches_org_id_idempotency_key_key UNIQUE (org_id, idempotency_key);


--
-- Name: signal_sample_batches signal_sample_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_sample_batches
    ADD CONSTRAINT signal_sample_batches_pkey PRIMARY KEY (id);


--
-- Name: signal_samples signal_samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_samples
    ADD CONSTRAINT signal_samples_pkey PRIMARY KEY (signal_id, sampled_at);


--
-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);


--
-- Name: subsystems subsystems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsystems
    ADD CONSTRAINT subsystems_pkey PRIMARY KEY (id);


--
-- Name: subsystems subsystems_project_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsystems
    ADD CONSTRAINT subsystems_project_id_code_key UNIQUE (project_id, code);


--
-- Name: sync_conflict_log sync_conflict_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_conflict_log
    ADD CONSTRAINT sync_conflict_log_pkey PRIMARY KEY (id);


--
-- Name: systems systems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_pkey PRIMARY KEY (id);


--
-- Name: systems systems_project_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_project_id_code_key UNIQUE (project_id, code);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tags tags_project_id_tag_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_project_id_tag_number_key UNIQUE (project_id, tag_number);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhook_subscriptions webhook_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: work_plan_items work_plan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plan_items
    ADD CONSTRAINT work_plan_items_pkey PRIMARY KEY (id);


--
-- Name: work_plans work_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plans
    ADD CONSTRAINT work_plans_pkey PRIMARY KEY (id);


--
-- Name: workflow_executions workflow_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_pkey PRIMARY KEY (id);


--
-- Name: workflow_rules workflow_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_rules
    ADD CONSTRAINT workflow_rules_pkey PRIMARY KEY (id);


--
-- Name: api_keys_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_hash_idx ON public.api_keys USING btree (key_hash);


--
-- Name: api_keys_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_org_idx ON public.api_keys USING btree (org_id);


--
-- Name: idx_activity_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_entity ON public.activity_log USING btree (entity_type, entity_id);


--
-- Name: idx_activity_log_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_org_date ON public.activity_log USING btree (org_id, created_at DESC);


--
-- Name: idx_alerts_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_org_id ON public.alerts USING btree (org_id);


--
-- Name: idx_alerts_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_unread ON public.alerts USING btree (org_id, user_id) WHERE (read = false);


--
-- Name: idx_alerts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_user_id ON public.alerts USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_api_keys_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_hash ON public.api_keys USING btree (key_hash);


--
-- Name: idx_api_keys_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_org ON public.api_keys USING btree (org_id);


--
-- Name: idx_cert_signatures_cert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cert_signatures_cert ON public.certificate_signatures USING btree (certificate_id);


--
-- Name: idx_certificates_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certificates_blocked ON public.certificates USING btree (project_id) WHERE (is_blocked = true);


--
-- Name: idx_domain_events_aggregate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domain_events_aggregate ON public.domain_events USING btree (aggregate_type, aggregate_id);


--
-- Name: idx_domain_events_org_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domain_events_org_time ON public.domain_events USING btree (org_id, occurred_at DESC);


--
-- Name: idx_domain_events_project_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domain_events_project_time ON public.domain_events USING btree (project_id, occurred_at DESC);


--
-- Name: idx_domain_events_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domain_events_type_time ON public.domain_events USING btree (event_type, occurred_at DESC);


--
-- Name: idx_handover_packages_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_handover_packages_project ON public.handover_packages USING btree (project_id, generated_at DESC);


--
-- Name: idx_itr_suggestions_itr_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itr_suggestions_itr_pending ON public.itr_suggestions USING btree (itr_id) WHERE (status = 'pending'::text);


--
-- Name: idx_itr_suggestions_project_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itr_suggestions_project_pending ON public.itr_suggestions USING btree (project_id, suggested_at DESC) WHERE (status = 'pending'::text);


--
-- Name: idx_itr_template_items_condition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itr_template_items_condition ON public.itr_template_items USING btree (condition_item_id) WHERE (condition_item_id IS NOT NULL);


--
-- Name: idx_itrs_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itrs_project ON public.itrs USING btree (project_id);


--
-- Name: idx_itrs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itrs_status ON public.itrs USING btree (status);


--
-- Name: idx_itrs_subsystem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itrs_subsystem ON public.itrs USING btree (subsystem_id);


--
-- Name: idx_itrs_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itrs_tag ON public.itrs USING btree (tag_id);


--
-- Name: idx_kpi_snapshots_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_snapshots_date ON public.kpi_snapshots USING btree (snapshot_date);


--
-- Name: idx_kpi_snapshots_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_snapshots_project ON public.kpi_snapshots USING btree (project_id);


--
-- Name: idx_pid_hotspots_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pid_hotspots_doc ON public.pid_hotspots USING btree (pid_document_id);


--
-- Name: idx_pid_hotspots_proj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pid_hotspots_proj ON public.pid_hotspots USING btree (project_id);


--
-- Name: idx_ppi_procedure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppi_procedure ON public.preservation_procedure_items USING btree (procedure_id);


--
-- Name: idx_preservation_plans_next_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preservation_plans_next_due ON public.preservation_plans USING btree (next_due_date);


--
-- Name: idx_preservation_plans_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preservation_plans_tag ON public.preservation_plans USING btree (tag_id);


--
-- Name: idx_preservation_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preservation_records_status ON public.preservation_records USING btree (plan_id, status);


--
-- Name: idx_prr_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prr_record ON public.preservation_record_responses USING btree (record_id);


--
-- Name: idx_pssr_reviews_due_date_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pssr_reviews_due_date_status ON public.pssr_reviews USING btree (review_due_date, status) WHERE (review_due_date IS NOT NULL);


--
-- Name: idx_punch_pho_events_punch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_punch_pho_events_punch ON public.punch_post_handover_events USING btree (punch_id, performed_at DESC);


--
-- Name: idx_punch_post_handover_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_punch_post_handover_active ON public.punches USING btree (post_handover_status) WHERE ((post_handover_status IS NOT NULL) AND (post_handover_status <> ALL (ARRAY['closed_final'::text, 'cancelled_ops'::text])));


--
-- Name: idx_punches_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_punches_category ON public.punches USING btree (category);


--
-- Name: idx_punches_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_punches_project ON public.punches USING btree (project_id);


--
-- Name: idx_punches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_punches_status ON public.punches USING btree (status);


--
-- Name: idx_punches_subsystem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_punches_subsystem ON public.punches USING btree (subsystem_id);


--
-- Name: idx_push_subs_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subs_enabled ON public.push_subscriptions USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_push_subs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subs_org ON public.push_subscriptions USING btree (org_id);


--
-- Name: idx_push_subs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subs_user ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_signal_batches_org_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signal_batches_org_time ON public.signal_sample_batches USING btree (org_id, received_at DESC);


--
-- Name: idx_signal_samples_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signal_samples_batch ON public.signal_samples USING btree (source_batch) WHERE (source_batch IS NOT NULL);


--
-- Name: idx_signal_samples_sampled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signal_samples_sampled_at ON public.signal_samples USING btree (sampled_at DESC);


--
-- Name: idx_signals_signal_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_signal_tag ON public.signals USING btree (signal_tag);


--
-- Name: idx_sync_conflict_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_conflict_entity ON public.sync_conflict_log USING btree (entity_type, entity_id);


--
-- Name: idx_sync_conflict_org_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_conflict_org_time ON public.sync_conflict_log USING btree (org_id, detected_at DESC);


--
-- Name: idx_sync_conflict_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_conflict_user_time ON public.sync_conflict_log USING btree (user_id, detected_at DESC);


--
-- Name: idx_tags_discipline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_discipline ON public.tags USING btree (discipline_id);


--
-- Name: idx_tags_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_project ON public.tags USING btree (project_id);


--
-- Name: idx_tags_subsystem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_subsystem ON public.tags USING btree (subsystem_id);


--
-- Name: idx_webhook_deliveries_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_pending ON public.webhook_deliveries USING btree (next_retry_at) WHERE (status = 'pending'::text);


--
-- Name: idx_webhook_deliveries_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_sub ON public.webhook_deliveries USING btree (subscription_id, created_at DESC);


--
-- Name: idx_webhook_subs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_subs_org ON public.webhook_subscriptions USING btree (org_id) WHERE enabled;


--
-- Name: idx_webhook_subs_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_subs_project ON public.webhook_subscriptions USING btree (project_id) WHERE enabled;


--
-- Name: idx_workflow_executions_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_event ON public.workflow_executions USING btree (event_id);


--
-- Name: idx_workflow_executions_org_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_org_time ON public.workflow_executions USING btree (org_id, executed_at DESC);


--
-- Name: idx_workflow_executions_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_rule ON public.workflow_executions USING btree (rule_id, executed_at DESC);


--
-- Name: idx_workflow_rules_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_rules_lookup ON public.workflow_rules USING btree (org_id, trigger_event, enabled, priority);


--
-- Name: idx_workflow_rules_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_rules_org ON public.workflow_rules USING btree (org_id);


--
-- Name: notifications_recipient_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_created_idx ON public.notifications USING btree (recipient_user_id, created_at DESC);


--
-- Name: notifications_recipient_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_unread_idx ON public.notifications USING btree (recipient_user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: tags_project_nfc_uid_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_project_nfc_uid_uq ON public.tags USING btree (project_id, nfc_uid) WHERE (nfc_uid IS NOT NULL);


--
-- Name: uq_itr_suggestions_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_itr_suggestions_pending_unique ON public.itr_suggestions USING btree (itr_id, rule_id) WHERE (status = 'pending'::text);


--
-- Name: domain_events on_domain_event_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_domain_event_inserted AFTER INSERT ON public.domain_events FOR EACH ROW EXECUTE FUNCTION public.notify_webhook_dispatcher();


--
-- Name: punches punch_number_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER punch_number_before_insert BEFORE INSERT ON public.punches FOR EACH ROW EXECUTE FUNCTION public.trg_set_punch_number();


--
-- Name: push_subscriptions push_subs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER push_subs_updated_at BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.push_subs_set_updated_at();


--
-- Name: domain_events trg_dispatch_webhook_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dispatch_webhook_event AFTER INSERT ON public.domain_events FOR EACH ROW EXECUTE FUNCTION public.dispatch_webhook_event();


--
-- Name: domain_events trg_dispatch_workflow_evaluator; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dispatch_workflow_evaluator AFTER INSERT ON public.domain_events FOR EACH ROW EXECUTE FUNCTION public.dispatch_workflow_evaluator();


--
-- Name: certificates trg_events_certificates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_certificates AFTER INSERT OR DELETE OR UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: interlocks trg_events_interlocks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_interlocks AFTER INSERT OR DELETE OR UPDATE ON public.interlocks FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: itrs trg_events_itrs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_itrs AFTER INSERT OR DELETE OR UPDATE ON public.itrs FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: loops trg_events_loops; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_loops AFTER INSERT OR DELETE OR UPDATE ON public.loops FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: punches trg_events_punches; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_punches AFTER INSERT OR DELETE OR UPDATE ON public.punches FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: signals trg_events_signals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_signals AFTER INSERT OR DELETE OR UPDATE ON public.signals FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: subsystems trg_events_subsystems; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_subsystems AFTER INSERT OR DELETE OR UPDATE ON public.subsystems FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: systems trg_events_systems; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_systems AFTER INSERT OR DELETE OR UPDATE ON public.systems FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: tags trg_events_tags; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_tags AFTER INSERT OR DELETE OR UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.emit_domain_event();


--
-- Name: preservation_records trg_preservation_next_due; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_preservation_next_due AFTER INSERT ON public.preservation_records FOR EACH ROW EXECUTE FUNCTION public.update_preservation_next_due();


--
-- Name: workflow_rules workflow_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workflow_rules_updated_at BEFORE UPDATE ON public.workflow_rules FOR EACH ROW EXECUTE FUNCTION public.tg_workflow_rules_updated_at();


--
-- Name: activity_log activity_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: activity_log activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: alerts alerts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_source_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.domain_events(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: api_keys api_keys_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: areas areas_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: cables cables_from_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cables
    ADD CONSTRAINT cables_from_tag_id_fkey FOREIGN KEY (from_tag_id) REFERENCES public.tags(id);


--
-- Name: cables cables_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cables
    ADD CONSTRAINT cables_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: cables cables_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cables
    ADD CONSTRAINT cables_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id);


--
-- Name: cables cables_to_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cables
    ADD CONSTRAINT cables_to_tag_id_fkey FOREIGN KEY (to_tag_id) REFERENCES public.tags(id);


--
-- Name: certificate_punch_exceptions certificate_punch_exceptions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_punch_exceptions
    ADD CONSTRAINT certificate_punch_exceptions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: certificate_punch_exceptions certificate_punch_exceptions_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_punch_exceptions
    ADD CONSTRAINT certificate_punch_exceptions_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE CASCADE;


--
-- Name: certificate_punch_exceptions certificate_punch_exceptions_punch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_punch_exceptions
    ADD CONSTRAINT certificate_punch_exceptions_punch_id_fkey FOREIGN KEY (punch_id) REFERENCES public.punches(id);


--
-- Name: certificate_signatures certificate_signatures_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_signatures
    ADD CONSTRAINT certificate_signatures_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE CASCADE;


--
-- Name: certificate_signatures certificate_signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_signatures
    ADD CONSTRAINT certificate_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: certificates certificates_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: certificates certificates_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.profiles(id);


--
-- Name: certificates certificates_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.project_phases(id);


--
-- Name: certificates certificates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: certificates certificates_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id);


--
-- Name: certificates certificates_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id);


--
-- Name: disciplines disciplines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disciplines
    ADD CONSTRAINT disciplines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: domain_events domain_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: domain_events domain_events_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: domain_events domain_events_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_events
    ADD CONSTRAINT domain_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: equipment_types equipment_types_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_types
    ADD CONSTRAINT equipment_types_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: handover_package_systems handover_package_systems_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handover_package_systems
    ADD CONSTRAINT handover_package_systems_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.handover_packages(id) ON DELETE CASCADE;


--
-- Name: handover_package_systems handover_package_systems_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handover_package_systems
    ADD CONSTRAINT handover_package_systems_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: handover_packages handover_packages_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handover_packages
    ADD CONSTRAINT handover_packages_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: handover_packages handover_packages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handover_packages
    ADD CONSTRAINT handover_packages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: handover_packages handover_packages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handover_packages
    ADD CONSTRAINT handover_packages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: interlocks interlocks_cause_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interlocks
    ADD CONSTRAINT interlocks_cause_tag_id_fkey FOREIGN KEY (cause_tag_id) REFERENCES public.tags(id);


--
-- Name: interlocks interlocks_effect_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interlocks
    ADD CONSTRAINT interlocks_effect_tag_id_fkey FOREIGN KEY (effect_tag_id) REFERENCES public.tags(id);


--
-- Name: interlocks interlocks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interlocks
    ADD CONSTRAINT interlocks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: interlocks interlocks_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interlocks
    ADD CONSTRAINT interlocks_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id) ON DELETE CASCADE;


--
-- Name: itr_assignments itr_assignments_itr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_assignments
    ADD CONSTRAINT itr_assignments_itr_id_fkey FOREIGN KEY (itr_id) REFERENCES public.itrs(id) ON DELETE CASCADE;


--
-- Name: itr_assignments itr_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_assignments
    ADD CONSTRAINT itr_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: itr_attachments itr_attachments_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_attachments
    ADD CONSTRAINT itr_attachments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.itr_template_items(id);


--
-- Name: itr_attachments itr_attachments_itr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_attachments
    ADD CONSTRAINT itr_attachments_itr_id_fkey FOREIGN KEY (itr_id) REFERENCES public.itrs(id) ON DELETE CASCADE;


--
-- Name: itr_attachments itr_attachments_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_attachments
    ADD CONSTRAINT itr_attachments_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.itr_responses(id);


--
-- Name: itr_attachments itr_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_attachments
    ADD CONSTRAINT itr_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: itr_responses itr_responses_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_responses
    ADD CONSTRAINT itr_responses_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.itr_template_items(id);


--
-- Name: itr_responses itr_responses_itr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_responses
    ADD CONSTRAINT itr_responses_itr_id_fkey FOREIGN KEY (itr_id) REFERENCES public.itrs(id) ON DELETE CASCADE;


--
-- Name: itr_responses itr_responses_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_responses
    ADD CONSTRAINT itr_responses_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES public.profiles(id);


--
-- Name: itr_signatures itr_signatures_itr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_signatures
    ADD CONSTRAINT itr_signatures_itr_id_fkey FOREIGN KEY (itr_id) REFERENCES public.itrs(id) ON DELETE CASCADE;


--
-- Name: itr_signatures itr_signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_signatures
    ADD CONSTRAINT itr_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: itr_suggestions itr_suggestions_itr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_suggestions
    ADD CONSTRAINT itr_suggestions_itr_id_fkey FOREIGN KEY (itr_id) REFERENCES public.itrs(id) ON DELETE CASCADE;


--
-- Name: itr_suggestions itr_suggestions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_suggestions
    ADD CONSTRAINT itr_suggestions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: itr_suggestions itr_suggestions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_suggestions
    ADD CONSTRAINT itr_suggestions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: itr_suggestions itr_suggestions_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_suggestions
    ADD CONSTRAINT itr_suggestions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: itr_suggestions itr_suggestions_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_suggestions
    ADD CONSTRAINT itr_suggestions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.workflow_rules(id) ON DELETE SET NULL;


--
-- Name: itr_suggestions itr_suggestions_signal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_suggestions
    ADD CONSTRAINT itr_suggestions_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE SET NULL;


--
-- Name: itr_template_items itr_template_items_condition_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_template_items
    ADD CONSTRAINT itr_template_items_condition_item_id_fkey FOREIGN KEY (condition_item_id) REFERENCES public.itr_template_items(id) ON DELETE SET NULL;


--
-- Name: itr_template_items itr_template_items_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_template_items
    ADD CONSTRAINT itr_template_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.itr_template_sections(id) ON DELETE CASCADE;


--
-- Name: itr_template_items itr_template_items_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_template_items
    ADD CONSTRAINT itr_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.itr_templates(id) ON DELETE CASCADE;


--
-- Name: itr_template_sections itr_template_sections_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_template_sections
    ADD CONSTRAINT itr_template_sections_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.itr_templates(id) ON DELETE CASCADE;


--
-- Name: itr_templates itr_templates_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_templates
    ADD CONSTRAINT itr_templates_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.disciplines(id);


--
-- Name: itr_templates itr_templates_equipment_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_templates
    ADD CONSTRAINT itr_templates_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES public.equipment_types(id);


--
-- Name: itr_templates itr_templates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_templates
    ADD CONSTRAINT itr_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: itr_templates itr_templates_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itr_templates
    ADD CONSTRAINT itr_templates_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.project_phases(id);


--
-- Name: itrs itrs_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itrs
    ADD CONSTRAINT itrs_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.project_phases(id);


--
-- Name: itrs itrs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itrs
    ADD CONSTRAINT itrs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: itrs itrs_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itrs
    ADD CONSTRAINT itrs_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id) ON DELETE CASCADE;


--
-- Name: itrs itrs_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itrs
    ADD CONSTRAINT itrs_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id);


--
-- Name: itrs itrs_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itrs
    ADD CONSTRAINT itrs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.itr_templates(id);


--
-- Name: kpi_snapshots kpi_snapshots_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id);


--
-- Name: kpi_snapshots kpi_snapshots_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.project_phases(id);


--
-- Name: kpi_snapshots kpi_snapshots_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: kpi_snapshots kpi_snapshots_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id);


--
-- Name: kpi_snapshots kpi_snapshots_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id);


--
-- Name: loop_tags loop_tags_loop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_tags
    ADD CONSTRAINT loop_tags_loop_id_fkey FOREIGN KEY (loop_id) REFERENCES public.loops(id) ON DELETE CASCADE;


--
-- Name: loop_tags loop_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_tags
    ADD CONSTRAINT loop_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: loops loops_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loops
    ADD CONSTRAINT loops_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.disciplines(id);


--
-- Name: loops loops_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loops
    ADD CONSTRAINT loops_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: loops loops_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loops
    ADD CONSTRAINT loops_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pid_documents pid_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_documents
    ADD CONSTRAINT pid_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: pid_documents pid_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_documents
    ADD CONSTRAINT pid_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: pid_hotspots pid_hotspots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_hotspots
    ADD CONSTRAINT pid_hotspots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: pid_hotspots pid_hotspots_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_hotspots
    ADD CONSTRAINT pid_hotspots_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pid_hotspots pid_hotspots_pid_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_hotspots
    ADD CONSTRAINT pid_hotspots_pid_document_id_fkey FOREIGN KEY (pid_document_id) REFERENCES public.pid_documents(id) ON DELETE CASCADE;


--
-- Name: pid_hotspots pid_hotspots_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_hotspots
    ADD CONSTRAINT pid_hotspots_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: pid_hotspots pid_hotspots_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pid_hotspots
    ADD CONSTRAINT pid_hotspots_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: preservation_attachments preservation_attachments_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_attachments
    ADD CONSTRAINT preservation_attachments_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.preservation_records(id) ON DELETE CASCADE;


--
-- Name: preservation_plans preservation_plans_procedure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_plans
    ADD CONSTRAINT preservation_plans_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.preservation_procedures(id);


--
-- Name: preservation_plans preservation_plans_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_plans
    ADD CONSTRAINT preservation_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: preservation_plans preservation_plans_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_plans
    ADD CONSTRAINT preservation_plans_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.profiles(id);


--
-- Name: preservation_plans preservation_plans_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_plans
    ADD CONSTRAINT preservation_plans_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: preservation_procedure_items preservation_procedure_items_procedure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_procedure_items
    ADD CONSTRAINT preservation_procedure_items_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.preservation_procedures(id) ON DELETE CASCADE;


--
-- Name: preservation_procedures preservation_procedures_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_procedures
    ADD CONSTRAINT preservation_procedures_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.disciplines(id) ON DELETE SET NULL;


--
-- Name: preservation_procedures preservation_procedures_equipment_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_procedures
    ADD CONSTRAINT preservation_procedures_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES public.equipment_types(id);


--
-- Name: preservation_procedures preservation_procedures_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_procedures
    ADD CONSTRAINT preservation_procedures_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: preservation_record_responses preservation_record_responses_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_record_responses
    ADD CONSTRAINT preservation_record_responses_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.preservation_procedure_items(id) ON DELETE CASCADE;


--
-- Name: preservation_record_responses preservation_record_responses_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_record_responses
    ADD CONSTRAINT preservation_record_responses_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.preservation_records(id) ON DELETE CASCADE;


--
-- Name: preservation_record_responses preservation_record_responses_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_record_responses
    ADD CONSTRAINT preservation_record_responses_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES auth.users(id);


--
-- Name: preservation_records preservation_records_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_records
    ADD CONSTRAINT preservation_records_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);


--
-- Name: preservation_records preservation_records_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_records
    ADD CONSTRAINT preservation_records_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.preservation_plans(id) ON DELETE CASCADE;


--
-- Name: preservation_records preservation_records_punch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_records
    ADD CONSTRAINT preservation_records_punch_id_fkey FOREIGN KEY (punch_id) REFERENCES public.punches(id) ON DELETE SET NULL;


--
-- Name: preservation_records preservation_records_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preservation_records
    ADD CONSTRAINT preservation_records_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_phases project_phases_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: projects projects_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pssr_review_items pssr_review_items_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_review_items
    ADD CONSTRAINT pssr_review_items_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.pssr_reviews(id) ON DELETE CASCADE;


--
-- Name: pssr_review_items pssr_review_items_template_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_review_items
    ADD CONSTRAINT pssr_review_items_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES public.pssr_template_items(id);


--
-- Name: pssr_review_items pssr_review_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_review_items
    ADD CONSTRAINT pssr_review_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: pssr_reviews pssr_reviews_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: pssr_reviews pssr_reviews_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: pssr_reviews pssr_reviews_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: pssr_reviews pssr_reviews_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: pssr_reviews pssr_reviews_rfsu_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_rfsu_certificate_id_fkey FOREIGN KEY (rfsu_certificate_id) REFERENCES public.certificates(id);


--
-- Name: pssr_reviews pssr_reviews_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id);


--
-- Name: pssr_reviews pssr_reviews_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_reviews
    ADD CONSTRAINT pssr_reviews_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.pssr_templates(id);


--
-- Name: pssr_signatures pssr_signatures_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_signatures
    ADD CONSTRAINT pssr_signatures_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.pssr_reviews(id) ON DELETE CASCADE;


--
-- Name: pssr_signatures pssr_signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_signatures
    ADD CONSTRAINT pssr_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: pssr_template_items pssr_template_items_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_template_items
    ADD CONSTRAINT pssr_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.pssr_templates(id) ON DELETE CASCADE;


--
-- Name: pssr_templates pssr_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_templates
    ADD CONSTRAINT pssr_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: pssr_templates pssr_templates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pssr_templates
    ADD CONSTRAINT pssr_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: punch_attachments punch_attachments_punch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_attachments
    ADD CONSTRAINT punch_attachments_punch_id_fkey FOREIGN KEY (punch_id) REFERENCES public.punches(id) ON DELETE CASCADE;


--
-- Name: punch_attachments punch_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_attachments
    ADD CONSTRAINT punch_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: punch_comments punch_comments_punch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_comments
    ADD CONSTRAINT punch_comments_punch_id_fkey FOREIGN KEY (punch_id) REFERENCES public.punches(id) ON DELETE CASCADE;


--
-- Name: punch_comments punch_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_comments
    ADD CONSTRAINT punch_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: punch_counters punch_counters_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_counters
    ADD CONSTRAINT punch_counters_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: punch_post_handover_events punch_post_handover_events_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_post_handover_events
    ADD CONSTRAINT punch_post_handover_events_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: punch_post_handover_events punch_post_handover_events_punch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_post_handover_events
    ADD CONSTRAINT punch_post_handover_events_punch_id_fkey FOREIGN KEY (punch_id) REFERENCES public.punches(id) ON DELETE CASCADE;


--
-- Name: punches punches_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: punches punches_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.disciplines(id);


--
-- Name: punches punches_itr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_itr_id_fkey FOREIGN KEY (itr_id) REFERENCES public.itrs(id);


--
-- Name: punches punches_preservation_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_preservation_record_id_fkey FOREIGN KEY (preservation_record_id) REFERENCES public.preservation_records(id);


--
-- Name: punches punches_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: punches punches_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.profiles(id);


--
-- Name: punches punches_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id);


--
-- Name: punches punches_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id);


--
-- Name: punches punches_transferred_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punches
    ADD CONSTRAINT punches_transferred_to_user_id_fkey FOREIGN KEY (transferred_to_user_id) REFERENCES public.profiles(id);


--
-- Name: push_subscriptions push_subscriptions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: signal_sample_batches signal_sample_batches_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_sample_batches
    ADD CONSTRAINT signal_sample_batches_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;


--
-- Name: signal_sample_batches signal_sample_batches_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_sample_batches
    ADD CONSTRAINT signal_sample_batches_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: signal_samples signal_samples_signal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_samples
    ADD CONSTRAINT signal_samples_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE CASCADE;


--
-- Name: signals signals_loop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_loop_id_fkey FOREIGN KEY (loop_id) REFERENCES public.loops(id) ON DELETE SET NULL;


--
-- Name: signals signals_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: subsystems subsystems_current_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsystems
    ADD CONSTRAINT subsystems_current_phase_id_fkey FOREIGN KEY (current_phase_id) REFERENCES public.project_phases(id);


--
-- Name: subsystems subsystems_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsystems
    ADD CONSTRAINT subsystems_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: subsystems subsystems_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsystems
    ADD CONSTRAINT subsystems_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.systems(id) ON DELETE CASCADE;


--
-- Name: sync_conflict_log sync_conflict_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_conflict_log
    ADD CONSTRAINT sync_conflict_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sync_conflict_log sync_conflict_log_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_conflict_log
    ADD CONSTRAINT sync_conflict_log_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sync_conflict_log sync_conflict_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_conflict_log
    ADD CONSTRAINT sync_conflict_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: systems systems_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE CASCADE;


--
-- Name: systems systems_current_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_current_phase_id_fkey FOREIGN KEY (current_phase_id) REFERENCES public.project_phases(id);


--
-- Name: systems systems_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systems
    ADD CONSTRAINT systems_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tags tags_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.disciplines(id);


--
-- Name: tags tags_equipment_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES public.equipment_types(id);


--
-- Name: tags tags_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tags tags_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_domain_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_domain_event_id_fkey FOREIGN KEY (domain_event_id) REFERENCES public.domain_events(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE;


--
-- Name: webhook_subscriptions webhook_subscriptions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: webhook_subscriptions webhook_subscriptions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: webhook_subscriptions webhook_subscriptions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: work_plan_items work_plan_items_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plan_items
    ADD CONSTRAINT work_plan_items_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: work_plan_items work_plan_items_itr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plan_items
    ADD CONSTRAINT work_plan_items_itr_id_fkey FOREIGN KEY (itr_id) REFERENCES public.itrs(id);


--
-- Name: work_plan_items work_plan_items_work_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plan_items
    ADD CONSTRAINT work_plan_items_work_plan_id_fkey FOREIGN KEY (work_plan_id) REFERENCES public.work_plans(id) ON DELETE CASCADE;


--
-- Name: work_plans work_plans_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plans
    ADD CONSTRAINT work_plans_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.disciplines(id);


--
-- Name: work_plans work_plans_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plans
    ADD CONSTRAINT work_plans_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id);


--
-- Name: work_plans work_plans_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_plans
    ADD CONSTRAINT work_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: workflow_executions workflow_executions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.domain_events(id) ON DELETE CASCADE;


--
-- Name: workflow_executions workflow_executions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_executions workflow_executions_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.workflow_rules(id) ON DELETE CASCADE;


--
-- Name: workflow_rules workflow_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_rules
    ADD CONSTRAINT workflow_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: workflow_rules workflow_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_rules
    ADD CONSTRAINT workflow_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log activity_log_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_log_insert ON public.activity_log FOR INSERT WITH CHECK ((org_id IN ( SELECT org_members.org_id
   FROM public.org_members
  WHERE (org_members.user_id = auth.uid()))));


--
-- Name: activity_log activity_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_log_select ON public.activity_log FOR SELECT USING ((org_id IN ( SELECT org_members.org_id
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role]))))));


--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: alerts alerts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_delete ON public.alerts FOR DELETE USING (public.is_org_editor(org_id));


--
-- Name: alerts alerts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_select ON public.alerts FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: alerts alerts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_update ON public.alerts FOR UPDATE USING (((user_id = auth.uid()) OR (org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids))));


--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys api_keys_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_select ON public.api_keys FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

--
-- Name: areas areas_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_delete ON public.areas FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: areas areas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_insert ON public.areas FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: areas areas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_select ON public.areas FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: areas areas_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_update ON public.areas FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: cables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cables ENABLE ROW LEVEL SECURITY;

--
-- Name: cables cables_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cables_select ON public.cables FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: cables cables_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cables_write ON public.cables USING (public.is_project_editor(project_id));


--
-- Name: certificate_punch_exceptions cert_punch_exceptions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cert_punch_exceptions_delete ON public.certificate_punch_exceptions FOR DELETE USING ((certificate_id IN ( SELECT certificates.id
   FROM public.certificates
  WHERE public.is_project_editor(certificates.project_id))));


--
-- Name: certificate_punch_exceptions cert_punch_exceptions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cert_punch_exceptions_insert ON public.certificate_punch_exceptions FOR INSERT WITH CHECK ((certificate_id IN ( SELECT certificates.id
   FROM public.certificates
  WHERE public.is_project_editor(certificates.project_id))));


--
-- Name: certificate_punch_exceptions cert_punch_exceptions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cert_punch_exceptions_select ON public.certificate_punch_exceptions FOR SELECT USING ((certificate_id IN ( SELECT certificates.id
   FROM public.certificates
  WHERE public.is_project_member(certificates.project_id))));


--
-- Name: certificate_signatures cert_sig_delete_editors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cert_sig_delete_editors ON public.certificate_signatures FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((public.certificates c
     JOIN public.projects p ON ((p.id = c.project_id)))
     JOIN public.org_members om ON ((om.org_id = p.org_id)))
  WHERE ((c.id = certificate_signatures.certificate_id) AND (om.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role, 'architect'::public.org_member_role, 'leader'::public.org_member_role]))))));


--
-- Name: certificate_signatures cert_sig_insert_editors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cert_sig_insert_editors ON public.certificate_signatures FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.certificates c
     JOIN public.projects p ON ((p.id = c.project_id)))
     JOIN public.org_members om ON ((om.org_id = p.org_id)))
  WHERE ((c.id = certificate_signatures.certificate_id) AND (om.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role, 'architect'::public.org_member_role, 'leader'::public.org_member_role]))))));


--
-- Name: certificate_signatures cert_sig_select_org_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cert_sig_select_org_members ON public.certificate_signatures FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.certificates c
     JOIN public.projects p ON ((p.id = c.project_id)))
     JOIN public.org_members om ON ((om.org_id = p.org_id)))
  WHERE ((c.id = certificate_signatures.certificate_id) AND (om.user_id = auth.uid())))));


--
-- Name: certificate_punch_exceptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificate_punch_exceptions ENABLE ROW LEVEL SECURITY;

--
-- Name: certificate_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificate_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: certificates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

--
-- Name: certificates certificates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY certificates_delete ON public.certificates FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: certificates certificates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY certificates_insert ON public.certificates FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: certificates certificates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY certificates_select ON public.certificates FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: certificates certificates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY certificates_update ON public.certificates FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: disciplines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;

--
-- Name: disciplines disciplines_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY disciplines_delete ON public.disciplines FOR DELETE USING (public.is_org_editor(org_id));


--
-- Name: disciplines disciplines_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY disciplines_insert ON public.disciplines FOR INSERT WITH CHECK (public.is_org_editor(org_id));


--
-- Name: disciplines disciplines_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY disciplines_select ON public.disciplines FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: disciplines disciplines_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY disciplines_select_catalog ON public.disciplines FOR SELECT TO authenticated USING (public.is_catalog_org(org_id));


--
-- Name: disciplines disciplines_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY disciplines_update ON public.disciplines FOR UPDATE USING (public.is_org_editor(org_id));


--
-- Name: domain_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

--
-- Name: domain_events domain_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY domain_events_select ON public.domain_events FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: equipment_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_types equipment_types_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_types_delete ON public.equipment_types FOR DELETE USING (public.is_org_editor(org_id));


--
-- Name: equipment_types equipment_types_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_types_insert ON public.equipment_types FOR INSERT WITH CHECK (public.is_org_editor(org_id));


--
-- Name: equipment_types equipment_types_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_types_select ON public.equipment_types FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: equipment_types equipment_types_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_types_select_catalog ON public.equipment_types FOR SELECT TO authenticated USING (public.is_catalog_org(org_id));


--
-- Name: equipment_types equipment_types_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_types_update ON public.equipment_types FOR UPDATE USING (public.is_org_editor(org_id));


--
-- Name: handover_package_systems; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.handover_package_systems ENABLE ROW LEVEL SECURITY;

--
-- Name: handover_package_systems handover_package_systems_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY handover_package_systems_select ON public.handover_package_systems FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.handover_packages hp
  WHERE ((hp.id = handover_package_systems.package_id) AND public.is_project_member(hp.project_id)))));


--
-- Name: handover_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.handover_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: handover_packages handover_packages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY handover_packages_select ON public.handover_packages FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: interlocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interlocks ENABLE ROW LEVEL SECURITY;

--
-- Name: interlocks interlocks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interlocks_select ON public.interlocks FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: interlocks interlocks_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interlocks_write ON public.interlocks USING (public.is_project_editor(project_id));


--
-- Name: itr_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_assignments itr_assignments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_assignments_delete ON public.itr_assignments FOR DELETE USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_editor(itrs.project_id))));


--
-- Name: itr_assignments itr_assignments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_assignments_insert ON public.itr_assignments FOR INSERT WITH CHECK ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_editor(itrs.project_id))));


--
-- Name: itr_assignments itr_assignments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_assignments_select ON public.itr_assignments FOR SELECT USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_assignments itr_assignments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_assignments_update ON public.itr_assignments FOR UPDATE USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_editor(itrs.project_id))));


--
-- Name: itr_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_attachments itr_attachments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_attachments_delete ON public.itr_attachments FOR DELETE USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_attachments itr_attachments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_attachments_insert ON public.itr_attachments FOR INSERT WITH CHECK ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_attachments itr_attachments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_attachments_select ON public.itr_attachments FOR SELECT USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_responses itr_responses_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_responses_delete ON public.itr_responses FOR DELETE USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_editor(itrs.project_id))));


--
-- Name: itr_responses itr_responses_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_responses_insert ON public.itr_responses FOR INSERT WITH CHECK ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_responses itr_responses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_responses_select ON public.itr_responses FOR SELECT USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_responses itr_responses_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_responses_update ON public.itr_responses FOR UPDATE USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_signatures itr_signatures_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_signatures_delete ON public.itr_signatures FOR DELETE USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_editor(itrs.project_id))));


--
-- Name: itr_signatures itr_signatures_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_signatures_insert ON public.itr_signatures FOR INSERT WITH CHECK ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_signatures itr_signatures_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_signatures_select ON public.itr_signatures FOR SELECT USING ((itr_id IN ( SELECT itrs.id
   FROM public.itrs
  WHERE public.is_project_member(itrs.project_id))));


--
-- Name: itr_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_suggestions itr_suggestions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_suggestions_select ON public.itr_suggestions FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: itr_template_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_template_items ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_template_items_backup_pre_split; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_template_items_backup_pre_split ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_template_items itr_template_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_template_items_select ON public.itr_template_items FOR SELECT USING ((template_id IN ( SELECT itr_templates.id
   FROM public.itr_templates
  WHERE (itr_templates.org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)))));


--
-- Name: itr_template_items itr_template_items_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_template_items_select_catalog ON public.itr_template_items FOR SELECT TO authenticated USING ((template_id IN ( SELECT itr_templates.id
   FROM public.itr_templates
  WHERE public.is_catalog_org(itr_templates.org_id))));


--
-- Name: itr_template_items itr_template_items_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_template_items_write ON public.itr_template_items USING ((template_id IN ( SELECT itr_templates.id
   FROM public.itr_templates
  WHERE public.is_org_editor(itr_templates.org_id))));


--
-- Name: itr_template_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_template_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_template_sections itr_template_sections_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_template_sections_select ON public.itr_template_sections FOR SELECT USING ((template_id IN ( SELECT itr_templates.id
   FROM public.itr_templates
  WHERE (itr_templates.org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)))));


--
-- Name: itr_template_sections itr_template_sections_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_template_sections_select_catalog ON public.itr_template_sections FOR SELECT TO authenticated USING ((template_id IN ( SELECT itr_templates.id
   FROM public.itr_templates
  WHERE public.is_catalog_org(itr_templates.org_id))));


--
-- Name: itr_template_sections itr_template_sections_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_template_sections_write ON public.itr_template_sections USING ((template_id IN ( SELECT itr_templates.id
   FROM public.itr_templates
  WHERE public.is_org_editor(itr_templates.org_id))));


--
-- Name: itr_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itr_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: itr_templates itr_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_templates_delete ON public.itr_templates FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = itr_templates.org_id) AND (org_members.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role, 'architect'::public.org_member_role]))))));


--
-- Name: itr_templates itr_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_templates_insert ON public.itr_templates FOR INSERT WITH CHECK (public.is_org_editor(org_id));


--
-- Name: itr_templates itr_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_templates_select ON public.itr_templates FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: itr_templates itr_templates_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_templates_select_catalog ON public.itr_templates FOR SELECT TO authenticated USING (public.is_catalog_org(org_id));


--
-- Name: itr_templates itr_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itr_templates_update ON public.itr_templates FOR UPDATE USING (public.is_org_editor(org_id));


--
-- Name: itrs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itrs ENABLE ROW LEVEL SECURITY;

--
-- Name: itrs itrs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itrs_delete ON public.itrs FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: itrs itrs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itrs_insert ON public.itrs FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: itrs itrs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itrs_select ON public.itrs FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: itrs itrs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itrs_update ON public.itrs FOR UPDATE USING (public.is_project_member(project_id));


--
-- Name: kpi_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_snapshots kpi_snapshots_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kpi_snapshots_delete ON public.kpi_snapshots FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: kpi_snapshots kpi_snapshots_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kpi_snapshots_insert ON public.kpi_snapshots FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: kpi_snapshots kpi_snapshots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kpi_snapshots_select ON public.kpi_snapshots FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: kpi_snapshots kpi_snapshots_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kpi_snapshots_update ON public.kpi_snapshots FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: loop_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loop_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: loop_tags loop_tags_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loop_tags_select ON public.loop_tags FOR SELECT USING ((loop_id IN ( SELECT loops.id
   FROM public.loops
  WHERE public.is_project_member(loops.project_id))));


--
-- Name: loop_tags loop_tags_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loop_tags_write ON public.loop_tags USING ((loop_id IN ( SELECT loops.id
   FROM public.loops
  WHERE public.is_project_editor(loops.project_id))));


--
-- Name: loops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loops ENABLE ROW LEVEL SECURITY;

--
-- Name: loops loops_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loops_select ON public.loops FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: loops loops_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loops_write ON public.loops USING (public.is_project_editor(project_id));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE USING ((recipient_user_id = auth.uid()));


--
-- Name: notifications notifications_insert_org_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert_org_member ON public.notifications FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = notifications.org_id)))));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING ((recipient_user_id = auth.uid()));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING ((recipient_user_id = auth.uid())) WITH CHECK ((recipient_user_id = auth.uid()));


--
-- Name: api_keys org members can manage api_keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members can manage api_keys" ON public.api_keys USING ((org_id IN ( SELECT org_members.org_id
   FROM public.org_members
  WHERE (org_members.user_id = auth.uid()))));


--
-- Name: organizations org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_delete ON public.organizations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = organizations.id) AND (org_members.role = 'owner'::public.org_member_role)))));


--
-- Name: organizations org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_insert ON public.organizations FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: org_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

--
-- Name: org_members org_members_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_delete ON public.org_members FOR DELETE TO authenticated USING (public.is_org_admin(org_id));


--
-- Name: org_members org_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_insert ON public.org_members FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(org_id));


--
-- Name: org_members org_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select ON public.org_members FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: org_members org_members_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_update ON public.org_members FOR UPDATE TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));


--
-- Name: organizations org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_select ON public.organizations FOR SELECT USING ((id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: organizations org_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_select_catalog ON public.organizations FOR SELECT TO authenticated USING (public.is_catalog_org(id));


--
-- Name: organizations org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_update ON public.organizations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = organizations.id) AND (org_members.role = 'owner'::public.org_member_role)))));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: pid_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pid_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: pid_documents pid_documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_documents_delete ON public.pid_documents FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: pid_documents pid_documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_documents_insert ON public.pid_documents FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: pid_documents pid_documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_documents_select ON public.pid_documents FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: pid_documents pid_documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_documents_update ON public.pid_documents FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: pid_hotspots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pid_hotspots ENABLE ROW LEVEL SECURITY;

--
-- Name: pid_hotspots pid_hotspots_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_hotspots_delete ON public.pid_hotspots FOR DELETE USING ((public.is_project_editor(project_id) OR (created_by = auth.uid())));


--
-- Name: pid_hotspots pid_hotspots_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_hotspots_insert ON public.pid_hotspots FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: pid_hotspots pid_hotspots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_hotspots_select ON public.pid_hotspots FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: pid_hotspots pid_hotspots_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pid_hotspots_update ON public.pid_hotspots FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: preservation_procedure_items pres_proc_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_proc_items_delete ON public.preservation_procedure_items FOR DELETE USING ((procedure_id IN ( SELECT preservation_procedures.id
   FROM public.preservation_procedures
  WHERE public.is_org_editor(preservation_procedures.org_id))));


--
-- Name: preservation_procedure_items pres_proc_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_proc_items_insert ON public.preservation_procedure_items FOR INSERT WITH CHECK ((procedure_id IN ( SELECT preservation_procedures.id
   FROM public.preservation_procedures
  WHERE public.is_org_editor(preservation_procedures.org_id))));


--
-- Name: preservation_procedure_items pres_proc_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_proc_items_select ON public.preservation_procedure_items FOR SELECT USING ((procedure_id IN ( SELECT preservation_procedures.id
   FROM public.preservation_procedures
  WHERE (preservation_procedures.org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)))));


--
-- Name: preservation_procedure_items pres_proc_items_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_proc_items_select_catalog ON public.preservation_procedure_items FOR SELECT TO authenticated USING ((procedure_id IN ( SELECT preservation_procedures.id
   FROM public.preservation_procedures
  WHERE public.is_catalog_org(preservation_procedures.org_id))));


--
-- Name: preservation_procedure_items pres_proc_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_proc_items_update ON public.preservation_procedure_items FOR UPDATE USING ((procedure_id IN ( SELECT preservation_procedures.id
   FROM public.preservation_procedures
  WHERE public.is_org_editor(preservation_procedures.org_id))));


--
-- Name: preservation_record_responses pres_rec_resp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_rec_resp_delete ON public.preservation_record_responses FOR DELETE USING ((record_id IN ( SELECT pr.id
   FROM (public.preservation_records pr
     JOIN public.preservation_plans pp ON ((pp.id = pr.plan_id)))
  WHERE public.is_project_editor(pp.project_id))));


--
-- Name: preservation_record_responses pres_rec_resp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_rec_resp_insert ON public.preservation_record_responses FOR INSERT WITH CHECK ((record_id IN ( SELECT pr.id
   FROM (public.preservation_records pr
     JOIN public.preservation_plans pp ON ((pp.id = pr.plan_id)))
  WHERE public.is_project_member(pp.project_id))));


--
-- Name: preservation_record_responses pres_rec_resp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_rec_resp_select ON public.preservation_record_responses FOR SELECT USING ((record_id IN ( SELECT pr.id
   FROM (public.preservation_records pr
     JOIN public.preservation_plans pp ON ((pp.id = pr.plan_id)))
  WHERE public.is_project_member(pp.project_id))));


--
-- Name: preservation_record_responses pres_rec_resp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pres_rec_resp_update ON public.preservation_record_responses FOR UPDATE USING ((record_id IN ( SELECT pr.id
   FROM (public.preservation_records pr
     JOIN public.preservation_plans pp ON ((pp.id = pr.plan_id)))
  WHERE public.is_project_editor(pp.project_id))));


--
-- Name: preservation_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preservation_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: preservation_attachments preservation_attachments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_attachments_delete ON public.preservation_attachments FOR DELETE USING ((record_id IN ( SELECT pr.id
   FROM (public.preservation_records pr
     JOIN public.preservation_plans pp ON ((pp.id = pr.plan_id)))
  WHERE public.is_project_editor(pp.project_id))));


--
-- Name: preservation_attachments preservation_attachments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_attachments_insert ON public.preservation_attachments FOR INSERT WITH CHECK ((record_id IN ( SELECT pr.id
   FROM (public.preservation_records pr
     JOIN public.preservation_plans pp ON ((pp.id = pr.plan_id)))
  WHERE public.is_project_member(pp.project_id))));


--
-- Name: preservation_attachments preservation_attachments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_attachments_select ON public.preservation_attachments FOR SELECT USING ((record_id IN ( SELECT pr.id
   FROM (public.preservation_records pr
     JOIN public.preservation_plans pp ON ((pp.id = pr.plan_id)))
  WHERE public.is_project_member(pp.project_id))));


--
-- Name: preservation_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preservation_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: preservation_plans preservation_plans_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_plans_delete ON public.preservation_plans FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: preservation_plans preservation_plans_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_plans_insert ON public.preservation_plans FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: preservation_plans preservation_plans_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_plans_select ON public.preservation_plans FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: preservation_plans preservation_plans_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_plans_update ON public.preservation_plans FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: preservation_procedure_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preservation_procedure_items ENABLE ROW LEVEL SECURITY;

--
-- Name: preservation_procedures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preservation_procedures ENABLE ROW LEVEL SECURITY;

--
-- Name: preservation_procedures preservation_procedures_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_procedures_delete ON public.preservation_procedures FOR DELETE USING (public.is_org_editor(org_id));


--
-- Name: preservation_procedures preservation_procedures_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_procedures_insert ON public.preservation_procedures FOR INSERT WITH CHECK (public.is_org_editor(org_id));


--
-- Name: preservation_procedures preservation_procedures_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_procedures_select ON public.preservation_procedures FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: preservation_procedures preservation_procedures_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_procedures_select_catalog ON public.preservation_procedures FOR SELECT TO authenticated USING (public.is_catalog_org(org_id));


--
-- Name: preservation_procedures preservation_procedures_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_procedures_update ON public.preservation_procedures FOR UPDATE USING (public.is_org_editor(org_id));


--
-- Name: preservation_record_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preservation_record_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: preservation_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preservation_records ENABLE ROW LEVEL SECURITY;

--
-- Name: preservation_records preservation_records_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_records_delete ON public.preservation_records FOR DELETE USING (public.is_project_editor(( SELECT preservation_plans.project_id
   FROM public.preservation_plans
  WHERE (preservation_plans.id = preservation_records.plan_id))));


--
-- Name: preservation_records preservation_records_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_records_insert ON public.preservation_records FOR INSERT WITH CHECK (public.is_project_member(( SELECT preservation_plans.project_id
   FROM public.preservation_plans
  WHERE (preservation_plans.id = preservation_records.plan_id))));


--
-- Name: preservation_records preservation_records_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_records_select ON public.preservation_records FOR SELECT USING (public.is_project_member(( SELECT preservation_plans.project_id
   FROM public.preservation_plans
  WHERE (preservation_plans.id = preservation_records.plan_id))));


--
-- Name: preservation_records preservation_records_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preservation_records_update ON public.preservation_records FOR UPDATE USING (public.is_project_editor(( SELECT preservation_plans.project_id
   FROM public.preservation_plans
  WHERE (preservation_plans.id = preservation_records.plan_id))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_self ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: profiles profiles_select_org_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_org_members ON public.profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.org_members om_target
     JOIN public.org_members om_viewer ON ((om_viewer.org_id = om_target.org_id)))
  WHERE ((om_target.user_id = profiles.id) AND (om_viewer.user_id = auth.uid())))));


--
-- Name: profiles profiles_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_self ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: profiles profiles_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: project_phases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

--
-- Name: project_phases project_phases_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_phases_delete ON public.project_phases FOR DELETE USING (public.is_org_editor(org_id));


--
-- Name: project_phases project_phases_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_phases_insert ON public.project_phases FOR INSERT WITH CHECK (public.is_org_editor(org_id));


--
-- Name: project_phases project_phases_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_phases_select ON public.project_phases FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: project_phases project_phases_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_phases_select_catalog ON public.project_phases FOR SELECT TO authenticated USING (public.is_catalog_org(org_id));


--
-- Name: project_phases project_phases_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_phases_update ON public.project_phases FOR UPDATE USING (public.is_org_editor(org_id));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete ON public.projects FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = projects.org_id) AND (org_members.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role]))))));


--
-- Name: projects projects_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert ON public.projects FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = org_members.org_id) AND (org_members.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role, 'architect'::public.org_member_role]))))));


--
-- Name: projects projects_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select ON public.projects FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: projects projects_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update ON public.projects FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = projects.org_id) AND (org_members.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role, 'architect'::public.org_member_role]))))));


--
-- Name: pssr_review_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pssr_review_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pssr_review_items pssr_review_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_review_items_delete ON public.pssr_review_items FOR DELETE USING ((review_id IN ( SELECT pssr_reviews.id
   FROM public.pssr_reviews
  WHERE public.is_project_editor(pssr_reviews.project_id))));


--
-- Name: pssr_review_items pssr_review_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_review_items_insert ON public.pssr_review_items FOR INSERT WITH CHECK ((review_id IN ( SELECT pssr_reviews.id
   FROM public.pssr_reviews
  WHERE public.is_project_member(pssr_reviews.project_id))));


--
-- Name: pssr_review_items pssr_review_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_review_items_select ON public.pssr_review_items FOR SELECT USING ((review_id IN ( SELECT pssr_reviews.id
   FROM public.pssr_reviews
  WHERE public.is_project_member(pssr_reviews.project_id))));


--
-- Name: pssr_review_items pssr_review_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_review_items_update ON public.pssr_review_items FOR UPDATE USING ((review_id IN ( SELECT pssr_reviews.id
   FROM public.pssr_reviews
  WHERE public.is_project_member(pssr_reviews.project_id))));


--
-- Name: pssr_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pssr_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: pssr_reviews pssr_reviews_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_reviews_delete ON public.pssr_reviews FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: pssr_reviews pssr_reviews_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_reviews_insert ON public.pssr_reviews FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: pssr_reviews pssr_reviews_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_reviews_select ON public.pssr_reviews FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: pssr_reviews pssr_reviews_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_reviews_update ON public.pssr_reviews FOR UPDATE USING (public.is_project_member(project_id));


--
-- Name: pssr_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pssr_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: pssr_signatures pssr_signatures_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_signatures_delete ON public.pssr_signatures FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: pssr_signatures pssr_signatures_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_signatures_insert ON public.pssr_signatures FOR INSERT WITH CHECK ((review_id IN ( SELECT pssr_reviews.id
   FROM public.pssr_reviews
  WHERE public.is_project_member(pssr_reviews.project_id))));


--
-- Name: pssr_signatures pssr_signatures_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_signatures_select ON public.pssr_signatures FOR SELECT USING ((review_id IN ( SELECT pssr_reviews.id
   FROM public.pssr_reviews
  WHERE public.is_project_member(pssr_reviews.project_id))));


--
-- Name: pssr_template_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pssr_template_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pssr_template_items pssr_template_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_template_items_select ON public.pssr_template_items FOR SELECT USING ((template_id IN ( SELECT pssr_templates.id
   FROM public.pssr_templates
  WHERE (pssr_templates.org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)))));


--
-- Name: pssr_template_items pssr_template_items_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_template_items_select_catalog ON public.pssr_template_items FOR SELECT TO authenticated USING ((template_id IN ( SELECT pssr_templates.id
   FROM public.pssr_templates
  WHERE public.is_catalog_org(pssr_templates.org_id))));


--
-- Name: pssr_template_items pssr_template_items_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_template_items_write ON public.pssr_template_items USING ((template_id IN ( SELECT pssr_templates.id
   FROM public.pssr_templates
  WHERE public.is_org_editor(pssr_templates.org_id))));


--
-- Name: pssr_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pssr_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: pssr_templates pssr_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_templates_delete ON public.pssr_templates FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.org_members
  WHERE ((org_members.user_id = auth.uid()) AND (org_members.org_id = pssr_templates.org_id) AND (org_members.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role, 'architect'::public.org_member_role]))))));


--
-- Name: pssr_templates pssr_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_templates_insert ON public.pssr_templates FOR INSERT WITH CHECK (public.is_org_editor(org_id));


--
-- Name: pssr_templates pssr_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_templates_select ON public.pssr_templates FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: pssr_templates pssr_templates_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_templates_select_catalog ON public.pssr_templates FOR SELECT TO authenticated USING (public.is_catalog_org(org_id));


--
-- Name: pssr_templates pssr_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pssr_templates_update ON public.pssr_templates FOR UPDATE USING (public.is_org_editor(org_id));


--
-- Name: punch_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.punch_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: punch_attachments punch_attachments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_attachments_delete ON public.punch_attachments FOR DELETE USING ((punch_id IN ( SELECT punches.id
   FROM public.punches
  WHERE public.is_project_editor(punches.project_id))));


--
-- Name: punch_attachments punch_attachments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_attachments_insert ON public.punch_attachments FOR INSERT WITH CHECK ((punch_id IN ( SELECT punches.id
   FROM public.punches
  WHERE public.is_project_member(punches.project_id))));


--
-- Name: punch_attachments punch_attachments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_attachments_select ON public.punch_attachments FOR SELECT USING ((punch_id IN ( SELECT punches.id
   FROM public.punches
  WHERE public.is_project_member(punches.project_id))));


--
-- Name: punch_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.punch_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: punch_comments punch_comments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_comments_delete ON public.punch_comments FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: punch_comments punch_comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_comments_insert ON public.punch_comments FOR INSERT WITH CHECK ((punch_id IN ( SELECT punches.id
   FROM public.punches
  WHERE public.is_project_member(punches.project_id))));


--
-- Name: punch_comments punch_comments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_comments_select ON public.punch_comments FOR SELECT USING ((punch_id IN ( SELECT punches.id
   FROM public.punches
  WHERE public.is_project_member(punches.project_id))));


--
-- Name: punch_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.punch_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: punch_counters punch_counters_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_counters_select ON public.punch_counters FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: punch_post_handover_events punch_pho_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_pho_events_select ON public.punch_post_handover_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.punches pu
  WHERE ((pu.id = punch_post_handover_events.punch_id) AND public.is_project_member(pu.project_id)))));


--
-- Name: punch_post_handover_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.punch_post_handover_events ENABLE ROW LEVEL SECURITY;

--
-- Name: punches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.punches ENABLE ROW LEVEL SECURITY;

--
-- Name: punches punches_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punches_delete ON public.punches FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: punches punches_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punches_insert ON public.punches FOR INSERT WITH CHECK (public.is_project_member(project_id));


--
-- Name: punches punches_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punches_select ON public.punches FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: punches punches_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punches_update ON public.punches FOR UPDATE USING (public.is_project_member(project_id));


--
-- Name: push_subscriptions push_subs_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subs_select_own ON public.push_subscriptions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: signal_sample_batches signal_batches_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signal_batches_select ON public.signal_sample_batches FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: signal_sample_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signal_sample_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: signal_samples; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signal_samples ENABLE ROW LEVEL SECURITY;

--
-- Name: signal_samples signal_samples_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signal_samples_select ON public.signal_samples FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.signals s
     JOIN public.tags t ON ((t.id = s.tag_id)))
     JOIN public.projects p ON ((p.id = t.project_id)))
  WHERE ((s.id = signal_samples.signal_id) AND (p.org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids))))));


--
-- Name: signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

--
-- Name: signals signals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signals_select ON public.signals FOR SELECT USING ((tag_id IN ( SELECT tags.id
   FROM public.tags
  WHERE public.is_project_member(tags.project_id))));


--
-- Name: signals signals_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signals_write ON public.signals USING ((tag_id IN ( SELECT tags.id
   FROM public.tags
  WHERE public.is_project_editor(tags.project_id))));


--
-- Name: subsystems; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subsystems ENABLE ROW LEVEL SECURITY;

--
-- Name: subsystems subsystems_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subsystems_delete ON public.subsystems FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: subsystems subsystems_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subsystems_insert ON public.subsystems FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: subsystems subsystems_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subsystems_select ON public.subsystems FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: subsystems subsystems_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subsystems_update ON public.subsystems FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: sync_conflict_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_conflict_log ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_conflict_log sync_conflict_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sync_conflict_select ON public.sync_conflict_log FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: systems; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.systems ENABLE ROW LEVEL SECURITY;

--
-- Name: systems systems_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY systems_delete ON public.systems FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: systems systems_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY systems_insert ON public.systems FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: systems systems_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY systems_select ON public.systems FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: systems systems_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY systems_update ON public.systems FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_delete ON public.tags FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.org_members om ON ((om.org_id = p.org_id)))
  WHERE ((p.id = tags.project_id) AND (om.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::public.org_member_role, 'admin'::public.org_member_role, 'architect'::public.org_member_role]))))));


--
-- Name: tags tags_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_insert ON public.tags FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: tags tags_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_select ON public.tags FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: tags tags_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_update ON public.tags FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: webhook_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_deliveries webhook_deliveries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_deliveries_select ON public.webhook_deliveries FOR SELECT USING ((subscription_id IN ( SELECT webhook_subscriptions.id
   FROM public.webhook_subscriptions
  WHERE (webhook_subscriptions.org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)))));


--
-- Name: webhook_subscriptions webhook_subs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_subs_select ON public.webhook_subscriptions FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: webhook_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: work_plan_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_plan_items ENABLE ROW LEVEL SECURITY;

--
-- Name: work_plan_items work_plan_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_items_delete ON public.work_plan_items FOR DELETE USING ((work_plan_id IN ( SELECT work_plans.id
   FROM public.work_plans
  WHERE public.is_project_editor(work_plans.project_id))));


--
-- Name: work_plan_items work_plan_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_items_insert ON public.work_plan_items FOR INSERT WITH CHECK ((work_plan_id IN ( SELECT work_plans.id
   FROM public.work_plans
  WHERE public.is_project_editor(work_plans.project_id))));


--
-- Name: work_plan_items work_plan_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_items_select ON public.work_plan_items FOR SELECT USING ((work_plan_id IN ( SELECT work_plans.id
   FROM public.work_plans
  WHERE public.is_project_member(work_plans.project_id))));


--
-- Name: work_plan_items work_plan_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_items_update ON public.work_plan_items FOR UPDATE USING ((work_plan_id IN ( SELECT work_plans.id
   FROM public.work_plans
  WHERE public.is_project_member(work_plans.project_id))));


--
-- Name: work_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: work_plans work_plans_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plans_delete ON public.work_plans FOR DELETE USING (public.is_project_editor(project_id));


--
-- Name: work_plans work_plans_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plans_insert ON public.work_plans FOR INSERT WITH CHECK (public.is_project_editor(project_id));


--
-- Name: work_plans work_plans_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plans_select ON public.work_plans FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: work_plans work_plans_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plans_update ON public.work_plans FOR UPDATE USING (public.is_project_editor(project_id));


--
-- Name: workflow_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_executions workflow_executions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_executions_select ON public.workflow_executions FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: workflow_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_rules workflow_rules_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_rules_delete ON public.workflow_rules FOR DELETE USING (public.is_org_editor(org_id));


--
-- Name: workflow_rules workflow_rules_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_rules_insert ON public.workflow_rules FOR INSERT WITH CHECK (public.is_org_editor(org_id));


--
-- Name: workflow_rules workflow_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_rules_select ON public.workflow_rules FOR SELECT USING ((org_id IN ( SELECT public.get_my_org_ids() AS get_my_org_ids)));


--
-- Name: workflow_rules workflow_rules_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_rules_update ON public.workflow_rules FOR UPDATE USING (public.is_org_editor(org_id)) WITH CHECK (public.is_org_editor(org_id));


--
-- PostgreSQL database dump complete
--

\unrestrict xH47aHm3BcaoeAmXf6AM40Y2pF3dVYWpCUmUxs3iCSBF6hdRRSHi3c0qpzCcXZO

