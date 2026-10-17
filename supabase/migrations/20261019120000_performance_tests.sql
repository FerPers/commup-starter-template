-- Fase 7 del plan readiness, sesión 1 — prueba de desempeño: definición con revisiones, ejecución por intentos,
-- perturbaciones, captura manual y datos congelados (2026-10-17, decisiones de Luis, doc §14):
--   performance_tests (PTT-0001; sistema principal) → performance_test_revisions (8 secciones fijas en jsonb +
--     duraciones, frecuencia mínima y cobertura; draft → in_review → approved → superseded; aprueba un líder+
--     distinto del autor; hash al aprobar) → frontera N sistemas (performance_revision_systems), variables
--     (señal / manual / derivada de dos operandos), criterios estructurados y pares de medidores.
--   performance_runs (PTT-0001/R1): solo sobre la revisión aprobada vigente; planned → stabilizing → formal →
--     closed (o aborted); un solo intento vivo por prueba; cierre manual (anticipado = con motivo y marcado).
--   performance_disturbances: ventana, tipo, descripción; «excluir del cálculo» lo marca un líder+ con motivo.
--   performance_run_data: agregados de 1 minuto congelados al cerrar (signal_samples se purga a los 90 días),
--     con n_good / n_bad (calidad ≠ 0); las capturas manuales entran a la misma serie (source = manual).
--   La validación, el cálculo de criterios, el resultado y el certificado van en la sesión 2.
--   Todo en línea. Escritura solo por RPC SECURITY DEFINER.

-- ── 1. Definición ────────────────────────────────────────────────────────
CREATE TABLE public.performance_tests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq                 integer NOT NULL,
  number              text NOT NULL,
  title               text NOT NULL,
  primary_system_id   uuid NOT NULL REFERENCES public.systems(id) ON DELETE RESTRICT,
  current_revision_id uuid,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_tests_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT performance_tests_number_uq UNIQUE (project_id, number)
);
CREATE INDEX performance_tests_project_idx ON public.performance_tests (project_id);
CREATE INDEX performance_tests_system_idx ON public.performance_tests (primary_system_id);

CREATE TABLE public.performance_test_revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           uuid NOT NULL REFERENCES public.performance_tests(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rev               integer NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  sections          jsonb NOT NULL DEFAULT '{}'::jsonb,
  stabilization_min integer NOT NULL DEFAULT 60,
  formal_min        integer NOT NULL DEFAULT 360,
  sample_interval_s integer NOT NULL DEFAULT 60,
  min_coverage_pct  numeric NOT NULL DEFAULT 90,
  procedure_id      uuid REFERENCES public.procedures(id) ON DELETE SET NULL,
  change_reason     text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  submitted_by      uuid, submitted_at timestamptz,
  approved_by       uuid, approved_at  timestamptz,
  returned_reason   text,
  content_hash      text,
  CONSTRAINT performance_test_revisions_status_check CHECK (status IN ('draft', 'in_review', 'approved', 'superseded')),
  CONSTRAINT performance_test_revisions_sections_check CHECK (jsonb_typeof(sections) = 'object'),
  CONSTRAINT performance_test_revisions_stab_check CHECK (stabilization_min BETWEEN 0 AND 10080),
  CONSTRAINT performance_test_revisions_formal_check CHECK (formal_min BETWEEN 1 AND 20160),
  CONSTRAINT performance_test_revisions_interval_check CHECK (sample_interval_s BETWEEN 1 AND 3600),
  CONSTRAINT performance_test_revisions_coverage_check CHECK (min_coverage_pct > 0 AND min_coverage_pct <= 100),
  CONSTRAINT performance_test_revisions_uq UNIQUE (test_id, rev)
);
ALTER TABLE public.performance_tests ADD CONSTRAINT performance_tests_current_revision_fk
  FOREIGN KEY (current_revision_id) REFERENCES public.performance_test_revisions(id) ON DELETE SET NULL;

CREATE TABLE public.performance_revision_systems (
  revision_id uuid NOT NULL REFERENCES public.performance_test_revisions(id) ON DELETE CASCADE,
  system_id   uuid NOT NULL REFERENCES public.systems(id) ON DELETE RESTRICT,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (revision_id, system_id)
);

CREATE TABLE public.performance_variables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.performance_test_revisions(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ord         integer NOT NULL,
  key         text NOT NULL,
  label       text NOT NULL,
  unit        text,
  source      text NOT NULL,
  signal_id   uuid REFERENCES public.signals(id) ON DELETE RESTRICT,
  op          text,
  operand_a   text,
  operand_b   text,
  max_step    numeric,
  CONSTRAINT performance_variables_key_check CHECK (key ~ '^[A-Z][A-Z0-9_]{0,9}$'),
  CONSTRAINT performance_variables_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  CONSTRAINT performance_variables_source_check CHECK (source IN ('signal', 'manual', 'derived')),
  CONSTRAINT performance_variables_signal_check CHECK ((source = 'signal') = (signal_id IS NOT NULL)),
  CONSTRAINT performance_variables_derived_check CHECK (
    (source = 'derived') = (op IS NOT NULL AND operand_a IS NOT NULL AND operand_b IS NOT NULL)
    AND (op IS NULL OR op IN ('+', '-', '*', '/'))),
  CONSTRAINT performance_variables_step_check CHECK (max_step IS NULL OR max_step > 0),
  CONSTRAINT performance_variables_key_uq UNIQUE (revision_id, key),
  CONSTRAINT performance_variables_ord_uq UNIQUE (revision_id, ord)
);

