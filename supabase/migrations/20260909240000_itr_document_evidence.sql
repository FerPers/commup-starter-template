-- Evidencia documental por ítem (PDF): requires_document.
--
-- Hasta ahora la única evidencia posible era una imagen (bucket itr-attachments
-- restringido a image/*). Certificados de patrón, registros del contratista y
-- soportes de calibración necesitan un PDF adjunto al ítem, verificado por el
-- evaluador de completitud (TS y SQL) igual que requires_photo.

ALTER TABLE public.itr_template_items
  ADD COLUMN IF NOT EXISTS requires_document boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.itr_template_items.requires_document IS
  'El ítem exige al menos un adjunto application/pdf vinculado (certificado, registro, soporte).';

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
WHERE id = 'itr-attachments' AND NOT ('application/pdf' = ANY(COALESCE(allowed_mime_types, ARRAY[]::text[])));

-- Evaluador de completitud: exige documento cuando el ítem lo requiere.
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
      AND (NOT i.requires_document OR i.has_document)
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

REVOKE ALL ON FUNCTION public.evaluate_itr_capture(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_itr_capture(uuid) TO authenticated, service_role;

-- La copia de revisión conserva el nuevo atributo.
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
