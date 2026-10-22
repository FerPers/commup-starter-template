-- fn: public.ownership_check_keys()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.ownership_check_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['startup_procedure', 'staff_level_1', 'staff_level_2', 'staff_level_3', 'lineup_verified', 'startup_gate',
               'first_startup_witnessed', 'no_open_cat_a', 'critical_spares']
$function$;
