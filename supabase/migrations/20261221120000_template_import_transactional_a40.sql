-- A40 (ola 1): importar una plantilla de otra org (catálogo) en UNA transacción.
--
-- La pantalla clonaba por su cuenta, paso a paso: sin required_signatures ni requires_test_equipment, activaba un
-- código nuevo antes de tener ítems e ignoraba los errores de la matriz y de las condiciones (una importación
-- interrumpida dejaba plantillas activas a medias). Ahora todo pasa por clone_itr_template_from_catalog:
--   - firmas requeridas y equipo de prueba se copian; la plantilla nace inactiva y un código nuevo se activa al
--     final, con sus ítems, condiciones y filas de la matriz equipo × ITR ya copiadas;
--   - un código existente solo recibe revisión (inactiva) si se pide, y si la última revisión cambió desde que
--     quien llama la comparó, falla (CU409) en vez de duplicar;
--   - la auditoría va en la misma transacción; membresía activa (is_org_editor) en lugar de cualquier fila.
-- La firma cambia (parámetros nuevos): se borra la anterior para no dejar dos sobrecargas.

DROP FUNCTION IF EXISTS public.clone_itr_template_from_catalog(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.clone_itr_template_from_catalog(p_source_template_id uuid, p_target_org_id uuid, p_code_suffix text DEFAULT NULL::text, p_update_existing boolean DEFAULT false, p_expected_latest_version integer DEFAULT NULL::integer, p_description text DEFAULT NULL::text, p_content_hash text DEFAULT NULL::text)
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
  latest integer;
  next_version integer;
  kind text;
  new_id uuid;
  sec record;
  new_sec_id uuid;
  it record;
  new_item_id uuid;
  id_map jsonb := '{}'::jsonb;
  matrix_rows integer := 0;
BEGIN
  -- A40: una sola transacción. Plantilla, secciones, ítems, condiciones, filas de la matriz y auditoría quedan
  -- juntas o no queda nada; un código nuevo se activa al final, con sus ítems ya copiados.
  IF uid IS NULL OR NOT public.is_org_editor(p_target_org_id) THEN RAISE EXCEPTION 'Template editor membership required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO src FROM public.itr_templates WHERE id = p_source_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source template not found'; END IF;
  IF src.org_id = p_target_org_id THEN RAISE EXCEPTION 'Source template already belongs to the target organization'; END IF;
  -- Visibility mirrors RLS: catalog orgs are public, other orgs require membership.
  IF NOT public.is_catalog_org(src.org_id) AND NOT src.org_id IN (SELECT public.get_my_org_ids()) THEN RAISE EXCEPTION 'Source template not found'; END IF;
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

  -- Serialise concurrent imports of the same code into the target (also when the code does not exist yet).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_target_org_id::text || ':itr_template:' || new_code, 0));

  SELECT max(version) INTO latest FROM public.itr_templates WHERE org_id = p_target_org_id AND code = new_code;
  IF latest IS NOT NULL AND NOT p_update_existing THEN
    RAISE EXCEPTION 'Template code % already exists in the target organization', new_code USING ERRCODE = 'P0001';
  END IF;
  -- Quien llama comparó el contenido con la última revisión que vio; si cambió entretanto, que vuelva a mirar.
  IF p_expected_latest_version IS DISTINCT FROM latest AND (p_expected_latest_version IS NOT NULL OR latest IS NOT NULL) AND p_update_existing THEN
    RAISE EXCEPTION 'Template % changed while importing (latest revision %); retry', new_code, COALESCE(latest, 0) USING ERRCODE = 'CU409';
  END IF;
  next_version := COALESCE(latest, 0) + 1;
  kind := CASE WHEN latest IS NULL THEN 'created' ELSE 'revision' END;

  INSERT INTO public.itr_templates (
    org_id, discipline_id, equipment_type_id, phase_id, code, title, title_es, description,
    version, is_active, is_global, source_template_id, source_org_id, source_version, imported_at,
    requires_test_equipment, required_signatures
  ) VALUES (
    p_target_org_id, tgt_disc, tgt_eq, tgt_phase, new_code, src.title, src.title_es, COALESCE(p_description, src.description),
    next_version, false, false, src.id, src.org_id, src.version, now(),
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

  -- A40: un código nuevo trae su matriz equipo × ITR (tipos que existen por código en la org destino);
  -- una revisión la hereda al activarse.
  IF kind = 'created' THEN
    INSERT INTO public.equipment_type_templates (org_id, equipment_type_id, itr_template_id, status, source, confidence, reason, model)
    SELECT p_target_org_id, te.id, new_id, m.status, m.source, m.confidence, m.reason, m.model
    FROM public.equipment_type_templates m
    JOIN public.equipment_types se ON se.id = m.equipment_type_id
    JOIN public.equipment_types te ON te.org_id = p_target_org_id AND te.code = se.code
    WHERE m.itr_template_id = src.id
    ON CONFLICT (org_id, equipment_type_id, itr_template_id) DO NOTHING;
    GET DIAGNOSTICS matrix_rows = ROW_COUNT;
    UPDATE public.itr_templates SET is_active = true WHERE id = new_id;
  END IF;

  INSERT INTO public.activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (p_target_org_id, uid, 'itr_template', new_id, 'template_imported',
    jsonb_build_object('code', new_code, 'version', next_version, 'kind', kind,
      'source_template_id', src.id, 'source_org_id', src.org_id, 'source_version', src.version,
      'content_hash', p_content_hash, 'matrix_rows', matrix_rows,
      'equipment_type_mapped', src.equipment_type_id IS NULL OR tgt_eq IS NOT NULL));

  RETURN jsonb_build_object('kind', kind, 'id', new_id, 'code', new_code,
    'version', next_version, 'is_active', kind = 'created', 'matrix_rows', matrix_rows,
    'equipment_type_mapped', src.equipment_type_id IS NULL OR tgt_eq IS NOT NULL);
END $function$;

REVOKE ALL ON FUNCTION public.clone_itr_template_from_catalog(uuid, uuid, text, boolean, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clone_itr_template_from_catalog(uuid, uuid, text, boolean, integer, text, text) TO authenticated, service_role;
