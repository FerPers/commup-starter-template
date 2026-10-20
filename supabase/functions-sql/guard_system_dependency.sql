-- fn: public.guard_system_dependency()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.guard_system_dependency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_project uuid; v_org uuid; v_other uuid;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org
  FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = NEW.system_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT project_id INTO v_other FROM systems WHERE id = NEW.depends_on_system_id;
  IF v_other IS DISTINCT FROM v_project THEN
    RAISE EXCEPTION 'Los dos sistemas deben ser del mismo proyecto' USING ERRCODE = '22023';
  END IF;
  IF (SELECT COUNT(*) FROM readiness_gates WHERE org_id = v_org AND id IN (NEW.required_gate_id, NEW.blocked_gate_id))
     <> (CASE WHEN NEW.required_gate_id = NEW.blocked_gate_id THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'Gate de otra organización' USING ERRCODE = '22023';
  END IF;
  NEW.project_id := v_project;
  NEW.org_id     := v_org;
  NEW.notes      := NULLIF(btrim(COALESCE(NEW.notes, '')), '');

  -- Serializa las altas del proyecto para que dos inserciones simultáneas no cierren un ciclo.
  PERFORM pg_advisory_xact_lock(hashtext('system_dependencies:' || v_project::text));
  -- S11 (D-35): ciclo por gates, no por sistemas. «S.g necesita P.r» y llegar al gate (S, x) necesita los
  -- anteriores de S. Hay ciclo si desde (P, r) se vuelve a S en un gate de orden ≥ al bloqueado: así «A.RFC
  -- necesita B.MC» y «B.RFSU necesita A.MC» conviven.
  IF EXISTS (
    WITH RECURSIVE up(sid, ord) AS (
      SELECT NEW.depends_on_system_id, (SELECT order_index FROM readiness_gates WHERE id = NEW.required_gate_id)
      UNION
      SELECT d.depends_on_system_id, rr.order_index
      FROM up
      JOIN system_dependencies d ON d.system_id = up.sid AND d.id IS DISTINCT FROM NEW.id
      JOIN readiness_gates rb ON rb.id = d.blocked_gate_id AND rb.order_index <= up.ord
      JOIN readiness_gates rr ON rr.id = d.required_gate_id
    )
    SELECT 1 FROM up WHERE sid = NEW.system_id
      AND ord >= (SELECT order_index FROM readiness_gates WHERE id = NEW.blocked_gate_id)
  ) THEN
    RAISE EXCEPTION 'La dependencia crea un ciclo entre gates de los sistemas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
