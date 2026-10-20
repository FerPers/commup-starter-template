-- fn: public.log_sync_conflict(text,text,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text,text,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.log_sync_conflict(p_entity_type text, p_entity_id text, p_local_payload jsonb, p_remote_payload jsonb, p_local_ts timestamp with time zone, p_remote_ts timestamp with time zone, p_winner text, p_notes text, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_org_id uuid; v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_project_id IS NOT NULL THEN
    IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    SELECT org_id INTO v_org_id FROM projects WHERE id = p_project_id;
  ELSE
    SELECT org_id INTO v_org_id FROM public.get_my_org_ids() g(org_id) LIMIT 1;
  END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'User has no organization membership'; END IF;
  IF p_winner NOT IN ('local', 'remote') THEN RAISE EXCEPTION 'winner must be local or remote'; END IF;
  INSERT INTO sync_conflict_log (org_id, user_id, entity_type, entity_id, local_payload, remote_payload, local_ts, remote_ts, winner, resolution, notes)
  VALUES (v_org_id, v_user_id, p_entity_type, p_entity_id, p_local_payload, p_remote_payload, p_local_ts, p_remote_ts, p_winner, 'lww_auto', p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
