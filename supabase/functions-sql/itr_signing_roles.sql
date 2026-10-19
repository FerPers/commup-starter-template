-- fn: public.itr_signing_roles(text[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.itr_signing_roles(p_roles text[])
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT ARRAY(SELECT r FROM unnest(ARRAY['executor', 'supervisor', 'client']) WITH ORDINALITY AS o(r, n)
               WHERE r = 'executor' OR r = ANY (COALESCE(p_roles, ARRAY['executor', 'supervisor']))
               ORDER BY n);
$function$;
