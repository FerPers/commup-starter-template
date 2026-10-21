-- fn: public.gate_conditions_to_actions_trg()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_conditions_to_actions_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_prev text;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_prev := OLD.status; END IF;
  IF NEW.status = 'approved_with_conditions' AND v_prev IS DISTINCT FROM 'approved_with_conditions' THEN
    PERFORM public.gate_conditions_create_actions(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
