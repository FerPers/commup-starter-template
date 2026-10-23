-- fn: public.tag_number_prefix(text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_number_prefix(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(upper(substring(COALESCE(p, '') FROM '[A-Za-z]+')), '')
$function$;
