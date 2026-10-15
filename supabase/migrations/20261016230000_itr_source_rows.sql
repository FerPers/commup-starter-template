-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4 · bloque D, sesión 2 (plan readiness, decisiones §10.21–10.24): ITR de loop check y de
-- prueba por causa C&E generados con su tabla armada automáticamente.
--
-- 1. Tabla v2: filas `source` (loop_signals | ce_effects) y columnas `reference` (dato de la foto,
--    no capturable). evaluate_itr_table recibe la cantidad de filas de la foto.
-- 2. itrs.source_rows: foto [{key, label, refs}] tomada al crear el ITR desde loop_id / ce_cause_id.
--    La calcula el trigger (lo que mande el cliente se ignora) y luego es inmutable: si el lazo o la
--    matriz cambian, la pantalla avisa «desactualizado» y se genera una nueva revisión (R2).
-- 3. Una plantilla con tabla `source` solo se usa para ITRs del origen que corresponde.
-- ═══════════════════════════════════════════════════════════════════════════

-- Columna primero: evaluate_itr_capture (más abajo) la lee y se valida al recrearse.
ALTER TABLE public.itrs ADD COLUMN source_rows jsonb;

-- ── 1. Tabla v2: validador y evaluador ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.itr_table_config_valid(p_options jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  col jsonb; keys text[] := '{}'; k text; t text; n integer; rows jsonb; v integer; f jsonb; src jsonb; st jsonb;
  num_keys text[] := '{}'; ref text; has_ref boolean := false; refs_allowed text[];
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
END $$;

CREATE OR REPLACE FUNCTION public.evaluate_itr_table(p_options jsonb, p_value text, p_source_count integer)
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
      reqd := COALESCE((col->>'required')::boolean, true);
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

REVOKE ALL ON FUNCTION public.evaluate_itr_table(jsonb, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_itr_table(jsonb, text, integer) TO authenticated, service_role;

-- Firma anterior (sin foto): sigue sirviendo a las tablas fijas y variables.
CREATE OR REPLACE FUNCTION public.evaluate_itr_table(p_options jsonb, p_value text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.evaluate_itr_table(p_options, p_value, NULL::integer)
$$;
REVOKE ALL ON FUNCTION public.evaluate_itr_table(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_itr_table(jsonb, text) TO authenticated, service_role;

-- evaluate_itr_capture pasa la cantidad de filas de la foto del ITR (única línea que cambia).
DO $do$
DECLARE def text; old text := 'public.evaluate_itr_table(i.options, r.value_text)';
BEGIN
  def := pg_get_functiondef('public.evaluate_itr_capture(uuid)'::regprocedure);
  IF (length(def) - length(replace(def, old, ''))) / length(old) <> 1 THEN
    RAISE EXCEPTION 'evaluate_itr_capture no tiene la llamada esperada a evaluate_itr_table';
  END IF;
  EXECUTE replace(def, old, 'public.evaluate_itr_table(i.options, r.value_text, pg_catalog.jsonb_array_length(itr.source_rows))');
END $do$;

-- ── 2. Foto de filas del ITR ────────────────────────────────────────────────

-- Señales activas del lazo con su cadena del loop check.
CREATE OR REPLACE FUNCTION public.itr_loop_source_rows(p_loop_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'key', s.id, 'label', s.signal_tag,
    'refs', pg_catalog.jsonb_build_object(
      'signal_tag', s.signal_tag, 'signal_type', s.signal_type::text, 'instrument', t.tag_number, 'service', s.service,
      'range', CASE WHEN s.range_min IS NOT NULL OR s.range_max IS NOT NULL THEN pg_catalog.concat_ws(' ',
        COALESCE(pg_catalog.trim_scale(s.range_min)::text, '?') || ' – ' || COALESCE(pg_catalog.trim_scale(s.range_max)::text, '?'), s.eng_unit) END,
      'alarms', s.alarm_setpoints, 'junction_box', s.junction_box, 'marshalling', s.marshalling,
      'io_card', s.io_card, 'io_channel', s.io_channel, 'dcs_tag', s.dcs_tag, 'hmi_display', s.hmi_display)
  ) ORDER BY s.signal_tag, s.id), '[]'::jsonb)
  FROM public.signals s JOIN public.tags t ON t.id = s.tag_id
  WHERE s.loop_id = p_loop_id AND s.active
$$;

-- Efectos que dispara la causa (cruces de la matriz), con la acción y el retardo esperados.
CREATE OR REPLACE FUNCTION public.itr_cause_source_rows(p_cause_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'key', e.id, 'label', e.code || COALESCE(' · ' || t.tag_number, ''),
    'refs', pg_catalog.jsonb_build_object(
      'effect_code', e.code, 'effect_description', e.description, 'effect_tag', t.tag_number, 'action', e.action,
      'link', CASE l.link_type WHEN 'delayed' THEN 'T' || pg_catalog.trim_scale(l.delay_s)::text || 's' ELSE 'X' END)
  ) ORDER BY e.seq, e.code), '[]'::jsonb)
  FROM public.ce_links l JOIN public.ce_effects e ON e.id = l.effect_id LEFT JOIN public.tags t ON t.id = e.tag_id
  WHERE l.cause_id = p_cause_id
