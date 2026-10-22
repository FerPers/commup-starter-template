-- fn: public.procedure_write_content(public.procedure_revisions,jsonb,jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.procedure_write_content(r public.procedure_revisions, p_sections jsonb, p_steps jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE e jsonb; i integer := 0; v_clean jsonb := '{}'::jsonb; k text; v_min numeric; v_max numeric;
BEGIN
  IF p_sections IS NOT NULL THEN
    IF jsonb_typeof(p_sections) <> 'object' THEN RAISE EXCEPTION 'Secciones no válidas' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_sections) LOOP
      IF NOT (k = ANY (public.procedure_section_keys())) THEN RAISE EXCEPTION 'Sección desconocida: %', k USING ERRCODE = '22023'; END IF;
      IF public.mgmt_text(p_sections ->> k, 20000) IS NOT NULL THEN v_clean := v_clean || jsonb_build_object(k, public.mgmt_text(p_sections ->> k, 20000)); END IF;
    END LOOP;
    UPDATE procedure_revisions SET sections = v_clean, updated_at = now() WHERE id = r.id;
  END IF;
  IF p_steps IS NOT NULL THEN
    IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) > 500 THEN RAISE EXCEPTION 'Pasos no válidos' USING ERRCODE = '22023'; END IF;
    DELETE FROM procedure_steps WHERE revision_id = r.id;
    FOR e IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
      i := i + 1;
      IF NULLIF(e ->> 'tag_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tags WHERE id = (e ->> 'tag_id')::uuid AND project_id = r.project_id) THEN
        RAISE EXCEPTION 'El tag del paso % no pertenece al proyecto', i USING ERRCODE = '22023';
      END IF;
      IF public.mgmt_text(e ->> 'action', 4000) IS NULL THEN RAISE EXCEPTION 'El paso % no tiene acción', i USING ERRCODE = '22023'; END IF;
      -- S25 (E-23): rango esperado opcional (mín/máx/unidad) para avisar un valor fuera de rango en campo.
      v_min := CASE WHEN btrim(COALESCE(e ->> 'expected_min', '')) ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(btrim(e ->> 'expected_min'), ',', '.')::numeric END;
      v_max := CASE WHEN btrim(COALESCE(e ->> 'expected_max', '')) ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(btrim(e ->> 'expected_max'), ',', '.')::numeric END;
      IF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min > v_max THEN
        RAISE EXCEPTION 'Paso %: el mínimo es mayor que el máximo', i USING ERRCODE = '22023';
      END IF;
      INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria,
                                   expected_min, expected_max, expected_unit)
      VALUES (r.id, r.project_id, i, public.mgmt_text(e ->> 'action', 4000), public.mgmt_text(e ->> 'responsible', 200),
              public.mgmt_text(e ->> 'expected_value', 500), NULLIF(e ->> 'tag_id', '')::uuid, COALESCE((e ->> 'is_hold_point')::boolean, false),
              CASE WHEN COALESCE((e ->> 'is_hold_point')::boolean, false) THEN COALESCE(NULLIF(e ->> 'hold_capacity', ''), 'commissioning') END,
              public.mgmt_text(e ->> 'stop_criteria', 2000), v_min, v_max, public.mgmt_text(e ->> 'expected_unit', 30));
    END LOOP;
  END IF;
END;
$function$;
