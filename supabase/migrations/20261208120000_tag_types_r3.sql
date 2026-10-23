-- R3 (plan referente, maquetas M aprobadas 2026-10-22; decisiones de Luis 2026-10-23): tipo de equipo editable y
-- clasificación de los tags sin tipo por firma.
--
-- · Guard de org: tags.equipment_type_id solo apunta a un tipo de la org del proyecto (el catálogo de CommUp es
--   legible por todos, pero no se asigna). Cambiar el tipo de un tag con usuario = Propietario, Administrador o
--   Arquitecto (decisión de Luis); la importación y la asignación masiva van con service role.
-- · Firma = prefijo (primera racha de letras del número) + disciplina + descripción normalizada (tag_desc_norm:
--   minúsculas, sin acentos ni signos, sin palabras con dígitos). tag_type_groups agrupa los tags sin tipo y da los
--   prefijos aprendidos de los tags ya tipados de la org; la detección gratis (código, prefijo aprendido, nombre del
--   tipo) es TS puro (src/lib/tags/type-signature.ts) y la IA barata propone el resto (tag_type_proposals).
-- · tag_type_change_preview = «gana X, quedan fuera Y» antes de cambiar el tipo, con las reglas del motor
--   (itr_generation_candidates): matriz aceptada del tipo + agregados − excluidos, dentro del alcance de disciplinas.
--   Cambiar el tipo nunca borra ITR: los que dejan de requerirse quedan «fuera de requisitos».
-- · Un elemento sin ITR propio (spool que va con su línea) recibe un tipo sin reglas (decisión de Luis): pasa a
--   «Sin regla», sin columna nueva.
-- Los triggers de requisitos ya marcan sucio el tag cuando cambia equipment_type_id (tags_req_dirty_upd).

-- ── Guard ───────────────────────────────────────────────────────────────────
CREATE FUNCTION public.guard_tag_equipment_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.equipment_type_id IS NOT DISTINCT FROM OLD.equipment_type_id
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN RETURN NEW; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = NEW.project_id;
  IF NEW.equipment_type_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM equipment_types e WHERE e.id = NEW.equipment_type_id AND e.org_id = v_org) THEN
    RAISE EXCEPTION 'equipment_type_other_org' USING ERRCODE = '42501';
  END IF;
  -- R3: cambiar el tipo cambia los ITR requeridos; con usuario, solo Propietario, Administrador o Arquitecto.
  IF TG_OP = 'UPDATE' AND NEW.equipment_type_id IS DISTINCT FROM OLD.equipment_type_id
     AND auth.uid() IS NOT NULL AND NOT public.is_org_privileged(v_org) THEN
    RAISE EXCEPTION 'Solo un propietario, administrador o arquitecto cambia el tipo de equipo' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tags_equipment_type_guard BEFORE INSERT OR UPDATE OF equipment_type_id, project_id ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_tag_equipment_type();

