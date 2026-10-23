-- R4 (plan referente; decisiones de Luis 2026-10-23): ajustes con IA por firma.
--
-- La matriz aceptada decide la base de cada tipo (R2a); la IA (Opus 5.5) ve esa base por FIRMA (tipo + prefijo +
-- disciplina + descripción normalizada, como R3) y propone solo AGREGAR un código dentro del alcance o EXCLUIR uno de
-- la base, con motivo y confianza. Solo corre sobre tipos con reglas aceptadas: el resto muestra «primero revisa la
-- matriz». Correr la IA = Propietario, Administrador o Arquitecto (la acción escribe con service role); aceptar o
-- rechazar = Líder en adelante (RPC decide_tag_itr_ai_proposal), igual que una excepción a mano.
--
-- · tag_itr_ai_reviews: una revisión por firma con la base que vio la IA. Si la base cambia (matriz o alcance), la
--   firma queda «desactualizada» y se puede revisar otra vez; lo ya revisado no se reenvía (se puede reanudar).
-- · tag_itr_ai_proposals: cada agregar/excluir propuesto. Aceptar lo aplica a los tags que están en la firma en ese
--   momento como excepciones de tag_itr_overrides con source 'ai', SIN pisar lo que una persona decidió a mano.
-- Los triggers de tag_itr_overrides ya marcan sucio el registro materializado.

CREATE TABLE public.tag_itr_ai_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  equipment_type_id uuid NOT NULL REFERENCES public.equipment_types(id) ON DELETE CASCADE,
  prefix            text NOT NULL,
  discipline_id     uuid REFERENCES public.disciplines(id) ON DELETE SET NULL,
  desc_norm         text NOT NULL,
  base_codes        text[] NOT NULL,
  model             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tag_itr_ai_reviews_sig_idx ON public.tag_itr_ai_reviews
  (project_id, equipment_type_id, prefix, COALESCE(discipline_id, '00000000-0000-0000-0000-000000000000'::uuid), desc_norm);

CREATE TABLE public.tag_itr_ai_proposals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  review_id         uuid NOT NULL REFERENCES public.tag_itr_ai_reviews(id) ON DELETE CASCADE,
  template_code     text NOT NULL,
  action            text NOT NULL CHECK (action IN ('add', 'exclude')),
  confidence        numeric CHECK (confidence BETWEEN 0 AND 1),
  reason            text NOT NULL CHECK (length(btrim(reason)) >= 10),
  status            text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  decided_by        uuid,
  decided_at        timestamptz,
  applied_tags      integer,
  skipped_tags      integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, template_code, action)
);
CREATE INDEX tag_itr_ai_proposals_project_idx ON public.tag_itr_ai_proposals (project_id, status);

ALTER TABLE public.tag_itr_ai_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_itr_ai_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tag_itr_ai_reviews_select ON public.tag_itr_ai_reviews FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY tag_itr_ai_proposals_select ON public.tag_itr_ai_proposals FOR SELECT TO authenticated USING (public.is_project_member(project_id));
REVOKE ALL ON public.tag_itr_ai_reviews, public.tag_itr_ai_proposals FROM anon;
GRANT SELECT ON public.tag_itr_ai_reviews, public.tag_itr_ai_proposals TO authenticated;
GRANT ALL ON public.tag_itr_ai_reviews, public.tag_itr_ai_proposals TO service_role;

