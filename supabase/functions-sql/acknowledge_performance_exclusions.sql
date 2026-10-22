-- fn: public.acknowledge_performance_exclusions(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.acknowledge_performance_exclusions(p_run_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- S25 (E-19): el representante del cliente reconoce las exclusiones vigentes de un intento cerrado, después de ver
-- el resultado con y sin ellas. Nunca quien excluyó.
DECLARE r performance_runs%ROWTYPE; v_n integer;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(r.project_id) THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_capacity(r.project_id, 'client_rep') THEN
    RAISE EXCEPTION 'Reconoce las exclusiones el representante del cliente designado' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se reconocen exclusiones de un intento cerrado sin resultado' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM performance_disturbances WHERE run_id = r.id AND excluded AND client_ack_by IS NULL AND excluded_by = auth.uid()) THEN
    RAISE EXCEPTION 'No reconoces una exclusión que hiciste tú' USING ERRCODE = '42501';
  END IF;
  UPDATE performance_disturbances SET client_ack_by = auth.uid(), client_ack_at = now()
   WHERE run_id = r.id AND excluded AND client_ack_by IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
