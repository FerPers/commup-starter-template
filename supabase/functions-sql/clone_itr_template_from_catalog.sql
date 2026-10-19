-- fn: public.clone_itr_template_from_catalog(uuid, uuid, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.clone_itr_template_from_catalog(p_source_template_id uuid, p_target_org_id uuid, p_code_suffix text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  src public.itr_templates;
  uid uuid := auth.uid();
  src_disc_code text;
  src_phase_code text;
  src_eq_code text;
  tgt_disc uuid;
  tgt_phase uuid;
  tgt_eq uuid;
  new_code text;
  next_version integer;
  already public.itr_templates;
  mode text;
  new_id uuid;
  sec record;
  new_sec_id uuid;
  it record;
  new_item_id uuid;
  id_map jsonb := '{}'::jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = p_target_org_id AND m.user_id = uid
      AND m.role::text IN ('owner','admin','architect','leader')
  ) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;

  SELECT * INTO src FROM public.itr_templates WHERE id = p_source_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source template not found'; END IF;
  IF src.org_id = p_target_org_id THEN RAISE EXCEPTION 'Source template already belongs to the target organization'; END IF;
  -- Visibility mirrors RLS: catalog orgs are public, other orgs require membership.
  IF NOT public.is_catalog_org(src.org_id) AND NOT EXISTS (
    SELECT 1 FROM public.org_members m WHERE m.org_id = src.org_id AND m.user_id = uid
  ) THEN RAISE EXCEPTION 'Source template not found'; END IF;
  IF NOT src.is_active THEN RAISE EXCEPTION 'Only the active revision can be imported'; END IF;

  SELECT code INTO src_disc_code FROM public.disciplines WHERE id = src.discipline_id;
  SELECT code INTO src_phase_code FROM public.project_phases WHERE id = src.phase_id;
  IF src_disc_code IS NULL OR src_phase_code IS NULL THEN
    RAISE EXCEPTION 'Source template without discipline or phase';
  END IF;
  SELECT id INTO tgt_disc FROM public.disciplines WHERE org_id = p_target_org_id AND code = src_disc_code ORDER BY id LIMIT 1;
  SELECT id INTO tgt_phase FROM public.project_phases WHERE org_id = p_target_org_id AND code = src_phase_code ORDER BY id LIMIT 1;
  IF tgt_disc IS NULL THEN RAISE EXCEPTION 'Missing discipline "%" in target organization', src_disc_code; END IF;
  IF tgt_phase IS NULL THEN RAISE EXCEPTION 'Missing phase "%" in target organization', src_phase_code; END IF;
  IF src.equipment_type_id IS NOT NULL THEN
    SELECT code INTO src_eq_code FROM public.equipment_types WHERE id = src.equipment_type_id;
    SELECT id INTO tgt_eq FROM public.equipment_types WHERE org_id = p_target_org_id AND code = src_eq_code ORDER BY id LIMIT 1;
  END IF;

  new_code := src.code || COALESCE(p_code_suffix, '');

  -- Serialise concurrent imports of the same code into the target.
  PERFORM 1 FROM public.itr_templates WHERE org_id = p_target_org_id AND code = new_code FOR UPDATE;

  SELECT * INTO already FROM public.itr_templates
  WHERE org_id = p_target_org_id AND code = new_code AND source_template_id = src.id
  ORDER BY is_active DESC, version DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('mode', 'skipped', 'id', already.id, 'code', new_code,
      'version', already.version, 'is_active', already.is_active,
      'equipment_type_mapped', src.equipment_type_id IS NULL OR already.equipment_type_id IS NOT NULL);
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.itr_templates WHERE org_id = p_target_org_id AND code = new_code;
  mode := CASE WHEN next_version = 1 THEN 'created' ELSE 'revision' END;

  INSERT INTO public.itr_templates (
    org_id, discipline_id, equipment_type_id, phase_id, code, title, title_es, description,
    version, is_active, is_global, source_template_id, source_org_id, source_version, imported_at,
    requires_test_equipment, required_signatures -- S04: la revisión conserva equipos de prueba y firmas
  ) VALUES (
    p_target_org_id, tgt_disc, tgt_eq, tgt_phase, new_code, src.title, src.title_es, src.description,
    next_version, next_version = 1, false, src.id, src.org_id, src.version, now(),
    src.requires_test_equipment, src.required_signatures
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
        item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement,
        options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text,
        order_index, item_number, condition_value
      ) VALUES (
        new_sec_id, new_id, it.description, it.description_es, it.description_es_source,
        it.item_type, it.is_required, it.is_critical, it.requires_photo, it.requires_document, it.requires_measurement,
        it.options, it.option_outcomes, it.unit, it.acceptance_min, it.acceptance_max, it.acceptance_text,
        it.order_index, it.item_number, it.condition_value
      ) RETURNING id INTO new_item_id;
      id_map := id_map || jsonb_build_object(it.id::text, new_item_id::text);
    END LOOP;
  END LOOP;

  -- Re-map conditions to the copied items; a condition pointing outside the
  -- source template is dropped together with its value.
  UPDATE public.itr_template_items n
  SET condition_item_id = (id_map ->> o.condition_item_id::text)::uuid,
      condition_value = CASE WHEN id_map ? o.condition_item_id::text THEN o.condition_value ELSE NULL END
  FROM public.itr_template_items o
  WHERE o.template_id = src.id AND o.condition_item_id IS NOT NULL
    AND n.id = (id_map ->> o.id::text)::uuid;

  INSERT INTO public.activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (p_target_org_id, uid, 'itr_template', new_id, 'imported_from_catalog',
    jsonb_build_object('code', new_code, 'version', next_version, 'mode', mode,
      'source_template_id', src.id, 'source_org_id', src.org_id, 'source_version', src.version,
      'equipment_type_mapped', src.equipment_type_id IS NULL OR tgt_eq IS NOT NULL));

  RETURN jsonb_build_object('mode', mode, 'id', new_id, 'code', new_code,
    'version', next_version, 'is_active', next_version = 1,
    'equipment_type_mapped', src.equipment_type_id IS NULL OR tgt_eq IS NOT NULL);
END $function$;
