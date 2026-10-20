-- fn: public.witness_startup_event(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.witness_startup_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ev startup_events%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO ev FROM startup_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF ev.status <> 'pending_witness' THEN RAISE EXCEPTION 'El evento no espera testigo' USING ERRCODE = 'P0001'; END IF;
  v_role := public.register_caller_role(ev.project_id);
  -- S14 (D14): testigo = firmante designado de esa capacidad (o, sin designados, el rol de respaldo).
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT public.has_capacity(ev.project_id, ev.witness_capacity) THEN
    RAISE EXCEPTION 'No estás designado para atestiguar como %', ev.witness_capacity USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = ev.recorded_by THEN RAISE EXCEPTION 'El testigo debe ser una persona distinta de quien registró el hito' USING ERRCODE = '42501'; END IF;
  UPDATE startup_events SET status = 'witnessed', witness_by = auth.uid(), witness_at = now() WHERE id = ev.id;
END;
$function$;
