-- fn: public.set_template_client_codes(uuid,text,jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
