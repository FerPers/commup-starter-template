-- R2a (plan referente, maquetas M aprobadas 2026-10-22): registro «Requisitos ITR» por tag.
--
-- Principio del plan: el requisito base se CALCULA (matriz aceptada del tipo del tag, filtrada por las disciplinas
-- del proyecto, R1). Solo se GUARDAN las excepciones por tag y código de plantilla (tag_itr_overrides: agregar o
-- excluir, a mano; la IA de R4 propondrá con source = 'ai'), decididas por una persona (Líder en adelante; excluir
-- con motivo ≥ 10; agregar solo dentro del alcance). La identidad de la plantilla es su código (las revisiones
-- cambian el id).
--
-- itr_generation_candidates pasa a ser el motor de requisitos: base de la matriz + agregados, con `origin`
-- (matrix | manual) y outcome 'excluded' para lo excluido. Sin excepciones da exactamente lo de antes.
-- tag_itr_requirements = estado de cada requisito (missing · generated · in_progress · approved · excluded) más los
-- ITR que existen fuera de los requisitos ('outside'); tag_requirements_page = página del registro con filtros;
-- tag_requirements_summary = totales, por subsistema y por disciplina. Los ITR fuera de requisitos nunca se
-- borran: Calidad de datos los muestra (categoría requirements_outside).

CREATE TABLE public.tag_itr_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tag_id        uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  action        text NOT NULL CHECK (action IN ('add', 'exclude')),
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  reason        text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, template_code),
  CHECK (action <> 'exclude' OR length(btrim(COALESCE(reason, ''))) >= 10)
);
CREATE INDEX tag_itr_overrides_project_idx ON public.tag_itr_overrides (project_id);

ALTER TABLE public.tag_itr_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY tag_itr_overrides_select ON public.tag_itr_overrides FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
REVOKE ALL ON public.tag_itr_overrides FROM anon;
GRANT SELECT ON public.tag_itr_overrides TO authenticated;
GRANT ALL ON public.tag_itr_overrides TO service_role;

-- Motor: base de la matriz aceptada + agregados − excluidos, con alcance de disciplinas (R1).
DROP FUNCTION public.itr_generation_candidates(uuid, uuid[], uuid[], uuid[], uuid[]);
CREATE FUNCTION public.itr_generation_candidates(p_project_id uuid, p_phase_ids uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, tag_number text, subsystem_id uuid, equipment_type_id uuid, template_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, outcome text, origin text)
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
    SELECT DISTINCT ON (tp.code) tp.id, tp.code, tp.title, tp.discipline_id, tp.phase_id,
           EXISTS (SELECT 1 FROM project_disciplines pd
                   WHERE pd.project_id = p_project_id AND pd.discipline_id = tp.discipline_id) AS in_scope
    FROM itr_templates tp, org
    WHERE tp.org_id = org.org_id AND tp.is_active
      AND NOT EXISTS (SELECT 1 FROM itr_template_items i
                      WHERE i.template_id = tp.id AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source')
    ORDER BY tp.code, tp.version DESC, tp.created_at DESC
  ),
  rules AS (
    SELECT DISTINCT m.equipment_type_id, a.id AS template_id, a.code, a.title, a.discipline_id, a.phase_id, a.in_scope
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code
    JOIN org ON m.org_id = org.org_id
    WHERE m.status = 'accepted' AND a.phase_id = ANY (p_phase_ids)
  ),
  ov AS (
    SELECT o.tag_id, o.template_code, o.action FROM tag_itr_overrides o
    WHERE o.project_id = p_project_id AND (p_tag_ids IS NULL OR o.tag_id = ANY (p_tag_ids))
  ),
  pairs AS (
    SELECT s.id AS tag_id, r.template_id, r.code, r.title, r.discipline_id, r.phase_id, r.in_scope, 'matrix'::text AS origin
    FROM scope s JOIN rules r ON r.equipment_type_id = s.equipment_type_id
    UNION ALL
    SELECT s.id, a.id, a.code, a.title, a.discipline_id, a.phase_id, a.in_scope, 'manual'::text
    FROM scope s JOIN ov ON ov.tag_id = s.id AND ov.action = 'add'
    JOIN active a ON a.code = ov.template_code AND a.phase_id = ANY (p_phase_ids)
    WHERE NOT EXISTS (SELECT 1 FROM rules r WHERE r.equipment_type_id = s.equipment_type_id AND r.code = a.code)
  )
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, p.template_id, p.code, p.title, p.discipline_id, p.phase_id,
         CASE WHEN EXISTS (SELECT 1 FROM ov WHERE ov.tag_id = s.id AND ov.template_code = p.code AND ov.action = 'exclude') THEN 'excluded'
              WHEN NOT p.in_scope THEN 'out_of_scope'
              WHEN s.subsystem_id IS NULL THEN 'no_subsystem'
              WHEN EXISTS (SELECT 1 FROM itrs i JOIN itr_templates it ON it.id = i.template_id
                           WHERE i.tag_id = s.id AND it.code = p.code) THEN 'exists'
              ELSE 'create' END,
         p.origin
  FROM scope s JOIN pairs p ON p.tag_id = s.id
  UNION ALL
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, NULL, NULL, NULL, NULL, NULL,
         CASE WHEN s.equipment_type_id IS NULL THEN 'no_equipment_type' ELSE 'no_rule' END, NULL
  FROM scope s
  WHERE NOT EXISTS (SELECT 1 FROM pairs p WHERE p.tag_id = s.id);
