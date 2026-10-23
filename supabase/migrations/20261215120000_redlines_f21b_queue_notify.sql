-- F-21b (red-line de campo): cola «Red-lines por revisar» en Mi trabajo (my_work_counts.redlines_to_review: abiertos de
-- otros, para Líder en adelante = quien puede revisarlos) y avisos (notify_obligation_trg, rama pid_redlines):
-- red-line nuevo → Líder en adelante menos quien lo creó (redline_to_review); aceptado o rechazado → quien lo creó
-- (redline_reviewed). El enlace abre el visor en la revisión con ese red-line elegido (?rev=&rl=).
-- Cuerpos canónicos en supabase/functions-sql/{my_work_counts,notify_obligation_trg}.sql.

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
        -- Los supervisores ven todos los vencidos; el resto, los planes a su cargo (antes contaba todos para todos
        -- y el inspector y el cliente veían la cola con un número y sin filas).
        and ((select role from me) in ('owner', 'admin', 'architect', 'leader') or pp.responsible_user_id = auth.uid())
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
    -- F-21b: red-lines abiertos de otros, para quien puede revisarlos (Líder en adelante; = review_pid_redline).
    'redlines_to_review', (
      select case when (select role from me) in ('owner', 'admin', 'architect', 'leader') then (
        select count(*)
        from pid_redlines r
        where r.status = 'open'
          and r.created_by is distinct from auth.uid()
          and r.project_id in (select id from proj)
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

  -- F-21b: red-line nuevo → Líder en adelante (menos quien lo creó); aceptado o rechazado → quien lo creó.
  ELSIF TG_TABLE_NAME = 'pid_redlines' THEN
    SELECT d.number INTO v_code FROM documents d WHERE d.id = NEW.document_id;
    IF TG_OP = 'INSERT' THEN
      SELECT array_agg(u) INTO v_users FROM public.project_role_members(NEW.project_id, ARRAY['owner', 'admin', 'architect', 'leader']) u;
      PERFORM public.notify_users(NEW.org_id, array_remove(v_users, NEW.created_by), 'redline_to_review',
        'Red-line por revisar: ' || NEW.number || ' · ' || coalesce(v_code, ''), left(NEW.description, 300),
        '/projects/' || NEW.project_id || '/documents/' || NEW.document_id || '/viewer?rev=' || NEW.revision_id || '&rl=' || NEW.id,
        jsonb_build_object('redlineId', NEW.id, 'projectId', NEW.project_id));
    ELSIF NEW.status IN ('accepted', 'rejected') AND v_prev = 'open' THEN
      PERFORM public.notify_users(NEW.org_id, ARRAY[NEW.created_by], 'redline_reviewed',
        'Red-line revisado: ' || NEW.number || ' · ' || CASE NEW.status WHEN 'accepted' THEN 'aceptado' ELSE 'rechazado' END,
        coalesce(NEW.review_note, left(NEW.description, 300)),
        '/projects/' || NEW.project_id || '/documents/' || NEW.document_id || '/viewer?rev=' || NEW.revision_id || '&rl=' || NEW.id,
        jsonb_build_object('redlineId', NEW.id, 'projectId', NEW.project_id, 'status', NEW.status));
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;


CREATE TRIGGER trg_notify_pid_redlines AFTER INSERT OR UPDATE OF status ON public.pid_redlines
  FOR EACH ROW EXECUTE FUNCTION public.notify_obligation_trg();
