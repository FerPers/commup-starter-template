-- R2b · requisitos ITR materializados por tag (como los gates, S20): el resumen del registro a 50.000 tags tardaba
-- 2–3 s porque recalculaba los 112 mil requisitos en cada lectura.
--
-- tag_requirement_rows = salida de tag_itr_requirements guardada por tag. tag_requirement_dirty = tags por recalcular
-- (triggers de sentencia en tags, itrs y tag_itr_overrides). tag_requirement_state = versión por proyecto: la suben
-- los cambios de todo el proyecto o de la org (matriz, alcance de disciplinas, plantillas, ítems tabla, fases) y
-- obligan a recalcular entero. Al leer (resumen, página y Excel), tag_requirements_refresh recalcula los tags sucios;
-- el recálculo completo de un proyecto de más de 5.000 tags (o con más de 2.000 tags sucios, una importación) lo
-- hace pg_cron «tag-requirements-rebuild» cada minuto, porque a 50.000 tags tarda ~20 s y el rol de la API corta a
-- los 8 s; mientras tanto, o si otro lo está recalculando, la lectura calcula en vivo (como antes). Proyectos chicos
-- se recalculan al leer. tag_requirements_audit compara lo guardado con el cálculo en vivo.
-- tag_itr_requirements se parte en un núcleo sin comprobación de pertenencia (_core, para el cron) y la función
-- pública de siempre.
--
-- Un dato nuevo que mueva un requisito (columna o tabla que lean itr_generation_candidates / tag_itr_requirements)
-- debe sumarse a estos triggers, o el registro queda desactualizado hasta la siguiente marca del proyecto.
-- La ficha del tag, la generación de ITR y Calidad de datos siguen leyendo en vivo.

CREATE TABLE public.tag_requirement_rows (
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tag_id         uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  subsystem_id   uuid,
  template_code  text NOT NULL,
  template_title text,
  discipline_id  uuid,
  phase_id       uuid,
  origin         text,
  state          text NOT NULL,
  itr_id         uuid,
  itr_status     text,
  reason         text
);
CREATE INDEX tag_requirement_rows_project_idx ON public.tag_requirement_rows (project_id, state);
CREATE INDEX tag_requirement_rows_tag_idx ON public.tag_requirement_rows (tag_id);

-- Sin llaves foráneas: en un borrado en cascada el trigger corre cuando el tag o el proyecto ya no están.
CREATE TABLE public.tag_requirement_dirty (
  tag_id     uuid PRIMARY KEY,
  project_id uuid NOT NULL
);
CREATE INDEX tag_requirement_dirty_project_idx ON public.tag_requirement_dirty (project_id);

CREATE TABLE public.tag_requirement_state (
  project_id       uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  version          bigint NOT NULL DEFAULT 1,
  computed_version bigint NOT NULL DEFAULT 0,
  computed_at      timestamptz
);

ALTER TABLE public.tag_requirement_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_requirement_dirty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_requirement_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY tag_requirement_rows_select ON public.tag_requirement_rows FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
REVOKE ALL ON public.tag_requirement_rows, public.tag_requirement_dirty, public.tag_requirement_state FROM anon, authenticated;
GRANT SELECT ON public.tag_requirement_rows TO authenticated;
GRANT ALL ON public.tag_requirement_rows, public.tag_requirement_dirty, public.tag_requirement_state TO service_role;

