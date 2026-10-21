-- fn: public.compute_project_gates(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_project_gates(p_project_id uuid)
 RETURNS TABLE(system_id uuid, system_code text, system_name text, area_code text, area_name text, gates jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_needs uuid[];
  v_write boolean := current_setting('transaction_read_only') = 'off';
BEGIN
  -- S20: una sola verificación de pertenencia; las consultas internas ya no pagan la RLS por fila.
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- S20 (D-07): a recalcular = sin estado, sucios o que dependen (en cadena) de uno sucio (las dependencias son del
  -- mismo proyecto, guard_system_dependency).
  WITH RECURSIVE dirty(id) AS (
    SELECT s.id FROM systems s LEFT JOIN system_gate_status st ON st.system_id = s.id
    WHERE s.project_id = p_project_id
      AND (st.system_id IS NULL OR st.computed_version IS DISTINCT FROM st.version)
    UNION
    SELECT d.system_id FROM system_dependencies d JOIN dirty ON d.depends_on_system_id = dirty.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_needs FROM dirty;

  IF v_write AND cardinality(v_needs) > 0 THEN
    -- Versión leída y cálculo en la misma sentencia (misma foto): un cambio que entra después ya sumó su versión y el
    -- sistema queda sucio. SKIP LOCKED: el que otra transacción está marcando no se guarda ahora (sigue sucio).
    WITH c AS MATERIALIZED (
      SELECT st.system_id, st.version, public.gate_status_compute(st.system_id) AS gates
      FROM system_gate_status st WHERE st.system_id = ANY (v_needs)
    ), lk AS (
      SELECT st.system_id FROM system_gate_status st JOIN c ON c.system_id = st.system_id
      ORDER BY st.system_id
      FOR UPDATE OF st SKIP LOCKED
    )
    UPDATE system_gate_status st
    SET gates = c.gates, computed_version = c.version, computed_at = now()
    FROM c
    WHERE st.system_id = c.system_id AND st.system_id IN (SELECT lk.system_id FROM lk)
      AND (st.computed_version IS NULL OR st.computed_version <= c.version);
  END IF;

  RETURN QUERY
  SELECT s.id, s.code, s.name, a.code, a.name,
         CASE WHEN st.gates IS NOT NULL AND st.computed_version = st.version AND (v_write OR NOT s.id = ANY (v_needs))
              THEN st.gates
              ELSE public.gate_status_compute(s.id) END
  FROM systems s
  JOIN areas a ON a.id = s.area_id
  LEFT JOIN system_gate_status st ON st.system_id = s.id
  WHERE s.project_id = p_project_id
  ORDER BY a.code, s.code;
END;
$function$;
