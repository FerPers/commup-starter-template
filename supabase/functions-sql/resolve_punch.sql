-- fn: public.resolve_punch(uuid, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.resolve_punch(p_punch_id uuid, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.punches; v_role text; v_comment text := btrim(COALESCE(p_comment, ''));
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v.status NOT IN ('open', 'in_progress') THEN RAISE EXCEPTION 'Solo se resuelve un punch abierto o en curso' USING ERRCODE = 'P0001'; END IF;
  IF v.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'El punch ya está resuelto y espera verificación' USING ERRCODE = 'P0001'; END IF;
  IF length(v_comment) < 5 THEN RAISE EXCEPTION 'Describe qué se hizo para resolverlo' USING ERRCODE = '22023'; END IF;

  UPDATE punches SET status = 'in_progress', resolved_at = now(), resolved_by = auth.uid() WHERE id = p_punch_id;
  INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Resuelto: ' || v_comment);
  PERFORM public.punch_log(v, 'resolved', jsonb_build_object('comment', v_comment));
END;
$function$;
