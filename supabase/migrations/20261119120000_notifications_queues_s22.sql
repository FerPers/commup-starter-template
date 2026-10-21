-- S22: avisos y colas (D16: en la app + push; cada usuario elige temas).
--   D-04 / H-02  Las tareas de readiness llegan a la persona: colas nuevas en Mi trabajo (gates por aprobar, por
--                co-firmar y en regresión; registros por autorizar y por verificar; reportes diarios por emitir; TQ
--                respondidas) desde UNA función (my_readiness_items) que usan el contador y la lista; y un aviso
--                (notifications) cada vez que se crea una obligación para otra persona: co-firma de gate, traspaso,
--                PTC, hold point, hito por atestiguar, TQ respondida, acción asignada o hecha, registro por
--                autorizar o verificar, punch Cat A; y desde las transiciones del estado de gates de S20 (gate listo
--                / en regresión). pg_cron `gate-status-refresh` recalcula los sistemas sucios cada minuto, así las
--                colas y los avisos de gates no esperan a que alguien abra Control Tower.
--   I-09         Push desde `notifications` (antes: desde domain_events con eventos que no existían). La cola de push
--                de S21 (push_outbox por evento) se reemplaza por notification_push_outbox, que solo guarda avisos de
--                usuarios con una suscripción activa. Temas = categorías de aviso (src/lib/notifications/topics.ts).
--   D-23         (TS) el badge solo suma lo personal; la página usa el mismo total.
-- El resumen diario por correo (D16) queda fuera: no hay proveedor de correo transaccional (Supabase SMTP es solo auth).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Destinatarios y avisos
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Quienes tienen una capacidad en el proyecto (= has_capacity): designados si los hay; si no, el rol de respaldo.
CREATE OR REPLACE FUNCTION public.capacity_holders(p_project_id uuid, p_capacity text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT pc.user_id FROM project_capacities pc
  JOIN org_members om ON om.org_id = pc.org_id AND om.user_id = pc.user_id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE pc.project_id = p_project_id AND pc.capacity = p_capacity AND pc.revoked_at IS NULL
    AND public.capacity_designated(p_project_id, p_capacity)
  UNION
  SELECT om.user_id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE p.id = p_project_id AND NOT public.capacity_designated(p_project_id, p_capacity)
    AND om.role::text = ANY (public.capacity_fallback_roles(p_capacity))
$function$;

-- Miembros activos de la org del proyecto con alguno de esos roles.
CREATE OR REPLACE FUNCTION public.project_role_members(p_project_id uuid, p_roles text[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT om.user_id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE p.id = p_project_id AND om.role::text = ANY (p_roles)
$function$;

-- Quienes pueden aprobar un gate (= approve_system_gate): rol en approval_roles y, si hay designados de
-- Comisionamiento, solo ellos.
CREATE OR REPLACE FUNCTION public.gate_approvers(p_project_id uuid, p_gate_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT u FROM public.project_role_members(p_project_id, (SELECT rg.approval_roles FROM readiness_gates rg WHERE rg.id = p_gate_id)) u
  WHERE NOT public.capacity_designated(p_project_id, 'commissioning') OR public.has_capacity(p_project_id, 'commissioning', u)
$function$;

-- Quienes pueden co-firmar una capacidad de un gate (= sign_system_gate): designados, o el rol en cosign_roles.
CREATE OR REPLACE FUNCTION public.gate_cosigners(p_project_id uuid, p_gate_id uuid, p_capacity text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT u FROM public.capacity_holders(p_project_id, p_capacity) u WHERE public.capacity_designated(p_project_id, p_capacity)
  UNION
  SELECT u FROM public.project_role_members(p_project_id, (SELECT rg.cosign_roles FROM readiness_gates rg WHERE rg.id = p_gate_id)) u
  WHERE NOT public.capacity_designated(p_project_id, p_capacity)
$function$;

-- Inserta un aviso por destinatario: miembro activo de la org, nunca quien causó el cambio. Con p_dedupe_key, no
-- repite el mismo aviso a la misma persona dentro de 24 h (un gate que oscila no llena la bandeja).
CREATE OR REPLACE FUNCTION public.notify_users(p_org_id uuid, p_users uuid[], p_kind text, p_title text, p_body text,
                                               p_link text, p_payload jsonb DEFAULT '{}'::jsonb, p_dedupe_key text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n integer;
BEGIN
  INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
  SELECT p_org_id, u.id, p_kind, left(p_title, 200), left(p_body, 1000), p_link,
         COALESCE(p_payload, '{}'::jsonb) || CASE WHEN p_dedupe_key IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('key', p_dedupe_key) END
  FROM (SELECT DISTINCT x AS id FROM unnest(p_users) x WHERE x IS NOT NULL) u
  JOIN org_members om ON om.org_id = p_org_id AND om.user_id = u.id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE u.id IS DISTINCT FROM auth.uid()
    AND (p_dedupe_key IS NULL OR NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.recipient_user_id = u.id AND n.kind = p_kind AND n.payload ->> 'key' = p_dedupe_key
        AND n.created_at > now() - interval '24 hours'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- Una obligación nueva para otra persona → aviso. Por ramas de TG_OP: OLD no existe en un INSERT.
CREATE OR REPLACE FUNCTION public.notify_obligation_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_users uuid[]; v_code text; v_gate text; v_cap text; v_org uuid; v_run text; v_prev text;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_prev := to_jsonb(OLD) ->> 'status'; END IF;

  IF TG_TABLE_NAME = 'system_gate_approvals' THEN
    IF NEW.status <> 'pending_signatures' OR NEW.revoked_at IS NOT NULL OR v_prev = 'pending_signatures' THEN RETURN NULL; END IF;
    SELECT s.code, rg.code INTO v_code, v_gate FROM systems s, readiness_gates rg WHERE s.id = NEW.system_id AND rg.id = NEW.gate_id;
    -- Comisionamiento firma quien aprueba; se avisa a quienes pueden dar las demás firmas.
    SELECT array_agg(DISTINCT u) INTO v_users
    FROM readiness_gates rg, unnest(rg.required_signatures) c, public.gate_cosigners(NEW.project_id, NEW.gate_id, c) u
    WHERE rg.id = NEW.gate_id AND c <> 'commissioning';
    v_users := array_remove(v_users, NEW.approved_by);
    PERFORM public.notify_users(NEW.org_id, v_users, 'gate_cosign', 'Gate por co-firmar: ' || v_code || ' · ' || v_gate,
      'Falta tu firma para habilitar el gate ' || v_gate || ' del sistema ' || v_code, '/control-tower/' || NEW.system_id,
      jsonb_build_object('approvalId', NEW.id, 'systemId', NEW.system_id, 'gateId', NEW.gate_id, 'projectId', NEW.project_id));

  ELSIF TG_TABLE_NAME = 'ownership_transfers' THEN
    IF NEW.status <> 'pending_signatures' OR v_prev = 'pending_signatures' THEN RETURN NULL; END IF;
    SELECT s.code INTO v_code FROM systems s WHERE s.id = NEW.system_id;
    SELECT array_agg(DISTINCT u) INTO v_users
    FROM (SELECT public.capacity_holders(NEW.project_id, 'commissioning') u UNION SELECT public.capacity_holders(NEW.project_id, 'operations')) z;
    v_users := array_remove(v_users, NEW.requested_by);
    PERFORM public.notify_users(NEW.org_id, v_users, 'transfer_to_sign', 'Traspaso por firmar: ' || NEW.number,
      v_code || ': ' || NEW.from_stage || ' → ' || NEW.to_stage, '/projects/' || NEW.project_id || '/startup/transfers/' || NEW.id,
      jsonb_build_object('transferId', NEW.id, 'systemId', NEW.system_id, 'projectId', NEW.project_id));

  ELSIF TG_TABLE_NAME = 'performance_certificates' THEN
    IF NEW.status <> 'pending_signatures' OR v_prev = 'pending_signatures' THEN RETURN NULL; END IF;
    SELECT array_agg(DISTINCT u) INTO v_users
    FROM (SELECT public.capacity_holders(NEW.project_id, 'operations') u WHERE NEW.operations_signed_by IS NULL
          UNION SELECT public.capacity_holders(NEW.project_id, 'client_rep') WHERE NEW.client_signed_by IS NULL) z;
    v_users := array_remove(v_users, NEW.commissioning_signed_by);
    PERFORM public.notify_users(NEW.org_id, v_users, 'ptc_to_sign', 'Certificado PTC por firmar: ' || NEW.number,
      'La prueba de desempeño espera tu firma', '/projects/' || NEW.project_id || '/startup/performance/runs/' || NEW.run_id,
      jsonb_build_object('certificateId', NEW.id, 'runId', NEW.run_id, 'projectId', NEW.project_id));

  ELSIF TG_TABLE_NAME = 'procedure_run_steps' THEN
    IF NEW.status <> 'at_hold' OR v_prev = 'at_hold' THEN RETURN NULL; END IF;
    SELECT st.hold_capacity, r.number, r.org_id INTO v_cap, v_run, v_org
    FROM procedure_steps st, procedure_runs r WHERE st.id = NEW.step_id AND r.id = NEW.run_id;
    IF v_cap IS NULL THEN RETURN NULL; END IF;
    SELECT array_agg(u) INTO v_users FROM public.capacity_holders(NEW.project_id, v_cap) u;
    v_users := array_remove(v_users, NEW.done_by);
    PERFORM public.notify_users(v_org, v_users, 'hold_to_release', 'Hold point por liberar: ' || v_run || ' · paso ' || NEW.ord,
      'La ejecución está detenida esperando la liberación (' || v_cap || ')',
      '/projects/' || NEW.project_id || '/startup/runs/' || NEW.run_id,
      jsonb_build_object('runId', NEW.run_id, 'ord', NEW.ord, 'capacity', v_cap, 'projectId', NEW.project_id));

  ELSIF TG_TABLE_NAME = 'startup_events' THEN
    IF NEW.status <> 'pending_witness' OR v_prev = 'pending_witness' OR NEW.witness_capacity IS NULL THEN RETURN NULL; END IF;
    SELECT array_agg(u) INTO v_users FROM public.capacity_holders(NEW.project_id, NEW.witness_capacity) u;
    v_users := array_remove(v_users, NEW.recorded_by);
    PERFORM public.notify_users(NEW.org_id, v_users, 'milestone_to_witness', 'Hito por atestiguar: ' || NEW.number,
      NEW.title, '/projects/' || NEW.project_id || '/startup/events/' || NEW.id,
      jsonb_build_object('eventId', NEW.id, 'capacity', NEW.witness_capacity, 'projectId', NEW.project_id));

  ELSIF TG_TABLE_NAME = 'technical_queries' THEN
    IF NEW.status <> 'answered' OR v_prev = 'answered' THEN RETURN NULL; END IF;
    PERFORM public.notify_users(NEW.org_id, ARRAY[NEW.raised_by, NEW.issued_by], 'tq_answered', 'TQ respondida: ' || NEW.number,
      NEW.subject, '/projects/' || NEW.project_id || '/daily/tq/' || NEW.id,
      jsonb_build_object('tqId', NEW.id, 'projectId', NEW.project_id));

  ELSIF TG_TABLE_NAME = 'actions' THEN
    IF NEW.owner_id IS NOT NULL AND (TG_OP = 'INSERT' OR (to_jsonb(OLD) ->> 'owner_id') IS DISTINCT FROM NEW.owner_id::text) THEN
      PERFORM public.notify_users(NEW.org_id, ARRAY[NEW.owner_id], 'action_assigned', 'Acción asignada: ' || NEW.number,
        NEW.title, '/projects/' || NEW.project_id || '/daily/action/' || NEW.id,
        jsonb_build_object('actionId', NEW.id, 'projectId', NEW.project_id));
    END IF;
    IF NEW.status = 'done' AND v_prev IS DISTINCT FROM 'done' THEN
      PERFORM public.notify_users(NEW.org_id, array_remove(ARRAY[NEW.created_by], NEW.done_by), 'action_to_verify',
        'Acción por verificar: ' || NEW.number, NEW.title, '/projects/' || NEW.project_id || '/daily/action/' || NEW.id,
        jsonb_build_object('actionId', NEW.id, 'projectId', NEW.project_id));
    END IF;

  ELSIF TG_TABLE_NAME = 'register_items' THEN
    IF NEW.status = 'proposed' AND v_prev IS DISTINCT FROM 'proposed' THEN
      SELECT array_agg(u) INTO v_users FROM public.project_role_members(NEW.project_id, ARRAY['owner', 'admin', 'architect', 'leader']) u;
      PERFORM public.notify_users(NEW.org_id, array_remove(v_users, NEW.proposed_by), 'register_to_authorize',
        'Registro por autorizar: ' || NEW.number, NEW.title, '/projects/' || NEW.project_id || '/registers/' || NEW.id,
        jsonb_build_object('itemId', NEW.id, 'projectId', NEW.project_id));
    ELSIF NEW.status = 'removed' AND v_prev IS DISTINCT FROM 'removed' THEN
      PERFORM public.notify_users(NEW.org_id, array_remove(ARRAY[NEW.authorized_by, NEW.activated_by, NEW.owner_id], NEW.removed_by),
        'register_to_verify', 'Registro por verificar: ' || NEW.number, NEW.title,
        '/projects/' || NEW.project_id || '/registers/' || NEW.id, jsonb_build_object('itemId', NEW.id, 'projectId', NEW.project_id));
    END IF;

  ELSIF TG_TABLE_NAME = 'punches' THEN
    IF TG_OP <> 'INSERT' OR NEW.category <> 'A' THEN RETURN NULL; END IF;
    SELECT p.org_id INTO v_org FROM projects p WHERE p.id = NEW.project_id;
    SELECT array_agg(u) INTO v_users FROM public.project_role_members(NEW.project_id, ARRAY['owner', 'admin', 'architect', 'leader']) u;
    PERFORM public.notify_users(v_org, array_remove(v_users, NEW.raised_by), 'punch_cat_a', 'Punch Cat A: ' || NEW.punch_number,
      left(NEW.description, 300), '/projects/' || NEW.project_id || '/punches',
      jsonb_build_object('punchId', NEW.id, 'projectId', NEW.project_id));
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_notify_gate_approvals AFTER INSERT OR UPDATE ON public.system_gate_approvals
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_transfers AFTER INSERT OR UPDATE ON public.ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_performance_certificates AFTER INSERT OR UPDATE ON public.performance_certificates
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_run_steps AFTER INSERT OR UPDATE ON public.procedure_run_steps
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_startup_events AFTER INSERT OR UPDATE ON public.startup_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_technical_queries AFTER UPDATE ON public.technical_queries
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_actions AFTER INSERT OR UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_register_items AFTER INSERT OR UPDATE ON public.register_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
CREATE TRIGGER trg_notify_punch_cat_a AFTER INSERT ON public.punches
  FOR EACH ROW WHEN (NEW.category = 'A') EXECUTE FUNCTION public.notify_obligation_trg();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Transiciones del estado de gates (S20) → aviso + evento de negocio
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.gate_status_transition_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record; v_code text; v_users uuid[]; v_type text;
BEGIN
  -- El primer cálculo (OLD.gates nulo) no es una transición.
  IF OLD.gates IS NULL OR NEW.gates IS NULL OR OLD.gates = NEW.gates THEN RETURN NULL; END IF;
  SELECT s.code INTO v_code FROM systems s WHERE s.id = NEW.system_id;
  FOR r IN
    SELECT n ->> 'gate_id' AS gate_id, n ->> 'code' AS gate_code, n ->> 'status' AS status, o ->> 'status' AS prev,
           n -> 'approval' ->> 'approved_by' AS approved_by
    FROM jsonb_array_elements(NEW.gates) n
    LEFT JOIN jsonb_array_elements(OLD.gates) o ON o ->> 'gate_id' = n ->> 'gate_id'
    WHERE (n ->> 'status') IS DISTINCT FROM (o ->> 'status')
  LOOP
    v_type := NULL;
    IF r.status IN ('ready', 'ready_with_conditions') AND COALESCE(r.prev, '') NOT IN ('ready', 'ready_with_conditions') THEN
      v_type := 'gate.ready';
      SELECT array_agg(u) INTO v_users FROM public.gate_approvers(NEW.project_id, r.gate_id::uuid) u;
      PERFORM public.notify_users(NEW.org_id, v_users, 'gate_ready', 'Gate listo para aprobar: ' || v_code || ' · ' || r.gate_code,
        CASE WHEN r.status = 'ready' THEN 'Cumple todos sus criterios' ELSE 'Cumple sus criterios con condiciones' END,
        '/control-tower/' || NEW.system_id,
        jsonb_build_object('systemId', NEW.system_id, 'gateId', r.gate_id, 'projectId', NEW.project_id),
        NEW.system_id || ':' || r.gate_id || ':ready');
    ELSIF r.status IN ('regressed', 'approved_needs_review') AND COALESCE(r.prev, '') NOT IN ('regressed', 'approved_needs_review') THEN
      v_type := 'gate.regressed';
      SELECT array_agg(u) INTO v_users FROM public.gate_approvers(NEW.project_id, r.gate_id::uuid) u;
      v_users := v_users || (r.approved_by)::uuid;
      PERFORM public.notify_users(NEW.org_id, v_users, 'gate_regressed',
        CASE WHEN r.status = 'regressed' THEN 'Gate en regresión: ' ELSE 'Gate aprobado por revisar: ' END || v_code || ' · ' || r.gate_code,
        CASE WHEN r.status = 'regressed' THEN 'Un gate aprobado dejó de cumplir un criterio bloqueante'
             ELSE 'Un gate aprobado tiene una condición nueva' END,
        '/control-tower/' || NEW.system_id,
        jsonb_build_object('systemId', NEW.system_id, 'gateId', r.gate_id, 'projectId', NEW.project_id, 'status', r.status),
        NEW.system_id || ':' || r.gate_id || ':regressed');
    END IF;
    IF v_type IS NOT NULL THEN
      INSERT INTO domain_events (org_id, project_id, aggregate_type, aggregate_id, event_type, payload, actor_id)
      VALUES (NEW.org_id, NEW.project_id, 'gate', NEW.system_id, v_type, jsonb_strip_nulls(jsonb_build_object(
        'system_id', NEW.system_id, 'system_code', v_code, 'gate_id', r.gate_id, 'gate_code', r.gate_code,
        'status', r.status, 'previous_status', r.prev)), auth.uid());
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_gate_status_transitions AFTER UPDATE OF gates ON public.system_gate_status
  FOR EACH ROW EXECUTE FUNCTION public.gate_status_transition_trg();

-- Recalcula los sistemas sucios de hasta 50 proyectos (pg_cron cada minuto): colas y avisos al día sin Control Tower.
CREATE OR REPLACE FUNCTION public.gate_status_refresh_dirty()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_p uuid; v_n integer := 0;
BEGIN
  FOR v_p IN
    SELECT DISTINCT st.project_id FROM system_gate_status st
    WHERE st.computed_version IS DISTINCT FROM st.version
    LIMIT 50
  LOOP
    PERFORM count(*) FROM public.compute_project_gates(v_p);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

-- Las colas de Mi trabajo leen el estado guardado (S20) como el usuario: lectura para miembros del proyecto.
GRANT SELECT ON public.system_gate_status TO authenticated;
CREATE POLICY system_gate_status_select ON public.system_gate_status FOR SELECT
  USING (project_id IN (SELECT get_my_project_ids()));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Colas de readiness (una sola fuente para el contador y la lista)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.my_readiness_items(p_org_id uuid)
 RETURNS TABLE(queue text, project_id uuid, entity_id uuid, ref text, title text, system_id uuid, system_code text, since timestamptz)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH proj AS (
    SELECT p.id, public.tz_today(p.timezone) AS today FROM projects p WHERE p.org_id = p_org_id
  ),
  me AS (
    SELECT om.role::text AS role FROM org_members om
    WHERE om.org_id = p_org_id AND om.user_id = auth.uid() AND om.status = 'active'
      AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  ),
  gs AS (
    -- Estado guardado de S20 (lo refresca pg_cron cada minuto).
    SELECT st.project_id, st.system_id, s.code AS system_code, (g ->> 'gate_id')::uuid AS gate_id, g ->> 'code' AS gate_code,
           g ->> 'status' AS status, st.computed_at
    FROM system_gate_status st
    JOIN systems s ON s.id = st.system_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(st.gates, '[]'::jsonb)) g
    WHERE st.project_id IN (SELECT id FROM proj)
  )
  -- Gates que cumplen y que puedo aprobar (= approve_system_gate).
  SELECT 'gates_to_approve', gs.project_id, gs.gate_id, gs.gate_code, NULL::text, gs.system_id, gs.system_code, gs.computed_at
  FROM gs JOIN readiness_gates rg ON rg.id = gs.gate_id
  WHERE gs.status IN ('ready', 'ready_with_conditions')
    AND (SELECT role FROM me) = ANY (rg.approval_roles)
    AND (NOT public.capacity_designated(gs.project_id, 'commissioning') OR public.has_capacity(gs.project_id, 'commissioning'))
  UNION ALL
  -- Gates aprobados que dejaron de cumplir (o con una condición nueva): los revisa quien puede aprobar.
  SELECT 'gates_regressed', gs.project_id, gs.gate_id, gs.gate_code, gs.status, gs.system_id, gs.system_code, gs.computed_at
  FROM gs JOIN readiness_gates rg ON rg.id = gs.gate_id
  WHERE gs.status IN ('regressed', 'approved_needs_review')
    AND (SELECT role FROM me) = ANY (rg.approval_roles)
  UNION ALL
  -- Aprobaciones con una firma que me toca (= sign_system_gate) y que no firmé.
  SELECT 'gates_to_cosign', a.project_id, a.id, rg.code, NULL, a.system_id, s.code, a.approved_at
  FROM system_gate_approvals a
  JOIN readiness_gates rg ON rg.id = a.gate_id
  JOIN systems s ON s.id = a.system_id
  WHERE a.project_id IN (SELECT id FROM proj) AND a.status = 'pending_signatures' AND a.revoked_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM system_gate_signatures x WHERE x.approval_id = a.id AND x.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM unnest(rg.required_signatures) c
      WHERE NOT EXISTS (SELECT 1 FROM system_gate_signatures x WHERE x.approval_id = a.id AND x.capacity = c)
        AND CASE WHEN public.capacity_designated(a.project_id, c) THEN public.has_capacity(a.project_id, c)
                 ELSE (SELECT role FROM me) = ANY (rg.cosign_roles) END)
  UNION ALL
  -- Registros F3 (= transition_register_item): autoriza un líder+ distinto de quien propuso; verifica cualquiera
  -- que no sea cliente, distinto de quien retiró.
  SELECT 'registers_to_authorize', ri.project_id, ri.id, ri.number, ri.title, ri.system_id, s.code, ri.proposed_at
  FROM register_items ri LEFT JOIN systems s ON s.id = ri.system_id
  WHERE (SELECT role FROM me) IN ('owner', 'admin', 'architect', 'leader')
    AND ri.status = 'proposed' AND ri.proposed_by IS DISTINCT FROM auth.uid() AND ri.project_id IN (SELECT id FROM proj)
  UNION ALL
  SELECT 'registers_to_verify', ri.project_id, ri.id, ri.number, ri.title, ri.system_id, s.code, ri.removed_at
  FROM register_items ri LEFT JOIN systems s ON s.id = ri.system_id
  WHERE (SELECT role FROM me) <> 'client'
    AND ri.status = 'removed' AND ri.removed_by IS DISTINCT FROM auth.uid() AND ri.project_id IN (SELECT id FROM proj)
  UNION ALL
  -- Reportes diarios en borrador de hoy o antes (emite un líder+, = issue_daily_report).
  SELECT 'daily_reports_to_issue', dr.project_id, dr.id, dr.number, NULL, NULL, NULL, dr.created_at
  FROM daily_reports dr JOIN proj ON proj.id = dr.project_id
  WHERE (SELECT role FROM me) IN ('owner', 'admin', 'architect', 'leader')
    AND dr.status = 'draft' AND dr.report_date <= proj.today
  UNION ALL
  -- TQ respondidas que levanté o emití: las cierro yo.
  SELECT 'tq_answered', tq.project_id, tq.id, tq.number, tq.subject, tq.system_id, s.code, tq.responded_at
  FROM technical_queries tq LEFT JOIN systems s ON s.id = tq.system_id
  WHERE tq.status = 'answered' AND (tq.raised_by = auth.uid() OR tq.issued_by = auth.uid())
    AND tq.project_id IN (SELECT id FROM proj)
$function$;

CREATE OR REPLACE FUNCTION public.my_work_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with proj as (
    -- S10 (G-13/D-05): «hoy» de cada proyecto según projects.timezone
    select id, public.tz_today(timezone) as today from projects where org_id = p_org_id
  ),
  me as (
    select role::text as role from org_members where org_id = p_org_id and user_id = auth.uid()
  )
  select jsonb_build_object(
    'itrs_execute', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role = 'executor'
        and i.status <> 'approved'
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
        and i.project_id in (select id from proj)
    ),
    'itrs_review', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role in ('supervisor', 'client')
        and i.status = 'completed'
        and i.project_id in (select id from proj)
        and not exists (
          select 1 from itr_signatures s where s.itr_id = i.id and s.role = a.role
        )
        -- S04 (C-17, D4/D6): solo un rol que el ITR exige, con las firmas requeridas anteriores ya puestas,
        -- y si no firmé ya otro rol del mismo ITR. Espejo de isMyTurnToSign (src/lib/my-work/queues.ts).
        and a.role::text = any (i.required_signatures)
        and not exists (
          select 1 from unnest(i.required_signatures) r
          where array_position(array['executor', 'supervisor', 'client'], r) < array_position(array['executor', 'supervisor', 'client'], a.role::text)
            and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role::text = r)
        )
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.user_id = auth.uid())
    ),
    'punches', (
      select count(*)
      from punches p
      where p.assigned_to = auth.uid()
        and p.status in ('open', 'in_progress')
        and p.resolved_at is null
        and p.project_id in (select id from proj)
    ),
    'punches_verify', (
      select count(*)
      from punches p
      where p.status = 'in_progress'
        and p.resolved_at is not null
        and p.resolved_by is distinct from auth.uid()
        and p.project_id in (select id from proj)
        -- S06 (C-44): quien lo levantó, o un supervisor; antes contaba todos los de la org para todos.
        and (p.raised_by = auth.uid() or (select role from me) in ('owner', 'admin', 'architect', 'leader'))
    ),
    'punches_review', (
      select case when (select role from me) in ('owner', 'admin', 'architect', 'leader') then (
        select count(*)
        from punches p
        where p.status in ('open', 'in_progress')
          and p.category_reviewed_at is null
          and p.raised_by is distinct from auth.uid()
          and p.project_id in (select id from proj)
      ) else 0 end
    ),
    'plan_items', (
      select count(*)
      from work_plan_items wi
      join work_plans wp on wp.id = wi.work_plan_id
      where wi.assigned_to = auth.uid()
        and wi.status in ('not_started', 'in_progress')
        and wp.status in ('published', 'in_progress')
        and wp.plan_date <= (select today from proj where proj.id = wp.project_id)
    ),
    'signatures', (
      -- S06 (C-44): solo para quien firma certificados (canSignCertificates en src/lib/my-work/queues.ts).
      select case when (select role from me) in ('owner', 'admin', 'architect') then count(*) else 0 end
      from certificates c
      where c.status = 'issued'
        and c.project_id in (select id from proj)
        and not exists (
          select 1 from certificate_signatures cs
          where cs.certificate_id = c.id and cs.role = 'completion'
        )
    ),
    'preservation_overdue', (
      select count(*)
      from preservation_plans pp
      join proj on proj.id = pp.project_id
      where public.preservation_is_overdue(pp.status, pp.next_due_date, proj.today)
    ),
    'actions_mine', (
      select count(*)
      from actions a
      where a.owner_id = auth.uid()
        and a.status in ('open', 'in_progress')
        and a.project_id in (select id from proj)
    ),
    'actions_verify', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from actions a
        where a.status = 'done'
          and a.done_by is distinct from auth.uid()
          and a.project_id in (select id from proj)
      ) else 0 end
    ),
    'constraints_mine', (
      select count(*)
      from project_constraints c
      where c.owner_id = auth.uid()
        and c.status = 'open'
        and c.project_id in (select id from proj)
    ),
    'handovers_to_receive', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from shift_handovers h
        where h.status = 'handed_over'
          and h.handed_by is distinct from auth.uid()
          and h.project_id in (select id from proj)
      ) else 0 end
    ),
    'holds_to_release', (
      select count(*)
      from procedure_run_steps rs
      join procedure_steps st on st.id = rs.step_id
      join procedure_runs r on r.id = rs.run_id
      where rs.status = 'at_hold'
        and r.status in ('at_hold', 'stopped')
        and rs.done_by is distinct from auth.uid()
        and public.has_capacity(r.project_id, st.hold_capacity)
        and rs.project_id in (select id from proj)
    ),
    'lineup_to_verify', (
      select count(*)
      from lineup_items li
      join lineup_sheets s on s.id = li.sheet_id
      where li.is_critical and li.set_at is not null and li.verified_at is null
        and li.found_position = li.required_position
        and li.set_by is distinct from auth.uid()
        and s.status in ('issued', 'in_progress')
        and li.project_id in (select id from proj)
    ),
    'milestones_to_witness', (
      select count(*)
      from startup_events ev
      where ev.status = 'pending_witness'
        and ev.recorded_by is distinct from auth.uid()
        and public.has_capacity(ev.project_id, ev.witness_capacity)
        and ev.project_id in (select id from proj)
    ),
    'transfers_to_sign', (
      select count(*)
      from ownership_transfers tr
      where tr.status = 'pending_signatures'
        and tr.project_id in (select id from proj)
        and auth.uid() is distinct from tr.commissioning_signed_by
        and auth.uid() is distinct from tr.operations_signed_by
        and ((tr.commissioning_signed_by is null and public.has_capacity(tr.project_id, 'commissioning'))
          or (tr.operations_signed_by is null and public.has_capacity(tr.project_id, 'operations')))
    ),
    'performance_to_decide', (
      select count(*)
      from performance_runs pr
      where pr.status = 'closed'
        and (select role from me) in ('owner', 'admin', 'architect', 'leader')
        and pr.project_id in (select id from proj)
    ),
    'performance_to_sign', (
      select count(*)
      from performance_certificates pc
      where pc.status = 'pending_signatures'
        and pc.project_id in (select id from proj)
        and auth.uid() is distinct from pc.commissioning_signed_by
        and auth.uid() is distinct from pc.operations_signed_by
        and auth.uid() is distinct from pc.client_signed_by
        and ((pc.operations_signed_by is null and public.has_capacity(pc.project_id, 'operations'))
          or (pc.client_signed_by is null and public.has_capacity(pc.project_id, 'client_rep')))
    )
  )
  -- S22 (D-04/H-02): colas de readiness, misma fuente que la lista de Mi trabajo.
  || (SELECT COALESCE(jsonb_object_agg(q.queue, q.n), '{}'::jsonb)
      FROM (SELECT i.queue, COUNT(*) AS n FROM public.my_readiness_items(p_org_id) i GROUP BY i.queue) q);
