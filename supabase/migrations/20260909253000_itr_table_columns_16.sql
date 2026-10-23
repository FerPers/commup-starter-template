-- Recuperada de prod (2026-10-22): se aplicó como versión 20260910013638 «itr_table_columns_16» (supabase_migrations.schema_migrations)
-- sin archivo en el repo. Texto tal cual del registro; va en el lugar que tuvo en prod, entre
-- 20260909251000_itr_table_capture y 20260910120000_equipment_type_templates_select_catalog.

-- Run logs (bombas, motores) traen hasta 11 parámetros + resultado + observación: límite 16 columnas.
CREATE OR REPLACE FUNCTION public.itr_table_config_valid(p_options jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE col jsonb; keys text[] := '{}'; k text; t text; n integer; rows jsonb;
BEGIN
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'object' OR p_options->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  IF jsonb_typeof(p_options->'columns') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(p_options->'columns');
  IF n < 1 OR n > 16 THEN RETURN false; END IF;
  FOR col IN SELECT value FROM jsonb_array_elements(p_options->'columns') LOOP
    IF jsonb_typeof(col) <> 'object' THEN RETURN false; END IF;
    k := col->>'key'; t := col->>'type';
    IF k IS NULL OR k !~ '^[a-z][a-z0-9_]{0,31}$' OR k = ANY(keys) THEN RETURN false; END IF;
    keys := array_append(keys, k);
    IF jsonb_typeof(col->'label') IS DISTINCT FROM 'string' OR NOT (col->>'label') ~ '[^[:space:]]' THEN RETURN false; END IF;
    IF t IS NULL OR t NOT IN ('text','number','select','result') THEN RETURN false; END IF;
    IF col ? 'unit' AND jsonb_typeof(col->'unit') NOT IN ('string','null') THEN RETURN false; END IF;
    IF col ? 'required' AND jsonb_typeof(col->'required') <> 'boolean' THEN RETURN false; END IF;
    IF t = 'select' THEN
      IF jsonb_typeof(col->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(col->'options') < 1 THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(col->'options') o WHERE jsonb_typeof(o) <> 'string' OR NOT (o #>> '{}') ~ '[^[:space:]]') THEN RETURN false; END IF;
      IF (SELECT count(DISTINCT o #>> '{}') FROM jsonb_array_elements(col->'options') o) <> jsonb_array_length(col->'options') THEN RETURN false; END IF;
    END IF;
    IF t = 'number' THEN
      IF col ? 'min' AND jsonb_typeof(col->'min') NOT IN ('number','null') THEN RETURN false; END IF;
      IF col ? 'max' AND jsonb_typeof(col->'max') NOT IN ('number','null') THEN RETURN false; END IF;
      IF jsonb_typeof(col->'min') = 'number' AND jsonb_typeof(col->'max') = 'number'
         AND (col->>'min')::numeric > (col->>'max')::numeric THEN RETURN false; END IF;
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
  RETURN true;
END $$;