$function$;

-- Vista previa de la generación: también cuenta lo excluido a mano.
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
    'excluded', (SELECT count(*) FROM c WHERE outcome = 'excluded'),
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

-- Estado de cada requisito (todas las fases) + ITR que existen fuera de los requisitos.
CREATE OR REPLACE FUNCTION public.tag_itr_requirements(p_project_id uuid, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, origin text, state text, itr_id uuid, itr_status text, reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE v_phases uuid[];
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT array_agg(ph.id) INTO v_phases FROM project_phases ph JOIN projects p ON p.org_id = ph.org_id WHERE p.id = p_project_id;

  RETURN QUERY
  WITH c AS (
    SELECT * FROM public.itr_generation_candidates(p_project_id, COALESCE(v_phases, '{}'), p_system_ids, p_subsystem_ids, p_tag_ids) c
    WHERE c.template_code IS NOT NULL AND c.outcome <> 'out_of_scope'
  ),
  scoped AS (
    SELECT t.id AS tag_id FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id
    WHERE t.project_id = p_project_id
      AND (p_tag_ids IS NULL OR t.id = ANY (p_tag_ids))
      AND (p_subsystem_ids IS NULL OR t.subsystem_id = ANY (p_subsystem_ids))
      AND (p_system_ids IS NULL OR s.system_id = ANY (p_system_ids))
  ),
  itr AS (  -- el mejor ITR de cada tag × código: aprobado > en curso > generado
    SELECT DISTINCT ON (i.tag_id, tp.code) i.tag_id, tp.code, i.id, i.status::text AS status, tp.title, tp.discipline_id, tp.phase_id,
           EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = tp.discipline_id) AS in_scope
    FROM itrs i JOIN itr_templates tp ON tp.id = i.template_id JOIN scoped ON scoped.tag_id = i.tag_id
    WHERE i.project_id = p_project_id
    ORDER BY i.tag_id, tp.code,
             CASE i.status WHEN 'approved' THEN 0 WHEN 'completed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END, i.created_at
  ),
  ov AS (SELECT o.tag_id, o.template_code, o.reason FROM tag_itr_overrides o WHERE o.project_id = p_project_id)
  SELECT c.tag_id, c.template_code, c.template_title, c.discipline_id, c.phase_id, c.origin,
         CASE WHEN c.outcome = 'excluded' THEN 'excluded'
              WHEN itr.id IS NULL THEN 'missing'
              WHEN itr.status = 'approved' THEN 'approved'
              WHEN itr.status = 'not_started' THEN 'generated'
              ELSE 'in_progress' END,
         itr.id, itr.status, ov.reason
  FROM c
  LEFT JOIN itr ON itr.tag_id = c.tag_id AND itr.code = c.template_code
  LEFT JOIN ov ON ov.tag_id = c.tag_id AND ov.template_code = c.template_code
  UNION ALL
  SELECT itr.tag_id, itr.code, itr.title, itr.discipline_id, itr.phase_id, NULL, 'outside', itr.id, itr.status, NULL
  FROM itr
  WHERE itr.in_scope AND NOT EXISTS (SELECT 1 FROM c WHERE c.tag_id = itr.tag_id AND c.template_code = itr.code);
END;
$function$;

