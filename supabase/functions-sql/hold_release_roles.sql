-- fn: public.hold_release_roles(text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.hold_release_roles(p_capacity text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- S14 (D14): alias de la regla de respaldo; la decisión real es has_capacity(proyecto, capacidad).
  SELECT public.capacity_fallback_roles(p_capacity);
$function$;
