-- R1 (plan referente, maquetas M aprobadas 2026-10-22): disciplinas del proyecto.
--
-- Cada proyecto elige qué disciplinas entran en su alcance. Un tag recibe las plantillas de su tipo de equipo cuya
-- disciplina DE PLANTILLA está en el alcance (una bomba mecánica lleva el ITR eléctrico de su motor solo si
-- Eléctrica está). Por defecto, todas: relleno de los proyectos actuales (no cambia nada), un proyecto nuevo nace
-- con todas las de su org y una disciplina nueva de la org entra en todos sus proyectos.
--
-- Escritura SOLO por la RPC set_project_disciplines (Propietario, Administrador, Arquitecto). Quitar una disciplina
-- que ya tiene ITR exige motivo (≥ 10) y NUNCA borra ITR: quedan «fuera de alcance» en Calidad de datos
-- (categoría discipline_scope). Cada alta o baja queda en project_discipline_events con su motivo.
-- itr_generation_candidates marca los pares fuera del alcance con outcome 'out_of_scope' (no se generan) y la
-- vista previa los cuenta. Con todas las disciplinas el resultado es exactamente el de antes.

CREATE TABLE public.project_disciplines (
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  added_by      uuid,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, discipline_id)
);
CREATE INDEX project_disciplines_discipline_idx ON public.project_disciplines (discipline_id);

CREATE TABLE public.project_discipline_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('add', 'remove')),
  reason        text,
  itrs_affected integer NOT NULL DEFAULT 0,
  user_id       uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_discipline_events_project_idx ON public.project_discipline_events (project_id, created_at DESC);

ALTER TABLE public.project_disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_discipline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_disciplines_select ON public.project_disciplines FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY project_discipline_events_select ON public.project_discipline_events FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
REVOKE ALL ON public.project_disciplines, public.project_discipline_events FROM anon;
GRANT SELECT ON public.project_disciplines, public.project_discipline_events TO authenticated;
GRANT ALL ON public.project_disciplines, public.project_discipline_events TO service_role;

-- Relleno: hoy todos los proyectos llevan todas las disciplinas de su org.
INSERT INTO public.project_disciplines (project_id, discipline_id, org_id)
SELECT p.id, d.id, p.org_id FROM public.projects p JOIN public.disciplines d ON d.org_id = p.org_id
ON CONFLICT DO NOTHING;

-- Por defecto, todas: proyecto nuevo ← todas las de su org; disciplina nueva → todos los proyectos de la org.
CREATE OR REPLACE FUNCTION public.project_disciplines_on_project_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO project_disciplines (project_id, discipline_id, org_id)
  SELECT NEW.id, d.id, NEW.org_id FROM disciplines d WHERE d.org_id = NEW.org_id
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.project_disciplines_on_discipline_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO project_disciplines (project_id, discipline_id, org_id)
  SELECT p.id, NEW.id, NEW.org_id FROM projects p WHERE p.org_id = NEW.org_id
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.project_disciplines_on_project_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_disciplines_on_discipline_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER project_disciplines_on_project_insert AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_disciplines_on_project_insert();
CREATE TRIGGER project_disciplines_on_discipline_insert AFTER INSERT ON public.disciplines
  FOR EACH ROW EXECUTE FUNCTION public.project_disciplines_on_discipline_insert();

