-- fn: public.move_tag_subsystem(uuid, uuid, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.move_tag_subsystem(p_tag_id uuid, p_subsystem_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tag public.tags; v_org uuid; v_plan jsonb;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_itrs uuid[]; v_punches uuid[];
BEGIN
  -- C-16 (D9): mover un tag con ITR o punch de subsistema es un flujo explícito, no un efecto de importar.
  -- Se mueven juntos el tag, sus ITR sin firmar y sus punches abiertos, para que readiness y elegibilidad
  -- de los dos subsistemas no queden partidas. Un ITR firmado o aprobado bloquea: se reabre primero.
  SELECT * INTO v_tag FROM tags WHERE id = p_tag_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v_tag.project_id) THEN
    RAISE EXCEPTION 'Tag no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_project_editor(v_tag.project_id) THEN
    RAISE EXCEPTION 'Solo un líder o superior mueve un tag de subsistema' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Explica por qué se mueve (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;

  -- Bloquea los ITR del tag antes de mirar firmas: una firma concurrente espera o hace fallar el movimiento.
  PERFORM 1 FROM itrs WHERE tag_id = p_tag_id FOR UPDATE;
  v_plan := public.tag_subsystem_move_preview(p_tag_id, p_subsystem_id);
  IF (v_plan ->> 'same')::boolean THEN
    RAISE EXCEPTION 'El tag ya está en ese subsistema' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(v_plan -> 'signed_itrs') > 0 THEN
    RAISE EXCEPTION 'Tiene ITR firmados o aprobados (%): reábrelos primero o deja el tag donde está',
      (SELECT string_agg(e ->> 'itr_number', ', ') FROM jsonb_array_elements(v_plan -> 'signed_itrs') e)
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg((e ->> 'id')::uuid), '{}') INTO v_itrs FROM jsonb_array_elements(v_plan -> 'itrs') e;
  SELECT COALESCE(array_agg((e ->> 'id')::uuid), '{}') INTO v_punches FROM jsonb_array_elements(v_plan -> 'punches') e;

  UPDATE tags SET subsystem_id = p_subsystem_id WHERE id = p_tag_id;
  UPDATE itrs SET subsystem_id = p_subsystem_id WHERE id = ANY (v_itrs);
  UPDATE punches SET subsystem_id = p_subsystem_id WHERE id = ANY (v_punches);

  SELECT org_id INTO v_org FROM projects WHERE id = v_tag.project_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'tag', p_tag_id, 'subsystem_moved',
          jsonb_build_object('reason', v_reason, 'project_id', v_tag.project_id, 'tag_number', v_tag.tag_number,
                             'from', v_plan -> 'from', 'to', v_plan -> 'to',
                             'itrs', v_plan -> 'itrs', 'punches', v_plan -> 'punches',
                             'punches_kept', v_plan -> 'punches_kept', 'certificates', v_plan -> 'certificates'));

  RETURN jsonb_build_object('itrs_moved', cardinality(v_itrs), 'punches_moved', cardinality(v_punches),
                            'from', v_plan -> 'from', 'to', v_plan -> 'to');
END;
$function$;
