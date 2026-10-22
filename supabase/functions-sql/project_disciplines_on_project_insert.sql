-- fn: public.project_disciplines_on_project_insert()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.project_disciplines_on_project_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO project_disciplines (project_id, discipline_id, org_id)
  SELECT NEW.id, d.id, NEW.org_id FROM disciplines d WHERE d.org_id = NEW.org_id
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;