-- Candidatos: misma lógica de S19 + alcance de disciplinas (par fuera del alcance → 'out_of_scope').
CREATE OR REPLACE FUNCTION public.itr_generation_candidates(p_project_id uuid, p_phase_ids uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, tag_number text, subsystem_id uuid, equipment_type_id uuid, template_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, outcome text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    SELECT DISTINCT m.equipment_type_id, a.id AS template_id, a.code, a.title, a.discipline_id, a.phase_id,
           EXISTS (SELECT 1 FROM project_disciplines pd
                   WHERE pd.project_id = p_project_id AND pd.discipline_id = a.discipline_id) AS in_scope
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code
    JOIN org ON m.org_id = org.org_id
    WHERE m.status = 'accepted' AND a.phase_id = ANY (p_phase_ids)
  )
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, r.template_id, r.code, r.title, r.discipline_id, r.phase_id,
         CASE WHEN NOT r.in_scope THEN 'out_of_scope'
              WHEN s.subsystem_id IS NULL THEN 'no_subsystem'
              WHEN EXISTS (SELECT 1 FROM itrs i JOIN itr_templates it ON it.id = i.template_id
                           WHERE i.tag_id = s.id AND it.code = r.code) THEN 'exists'
              ELSE 'create' END
  FROM scope s JOIN rules r ON r.equipment_type_id = s.equipment_type_id
  UNION ALL
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, NULL, NULL, NULL, NULL, NULL,
         CASE WHEN s.equipment_type_id IS NULL THEN 'no_equipment_type' ELSE 'no_rule' END
  FROM scope s
  WHERE NOT EXISTS (SELECT 1 FROM rules r WHERE r.equipment_type_id = s.equipment_type_id);
$function$;

-- Vista previa: cuenta también lo que queda fuera del alcance.
CREATE OR REPLACE FUNCTION public.itr_generation_summary(p_project_id uuid, p_phase_ids uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    'out_of_scope', (SELECT count(*) FROM c WHERE outcome = 'out_of_scope'),
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
      'out_of_scope', COALESCE((SELECT jsonb_agg(template_code ORDER BY template_code) FROM (SELECT DISTINCT template_code FROM c WHERE outcome = 'out_of_scope' ORDER BY template_code LIMIT 20) s), '[]'),
      'no_subsystem', COALESCE((SELECT jsonb_agg(DISTINCT tag_number) FROM (SELECT tag_number FROM c WHERE outcome = 'no_subsystem' ORDER BY tag_number LIMIT 20) s), '[]'))
  ) INTO v;
  RETURN v;
END;
$function$;

-- Alcance con su impacto: por disciplina de la org, si está en el alcance, cuántos pares tag × plantilla pide la
-- matriz aceptada (todas las fases) y cuántos ITR existen ya con plantillas de esa disciplina.
CREATE OR REPLACE FUNCTION public.project_discipline_scope(p_project_id uuid)
 RETURNS TABLE(discipline_id uuid, code text, name text, color text, included boolean, requirements integer, itrs integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE v_org uuid; v_phases uuid[];
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = p_project_id;
  SELECT array_agg(ph.id) INTO v_phases FROM project_phases ph WHERE ph.org_id = v_org;

  RETURN QUERY
  WITH c AS (
    SELECT c.discipline_id, count(*)::int AS n
    FROM public.itr_generation_candidates(p_project_id, COALESCE(v_phases, '{}')) c
    WHERE c.discipline_id IS NOT NULL GROUP BY c.discipline_id
  ),
  i AS (
    SELECT tp.discipline_id, count(*)::int AS n
    FROM itrs it JOIN itr_templates tp ON tp.id = it.template_id
    WHERE it.project_id = p_project_id GROUP BY tp.discipline_id
  )
  SELECT d.id, d.code, d.name, d.color,
         EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = d.id),
         COALESCE(c.n, 0), COALESCE(i.n, 0)
  FROM disciplines d
  LEFT JOIN c ON c.discipline_id = d.id
  LEFT JOIN i ON i.discipline_id = d.id
  WHERE d.org_id = v_org
  ORDER BY d.code;
END;
$function$;

