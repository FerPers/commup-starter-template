-- fn: public.itr_table_config_valid(jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
