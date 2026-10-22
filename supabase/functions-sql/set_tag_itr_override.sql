-- fn: public.set_tag_itr_override(uuid,text,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
