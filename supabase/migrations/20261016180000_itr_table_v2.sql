-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4 · bloque C (plan readiness, decisiones §10.13–10.16): tabla de registro v2.
-- Espejo de src/lib/itr/table.ts (checkTableConfig / evaluateTable). Compatible con la v1.
--
-- options v2 añade:
--   · columna {type:'computed', formula:{observed, reference, mode:'abs'|'pct_span'|'pct_reading', span},
--     tolerance: number|null, pass: 'as_found'|'as_left'|null} — desviación observado − referencia;
--   · columna {type:'result', auto_from:<computed>} — ✓/✗ automático (la fuente debe tener tolerancia y
--     no ser 'as_found');
--   · columna {type:'datetime'} — 'YYYY-MM-DDTHH:MM';
--   · {stability:{column, last_n, min, max}} — solo filas variables: las últimas N lecturas registradas
--     deben quedar dentro de [min, max].
-- Reglas: lo calculado se recalcula aquí (lo que envíe el cliente se ignora); fuera de tolerancia en
-- 'as_found' solo se cuenta (as_found_out), en 'as_left' o sin pasada rechaza (has_fail).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.itr_table_config_valid(p_options jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  col jsonb; keys text[] := '{}'; k text; t text; n integer; rows jsonb; v integer; f jsonb; src jsonb; st jsonb;
  num_keys text[] := '{}'; ref text;
BEGIN
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'object' OR jsonb_typeof(p_options->'version') IS DISTINCT FROM 'number'
     OR (p_options->>'version') NOT IN ('1', '2') THEN RETURN false; END IF;
  v := (p_options->>'version')::integer;
  IF jsonb_typeof(p_options->'columns') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(p_options->'columns');
  IF n < 1 OR n > 16 THEN RETURN false; END IF;
  FOR col IN SELECT value FROM jsonb_array_elements(p_options->'columns') LOOP
    IF jsonb_typeof(col) <> 'object' THEN RETURN false; END IF;
    k := col->>'key'; t := col->>'type';
    IF k IS NULL OR k !~ '^[a-z][a-z0-9_]{0,31}$' OR k = ANY(keys) THEN RETURN false; END IF;
    keys := array_append(keys, k);
    IF jsonb_typeof(col->'label') IS DISTINCT FROM 'string' OR NOT (col->>'label') ~ '[^[:space:]]' THEN RETURN false; END IF;
    IF t IS NULL OR t NOT IN ('text','number','select','result','computed','datetime') THEN RETURN false; END IF;
    IF t IN ('computed','datetime') AND v <> 2 THEN RETURN false; END IF;
    IF col ? 'unit' AND jsonb_typeof(col->'unit') NOT IN ('string','null') THEN RETURN false; END IF;
    IF col ? 'required' AND jsonb_typeof(col->'required') <> 'boolean' THEN RETURN false; END IF;
    IF t = 'select' THEN
      IF jsonb_typeof(col->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(col->'options') < 1 THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(col->'options') o WHERE jsonb_typeof(o) <> 'string' OR NOT (o #>> '{}') ~ '[^[:space:]]') THEN RETURN false; END IF;
      IF (SELECT count(DISTINCT o #>> '{}') FROM jsonb_array_elements(col->'options') o) <> jsonb_array_length(col->'options') THEN RETURN false; END IF;
    END IF;
    IF t = 'number' THEN
      num_keys := array_append(num_keys, k);
      IF col ? 'min' AND jsonb_typeof(col->'min') NOT IN ('number','null') THEN RETURN false; END IF;
      IF col ? 'max' AND jsonb_typeof(col->'max') NOT IN ('number','null') THEN RETURN false; END IF;
      IF jsonb_typeof(col->'min') = 'number' AND jsonb_typeof(col->'max') = 'number'
         AND (col->>'min')::numeric > (col->>'max')::numeric THEN RETURN false; END IF;
    END IF;
    IF t = 'computed' THEN
      f := col->'formula';
      IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR jsonb_typeof(f->'observed') IS DISTINCT FROM 'string'
         OR jsonb_typeof(f->'reference') IS DISTINCT FROM 'string' OR (f->>'mode') IS NULL
         OR (f->>'mode') NOT IN ('abs','pct_span','pct_reading') THEN RETURN false; END IF;
      IF f->>'mode' = 'pct_span' AND (jsonb_typeof(f->'span') IS DISTINCT FROM 'number' OR (f->>'span')::numeric <= 0) THEN RETURN false; END IF;
      IF col ? 'tolerance' AND jsonb_typeof(col->'tolerance') NOT IN ('number','null') THEN RETURN false; END IF;
      IF jsonb_typeof(col->'tolerance') = 'number' AND (col->>'tolerance')::numeric < 0 THEN RETURN false; END IF;
      IF col ? 'pass' AND jsonb_typeof(col->'pass') <> 'null' AND (col->>'pass') NOT IN ('as_found','as_left') THEN RETURN false; END IF;
      IF f->>'observed' = f->>'reference' THEN RETURN false; END IF;
    END IF;
    IF t = 'result' AND col ? 'auto_from' AND jsonb_typeof(col->'auto_from') <> 'null' THEN
      IF v <> 2 OR jsonb_typeof(col->'auto_from') <> 'string' THEN RETURN false; END IF;
    END IF;
  END LOOP;
  -- Referencias entre columnas.
  FOR col IN SELECT value FROM jsonb_array_elements(p_options->'columns') LOOP
    IF col->>'type' = 'computed' THEN
      FOREACH ref IN ARRAY ARRAY[col->'formula'->>'observed', col->'formula'->>'reference'] LOOP
        IF NOT ref = ANY(num_keys) THEN RETURN false; END IF;
      END LOOP;
    END IF;
    IF col->>'type' = 'result' AND jsonb_typeof(col->'auto_from') = 'string' THEN
      SELECT c INTO src FROM jsonb_array_elements(p_options->'columns') c WHERE c->>'key' = col->>'auto_from';
      IF src IS NULL OR src->>'type' <> 'computed' OR jsonb_typeof(src->'tolerance') IS DISTINCT FROM 'number'
         OR COALESCE(src->>'pass', '') = 'as_found' THEN RETURN false; END IF;
    END IF;
  END LOOP;
  rows := p_options->'rows';
  IF jsonb_typeof(rows) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF rows->>'mode' = 'fixed' THEN
    IF jsonb_typeof(rows->'labels') IS DISTINCT FROM 'array' OR jsonb_array_length(rows->'labels') < 1 OR jsonb_array_length(rows->'labels') > 200 THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(rows->'labels') l WHERE jsonb_typeof(l) <> 'string' OR NOT (l #>> '{}') ~ '[^[:space:]]') THEN RETURN false; END IF;
  ELSIF rows->>'mode' = 'variable' THEN
    IF jsonb_typeof(rows->'min') IS DISTINCT FROM 'number' OR jsonb_typeof(rows->'max') IS DISTINCT FROM 'number'
       OR jsonb_typeof(rows->'label') IS DISTINCT FROM 'string' OR NOT (rows->>'label') ~ '[^[:space:]]' THEN RETURN false; END IF;
    IF trunc((rows->>'min')::numeric) <> (rows->>'min')::numeric OR trunc((rows->>'max')::numeric) <> (rows->>'max')::numeric THEN RETURN false; END IF;
    IF (rows->>'min')::numeric < 1 OR (rows->>'max')::numeric > 500 OR (rows->>'min')::numeric > (rows->>'max')::numeric THEN RETURN false; END IF;
  ELSE
    RETURN false;
  END IF;
  -- Estabilidad de la serie.
  IF p_options ? 'stability' AND jsonb_typeof(p_options->'stability') <> 'null' THEN
    st := p_options->'stability';
    IF v <> 2 OR jsonb_typeof(st) <> 'object' OR rows->>'mode' <> 'variable' THEN RETURN false; END IF;
    IF jsonb_typeof(st->'column') IS DISTINCT FROM 'string' OR jsonb_typeof(st->'last_n') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    IF trunc((st->>'last_n')::numeric) <> (st->>'last_n')::numeric OR (st->>'last_n')::numeric < 1 OR (st->>'last_n')::numeric > 500 THEN RETURN false; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_options->'columns') c WHERE c->>'key' = st->>'column' AND c->>'type' IN ('number','computed')) THEN RETURN false; END IF;
    IF (st ? 'min' AND jsonb_typeof(st->'min') NOT IN ('number','null')) OR (st ? 'max' AND jsonb_typeof(st->'max') NOT IN ('number','null')) THEN RETURN false; END IF;
    IF jsonb_typeof(st->'min') IS DISTINCT FROM 'number' AND jsonb_typeof(st->'max') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    IF jsonb_typeof(st->'min') = 'number' AND jsonb_typeof(st->'max') = 'number' AND (st->>'min')::numeric > (st->>'max')::numeric THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;

-- Desviación observado − referencia según el modo (NULL si falta un dato o no se puede calcular).
CREATE OR REPLACE FUNCTION public.itr_table_deviation(p_formula jsonb, p_observed numeric, p_reference numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_observed IS NULL OR p_reference IS NULL THEN NULL
    WHEN p_formula->>'mode' = 'abs' THEN p_observed - p_reference
    WHEN p_formula->>'mode' = 'pct_span' THEN (p_observed - p_reference) / NULLIF((p_formula->>'span')::numeric, 0) * 100
    WHEN p_formula->>'mode' = 'pct_reading' THEN CASE WHEN p_reference = 0 THEN NULL ELSE (p_observed - p_reference) / abs(p_reference) * 100 END
  END
$$;

CREATE OR REPLACE FUNCTION public.evaluate_itr_table(p_options jsonb, p_value text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  d jsonb; rows_spec jsonb; n integer; i integer := 0; row_data jsonb; col jsonb; cells jsonb; cell jsonb;
  ctype text; ck text; reqd boolean; has_text boolean; na boolean;
  complete boolean := true; failed boolean := false; as_found_out integer := 0;
  nums jsonb; dev numeric; tol numeric;
  st jsonb := NULL; series numeric[] := '{}'; sv numeric; last_vals numeric[]; nreq integer;
  invalid CONSTANT jsonb := '{"is_complete":false,"has_fail":false,"as_found_out":0}'::jsonb;
BEGIN
  IF NOT public.itr_table_config_valid(p_options) THEN RETURN invalid; END IF;
  IF p_value IS NULL OR NOT p_value ~ '[^[:space:]]' THEN RETURN invalid; END IF;
  BEGIN d := p_value::jsonb; EXCEPTION WHEN OTHERS THEN RETURN invalid; END;
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR d->'version' IS DISTINCT FROM '1'::jsonb
     OR jsonb_typeof(d->'count') IS DISTINCT FROM 'number' OR jsonb_typeof(d->'rows') IS DISTINCT FROM 'array' THEN RETURN invalid; END IF;
  IF trunc((d->>'count')::numeric) <> (d->>'count')::numeric THEN RETURN invalid; END IF;
  n := (d->>'count')::numeric::integer;
  rows_spec := p_options->'rows';
  IF rows_spec->>'mode' = 'fixed' THEN
    IF n <> jsonb_array_length(rows_spec->'labels') THEN RETURN invalid; END IF;
  ELSE
    IF n < (rows_spec->>'min')::numeric OR n > (rows_spec->>'max')::numeric THEN RETURN invalid; END IF;
  END IF;
  IF jsonb_array_length(d->'rows') <> n THEN RETURN invalid; END IF;
  IF p_options ? 'stability' AND jsonb_typeof(p_options->'stability') = 'object' THEN st := p_options->'stability'; END IF;

  FOR row_data IN SELECT value FROM jsonb_array_elements(d->'rows') LOOP
    i := i + 1;
    IF jsonb_typeof(row_data) IS DISTINCT FROM 'object' OR (row_data->>'id') IS DISTINCT FROM ('R' || i) THEN RETURN invalid; END IF;
    cells := row_data->'cells';
    IF jsonb_typeof(cells) IS DISTINCT FROM 'object' THEN RETURN invalid; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(cells) AS ck2
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_options->'columns') c WHERE c->>'key' = ck2)
    ) THEN RETURN invalid; END IF;
    has_text := false; na := false; nums := '{}'::jsonb;
    -- 1) Columnas capturadas.
    FOR col IN SELECT value FROM jsonb_array_elements(p_options->'columns') LOOP
      ctype := col->>'type';
      reqd := COALESCE((col->>'required')::boolean, true);
      cell := cells->(col->>'key');
      IF ctype = 'computed' THEN
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('number','null') THEN RETURN invalid; END IF;
      ELSIF ctype = 'result' AND jsonb_typeof(col->'auto_from') = 'string' THEN
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('string','null') THEN RETURN invalid; END IF;
      ELSIF ctype = 'text' THEN
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('string','null') THEN RETURN invalid; END IF;
        IF cell IS NOT NULL AND jsonb_typeof(cell) = 'string' AND (cell #>> '{}') ~ '[^[:space:]]' THEN has_text := true;
        ELSIF reqd THEN complete := false; END IF;
      ELSIF ctype = 'datetime' THEN
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('string','null') THEN RETURN invalid; END IF;
        IF cell IS NULL OR jsonb_typeof(cell) = 'null' OR (cell #>> '{}') = '' THEN
          IF reqd THEN complete := false; END IF;
        ELSIF NOT (cell #>> '{}') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RETURN invalid; END IF;
      ELSIF ctype = 'number' THEN
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('number','null') THEN RETURN invalid; END IF;
        IF cell IS NULL OR jsonb_typeof(cell) = 'null' THEN
          IF reqd THEN complete := false; END IF;
        ELSE
          nums := nums || jsonb_build_object(col->>'key', cell);
          IF jsonb_typeof(col->'min') = 'number' AND (cell #>> '{}')::numeric < (col->>'min')::numeric THEN failed := true; END IF;
          IF jsonb_typeof(col->'max') = 'number' AND (cell #>> '{}')::numeric > (col->>'max')::numeric THEN failed := true; END IF;
        END IF;
      ELSIF ctype = 'select' THEN
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('string','null') THEN RETURN invalid; END IF;
        IF cell IS NULL OR jsonb_typeof(cell) = 'null' OR (cell #>> '{}') = '' THEN
          IF reqd THEN complete := false; END IF;
        ELSIF NOT (col->'options' ? (cell #>> '{}')) THEN RETURN invalid; END IF;
      ELSE
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('string','null') THEN RETURN invalid; END IF;
        ck := COALESCE(cell #>> '{}', '');
        IF ck = '' THEN
          IF reqd THEN complete := false; END IF;
        ELSIF ck NOT IN ('pass','fail','not_applicable') THEN RETURN invalid;
        ELSIF ck = 'fail' THEN failed := true;
        ELSIF ck = 'not_applicable' THEN na := true; END IF;
      END IF;
    END LOOP;
    -- 2) Desviaciones calculadas aquí; fuera de tolerancia: as found solo cuenta, el resto rechaza.
    FOR col IN SELECT value FROM jsonb_array_elements(p_options->'columns') WHERE value->>'type' = 'computed' LOOP
      dev := public.itr_table_deviation(col->'formula', (nums->>(col->'formula'->>'observed'))::numeric, (nums->>(col->'formula'->>'reference'))::numeric);
      IF dev IS NOT NULL THEN
        nums := nums || jsonb_build_object(col->>'key', dev);
        IF jsonb_typeof(col->'tolerance') = 'number' THEN
          tol := (col->>'tolerance')::numeric;
          IF abs(dev) > tol THEN
            IF COALESCE(col->>'pass', '') = 'as_found' THEN as_found_out := as_found_out + 1; ELSE failed := true; END IF;
          END IF;
        END IF;
      END IF;
    END LOOP;
    -- El resultado automático equivale a su desviación (ya contada): no exige captura.
    IF st IS NOT NULL THEN
      sv := (nums->>(st->>'column'))::numeric;
      IF sv IS NOT NULL THEN series := array_append(series, sv); END IF;
    END IF;
    IF na AND NOT has_text THEN complete := false; END IF;
  END LOOP;

  -- 3) Estabilidad: las últimas N lecturas registradas dentro de [min, max].
  IF st IS NOT NULL THEN
    nreq := (st->>'last_n')::integer;
    IF COALESCE(array_length(series, 1), 0) < nreq THEN
      complete := false;
    ELSE
      last_vals := series[array_length(series, 1) - nreq + 1 : array_length(series, 1)];
      IF EXISTS (
        SELECT 1 FROM unnest(last_vals) x
        WHERE (jsonb_typeof(st->'min') = 'number' AND x < (st->>'min')::numeric)
           OR (jsonb_typeof(st->'max') = 'number' AND x > (st->>'max')::numeric)
      ) THEN failed := true; END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('is_complete', complete, 'has_fail', failed, 'as_found_out', as_found_out);
END $$;
REVOKE ALL ON FUNCTION public.evaluate_itr_table(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_itr_table(jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.itr_table_deviation(jsonb, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.itr_table_deviation(jsonb, numeric, numeric) TO authenticated, service_role;
