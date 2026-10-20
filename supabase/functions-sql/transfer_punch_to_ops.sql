-- fn: public.transfer_punch_to_ops(uuid, uuid, date, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.transfer_punch_to_ops(p_punch_id uuid, p_transferred_to uuid, p_ops_target_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_category   TEXT;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.category::text, pu.post_handover_status
    INTO v_project_id, v_category, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Punch not found';
  END IF;

  -- S06 (A-03): sin sesión solo el service role explícito (API v1, que ya validó la org); con sesión, un supervisor.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT public.is_project_editor(v_project_id) THEN
      RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_category <> 'B' THEN
    RAISE EXCEPTION 'Only Cat B punches can be transferred to Operations';
  END IF;
  IF COALESCE(v_cur_status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'El punch ya está en Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM punches WHERE id = p_punch_id AND status IN ('closed', 'cancelled')) THEN
    RAISE EXCEPTION 'El punch está cerrado o cancelado' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects p JOIN org_members m ON m.org_id = p.org_id WHERE p.id = v_project_id AND m.user_id = p_transferred_to) THEN
    RAISE EXCEPTION 'La persona de Operaciones no es miembro de la organización' USING ERRCODE = 'P0001';
  END IF;

  UPDATE punches SET
    post_handover_status   = 'transferred_to_ops',
    transferred_at         = now(),
    transferred_to_user_id = p_transferred_to,
    ops_target_date        = COALESCE(p_ops_target_date, ops_target_date),
    ops_notes              = COALESCE(p_notes, ops_notes),
    assigned_to            = p_transferred_to
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id, 'transferred', COALESCE(v_cur_status, 'active'),
    'transferred_to_ops', auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;