CREATE OR REPLACE FUNCTION public.tag_itr_requirements_core(p_project_id uuid, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, origin text, state text, itr_id uuid, itr_status text, reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
#variable_conflict use_column
DECLARE v_phases uuid[];
BEGIN
  -- Cálculo de tag_itr_requirements sin la comprobación de pertenencia: lo usan el recálculo materializado y el
  -- cron (sin usuario). Corre como quien la llama (RLS).
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
           tp.discipline_id IN (SELECT pd.discipline_id FROM project_disciplines pd WHERE pd.project_id = p_project_id) AS in_scope
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

CREATE OR REPLACE FUNCTION public.tag_itr_requirements(p_project_id uuid, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, origin text, state text, itr_id uuid, itr_status text, reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.tag_itr_requirements_core(p_project_id, p_tag_ids, p_system_ids, p_subsystem_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_mark_projects(p_project_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- En orden y con bloqueo, como gate_status_mark (sin interbloqueos entre marcas concurrentes).
  WITH l AS (
    SELECT s.project_id FROM tag_requirement_state s
    WHERE s.project_id = ANY (p_project_ids)
    ORDER BY s.project_id
    FOR UPDATE
  )
  UPDATE tag_requirement_state s SET version = s.version + 1
  FROM l WHERE s.project_id = l.project_id
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_mark_tags()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rows jsonb; v_moved uuid[];
BEGIN
  -- Igual que gate_status_dirty_trg: filas de la sentencia; en UPDATE solo las que cambiaron alguna columna de TG_ARGV.
  IF TG_OP = 'INSERT' THEN
    SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM new_rows n;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT jsonb_agg(to_jsonb(o)) INTO v_rows FROM old_rows o;
  ELSIF TG_NARGS = 0 THEN
    SELECT jsonb_agg(z.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS x FROM old_rows o UNION ALL SELECT to_jsonb(n) FROM new_rows n) z;
  ELSE
    SELECT jsonb_agg(v.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS o, to_jsonb(n) AS n FROM old_rows o JOIN new_rows n ON n.id = o.id) c
    CROSS JOIN LATERAL (VALUES (c.o), (c.n)) v(x)
    WHERE EXISTS (SELECT 1 FROM unnest(TG_ARGV) k WHERE c.o -> k IS DISTINCT FROM c.n -> k);
  END IF;
  IF v_rows IS NULL THEN RETURN NULL; END IF;

  -- Un tag que cambia de proyecto deja filas viejas en el otro: los dos proyectos se recalculan enteros.
  IF TG_TABLE_NAME = 'tags' AND TG_OP = 'UPDATE' THEN
    SELECT array_agg(DISTINCT (o.project_id)) INTO v_moved
    FROM old_rows o JOIN new_rows n ON n.id = o.id WHERE n.project_id IS DISTINCT FROM o.project_id;
    IF v_moved IS NOT NULL THEN
      PERFORM public.tag_requirements_mark_projects(v_moved || ARRAY(SELECT DISTINCT n.project_id FROM new_rows n));
    END IF;
  END IF;

  -- Sin llave foránea: en un borrado en cascada el tag (o el proyecto) ya no está; esos se saltan.
  INSERT INTO tag_requirement_dirty (tag_id, project_id)
  SELECT DISTINCT ON (t.id) t.id, t.project_id
  FROM jsonb_array_elements(v_rows) x
  JOIN tags t ON t.id = (CASE WHEN TG_TABLE_NAME = 'tags' THEN x ->> 'id' ELSE x ->> 'tag_id' END)::uuid
  ORDER BY t.id
  ON CONFLICT (tag_id) DO UPDATE SET project_id = EXCLUDED.project_id;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_mark_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_orgs uuid[]; v_projects uuid[]; v_new jsonb; v_old jsonb; v_rows jsonb;
BEGIN
  -- Matriz, plantillas, ítems tabla y fases son de la org: todos sus proyectos se recalculan enteros.
  -- project_disciplines es del proyecto (alcance de disciplinas). Un trigger por evento (tablas de transición).
  IF TG_OP IN ('INSERT', 'UPDATE') THEN SELECT jsonb_agg(to_jsonb(n)) INTO v_new FROM new_rows n; END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN SELECT jsonb_agg(to_jsonb(o)) INTO v_old FROM old_rows o; END IF;
  v_rows := COALESCE(v_new, '[]'::jsonb) || COALESCE(v_old, '[]'::jsonb);
  IF TG_TABLE_NAME = 'project_disciplines' THEN
    SELECT array_agg(DISTINCT (x ->> 'project_id')::uuid) INTO v_projects FROM jsonb_array_elements(v_rows) x;
  ELSIF TG_TABLE_NAME = 'itr_template_items' THEN
    SELECT array_agg(DISTINCT tp.org_id) INTO v_orgs
    FROM jsonb_array_elements(v_rows) x JOIN itr_templates tp ON tp.id = (x ->> 'template_id')::uuid
    WHERE x ->> 'item_type' = 'table';
  ELSE
    SELECT array_agg(DISTINCT (x ->> 'org_id')::uuid) INTO v_orgs FROM jsonb_array_elements(v_rows) x;
  END IF;
  IF v_orgs IS NOT NULL THEN
    SELECT array_agg(p.id) INTO v_projects FROM projects p WHERE p.org_id = ANY (v_orgs);
  END IF;
  IF v_projects IS NOT NULL THEN PERFORM public.tag_requirements_mark_projects(v_projects); END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_rebuild(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v_version bigint;
BEGIN
  -- Recalcula entero un proyecto (interna: la llaman el cron y tag_requirements_refresh en proyectos chicos).
  -- Si otra transacción lo está recalculando, no espera: devuelve false.
  INSERT INTO tag_requirement_state (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  SELECT s.version INTO v_version FROM tag_requirement_state s WHERE s.project_id = p_project_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM tag_requirement_dirty d WHERE d.project_id = p_project_id;
  DELETE FROM tag_requirement_rows r WHERE r.project_id = p_project_id;
  INSERT INTO tag_requirement_rows (project_id, tag_id, subsystem_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason)
  SELECT p_project_id, q.tag_id, t.subsystem_id, q.template_code, q.template_title, q.discipline_id, q.phase_id, q.origin, q.state, q.itr_id, q.itr_status, q.reason
  FROM public.tag_itr_requirements_core(p_project_id) q JOIN tags t ON t.id = q.tag_id;
  UPDATE tag_requirement_state s SET computed_version = v_version, computed_at = now() WHERE s.project_id = p_project_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_refresh(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v_version bigint; v_computed bigint; v_tags uuid[]; v_dirty bigint;
BEGIN
  -- Al leer: true = tag_requirement_rows está al día (se recalcularon los tags sucios); false = hay que calcular en
  -- vivo porque el proyecto espera un recálculo completo (lo hace el cron: a 50.000 tags tarda ~20 s y el rol de
  -- la API corta a los 8 s) o porque otro lo está recalculando en este momento.
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  INSERT INTO tag_requirement_state (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  SELECT s.version, s.computed_version INTO v_version, v_computed
  FROM tag_requirement_state s WHERE s.project_id = p_project_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT count(*) INTO v_dirty FROM tag_requirement_dirty d WHERE d.project_id = p_project_id;
  IF v_computed < v_version OR v_dirty > 2000 THEN
    IF (SELECT count(*) FROM tags t WHERE t.project_id = p_project_id) <= 5000 THEN
      RETURN public.tag_requirements_rebuild(p_project_id);  -- proyecto chico: se recalcula aquí mismo
    END IF;
    IF v_computed >= v_version THEN  -- muchos tags sucios (una importación): que el cron lo haga entero
      UPDATE tag_requirement_state s SET version = s.version + 1 WHERE s.project_id = p_project_id;
    END IF;
    RETURN false;
  END IF;

  IF v_dirty > 0 THEN
    WITH d AS (DELETE FROM tag_requirement_dirty d WHERE d.project_id = p_project_id RETURNING d.tag_id)
    SELECT array_agg(DISTINCT d.tag_id) INTO v_tags FROM d;
    DELETE FROM tag_requirement_rows r WHERE r.project_id = p_project_id AND r.tag_id = ANY (v_tags);
    INSERT INTO tag_requirement_rows (project_id, tag_id, subsystem_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason)
    SELECT p_project_id, q.tag_id, t.subsystem_id, q.template_code, q.template_title, q.discipline_id, q.phase_id, q.origin, q.state, q.itr_id, q.itr_status, q.reason
    FROM public.tag_itr_requirements_core(p_project_id, v_tags) q JOIN tags t ON t.id = q.tag_id;
    UPDATE tag_requirement_state s SET computed_at = now() WHERE s.project_id = p_project_id;
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_rebuild_pending()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  -- pg_cron «tag-requirements-rebuild» (cada minuto): recalcula enteros los proyectos que lo esperan, los más viejos
  -- primero y hasta 3 por vuelta; después actualiza las estadísticas de la tabla para que las lecturas planeen bien.
  FOR r IN SELECT s.project_id FROM tag_requirement_state s
           WHERE s.computed_version < s.version ORDER BY s.computed_at NULLS FIRST LIMIT 3 LOOP
    IF public.tag_requirements_rebuild(r.project_id) THEN n := n + 1; END IF;
  END LOOP;
  IF n > 0 THEN ANALYZE tag_requirement_rows; END IF;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_audit(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb;
BEGIN
  -- Compara lo materializado (tras refrescar) con el cálculo en vivo: 0 y 0 = al día. Si el proyecto espera el
  -- recálculo del cron, solo lo dice (cached = false). Para tests y revisiones.
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT public.tag_requirements_refresh(p_project_id) THEN RETURN jsonb_build_object('cached', false); END IF;
  WITH live AS (
    SELECT q.tag_id, q.template_code, q.state, q.itr_id, q.origin, q.reason FROM public.tag_itr_requirements_core(p_project_id) q
  ),
  mat AS (
    SELECT r.tag_id, r.template_code, r.state, r.itr_id, r.origin, r.reason FROM tag_requirement_rows r WHERE r.project_id = p_project_id
  )
  SELECT jsonb_build_object(
    'cached', true,
    'rows', (SELECT count(*) FROM mat),
    'missing_in_cache', (SELECT count(*) FROM (SELECT * FROM live EXCEPT ALL SELECT * FROM mat) x),
    'extra_in_cache', (SELECT count(*) FROM (SELECT * FROM mat EXCEPT ALL SELECT * FROM live) x)
  ) INTO v;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_summary(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb; v_org uuid; v_cached boolean;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;

  -- Materializado por tag (R2b): recalcula solo lo que cambió; si el proyecto espera el cron, en vivo.
  v_cached := public.tag_requirements_refresh(p_project_id);
  WITH r AS (
    SELECT tag_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason FROM tag_requirement_rows q WHERE v_cached AND q.project_id = p_project_id
    UNION ALL
    SELECT tag_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason FROM public.tag_itr_requirements(p_project_id) q WHERE NOT v_cached
  ),
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
    'tags_no_rule', (SELECT count(*) FROM tg WHERE equipment_type_id IS NOT NULL AND tg.id NOT IN (SELECT r.tag_id FROM r WHERE r.state <> 'outside')),
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

CREATE OR REPLACE FUNCTION public.tag_requirements_page(p_project_id uuid, p_filter text DEFAULT 'all'::text, p_area_id uuid DEFAULT NULL::uuid, p_system_id uuid DEFAULT NULL::uuid, p_subsystem_id uuid DEFAULT NULL::uuid, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb; v_systems uuid[]; v_q text := NULLIF(upper(btrim(COALESCE(p_q, ''))), '');
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200); v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_fast boolean := COALESCE(p_filter, 'all') IN ('all', 'notype'); v_page uuid[]; v_total bigint; v_cached boolean;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_cached := public.tag_requirements_refresh(p_project_id);  -- materializado por tag (R2b); false = en vivo
  IF p_area_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_systems FROM systems s WHERE s.project_id = p_project_id AND s.area_id = p_area_id;
  ELSIF p_system_id IS NOT NULL THEN
    v_systems := ARRAY[p_system_id];
  END IF;

  -- R2b (bench 50k): sin filtro o «sin tipo» el filtro no depende de los requisitos: se pagina sobre los tags y
  -- solo se calculan los requisitos de la página (el registro abre así; antes calculaba los 50.000 tags).
  IF v_fast THEN
    WITH t0 AS (
      SELECT t.id, t.tag_number FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id
      WHERE t.project_id = p_project_id
        AND (v_systems IS NULL OR s.system_id = ANY (v_systems))
        AND (p_subsystem_id IS NULL OR t.subsystem_id = p_subsystem_id)
        AND (v_q IS NULL OR upper(t.tag_number) LIKE '%' || v_q || '%' OR upper(COALESCE(t.description, '')) LIKE '%' || v_q || '%')
        AND (COALESCE(p_filter, 'all') <> 'notype' OR t.equipment_type_id IS NULL)
    )
    SELECT (SELECT count(*) FROM t0),
           COALESCE((SELECT array_agg(x.id ORDER BY x.tag_number) FROM (SELECT id, tag_number FROM t0 ORDER BY tag_number LIMIT v_limit OFFSET v_offset) x), '{}')
    INTO v_total, v_page;
  END IF;

  WITH t AS (
    SELECT t.id, t.tag_number, t.description, t.equipment_type_id, et.code AS type_code
    FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id LEFT JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE t.project_id = p_project_id
      AND (v_systems IS NULL OR s.system_id = ANY (v_systems))
      AND (p_subsystem_id IS NULL OR t.subsystem_id = p_subsystem_id)
      AND (v_q IS NULL OR upper(t.tag_number) LIKE '%' || v_q || '%' OR upper(COALESCE(t.description, '')) LIKE '%' || v_q || '%')
      AND (v_page IS NULL OR t.id = ANY (v_page))
  ),
  r AS (
    SELECT tag_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason FROM tag_requirement_rows r
    WHERE v_cached AND r.project_id = p_project_id AND r.tag_id IN (SELECT id FROM t)
    UNION ALL
    SELECT tag_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason FROM public.tag_itr_requirements(p_project_id, v_page, v_systems,
      CASE WHEN p_subsystem_id IS NULL THEN NULL ELSE ARRAY[p_subsystem_id] END) r
    WHERE NOT v_cached AND r.tag_id IN (SELECT id FROM t)
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
  pg AS (SELECT * FROM f ORDER BY tag_number LIMIT v_limit OFFSET CASE WHEN v_fast THEN 0 ELSE v_offset END)
  SELECT jsonb_build_object(
    'total', COALESCE(v_total, (SELECT count(*) FROM f)),
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
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb; v_org uuid; v_systems uuid[]; v_subs uuid[]; v_cached boolean; v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20000), 1), 50000);
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_area_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_systems FROM systems s WHERE s.project_id = p_project_id AND s.area_id = p_area_id;
  ELSIF p_system_id IS NOT NULL THEN
    v_systems := ARRAY[p_system_id];
  END IF;
  IF p_subsystem_id IS NOT NULL THEN v_subs := ARRAY[p_subsystem_id]; END IF;

  v_cached := public.tag_requirements_refresh(p_project_id);  -- materializado por tag (R2b); false = en vivo
  WITH r AS MATERIALIZED (
    SELECT q.tag_id, q.template_code, q.template_title, q.discipline_id, q.phase_id, q.origin, q.state, q.itr_id, q.itr_status, q.reason FROM tag_requirement_rows q JOIN tags t ON t.id = q.tag_id LEFT JOIN subsystems s ON s.id = t.subsystem_id
    WHERE v_cached AND q.project_id = p_project_id
      AND (v_systems IS NULL OR s.system_id = ANY (v_systems))
      AND (v_subs IS NULL OR t.subsystem_id = ANY (v_subs))
    UNION ALL
    SELECT q.tag_id, q.template_code, q.template_title, q.discipline_id, q.phase_id, q.origin, q.state, q.itr_id, q.itr_status, q.reason FROM public.tag_itr_requirements(p_project_id, NULL, v_systems, v_subs) q WHERE NOT v_cached
  ),
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
    SELECT tg.* FROM tg WHERE tg.id NOT IN (SELECT r.tag_id FROM r WHERE r.state <> 'outside')  -- subplan con hash
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

-- Por tag: alta, cambio de tipo/subsistema/proyecto; ITR (alta, baja, estado, plantilla, tag); excepciones.
CREATE TRIGGER tags_req_dirty_ins AFTER INSERT ON public.tags REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags();
CREATE TRIGGER tags_req_dirty_upd AFTER UPDATE ON public.tags REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags('subsystem_id', 'equipment_type_id', 'project_id');
CREATE TRIGGER itrs_req_dirty_ins AFTER INSERT ON public.itrs REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags();
CREATE TRIGGER itrs_req_dirty_upd AFTER UPDATE ON public.itrs REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags('status', 'template_id', 'tag_id', 'project_id');
CREATE TRIGGER itrs_req_dirty_del AFTER DELETE ON public.itrs REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags();
CREATE TRIGGER tag_itr_overrides_req_dirty_ins AFTER INSERT ON public.tag_itr_overrides REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags();
CREATE TRIGGER tag_itr_overrides_req_dirty_upd AFTER UPDATE ON public.tag_itr_overrides REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags();
CREATE TRIGGER tag_itr_overrides_req_dirty_del AFTER DELETE ON public.tag_itr_overrides REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_tags();

-- De todo el proyecto o de la org: matriz, plantillas, ítems tabla, fases y alcance de disciplinas.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('equipment_type_templates', true), ('itr_templates', true), ('itr_template_items', true),
    ('project_phases', false), ('project_disciplines', true)
  ) v(t, upd) LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows '
                   'FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_org()', r.t || '_req_dirty_ins', r.t);
    IF r.upd THEN
      EXECUTE format('CREATE TRIGGER %I AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows '
                     'FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_org()', r.t || '_req_dirty_upd', r.t);
    END IF;
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows '
                   'FOR EACH STATEMENT EXECUTE FUNCTION public.tag_requirements_mark_org()', r.t || '_req_dirty_del', r.t);
  END LOOP;
END;
$do$;

-- Recálculo completo en segundo plano (como gate-status-refresh).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tag-requirements-rebuild';
    PERFORM cron.schedule('tag-requirements-rebuild', '* * * * *', 'SELECT public.tag_requirements_rebuild_pending()');
  END IF;
END;
$do$;

-- El núcleo corre como quien lo llama (RLS): a un no miembro le devuelve vacío; la función pública da el error claro.
REVOKE ALL ON FUNCTION public.tag_itr_requirements_core(uuid, uuid[], uuid[], uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_itr_requirements_core(uuid, uuid[], uuid[], uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_refresh(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_requirements_refresh(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_audit(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_requirements_audit(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_rebuild(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tag_requirements_rebuild(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_rebuild_pending() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tag_requirements_rebuild_pending() TO service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_mark_projects(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tag_requirements_mark_projects(uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.tag_requirements_mark_tags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tag_requirements_mark_org() FROM PUBLIC, anon, authenticated;
