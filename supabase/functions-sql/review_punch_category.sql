-- fn: public.review_punch_category(uuid, public.punch_category, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.review_punch_category(p_punch_id uuid, p_category public.punch_category, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.punches; v_role text; v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un supervisor revisa la categoría' USING ERRCODE = '42501';
  END IF;
  IF v.raised_by = auth.uid() THEN
    RAISE EXCEPTION 'La categoría la revisa una persona distinta de quien levantó el punch' USING ERRCODE = 'P0001';
  END IF;
  IF v.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'El punch está cerrado' USING ERRCODE = 'P0001'; END IF;
  IF p_category IS DISTINCT FROM v.category AND v_note IS NULL THEN
    RAISE EXCEPTION 'Explica el cambio de categoría' USING ERRCODE = '22023';
  END IF;

  UPDATE punches SET category = p_category, category_reviewed_at = now(), category_reviewed_by = auth.uid() WHERE id = p_punch_id;
  INSERT INTO punch_comments (punch_id, user_id, comment)
  VALUES (p_punch_id, auth.uid(),
    CASE WHEN p_category = v.category THEN 'Categoría ' || p_category || ' confirmada'
         ELSE 'Recategorizado ' || v.category || ' → ' || p_category END
    || COALESCE(': ' || v_note, '.'));
  PERFORM public.punch_log(v, 'category_reviewed', jsonb_build_object('from', v.category, 'to', p_category, 'note', v_note));
END;
$function$;
