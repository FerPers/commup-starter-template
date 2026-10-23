-- P1 (seguimiento de 20261206120000): systems.color NOT NULL sin default hacía obligatorio el color en el tipo
-- generado de Insert, así que cada importador de jerarquía tendría que inventarlo. DEFAULT '' = «asígnalo tú»: el
-- trigger lo reemplaza por el menos usado del proyecto (igual que NULL) y el CHECK systems_color_hex impide que
-- quede vacío. También vale en UPDATE: poner '' o NULL vuelve a asignar.

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

ALTER TABLE public.systems ALTER COLUMN color SET DEFAULT '';
