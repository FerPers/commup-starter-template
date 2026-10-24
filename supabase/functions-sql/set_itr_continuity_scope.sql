-- fn: public.set_itr_continuity_scope(uuid,uuid,text,integer,text[],text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.set_itr_continuity_scope(p_itr_id uuid, p_item_id uuid, p_grouping text, p_count integer, p_shields text[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; v_org uuid; v_role text; prev itr_continuity_scopes; v_shields text[];
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), ''); v_status jsonb;
BEGIN
  -- A38: el alcance de la continuidad (agrupación, cantidad, pantallas) lo fija un líder o superior que no es el
  -- ejecutor del ITR, y queda congelado: cambiarlo exige motivo y queda en activity_log. Nunca después de firmar.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = v.project_id;
  SELECT m.role::text INTO v_role FROM org_members m
  WHERE m.org_id = v_org AND m.user_id = auth.uid() AND m.status = 'active' AND (m.access_expires_at IS NULL OR m.access_expires_at > now());
  IF COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM itr_assignments a WHERE a.itr_id = p_itr_id AND a.role::text = 'executor' AND a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'executor_cannot_scope' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itr_template_items i WHERE i.id = p_item_id AND i.template_id = v.template_id AND i.item_type::text = 'continuity') THEN
    RAISE EXCEPTION 'invalid_item' USING ERRCODE = '22023';
  END IF;
  IF v.status = 'approved' OR EXISTS (SELECT 1 FROM itr_signatures s WHERE s.itr_id = p_itr_id) THEN
    RAISE EXCEPTION 'itr_signed' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(x ORDER BY o), '{}') INTO v_shields
  FROM (SELECT btrim(s) AS x, o FROM unnest(COALESCE(p_shields, '{}')) WITH ORDINALITY AS u(s, o)) z WHERE x <> '';
  IF p_grouping IS NULL OR p_grouping NOT IN ('pairs', 'conductors') OR p_count IS NULL OR p_count < 1 OR p_count > 500
     OR cardinality(v_shields) > 50 OR EXISTS (SELECT 1 FROM unnest(v_shields) x WHERE length(x) > 60)
     OR (SELECT count(DISTINCT x) FROM unnest(v_shields) x) <> cardinality(v_shields) THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO prev FROM itr_continuity_scopes WHERE itr_id = p_itr_id AND item_id = p_item_id;
  IF FOUND AND prev.grouping_mode = p_grouping AND prev.quantity = p_count
     AND ARRAY(SELECT x FROM unnest(prev.shields) x ORDER BY x) = ARRAY(SELECT x FROM unnest(v_shields) x ORDER BY x) THEN
    RETURN jsonb_build_object('changed', false);
  END IF;
  IF FOUND AND length(COALESCE(v_reason, '')) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO itr_continuity_scopes (itr_id, item_id, project_id, grouping_mode, quantity, shields, set_by, set_at, reason)
  VALUES (p_itr_id, p_item_id, v.project_id, p_grouping, p_count, v_shields, auth.uid(), now(), v_reason)
  ON CONFLICT (itr_id, item_id) DO UPDATE
    SET grouping_mode = EXCLUDED.grouping_mode, quantity = EXCLUDED.quantity, shields = EXCLUDED.shields,
        set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at, reason = EXCLUDED.reason;

  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'itr', p_itr_id, CASE WHEN prev.itr_id IS NULL THEN 'continuity_scope_set' ELSE 'continuity_scope_changed' END,
    jsonb_build_object('item_id', p_item_id, 'grouping', p_grouping, 'count', p_count, 'shields', to_jsonb(v_shields), 'reason', v_reason,
      'previous', CASE WHEN prev.itr_id IS NULL THEN NULL ELSE jsonb_build_object('grouping', prev.grouping_mode, 'count', prev.quantity, 'shields', to_jsonb(prev.shields), 'set_by', prev.set_by, 'set_at', prev.set_at) END));

  v_status := public.refresh_itr_status(p_itr_id);
  RETURN jsonb_build_object('changed', true, 'status', v_status->'status', 'progress_pct', v_status->'progress_pct');
END;
$function$;
