-- fn: public.template_client_codes_for(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.template_client_codes_for(p_project_id uuid)
 RETURNS TABLE(template_code text, client_code text, source text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- El del proyecto gana sobre el defecto de la org (project_id IS NULL ordena después).
  SELECT DISTINCT ON (c.template_code) c.template_code, c.client_code,
         CASE WHEN c.project_id IS NULL THEN 'org' ELSE 'project' END
  FROM template_client_codes c JOIN projects p ON p.org_id = c.org_id
  WHERE p.id = p_project_id AND (c.project_id IS NULL OR c.project_id = p_project_id)
  ORDER BY c.template_code, (c.project_id IS NULL);
$function$;