-- Única escritura del alcance. Devuelve lo que cambió y cuántos ITR quedaron fuera.
CREATE OR REPLACE FUNCTION public.set_project_disciplines(p_project_id uuid, p_discipline_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid; v_uid uuid := auth.uid();
  v_new uuid[]; v_added uuid[]; v_removed uuid[]; v_itrs integer := 0;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = '22023'; END IF;
  IF v_uid IS NULL OR NOT public.is_project_member(p_project_id) OR NOT public.is_org_privileged(v_org) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT d.id), '{}') INTO v_new
  FROM disciplines d WHERE d.org_id = v_org AND d.id = ANY (COALESCE(p_discipline_ids, '{}'));
  IF cardinality(v_new) <> (SELECT count(DISTINCT x) FROM unnest(COALESCE(p_discipline_ids, '{}')) x) THEN
    RAISE EXCEPTION 'discipline_not_in_org' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_new) = 0 THEN RAISE EXCEPTION 'scope_empty' USING ERRCODE = '22023'; END IF;

  SELECT COALESCE(array_agg(pd.discipline_id), '{}') INTO v_removed
  FROM project_disciplines pd WHERE pd.project_id = p_project_id AND NOT (pd.discipline_id = ANY (v_new));
  SELECT COALESCE(array_agg(x), '{}') INTO v_added
  FROM unnest(v_new) x WHERE NOT EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = x);

  IF cardinality(v_removed) > 0 THEN
    SELECT count(*) INTO v_itrs FROM itrs it JOIN itr_templates tp ON tp.id = it.template_id
    WHERE it.project_id = p_project_id AND tp.discipline_id = ANY (v_removed);
    IF v_itrs > 0 AND length(COALESCE(v_reason, '')) < 10 THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023', DETAIL = v_itrs::text;
    END IF;
  END IF;

  DELETE FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = ANY (v_removed);
  INSERT INTO project_disciplines (project_id, discipline_id, org_id, added_by)
  SELECT p_project_id, x, v_org, v_uid FROM unnest(v_added) x;

  INSERT INTO project_discipline_events (project_id, discipline_id, org_id, action, reason, itrs_affected, user_id)
  SELECT p_project_id, x, v_org, 'remove', v_reason,
         (SELECT count(*) FROM itrs it JOIN itr_templates tp ON tp.id = it.template_id
          WHERE it.project_id = p_project_id AND tp.discipline_id = x), v_uid
  FROM unnest(v_removed) x
  UNION ALL
  SELECT p_project_id, x, v_org, 'add', v_reason, 0, v_uid FROM unnest(v_added) x;

  RETURN jsonb_build_object('added', cardinality(v_added), 'removed', cardinality(v_removed), 'itrs_out_of_scope', v_itrs);
END;
$function$;