CREATE TABLE public.performance_criteria (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id      uuid NOT NULL,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ord              integer NOT NULL,
  variable_key     text NOT NULL,
  label            text,
  statistic        text NOT NULL,
  band_lo          numeric,
  band_hi          numeric,
  total_basis      text,
  operator         text NOT NULL,
  target           numeric NOT NULL,
  target_hi        numeric,
  uncertainty      numeric NOT NULL DEFAULT 0,
  uncertainty_mode text NOT NULL DEFAULT 'abs',
  FOREIGN KEY (revision_id, variable_key) REFERENCES public.performance_variables(revision_id, key) ON DELETE CASCADE,
  CONSTRAINT performance_criteria_statistic_check CHECK (statistic IN ('avg', 'min', 'max', 'pct_in_band', 'total')),
  CONSTRAINT performance_criteria_band_check CHECK (
    (statistic = 'pct_in_band') = (band_lo IS NOT NULL OR band_hi IS NOT NULL)
    AND (band_lo IS NULL OR band_hi IS NULL OR band_hi > band_lo)),
  CONSTRAINT performance_criteria_basis_check CHECK ((statistic = 'total') = (total_basis IS NOT NULL) AND (total_basis IS NULL OR total_basis IN ('min', 'h', 'd'))),
  CONSTRAINT performance_criteria_operator_check CHECK (operator IN ('gte', 'lte', 'between')),
  CONSTRAINT performance_criteria_between_check CHECK ((operator = 'between') = (target_hi IS NOT NULL) AND (target_hi IS NULL OR target_hi >= target)),
  CONSTRAINT performance_criteria_pct_check CHECK (statistic <> 'pct_in_band' OR (target BETWEEN 0 AND 100 AND (target_hi IS NULL OR target_hi <= 100))),
  CONSTRAINT performance_criteria_uncertainty_check CHECK (uncertainty >= 0 AND uncertainty_mode IN ('abs', 'pct')),
  CONSTRAINT performance_criteria_ord_uq UNIQUE (revision_id, ord)
);

CREATE TABLE public.performance_meter_pairs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id  uuid NOT NULL,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ord          integer NOT NULL,
  variable_a   text NOT NULL,
  variable_b   text NOT NULL,
  max_diff_pct numeric NOT NULL,
  FOREIGN KEY (revision_id, variable_a) REFERENCES public.performance_variables(revision_id, key) ON DELETE CASCADE,
  FOREIGN KEY (revision_id, variable_b) REFERENCES public.performance_variables(revision_id, key) ON DELETE CASCADE,
  CONSTRAINT performance_meter_pairs_distinct_check CHECK (variable_a <> variable_b),
  CONSTRAINT performance_meter_pairs_diff_check CHECK (max_diff_pct > 0 AND max_diff_pct <= 100),
  CONSTRAINT performance_meter_pairs_ord_uq UNIQUE (revision_id, ord)
);

-- ── 2. Ejecución ─────────────────────────────────────────────────────────
CREATE TABLE public.performance_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  test_id                  uuid NOT NULL REFERENCES public.performance_tests(id) ON DELETE CASCADE,
  revision_id              uuid NOT NULL REFERENCES public.performance_test_revisions(id) ON DELETE RESTRICT,
  attempt                  integer NOT NULL,
  number                   text NOT NULL,
  status                   text NOT NULL DEFAULT 'planned',
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  stabilization_started_by uuid, stabilization_started_at timestamptz,
  formal_started_by        uuid, formal_started_at        timestamptz, formal_start_note text,
  closed_by                uuid, closed_at                timestamptz,
  early_close              boolean NOT NULL DEFAULT false,
  early_close_reason       text,
  frozen_at                timestamptz,
  frozen_rows              integer,
  aborted_by               uuid, aborted_at               timestamptz, abort_reason text,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_runs_status_check CHECK (status IN ('planned', 'stabilizing', 'formal', 'closed', 'aborted')),
  CONSTRAINT performance_runs_attempt_uq UNIQUE (test_id, attempt),
  CONSTRAINT performance_runs_number_uq UNIQUE (project_id, number)
);
-- Un solo intento vivo por prueba (decisión S1).
CREATE UNIQUE INDEX performance_runs_one_live_uq ON public.performance_runs (test_id) WHERE status IN ('planned', 'stabilizing', 'formal');
CREATE INDEX performance_runs_project_idx ON public.performance_runs (project_id);

CREATE TABLE public.performance_disturbances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL REFERENCES public.performance_runs(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL,
  ended_at         timestamptz,
  kind             text NOT NULL,
  description      text NOT NULL,
  recorded_by      uuid,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  excluded         boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  excluded_by      uuid,
  excluded_at      timestamptz,
  CONSTRAINT performance_disturbances_kind_check CHECK (kind IN ('trip', 'load_change', 'instrument_fault', 'process_upset', 'other')),
  CONSTRAINT performance_disturbances_window_check CHECK (ended_at IS NULL OR ended_at > started_at),
  CONSTRAINT performance_disturbances_desc_check CHECK (length(btrim(description)) BETWEEN 3 AND 2000)
);
CREATE INDEX performance_disturbances_run_idx ON public.performance_disturbances (run_id);

CREATE TABLE public.performance_run_data (
  run_id      uuid NOT NULL REFERENCES public.performance_runs(id) ON DELETE CASCADE,
  variable_id uuid NOT NULL REFERENCES public.performance_variables(id) ON DELETE RESTRICT,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  bucket      timestamptz NOT NULL,
  avg_val     double precision,
  min_val     double precision,
  max_val     double precision,
  n_good      integer NOT NULL DEFAULT 0,
  n_bad       integer NOT NULL DEFAULT 0,
  source      text NOT NULL,
  entered_by  uuid,
  entered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, variable_id, bucket),
  CONSTRAINT performance_run_data_source_check CHECK (source IN ('iiot', 'manual')),
  CONSTRAINT performance_run_data_bucket_check CHECK (bucket = date_trunc('minute', bucket))
);

