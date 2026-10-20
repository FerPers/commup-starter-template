-- fn: public.cancel_punch(uuid, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.cancel_punch(p_punch_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.punches; v_role text; v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  -- S06 (C-11/A-06, D8): cancelar es de supervisor, con motivo, por alguien distinto de quien lo levantó, y queda auditado.
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un supervisor cancela un punch' USING ERRCODE = '42501';
  END IF;
  IF v.raised_by = auth.uid() THEN
    RAISE EXCEPTION 'Lo cancela una persona distinta de quien lo levantó' USING ERRCODE = 'P0001';
  END IF;
  IF v.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'El punch ya está cerrado o cancelado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Explica por qué se cancela (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;

  UPDATE punches SET status = 'cancelled', closed_date = CURRENT_DATE WHERE id = p_punch_id;
  INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Cancelado: ' || v_reason);
  PERFORM public.punch_log(v, 'cancelled', jsonb_build_object('reason', v_reason, 'category', v.category, 'previousStatus', v.status));
END;
$function$;