$$;
REVOKE ALL ON FUNCTION public.itr_loop_source_rows(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.itr_cause_source_rows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.itr_loop_source_rows(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.itr_cause_source_rows(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.itr_source_rows_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_project uuid; v_sources text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.loop_id IS NOT NULL AND NEW.ce_cause_id IS NOT NULL THEN
      RAISE EXCEPTION 'Un ITR se genera desde un lazo o desde una causa, no desde ambos';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT i.options->'rows'->>'source'), '{}') INTO v_sources
    FROM public.itr_template_items i
    WHERE i.template_id = NEW.template_id AND i.item_type::text = 'table' AND i.options->'rows'->>'mode' = 'source';
    IF cardinality(v_sources) > 1 THEN RAISE EXCEPTION 'La plantilla mezcla tablas de lazo y de matriz C&E'; END IF;
    IF NEW.loop_id IS NOT NULL THEN
      IF v_sources <> ARRAY['loop_signals'] THEN RAISE EXCEPTION 'La plantilla no tiene tabla de señales del lazo'; END IF;
      SELECT project_id INTO v_project FROM public.loops WHERE id = NEW.loop_id;
      IF v_project IS DISTINCT FROM NEW.project_id THEN RAISE EXCEPTION 'El lazo no pertenece al proyecto'; END IF;
      NEW.source_rows := public.itr_loop_source_rows(NEW.loop_id);
      IF pg_catalog.jsonb_array_length(NEW.source_rows) = 0 THEN RAISE EXCEPTION 'El lazo no tiene señales activas'; END IF;
    ELSIF NEW.ce_cause_id IS NOT NULL THEN
      IF v_sources <> ARRAY['ce_effects'] THEN RAISE EXCEPTION 'La plantilla no tiene tabla de efectos de la matriz C&E'; END IF;
      SELECT project_id INTO v_project FROM public.ce_causes WHERE id = NEW.ce_cause_id;
      IF v_project IS DISTINCT FROM NEW.project_id THEN RAISE EXCEPTION 'La causa no pertenece al proyecto'; END IF;
      NEW.source_rows := public.itr_cause_source_rows(NEW.ce_cause_id);
      IF pg_catalog.jsonb_array_length(NEW.source_rows) = 0 THEN RAISE EXCEPTION 'La causa no tiene efectos marcados en la matriz'; END IF;
    ELSE
      IF cardinality(v_sources) > 0 THEN RAISE EXCEPTION 'Esta plantilla se genera desde un lazo o desde una causa de la matriz C&E'; END IF;
      NEW.source_rows := NULL;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: la foto no cambia; el vínculo solo puede caer a NULL (ON DELETE SET NULL del lazo o la causa).
  IF NEW.source_rows IS DISTINCT FROM OLD.source_rows THEN RAISE EXCEPTION 'La foto de filas del ITR es inmutable'; END IF;
  IF NEW.loop_id IS DISTINCT FROM OLD.loop_id AND NEW.loop_id IS NOT NULL THEN RAISE EXCEPTION 'El lazo del ITR no cambia'; END IF;
  IF NEW.ce_cause_id IS DISTINCT FROM OLD.ce_cause_id AND NEW.ce_cause_id IS NOT NULL THEN RAISE EXCEPTION 'La causa del ITR no cambia'; END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER itrs_source_rows_guard BEFORE INSERT OR UPDATE OF source_rows, loop_id, ce_cause_id ON public.itrs
  FOR EACH ROW EXECUTE FUNCTION public.itr_source_rows_guard();
