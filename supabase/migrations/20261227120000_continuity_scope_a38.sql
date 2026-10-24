-- A38 (ola 2): el alcance de la continuidad lo fija un líder y queda congelado en el ITR. Decisiones 38-1…38-3 de
-- docs/FICHA-A37-A38-A39-2026-10-24.md, aprobadas por Luis el 2026-10-24.
--
-- Antes (diagnóstico ITR H6) el ejecutor declaraba agrupación, cantidad, pantallas y si la lectura era obligatoria,
-- y nada lo comparaba con D.4: un conductor sin lectura completaba un cable de doce. Ahora:
--   - itr_continuity_scopes guarda por ITR × ítem la agrupación, la cantidad y las pantallas. Solo la escribe
--     set_itr_continuity_scope: líder o superior que no es el ejecutor del ITR, antes de la primera firma; cambiarlo
--     exige motivo ≥ 10 y queda en activity_log con el alcance anterior;
--   - evaluate_itr_continuity recibe el alcance y la lectura obligatoria de la plantilla (options.measurement_required);
--     sin alcance o con una captura que no lo cubre exactamente, la continuidad no está completa (TS = SQL en
--     src/lib/itr/continuity.ts, paridad en tests/db/itr-continuity-scope.test.ts);
--   - I01A (borradores sin ITR): D.4 deja de ser un dato aparte (el alcance es la única cantidad) y la lectura no es
--     obligatoria (38-3).
-- Funciones canónicas: evaluate_itr_continuity (firma nueva), set_itr_continuity_scope, evaluate_itr_capture.

