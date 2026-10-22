-- fn: public.set_project_disciplines(uuid,uuid[],text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
