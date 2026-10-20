-- fn: public.certificate_previous_blocker(uuid,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.certificate_previous_blocker(p_subsystem_id uuid, p_phase_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH cur AS (SELECT org_id, order_index FROM project_phases WHERE id = p_phase_id),
  prev AS (
    SELECT p.id, COALESCE(p.certificate_name, p.code) AS label FROM project_phases p, cur
    WHERE p.org_id = cur.org_id AND p.order_index < cur.order_index AND p.certificate_name IS NOT NULL
    ORDER BY p.order_index DESC LIMIT 1)
  SELECT 'Falta el ' || prev.label || ' del subsistema (emitido y sin bloqueo) antes de emitir este certificado'
  FROM prev
  WHERE NOT EXISTS (SELECT 1 FROM certificates c WHERE c.subsystem_id = p_subsystem_id AND c.phase_id = prev.id
                      AND c.status = 'issued' AND NOT c.is_blocked);
$function$;
