-- fn: public.compute_project_gates(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_project_gates(p_project_id uuid)
 RETURNS TABLE(system_id uuid, system_code text, system_name text, area_code text, area_name text, gates jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  -- S20: una sola verificación de pertenencia; las consultas internas ya no pagan la RLS por fila.
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id, s.code, s.name, a.code, a.name,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'gate_id', g.gate_id, 'code', g.gate_code, 'name', g.gate_name,
                    'order', g.gate_order, 'computed_level', g.computed_level, 'status', g.status,
                    'failing', (SELECT COUNT(*) FROM jsonb_array_elements(g.criteria) cr
                                WHERE cr ->> 'result' = 'fail'),
                    'approval', g.approval
                  ) ORDER BY g.gate_order, g.gate_code)
           FROM public.compute_system_gates(s.id) g
         ), '[]'::jsonb)
  FROM systems s
  JOIN areas a ON a.id = s.area_id
  WHERE s.project_id = p_project_id
  ORDER BY a.code, s.code;
END;
$function$;
