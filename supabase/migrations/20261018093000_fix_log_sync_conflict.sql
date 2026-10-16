-- log_sync_conflict ordenaba org_members por `created_at`, columna que no existe (es `joined_at`): toda llamada
-- fallaba con 42703, así que los descartes del replay offline (ITR, Sprint O; arranque, fase 6) no dejaban rastro
-- en sync_conflict_log. Mismo cuerpo, solo cambia el ORDER BY.
CREATE OR REPLACE FUNCTION public.log_sync_conflict(p_entity_type text, p_entity_id text, p_local_payload jsonb, p_remote_payload jsonb, p_local_ts timestamp with time zone, p_remote_ts timestamp with time zone, p_winner text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID;
  v_id      UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT org_id INTO v_org_id
  FROM org_members
  WHERE user_id = v_user_id
  ORDER BY joined_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization membership';
  END IF;

  IF p_winner NOT IN ('local','remote') THEN
    RAISE EXCEPTION 'winner must be local or remote';
  END IF;

  INSERT INTO sync_conflict_log (
    org_id, user_id, entity_type, entity_id,
    local_payload, remote_payload, local_ts, remote_ts,
    winner, resolution, notes
  ) VALUES (
    v_org_id, v_user_id, p_entity_type, p_entity_id,
    p_local_payload, p_remote_payload, p_local_ts, p_remote_ts,
    p_winner, 'lww_auto', p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
