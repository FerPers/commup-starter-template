-- fn: public.push_event_types()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.push_event_types()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY['itr.rejected', 'itr.returned', 'punch.created', 'punch.assigned', 'certificate.issued']
$function$;
