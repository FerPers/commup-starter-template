-- fn: public.system_palette()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.system_palette()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2',
               '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b91c1c', '#7c3aed'];
$function$;
