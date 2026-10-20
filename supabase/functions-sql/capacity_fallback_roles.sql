-- fn: public.capacity_fallback_roles(text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.capacity_fallback_roles(p_capacity text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_capacity
    WHEN 'commissioning' THEN ARRAY['owner', 'admin', 'architect', 'leader']
    WHEN 'operations'    THEN ARRAY['owner', 'admin', 'architect', 'leader', 'client']
    WHEN 'hse'           THEN ARRAY['owner', 'admin', 'architect', 'leader', 'client']
    WHEN 'client_rep'    THEN ARRAY['client']
    ELSE ARRAY[]::text[] END;
$function$;