-- ── Firma ───────────────────────────────────────────────────────────────────
-- = normDesc en src/lib/tags/type-signature.ts (test de paridad con los mismos casos).
CREATE FUNCTION public.tag_desc_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Primero se quitan las palabras con dígitos («P-101», «2"»), después los signos.
  SELECT btrim(left(btrim(regexp_replace(array_to_string(ARRAY(
    SELECT w FROM regexp_split_to_table(
      translate(lower(COALESCE(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '\s+') WITH ORDINALITY AS x(w, n)
    WHERE w !~ '[0-9]' ORDER BY n), ' '), '[^a-z0-9]+', ' ', 'g')), 120))
$function$;

-- = tagPrefix en TS: primera racha de letras («10-PT-1001» → PT).
CREATE FUNCTION public.tag_number_prefix(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(upper(substring(COALESCE(p, '') FROM '[A-Za-z]+')), '')
$function$;

-- Grupos de tags sin tipo por firma (los más grandes primero, tope 500) y prefijos aprendidos de la org.
CREATE FUNCTION public.tag_type_groups(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE v_org uuid; v_groups jsonb; v_learned jsonb; v_untyped int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;

  WITH u AS (
    SELECT t.id, t.tag_number, t.description, t.discipline_id,
           public.tag_number_prefix(t.tag_number) AS prefix, public.tag_desc_norm(t.description) AS desc_norm
    FROM tags t WHERE t.project_id = p_project_id AND t.equipment_type_id IS NULL
  ),
  g AS (
    SELECT u.prefix, u.discipline_id, u.desc_norm, count(*)::int AS n,
           (array_agg(u.tag_number ORDER BY u.tag_number))[1:8] AS samples,
           mode() WITHIN GROUP (ORDER BY u.description) AS description
    FROM u GROUP BY u.prefix, u.discipline_id, u.desc_norm
  )
  SELECT COALESCE(sum(n), 0)::int,
         COALESCE(jsonb_agg(jsonb_build_object(
           'prefix', g.prefix, 'discipline_id', g.discipline_id, 'discipline_code', d.code, 'discipline_name', d.name,
           'desc_norm', g.desc_norm, 'description', g.description, 'n', g.n, 'samples', to_jsonb(g.samples))
           ORDER BY g.n DESC, g.prefix, g.desc_norm) FILTER (WHERE g.rk <= 500), '[]')
  INTO v_untyped, v_groups
  FROM (SELECT g.*, row_number() OVER (ORDER BY g.n DESC, g.prefix, g.desc_norm) AS rk FROM g) g
  LEFT JOIN disciplines d ON d.id = g.discipline_id;

  -- Prefijo aprendido: tipos usados por los tags tipados de la org con ese prefijo (el TS decide si hay mayoría).
  WITH typed AS (
    SELECT public.tag_number_prefix(t.tag_number) AS prefix, t.equipment_type_id
    FROM tags t JOIN projects p ON p.id = t.project_id
    WHERE p.org_id = v_org AND t.equipment_type_id IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('prefix', prefix, 'equipment_type_id', equipment_type_id, 'n', n) ORDER BY prefix, n DESC), '[]')
  INTO v_learned
  FROM (SELECT prefix, equipment_type_id, count(*)::int AS n FROM typed WHERE prefix <> '' GROUP BY 1, 2) x;

  RETURN jsonb_build_object('untyped', v_untyped, 'groups', v_groups, 'learned', v_learned);
END;
$function$;

-- Tags sin tipo de una firma (para aceptar un grupo: lo que siga sin tipo en ese momento).
CREATE FUNCTION public.tag_type_group_tags(p_project_id uuid, p_prefix text, p_discipline_id uuid, p_desc_norm text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT array_agg(t.id ORDER BY t.tag_number) FROM tags t
    WHERE t.project_id = p_project_id AND t.equipment_type_id IS NULL
      AND public.tag_number_prefix(t.tag_number) = COALESCE(p_prefix, '')
      AND t.discipline_id IS NOT DISTINCT FROM p_discipline_id
      AND public.tag_desc_norm(t.description) = COALESCE(p_desc_norm, '')), '{}');
END;
$function$;

-- ── Vista previa del cambio de tipo ─────────────────────────────────────────
-- Mismas reglas que itr_generation_candidates (todas las fases de la org, alcance de disciplinas, excepciones).
CREATE FUNCTION public.tag_type_change_preview(p_project_id uuid, p_tag_ids uuid[], p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v_org uuid; v_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM equipment_types WHERE id = p_type_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'equipment_type_not_found' USING ERRCODE = '22023';
  END IF;

  WITH scope AS (
    SELECT t.id, t.equipment_type_id AS old_type FROM tags t
    WHERE t.project_id = p_project_id AND t.id = ANY (COALESCE(p_tag_ids, '{}'))
  ),
  active AS (
    SELECT DISTINCT ON (tp.code) tp.code,
           EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = tp.discipline_id) AS in_scope
    FROM itr_templates tp
    WHERE tp.org_id = v_org AND tp.is_active
      AND tp.phase_id IN (SELECT ph.id FROM project_phases ph WHERE ph.org_id = v_org)
      AND NOT EXISTS (SELECT 1 FROM itr_template_items i
                      WHERE i.template_id = tp.id AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source')
    ORDER BY tp.code, tp.version DESC, tp.created_at DESC
  ),
  rules AS (
    SELECT DISTINCT m.equipment_type_id, a.code
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code AND a.in_scope
    WHERE m.org_id = v_org AND m.status = 'accepted'
      AND (m.equipment_type_id = p_type_id OR m.equipment_type_id IN (SELECT old_type FROM scope))
  ),
  ov AS (SELECT o.tag_id, o.template_code, o.action FROM tag_itr_overrides o JOIN scope s ON s.id = o.tag_id),
  req AS (
    SELECT s.id AS tag_id, r.code, 'old'::text AS w FROM scope s JOIN rules r ON r.equipment_type_id = s.old_type
    UNION
    SELECT s.id, r.code, 'new' FROM scope s JOIN rules r ON r.equipment_type_id = p_type_id
    UNION
    SELECT ov.tag_id, a.code, v.w FROM ov JOIN active a ON a.code = ov.template_code AND a.in_scope
    CROSS JOIN (VALUES ('old'), ('new')) v(w) WHERE ov.action = 'add'
  ),
  r2 AS (
    SELECT req.* FROM req
    WHERE NOT EXISTS (SELECT 1 FROM ov WHERE ov.tag_id = req.tag_id AND ov.template_code = req.code AND ov.action = 'exclude')
  ),
  pairs AS (
    SELECT tag_id, code, bool_or(w = 'old') AS was, bool_or(w = 'new') AS will FROM r2 GROUP BY 1, 2
  ),
  have AS (
    SELECT i.tag_id, it.code, bool_or(i.status::text IN ('completed', 'approved')) AS signed
    FROM itrs i JOIN itr_templates it ON it.id = i.template_id JOIN scope s ON s.id = i.tag_id
    WHERE i.project_id = p_project_id GROUP BY 1, 2
  ),
  x AS (
    SELECT p.tag_id, p.code, p.was, p.will, h.tag_id IS NOT NULL AS has_itr, COALESCE(h.signed, false) AS signed
    FROM pairs p LEFT JOIN have h ON h.tag_id = p.tag_id AND h.code = p.code
  ),
  -- ITR que hoy cuentan como requeridos y con el tipo nuevo quedan «fuera de requisitos».
  outside AS (SELECT * FROM x WHERE x.was AND NOT x.will AND x.has_itr)
  SELECT jsonb_build_object(
    'tags', (SELECT count(*) FROM scope),
    'changed', (SELECT count(*) FROM scope WHERE old_type IS DISTINCT FROM p_type_id),
    'required_before', (SELECT count(*) FROM x WHERE was),
    'required_after', (SELECT count(*) FROM x WHERE will),
    'gain', (SELECT count(*) FROM x WHERE will AND NOT was),
    'gain_to_generate', (SELECT count(*) FROM x WHERE will AND NOT was AND NOT has_itr),
    'gain_codes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'n', n) ORDER BY code), '[]')
                   FROM (SELECT code, count(*)::int n FROM x WHERE will AND NOT was GROUP BY code) z),
    'dropped', (SELECT count(*) FROM x WHERE was AND NOT will AND NOT has_itr),
    'outside', (SELECT count(*) FROM outside),
    'outside_signed', (SELECT count(*) FROM outside WHERE signed),
    'outside_codes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'n', n) ORDER BY code), '[]')
                      FROM (SELECT code, count(*)::int n FROM outside GROUP BY code) z),
    'type_rules', (SELECT count(DISTINCT code) FROM rules WHERE equipment_type_id = p_type_id)
  ) INTO v_res;
  RETURN v_res;
END;
$function$;

-- ── Propuestas de la IA por firma ───────────────────────────────────────────
-- Lo gratis (código, prefijo aprendido, nombre) se calcula al leer y no se guarda. La IA escribe aquí con service
-- role desde la acción (la corren y la aceptan Propietario, Administrador o Arquitecto; el resto solo ve).
CREATE TABLE public.tag_type_proposals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  prefix            text NOT NULL,
  discipline_id     uuid REFERENCES public.disciplines(id) ON DELETE SET NULL,
  desc_norm         text NOT NULL,
  outcome           text NOT NULL CHECK (outcome IN ('type', 'new_type', 'none')),
  equipment_type_id uuid REFERENCES public.equipment_types(id) ON DELETE SET NULL,
  new_type          jsonb,
  confidence        numeric CHECK (confidence BETWEEN 0 AND 1),
  reason            text,
  model             text,
  status            text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_by        uuid,
  decided_at        timestamptz,
  CHECK (outcome <> 'type' OR equipment_type_id IS NOT NULL OR status <> 'proposed'),
  CHECK (outcome <> 'new_type' OR new_type ? 'code')
);
CREATE UNIQUE INDEX tag_type_proposals_open_idx ON public.tag_type_proposals
  (project_id, prefix, COALESCE(discipline_id, '00000000-0000-0000-0000-000000000000'::uuid), desc_norm) WHERE status = 'proposed';
CREATE INDEX tag_type_proposals_project_idx ON public.tag_type_proposals (project_id, created_at DESC);

ALTER TABLE public.tag_type_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tag_type_proposals_select ON public.tag_type_proposals FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
REVOKE ALL ON public.tag_type_proposals FROM anon;
GRANT SELECT ON public.tag_type_proposals TO authenticated;
GRANT ALL ON public.tag_type_proposals TO service_role;

REVOKE ALL ON FUNCTION public.tag_type_groups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_type_groups(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_type_group_tags(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_type_group_tags(uuid, text, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tag_type_change_preview(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_type_change_preview(uuid, uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_desc_norm(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tag_number_prefix(text) TO authenticated, service_role;
