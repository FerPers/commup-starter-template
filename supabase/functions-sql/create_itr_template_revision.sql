-- fn: public.create_itr_template_revision(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.create_itr_template_revision(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    description, version, is_active, is_global,
    requires_test_equipment, required_signatures -- S04: la revisión conserva equipos de prueba y firmas
  ) VALUES (
    src.org_id, src.discipline_id, src.equipment_type_id, src.phase_id, src.code, src.title, src.title_es,
    src.description, next_version, false, src.is_global,
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
END $function$;
