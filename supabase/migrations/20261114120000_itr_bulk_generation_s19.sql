-- S19 (C-14 / C-30): generación masiva de ITR desde la matriz aprobada y filtros de la lista de ITR.
--
-- Decisión de Luis (2026-10-20): la asignación se elige por disciplina en la vista previa (ejecutor / supervisor /
-- cliente según lo que exija cada ITR); lo que queda vacío se crea sin asignar.
--
-- Reglas:
--   - Alcance = proyecto, o sistemas / subsistemas / tags elegidos, × fases.
--   - Regla = fila ACEPTADA de equipment_type_templates (tipo de equipo × plantilla). Se usa la revisión activa más
--     reciente del código de esa plantilla, de la fase pedida, y nunca plantillas «de origen» (loop check / prueba
--     C&E: se generan desde el lazo o la causa).
--   - Ya existe = el tag tiene un ITR con ese código (cualquier revisión) → no se repite (idempotente).
--   - Todo corre SECURITY INVOKER: la RLS, la numeración atómica (assign_itr_number), las firmas congeladas en el
--     ITR (S04) y las guardas de asignación (una persona por rol, cliente) aplican igual que al asignar de a uno.

-- ── Candidatos (tag × plantilla) del alcance ──────────────────────────────
CREATE OR REPLACE FUNCTION public.itr_generation_candidates(
  p_project_id uuid, p_phase_ids uuid[],
  p_system_ids uuid[] DEFAULT NULL, p_subsystem_ids uuid[] DEFAULT NULL, p_tag_ids uuid[] DEFAULT NULL)
RETURNS TABLE(tag_id uuid, tag_number text, subsystem_id uuid, equipment_type_id uuid, template_id uuid,
              template_code text, template_title text, discipline_id uuid, phase_id uuid, outcome text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH org AS (SELECT org_id FROM projects WHERE id = p_project_id),
  scope AS (
    SELECT t.id, t.tag_number, t.subsystem_id, t.equipment_type_id
    FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id
    WHERE t.project_id = p_project_id
      AND (p_tag_ids IS NULL OR t.id = ANY (p_tag_ids))
      AND (p_subsystem_ids IS NULL OR t.subsystem_id = ANY (p_subsystem_ids))
      AND (p_system_ids IS NULL OR s.system_id = ANY (p_system_ids))
  ),
  active AS (
    SELECT DISTINCT ON (tp.code) tp.id, tp.code, tp.title, tp.discipline_id, tp.phase_id
    FROM itr_templates tp, org
    WHERE tp.org_id = org.org_id AND tp.is_active
      AND NOT EXISTS (SELECT 1 FROM itr_template_items i
                      WHERE i.template_id = tp.id AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source')
    ORDER BY tp.code, tp.version DESC, tp.created_at DESC
  ),
  rules AS (
    SELECT DISTINCT m.equipment_type_id, a.id AS template_id, a.code, a.title, a.discipline_id, a.phase_id
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code
    JOIN org ON m.org_id = org.org_id
    WHERE m.status = 'accepted' AND a.phase_id = ANY (p_phase_ids)
  )
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, r.template_id, r.code, r.title, r.discipline_id, r.phase_id,
         CASE WHEN s.subsystem_id IS NULL THEN 'no_subsystem'
              WHEN EXISTS (SELECT 1 FROM itrs i JOIN itr_templates it ON it.id = i.template_id
                           WHERE i.tag_id = s.id AND it.code = r.code) THEN 'exists'
              ELSE 'create' END
  FROM scope s JOIN rules r ON r.equipment_type_id = s.equipment_type_id
  UNION ALL
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, NULL, NULL, NULL, NULL, NULL,
         CASE WHEN s.equipment_type_id IS NULL THEN 'no_equipment_type' ELSE 'no_rule' END
  FROM scope s
  WHERE NOT EXISTS (SELECT 1 FROM rules r WHERE r.equipment_type_id = s.equipment_type_id);
$fn$;

-- ── Vista previa agregada (cabe en una respuesta aunque el alcance tenga 50k tags) ─
CREATE OR REPLACE FUNCTION public.itr_generation_summary(
  p_project_id uuid, p_phase_ids uuid[],
  p_system_ids uuid[] DEFAULT NULL, p_subsystem_ids uuid[] DEFAULT NULL, p_tag_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  WITH c AS (SELECT * FROM public.itr_generation_candidates(p_project_id, p_phase_ids, p_system_ids, p_subsystem_ids, p_tag_ids)),
  tags_scope AS (SELECT DISTINCT tag_id FROM c)
  SELECT jsonb_build_object(
    'tags', (SELECT count(*) FROM tags_scope),
    'create', (SELECT count(*) FROM c WHERE outcome = 'create'),
    'exists', (SELECT count(*) FROM c WHERE outcome = 'exists'),
    'no_subsystem', (SELECT count(DISTINCT tag_id) FROM c WHERE outcome = 'no_subsystem'),
    'no_equipment_type', (SELECT count(*) FROM c WHERE outcome = 'no_equipment_type'),
    'no_rule', (SELECT count(*) FROM c WHERE outcome = 'no_rule'),
    'by_discipline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('discipline_id', x.discipline_id, 'code', d.code, 'name', d.name,
                                          'create', x.n, 'roles', x.roles) ORDER BY d.code NULLS LAST)
      FROM (SELECT c.discipline_id, count(*) AS n,
                   (SELECT array_agg(DISTINCT r ORDER BY r) FROM c c2 JOIN itr_templates tp ON tp.id = c2.template_id
                      LEFT JOIN project_phases ph ON ph.id = tp.phase_id,
                      LATERAL unnest(CASE WHEN COALESCE(ph.itr_client_signature, false) AND NOT ('client' = ANY (tp.required_signatures))
                                          THEN tp.required_signatures || 'client'::text ELSE tp.required_signatures END) r
                     WHERE c2.outcome = 'create' AND c2.discipline_id IS NOT DISTINCT FROM c.discipline_id) AS roles
            FROM c WHERE c.outcome = 'create' GROUP BY c.discipline_id) x
      LEFT JOIN disciplines d ON d.id = x.discipline_id), '[]'::jsonb),
    'by_template', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', template_code, 'title', template_title, 'create', cr, 'exists', ex) ORDER BY template_code)
      FROM (SELECT template_code, template_title, count(*) FILTER (WHERE outcome = 'create') cr, count(*) FILTER (WHERE outcome = 'exists') ex
            FROM c WHERE template_code IS NOT NULL GROUP BY 1, 2) t), '[]'::jsonb),
    'samples', jsonb_build_object(
      'no_equipment_type', COALESCE((SELECT jsonb_agg(tag_number ORDER BY tag_number) FROM (SELECT tag_number FROM c WHERE outcome = 'no_equipment_type' ORDER BY tag_number LIMIT 20) s), '[]'),
      'no_rule', COALESCE((SELECT jsonb_agg(tag_number ORDER BY tag_number) FROM (SELECT tag_number FROM c WHERE outcome = 'no_rule' ORDER BY tag_number LIMIT 20) s), '[]'),
      'no_subsystem', COALESCE((SELECT jsonb_agg(DISTINCT tag_number) FROM (SELECT tag_number FROM c WHERE outcome = 'no_subsystem' ORDER BY tag_number LIMIT 20) s), '[]'))
  ) INTO v;
  RETURN v;
