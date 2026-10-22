-- fn: public.add_startup_event_param(uuid,text,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.add_startup_event_param(p_event_id uuid, p_label text, p_value text, p_unit text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ev startup_events%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO ev FROM startup_events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(ev.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF ev.status IN ('witnessed', 'voided') THEN RAISE EXCEPTION 'El evento % ya está cerrado', ev.number USING ERRCODE = 'P0001'; END IF;
  IF public.mgmt_text(p_label, 100) IS NULL OR public.mgmt_text(p_value, 200) IS NULL THEN RAISE EXCEPTION 'Indica parámetro y valor' USING ERRCODE = '22023'; END IF;
  INSERT INTO startup_event_params (event_id, project_id, label, value, value_text, unit, source, added_by)
  VALUES (ev.id, ev.project_id, public.mgmt_text(p_label, 100),
          CASE WHEN btrim(p_value) ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(btrim(p_value), ',', '.')::double precision END,
          CASE WHEN NOT (btrim(p_value) ~ '^-?[0-9]+([.,][0-9]+)?$') THEN public.mgmt_text(p_value, 200) END,
          public.mgmt_text(p_unit, 30), 'manual', auth.uid());
END;
$function$;
