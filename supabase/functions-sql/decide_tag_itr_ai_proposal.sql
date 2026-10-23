-- fn: public.decide_tag_itr_ai_proposal(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.decide_tag_itr_ai_proposal(p_proposal_id uuid, p_decision text)
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
  v_reason := left(btrim(v_p.reason), 500);

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
