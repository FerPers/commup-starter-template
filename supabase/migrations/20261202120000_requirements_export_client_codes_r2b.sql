-- R2b (plan referente, maquetas M aprobadas 2026-10-22): código del cliente por plantilla y Excel del registro.
--
-- Código del cliente: cada formato tiene el número del operador (p. ej. ECP-GTD-F-132) además del código CommUp.
-- Decisión M: por proyecto, con defecto de la org. template_client_codes guarda ambos niveles por CÓDIGO de
-- plantilla (las revisiones cambian el id): project_id NULL = defecto de la org; con project_id = el del proyecto,
-- que gana. Lectura = template_client_codes_for(proyecto); escritura SOLO por la RPC set_template_client_codes
-- (Propietario, Administrador, Arquitecto, como las plantillas). Sale en el registro, el Excel, el PDF del ITR y el
-- dossier.
--
-- Excel del registro: tag_requirements_export arma en una consulta las tres vistas de la matriz de certificación
-- (reporte gerencial por disciplina · resumen sistema × subsistema × disciplina × etapa · detalle por elemento) para
-- el proyecto o un nodo del árbol. El detalle tiene tope (por defecto 20.000 filas, máx. 50.000) para que el Worker
-- arme el libro; los resúmenes van siempre completos.

CREATE TABLE public.template_client_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  template_code text NOT NULL CHECK (template_code <> '' AND template_code = upper(btrim(template_code))),
  client_code   text NOT NULL CHECK (length(btrim(client_code)) BETWEEN 1 AND 60),
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX template_client_codes_org_uq ON public.template_client_codes (org_id, template_code) WHERE project_id IS NULL;
CREATE UNIQUE INDEX template_client_codes_project_uq ON public.template_client_codes (project_id, template_code) WHERE project_id IS NOT NULL;

ALTER TABLE public.template_client_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_client_codes_select ON public.template_client_codes FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_my_org_ids()) AND (project_id IS NULL OR public.is_project_member(project_id)));
REVOKE ALL ON public.template_client_codes FROM anon;
GRANT SELECT ON public.template_client_codes TO authenticated;
GRANT ALL ON public.template_client_codes TO service_role;

