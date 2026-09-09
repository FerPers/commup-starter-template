-- Structured continuity is stored in the existing, signature-protected response.
CREATE OR REPLACE FUNCTION public.evaluate_itr_continuity(p_value text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
 d jsonb; row_data jsonb; shield jsonb; expected text[] := '{}'; seen text[] := '{}';
 n integer; j integer; row_id text; complete boolean := true; failed boolean := false;
 invalid CONSTANT jsonb := '{"is_complete":false,"has_fail":false}'::jsonb;
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
   ELSIF d->'measurementRequired'='true'::jsonb THEN
     IF jsonb_typeof(row_data->'reading') IS DISTINCT FROM 'number'
     OR jsonb_typeof(row_data->'unit') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'unit' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false) THEN complete := false;
     ELSE
       -- Match JavaScript finite numbers, including overflow from valid JSON numeric.
       IF abs((row_data->>'reading')::numeric) < 1e-307 THEN
         NULL; -- JSON.parse rounds underflow to finite zero; PostgreSQL float input throws.
       ELSIF NOT pg_catalog.pg_input_is_valid(row_data->>'reading','double precision') THEN complete := false;
       ELSIF (row_data->>'reading')::double precision IN ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) THEN complete := false; END IF;
     END IF;
   END IF;
 END LOOP;
 RETURN jsonb_build_object('is_complete',complete AND cardinality(seen)=cardinality(expected),'has_fail',failed);
END;
$fn$;
REVOKE ALL ON FUNCTION public.evaluate_itr_continuity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_itr_continuity(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.evaluate_itr_capture(p_itr_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
WITH RECURSIVE
items AS MATERIALIZED (
  SELECT i.*, r.value_text, r.value_numeric, r.value_bool, r.value_option, r.remarks,
    i.option_outcomes ->> r.value_option AS selection_outcome,
    CASE WHEN i.item_type::text='continuity' THEN public.evaluate_itr_continuity(r.value_text) END AS continuity,
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
    ) AS has_photo
  FROM public.itrs itr
  JOIN public.itr_template_items i ON i.template_id = itr.template_id
  LEFT JOIN public.itr_responses r ON r.itr_id = itr.id AND r.item_id = i.id
  WHERE itr.id = p_itr_id
),
-- Walk every ancestor even after a false condition, so invalid graphs cannot
-- silently hide a required branch. Path bounds traversal in cyclic graphs.
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
  SELECT i.id, (i.is_required OR i.selection_outcome='not_applicable') IS TRUE AS is_required, i.is_critical, i.is_passed, i.selection_outcome, i.continuity,
    v.invalid, v.applicable AND NOT v.invalid AS applicable,
    COALESCE(
      (NOT i.requires_photo OR i.has_photo)
      AND (NOT i.requires_measurement OR i.finite_number)
      AND CASE i.item_type::text
        WHEN 'continuity' THEN (i.continuity->>'is_complete')::boolean
        WHEN 'text' THEN i.value_text ~ '[^[:space:]]'
        WHEN 'number' THEN i.finite_number
        WHEN 'measurement' THEN i.finite_number
        WHEN 'checkbox' THEN i.value_bool IS NOT NULL
        WHEN 'yes_no' THEN i.value_bool IS NOT NULL
        WHEN 'select' THEN i.value_option ~ '[^[:space:]]'
          AND pg_catalog.jsonb_typeof(i.options) = 'array'
          AND i.options @> pg_catalog.jsonb_build_array(i.value_option)
          AND (i.selection_outcome IS DISTINCT FROM 'not_applicable' OR i.remarks ~ '[^[:space:]]')
        WHEN 'date' THEN i.value_text ~ '^\d{4}-\d{2}-\d{2}$'
          AND pg_catalog.pg_input_is_valid(i.value_text, 'date')
        WHEN 'photo' THEN i.has_photo
        ELSE false -- Item-level signature capture is not implemented.
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
    COALESCE(bool_or(applicable AND ((is_critical AND is_passed IS FALSE) OR selection_outcome='fail' OR (continuity->>'has_fail')::boolean)), false) AS has_critical_fail,
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

-- No anonymous RPC. SECURITY INVOKER retains table RLS for authenticated callers.
REVOKE ALL ON FUNCTION public.evaluate_itr_capture(uuid) FROM PUBLIC;
-- Deployment grants belong to the migration and require the Supabase roles:
-- GRANT EXECUTE ON FUNCTION public.evaluate_itr_capture(uuid) TO authenticated, service_role;