REVOKE ALL ON FUNCTION public.project_discipline_scope(p_project_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_discipline_scope(p_project_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_project_disciplines(p_project_id uuid, p_discipline_ids uuid[], p_reason text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_project_disciplines(p_project_id uuid, p_discipline_ids uuid[], p_reason text) TO authenticated, service_role;

-- Calidad de datos: ITR cuya plantilla es de una disciplina fuera del alcance (no se borran; se decide aquí).
CREATE OR REPLACE VIEW public.data_quality_issues WITH (security_invoker = on) AS
SELECT 'critical'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    'ITR aprobado sin firma de ejecutor'::text AS description,
    'Solicitar firma antes de validar aprobación'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.status = 'approved'::itr_status AND NOT (EXISTS ( SELECT 1
           FROM itr_signatures s
          WHERE s.itr_id = i.id AND s.role = 'executor'::signature_role))
UNION ALL
 SELECT 'warning'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    'ITR con progreso 100% pero status='::text || i.status AS description,
    'Revisar estado del ITR y avanzar a completed/approved'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.progress_pct >= 100::numeric AND (i.status <> ALL (ARRAY['approved'::itr_status, 'completed'::itr_status]))
UNION ALL
 SELECT 'error'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    ('ITR aprobado con progreso '::text || COALESCE(i.progress_pct, 0::numeric)) || '%'::text AS description,
    'Completar todos los items antes de aprobar, o revisar aprobación'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.status = 'approved'::itr_status AND COALESCE(i.progress_pct, 0::numeric) < 100::numeric
UNION ALL
 SELECT 'error'::text AS severity,
    'date_logic'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    ((('ITR con completed_date ('::text || i.completed_date) || ') anterior a created_at ('::text) || i.created_at::date) || ')'::text AS description,
    'Corregir fechas. Posible carga manual incorrecta.'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.completed_date IS NOT NULL AND i.completed_date < i.created_at::date
UNION ALL
 SELECT 'critical'::text AS severity,
    'punch_orphans'::text AS category,
    'punch'::text AS entity_type,
    pu.id AS entity_id,
    pu.punch_number AS entity_label,
    pu.project_id,
    pr.org_id,
    ('Punch Cat A '::text || pu.punch_number) || ' sin ejecutor asignado'::text AS description,
    'Asignar ejecutor responsable. Bloquea Mechanical Completion.'::text AS suggested_fix,
    (('/projects/'::text || pu.project_id) || '/punch-list/'::text) || pu.id AS fix_url
   FROM punches pu
     JOIN projects pr ON pr.id = pu.project_id
  WHERE pu.category = 'A'::punch_category AND (pu.status <> ALL (ARRAY['closed'::punch_status, 'cancelled'::punch_status])) AND pu.assigned_to IS NULL
UNION ALL
 SELECT 'error'::text AS severity,
    'date_logic'::text AS category,
    'punch'::text AS entity_type,
    pu.id AS entity_id,
    pu.punch_number AS entity_label,
    pu.project_id,
    pr.org_id,
    ('Punch '::text || pu.punch_number) || ' con closed_date anterior a creación'::text AS description,
    'Corregir fechas del punch'::text AS suggested_fix,
    (('/projects/'::text || pu.project_id) || '/punch-list/'::text) || pu.id AS fix_url
   FROM punches pu
     JOIN projects pr ON pr.id = pu.project_id
  WHERE pu.closed_date IS NOT NULL AND pu.closed_date < pu.created_at::date
UNION ALL
 SELECT 'warning'::text AS severity,
    'loop_coverage'::text AS category,
    'loop'::text AS entity_type,
    l.id AS entity_id,
    l.loop_number AS entity_label,
    l.project_id,
    pr.org_id,
    ('Loop '::text || l.loop_number) || ' sin instrumentos asignados'::text AS description,
    'Vincular tags al loop desde el módulo de Loops'::text AS suggested_fix,
    (('/projects/'::text || l.project_id) || '/loops/'::text) || l.id AS fix_url
   FROM loops l
     JOIN projects pr ON pr.id = l.project_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM loop_tags lt
          WHERE lt.loop_id = l.id))
UNION ALL
 SELECT 'critical'::text AS severity,
    'certificate_prereqs'::text AS category,
    'certificate'::text AS entity_type,
    c.id AS entity_id,
    c.certificate_number AS entity_label,
    c.project_id,
    pr.org_id,
    ('Certificado '::text || c.certificate_number) || ' emitido con Cat A abiertos'::text AS description,
    'Revisar y cerrar punches Cat A, o registrar excepción formal'::text AS suggested_fix,
    (('/projects/'::text || c.project_id) || '/certificates/'::text) || c.id AS fix_url
   FROM certificates c
     JOIN projects pr ON pr.id = c.project_id
  WHERE c.status = 'issued'::certificate_status AND c.subsystem_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM punches pu
          WHERE pu.subsystem_id = c.subsystem_id AND pu.category = 'A'::punch_category AND (pu.status <> ALL (ARRAY['closed'::punch_status, 'cancelled'::punch_status])) AND NOT (EXISTS ( SELECT 1
                   FROM certificate_punch_exceptions cpe
                  WHERE cpe.certificate_id = c.id AND cpe.punch_id = pu.id))))
UNION ALL
 SELECT 'warning'::text AS severity,
    'system_completeness'::text AS category,
    'subsystem'::text AS entity_type,
    s.id AS entity_id,
    s.code AS entity_label,
    s.project_id,
    pr.org_id,
    ('Subsistema '::text || s.code) || ' tiene tags pero 0 ITRs'::text AS description,
    'Generar o asignar ITRs desde templates para cubrir los tags'::text AS suggested_fix,
    (('/projects/'::text || s.project_id) || '/explorer?subsystem='::text) || s.id AS fix_url
   FROM subsystems s
     JOIN projects pr ON pr.id = s.project_id
  WHERE (EXISTS ( SELECT 1
           FROM tags t
          WHERE t.subsystem_id = s.id)) AND NOT (EXISTS ( SELECT 1
           FROM itrs i
          WHERE i.subsystem_id = s.id))
