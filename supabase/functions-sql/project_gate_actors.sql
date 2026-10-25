-- fn: public.project_gate_actors(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.project_gate_actors(p_project_id uuid)
 RETURNS TABLE(system_id uuid, gate_id uuid, gate_code text, kind text, capacity text, people jsonb, item_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
#variable_conflict use_column
DECLARE
  r       record;
  g       jsonb;
  v_phase uuid;
  v_sys   uuid;
  v_gate  uuid;
  v_st    text;
  v_cap   text;
  v_users uuid[];
  v_n     integer;
BEGIN
  -- A47 · E5 (plan docs/PLAN-A08-A25-A47-A19-2026-10-25.md, D8): quién debe actuar en la liberación siguiente de cada
  -- sistema, deducido del motivo (sin un líder fijo por sistema). Lee la matriz guardada (compute_project_gates) y
  -- para cada siguiente gate devuelve:
  --   sign          pendiente de firmas  → quienes pueden co-firmar la primera capacidad que falta (gate_cosigners)
  --   approve       listo para aprobar   → quienes aprueban como Comisionamiento (gate_approvers)
  --   review        en regresión o por revisar → los mismos aprobadores
  --   punch         bloqueado por Cat A  → asignados de los Cat A abiertos del sistema (item_count = Cat A abiertos)
  --   itr_rejected  bloqueado por ITR no conforme → ejecutores de esos ITR
  --   punch_b       bloqueado por Cat B sobre el tope → asignados de los Cat B abiertos (item_count = Cat B abiertos)
  --   itrs          en ejecución por ITR → el ejecutor con más ITR pendientes de la fase (item_count = pendientes)
  --   scope         sin información      → arquitectos de la org (definen el alcance)
  --   <criterio>    otro motivo (registros, restricción, line-up, PSSR…) → sin persona; la pantalla nombra el motivo
  -- Los ayudantes de destinatarios son internos (sin EXECUTE para authenticated): por eso SECURITY DEFINER con la
  -- verificación de pertenencia al inicio, como compute_project_gates.
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT cg.system_id, cg.gates FROM public.compute_project_gates(p_project_id) cg LOOP
    -- Siguiente gate = el primero en regresión o por revisar; si no, el primero sin aprobar (= nextGate en matrix.ts).
    SELECT x.v INTO g FROM jsonb_array_elements(r.gates) WITH ORDINALITY AS x(v, i)
     WHERE x.v ->> 'status' IN ('regressed', 'approved_needs_review')
     ORDER BY (x.v ->> 'order')::int, x.v ->> 'code' LIMIT 1;
    IF g IS NULL THEN
      SELECT x.v INTO g FROM jsonb_array_elements(r.gates) WITH ORDINALITY AS x(v, i)
       WHERE x.v ->> 'status' NOT IN ('approved', 'approved_with_conditions', 'approved_needs_review', 'regressed')
       ORDER BY (x.v ->> 'order')::int, x.v ->> 'code' LIMIT 1;
    END IF;
    CONTINUE WHEN g IS NULL;

    v_sys := r.system_id; v_gate := (g ->> 'gate_id')::uuid; v_st := g ->> 'status';
    v_cap := NULL; v_users := '{}'; v_n := NULL;
    SELECT rg.phase_id INTO v_phase FROM readiness_gates rg WHERE rg.id = v_gate;
    system_id := v_sys; gate_id := v_gate; gate_code := g ->> 'code';

    IF v_st = 'pending_signatures' THEN
      kind := 'sign';
      SELECT c INTO v_cap FROM unnest((SELECT rg.required_signatures FROM readiness_gates rg WHERE rg.id = v_gate)) c
       WHERE c <> 'commissioning'
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(g -> 'approval' -> 'signatures', '[]'::jsonb)) s WHERE s ->> 'capacity' = c)
       LIMIT 1;
      IF v_cap IS NOT NULL THEN
        SELECT COALESCE(array_agg(u), '{}') INTO v_users FROM public.gate_cosigners(p_project_id, v_gate, v_cap) u;
      END IF;
    ELSIF v_st IN ('ready', 'ready_with_conditions') THEN
      kind := 'approve';
      SELECT COALESCE(array_agg(u), '{}') INTO v_users FROM public.gate_approvers(p_project_id, v_gate) u;
    ELSIF v_st IN ('regressed', 'approved_needs_review') THEN
      kind := 'review';
      SELECT COALESCE(array_agg(u), '{}') INTO v_users FROM public.gate_approvers(p_project_id, v_gate) u;
    ELSIF g ->> 'work_state' = 'nodata' THEN
      kind := 'scope';
      SELECT COALESCE(array_agg(om.user_id), '{}') INTO v_users
      FROM projects p JOIN org_members om ON om.org_id = p.org_id AND om.status = 'active' AND om.role = 'architect'
       AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      WHERE p.id = p_project_id;
    ELSE
      -- Bloqueado o en ejecución: primero lo que tiene responsable propio.
      SELECT COUNT(*)::int, COALESCE(array_agg(DISTINCT pu.assigned_to) FILTER (WHERE pu.assigned_to IS NOT NULL), '{}')
        INTO v_n, v_users
      FROM punches pu JOIN subsystems ss ON ss.id = pu.subsystem_id
      WHERE ss.system_id = v_sys AND pu.category = 'A' AND pu.status IN ('open', 'in_progress');
      IF g ->> 'work_state' = 'blocked' AND v_n > 0 THEN
        kind := 'punch';
      ELSE
        SELECT COUNT(*)::int, COALESCE(array_agg(DISTINCT a.user_id), '{}') INTO v_n, v_users
        FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id
        LEFT JOIN itr_assignments a ON a.itr_id = i.id AND a.role = 'executor'
        WHERE ss.system_id = v_sys AND i.status = 'rejected' AND (v_phase IS NULL OR i.phase_id = v_phase);
        IF g ->> 'work_state' = 'blocked' AND v_n > 0 THEN
          kind := 'itr_rejected';
        ELSIF g ->> 'work_state' = 'blocked' AND g -> 'blocker' ->> 'kind' = 'itr_phase_approved' AND EXISTS (
          SELECT 1 FROM punches pu JOIN subsystems ss ON ss.id = pu.subsystem_id
          WHERE ss.system_id = v_sys AND pu.category = 'B' AND pu.status IN ('open', 'in_progress')) THEN
          -- Sin Cat A ni no conformes, un bloqueo del criterio de ITR es Cat B sobre el tope (gate_work_state).
          kind := 'punch_b';
          SELECT COUNT(*)::int, COALESCE(array_agg(DISTINCT pu.assigned_to) FILTER (WHERE pu.assigned_to IS NOT NULL), '{}')
            INTO v_n, v_users
          FROM punches pu JOIN subsystems ss ON ss.id = pu.subsystem_id
          WHERE ss.system_id = v_sys AND pu.category = 'B' AND pu.status IN ('open', 'in_progress');
        ELSIF g ->> 'work_state' = 'work' AND v_phase IS NOT NULL AND EXISTS (
          SELECT 1 FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id
          WHERE ss.system_id = v_sys AND i.phase_id = v_phase AND i.status <> 'approved') THEN
          kind := 'itrs';
          SELECT COUNT(*)::int INTO v_n FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id
          WHERE ss.system_id = v_sys AND i.phase_id = v_phase AND i.status <> 'approved';
          SELECT COALESCE(array_agg(t.user_id), '{}') INTO v_users FROM (
            SELECT a.user_id FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id
            JOIN itr_assignments a ON a.itr_id = i.id AND a.role = 'executor'
            WHERE ss.system_id = v_sys AND i.phase_id = v_phase AND i.status <> 'approved'
            GROUP BY a.user_id ORDER BY COUNT(*) DESC, a.user_id LIMIT 1) t;
        ELSE
          kind := COALESCE(g -> 'blocker' ->> 'kind', 'unknown');
          v_users := '{}'; v_n := NULL;
        END IF;
      END IF;
    END IF;

    capacity := v_cap;
    item_count := v_n;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.full_name) ORDER BY pr.full_name) FILTER (WHERE pr.id IS NOT NULL), '[]'::jsonb)
      INTO people
    FROM (SELECT pr.id, pr.full_name FROM profiles pr WHERE pr.id = ANY (v_users) ORDER BY pr.full_name LIMIT 5) pr;
    RETURN NEXT;
  END LOOP;
END;
$function$;
