-- fn: public.update_punch_ops_status(uuid, text, text, date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.update_punch_ops_status(p_punch_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_target_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v          punches;
  v_cur      text;
  v_role     text;
  v_service  boolean := COALESCE(auth.role() = 'service_role', false);  -- sin claims auth.role() es NULL
  v_previous uuid;
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch not found'; END IF;

  -- S06 (C-04/A-03): sin sesión solo el service role explícito (API v1, que ya validó la org).
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    v_role := public.punch_caller_role(v);
    IF v_role IS NULL OR NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR v_role = ANY (public.hold_release_roles('operations'))) THEN
      RAISE EXCEPTION 'Sin permiso para el seguimiento de Operaciones' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_cur := COALESCE(v.post_handover_status, 'active');
  IF v_cur = 'active' THEN
    RAISE EXCEPTION 'El punch no está transferido a Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN ('in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops') THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;
  -- Máquina de estados: cerrar solo desde verificado; verificar solo desde resuelto.
  IF NOT (
       (v_cur IN ('transferred_to_ops', 'in_progress_ops', 'deferred') AND p_new_status IN ('in_progress_ops', 'deferred', 'resolved_ops', 'cancelled_ops') AND p_new_status <> v_cur)
    OR (v_cur = 'resolved_ops' AND p_new_status IN ('verified_ops', 'in_progress_ops'))
    OR (v_cur = 'verified_ops' AND p_new_status = 'closed_final')
  ) THEN
    RAISE EXCEPTION 'Transición no permitida en Operaciones: % → %', v_cur, p_new_status USING ERRCODE = 'P0001';
  END IF;
  -- Verificar y cerrar los hace una persona, distinta de quien resolvió (o verificó).
  IF p_new_status IN ('verified_ops', 'closed_final') THEN
    IF v_service THEN
      RAISE EXCEPTION 'La verificación y el cierre en Operaciones los hace una persona en la app' USING ERRCODE = '42501';
    END IF;
    SELECT e.performed_by INTO v_previous FROM punch_post_handover_events e
    WHERE e.punch_id = p_punch_id AND e.to_status = v_cur ORDER BY e.performed_at DESC LIMIT 1;
    IF v_previous = auth.uid() THEN
      RAISE EXCEPTION 'Lo % una persona distinta de quien lo %', CASE WHEN p_new_status = 'verified_ops' THEN 'verifica' ELSE 'cierra' END,
        CASE WHEN p_new_status = 'verified_ops' THEN 'resolvió' ELSE 'verificó' END USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN CURRENT_DATE ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;