ALTER TABLE public.performance_tests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_test_revisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_revision_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_variables        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_criteria         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_meter_pairs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_disturbances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_run_data         ENABLE ROW LEVEL SECURITY;
CREATE POLICY performance_tests_select ON public.performance_tests FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_test_revisions_select ON public.performance_test_revisions FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_revision_systems_select ON public.performance_revision_systems FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_variables_select ON public.performance_variables FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_criteria_select ON public.performance_criteria FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_meter_pairs_select ON public.performance_meter_pairs FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_runs_select ON public.performance_runs FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_disturbances_select ON public.performance_disturbances FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY performance_run_data_select ON public.performance_run_data FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 3. Numeración y helpers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mgmt_next_seq(p_table text, p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_seq integer;
BEGIN
  IF p_table NOT IN ('actions', 'project_constraints', 'technical_queries', 'decisions', 'procedures', 'procedure_runs', 'lineup_sheets',
                     'startup_events', 'ownership_transfers', 'performance_tests') THEN
    RAISE EXCEPTION 'Tabla no válida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mgmt:' || p_table || ':' || p_project_id::text));
  EXECUTE format('SELECT COALESCE(MAX(seq), 0) + 1 FROM public.%I WHERE project_id = $1', p_table)
    INTO v_seq USING p_project_id;
  RETURN v_seq;
END;
$fn$;

-- Claves de las 8 secciones (catálogo fijo, = src/lib/performance/catalog.ts).
CREATE OR REPLACE FUNCTION public.performance_section_keys()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT ARRAY['purpose', 'boundary', 'conditions', 'method', 'corrections', 'uncertainty', 'references', 'responsibilities'];
$fn$;