CREATE TABLE public.itr_continuity_scopes (
  itr_id        uuid NOT NULL REFERENCES public.itrs(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES public.itr_template_items(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  grouping_mode text NOT NULL CHECK (grouping_mode IN ('pairs', 'conductors')),
  quantity      integer NOT NULL CHECK (quantity BETWEEN 1 AND 500),
  shields       text[] NOT NULL DEFAULT '{}' CHECK (cardinality(shields) <= 50),
  set_by        uuid NOT NULL,
  set_at        timestamptz NOT NULL DEFAULT now(),
  reason        text,
  PRIMARY KEY (itr_id, item_id)
);
CREATE INDEX itr_continuity_scopes_project_idx ON public.itr_continuity_scopes (project_id);

ALTER TABLE public.itr_continuity_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY itr_continuity_scopes_select ON public.itr_continuity_scopes FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
REVOKE ALL ON public.itr_continuity_scopes FROM anon, authenticated;
GRANT SELECT ON public.itr_continuity_scopes TO authenticated;
GRANT ALL ON public.itr_continuity_scopes TO service_role;

CREATE OR REPLACE FUNCTION public.evaluate_itr_continuity(p_value text, p_scope jsonb, p_measurement_required boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
 d jsonb; row_data jsonb; shield jsonb; expected text[] := '{}'; seen text[] := '{}';
 n integer; j integer; row_id text; complete boolean := true; failed boolean := false;
 missing boolean := false; mismatch boolean := false;
 invalid CONSTANT jsonb := '{"is_complete":false,"has_fail":false,"scope_missing":false,"scope_mismatch":false}'::jsonb;
BEGIN
 BEGIN d := p_value::jsonb; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR untranslatable_character THEN RETURN invalid; END;
 IF jsonb_typeof(d) IS DISTINCT FROM 'object'
 OR d->'version' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(d->'grouping') IS DISTINCT FROM 'string'
 OR d->>'grouping' NOT IN ('pairs','conductors')
 OR jsonb_typeof(d->'count') IS DISTINCT FROM 'number'
 OR jsonb_typeof(d->'shields') IS DISTINCT FROM 'array'
 OR jsonb_typeof(d->'measurementRequired') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(d->'rows') IS DISTINCT FROM 'array' THEN RETURN invalid; END IF;
 IF (d->>'count')::numeric < 1 OR (d->>'count')::numeric > 500
 OR trunc((d->>'count')::numeric) <> (d->>'count')::numeric THEN RETURN invalid; END IF;
 n := (d->>'count')::numeric::integer;
 FOR j IN 1..n LOOP
   IF d->>'grouping'='pairs' THEN expected := expected || ARRAY['P'||j||'-A','P'||j||'-B'];
   ELSE expected := array_append(expected,'C'||j); END IF;
 END LOOP;
 FOR shield IN SELECT value FROM jsonb_array_elements(d->'shields') LOOP
   IF jsonb_typeof(shield) IS DISTINCT FROM 'string' OR NOT ((shield#>>'{}') ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]') THEN RETURN invalid; END IF;
   row_id := 'S:'||(shield#>>'{}');
   IF row_id=ANY(expected) THEN RETURN invalid; END IF;
   expected := array_append(expected,row_id);
 END LOOP;
 -- A38: el alcance (agrupación, cantidad, pantallas) lo fija un líder y queda en el ITR; la captura debe cubrirlo
 -- exactamente. Sin alcance la continuidad no está completa. La lectura obligatoria la fija la plantilla.
 IF p_scope IS NULL THEN missing := true;
 ELSIF d->>'grouping' IS DISTINCT FROM p_scope->>'grouping'
    OR (d->>'count')::numeric IS DISTINCT FROM (p_scope->>'count')::numeric
    OR ARRAY(SELECT x FROM jsonb_array_elements_text(d->'shields') x ORDER BY x)
       IS DISTINCT FROM ARRAY(SELECT x FROM jsonb_array_elements_text(COALESCE(p_scope->'shields','[]'::jsonb)) x ORDER BY x)
 THEN mismatch := true; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(d->'rows') LOOP
   IF jsonb_typeof(row_data) IS DISTINCT FROM 'object' OR jsonb_typeof(row_data->'id') IS DISTINCT FROM 'string' THEN RETURN invalid; END IF;
   row_id := row_data->>'id';
   IF NOT row_id=ANY(expected) OR row_id=ANY(seen) THEN RETURN invalid; END IF;
   seen := array_append(seen,row_id);
   IF jsonb_typeof(row_data->'from') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'from' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false)
   OR jsonb_typeof(row_data->'to') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'to' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false)
   OR jsonb_typeof(row_data->'result') IS DISTINCT FROM 'string'
   OR COALESCE(row_data->>'result','') NOT IN ('pass','fail','not_applicable') THEN complete := false; END IF;
   IF row_data->>'result'='fail' THEN failed := true; END IF;
   IF row_data->>'result'='not_applicable' THEN
     IF jsonb_typeof(row_data->'remarks') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'remarks' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false) THEN complete := false; END IF;
   ELSIF COALESCE(p_measurement_required,false) THEN
     IF jsonb_typeof(row_data->'reading') IS DISTINCT FROM 'number'
     OR jsonb_typeof(row_data->'unit') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'unit' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false) THEN complete := false;
     ELSE
       IF abs((row_data->>'reading')::numeric) < 1e-307 THEN NULL;
       ELSIF NOT pg_catalog.pg_input_is_valid(row_data->>'reading','double precision') THEN complete := false;
       ELSIF (row_data->>'reading')::double precision IN ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) THEN complete := false; END IF;
     END IF;
   END IF;
 END LOOP;
 RETURN jsonb_build_object('is_complete',complete AND NOT missing AND NOT mismatch AND cardinality(seen)=cardinality(expected),'has_fail',failed,'scope_missing',missing,'scope_mismatch',mismatch);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_itr_continuity_scope(p_itr_id uuid, p_item_id uuid, p_grouping text, p_count integer, p_shields text[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; v_org uuid; v_role text; prev itr_continuity_scopes; v_shields text[];
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), ''); v_status jsonb;
BEGIN
  -- A38: el alcance de la continuidad (agrupación, cantidad, pantallas) lo fija un líder o superior que no es el
  -- ejecutor del ITR, y queda congelado: cambiarlo exige motivo y queda en activity_log. Nunca después de firmar.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = v.project_id;
  SELECT m.role::text INTO v_role FROM org_members m
  WHERE m.org_id = v_org AND m.user_id = auth.uid() AND m.status = 'active' AND (m.access_expires_at IS NULL OR m.access_expires_at > now());
  IF COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM itr_assignments a WHERE a.itr_id = p_itr_id AND a.role::text = 'executor' AND a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'executor_cannot_scope' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itr_template_items i WHERE i.id = p_item_id AND i.template_id = v.template_id AND i.item_type::text = 'continuity') THEN
    RAISE EXCEPTION 'invalid_item' USING ERRCODE = '22023';
  END IF;
  IF v.status = 'approved' OR EXISTS (SELECT 1 FROM itr_signatures s WHERE s.itr_id = p_itr_id) THEN
    RAISE EXCEPTION 'itr_signed' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(x ORDER BY o), '{}') INTO v_shields
  FROM (SELECT btrim(s) AS x, o FROM unnest(COALESCE(p_shields, '{}')) WITH ORDINALITY AS u(s, o)) z WHERE x <> '';
  IF p_grouping IS NULL OR p_grouping NOT IN ('pairs', 'conductors') OR p_count IS NULL OR p_count < 1 OR p_count > 500
     OR cardinality(v_shields) > 50 OR EXISTS (SELECT 1 FROM unnest(v_shields) x WHERE length(x) > 60)
     OR (SELECT count(DISTINCT x) FROM unnest(v_shields) x) <> cardinality(v_shields) THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO prev FROM itr_continuity_scopes WHERE itr_id = p_itr_id AND item_id = p_item_id;
  IF FOUND AND prev.grouping_mode = p_grouping AND prev.quantity = p_count
     AND ARRAY(SELECT x FROM unnest(prev.shields) x ORDER BY x) = ARRAY(SELECT x FROM unnest(v_shields) x ORDER BY x) THEN
    RETURN jsonb_build_object('changed', false);
  END IF;
  IF FOUND AND length(COALESCE(v_reason, '')) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO itr_continuity_scopes (itr_id, item_id, project_id, grouping_mode, quantity, shields, set_by, set_at, reason)
  VALUES (p_itr_id, p_item_id, v.project_id, p_grouping, p_count, v_shields, auth.uid(), now(), v_reason)
  ON CONFLICT (itr_id, item_id) DO UPDATE
    SET grouping_mode = EXCLUDED.grouping_mode, quantity = EXCLUDED.quantity, shields = EXCLUDED.shields,
        set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at, reason = EXCLUDED.reason;

  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'itr', p_itr_id, CASE WHEN prev.itr_id IS NULL THEN 'continuity_scope_set' ELSE 'continuity_scope_changed' END,
    jsonb_build_object('item_id', p_item_id, 'grouping', p_grouping, 'count', p_count, 'shields', to_jsonb(v_shields), 'reason', v_reason,
      'previous', CASE WHEN prev.itr_id IS NULL THEN NULL ELSE jsonb_build_object('grouping', prev.grouping_mode, 'count', prev.quantity, 'shields', to_jsonb(prev.shields), 'set_by', prev.set_by, 'set_at', prev.set_at) END));

  v_status := public.refresh_itr_status(p_itr_id);
  RETURN jsonb_build_object('changed', true, 'status', v_status->'status', 'progress_pct', v_status->'progress_pct');
