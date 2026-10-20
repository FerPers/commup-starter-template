-- fn: public.guard_tag_subsystem()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.guard_tag_subsystem()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- C-16 (D9): un tag con ITR o punches abiertos cambia de subsistema solo con move_tag_subsystem (dueño de la
  -- tabla), que arrastra lo suyo. Por REST quedarían sus ITR y punches en el subsistema anterior.
  IF NEW.subsystem_id IS DISTINCT FROM OLD.subsystem_id
     AND auth.uid() IS NOT NULL
     AND current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.tags'::regclass))
     AND (EXISTS (SELECT 1 FROM itrs WHERE tag_id = OLD.id)
          OR EXISTS (SELECT 1 FROM punches WHERE tag_id = OLD.id AND status IN ('open', 'in_progress'))) THEN
    RAISE EXCEPTION 'El tag tiene ITR o punches abiertos: muévelo con «Mover de subsistema» (líder+, con motivo)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