CREATE OR REPLACE FUNCTION public.performance_is_lead(p_role text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(p_role IN ('owner', 'admin', 'architect', 'leader'), false);
$fn$;

-- Hora informada para un hito de la ejecución: por defecto ahora; no futura (2 min de tolerancia de reloj),
-- no anterior al hito previo ni a más de 48 h.
CREATE OR REPLACE FUNCTION public.performance_check_at(p_at timestamptz, p_floor timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_at timestamptz := LEAST(COALESCE(p_at, now()), now());
BEGIN
  IF p_at IS NOT NULL AND p_at > now() + interval '2 minutes' THEN RAISE EXCEPTION 'La hora no puede ser futura' USING ERRCODE = '22023'; END IF;
  IF v_at < now() - interval '48 hours' THEN RAISE EXCEPTION 'La hora no puede ser de hace más de 48 h' USING ERRCODE = '22023'; END IF;
  IF p_floor IS NOT NULL AND v_at < p_floor THEN RAISE EXCEPTION 'La hora es anterior al hito previo de la ejecución' USING ERRCODE = '22023'; END IF;
  RETURN v_at;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.performance_revision_hash(p_revision_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'test', t.number, 'title', t.title, 'primary_system', t.primary_system_id, 'rev', r.rev, 'sections', r.sections,
    'stabilization_min', r.stabilization_min, 'formal_min', r.formal_min, 'sample_interval_s', r.sample_interval_s,
    'min_coverage_pct', r.min_coverage_pct, 'procedure', r.procedure_id,
    'systems', COALESCE((SELECT jsonb_agg(s.system_id ORDER BY s.system_id) FROM performance_revision_systems s WHERE s.revision_id = r.id), '[]'::jsonb),
    'variables', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label, 'unit', v.unit, 'source', v.source,
                'signal', v.signal_id, 'op', v.op, 'a', v.operand_a, 'b', v.operand_b, 'max_step', v.max_step) ORDER BY v.ord)
                FROM performance_variables v WHERE v.revision_id = r.id), '[]'::jsonb),
    'criteria', COALESCE((SELECT jsonb_agg(jsonb_build_object('var', c.variable_key, 'label', c.label, 'stat', c.statistic,
                'band_lo', c.band_lo, 'band_hi', c.band_hi, 'basis', c.total_basis, 'op', c.operator, 'target', c.target,
                'target_hi', c.target_hi, 'u', c.uncertainty, 'u_mode', c.uncertainty_mode) ORDER BY c.ord)
                FROM performance_criteria c WHERE c.revision_id = r.id), '[]'::jsonb),
    'pairs', COALESCE((SELECT jsonb_agg(jsonb_build_object('a', m.variable_a, 'b', m.variable_b, 'max', m.max_diff_pct) ORDER BY m.ord)
                FROM performance_meter_pairs m WHERE m.revision_id = r.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
  FROM performance_test_revisions r JOIN performance_tests t ON t.id = r.test_id WHERE r.id = p_revision_id;
$fn$;

-- Reemplaza todo el contenido de una revisión en borrador:
-- p_content = {sections, settings:{stabilization_min, formal_min, sample_interval_s, min_coverage_pct, procedure_id},
--              system_ids:[…], variables:[…], criteria:[…], pairs:[…]}. Valida pertenencia, unidades y ciclos.
CREATE OR REPLACE FUNCTION public.performance_write_content(r performance_test_revisions, p_content jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  e jsonb; i integer; k text; v_clean jsonb := '{}'::jsonb; v_set jsonb; v_sig_id uuid; v_sig_tag text; v_sig_unit text; v_unit text; v_src text;
  v_primary uuid; v_cycle text; v_proc uuid;
BEGIN
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN RAISE EXCEPTION 'Contenido no válido' USING ERRCODE = '22023'; END IF;
  SELECT primary_system_id INTO v_primary FROM performance_tests WHERE id = r.test_id;

  -- Secciones
  IF jsonb_typeof(COALESCE(p_content -> 'sections', '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'Secciones no válidas' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(p_content -> 'sections', '{}'::jsonb)) LOOP
    IF NOT (k = ANY (public.performance_section_keys())) THEN RAISE EXCEPTION 'Sección desconocida: %', k USING ERRCODE = '22023'; END IF;
    IF public.mgmt_text(p_content -> 'sections' ->> k, 20000) IS NOT NULL THEN
      v_clean := v_clean || jsonb_build_object(k, public.mgmt_text(p_content -> 'sections' ->> k, 20000));
    END IF;
  END LOOP;

  -- Ajustes
  v_set := COALESCE(p_content -> 'settings', '{}'::jsonb);
  v_proc := NULLIF(v_set ->> 'procedure_id', '')::uuid;
  IF v_proc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedures WHERE id = v_proc AND project_id = r.project_id) THEN
    RAISE EXCEPTION 'El procedimiento no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  UPDATE performance_test_revisions SET
    sections          = v_clean,
    stabilization_min = COALESCE((v_set ->> 'stabilization_min')::integer, stabilization_min),
    formal_min        = COALESCE((v_set ->> 'formal_min')::integer, formal_min),
    sample_interval_s = COALESCE((v_set ->> 'sample_interval_s')::integer, sample_interval_s),
    min_coverage_pct  = COALESCE((v_set ->> 'min_coverage_pct')::numeric, min_coverage_pct),
    procedure_id      = v_proc,
    updated_at        = now()
  WHERE id = r.id;

  -- Frontera (el sistema principal siempre está incluido)
  DELETE FROM performance_revision_systems WHERE revision_id = r.id;
  INSERT INTO performance_revision_systems (revision_id, system_id, project_id) VALUES (r.id, v_primary, r.project_id);
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'system_ids', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM systems WHERE id = (e #>> '{}')::uuid AND project_id = r.project_id) THEN
      RAISE EXCEPTION 'Un sistema de la frontera no pertenece al proyecto' USING ERRCODE = '22023';
    END IF;
    INSERT INTO performance_revision_systems (revision_id, system_id, project_id) VALUES (r.id, (e #>> '{}')::uuid, r.project_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Variables (borrar arrastra criterios y pares por FK compuesta)
  IF jsonb_typeof(COALESCE(p_content -> 'variables', '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_content -> 'variables', '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'Variables no válidas' USING ERRCODE = '22023';
  END IF;
  DELETE FROM performance_criteria WHERE revision_id = r.id;
  DELETE FROM performance_meter_pairs WHERE revision_id = r.id;
  DELETE FROM performance_variables WHERE revision_id = r.id;
  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'variables', '[]'::jsonb)) LOOP
    i := i + 1;
    v_src := e ->> 'source';
    v_unit := public.mgmt_text(e ->> 'unit', 40);
    v_sig_id := NULL;
    IF v_src = 'signal' THEN
      SELECT s.id, s.signal_tag, s.eng_unit INTO v_sig_id, v_sig_tag, v_sig_unit FROM signals s JOIN tags t ON t.id = s.tag_id
       WHERE s.id = NULLIF(e ->> 'signal_id', '')::uuid AND t.project_id = r.project_id;
      IF v_sig_id IS NULL THEN RAISE EXCEPTION 'La señal de la variable % no pertenece al proyecto', e ->> 'key' USING ERRCODE = '22023'; END IF;
      IF v_unit IS NULL THEN v_unit := public.mgmt_text(v_sig_unit, 40);
      ELSIF public.mgmt_text(v_sig_unit, 40) IS NOT NULL AND lower(v_unit) <> lower(btrim(v_sig_unit)) THEN
        RAISE EXCEPTION 'La unidad de la variable % (%) no coincide con la de la señal % (%)', e ->> 'key', v_unit, v_sig_tag, v_sig_unit
          USING ERRCODE = '22023';
      END IF;
    END IF;
    INSERT INTO performance_variables (revision_id, project_id, ord, key, label, unit, source, signal_id, op, operand_a, operand_b, max_step)
    VALUES (r.id, r.project_id, i, upper(btrim(COALESCE(e ->> 'key', ''))), COALESCE(public.mgmt_text(e ->> 'label', 200), upper(btrim(COALESCE(e ->> 'key', '')))),
            v_unit, v_src,
            v_sig_id,
            CASE WHEN v_src = 'derived' THEN e ->> 'op' END,
            CASE WHEN v_src = 'derived' THEN upper(btrim(e ->> 'operand_a')) END,
            CASE WHEN v_src = 'derived' THEN upper(btrim(e ->> 'operand_b')) END,
            NULLIF(e ->> 'max_step', '')::numeric);
  END LOOP;

  -- Derivadas: operandos existentes y sin ciclos
  IF EXISTS (SELECT 1 FROM performance_variables v WHERE v.revision_id = r.id AND v.source = 'derived'
              AND (NOT EXISTS (SELECT 1 FROM performance_variables a WHERE a.revision_id = r.id AND a.key = v.operand_a)
                OR NOT EXISTS (SELECT 1 FROM performance_variables b WHERE b.revision_id = r.id AND b.key = v.operand_b))) THEN
    RAISE EXCEPTION 'Una variable derivada usa un operando que no existe' USING ERRCODE = '22023';
  END IF;
  WITH RECURSIVE edges AS (
    SELECT key AS src, operand_a AS dst FROM performance_variables WHERE revision_id = r.id AND source = 'derived'
    UNION ALL
    SELECT key, operand_b FROM performance_variables WHERE revision_id = r.id AND source = 'derived'
  ), walk(start, cur, depth) AS (
    SELECT src, dst, 1 FROM edges
    UNION ALL
    SELECT w.start, e.dst, w.depth + 1 FROM walk w JOIN edges e ON e.src = w.cur WHERE w.depth < 100 AND w.cur <> w.start
  )
  SELECT start INTO v_cycle FROM walk WHERE cur = start LIMIT 1;
  IF v_cycle IS NOT NULL THEN RAISE EXCEPTION 'La variable derivada % depende de sí misma', v_cycle USING ERRCODE = '22023'; END IF;

  -- Criterios
  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'criteria', '[]'::jsonb)) LOOP
    i := i + 1;
    IF NOT EXISTS (SELECT 1 FROM performance_variables WHERE revision_id = r.id AND key = upper(btrim(COALESCE(e ->> 'variable_key', '')))) THEN
      RAISE EXCEPTION 'El criterio % usa una variable que no existe', i USING ERRCODE = '22023';
    END IF;
    INSERT INTO performance_criteria (revision_id, project_id, ord, variable_key, label, statistic, band_lo, band_hi, total_basis,
                                      operator, target, target_hi, uncertainty, uncertainty_mode)
    VALUES (r.id, r.project_id, i, upper(btrim(e ->> 'variable_key')), public.mgmt_text(e ->> 'label', 200), e ->> 'statistic',
            NULLIF(e ->> 'band_lo', '')::numeric, NULLIF(e ->> 'band_hi', '')::numeric, NULLIF(e ->> 'total_basis', ''),
            e ->> 'operator', (e ->> 'target')::numeric, NULLIF(e ->> 'target_hi', '')::numeric,
            COALESCE(NULLIF(e ->> 'uncertainty', '')::numeric, 0), COALESCE(NULLIF(e ->> 'uncertainty_mode', ''), 'abs'));
  END LOOP;

  -- Pares de medidores
  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'pairs', '[]'::jsonb)) LOOP
    i := i + 1;
    INSERT INTO performance_meter_pairs (revision_id, project_id, ord, variable_a, variable_b, max_diff_pct)
    VALUES (r.id, r.project_id, i, upper(btrim(e ->> 'variable_a')), upper(btrim(e ->> 'variable_b')), (e ->> 'max_diff_pct')::numeric);
  END LOOP;
END;
$fn$;

-- ── 4. RPCs de definición ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_performance_test(p_project_id uuid, p_title text, p_primary_system_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_rev uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_primary_system_id IS NULL THEN RAISE EXCEPTION 'Elige el sistema principal' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_primary_system_id, NULL);
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  v_seq := public.mgmt_next_seq('performance_tests', p_project_id);
  INSERT INTO performance_tests (org_id, project_id, seq, number, title, primary_system_id, created_by)
  VALUES (v_org, p_project_id, v_seq, 'PTT-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200), p_primary_system_id, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO performance_test_revisions (test_id, org_id, project_id, rev, created_by) VALUES (v_id, v_org, p_project_id, 0, auth.uid()) RETURNING id INTO v_rev;
  INSERT INTO performance_revision_systems (revision_id, system_id, project_id) VALUES (v_rev, p_primary_system_id, p_project_id);
  RETURN v_id;
END;
$fn$;

-- Título siempre; sistema principal solo mientras no haya intentos.
CREATE OR REPLACE FUNCTION public.update_performance_test(p_test_id uuid, p_title text, p_primary_system_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE t performance_tests%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  IF p_primary_system_id IS NOT NULL AND p_primary_system_id <> t.primary_system_id THEN
    IF EXISTS (SELECT 1 FROM performance_runs WHERE test_id = t.id) THEN
      RAISE EXCEPTION 'El sistema principal no se cambia después del primer intento' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.mgmt_check_refs(t.project_id, t.org_id, p_primary_system_id, NULL);
    INSERT INTO performance_revision_systems (revision_id, system_id, project_id)
    SELECT id, p_primary_system_id, project_id FROM performance_test_revisions WHERE test_id = t.id AND status = 'draft'
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE performance_tests SET title = public.mgmt_text(p_title, 200), primary_system_id = COALESCE(p_primary_system_id, primary_system_id),
         updated_at = now() WHERE id = t.id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_performance_revision(p_revision_id uuid, p_content jsonb, p_change_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_test_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM performance_test_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se edita una revisión en borrador' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.performance_write_content(r, p_content);
  UPDATE performance_test_revisions SET change_reason = COALESCE(public.mgmt_text(p_change_reason, 2000), change_reason), updated_at = now()
   WHERE id = p_revision_id;
END;
$fn$;

-- draft → in_review (≥ 1 criterio) · in_review → draft (devolver con motivo) · in_review → approved (líder+ ≠ autor).
CREATE OR REPLACE FUNCTION public.transition_performance_revision(p_revision_id uuid, p_to text, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_test_revisions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000); v_prev uuid;
BEGIN
  SELECT * INTO r FROM performance_test_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF r.status = 'draft' AND p_to = 'in_review' THEN
    IF NOT EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.id) THEN
      RAISE EXCEPTION 'La prueba necesita al menos un criterio de aceptación' USING ERRCODE = 'P0001';
    END IF;
    IF r.rev > 0 AND public.mgmt_text(r.change_reason) IS NULL THEN RAISE EXCEPTION 'Indica el motivo del cambio de la revisión' USING ERRCODE = '22023'; END IF;
    UPDATE performance_test_revisions SET status = 'in_review', submitted_by = v_uid, submitted_at = now(), returned_reason = NULL, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'draft' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se devuelve' USING ERRCODE = '22023'; END IF;
    UPDATE performance_test_revisions SET status = 'draft', returned_reason = v_comment, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'approved' THEN
    IF v_uid = r.created_by OR v_uid = r.submitted_by THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien redactó la prueba' USING ERRCODE = '42501'; END IF;
    SELECT id INTO v_prev FROM performance_test_revisions WHERE test_id = r.test_id AND status = 'approved' AND id <> r.id;
    UPDATE performance_test_revisions SET status = 'superseded', updated_at = now() WHERE id = v_prev;
    UPDATE performance_test_revisions SET status = 'approved', approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = r.id;
    UPDATE performance_test_revisions SET content_hash = public.performance_revision_hash(r.id) WHERE id = r.id;
    UPDATE performance_tests SET current_revision_id = r.id, updated_at = now() WHERE id = r.test_id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$fn$;

-- Nueva revisión: copia la aprobada vigente a un borrador rev+1 (una sola revisión abierta a la vez).
CREATE OR REPLACE FUNCTION public.new_performance_revision(p_test_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE t performance_tests%ROWTYPE; v_role text; v_cur performance_test_revisions%ROWTYPE; v_id uuid; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM performance_test_revisions WHERE test_id = t.id AND status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'Ya hay una revisión abierta de %', t.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_cur FROM performance_test_revisions WHERE id = t.current_revision_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'La prueba aún no tiene revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la nueva revisión' USING ERRCODE = '22023'; END IF;
  INSERT INTO performance_test_revisions (test_id, org_id, project_id, rev, sections, stabilization_min, formal_min, sample_interval_s,
                                          min_coverage_pct, procedure_id, change_reason, created_by)
  VALUES (t.id, t.org_id, t.project_id, (SELECT MAX(rev) + 1 FROM performance_test_revisions WHERE test_id = t.id), v_cur.sections,
          v_cur.stabilization_min, v_cur.formal_min, v_cur.sample_interval_s, v_cur.min_coverage_pct, v_cur.procedure_id, v_reason, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO performance_revision_systems (revision_id, system_id, project_id)
  SELECT v_id, system_id, project_id FROM performance_revision_systems WHERE revision_id = v_cur.id;
  INSERT INTO performance_variables (revision_id, project_id, ord, key, label, unit, source, signal_id, op, operand_a, operand_b, max_step)
  SELECT v_id, project_id, ord, key, label, unit, source, signal_id, op, operand_a, operand_b, max_step FROM performance_variables WHERE revision_id = v_cur.id;
  INSERT INTO performance_criteria (revision_id, project_id, ord, variable_key, label, statistic, band_lo, band_hi, total_basis, operator,
                                    target, target_hi, uncertainty, uncertainty_mode)
  SELECT v_id, project_id, ord, variable_key, label, statistic, band_lo, band_hi, total_basis, operator, target, target_hi, uncertainty, uncertainty_mode
  FROM performance_criteria WHERE revision_id = v_cur.id;
  INSERT INTO performance_meter_pairs (revision_id, project_id, ord, variable_a, variable_b, max_diff_pct)
  SELECT v_id, project_id, ord, variable_a, variable_b, max_diff_pct FROM performance_meter_pairs WHERE revision_id = v_cur.id;
  RETURN v_id;
END;
$fn$;

-- Borrar: solo pruebas nunca aprobadas y sin intentos (quien la creó u owner/admin).
CREATE OR REPLACE FUNCTION public.delete_performance_test_draft(p_test_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE t performance_tests%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF v_role IS NULL OR NOT (t.created_by = auth.uid() OR v_role IN ('owner', 'admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM performance_test_revisions WHERE test_id = t.id AND approved_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM performance_runs WHERE test_id = t.id) THEN
    RAISE EXCEPTION 'Solo se borran pruebas nunca aprobadas ni ejecutadas' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM performance_tests WHERE id = t.id;
END;
$fn$;

-- ── 5. Ejecución ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_performance_run(p_test_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE t performance_tests%ROWTYPE; v_role text; v_rev performance_test_revisions%ROWTYPE; v_n integer; v_id uuid;
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores dirigen una prueba de desempeño' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_rev FROM performance_test_revisions WHERE id = t.current_revision_id AND status = 'approved';
  IF v_rev.id IS NULL THEN RAISE EXCEPTION 'Solo se ejecuta una definición aprobada' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM performance_runs WHERE test_id = t.id AND status IN ('planned', 'stabilizing', 'formal')) THEN
    RAISE EXCEPTION 'Ya hay un intento en curso de %', t.number USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(MAX(attempt), 0) + 1 INTO v_n FROM performance_runs WHERE test_id = t.id;
  INSERT INTO performance_runs (org_id, project_id, test_id, revision_id, attempt, number, created_by)
  VALUES (t.org_id, t.project_id, t.id, v_rev.id, v_n, t.number || '/R' || v_n, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- planned → stabilizing → formal. La formal antes del mínimo de estabilización exige nota.
CREATE OR REPLACE FUNCTION public.advance_performance_run(p_run_id uuid, p_to text, p_at timestamptz DEFAULT NULL, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; v_rev performance_test_revisions%ROWTYPE; v_role text; v_at timestamptz; v_comment text := public.mgmt_text(p_comment, 2000);
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores dirigen una prueba de desempeño' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_rev FROM performance_test_revisions WHERE id = r.revision_id;

  IF r.status = 'planned' AND p_to = 'stabilizing' THEN
    IF v_rev.status <> 'approved' THEN RAISE EXCEPTION 'La definición de este intento fue reemplazada: abre un intento nuevo' USING ERRCODE = 'P0001'; END IF;
    v_at := public.performance_check_at(p_at, r.created_at - interval '48 hours');
    UPDATE performance_runs SET status = 'stabilizing', stabilization_started_by = auth.uid(), stabilization_started_at = v_at, updated_at = now() WHERE id = r.id;
  ELSIF r.status = 'stabilizing' AND p_to = 'formal' THEN
    v_at := public.performance_check_at(p_at, r.stabilization_started_at);
    IF v_at < r.stabilization_started_at + make_interval(mins => v_rev.stabilization_min) AND (v_comment IS NULL OR length(v_comment) < 3) THEN
      RAISE EXCEPTION 'No se cumplió la estabilización mínima (% min): indica por qué se inicia el periodo formal', v_rev.stabilization_min USING ERRCODE = '22023';
    END IF;
    UPDATE performance_runs SET status = 'formal', formal_started_by = auth.uid(), formal_started_at = v_at, formal_start_note = v_comment, updated_at = now() WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.abort_performance_run(p_run_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores abortan una prueba' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('planned', 'stabilizing', 'formal') THEN RAISE EXCEPTION 'El intento no está en curso' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  UPDATE performance_runs SET status = 'aborted', aborted_by = auth.uid(), aborted_at = now(), abort_reason = v_reason, updated_at = now() WHERE id = r.id;
END;
$fn$;

-- Congela los agregados de 1 minuto de las variables de señal entre el inicio de la estabilización y el cierre.
-- Lee de signal_samples (no de la vista 1min, que descarta la calidad mala) para guardar n_bad.
CREATE OR REPLACE FUNCTION public.performance_freeze_run(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; v_n integer;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  DELETE FROM performance_run_data WHERE run_id = r.id AND source = 'iiot';
  INSERT INTO performance_run_data (run_id, variable_id, project_id, bucket, avg_val, min_val, max_val, n_good, n_bad, source)
  SELECT r.id, v.id, r.project_id, date_trunc('minute', ss.sampled_at),
         avg(ss.value) FILTER (WHERE ss.quality = 0), min(ss.value) FILTER (WHERE ss.quality = 0), max(ss.value) FILTER (WHERE ss.quality = 0),
         count(ss.value) FILTER (WHERE ss.quality = 0), count(*) FILTER (WHERE ss.quality <> 0 OR ss.value IS NULL), 'iiot'
  FROM performance_variables v
  JOIN signal_samples ss ON ss.signal_id = v.signal_id
   AND ss.sampled_at >= date_trunc('minute', r.stabilization_started_at) AND ss.sampled_at < r.closed_at
  WHERE v.revision_id = r.revision_id AND v.source = 'signal'
  GROUP BY v.id, date_trunc('minute', ss.sampled_at);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE performance_runs SET frozen_at = now(), frozen_rows = (SELECT count(*) FROM performance_run_data WHERE run_id = r.id), updated_at = now()
   WHERE id = r.id;
  RETURN v_n;
END;
$fn$;

-- Cierre manual del periodo formal; antes de la duración definida = cierre anticipado con motivo. Congela.
CREATE OR REPLACE FUNCTION public.close_performance_run(p_run_id uuid, p_at timestamptz DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; v_rev performance_test_revisions%ROWTYPE; v_role text; v_at timestamptz; v_early boolean; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores cierran una prueba' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'formal' THEN RAISE EXCEPTION 'Solo se cierra un intento en periodo formal' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_rev FROM performance_test_revisions WHERE id = r.revision_id;
  v_at := public.performance_check_at(p_at, r.formal_started_at);
  IF v_at <= r.formal_started_at THEN RAISE EXCEPTION 'El cierre debe ser posterior al inicio del periodo formal' USING ERRCODE = '22023'; END IF;
  v_early := v_at < r.formal_started_at + make_interval(mins => v_rev.formal_min);
  IF v_early AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'El periodo formal dura % min: indica el motivo del cierre anticipado', v_rev.formal_min USING ERRCODE = '22023';
  END IF;
  UPDATE performance_runs SET status = 'closed', closed_by = auth.uid(), closed_at = v_at, early_close = v_early,
         early_close_reason = CASE WHEN v_early THEN v_reason END, updated_at = now() WHERE id = r.id;
  -- Perturbaciones abiertas terminan con el cierre.
  UPDATE performance_disturbances SET ended_at = v_at WHERE run_id = r.id AND ended_at IS NULL AND started_at < v_at;
  RETURN public.performance_freeze_run(r.id);
END;
$fn$;

-- Re-congelar (datos IIoT que llegaron tarde); no toca las capturas manuales. Hasta que se registre el resultado (S2).
CREATE OR REPLACE FUNCTION public.refreeze_performance_run(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se re-congela un intento cerrado' USING ERRCODE = 'P0001'; END IF;
  RETURN public.performance_freeze_run(r.id);
END;
$fn$;

-- Perturbación: cualquier miembro no-client, dentro de la ventana del intento (estabilización → cierre).
CREATE OR REPLACE FUNCTION public.record_performance_disturbance(
  p_run_id uuid, p_kind text, p_description text, p_started_at timestamptz, p_ended_at timestamptz DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; v_role text; v_upper timestamptz; v_id uuid;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('stabilizing', 'formal', 'closed') THEN RAISE EXCEPTION 'Las perturbaciones se registran durante o después de la prueba' USING ERRCODE = 'P0001'; END IF;
  v_upper := COALESCE(r.closed_at, now() + interval '2 minutes');
  IF p_started_at IS NULL OR p_started_at < r.stabilization_started_at OR p_started_at >= v_upper THEN
    RAISE EXCEPTION 'El inicio de la perturbación está fuera de la ventana del intento' USING ERRCODE = '22023';
  END IF;
  IF p_ended_at IS NOT NULL AND (p_ended_at <= p_started_at OR p_ended_at > v_upper) THEN
    RAISE EXCEPTION 'El fin de la perturbación no es válido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO performance_disturbances (run_id, project_id, started_at, ended_at, kind, description, recorded_by)
  VALUES (r.id, r.project_id, p_started_at, CASE WHEN r.status = 'closed' THEN COALESCE(p_ended_at, r.closed_at) ELSE p_ended_at END,
          p_kind, public.mgmt_text(p_description, 2000), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.end_performance_disturbance(p_disturbance_id uuid, p_ended_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE d performance_disturbances%ROWTYPE; r performance_runs%ROWTYPE; v_role text; v_at timestamptz;
BEGIN
  SELECT * INTO d FROM performance_disturbances WHERE id = p_disturbance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perturbación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO r FROM performance_runs WHERE id = d.run_id;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF d.ended_at IS NOT NULL THEN RAISE EXCEPTION 'La perturbación ya terminó' USING ERRCODE = 'P0001'; END IF;
  v_at := LEAST(COALESCE(p_ended_at, now()), now());
  IF v_at <= d.started_at THEN RAISE EXCEPTION 'El fin debe ser posterior al inicio' USING ERRCODE = '22023'; END IF;
  UPDATE performance_disturbances SET ended_at = v_at WHERE id = d.id;
END;
$fn$;

-- «Excluir del cálculo» (o revertir): líder+, con motivo; solo con el periodo formal iniciado.
CREATE OR REPLACE FUNCTION public.set_performance_disturbance_exclusion(p_disturbance_id uuid, p_excluded boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE d performance_disturbances%ROWTYPE; r performance_runs%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO d FROM performance_disturbances WHERE id = p_disturbance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perturbación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO r FROM performance_runs WHERE id = d.run_id;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores excluyen perturbaciones del cálculo' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('formal', 'closed') THEN RAISE EXCEPTION 'Solo se excluyen perturbaciones del periodo formal' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_excluded, false) = d.excluded THEN RETURN; END IF;
  UPDATE performance_disturbances SET excluded = COALESCE(p_excluded, false), exclusion_reason = v_reason, excluded_by = auth.uid(), excluded_at = now()
   WHERE id = d.id;
END;
$fn$;

-- Lectura manual de una variable «manual»: miembro no-client, mientras el intento está en curso; un valor por minuto.
CREATE OR REPLACE FUNCTION public.add_performance_manual_reading(p_run_id uuid, p_variable_id uuid, p_at timestamptz, p_value double precision)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; v performance_variables%ROWTYPE; v_role text; v_bucket timestamptz;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('stabilizing', 'formal') THEN RAISE EXCEPTION 'Las lecturas manuales se cargan con la prueba en curso' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v FROM performance_variables WHERE id = p_variable_id AND revision_id = r.revision_id;
  IF v.id IS NULL OR v.source <> 'manual' THEN RAISE EXCEPTION 'La variable no es de captura manual en este intento' USING ERRCODE = '22023'; END IF;
  IF p_value IS NULL OR p_value = 'NaN'::double precision OR p_value IN ('Infinity'::double precision, '-Infinity'::double precision) THEN
    RAISE EXCEPTION 'Valor no válido' USING ERRCODE = '22023';
  END IF;
  IF p_at IS NULL OR p_at < r.stabilization_started_at OR p_at > now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'La hora de la lectura está fuera de la ventana del intento' USING ERRCODE = '22023';
  END IF;
  v_bucket := date_trunc('minute', p_at);
  IF EXISTS (SELECT 1 FROM performance_run_data WHERE run_id = r.id AND variable_id = v.id AND bucket = v_bucket) THEN
    RAISE EXCEPTION 'Ya hay una lectura de % en ese minuto', v.key USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO performance_run_data (run_id, variable_id, project_id, bucket, avg_val, min_val, max_val, n_good, n_bad, source, entered_by)
  VALUES (r.id, v.id, r.project_id, v_bucket, p_value, p_value, p_value, 1, 0, 'manual', auth.uid());
END;
$fn$;

-- Borrar una lectura manual: su autor o un líder+, con la prueba en curso.
CREATE OR REPLACE FUNCTION public.delete_performance_manual_reading(p_run_id uuid, p_variable_id uuid, p_bucket timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; d performance_run_data%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  SELECT * INTO d FROM performance_run_data WHERE run_id = p_run_id AND variable_id = p_variable_id AND bucket = p_bucket AND source = 'manual' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lectura no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT (d.entered_by = auth.uid() OR public.performance_is_lead(v_role)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('stabilizing', 'formal') THEN RAISE EXCEPTION 'Solo se corrigen lecturas con la prueba en curso' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM performance_run_data WHERE run_id = p_run_id AND variable_id = p_variable_id AND bucket = p_bucket;
END;
$fn$;

-- ── 6. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.performance_section_keys()                                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.performance_is_lead(text)                                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.performance_check_at(timestamptz, timestamptz)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.performance_revision_hash(uuid)                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.performance_write_content(performance_test_revisions, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.performance_freeze_run(uuid)                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_performance_test(uuid, text, uuid)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_performance_test(uuid, text, uuid)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_performance_revision(uuid, jsonb, text)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_performance_revision(uuid, text, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.new_performance_revision(uuid, text)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_performance_test_draft(uuid)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_performance_run(uuid)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_performance_run(uuid, text, timestamptz, text)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.abort_performance_run(uuid, text)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_performance_run(uuid, timestamptz, text)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refreeze_performance_run(uuid)                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_performance_disturbance(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_performance_disturbance(uuid, timestamptz)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_performance_disturbance_exclusion(uuid, boolean, text)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_performance_manual_reading(uuid, uuid, timestamptz, double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_performance_manual_reading(uuid, uuid, timestamptz)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.performance_section_keys()                                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_performance_test(uuid, text, uuid)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_performance_test(uuid, text, uuid)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_performance_revision(uuid, jsonb, text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_performance_revision(uuid, text, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.new_performance_revision(uuid, text)                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_performance_test_draft(uuid)                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_performance_run(uuid)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_performance_run(uuid, text, timestamptz, text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.abort_performance_run(uuid, text)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_performance_run(uuid, timestamptz, text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refreeze_performance_run(uuid)                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_performance_disturbance(uuid, text, text, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_performance_disturbance(uuid, timestamptz)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_performance_disturbance_exclusion(uuid, boolean, text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_performance_manual_reading(uuid, uuid, timestamptz, double precision) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_performance_manual_reading(uuid, uuid, timestamptz)     TO authenticated, service_role;
