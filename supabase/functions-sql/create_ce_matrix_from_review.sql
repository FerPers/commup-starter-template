-- fn: public.create_ce_matrix_from_review(jsonb, jsonb, jsonb, jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.create_ce_matrix_from_review(p_matrix jsonb, p_causes jsonb, p_effects jsonb, p_links jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_matrix uuid; v_project uuid := (p_matrix->>'project_id')::uuid;
BEGIN
  -- S07 (F-36): la matriz revisada se crea entera o nada (antes: cuatro inserciones y un borrado
  -- compensatorio que, si fallaba, dejaba una matriz parcial). SECURITY INVOKER: rige la RLS del editor.
  INSERT INTO ce_matrices (project_id, org_id, system_id, code, title, source, revision, source_document, notes)
  VALUES (v_project, (p_matrix->>'org_id')::uuid, NULLIF(p_matrix->>'system_id', '')::uuid, p_matrix->>'code', p_matrix->>'title', 'ai',
          NULLIF(p_matrix->>'revision', ''), NULLIF(p_matrix->>'source_document', ''), p_matrix->>'notes')
  RETURNING id INTO v_matrix;

  INSERT INTO ce_causes (matrix_id, project_id, seq, code, description, tag_id, condition, setpoint, voting, notes)
  SELECT v_matrix, v_project, (x->>'seq')::int, x->>'code', x->>'description', NULLIF(x->>'tag_id', '')::uuid,
         NULLIF(x->>'condition', ''), NULLIF(x->>'setpoint', ''), x->>'voting', NULLIF(x->>'notes', '')
  FROM jsonb_array_elements(p_causes) x;

  INSERT INTO ce_effects (matrix_id, project_id, seq, code, description, tag_id, action, notes)
  SELECT v_matrix, v_project, (x->>'seq')::int, x->>'code', x->>'description', NULLIF(x->>'tag_id', '')::uuid,
         x->>'action', NULLIF(x->>'notes', '')
  FROM jsonb_array_elements(p_effects) x;

  INSERT INTO ce_links (cause_id, effect_id, project_id, link_type, delay_s, note)
  SELECT c.id, e.id, v_project, x->>'link_type', NULLIF(x->>'delay_s', '')::numeric, NULLIF(x->>'note', '')
  FROM jsonb_array_elements(p_links) x
  JOIN ce_causes c ON c.matrix_id = v_matrix AND c.code = x->>'cause_code'
  JOIN ce_effects e ON e.matrix_id = v_matrix AND e.code = x->>'effect_code';

  RETURN v_matrix;
END;
$function$;
