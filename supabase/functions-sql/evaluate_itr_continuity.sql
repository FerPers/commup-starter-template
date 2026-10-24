-- fn: public.evaluate_itr_continuity(text,jsonb,boolean)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
