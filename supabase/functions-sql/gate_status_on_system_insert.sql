-- fn: public.gate_status_on_system_insert()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_on_system_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO system_gate_status (system_id, project_id, org_id)
  SELECT n.id, n.project_id, p.org_id FROM new_rows n JOIN projects p ON p.id = n.project_id
  ON CONFLICT (system_id) DO NOTHING;
  RETURN NULL;
END;
$function$;
