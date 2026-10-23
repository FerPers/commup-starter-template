-- P1 (plan referente 2026-10-22, bases del P&ID vivo, sin cambio visible):
--   1. systems.color: color estable por sistema dentro del proyecto (asignado y editable). Antes el visor lo
--      derivaba del orden de los sistemas presentes en CADA plano, así que un sistema cambiaba de color de un
--      plano a otro. Paleta = system_palette() = SYSTEM_PALETTE en src/lib/systems/colors.ts (test de paridad).
--      Relleno: por proyecto en orden de código. Un sistema nuevo sin color recibe el menos usado del proyecto
--      (empate → orden de la paleta); un import de varias filas también reparte, porque el trigger BEFORE ROW ve
--      las filas ya insertadas por la misma sentencia.
--   2. pid_hotspots.x_pct / y_pct eran numeric(6,4): un pin en el borde (100 %) desbordaba. Pasan a
--      numeric(7,4) con rango 0..100.

-- ── 1. Color por sistema ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.system_palette()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2',
               '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b91c1c', '#7c3aed'];
$function$;

ALTER TABLE public.systems ADD COLUMN color text;

-- Relleno sin un evento de dominio por fila (la cabecera bulk solo vale con service_role).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true),
       set_config('request.headers', '{"x-commup-bulk":"p1_system_color"}', true);

UPDATE public.systems s
   SET color = (public.system_palette())[((x.rn - 1) % 12) + 1]
  FROM (SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY code, id) AS rn FROM public.systems) x
 WHERE x.id = s.id;

SELECT set_config('request.jwt.claims', '', true), set_config('request.headers', '', true);

CREATE OR REPLACE FUNCTION public.system_assign_color()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.color IS NULL THEN
    SELECT p.c INTO NEW.color
      FROM unnest(system_palette()) WITH ORDINALITY AS p(c, i)
      LEFT JOIN (SELECT s.color, count(*) AS n FROM systems s WHERE s.project_id = NEW.project_id GROUP BY s.color) u
        ON u.color = p.c
     ORDER BY COALESCE(u.n, 0), p.i
     LIMIT 1;
  END IF;
  NEW.color := lower(NEW.color);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER systems_assign_color BEFORE INSERT OR UPDATE OF color ON public.systems
  FOR EACH ROW EXECUTE FUNCTION public.system_assign_color();

ALTER TABLE public.systems
  ALTER COLUMN color SET NOT NULL,
  ADD CONSTRAINT systems_color_hex CHECK (color ~ '^#[0-9a-f]{6}$');

COMMENT ON COLUMN public.systems.color IS
  'P1: color del sistema en el proyecto (P&ID: pines y límites). Por defecto el menos usado de system_palette().';

-- ── 2. Pines en el borde ─────────────────────────────────────────────────────

ALTER TABLE public.pid_hotspots
  ALTER COLUMN x_pct TYPE numeric(7,4),
  ALTER COLUMN y_pct TYPE numeric(7,4),
  ADD CONSTRAINT pid_hotspots_pct_range CHECK (x_pct BETWEEN 0 AND 100 AND y_pct BETWEEN 0 AND 100);
