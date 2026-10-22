-- N1b: página propia del punch (/projects/<id>/punches/<punch_id>).
--   El aviso «Punch Cat A» (notify_obligation_trg) abre el punch, no la lista del proyecto.
--   Los avisos ya enviados de punch (punch_cat_a, punch_assigned) se corrigen al mismo destino si el punch existe.

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
      left(NEW.description, 300), '/projects/' || NEW.project_id || '/punches/' || NEW.id,
      jsonb_build_object('punchId', NEW.id, 'projectId', NEW.project_id));
  END IF;
  RETURN NULL;
END;
$function$;


UPDATE public.notifications n
SET link_url = '/projects/' || pu.project_id || '/punches/' || pu.id
FROM public.punches pu
WHERE n.kind IN ('punch_cat_a', 'punch_assigned')
  AND n.payload ->> 'punchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND pu.id = (n.payload ->> 'punchId')::uuid
  AND n.link_url IS DISTINCT FROM '/projects/' || pu.project_id || '/punches/' || pu.id;
