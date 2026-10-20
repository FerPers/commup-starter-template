-- S12 — IIoT confiable (revisión integral 2026-10-19)
--
--   B-12 / E-03  signal_samples particionada por mes (PARTITION BY RANGE sampled_at): la retención de 90 días
--                borra particiones enteras. La retención ya corría en prod por un job pg_cron creado a mano
--                (signal-samples-retention-90d); queda versionado aquí y además crea las particiones futuras.
--                RPC signal_series(): filtro sargable por rango (usa la PK), membresía comprobada una vez,
--                buckets con mín/máx y tope de puntos. La vista signal_samples_1min queda por compatibilidad.
--   E-04 / B-18  ingest_signal_samples con p_project_id (o signal_id por muestra); un nombre que existe en más de
--                un proyecto de la org sin proyecto indicado se rechaza como ambiguous_signal (antes LIMIT 1).
--                signal_tag único por proyecto (trigger).
--   E-24         Validación por muestra (fecha válida, ≤ ahora + 5 min, dentro de la retención; valor finito;
--                calidad numérica) con motivo en errors[]; upsert opcional para corregir muestras.
--   E-18         performance_test_revisions.max_bad_pct / max_spikes / exclude_out_of_range: por encima del umbral
--                la sugerencia es «no concluyente» y los minutos fuera de rango no entran al estadístico.
--   E-28         value_extrapolated en los criterios de total.
--
-- Las funciones de abajo del separador se emiten desde supabase/functions-sql/ (canónicas).