END;
$function$;

CREATE OR REPLACE FUNCTION public.evaluate_itr_capture(p_itr_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH RECURSIVE
items AS MATERIALIZED (
  SELECT i.*, r.value_text, r.value_numeric, r.value_bool, r.value_option, r.remarks,
    i.option_outcomes ->> r.value_option AS selection_outcome,
    CASE WHEN i.item_type::text='continuity' THEN public.evaluate_itr_continuity(r.value_text,
      (SELECT pg_catalog.jsonb_build_object('grouping', s.grouping_mode, 'count', s.quantity, 'shields', pg_catalog.to_jsonb(s.shields))
       FROM public.itr_continuity_scopes s WHERE s.itr_id = itr.id AND s.item_id = i.id),
      COALESCE(i.options -> 'measurement_required' = 'true'::jsonb, false)) END AS continuity,
    CASE WHEN i.item_type::text='table' THEN public.evaluate_itr_table(i.options, r.value_text, pg_catalog.jsonb_array_length(itr.source_rows)) END AS table_eval,
    CASE WHEN i.item_type::text='select' THEN CASE i.option_outcomes ->> r.value_option WHEN 'pass' THEN true WHEN 'fail' THEN false ELSE NULL END
    WHEN i.item_type::text='measurement' AND r.value_numeric IS NOT NULL
      AND (i.acceptance_min IS NOT NULL OR i.acceptance_max IS NOT NULL)
      THEN r.value_numeric::text NOT IN ('NaN','Infinity','-Infinity')
        AND (i.acceptance_min IS NULL OR r.value_numeric>=i.acceptance_min)
        AND (i.acceptance_max IS NULL OR r.value_numeric<=i.acceptance_max)
      ELSE r.is_passed END AS is_passed,
    CASE i.item_type::text
      WHEN 'checkbox' THEN r.value_bool::text
      WHEN 'yes_no' THEN r.value_bool::text
      WHEN 'number' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'measurement' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'select' THEN r.value_option
      ELSE r.value_text
    END AS condition_actual,
    COALESCE(r.value_numeric IS NOT NULL AND r.value_numeric::text NOT IN ('NaN', 'Infinity', '-Infinity'), false) AS finite_number,
    EXISTS (
      SELECT 1 FROM public.itr_attachments a
      WHERE a.itr_id = p_itr_id AND a.item_id = i.id
        AND a.file_url ~ '[^[:space:]]' AND a.file_type LIKE 'image/%'
    ) AS has_photo,
    EXISTS (
      SELECT 1 FROM public.itr_attachments a
      WHERE a.itr_id = p_itr_id AND a.item_id = i.id
        AND a.file_url ~ '[^[:space:]]' AND a.file_type = 'application/pdf'
    ) AS has_document
  FROM public.itrs itr
  JOIN public.itr_template_items i ON i.template_id = itr.template_id
  LEFT JOIN public.itr_responses r ON r.itr_id = itr.id AND r.item_id = i.id
  WHERE itr.id = p_itr_id
),
walk AS (
  SELECT i.id AS origin, i.id, i.condition_item_id, i.condition_value,
    ARRAY[i.id] AS path, true AS matches
  FROM items i
  UNION ALL
  SELECT w.origin, p.id, p.condition_item_id, p.condition_value,
    w.path || p.id,
    w.matches AND COALESCE(p.condition_actual = w.condition_value, false)
  FROM walk w
  JOIN items p ON p.id = w.condition_item_id
  WHERE NOT p.id = ANY(w.path)
),
visibility AS (
  SELECT w.origin,
    bool_or(w.condition_item_id IS NOT NULL AND (
      w.condition_value IS NULL OR w.condition_item_id = ANY(w.path)
      OR NOT EXISTS (SELECT 1 FROM items p WHERE p.id = w.condition_item_id)
    )) AS invalid,
    bool_and(w.matches) AND bool_or(w.condition_item_id IS NULL) AS applicable
  FROM walk w GROUP BY w.origin
),
evaluated AS (
  SELECT i.id, (i.is_required OR i.selection_outcome='not_applicable') IS TRUE AS is_required, i.is_critical, i.is_passed, i.selection_outcome, i.continuity, i.table_eval,
    v.invalid, v.applicable AND NOT v.invalid AS applicable,
    COALESCE(
      (NOT i.requires_photo OR i.has_photo)
      AND (NOT i.requires_document OR i.has_document)
      AND (NOT i.requires_measurement OR i.finite_number)
      AND CASE i.item_type::text
        WHEN 'continuity' THEN (i.continuity->>'is_complete')::boolean
        WHEN 'table' THEN (i.table_eval->>'is_complete')::boolean
        WHEN 'text' THEN i.value_text ~ '[^[:space:]]'
        WHEN 'number' THEN i.finite_number
        WHEN 'measurement' THEN i.finite_number
        -- S05 (C-20): una casilla cuenta solo marcada (desmarcarla no la deja «respondida»); un «No» pide observación.
        WHEN 'checkbox' THEN i.value_bool IS TRUE
        WHEN 'yes_no' THEN i.value_bool IS TRUE OR (i.value_bool IS FALSE AND i.remarks ~ '[^[:space:]]')
        WHEN 'select' THEN i.value_option ~ '[^[:space:]]'
          AND pg_catalog.jsonb_typeof(i.options) = 'array'
          AND i.options @> pg_catalog.jsonb_build_array(i.value_option)
          AND (i.selection_outcome IS DISTINCT FROM 'not_applicable' OR i.remarks ~ '[^[:space:]]')
        WHEN 'date' THEN i.value_text ~ '^\d{4}-\d{2}-\d{2}$'
          AND pg_catalog.pg_input_is_valid(i.value_text, 'date')
        WHEN 'photo' THEN i.has_photo
        ELSE false
      END, false
    ) AS filled
  FROM items i JOIN visibility v ON v.origin = i.id
),
counts AS (
  SELECT count(*) FILTER (WHERE applicable) AS applicable_count,
    count(*) FILTER (WHERE applicable AND is_required) AS required_count,
    count(*) FILTER (WHERE applicable AND filled) AS completed_count,
    count(*) FILTER (WHERE applicable AND is_required AND filled) AS completed_required_count,
    count(*) FILTER (WHERE invalid) AS invalid_count,
    COALESCE(bool_or(applicable AND ((is_critical AND is_passed IS FALSE) OR selection_outcome='fail' OR (continuity->>'has_fail')::boolean OR (table_eval->>'has_fail')::boolean)), false) AS has_critical_fail,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable), '[]'::jsonb) AS applicable_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE invalid), '[]'::jsonb) AS invalid_condition_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable AND is_required AND NOT filled), '[]'::jsonb) AS missing_required_item_ids
  FROM evaluated
), result AS (
  SELECT *, applicable_count > 0 AND invalid_count = 0
    AND completed_required_count = required_count AS is_complete FROM counts
)
SELECT pg_catalog.jsonb_build_object(
  'is_complete', is_complete,
  'progress_pct', CASE WHEN is_complete THEN 100 WHEN required_count > 0
    THEN LEAST(99, FLOOR(completed_required_count::numeric * 100 / required_count)) ELSE 0 END,
  'has_critical_fail', has_critical_fail,
  'applicable_count', applicable_count,
  'required_count', required_count,
  'completed_count', completed_count,
  'completed_required_count', completed_required_count,
  'applicable_item_ids', applicable_item_ids,
  'invalid_condition_item_ids', invalid_condition_item_ids,
  'missing_required_item_ids', missing_required_item_ids
) FROM result;
$function$;


