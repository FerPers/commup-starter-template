-- fn: public.evaluate_itr_table(jsonb,text,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.evaluate_itr_table(p_options jsonb, p_value text, p_source_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  d jsonb; rows_spec jsonb; n integer; i integer := 0; row_data jsonb; col jsonb; cells jsonb; cell jsonb;
  ctype text; ck text; reqd boolean; has_text boolean; na boolean; af boolean;
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
    has_text := false; na := false; af := false; nums := '{}'::jsonb;
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
        -- A37: el resultado manual de la pasada as found registra «no conforme» como evidencia (pide observación).
        ELSIF ck = 'fail' AND col->>'pass' = 'as_found' THEN as_found_out := as_found_out + 1; af := true;
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
    IF af AND NOT has_text THEN complete := false; END IF;
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
