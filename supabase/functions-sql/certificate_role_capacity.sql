-- fn: public.certificate_role_capacity(text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.certificate_role_capacity(p_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_role WHEN 'completion' THEN 'commissioning' WHEN 'client' THEN 'client_rep' WHEN 'authority' THEN 'operations' END;
$function$;