DROP FUNCTION public.evaluate_itr_continuity(text);
REVOKE ALL ON FUNCTION public.evaluate_itr_continuity(text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_itr_continuity(text, jsonb, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_itr_continuity_scope(uuid, uuid, text, integer, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_itr_continuity_scope(uuid, uuid, text, integer, text[], text) TO authenticated, service_role;

-- I01A, solo borradores sin ITR: 38-2 (D.4 fuera, el resto de los datos se renumera) y 38-3 (lectura no obligatoria).
WITH drafts AS (
  SELECT t.id FROM public.itr_templates t
  WHERE upper(t.code) = 'I01A' AND NOT t.is_active AND NOT EXISTS (SELECT 1 FROM public.itrs x WHERE x.template_id = t.id)
), removed AS (
  DELETE FROM public.itr_template_items i USING drafts d
  WHERE i.template_id = d.id AND i.item_number = 'D.4' AND i.description_es LIKE 'Número de conductores o pares%'
    AND NOT EXISTS (SELECT 1 FROM public.itr_template_items j WHERE j.condition_item_id = i.id)
  RETURNING i.template_id
)
UPDATE public.itr_template_items i
SET item_number = 'D.' || (substr(i.item_number, 3)::integer - 1)
WHERE i.template_id IN (SELECT template_id FROM removed) AND i.item_number ~ '^D\.[5-9]$';

UPDATE public.itr_template_items i
SET options = '{"measurement_required": false}'::jsonb,
    description = 'Record continuity for each conductor and shield of the scope set by the leader, in accordance with the procedure; enter terminals, results and any required readings.',
    description_es = 'Registrar la continuidad de cada conductor y pantalla del alcance fijado por el líder, conforme al procedimiento; consignar terminales, resultados y las lecturas requeridas.'
FROM public.itr_templates t
WHERE t.id = i.template_id AND upper(t.code) = 'I01A' AND NOT t.is_active AND i.item_type::text = 'continuity'
  AND NOT EXISTS (SELECT 1 FROM public.itrs x WHERE x.template_id = t.id);
