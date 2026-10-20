-- fn: public.trg_set_punch_number()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.trg_set_punch_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.punch_number IS NULL OR NEW.punch_number = '' THEN
    NEW.punch_number := next_punch_number_atomic(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$function$;