CREATE OR REPLACE FUNCTION public.template_client_codes_for(p_project_id uuid)
 RETURNS TABLE(template_code text, client_code text, source text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- El del proyecto gana sobre el defecto de la org (project_id IS NULL ordena después).
  SELECT DISTINCT ON (c.template_code) c.template_code, c.client_code,
         CASE WHEN c.project_id IS NULL THEN 'org' ELSE 'project' END
  FROM template_client_codes c JOIN projects p ON p.org_id = c.org_id
  WHERE p.id = p_project_id AND (c.project_id IS NULL OR c.project_id = p_project_id)
  ORDER BY c.template_code, (c.project_id IS NULL);
$function$;

CREATE OR REPLACE FUNCTION public.set_template_client_codes(p_project_id uuid, p_level text, p_codes jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_n int := 0; v_rows int; e record; v_code text; v_val text;
BEGIN
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL OR auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) OR NOT public.is_org_privileged(v_org) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_level NOT IN ('org', 'project') OR jsonb_typeof(p_codes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_client_codes' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_codes)) > 1000 THEN RAISE EXCEPTION 'invalid_client_codes' USING ERRCODE = '22023'; END IF;

  FOR e IN SELECT key, value FROM jsonb_each(p_codes) LOOP
    v_code := upper(btrim(e.key));
    v_val := CASE WHEN jsonb_typeof(e.value) = 'string' THEN NULLIF(btrim(e.value #>> '{}'), '') END;
    IF v_code = '' OR NOT EXISTS (SELECT 1 FROM itr_templates tp WHERE tp.org_id = v_org AND upper(tp.code) = v_code) THEN
      RAISE EXCEPTION 'template_not_found' USING ERRCODE = '22023';
    END IF;
    IF length(COALESCE(v_val, '')) > 60 THEN RAISE EXCEPTION 'client_code_too_long' USING ERRCODE = '22023'; END IF;

    IF v_val IS NULL THEN
      DELETE FROM template_client_codes c WHERE c.org_id = v_org AND c.template_code = v_code
        AND CASE WHEN p_level = 'org' THEN c.project_id IS NULL ELSE c.project_id = p_project_id END;
    ELSIF p_level = 'org' THEN
      INSERT INTO template_client_codes (org_id, project_id, template_code, client_code, updated_by)
      VALUES (v_org, NULL, v_code, v_val, auth.uid())
      ON CONFLICT (org_id, template_code) WHERE project_id IS NULL DO UPDATE
        SET client_code = EXCLUDED.client_code, updated_by = EXCLUDED.updated_by, updated_at = now()
        WHERE template_client_codes.client_code IS DISTINCT FROM EXCLUDED.client_code;
    ELSE
      INSERT INTO template_client_codes (org_id, project_id, template_code, client_code, updated_by)
      VALUES (v_org, p_project_id, v_code, v_val, auth.uid())
      ON CONFLICT (project_id, template_code) WHERE project_id IS NOT NULL DO UPDATE
        SET client_code = EXCLUDED.client_code, updated_by = EXCLUDED.updated_by, updated_at = now()
        WHERE template_client_codes.client_code IS DISTINCT FROM EXCLUDED.client_code;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_n := v_n + v_rows;
  END LOOP;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_page(p_project_id uuid, p_filter text DEFAULT 'all'::text, p_area_id uuid DEFAULT NULL::uuid, p_system_id uuid DEFAULT NULL::uuid, p_subsystem_id uuid DEFAULT NULL::uuid, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
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
  cc AS (SELECT * FROM public.template_client_codes_for(p_project_id)),
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
                            'origin', r.origin, 'itr_id', r.itr_id, 'phase', ph.code, 'reason', r.reason, 'client_code', cc.client_code)
                          ORDER BY ph.order_index NULLS LAST, r.template_code)
                          FROM r LEFT JOIN project_phases ph ON ph.id = r.phase_id LEFT JOIN cc ON cc.template_code = upper(r.template_code)
                          WHERE r.tag_id = pg.id), '[]'::jsonb))
      ORDER BY pg.tag_number) FROM pg), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_export(p_project_id uuid, p_area_id uuid DEFAULT NULL::uuid, p_system_id uuid DEFAULT NULL::uuid, p_subsystem_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_org uuid; v_systems uuid[]; v_subs uuid[]; v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20000), 1), 50000);
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_area_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_systems FROM systems s WHERE s.project_id = p_project_id AND s.area_id = p_area_id;
  ELSIF p_system_id IS NOT NULL THEN
    v_systems := ARRAY[p_system_id];
  END IF;
  IF p_subsystem_id IS NOT NULL THEN v_subs := ARRAY[p_subsystem_id]; END IF;

  WITH r AS MATERIALIZED (SELECT * FROM public.tag_itr_requirements(p_project_id, NULL, v_systems, v_subs)),
  tg AS MATERIALIZED (
    SELECT t.id, t.tag_number, t.description, t.equipment_type_id, et.code AS type_code, t.subsystem_id,
           ar.code AS area_code, sy.code AS system_code, sy.name AS system_name, sb.code AS subsystem_code, sb.name AS subsystem_name
    FROM tags t
    LEFT JOIN subsystems sb ON sb.id = t.subsystem_id
    LEFT JOIN systems sy ON sy.id = sb.system_id
    LEFT JOIN areas ar ON ar.id = sy.area_id
    LEFT JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE t.project_id = p_project_id
      AND (v_systems IS NULL OR sb.system_id = ANY (v_systems))
      AND (v_subs IS NULL OR t.subsystem_id = ANY (v_subs))
  ),
  cc AS (SELECT * FROM public.template_client_codes_for(p_project_id)),
  req AS (SELECT * FROM r WHERE r.state NOT IN ('excluded', 'outside')),
  bare AS (  -- tags sin requisitos: sin tipo o sin regla (los que solo tienen ITR fuera de requisitos cuentan como sin regla)
    SELECT tg.* FROM tg WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.tag_id = tg.id AND r.state <> 'outside')
  ),
  det AS (
    SELECT tg.tag_number, ph.order_index, r.template_code AS code,
           jsonb_build_array(tg.area_code, tg.system_code, tg.subsystem_code, tg.tag_number, tg.description, tg.type_code,
                             d.code, ph.code, r.template_code, cc.client_code, r.template_title, r.state, r.origin, i.itr_number, r.reason) AS row
    FROM r JOIN tg ON tg.id = r.tag_id
    LEFT JOIN disciplines d ON d.id = r.discipline_id
    LEFT JOIN project_phases ph ON ph.id = r.phase_id
    LEFT JOIN cc ON cc.template_code = upper(r.template_code)
    LEFT JOIN itrs i ON i.id = r.itr_id
    UNION ALL
    SELECT b.tag_number, NULL, NULL,
           jsonb_build_array(b.area_code, b.system_code, b.subsystem_code, b.tag_number, b.description, b.type_code,
                             NULL, NULL, NULL, NULL, NULL, CASE WHEN b.equipment_type_id IS NULL THEN 'no_type' ELSE 'no_rule' END, NULL, NULL, NULL)
    FROM bare b
  )
  SELECT jsonb_build_object(
    'tags', (SELECT count(*) FROM tg),
    'tags_no_type', (SELECT count(*) FROM bare WHERE equipment_type_id IS NULL),
    'tags_no_rule', (SELECT count(*) FROM bare WHERE equipment_type_id IS NOT NULL),
    'proposed_rules', (SELECT count(*) FROM equipment_type_templates m WHERE m.org_id = v_org AND m.status = 'proposed'),
    'by_discipline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'required', x.required, 'generated', x.generated,
                                          'in_progress', x.in_progress, 'approved', x.approved, 'missing', x.missing,
                                          'excluded', x.excluded, 'outside', x.outside) ORDER BY d.code NULLS LAST)
      FROM (SELECT r.discipline_id,
                   count(*) FILTER (WHERE r.state NOT IN ('excluded', 'outside')) AS required,
                   count(*) FILTER (WHERE r.state IN ('generated', 'in_progress', 'approved')) AS generated,
                   count(*) FILTER (WHERE r.state = 'in_progress') AS in_progress,
                   count(*) FILTER (WHERE r.state = 'approved') AS approved,
                   count(*) FILTER (WHERE r.state = 'missing') AS missing,
                   count(*) FILTER (WHERE r.state = 'excluded') AS excluded,
                   count(*) FILTER (WHERE r.state = 'outside') AS outside
            FROM r GROUP BY r.discipline_id) x
      LEFT JOIN disciplines d ON d.id = x.discipline_id), '[]'::jsonb),
    'by_stage', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(x.system_code, x.system_name, x.subsystem_code, x.subsystem_name, x.disc, x.phase, x.phase_name,
                                         x.required, x.generated, x.in_progress, x.approved, x.missing)
                       ORDER BY x.system_code NULLS LAST, x.subsystem_code NULLS LAST, x.disc NULLS LAST, x.ord NULLS LAST)
      FROM (SELECT tg.system_code, tg.system_name, tg.subsystem_code, tg.subsystem_name, d.code AS disc, ph.code AS phase, ph.name AS phase_name,
                   ph.order_index AS ord, count(*) AS required,
                   count(*) FILTER (WHERE req.state <> 'missing') AS generated,
                   count(*) FILTER (WHERE req.state = 'in_progress') AS in_progress,
                   count(*) FILTER (WHERE req.state = 'approved') AS approved,
                   count(*) FILTER (WHERE req.state = 'missing') AS missing
            FROM req JOIN tg ON tg.id = req.tag_id
            LEFT JOIN disciplines d ON d.id = req.discipline_id
            LEFT JOIN project_phases ph ON ph.id = req.phase_id
            GROUP BY tg.system_code, tg.system_name, tg.subsystem_code, tg.subsystem_name, d.code, ph.code, ph.name, ph.order_index) x), '[]'::jsonb),
    'detail_total', (SELECT count(*) FROM det),
    'detail', COALESCE((
      SELECT jsonb_agg(s.row ORDER BY s.tag_number, s.order_index NULLS LAST, s.code NULLS LAST)
      FROM (SELECT * FROM det ORDER BY tag_number, order_index NULLS LAST, code NULLS LAST LIMIT v_limit) s), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.template_client_codes_for(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.template_client_codes_for(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_template_client_codes(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_template_client_codes(uuid, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_export(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_requirements_export(uuid, uuid, uuid, uuid, integer) TO authenticated, service_role;