-- Página del registro: tags del nodo elegido con sus requisitos, filtro y búsqueda (50 por página).
CREATE OR REPLACE FUNCTION public.tag_requirements_page(p_project_id uuid, p_filter text DEFAULT 'all', p_area_id uuid DEFAULT NULL, p_system_id uuid DEFAULT NULL, p_subsystem_id uuid DEFAULT NULL, p_q text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_systems uuid[]; v_q text := NULLIF(upper(btrim(COALESCE(p_q, ''))), '');
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_area_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_systems FROM systems s WHERE s.project_id = p_project_id AND s.area_id = p_area_id;
  ELSIF p_system_id IS NOT NULL THEN
    v_systems := ARRAY[p_system_id];
  END IF;

  WITH t AS (
    SELECT t.id, t.tag_number, t.description, t.equipment_type_id, et.code AS type_code
    FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id LEFT JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE t.project_id = p_project_id
      AND (v_systems IS NULL OR s.system_id = ANY (v_systems))
      AND (p_subsystem_id IS NULL OR t.subsystem_id = p_subsystem_id)
      AND (v_q IS NULL OR upper(t.tag_number) LIKE '%' || v_q || '%' OR upper(COALESCE(t.description, '')) LIKE '%' || v_q || '%')
  ),
  r AS (
    SELECT * FROM public.tag_itr_requirements(p_project_id, NULL, v_systems,
      CASE WHEN p_subsystem_id IS NULL THEN NULL ELSE ARRAY[p_subsystem_id] END) r
    WHERE r.tag_id IN (SELECT id FROM t)
  ),
  agg AS (
    SELECT t.id, t.tag_number, t.description, t.type_code, t.equipment_type_id,
           COUNT(r.template_code) AS n,
           COUNT(*) FILTER (WHERE r.state = 'missing') AS missing,
           COUNT(*) FILTER (WHERE r.state = 'excluded') AS excluded,
           COUNT(*) FILTER (WHERE r.state = 'outside') AS outside
    FROM t LEFT JOIN r ON r.tag_id = t.id
    GROUP BY t.id, t.tag_number, t.description, t.type_code, t.equipment_type_id
  ),
  f AS (
    SELECT * FROM agg WHERE CASE COALESCE(p_filter, 'all')
      WHEN 'missing' THEN missing > 0
      WHEN 'notype' THEN equipment_type_id IS NULL
      WHEN 'norule' THEN equipment_type_id IS NOT NULL AND n = 0
      WHEN 'excluded' THEN excluded > 0
      WHEN 'outside' THEN outside > 0
      ELSE true END
  ),
  pg AS (SELECT * FROM f ORDER BY tag_number LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(p_offset, 0), 0))
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'tag_id', pg.id, 'tag_number', pg.tag_number, 'description', pg.description, 'type_code', pg.type_code,
        'has_type', pg.equipment_type_id IS NOT NULL,
        'reqs', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', r.template_code, 'title', r.template_title, 'state', r.state,
                            'origin', r.origin, 'itr_id', r.itr_id, 'phase', ph.code, 'reason', r.reason)
                          ORDER BY ph.order_index NULLS LAST, r.template_code)
                          FROM r LEFT JOIN project_phases ph ON ph.id = r.phase_id WHERE r.tag_id = pg.id), '[]'::jsonb))
      ORDER BY pg.tag_number) FROM pg), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;

-- Totales del registro: generales, por subsistema (árbol) y por disciplina (Portafolio), y reglas por revisar.
CREATE OR REPLACE FUNCTION public.tag_requirements_summary(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_org uuid;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;

  WITH r AS (SELECT * FROM public.tag_itr_requirements(p_project_id)),
  req AS (SELECT * FROM r WHERE r.state NOT IN ('excluded', 'outside')),
  tg AS (
    SELECT t.id, t.subsystem_id, t.equipment_type_id FROM tags t WHERE t.project_id = p_project_id
  )
  SELECT jsonb_build_object(
    'required', (SELECT count(*) FROM req),
    'generated', (SELECT count(*) FROM req WHERE state <> 'missing'),
    'in_progress', (SELECT count(*) FROM req WHERE state = 'in_progress'),
    'approved', (SELECT count(*) FROM req WHERE state = 'approved'),
    'missing', (SELECT count(*) FROM req WHERE state = 'missing'),
    'excluded', (SELECT count(*) FROM r WHERE state = 'excluded'),
    'outside', (SELECT count(*) FROM r WHERE state = 'outside'),
    'tags', (SELECT count(*) FROM tg),
    'tags_no_type', (SELECT count(*) FROM tg WHERE equipment_type_id IS NULL),
    'tags_no_rule', (SELECT count(*) FROM tg WHERE equipment_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM r WHERE r.tag_id = tg.id AND r.state <> 'outside')),
    'proposed_rules', (SELECT count(*) FROM equipment_type_templates m WHERE m.org_id = v_org AND m.status = 'proposed'),
    'by_subsystem', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('subsystem_id', x.subsystem_id, 'required', x.required, 'missing', x.missing))
      FROM (SELECT tg.subsystem_id, count(req.*) AS required, count(*) FILTER (WHERE req.state = 'missing') AS missing
            FROM req JOIN tg ON tg.id = req.tag_id GROUP BY tg.subsystem_id) x), '[]'::jsonb),
    'by_discipline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('discipline_id', x.discipline_id, 'code', d.code, 'name', d.name, 'color', d.color,
                                          'required', x.required, 'generated', x.generated, 'approved', x.approved, 'missing', x.missing) ORDER BY d.code)
      FROM (SELECT req.discipline_id, count(*) AS required, count(*) FILTER (WHERE state <> 'missing') AS generated,
                   count(*) FILTER (WHERE state = 'approved') AS approved, count(*) FILTER (WHERE state = 'missing') AS missing
            FROM req GROUP BY req.discipline_id) x LEFT JOIN disciplines d ON d.id = x.discipline_id), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;