END;
$fn$;

-- ── Generar un lote (idempotente: el cliente repite hasta remaining = 0) ────
-- p_assign: { "<discipline_id | none>": { "executor": uuid, "supervisor": uuid, "client": uuid } }
CREATE OR REPLACE FUNCTION public.generate_itrs(
  p_project_id uuid, p_phase_ids uuid[],
  p_system_ids uuid[] DEFAULT NULL, p_subsystem_ids uuid[] DEFAULT NULL, p_tag_ids uuid[] DEFAULT NULL,
  p_assign jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_org uuid; v_role text; r record; v_itr uuid; v_number text; v_required text[]; v_user uuid; v_key text;
  v_created int := 0; v_assigned jsonb := '{}'::jsonb; v_remaining int; v_entry jsonb; v_people uuid[];
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 500);
BEGIN
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT m.role::text INTO v_role FROM org_members m
  WHERE m.org_id = v_org AND m.user_id = auth.uid() AND m.status = 'active' AND (m.access_expires_at IS NULL OR m.access_expires_at > now());
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) OR COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores generan ITR en masa' USING ERRCODE = '42501';
  END IF;

  -- Asignación por disciplina: personas activas de la org, distintas por rol (D6), el ejecutor no es cliente.
  FOR v_key, v_entry IN SELECT * FROM jsonb_each(COALESCE(p_assign, '{}'::jsonb)) LOOP
    v_people := ARRAY(SELECT (v_entry ->> k)::uuid FROM unnest(ARRAY['executor', 'supervisor', 'client']) k WHERE v_entry ->> k IS NOT NULL);
    IF cardinality(v_people) <> (SELECT count(DISTINCT x) FROM unnest(v_people) x) THEN
      RAISE EXCEPTION 'Cada rol de firma lo asume una persona distinta' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_people) x WHERE NOT EXISTS (
      SELECT 1 FROM org_members m WHERE m.org_id = v_org AND m.user_id = x AND m.status = 'active'
        AND (m.access_expires_at IS NULL OR m.access_expires_at > now()))) THEN
      RAISE EXCEPTION 'Alguna persona elegida no es miembro activo de la organización' USING ERRCODE = '22023';
    END IF;
    IF v_entry ->> 'executor' IS NOT NULL AND EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = v_org
         AND m.user_id = (v_entry ->> 'executor')::uuid AND m.role = 'client') THEN
      RAISE EXCEPTION 'El cliente no puede ser el ejecutor del ITR' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Dos generaciones a la vez en el mismo proyecto no compiten por los mismos tags.
  PERFORM pg_advisory_xact_lock(hashtext('itr-generation:' || p_project_id::text));

  FOR r IN
    SELECT * FROM public.itr_generation_candidates(p_project_id, p_phase_ids, p_system_ids, p_subsystem_ids, p_tag_ids)
    WHERE outcome = 'create' ORDER BY subsystem_id, tag_number, template_code LIMIT v_limit
  LOOP
    INSERT INTO itrs (template_id, tag_id, subsystem_id, project_id, phase_id, itr_number, status, progress_pct)
    VALUES (r.template_id, r.tag_id, r.subsystem_id, p_project_id, r.phase_id, r.template_code || '/' || r.tag_number, 'not_started', 0)
    RETURNING id, itr_number, required_signatures INTO v_itr, v_number, v_required;
    v_created := v_created + 1;
    v_entry := p_assign -> COALESCE(r.discipline_id::text, 'none');
    IF v_entry IS NOT NULL THEN
      FOREACH v_key IN ARRAY COALESCE(v_required, '{}') LOOP
        v_user := (v_entry ->> v_key)::uuid;
        IF v_user IS NOT NULL THEN
          INSERT INTO itr_assignments (itr_id, user_id, role) VALUES (v_itr, v_user, v_key::signature_role);
          v_assigned := jsonb_set(v_assigned, ARRAY[v_user::text], to_jsonb(COALESCE((v_assigned ->> v_user::text)::int, 0) + 1));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_remaining
  FROM public.itr_generation_candidates(p_project_id, p_phase_ids, p_system_ids, p_subsystem_ids, p_tag_ids) WHERE outcome = 'create';

  IF v_created > 0 THEN
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
    VALUES (v_org, auth.uid(), 'project', p_project_id, 'itrs_generated',
            jsonb_build_object('created', v_created, 'phases', p_phase_ids, 'systems', p_system_ids, 'subsystems', p_subsystem_ids,
                               'tags', CASE WHEN p_tag_ids IS NULL THEN NULL ELSE cardinality(p_tag_ids) END, 'assigned', v_assigned));
  END IF;
  RETURN jsonb_build_object('created', v_created, 'remaining', v_remaining, 'assigned', v_assigned);
