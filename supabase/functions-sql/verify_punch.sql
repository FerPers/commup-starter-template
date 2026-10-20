-- fn: public.verify_punch(uuid, boolean, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.verify_punch(p_punch_id uuid, p_accept boolean, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.punches; v_role text; v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v.status <> 'in_progress' OR v.resolved_at IS NULL THEN
    RAISE EXCEPTION 'Solo se verifica un punch resuelto' USING ERRCODE = 'P0001';
  END IF;
  IF v.resolved_by = auth.uid() THEN
    RAISE EXCEPTION 'La verificación la hace una persona distinta de quien lo resolvió' USING ERRCODE = 'P0001';
  END IF;

  IF p_accept THEN
    UPDATE punches SET status = 'closed', closed_date = public.project_today(v.project_id), verified_by = auth.uid() WHERE id = p_punch_id;
    INSERT INTO punch_comments (punch_id, user_id, comment)
    VALUES (p_punch_id, auth.uid(), 'Verificado en campo y cerrado' || COALESCE(': ' || v_comment, '.'));
    PERFORM public.punch_log(v, 'verified', jsonb_build_object('comment', v_comment));
  ELSE
    IF v_comment IS NULL THEN RAISE EXCEPTION 'Indica por qué no se acepta la resolución' USING ERRCODE = '22023'; END IF;
    UPDATE punches SET resolved_at = NULL, resolved_by = NULL WHERE id = p_punch_id;
    INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Verificación rechazada: ' || v_comment);
    PERFORM public.punch_log(v, 'verification_rejected', jsonb_build_object('comment', v_comment));
  END IF;
END;
$function$;