$function$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- I-09 · Push desde notifications (reemplaza la cola por evento de S21)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Temas = categorías de aviso (= NOTIFICATION_TOPICS en src/lib/notifications/topics.ts). En prod no había
-- suscripciones al aplicar; cualquier tema viejo pasa al conjunto por defecto.
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_topics_valid;
UPDATE public.push_subscriptions
SET topics = ARRAY['assignments', 'signatures', 'field', 'readiness', 'overdue']
WHERE NOT (topics <@ ARRAY['assignments', 'signatures', 'field', 'readiness', 'overdue', 'punch_cat_a']);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_topics_valid
  CHECK (topics <@ ARRAY['assignments', 'signatures', 'field', 'readiness', 'overdue', 'punch_cat_a']);

CREATE TABLE public.notification_push_outbox (
  notification_id uuid PRIMARY KEY REFERENCES public.notifications (id) ON DELETE CASCADE,
  queued_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_push_outbox_queued_idx ON public.notification_push_outbox (queued_at);
ALTER TABLE public.notification_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_outbox FROM anon, authenticated;

-- Solo avisos de quien tiene una suscripción activa en esa org (sin suscripción, la cola no crece).
CREATE OR REPLACE FUNCTION public.notification_push_enqueue_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO notification_push_outbox (notification_id)
  SELECT n.id FROM new_rows n
  WHERE EXISTS (SELECT 1 FROM push_subscriptions s
                WHERE s.user_id = n.recipient_user_id AND s.org_id = n.org_id AND s.enabled)
  ON CONFLICT (notification_id) DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER notifications_push_enqueue AFTER INSERT ON public.notifications
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.notification_push_enqueue_trg();

-- Avisos para el cron de push: salen de la cola al reclamarlos (corridas solapadas no los repiten).
CREATE OR REPLACE FUNCTION public.claim_push_notifications(p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, org_id uuid, recipient_user_id uuid, kind text, title text, body text, link_url text,
               payload jsonb, created_at timestamptz)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH c AS (
    DELETE FROM notification_push_outbox po
    WHERE po.notification_id IN (
      SELECT q.notification_id FROM notification_push_outbox q ORDER BY q.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING po.notification_id
  )
  SELECT n.id, n.org_id, n.recipient_user_id, n.kind, n.title, n.body, n.link_url, n.payload, n.created_at
  FROM notifications n JOIN c ON c.notification_id = n.id
  WHERE n.read_at IS NULL
  ORDER BY n.created_at
$function$;

-- S22: el push sale de notifications; el outbox de eventos ya no llena una cola de push.
CREATE OR REPLACE FUNCTION public.outbox_dispatch(p_limit integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_events integer; v_deliveries integer; v_wf uuid[]; v_due boolean;
  v_key text; v_wf_url text; v_hook_url text; v_id uuid; v_calls integer := 0;
BEGIN
  WITH ev AS MATERIALIZED (
    SELECT d.id, d.org_id, d.project_id, d.event_type FROM domain_events d
    WHERE d.dispatched_at IS NULL
    ORDER BY d.occurred_at, d.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), dl AS (
    INSERT INTO webhook_deliveries (subscription_id, domain_event_id, status, attempts, next_retry_at)
    SELECT s.id, ev.id, 'pending', 0, now()
    FROM ev JOIN webhook_subscriptions s ON s.org_id = ev.org_id AND s.enabled
     AND (s.project_id IS NULL OR s.project_id = ev.project_id)
     AND ('*' = ANY (s.event_types) OR ev.event_type = ANY (s.event_types))
    ON CONFLICT (subscription_id, domain_event_id) DO NOTHING
    RETURNING 1
  ), up AS (
    UPDATE domain_events d SET dispatched_at = now() FROM ev WHERE d.id = ev.id RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM up), (SELECT COUNT(*) FROM dl),
         (SELECT array_agg(ev.id) FROM ev WHERE EXISTS (
            SELECT 1 FROM workflow_rules r WHERE r.org_id = ev.org_id AND r.enabled AND r.trigger_event = ev.event_type))
    INTO v_events, v_deliveries, v_wf;

  SELECT EXISTS (SELECT 1 FROM webhook_deliveries w WHERE w.status = 'pending' AND w.next_retry_at <= now()) INTO v_due;

  IF cardinality(COALESCE(v_wf, '{}')) > 0 OR v_due THEN
    BEGIN
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
      SELECT decrypted_secret INTO v_wf_url FROM vault.decrypted_secrets WHERE name = 'edge_function_url';
      SELECT decrypted_secret INTO v_hook_url FROM vault.decrypted_secrets WHERE name = 'webhook_dispatcher_url';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'outbox_dispatch: vault secrets missing';
    END;
    IF v_key IS NOT NULL THEN
      IF v_wf_url IS NOT NULL THEN
        FOREACH v_id IN ARRAY COALESCE(v_wf, '{}') LOOP
          PERFORM net.http_post(url := v_wf_url, body := jsonb_build_object('event_id', v_id),
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
            timeout_milliseconds := 5000);
          v_calls := v_calls + 1;
        END LOOP;
      END IF;
      IF v_due AND v_hook_url IS NOT NULL THEN
        PERFORM net.http_post(url := v_hook_url, body := jsonb_build_object('mode', 'retry'),
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          timeout_milliseconds := 5000);
        v_calls := v_calls + 1;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('events', v_events, 'deliveries', v_deliveries,
                            'workflow_events', cardinality(COALESCE(v_wf, '{}')), 'http_calls', v_calls);
END;
$function$;


CREATE OR REPLACE FUNCTION public.cleanup_event_retention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deliveries integer; v_events integer; v_push integer; v_notifs integer; v_http integer := 0;
BEGIN
  DELETE FROM webhook_deliveries
  WHERE status IN ('delivered', 'abandoned') AND created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deliveries = ROW_COUNT;

  DELETE FROM domain_events WHERE id IN (
    SELECT d.id FROM domain_events d
    WHERE d.occurred_at < now() - interval '365 days' AND d.dispatched_at IS NOT NULL
    LIMIT 50000);
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM notification_push_outbox WHERE queued_at < now() - interval '7 days';
  GET DIAGNOSTICS v_push = ROW_COUNT;

  DELETE FROM notifications WHERE id IN (
    SELECT n.id FROM notifications n
    WHERE n.read_at IS NOT NULL AND n.created_at < now() - interval '180 days'
    LIMIT 50000);
  GET DIAGNOSTICS v_notifs = ROW_COUNT;

  BEGIN
    DELETE FROM net._http_response WHERE created < now() - interval '2 days';
    GET DIAGNOSTICS v_http = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RAISE WARNING 'cleanup_event_retention: sin acceso a net._http_response';
  END;

  RETURN jsonb_build_object('webhook_deliveries', v_deliveries, 'domain_events', v_events, 'notification_push_outbox', v_push,
                            'notifications', v_notifs, 'http_responses', v_http);
END;
$function$;


DROP FUNCTION IF EXISTS public.claim_push_events(integer);
DROP FUNCTION IF EXISTS public.push_event_types();
DROP TABLE IF EXISTS public.push_outbox;

REVOKE EXECUTE ON FUNCTION public.capacity_holders(uuid, text), public.project_role_members(uuid, text[]),
  public.gate_approvers(uuid, uuid), public.gate_cosigners(uuid, uuid, text),
  public.notify_users(uuid, uuid[], text, text, text, text, jsonb, text), public.notify_obligation_trg(),
  public.gate_status_transition_trg(), public.gate_status_refresh_dirty(), public.notification_push_enqueue_trg(),
  public.claim_push_notifications(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_notifications(integer), public.gate_status_refresh_dirty() TO service_role;
REVOKE EXECUTE ON FUNCTION public.my_readiness_items(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_readiness_items(uuid) TO authenticated, service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gate-status-refresh';
SELECT cron.schedule('gate-status-refresh', '* * * * *', 'SELECT public.gate_status_refresh_dirty()');
