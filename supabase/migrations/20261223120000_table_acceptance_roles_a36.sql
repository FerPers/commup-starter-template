-- A36 código (ola 1, diagnóstico ITR H1/H3): qué columnas de una tabla deciden la aceptación.
--
-- Una selección de tabla era siempre descriptiva: en I30C «Ejecutó la acción = No» con «Resultado = Conforme» dejaba
-- la tabla completa y sin rechazo. Ahora (TS `src/lib/itr/table.ts` = SQL, prueba de paridad en tests/db):
--   - `outcomes` en una columna select asigna pass / fail / not_applicable a sus opciones, como `option_outcomes`
--     en los ítems: `fail` rechaza la fila; `not_applicable` exige justificación en una columna de texto. El texto
--     de la opción nunca decide por sí solo;
--   - `decides: true` marca LA columna de resultado de la fila: siempre obligatoria, una por tabla;
--   - un resultado automático sin desviación calculable deja la tabla incompleta (antes quedaba vacío y pasaba).
-- Las plantillas existentes no cambian de comportamiento hasta adoptar `outcomes` / `decides` (homologación A41).
-- Funciones canónicas nuevas: supabase/functions-sql/itr_table_config_valid.sql y evaluate_itr_table.sql.

CREATE OR REPLACE FUNCTION public.itr_table_config_valid(p_options jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  col jsonb; keys text[] := '{}'; k text; t text; n integer; rows jsonb; v integer; f jsonb; src jsonb; st jsonb;
  num_keys text[] := '{}'; ref text; has_ref boolean := false; refs_allowed text[]; decides_n integer := 0;
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
    IF t IS NULL OR t NOT IN ('text','number','select','result','computed','datetime','reference') THEN RETURN false; END IF;
    IF t IN ('computed','datetime','reference') AND v <> 2 THEN RETURN false; END IF;
    IF col ? 'unit' AND jsonb_typeof(col->'unit') NOT IN ('string','null') THEN RETURN false; END IF;
    IF col ? 'required' AND jsonb_typeof(col->'required') <> 'boolean' THEN RETURN false; END IF;
    IF t = 'select' THEN
      IF jsonb_typeof(col->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(col->'options') < 1 THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(col->'options') o WHERE jsonb_typeof(o) <> 'string' OR NOT (o #>> '{}') ~ '[^[:space:]]') THEN RETURN false; END IF;
      IF (SELECT count(DISTINCT o #>> '{}') FROM jsonb_array_elements(col->'options') o) <> jsonb_array_length(col->'options') THEN RETURN false; END IF;
    END IF;
    -- A36: una selección puede asignar a sus opciones pass / fail / not_applicable (= option_outcomes de los ítems).
    IF col ? 'outcomes' AND jsonb_typeof(col->'outcomes') <> 'null' THEN
      IF t <> 'select' OR jsonb_typeof(col->'outcomes') <> 'object' THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each(col->'outcomes') e
                 WHERE NOT (col->'options' ? e.key) OR jsonb_typeof(e.value) <> 'string'
                    OR (e.value #>> '{}') NOT IN ('pass','fail','not_applicable')) THEN RETURN false; END IF;
    END IF;
    -- A36: la columna de resultado que decide la aceptación (una por tabla).
    IF col ? 'decides' AND jsonb_typeof(col->'decides') <> 'null' AND col->'decides' <> 'false'::jsonb THEN
      IF col->'decides' <> 'true'::jsonb OR t <> 'result' THEN RETURN false; END IF;
      decides_n := decides_n + 1;
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
    IF t = 'reference' THEN
      IF jsonb_typeof(col->'ref') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      has_ref := true;
    END IF;
  END LOOP;
  IF decides_n > 1 THEN RETURN false; END IF;
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
  ELSIF rows->>'mode' = 'source' THEN
    IF v <> 2 OR (rows->>'source') IS NULL OR (rows->>'source') NOT IN ('loop_signals','ce_effects')
       OR jsonb_typeof(rows->'label') IS DISTINCT FROM 'string' OR NOT (rows->>'label') ~ '[^[:space:]]' THEN RETURN false; END IF;
    refs_allowed := CASE rows->>'source'
      WHEN 'loop_signals' THEN ARRAY['signal_tag','signal_type','instrument','service','range','alarms','junction_box','marshalling','io_card','io_channel','dcs_tag','hmi_display']
      ELSE ARRAY['effect_code','effect_description','effect_tag','action','link'] END;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_options->'columns') c
               WHERE c->>'type' = 'reference' AND NOT (c->>'ref') = ANY(refs_allowed)) THEN RETURN false; END IF;
  ELSE
    RETURN false;
  END IF;
  IF has_ref AND rows->>'mode' <> 'source' THEN RETURN false; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.evaluate_itr_table(p_options jsonb, p_value text, p_source_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
  ELSIF rows_spec->>'mode' = 'source' THEN
    -- Filas = foto tomada al generar el ITR (itrs.source_rows): misma cantidad, sin más ni menos.
    IF p_source_count IS NULL OR p_source_count < 1 OR n <> p_source_count THEN RETURN invalid; END IF;
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
      -- A36: la columna que decide la aceptación es obligatoria siempre.
      reqd := COALESCE((col->>'required')::boolean, true) OR col->'decides' = 'true'::jsonb;
      cell := cells->(col->>'key');
      IF ctype = 'reference' THEN
        -- Dato de la foto (señal, cadena, efecto): se muestra desde itrs.source_rows, no se captura.
        IF cell IS NOT NULL AND jsonb_typeof(cell) NOT IN ('string','null') THEN RETURN invalid; END IF;
      ELSIF ctype = 'computed' THEN
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
        ELSIF NOT (col->'options' ? (cell #>> '{}')) THEN RETURN invalid;
        -- A36: la opción elegida decide si la selección tiene resultado (fail rechaza; N/A exige justificación).
        ELSIF col->'outcomes'->>(cell #>> '{}') = 'fail' THEN failed := true;
        ELSIF col->'outcomes'->>(cell #>> '{}') = 'not_applicable' THEN na := true; END IF;
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
    -- El resultado automático equivale a su desviación (ya contada): no exige captura. A36: sin desviación
    -- calculable no hay resultado, y la tabla no queda completa.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_options->'columns') c
               WHERE c->>'type' = 'result' AND jsonb_typeof(c->'auto_from') = 'string' AND NOT nums ? (c->>'auto_from')) THEN
      complete := false;
    END IF;
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
END $function$;

