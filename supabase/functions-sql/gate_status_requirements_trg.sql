-- fn: public.gate_status_requirements_trg()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_requirements_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- R5: el registro de requisitos solo inserta y borra filas (un recálculo borra y vuelve a insertar). Solo las
  -- filas «falta» mueven el criterio requirements_generated: se marcan sus sistemas sin pasar por
  -- gate_status_systems, que armaría un jsonb con todas las filas de un recálculo completo (~500 mil a 50 mil tags).
  IF TG_OP = 'INSERT' THEN
    PERFORM public.gate_status_mark(ARRAY(
      SELECT DISTINCT ss.system_id FROM new_rows n JOIN subsystems ss ON ss.id = n.subsystem_id WHERE n.state = 'missing'));
  ELSE
    PERFORM public.gate_status_mark(ARRAY(
      SELECT DISTINCT ss.system_id FROM old_rows o JOIN subsystems ss ON ss.id = o.subsystem_id WHERE o.state = 'missing'));
  END IF;
  RETURN NULL;
END;
$function$;