-- Única escritura de las excepciones: agregar (dentro del alcance), excluir (motivo ≥ 10) o quitar la excepción.
CREATE OR REPLACE FUNCTION public.set_tag_itr_override(p_tag_id uuid, p_template_code text, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; v_role text; v_code text := upper(btrim(COALESCE(p_template_code, '')));
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), ''); v_disc uuid;
BEGIN
  SELECT t.project_id, p.org_id INTO v_project, v_org FROM tags t JOIN projects p ON p.id = t.project_id WHERE t.id = p_tag_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'tag_not_found' USING ERRCODE = '22023'; END IF;
  SELECT m.role::text INTO v_role FROM org_members m
  WHERE m.org_id = v_org AND m.user_id = auth.uid() AND m.status = 'active' AND (m.access_expires_at IS NULL OR m.access_expires_at > now());
  IF auth.uid() IS NULL OR NOT public.is_project_member(v_project) OR COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('add', 'exclude', 'clear') OR v_code = '' THEN RAISE EXCEPTION 'invalid_override' USING ERRCODE = '22023'; END IF;

  IF p_action = 'clear' THEN
    DELETE FROM tag_itr_overrides WHERE tag_id = p_tag_id AND template_code = v_code;
    RETURN;
  END IF;

  SELECT tp.discipline_id INTO v_disc FROM itr_templates tp
  WHERE tp.org_id = v_org AND tp.is_active AND upper(tp.code) = v_code
  ORDER BY tp.version DESC, tp.created_at DESC LIMIT 1;
  IF v_disc IS NULL THEN RAISE EXCEPTION 'template_not_found' USING ERRCODE = '22023'; END IF;

  IF p_action = 'exclude' AND length(COALESCE(v_reason, '')) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'add' AND NOT EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = v_project AND pd.discipline_id = v_disc) THEN
    RAISE EXCEPTION 'out_of_scope' USING ERRCODE = '22023';
  END IF;

  INSERT INTO tag_itr_overrides (org_id, project_id, tag_id, template_code, action, source, reason, created_by)
  VALUES (v_org, v_project, p_tag_id, v_code, p_action, 'manual', v_reason, auth.uid())
  ON CONFLICT (tag_id, template_code) DO UPDATE
    SET action = EXCLUDED.action, source = 'manual', reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.itr_generation_candidates(uuid, uuid[], uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.itr_generation_candidates(uuid, uuid[], uuid[], uuid[], uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_itr_requirements(uuid, uuid[], uuid[], uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_itr_requirements(uuid, uuid[], uuid[], uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_page(uuid, text, uuid, uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_requirements_page(uuid, text, uuid, uuid, uuid, text, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_summary(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_requirements_summary(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_tag_itr_override(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tag_itr_override(uuid, text, text, text) TO authenticated, service_role;

-- Calidad de datos: ITR fuera de los requisitos del tag (excluido a mano o sin regla) dentro del alcance.
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
          WHERE pd.project_id = i.project_id AND pd.discipline_id = tp.discipline_id))
UNION ALL
 SELECT 'warning'::text AS severity,
    'requirements_outside'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    pr.org_id,
    CASE WHEN o.action = 'exclude' THEN ('ITR de '::text || tp.code) || ' excluido de los requisitos del tag'::text
         ELSE ('ITR de '::text || tp.code) || ' que la matriz aceptada no pide para el tipo del tag'::text END AS description,
    'Revisar el requisito del tag: agregarlo, aceptar la regla en la matriz o cancelar el ITR'::text AS suggested_fix,
    (((('/projects/'::text || i.project_id) || '/tags/'::text) || i.tag_id) || '?tab=itrs'::text) AS fix_url
   FROM itrs i
     JOIN projects pr ON pr.id = i.project_id
     JOIN tags t ON t.id = i.tag_id
     JOIN itr_templates tp ON tp.id = i.template_id
     JOIN project_disciplines pd ON pd.project_id = i.project_id AND pd.discipline_id = tp.discipline_id
     LEFT JOIN tag_itr_overrides o ON o.tag_id = i.tag_id AND o.template_code = tp.code
  WHERE COALESCE(o.action, '') <> 'add' AND (o.action = 'exclude' OR NOT (EXISTS ( SELECT 1
           FROM equipment_type_templates m
             JOIN itr_templates mt ON mt.id = m.itr_template_id
          WHERE m.org_id = pr.org_id AND m.status = 'accepted' AND m.equipment_type_id = t.equipment_type_id AND mt.code = tp.code)));
