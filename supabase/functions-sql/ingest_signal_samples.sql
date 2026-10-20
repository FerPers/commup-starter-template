-- fn: public.ingest_signal_samples(uuid,text,text,text,uuid,jsonb,uuid,boolean)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.ingest_signal_samples(p_org_id uuid, p_source text, p_source_system text, p_idempotency_key text, p_api_key_id uuid, p_samples jsonb, p_project_id uuid DEFAULT NULL::uuid, p_upsert boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- S12 (E-04/B-18/E-24): cada muestra se valida por separado y se rechaza con motivo en errors[] (antes un
  -- registro malformado tumbaba el lote, un NaN contaminaba promedios y el nombre se resolvía con LIMIT 1 en toda
  -- la org). La señal se busca por signal_id o por nombre dentro del proyecto (p_project_id); sin proyecto, un
  -- nombre que existe en más de un proyecto de la org se rechaza como ambiguous_signal.
  CREATE TEMP TABLE IF NOT EXISTS _ingest (idx integer, signal_name text, signal_id uuid, sampled_at timestamptz,
    value double precision, quality smallint, reason text) ON COMMIT DROP;
  TRUNCATE _ingest;
  INSERT INTO _ingest (idx, signal_name, signal_id, sampled_at, value, quality, reason)
  SELECT x.idx, x.signal_name, x.signal_id, x.sampled_at, x.value, x.quality,
         CASE WHEN x.ts_bad THEN 'invalid_timestamp'
              WHEN x.val_bad THEN 'invalid_value'
              WHEN x.q_bad THEN 'invalid_quality'
              WHEN x.sampled_at > now() + interval '5 minutes' THEN 'future_timestamp'
              WHEN x.sampled_at < now() - interval '90 days' THEN 'too_old'
              WHEN x.matches = 0 THEN 'signal_not_registered'
              WHEN x.matches > 1 THEN 'ambiguous_signal' END
  FROM (
    SELECT e.ord::integer AS idx, e.item ->> 'signal_name' AS signal_name,
           public.try_timestamptz(e.item ->> 'sampled_at') AS sampled_at,
           public.try_timestamptz(e.item ->> 'sampled_at') IS NULL AS ts_bad,
           public.try_finite_double(e.item ->> 'value') AS value,
           NULLIF(e.item ->> 'value', '') IS NOT NULL AND public.try_finite_double(e.item ->> 'value') IS NULL AS val_bad,
           CASE WHEN COALESCE(e.item ->> 'quality', '0') ~ '^[0-9]{1,3}$' THEN (COALESCE(e.item ->> 'quality', '0'))::smallint ELSE 0::smallint END AS quality,
           NOT COALESCE(e.item ->> 'quality', '0') ~ '^[0-9]{1,3}$' AS q_bad,
           m.n AS matches, m.signal_id
    FROM jsonb_array_elements(p_samples) WITH ORDINALITY e(item, ord)
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS n, (array_agg(sig.id))[1] AS signal_id
      FROM signals sig
      JOIN tags t     ON t.id = sig.tag_id
      JOIN projects p ON p.id = t.project_id
      WHERE p.org_id = p_org_id AND sig.active
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND CASE WHEN e.item ? 'signal_id' THEN sig.id::text = e.item ->> 'signal_id'
                 ELSE sig.signal_tag = e.item ->> 'signal_name' END
    ) m
  ) x;

  IF p_upsert THEN
    INSERT INTO signal_samples (signal_id, sampled_at, value, quality, source_batch)
    SELECT DISTINCT ON (signal_id, sampled_at) signal_id, sampled_at, value, quality, v_batch_id
    FROM _ingest WHERE reason IS NULL ORDER BY signal_id, sampled_at, idx DESC
    ON CONFLICT (signal_id, sampled_at) DO UPDATE
      SET value = EXCLUDED.value, quality = EXCLUDED.quality, source_batch = EXCLUDED.source_batch, ingested_at = now();
  ELSE
    INSERT INTO signal_samples (signal_id, sampled_at, value, quality, source_batch)
    SELECT signal_id, sampled_at, value, quality, v_batch_id FROM _ingest WHERE reason IS NULL
    ON CONFLICT (signal_id, sampled_at) DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_accepted = ROW_COUNT;

  SELECT count(*) FILTER (WHERE reason IS NOT NULL)::int,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('index', i.idx - 1, 'signal_name', i.signal_name, 'reason', i.reason) ORDER BY i.idx)
                   FROM (SELECT * FROM _ingest WHERE reason IS NOT NULL ORDER BY idx LIMIT 200) i), '[]'::jsonb)
    INTO v_rejected, v_errors
  FROM _ingest;

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
    'duplicates',   v_total - v_rejected - v_accepted,
    'total',        v_total,
    'errors',       v_errors,
    'suggestions_created', v_suggestions,
    'idempotent_replay', false
  );
END;
$function$;
