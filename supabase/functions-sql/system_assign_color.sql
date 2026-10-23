-- fn: public.system_assign_color()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.system_assign_color()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NULLIF(NEW.color, '') IS NULL THEN
    SELECT p.c INTO NEW.color
      FROM unnest(system_palette()) WITH ORDINALITY AS p(c, i)
      LEFT JOIN (SELECT s.color, count(*) AS n FROM systems s
                  WHERE s.project_id = NEW.project_id AND s.id <> NEW.id GROUP BY s.color) u
        ON u.color = p.c
     ORDER BY COALESCE(u.n, 0), p.i
     LIMIT 1;
  END IF;
  NEW.color := lower(NEW.color);
  RETURN NEW;
END;
$function$;