-- ── Firmas con su base y estado de revisión ────────────────────────────────
-- p_status: 'all' · 'pending' (sin revisar o desactualizadas) · 'open' (con propuestas por decidir).
CREATE FUNCTION public.tag_ai_signatures(p_project_id uuid, p_status text DEFAULT 'all', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
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

  WITH active AS (
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
    SELECT m.equipment_type_id, array_agg(DISTINCT a.code ORDER BY a.code) AS codes
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code AND a.in_scope
    WHERE m.org_id = v_org AND m.status = 'accepted'
    GROUP BY m.equipment_type_id
  ),
  u AS (
    SELECT t.tag_number, t.description, t.discipline_id, t.equipment_type_id, t.sil_level, t.fluid_type, t.signal_type,
           public.tag_number_prefix(t.tag_number) AS prefix, public.tag_desc_norm(t.description) AS desc_norm
    FROM tags t WHERE t.project_id = p_project_id AND t.equipment_type_id IS NOT NULL
  ),
  g AS (
    SELECT u.equipment_type_id, u.prefix, u.discipline_id, u.desc_norm, count(*)::int AS n,
           (array_agg(u.tag_number ORDER BY u.tag_number))[1:6] AS samples,
           mode() WITHIN GROUP (ORDER BY u.description) AS description,
           mode() WITHIN GROUP (ORDER BY u.sil_level) AS sil_level,
           mode() WITHIN GROUP (ORDER BY u.fluid_type) AS fluid_type,
           mode() WITHIN GROUP (ORDER BY u.signal_type) AS signal_type
    FROM u GROUP BY 1, 2, 3, 4
  ),
  gr AS (
    SELECT g.*, r.codes AS base, rev.id AS review_id,
           CASE WHEN rev.id IS NULL THEN 'pending' WHEN rev.base_codes = r.codes THEN 'reviewed' ELSE 'stale' END AS review_state
    FROM g JOIN rules r ON r.equipment_type_id = g.equipment_type_id
    LEFT JOIN tag_itr_ai_reviews rev ON rev.project_id = p_project_id AND rev.equipment_type_id = g.equipment_type_id
      AND rev.prefix = g.prefix AND rev.discipline_id IS NOT DISTINCT FROM g.discipline_id AND rev.desc_norm = g.desc_norm
  ),
  props AS (
    SELECT p.review_id,
           jsonb_agg(jsonb_build_object('id', p.id, 'code', p.template_code, 'action', p.action, 'confidence', p.confidence, 'reason', p.reason,
                                        'status', p.status, 'applied_tags', p.applied_tags, 'skipped_tags', p.skipped_tags)
                     ORDER BY p.status <> 'proposed', p.action, p.template_code) AS list,
           count(*) FILTER (WHERE p.status = 'proposed')::int AS open
    FROM tag_itr_ai_proposals p WHERE p.project_id = p_project_id GROUP BY p.review_id
  ),
  full_rows AS (
    SELECT gr.*, COALESCE(props.list, '[]') AS proposals, COALESCE(props.open, 0) AS open
    FROM gr LEFT JOIN props ON props.review_id = gr.review_id
  ),
  filtered AS (
    SELECT * FROM full_rows
    WHERE p_status = 'all' OR (p_status = 'pending' AND review_state <> 'reviewed') OR (p_status = 'open' AND open > 0)
  )
  SELECT jsonb_build_object(
    'groups_total', (SELECT count(*) FROM full_rows),
    'tags_total', (SELECT COALESCE(sum(n), 0) FROM full_rows),
    'pending', (SELECT count(*) FROM full_rows WHERE review_state = 'pending'),
    'stale', (SELECT count(*) FROM full_rows WHERE review_state = 'stale'),
    'reviewed', (SELECT count(*) FROM full_rows WHERE review_state = 'reviewed'),
    'open_proposals', (SELECT COALESCE(sum(open), 0) FROM full_rows),
    'no_rules', (SELECT jsonb_build_object('groups', count(*), 'tags', COALESCE(sum(n), 0)) FROM g WHERE g.equipment_type_id NOT IN (SELECT equipment_type_id FROM rules)),
    'filtered', (SELECT count(*) FROM filtered),
    'groups', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'equipment_type_id', f.equipment_type_id, 'type_code', e.code, 'type_name', e.name,
                 'prefix', f.prefix, 'discipline_id', f.discipline_id, 'discipline_code', d.code, 'discipline_name', d.name,
                 'desc_norm', f.desc_norm, 'description', f.description, 'n', f.n, 'samples', to_jsonb(f.samples),
                 'sil_level', f.sil_level, 'fluid_type', f.fluid_type, 'signal_type', f.signal_type,
                 'base', to_jsonb(f.base), 'review_state', f.review_state, 'proposals', f.proposals, 'open', f.open)
                 ORDER BY f.open DESC, f.n DESC, e.code, f.prefix, f.desc_norm), '[]')
               FROM (SELECT * FROM filtered ORDER BY open DESC, n DESC, equipment_type_id, prefix, desc_norm LIMIT p_limit OFFSET p_offset) f
               JOIN equipment_types e ON e.id = f.equipment_type_id
               LEFT JOIN disciplines d ON d.id = f.discipline_id)
  ) INTO v_res;
  RETURN v_res;
END;
$function$;