UNION ALL
 SELECT 'warning'::text AS severity,
    'system_completeness'::text AS category,
    'signal'::text AS entity_type,
    sg.id AS entity_id,
    sg.signal_tag AS entity_label,
    t.project_id,
    pr.org_id,
    ('Señal '::text || sg.signal_tag) || ' sin loop asignado'::text AS description,
    'Vincular la señal a un loop o marcar como independiente'::text AS suggested_fix,
    (('/projects/'::text || t.project_id) || '/tags/'::text) || sg.tag_id AS fix_url
   FROM signals sg
     JOIN tags t ON t.id = sg.tag_id
     JOIN projects pr ON pr.id = t.project_id
  WHERE sg.loop_id IS NULL
UNION ALL
 SELECT 'warning'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    pr.org_id,
    ((('ITR '::text || i.itr_number) || ' rechazado '::text) || cnt.n) || ' veces (posible problema sistemático)'::text AS description,
    'Revisar causa raíz: alcance, capacitación o procedimiento'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects pr ON pr.id = i.project_id
     JOIN ( SELECT ((de.payload -> 'new'::text) ->> 'id'::text)::uuid AS itr_id,
            count(*) AS n
           FROM domain_events de
          WHERE de.aggregate_type = 'itrs'::text AND de.event_type = 'itrs.updated'::text AND ((de.payload -> 'new'::text) ->> 'status'::text) = 'rejected'::text
          GROUP BY (((de.payload -> 'new'::text) ->> 'id'::text)::uuid)
         HAVING count(*) >= 3) cnt ON cnt.itr_id = i.id
UNION ALL
 SELECT 'warning'::text AS severity,
    'pid_coverage'::text AS category,
    'tag'::text AS entity_type,
    t.id AS entity_id,
    t.tag_number AS entity_label,
    t.project_id,
    pr.org_id,
    ((('El tag cita el plano '::text || d.number) || ' (rev '::text) || r.rev) || ') pero no tiene pin en la revisión vigente'::text AS description,
    'Ubicar el tag en el plano con un pin'::text AS suggested_fix,
    (((('/projects/'::text || t.project_id) || '/documents/'::text) || d.id) || '/viewer?tag='::text) || t.id AS fix_url
   FROM tags t
     JOIN projects pr ON pr.id = t.project_id
     JOIN documents d ON d.project_id = t.project_id AND d.doc_type = 'pid'::text AND d.current_revision_id IS NOT NULL AND d.number = upper(btrim(regexp_replace(t.pid_drawing, '\s+'::text, ' '::text, 'g'::text)))
     JOIN document_revisions r ON r.id = d.current_revision_id
  WHERE t.pid_drawing IS NOT NULL AND r.file_path IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM pid_hotspots h
          WHERE h.revision_id = d.current_revision_id AND h.tag_id = t.id))
UNION ALL
 SELECT 'warning'::text AS severity,
    'discipline_scope'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    pr.org_id,
    ((('ITR de '::text || d.code) || ' ('::text) || d.name) || '), disciplina fuera del alcance del proyecto'::text AS description,
    'Volver a incluir la disciplina en el alcance o cancelar el ITR'::text AS suggested_fix,
    ('/projects/'::text || i.project_id) || '/scope'::text AS fix_url
   FROM itrs i
     JOIN projects pr ON pr.id = i.project_id
     JOIN itr_templates tp ON tp.id = i.template_id
     JOIN disciplines d ON d.id = tp.discipline_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM project_disciplines pd
          WHERE pd.project_id = i.project_id AND pd.discipline_id = tp.discipline_id));