END;
$fn$;

REVOKE ALL ON FUNCTION public.itr_generation_candidates(uuid, uuid[], uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.itr_generation_summary(uuid, uuid[], uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_itrs(uuid, uuid[], uuid[], uuid[], uuid[], jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.itr_generation_candidates(uuid, uuid[], uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.itr_generation_summary(uuid, uuid[], uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_itrs(uuid, uuid[], uuid[], uuid[], uuid[], jsonb, integer) TO authenticated;

-- ── C-30: la lista de ITR filtra por sistema, área y responsable ─────────────
-- (columnas nuevas al final de la vista; security_invoker se mantiene)
CREATE OR REPLACE VIEW public.itr_list_v WITH (security_invoker = true) AS
 SELECT i.id, i.project_id, i.itr_number, i.status, i.progress_pct, i.scheduled_date, i.completed_date, i.created_at,
    i.tag_id, i.template_id, i.phase_id, i.subsystem_id,
    t.tag_number, t.description AS tag_description, tp.code AS template_code, tp.title AS template_title,
    d.code AS discipline_code, d.name AS discipline_name, d.color AS discipline_color,
    ph.code AS phase_code, ph.name AS phase_name, ph.color AS phase_color,
    p.org_id, p.name AS project_name, p.code AS project_code,
    ((((((((((i.itr_number || ' '::text) || COALESCE(t.tag_number, ''::text)) || ' '::text) || COALESCE(t.description, ''::text)) || ' '::text) || COALESCE(tp.code, ''::text)) || ' '::text) || COALESCE(tp.title, ''::text)) || ' '::text) || COALESCE(p.name, ''::text)) AS search_text,
    ss.system_id,
    sy.area_id,
    COALESCE((SELECT array_agg(a.user_id) FROM itr_assignments a WHERE a.itr_id = i.id), '{}'::uuid[]) AS assignee_ids
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
     LEFT JOIN tags t ON t.id = i.tag_id
     LEFT JOIN itr_templates tp ON tp.id = i.template_id
     LEFT JOIN disciplines d ON d.id = tp.discipline_id
     LEFT JOIN project_phases ph ON ph.id = i.phase_id
     LEFT JOIN subsystems ss ON ss.id = i.subsystem_id
     LEFT JOIN systems sy ON sy.id = ss.system_id;