-- ── Decidir una propuesta (Líder en adelante) ──────────────────────────────
-- accept: crea la excepción en cada tag que hoy está en la firma, salvo donde una persona ya decidió ese código a mano
-- (source 'manual'); un agregar que ya está en la base o un excluir que no está en ella no cambia nada en ese tag.
CREATE FUNCTION public.decide_tag_itr_ai_proposal(p_proposal_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_p tag_itr_ai_proposals; v_r tag_itr_ai_reviews; v_org uuid; v_tpl uuid; v_disc uuid; v_in_base boolean;
  v_applied int := 0; v_skipped int := 0; v_reason text;
BEGIN
  SELECT * INTO v_p FROM tag_itr_ai_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v_p.project_id) THEN
    RAISE EXCEPTION 'proposal_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_project_editor(v_p.project_id) THEN
    RAISE EXCEPTION 'Solo un líder o superior decide los ajustes de la IA' USING ERRCODE = '42501';
  END IF;
  IF v_p.status <> 'proposed' THEN RAISE EXCEPTION 'already_decided' USING ERRCODE = 'P0001'; END IF;
  IF p_decision NOT IN ('accept', 'reject') THEN RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023'; END IF;

  IF p_decision = 'reject' THEN
    UPDATE tag_itr_ai_proposals SET status = 'rejected', decided_by = auth.uid(), decided_at = now() WHERE id = v_p.id;
    RETURN jsonb_build_object('applied', 0, 'skipped', 0);
  END IF;

  SELECT * INTO v_r FROM tag_itr_ai_reviews WHERE id = v_p.review_id;
  v_org := v_p.org_id;
  SELECT tp.id, tp.discipline_id INTO v_tpl, v_disc FROM itr_templates tp
  WHERE tp.org_id = v_org AND tp.is_active AND upper(tp.code) = upper(v_p.template_code)
  ORDER BY tp.version DESC, tp.created_at DESC LIMIT 1;
  IF v_tpl IS NULL THEN RAISE EXCEPTION 'template_not_found' USING ERRCODE = '22023'; END IF;
  -- Las plantillas con tabla desde lazo o matriz C&E se generan allí, no por tag: el motor no las toma.
  IF EXISTS (SELECT 1 FROM itr_template_items i WHERE i.template_id = v_tpl AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source') THEN
    RAISE EXCEPTION 'template_by_source' USING ERRCODE = '22023';
  END IF;
  IF v_p.action = 'add' AND NOT EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = v_p.project_id AND pd.discipline_id = v_disc) THEN
    RAISE EXCEPTION 'out_of_scope' USING ERRCODE = '22023';
  END IF;
  v_in_base := v_p.template_code = ANY (v_r.base_codes);
  v_reason := left('IA: ' || btrim(v_p.reason), 500);

  WITH sig AS (
    SELECT t.id FROM tags t
    WHERE t.project_id = v_p.project_id AND t.equipment_type_id = v_r.equipment_type_id
      AND public.tag_number_prefix(t.tag_number) = v_r.prefix
      AND t.discipline_id IS NOT DISTINCT FROM v_r.discipline_id
      AND public.tag_desc_norm(t.description) = v_r.desc_norm
  ),
  human AS (
    SELECT o.tag_id FROM tag_itr_overrides o JOIN sig ON sig.id = o.tag_id
    WHERE upper(o.template_code) = upper(v_p.template_code) AND o.source = 'manual'
  ),
  target AS (SELECT sig.id FROM sig WHERE sig.id NOT IN (SELECT tag_id FROM human)),
  ins AS (
    INSERT INTO tag_itr_overrides (org_id, project_id, tag_id, template_code, action, source, reason, created_by)
    SELECT v_org, v_p.project_id, target.id, upper(v_p.template_code), v_p.action, 'ai', v_reason, auth.uid()
    FROM target
    -- Un agregar de algo que ya está en la base, o excluir algo que no está, no hace falta.
    WHERE (v_p.action = 'add' AND NOT v_in_base) OR (v_p.action = 'exclude' AND v_in_base)
    ON CONFLICT (tag_id, template_code) DO UPDATE
      SET action = EXCLUDED.action, source = 'ai', reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = now()
      WHERE tag_itr_overrides.source = 'ai'
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins), (SELECT count(*) FROM human) INTO v_applied, v_skipped;

  UPDATE tag_itr_ai_proposals
  SET status = 'accepted', decided_by = auth.uid(), decided_at = now(), applied_tags = v_applied, skipped_tags = v_skipped
  WHERE id = v_p.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'project', v_p.project_id, 'tag.itr_ai_accepted',
          jsonb_build_object('proposal_id', v_p.id, 'code', v_p.template_code, 'action', v_p.action, 'applied', v_applied, 'skipped', v_skipped,
                             'equipment_type_id', v_r.equipment_type_id, 'prefix', v_r.prefix, 'desc_norm', v_r.desc_norm));
  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
END;
$function$;

REVOKE ALL ON FUNCTION public.tag_ai_signatures(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_ai_signatures(uuid, text, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decide_tag_itr_ai_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_tag_itr_ai_proposal(uuid, text) TO authenticated, service_role;
