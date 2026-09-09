-- Revisiones de plantilla ITR como operaciones atómicas.
--
-- create_itr_template_revision: copia completa (cabecera, secciones, ítems,
-- condiciones re-mapeadas) como revisión nueva INACTIVA con version = max+1.
-- activate_itr_template_revision: activa la revisión indicada, desactiva las
-- demás del mismo org+code y re-apunta la matriz equipo×ITR en la misma
-- transacción. Nunca modifica la revisión en sitio ni toca ITR asignados.
--
-- Ambas son SECURITY DEFINER con verificación explícita de editor de la org
-- (mismo patrón que sign_itr_atomic). Los triggers *_frozen siguen activos:
-- una revisión con ITR asignados solo admite el cambio de is_active.

CREATE OR REPLACE FUNCTION public.create_itr_template_revision(p_template_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  src public.itr_templates;
  uid uuid := auth.uid();
  new_id uuid;
  next_version integer;
  sec record;
  new_sec_id uuid;
  it record;
  new_item_id uuid;
  id_map jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO src FROM public.itr_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = src.org_id AND m.user_id = uid
      AND m.role::text IN ('owner','admin','architect','leader')
  ) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.itr_templates WHERE org_id = src.org_id AND code = src.code;

  INSERT INTO public.itr_templates (
    org_id, discipline_id, equipment_type_id, phase_id, code, title, title_es,
    description, version, is_active, is_global
  ) VALUES (
    src.org_id, src.discipline_id, src.equipment_type_id, src.phase_id, src.code, src.title, src.title_es,
    src.description, next_version, false, src.is_global
  ) RETURNING id INTO new_id;

  FOR sec IN
    SELECT * FROM public.itr_template_sections WHERE template_id = src.id ORDER BY order_index, id
  LOOP
    INSERT INTO public.itr_template_sections (template_id, title, order_index)
    VALUES (new_id, sec.title, sec.order_index) RETURNING id INTO new_sec_id;

    FOR it IN
      SELECT * FROM public.itr_template_items WHERE section_id = sec.id ORDER BY order_index, id
    LOOP
      INSERT INTO public.itr_template_items (
        section_id, template_id, description, description_es, description_es_source,
        item_type, is_required, is_critical, requires_photo, requires_measurement,
        options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text,
        order_index, item_number, condition_value
      ) VALUES (
        new_sec_id, new_id, it.description, it.description_es, it.description_es_source,
        it.item_type, it.is_required, it.is_critical, it.requires_photo, it.requires_measurement,
        it.options, it.option_outcomes, it.unit, it.acceptance_min, it.acceptance_max, it.acceptance_text,
        it.order_index, it.item_number, it.condition_value
      ) RETURNING id INTO new_item_id;
      id_map := id_map || jsonb_build_object(it.id::text, new_item_id::text);
    END LOOP;
  END LOOP;

  -- Re-map conditions to the copied items. A condition pointing outside the
  -- template is dropped together with its value rather than left dangling.
  UPDATE public.itr_template_items n
  SET condition_item_id = (id_map ->> o.condition_item_id::text)::uuid,
      condition_value = CASE WHEN id_map ? o.condition_item_id::text THEN o.condition_value ELSE NULL END
  FROM public.itr_template_items o
  WHERE o.template_id = src.id AND o.condition_item_id IS NOT NULL
    AND n.id = (id_map ->> o.id::text)::uuid;

  INSERT INTO public.activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (src.org_id, uid, 'itr_template', new_id, 'revision_created',
    jsonb_build_object('code', src.code, 'version', next_version, 'source_template_id', src.id, 'source_version', src.version));

  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.activate_itr_template_revision(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  tgt public.itr_templates;
  uid uuid := auth.uid();
  deactivated uuid[] := '{}';
  repointed integer := 0;
  dropped integer := 0;
BEGIN
  SELECT * INTO tgt FROM public.itr_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = tgt.org_id AND m.user_id = uid
      AND m.role::text IN ('owner','admin','architect','leader')
  ) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.itr_template_items WHERE template_id = tgt.id) THEN
    RAISE EXCEPTION 'Revision has no items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.itr_template_items
    WHERE template_id = tgt.id AND item_type::text = 'select'
      AND NOT (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) > 0)
  ) THEN RAISE EXCEPTION 'Select items without options'; END IF;

  -- Serialise concurrent activations of the same code.
  PERFORM 1 FROM public.itr_templates
  WHERE org_id = tgt.org_id AND code = tgt.code AND id <> tgt.id FOR UPDATE;

  UPDATE public.itr_templates SET is_active = false
  WHERE org_id = tgt.org_id AND code = tgt.code AND id <> tgt.id AND is_active;
  SELECT COALESCE(array_agg(id), '{}') INTO deactivated FROM public.itr_templates
  WHERE org_id = tgt.org_id AND code = tgt.code AND id <> tgt.id;

  IF NOT tgt.is_active THEN
    UPDATE public.itr_templates SET is_active = true WHERE id = tgt.id;
  END IF;

  -- Matrix rows follow the active revision. Rows that would collide with an
  -- existing row for the target are removed instead of left dangling.
  WITH moved AS (
    UPDATE public.equipment_type_templates m SET itr_template_id = tgt.id
    WHERE m.itr_template_id = ANY(deactivated)
      AND NOT EXISTS (
        SELECT 1 FROM public.equipment_type_templates x
        WHERE x.org_id = m.org_id AND x.equipment_type_id = m.equipment_type_id AND x.itr_template_id = tgt.id
      )
    RETURNING m.id
  ) SELECT count(*) INTO repointed FROM moved;
  WITH gone AS (
    DELETE FROM public.equipment_type_templates m
    WHERE m.itr_template_id = ANY(deactivated)
    RETURNING m.id
  ) SELECT count(*) INTO dropped FROM gone;

  INSERT INTO public.activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (tgt.org_id, uid, 'itr_template', tgt.id, 'revision_activated',
    jsonb_build_object('code', tgt.code, 'version', tgt.version, 'deactivated', to_jsonb(deactivated),
      'matrix_repointed', repointed, 'matrix_dropped', dropped));

  RETURN jsonb_build_object('id', tgt.id, 'version', tgt.version, 'deactivated', to_jsonb(deactivated),
    'matrix_repointed', repointed, 'matrix_dropped', dropped);
END $$;

REVOKE ALL ON FUNCTION public.create_itr_template_revision(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_itr_template_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_itr_template_revision(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_itr_template_revision(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_itr_template_revision(uuid) IS
  'Copia completa de una plantilla ITR como revisión nueva inactiva (version = max+1 del mismo org+code). Nunca modifica la origen.';
COMMENT ON FUNCTION public.activate_itr_template_revision(uuid) IS
  'Activa una revisión, desactiva las demás del mismo org+code y re-apunta equipment_type_templates en una sola transacción.';