-- ── 1. Conversión segura para la ingesta ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.try_timestamptz(p text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $fn$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$fn$;

-- NULL si no es un número finito (NaN e ±Infinity incluidos).
CREATE OR REPLACE FUNCTION public.try_finite_double(p text)
RETURNS double precision LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $fn$
DECLARE v double precision;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  v := p::double precision;
  IF v = 'NaN'::double precision OR v IN ('Infinity'::double precision, '-Infinity'::double precision) THEN RETURN NULL; END IF;
  RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.try_timestamptz(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.try_finite_double(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_timestamptz(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_finite_double(text) TO authenticated, service_role;

-- ── 2. signal_tag único por proyecto (E-04) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_signal_tag_unique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_project uuid;
BEGIN
  IF NOT NEW.active THEN RETURN NEW; END IF;
  SELECT project_id INTO v_project FROM tags WHERE id = NEW.tag_id;
  PERFORM pg_advisory_xact_lock(hashtext('signal_tag:' || v_project::text || ':' || NEW.signal_tag));
  IF EXISTS (SELECT 1 FROM signals s JOIN tags t ON t.id = s.tag_id
             WHERE t.project_id = v_project AND s.signal_tag = NEW.signal_tag AND s.active AND s.id <> NEW.id) THEN
    RAISE EXCEPTION 'Ya existe una señal activa % en este proyecto', NEW.signal_tag USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_signal_tag_unique() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_signal_tag_unique ON public.signals;
CREATE TRIGGER guard_signal_tag_unique BEFORE INSERT OR UPDATE OF signal_tag, tag_id, active ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.guard_signal_tag_unique();

-- ── 3. Partición mensual de signal_samples (B-12 / E-03) ─────────────────
DROP VIEW IF EXISTS public.signal_samples_1min;
ALTER TABLE public.signal_samples RENAME TO signal_samples_old;
ALTER TABLE public.signal_samples_old RENAME CONSTRAINT signal_samples_pkey TO signal_samples_old_pkey;
ALTER TABLE public.signal_samples_old RENAME CONSTRAINT signal_samples_signal_id_fkey TO signal_samples_old_signal_id_fkey;
ALTER INDEX public.idx_signal_samples_batch RENAME TO idx_signal_samples_old_batch;
ALTER INDEX public.idx_signal_samples_sampled_at RENAME TO idx_signal_samples_old_sampled_at;

CREATE TABLE public.signal_samples (
  signal_id    uuid NOT NULL,
  sampled_at   timestamptz NOT NULL,
  value        double precision,
  quality      smallint NOT NULL DEFAULT 0,
  source_batch uuid,
  ingested_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_samples_pkey PRIMARY KEY (signal_id, sampled_at),
  CONSTRAINT signal_samples_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE CASCADE
) PARTITION BY RANGE (sampled_at);
CREATE INDEX idx_signal_samples_batch ON public.signal_samples (source_batch) WHERE source_batch IS NOT NULL;
CREATE INDEX idx_signal_samples_sampled_at ON public.signal_samples (sampled_at DESC);
COMMENT ON TABLE public.signal_samples IS
  'S12 (B-12): muestras IIoT particionadas por mes (signal_samples_YYYYMM). Las crea ensure_signal_sample_partitions(); la retención borra particiones viejas.';

-- Crea las particiones mensuales que cubren [mes de (ahora − 90 días), ahora + p_months_ahead meses] (la ventana de retención).
CREATE OR REPLACE FUNCTION public.ensure_signal_sample_partitions(p_months_ahead integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE m date; v_name text; v_created integer := 0;
BEGIN
  FOR m IN SELECT generate_series(date_trunc('month', now() - interval '90 days'), date_trunc('month', now()) + make_interval(months => p_months_ahead), interval '1 month')::date LOOP
    v_name := 'signal_samples_' || to_char(m, 'YYYYMM');
    IF to_regclass('public.' || v_name) IS NULL THEN
      EXECUTE format('CREATE TABLE public.%I PARTITION OF public.signal_samples FOR VALUES FROM (%L) TO (%L)',
                     v_name, m::timestamptz, (m + interval '1 month')::timestamptz);
      v_created := v_created + 1;
    END IF;
  END LOOP;
  RETURN v_created;
END;
$fn$;
REVOKE ALL ON FUNCTION public.ensure_signal_sample_partitions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_signal_sample_partitions(integer) TO service_role;

SELECT public.ensure_signal_sample_partitions(3);
-- Particiones para datos más viejos que la ventana (no debería haber: la retención es de 90 días).
DO $$
DECLARE m date;
BEGIN
  FOR m IN SELECT DISTINCT date_trunc('month', sampled_at)::date FROM public.signal_samples_old LOOP
    IF to_regclass('public.signal_samples_' || to_char(m, 'YYYYMM')) IS NULL THEN
      EXECUTE format('CREATE TABLE public.%I PARTITION OF public.signal_samples FOR VALUES FROM (%L) TO (%L)',
                     'signal_samples_' || to_char(m, 'YYYYMM'), m::timestamptz, (m + interval '1 month')::timestamptz);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.signal_samples (signal_id, sampled_at, value, quality, source_batch, ingested_at)
SELECT signal_id, sampled_at, value, quality, source_batch, ingested_at FROM public.signal_samples_old;
DROP TABLE public.signal_samples_old;

ALTER TABLE public.signal_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY signal_samples_select ON public.signal_samples FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM signals s JOIN tags t ON t.id = s.tag_id JOIN projects p ON p.id = t.project_id
                 WHERE s.id = signal_samples.signal_id AND p.org_id IN (SELECT public.get_my_org_ids())));
-- Antes anon/authenticated tenían todos los privilegios (sin políticas de escritura, la RLS los frenaba).
REVOKE ALL ON public.signal_samples FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.signal_samples TO authenticated;
GRANT ALL ON public.signal_samples TO service_role;

CREATE VIEW public.signal_samples_1min WITH (security_invoker = on) AS
  SELECT signal_id, date_trunc('minute', sampled_at) AS bucket, avg(value) AS avg_val, min(value) AS min_val, max(value) AS max_val,
         count(*) AS sample_count
  FROM public.signal_samples WHERE quality = 0
  GROUP BY signal_id, date_trunc('minute', sampled_at);
COMMENT ON VIEW public.signal_samples_1min IS 'Compatibilidad. Agrega toda la historia: para rangos usar signal_series() (S12, E-03).';
REVOKE ALL ON public.signal_samples_1min FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.signal_samples_1min TO authenticated, service_role;

-- ── 4. Serie reducida y sargable (E-03) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.signal_series(p_signal_ids uuid[], p_from timestamptz, p_to timestamptz, p_bucket_s integer DEFAULT 60,
                                                p_max_points integer DEFAULT 2000)
RETURNS TABLE(signal_id uuid, bucket timestamptz, avg_val double precision, min_val double precision, max_val double precision, sample_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_bucket integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN RAISE EXCEPTION 'Rango no válido' USING ERRCODE = '22023'; END IF;
  IF p_to - p_from > interval '35 days' THEN RAISE EXCEPTION 'El rango máximo es de 35 días' USING ERRCODE = '22023'; END IF;
  IF cardinality(p_signal_ids) > 50 THEN RAISE EXCEPTION 'Máximo 50 señales por consulta' USING ERRCODE = '22023'; END IF;
  -- Membresía comprobada una vez (no por fila): todas las señales deben ser de proyectos del usuario.
  IF auth.uid() IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(p_signal_ids) sid
       WHERE NOT EXISTS (SELECT 1 FROM signals s JOIN tags t ON t.id = s.tag_id WHERE s.id = sid AND public.is_project_member(t.project_id))) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  -- Bucket mínimo para no pasar de p_max_points por señal; mín/máx por bucket conserva los picos.
  v_bucket := GREATEST(COALESCE(p_bucket_s, 60), 1,
                       ceil(extract(epoch FROM p_to - p_from) / GREATEST(LEAST(COALESCE(p_max_points, 2000), 10000), 1))::integer);
  RETURN QUERY
    SELECT ss.signal_id, date_bin(make_interval(secs => v_bucket), ss.sampled_at, p_from) AS b,
           avg(ss.value), min(ss.value), max(ss.value), count(*)
    FROM signal_samples ss
    WHERE ss.signal_id = ANY (p_signal_ids) AND ss.sampled_at >= p_from AND ss.sampled_at < p_to AND ss.quality = 0
    GROUP BY 1, 2 ORDER BY 1, 2;
END;
$fn$;
REVOKE ALL ON FUNCTION public.signal_series(uuid[], timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signal_series(uuid[], timestamptz, timestamptz, integer, integer) TO authenticated, service_role;

-- ── 5. Umbrales de calidad por revisión (E-18) ───────────────────────────
ALTER TABLE public.performance_test_revisions
  ADD COLUMN IF NOT EXISTS max_bad_pct numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_spikes integer,
  ADD COLUMN IF NOT EXISTS exclude_out_of_range boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.performance_test_revisions.max_bad_pct IS 'S12 (E-18): % máximo de muestras de calidad mala por variable antes de sugerir «no concluyente».';
COMMENT ON COLUMN public.performance_test_revisions.max_spikes IS 'S12 (E-18): picos (saltos > max_step) tolerados por variable; NULL = sin límite.';

-- ── 6. Firmas que cambian ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.ingest_signal_samples(uuid, text, text, text, uuid, jsonb);

-- ── 7. Funciones canónicas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_signal_samples_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  deleted_count integer;
  v_part record;
  v_cut date := date_trunc('month', NOW() - INTERVAL '90 days')::date;
BEGIN
  -- S12 (B-12): particiones mensuales. Se crean las próximas y se borran enteras las que quedaron fuera de
  -- la retención de 90 días; en la partición del borde se borran filas.
  PERFORM public.ensure_signal_sample_partitions(3);
  FOR v_part IN
    SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'public.signal_samples'::regclass AND c.relname ~ '^signal_samples_[0-9]{6}$'
      AND to_date(right(c.relname, 6), 'YYYYMM') < v_cut
  LOOP
    EXECUTE format('DROP TABLE public.%I', v_part.relname);
  END LOOP;
  DELETE FROM public.signal_samples
  WHERE sampled_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.performance_compute_evaluation(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r performance_runs%ROWTYPE; rev performance_test_revisions%ROWTYPE; v record; c record; p record;
  v_from timestamptz; v_to timestamptz; v_total integer; v_valid integer; v_excl integer;
  v_vars jsonb := '[]'::jsonb; v_crits jsonb := '[]'::jsonb; v_pairs jsonb := '[]'::jsonb; v_reasons text[] := ARRAY[]::text[];
  v_expected numeric; v_present integer; v_cov numeric; v_bad numeric; v_spikes integer; v_oor integer; v_unit_ok boolean;
  v_sig_tag text; v_sig_unit text; v_rmin numeric; v_rmax numeric; v_val double precision; v_margin_lo numeric; v_margin_hi numeric; v_outcome text; v_n integer;
  v_any_fail boolean := false; v_any_within boolean := false; v_any_ne boolean := false; v_diff double precision; v_suggest text;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  SELECT * INTO rev FROM performance_test_revisions WHERE id = r.revision_id;
  v_from := date_trunc('minute', r.formal_started_at);
  v_to := r.closed_at;

  DROP TABLE IF EXISTS _pf_min; DROP TABLE IF EXISTS _pf_val; DROP TABLE IF EXISTS _pf_var;
  CREATE TEMP TABLE _pf_min ON COMMIT DROP AS
    SELECT b, NOT EXISTS (
             SELECT 1 FROM performance_disturbances d
             WHERE d.run_id = r.id AND d.excluded AND d.started_at < b + interval '1 minute' AND COALESCE(d.ended_at, r.closed_at) > b) AS valid
    FROM generate_series(v_from, v_to - interval '1 microsecond', interval '1 minute') b;
  SELECT count(*), count(*) FILTER (WHERE valid) INTO v_total, v_valid FROM _pf_min;
  v_excl := v_total - v_valid;
  CREATE TEMP TABLE _pf_val (key text, b timestamptz, val double precision, PRIMARY KEY (key, b)) ON COMMIT DROP;
  CREATE TEMP TABLE _pf_var (key text PRIMARY KEY, evaluable boolean) ON COMMIT DROP;

  -- Señales: promedio del minuto con datos buenos.
  INSERT INTO _pf_val (key, b, val)
  SELECT pv.key, d.bucket, d.avg_val
  FROM performance_variables pv
  JOIN performance_run_data d ON d.run_id = r.id AND d.variable_id = pv.id AND d.n_good > 0 AND d.avg_val IS NOT NULL
  JOIN _pf_min m ON m.b = d.bucket AND m.valid
  WHERE pv.revision_id = r.revision_id AND pv.source = 'signal';
  -- Manuales: última lectura vigente sostenida en cada minuto válido.
  INSERT INTO _pf_val (key, b, val)
  SELECT pv.key, m.b, (SELECT d.avg_val FROM performance_run_data d
                         WHERE d.run_id = r.id AND d.variable_id = pv.id AND d.bucket <= m.b ORDER BY d.bucket DESC LIMIT 1)
  FROM performance_variables pv CROSS JOIN _pf_min m
  WHERE pv.revision_id = r.revision_id AND pv.source = 'manual' AND m.valid
    AND EXISTS (SELECT 1 FROM performance_run_data d WHERE d.run_id = r.id AND d.variable_id = pv.id AND d.bucket <= m.b);

  -- Validación de variables base.
  FOR v IN SELECT * FROM performance_variables WHERE revision_id = r.revision_id AND source <> 'derived' ORDER BY ord LOOP
    v_unit_ok := true; v_spikes := 0; v_oor := 0; v_bad := 0; v_sig_tag := NULL; v_sig_unit := NULL; v_rmin := NULL; v_rmax := NULL;
    IF v.source = 'signal' THEN
      SELECT s.signal_tag, s.eng_unit, s.range_min, s.range_max INTO v_sig_tag, v_sig_unit, v_rmin, v_rmax FROM signals s WHERE s.id = v.signal_id;
      v_unit_ok := public.mgmt_text(v_sig_unit, 40) IS NULL OR v.unit IS NULL OR lower(btrim(v_sig_unit)) = lower(btrim(v.unit));
      v_expected := v_valid * LEAST(1, 60.0 / rev.sample_interval_s);
      SELECT count(*) INTO v_present FROM _pf_val WHERE key = v.key;
      SELECT COALESCE(100.0 * sum(d.n_bad) / NULLIF(sum(d.n_good + d.n_bad), 0), 0) INTO v_bad
      FROM performance_run_data d JOIN _pf_min m ON m.b = d.bucket AND m.valid
      WHERE d.run_id = r.id AND d.variable_id = v.id;
      SELECT count(*) FILTER (WHERE v_rmin IS NOT NULL AND v_rmax IS NOT NULL AND v_rmax > v_rmin AND (val < v_rmin OR val > v_rmax))
        INTO v_oor FROM _pf_val WHERE key = v.key;
      -- S12 (E-18): los minutos fuera del rango del instrumento no entran al estadístico (cuentan como faltantes).
      IF v_oor > 0 AND rev.exclude_out_of_range THEN
        DELETE FROM _pf_val WHERE key = v.key AND (val < v_rmin OR val > v_rmax);
        v_present := v_present - v_oor;
      END IF;
    ELSE
      v_expected := ceil(v_valid::numeric / v.manual_every_min);
      SELECT count(*) INTO v_present FROM performance_run_data d JOIN _pf_min m ON m.b = d.bucket AND m.valid
       WHERE d.run_id = r.id AND d.variable_id = v.id;
    END IF;
    IF v.max_step IS NOT NULL THEN
      SELECT count(*) INTO v_spikes FROM (
        SELECT abs(val - lag(val) OVER (ORDER BY b)) AS step FROM _pf_val WHERE key = v.key) s
      WHERE s.step > v.max_step;
    END IF;
    v_cov := CASE WHEN v_expected > 0 THEN LEAST(100, round(100.0 * v_present / v_expected, 2)) ELSE 0 END;
    -- S12 (E-18): la calidad mala y los picos ya no son solo informativos: por encima del umbral de la revisión
    -- la sugerencia pasa a «no concluyente» (la evaluación no corrige los datos).
    INSERT INTO _pf_var VALUES (v.key, v_unit_ok AND v_cov >= rev.min_coverage_pct AND v_valid > 0);
    v_vars := v_vars || jsonb_build_array(jsonb_build_object(
      'key', v.key, 'label', v.label, 'unit', v.unit, 'source', v.source, 'signal', v_sig_tag,
      'expected', round(v_expected, 2), 'present', v_present, 'coverage_pct', v_cov, 'coverage_ok', v_cov >= rev.min_coverage_pct,
      'bad_pct', round(v_bad, 2), 'spikes', v_spikes, 'out_of_range', v_oor, 'unit_ok', v_unit_ok,
      'quality_ok', v_bad <= rev.max_bad_pct AND (rev.max_spikes IS NULL OR v_spikes <= rev.max_spikes),
      'out_of_range_excluded', v_oor > 0 AND rev.exclude_out_of_range,
      'evaluable', v_unit_ok AND v_cov >= rev.min_coverage_pct AND v_valid > 0));
  END LOOP;

  -- Derivadas, en orden de dependencias (iterando hasta que no se agreguen más).
  FOR v_n IN 1..20 LOOP
    INSERT INTO _pf_var (key, evaluable)
    SELECT pv.key, va.evaluable AND vb.evaluable
    FROM performance_variables pv
    JOIN _pf_var va ON va.key = pv.operand_a
    JOIN _pf_var vb ON vb.key = pv.operand_b
    WHERE pv.revision_id = r.revision_id AND pv.source = 'derived' AND NOT EXISTS (SELECT 1 FROM _pf_var x WHERE x.key = pv.key);
    EXIT WHEN NOT FOUND;
    INSERT INTO _pf_val (key, b, val)
    SELECT pv.key, a.b,
           CASE pv.op WHEN '+' THEN a.val + bb.val WHEN '-' THEN a.val - bb.val WHEN '*' THEN a.val * bb.val
                      ELSE CASE WHEN bb.val = 0 THEN NULL ELSE a.val / bb.val END END
    FROM performance_variables pv
    JOIN _pf_val a ON a.key = pv.operand_a
    JOIN _pf_val bb ON bb.key = pv.operand_b AND bb.b = a.b
    WHERE pv.revision_id = r.revision_id AND pv.source = 'derived'
      AND NOT EXISTS (SELECT 1 FROM _pf_val x WHERE x.key = pv.key)
      AND EXISTS (SELECT 1 FROM _pf_var x WHERE x.key = pv.key)
    ON CONFLICT DO NOTHING;
    DELETE FROM _pf_val WHERE val IS NULL;
  END LOOP;
  FOR v IN SELECT pv.*, x.evaluable FROM performance_variables pv JOIN _pf_var x ON x.key = pv.key
            WHERE pv.revision_id = r.revision_id AND pv.source = 'derived' ORDER BY pv.ord LOOP
    SELECT count(*) INTO v_present FROM _pf_val WHERE key = v.key;
    v_vars := v_vars || jsonb_build_array(jsonb_build_object(
      'key', v.key, 'label', v.label, 'unit', v.unit, 'source', 'derived', 'formula', v.operand_a || ' ' || v.op || ' ' || v.operand_b,
      'present', v_present, 'coverage_pct', CASE WHEN v_valid > 0 THEN round(100.0 * v_present / v_valid, 2) ELSE 0 END,
      'evaluable', v.evaluable AND v_present > 0));
    UPDATE _pf_var SET evaluable = v.evaluable AND v_present > 0 WHERE key = v.key;
  END LOOP;

  -- Criterios.
  FOR c IN SELECT * FROM performance_criteria WHERE revision_id = r.revision_id ORDER BY ord LOOP
    v_val := NULL;
    IF c.statistic = 'avg' THEN SELECT avg(val) INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'min' THEN SELECT min(val) INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'max' THEN SELECT max(val) INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'pct_in_band' THEN
      SELECT 100.0 * count(*) FILTER (WHERE (c.band_lo IS NULL OR val >= c.band_lo) AND (c.band_hi IS NULL OR val <= c.band_hi)) / NULLIF(count(*), 0)
        INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'total' THEN
      -- Suma de los minutos válidos con dato (no extrapola los faltantes ni los excluidos; S12 E-28 documenta y
      -- agrega value_extrapolated = promedio × minutos del periodo formal).
      SELECT sum(val) / CASE c.total_basis WHEN 'min' THEN 1 WHEN 'h' THEN 60 ELSE 1440 END INTO v_val FROM _pf_val WHERE key = c.variable_key;
    END IF;
    v_margin_lo := CASE c.uncertainty_mode WHEN 'pct' THEN abs(c.target) * c.uncertainty / 100 ELSE c.uncertainty END;
    v_margin_hi := CASE c.uncertainty_mode WHEN 'pct' THEN abs(COALESCE(c.target_hi, c.target)) * c.uncertainty / 100 ELSE c.uncertainty END;
    IF v_val IS NULL OR NOT COALESCE((SELECT evaluable FROM _pf_var WHERE key = c.variable_key), false) THEN
      v_outcome := 'not_evaluable';
    ELSIF c.operator = 'gte' THEN
      v_outcome := CASE WHEN v_val >= c.target THEN 'pass' WHEN v_val >= c.target - v_margin_lo THEN 'within_uncertainty' ELSE 'fail' END;
    ELSIF c.operator = 'lte' THEN
      v_outcome := CASE WHEN v_val <= c.target THEN 'pass' WHEN v_val <= c.target + v_margin_lo THEN 'within_uncertainty' ELSE 'fail' END;
    ELSE
      v_outcome := CASE WHEN v_val BETWEEN c.target AND c.target_hi THEN 'pass'
                        WHEN v_val BETWEEN c.target - v_margin_lo AND c.target_hi + v_margin_hi THEN 'within_uncertainty' ELSE 'fail' END;
    END IF;
    v_any_fail := v_any_fail OR v_outcome = 'fail';
    v_any_within := v_any_within OR v_outcome = 'within_uncertainty';
    v_any_ne := v_any_ne OR v_outcome = 'not_evaluable';
    v_crits := v_crits || jsonb_build_array(jsonb_build_object(
      'ord', c.ord, 'variable_key', c.variable_key, 'label', c.label, 'statistic', c.statistic, 'band_lo', c.band_lo, 'band_hi', c.band_hi,
      'total_basis', c.total_basis, 'operator', c.operator, 'target', c.target, 'target_hi', c.target_hi,
      'uncertainty', c.uncertainty, 'uncertainty_mode', c.uncertainty_mode,
      'value', CASE WHEN v_val IS NULL THEN NULL ELSE round(v_val::numeric, 6) END, 'outcome', v_outcome,
      'value_extrapolated', CASE WHEN c.statistic = 'total' THEN (SELECT round((avg(val) * v_total / CASE c.total_basis WHEN 'min' THEN 1 WHEN 'h' THEN 60 ELSE 1440 END)::numeric, 6)
                                                                  FROM _pf_val WHERE key = c.variable_key) END));
  END LOOP;

  -- Pares de medidores: diferencia relativa promedio.
  FOR p IN SELECT * FROM performance_meter_pairs WHERE revision_id = r.revision_id ORDER BY ord LOOP
    SELECT avg(abs(a.val - b2.val) / NULLIF(abs((a.val + b2.val) / 2), 0)) * 100, count(*)
      INTO v_diff, v_n
    FROM _pf_val a JOIN _pf_val b2 ON b2.key = p.variable_b AND b2.b = a.b WHERE a.key = p.variable_a;
    v_pairs := v_pairs || jsonb_build_array(jsonb_build_object(
      'variable_a', p.variable_a, 'variable_b', p.variable_b, 'max_diff_pct', p.max_diff_pct,
      'diff_pct', CASE WHEN v_diff IS NULL THEN NULL ELSE round(v_diff::numeric, 3) END, 'minutes', v_n,
      'ok', v_diff IS NOT NULL AND v_diff <= p.max_diff_pct));
    IF v_diff IS NULL OR v_diff > p.max_diff_pct THEN v_reasons := array_append(v_reasons, 'pair'); END IF;
  END LOOP;

  IF v_valid = 0 THEN v_reasons := array_append(v_reasons, 'no_valid_data'); END IF;
  IF r.early_close THEN v_reasons := array_append(v_reasons, 'early_close'); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_vars) x
              WHERE (x ->> 'source') <> 'derived' AND NOT (x ->> 'unit_ok')::boolean
                AND (EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.revision_id AND variable_key = x ->> 'key')
                  OR EXISTS (SELECT 1 FROM performance_meter_pairs WHERE revision_id = r.revision_id AND (variable_a = x ->> 'key' OR variable_b = x ->> 'key'))
                  OR EXISTS (SELECT 1 FROM performance_variables d WHERE d.revision_id = r.revision_id AND d.source = 'derived' AND (d.operand_a = x ->> 'key' OR d.operand_b = x ->> 'key')))) THEN
    v_reasons := array_append(v_reasons, 'unit');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_vars) x
              WHERE (x ->> 'source') <> 'derived' AND NOT (x ->> 'coverage_ok')::boolean
                AND (EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.revision_id AND variable_key = x ->> 'key')
                  OR EXISTS (SELECT 1 FROM performance_meter_pairs WHERE revision_id = r.revision_id AND (variable_a = x ->> 'key' OR variable_b = x ->> 'key'))
                  OR EXISTS (SELECT 1 FROM performance_variables d WHERE d.revision_id = r.revision_id AND d.source = 'derived' AND (d.operand_a = x ->> 'key' OR d.operand_b = x ->> 'key')))) THEN
    v_reasons := array_append(v_reasons, 'coverage');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_vars) x
              WHERE (x ->> 'source') <> 'derived' AND NOT COALESCE((x ->> 'quality_ok')::boolean, true)
                AND (EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.revision_id AND variable_key = x ->> 'key')
                  OR EXISTS (SELECT 1 FROM performance_meter_pairs WHERE revision_id = r.revision_id AND (variable_a = x ->> 'key' OR variable_b = x ->> 'key'))
                  OR EXISTS (SELECT 1 FROM performance_variables d WHERE d.revision_id = r.revision_id AND d.source = 'derived' AND (d.operand_a = x ->> 'key' OR d.operand_b = x ->> 'key')))) THEN
    v_reasons := array_append(v_reasons, 'data_quality');
  END IF;
  IF v_any_ne AND NOT ('coverage' = ANY (v_reasons) OR 'unit' = ANY (v_reasons)) THEN v_reasons := array_append(v_reasons, 'not_evaluable'); END IF;

  v_suggest := CASE WHEN cardinality(v_reasons) > 0 THEN 'inconclusive'
                    WHEN v_any_fail THEN 'failed'
                    WHEN v_any_within THEN 'accepted_with_deviation'
                    ELSE 'accepted' END;

  RETURN jsonb_build_object(
    'run', r.number, 'revision', rev.rev, 'revision_hash', rev.content_hash, 'computed_at', now(),
    'window', jsonb_build_object('from', v_from, 'to', v_to, 'total_min', v_total, 'excluded_min', v_excl, 'valid_min', v_valid,
                                 'formal_min', rev.formal_min, 'min_coverage_pct', rev.min_coverage_pct, 'early_close', r.early_close,
                                 'max_bad_pct', rev.max_bad_pct, 'max_spikes', rev.max_spikes, 'exclude_out_of_range', rev.exclude_out_of_range),
    'variables', v_vars, 'criteria', v_crits, 'pairs', v_pairs,
    'reasons', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_reasons) ORDER BY 1)), 'suggested', v_suggest);
END;
$function$;

-- ── 8. Permisos y retención versionada ───────────────────────────────────
REVOKE ALL ON FUNCTION public.ingest_signal_samples(uuid, text, text, text, uuid, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_signal_samples(uuid, text, text, text, uuid, jsonb, uuid, boolean) TO service_role;

-- El job ya existía en prod (creado a mano); cron.schedule con el mismo nombre lo reemplaza.
SELECT cron.schedule('signal-samples-retention-90d', '0 3 * * *', $cron$SELECT public.cleanup_signal_samples_retention()$cron$);
