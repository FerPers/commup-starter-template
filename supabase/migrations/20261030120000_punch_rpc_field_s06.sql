-- S06 — Punch: permisos de campo y escritura por RPC (C-03/A-15/I-02 confirmados de S1-v1; A-06/I-04/C-11, C-04/A-03,
-- B-10, C-22, C-44; decisión D8). 2026-10-19.
--
-- D8: el inspector levanta, comenta, adjunta y resuelve (S1-v1); recategorizar y cancelar es de supervisor (leader+),
--     con motivo, y cancelar lo hace una persona distinta de quien lo levantó.
-- A-06/I-04: `punches_update` deja de abrirse a cualquier miembro: solo roles de campo (no client), y `guard_punch_row`
--     impide por REST cancelar, cambiar la categoría o el seguimiento de Operaciones; el inspector solo clasifica
--     (impacto, disposición para el arranque). Cancelar = `cancel_punch` (auditado en activity_log y comentarios).
--     Un Cat A cancelado deja de bloquear en el acto: la elegibilidad de certificados y gates se calcula en vivo.
-- C-04/A-03: `update_punch_ops_status` exige sesión (o service role explícito), rol de supervisor u Operaciones y una
--     máquina de estados; `verified_ops` solo desde `resolved_ops` y `closed_final` solo desde `verified_ops`, cada uno
--     por otra persona (nunca por API). `transfer_punch_to_ops` exige supervisor, punch abierto y receptor de la org.
-- B-10: numeración por `punch_counters` (sembrado aquí); el MAX por regex solo la primera vez del proyecto.
-- C-22: `punches.itr_item_id` (ítem del ITR que originó el punch).
-- C-44: colas `punches_verify` (quien lo levantó o un supervisor) y `signatures` (solo firmantes) en `my_work_counts`.
--
-- Funciones editadas en su archivo canónico (supabase/functions-sql/) y emitidas completas.

-- ── Columnas y políticas ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.punches
  ADD COLUMN itr_item_id uuid REFERENCES public.itr_template_items(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.punches.itr_item_id IS 'S06 (C-22): ítem del ITR desde el que se levantó el punch.';

DROP POLICY punches_update ON public.punches;
CREATE POLICY punches_update ON public.punches FOR UPDATE
  USING (project_id IN (SELECT public.get_my_project_ids()) AND public.is_project_field_member(project_id))
  WITH CHECK (project_id IN (SELECT public.get_my_project_ids()) AND public.is_project_field_member(project_id));

-- B-10: contador sembrado con el mayor número vigente de cada proyecto.
INSERT INTO public.punch_counters (project_id, last_seq)
SELECT project_id, MAX(CASE WHEN punch_number ~ '^P-\d+$' THEN SUBSTRING(punch_number FROM 3)::int ELSE 0 END)
FROM public.punches GROUP BY project_id
ON CONFLICT (project_id) DO UPDATE SET last_seq = GREATEST(public.punch_counters.last_seq, EXCLUDED.last_seq);

-- ── Funciones canónicas ───────────────────────────────────────────────────────────────────────────

-- guard_punch_row  (supabase/functions-sql/guard_punch_row.sql)
CREATE OR REPLACE FUNCTION public.guard_punch_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  trusted boolean := auth.uid() IS NULL
    OR current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.punches'::regclass));
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT trusted THEN
      NEW.resolved_at := NULL; NEW.resolved_by := NULL; NEW.verified_by := NULL;
      NEW.category_reviewed_at := NULL; NEW.category_reviewed_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT trusted THEN
    IF (NEW.resolved_at, NEW.resolved_by, NEW.verified_by, NEW.category_reviewed_at, NEW.category_reviewed_by)
       IS DISTINCT FROM (OLD.resolved_at, OLD.resolved_by, OLD.verified_by, OLD.category_reviewed_at, OLD.category_reviewed_by) THEN
      RAISE EXCEPTION 'La resolución, la verificación y la revisión de categoría se registran con su acción' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      RAISE EXCEPTION 'Para cerrar un punch hay que verificarlo en campo (otra persona, sobre un punch resuelto)' USING ERRCODE = 'P0001';
    END IF;
    -- S06 (A-06/C-11/I-04, D8): cancelar, cambiar la categoría y el seguimiento de Operaciones solo por su RPC.
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Para cancelar un punch usa «Cancelar»: lo hace un supervisor distinto de quien lo levantó, con motivo' USING ERRCODE = '42501';
    END IF;
    IF NEW.category IS DISTINCT FROM OLD.category THEN
      RAISE EXCEPTION 'La categoría se cambia en la revisión de categoría (supervisor, con motivo)' USING ERRCODE = '42501';
    END IF;
    IF (NEW.post_handover_status, NEW.transferred_at, NEW.transferred_to_user_id, NEW.ops_target_date, NEW.ops_notes)
       IS DISTINCT FROM (OLD.post_handover_status, OLD.transferred_at, OLD.transferred_to_user_id, OLD.ops_target_date, OLD.ops_notes) THEN
      RAISE EXCEPTION 'El seguimiento de Operaciones se registra con su acción' USING ERRCODE = '42501';
    END IF;
    -- En campo (inspector) solo se clasifica: impacto y disposición para el arranque. Lo demás, un supervisor.
    IF NOT public.is_project_editor(OLD.project_id)
       AND (to_jsonb(NEW) - 'impact' - 'startup_disposition') IS DISTINCT FROM (to_jsonb(OLD) - 'impact' - 'startup_disposition') THEN
      RAISE EXCEPTION 'Solo un supervisor edita el punch; en campo puedes comentar, adjuntar fotos y resolverlo' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'open' AND OLD.status <> 'open' THEN
    NEW.resolved_at := NULL; NEW.resolved_by := NULL; NEW.verified_by := NULL;
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category AND NEW.category_reviewed_at IS NOT DISTINCT FROM OLD.category_reviewed_at THEN
    NEW.category_reviewed_at := NULL; NEW.category_reviewed_by := NULL;
  END IF;
  RETURN NEW;
END;
$function$;


-- cancel_punch  (supabase/functions-sql/cancel_punch.sql)
CREATE OR REPLACE FUNCTION public.cancel_punch(p_punch_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.punches; v_role text; v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  -- S06 (C-11/A-06, D8): cancelar es de supervisor, con motivo, por alguien distinto de quien lo levantó, y queda auditado.
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un supervisor cancela un punch' USING ERRCODE = '42501';
  END IF;
  IF v.raised_by = auth.uid() THEN
    RAISE EXCEPTION 'Lo cancela una persona distinta de quien lo levantó' USING ERRCODE = 'P0001';
  END IF;
  IF v.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'El punch ya está cerrado o cancelado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Explica por qué se cancela (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;

  UPDATE punches SET status = 'cancelled', closed_date = CURRENT_DATE WHERE id = p_punch_id;
  INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Cancelado: ' || v_reason);
  PERFORM public.punch_log(v, 'cancelled', jsonb_build_object('reason', v_reason, 'category', v.category, 'previousStatus', v.status));
END;
$function$;


-- update_punch_ops_status  (supabase/functions-sql/update_punch_ops_status.sql)
CREATE OR REPLACE FUNCTION public.update_punch_ops_status(p_punch_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_target_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v          punches;
  v_cur      text;
  v_role     text;
  v_service  boolean := COALESCE(auth.role() = 'service_role', false);  -- sin claims auth.role() es NULL
  v_previous uuid;
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch not found'; END IF;

  -- S06 (C-04/A-03): sin sesión solo el service role explícito (API v1, que ya validó la org).
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    v_role := public.punch_caller_role(v);
    IF v_role IS NULL OR NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR v_role = ANY (public.hold_release_roles('operations'))) THEN
      RAISE EXCEPTION 'Sin permiso para el seguimiento de Operaciones' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_cur := COALESCE(v.post_handover_status, 'active');
  IF v_cur = 'active' THEN
    RAISE EXCEPTION 'El punch no está transferido a Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN ('in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops') THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;
  -- Máquina de estados: cerrar solo desde verificado; verificar solo desde resuelto.
  IF NOT (
       (v_cur IN ('transferred_to_ops', 'in_progress_ops', 'deferred') AND p_new_status IN ('in_progress_ops', 'deferred', 'resolved_ops', 'cancelled_ops') AND p_new_status <> v_cur)
    OR (v_cur = 'resolved_ops' AND p_new_status IN ('verified_ops', 'in_progress_ops'))
    OR (v_cur = 'verified_ops' AND p_new_status = 'closed_final')
  ) THEN
    RAISE EXCEPTION 'Transición no permitida en Operaciones: % → %', v_cur, p_new_status USING ERRCODE = 'P0001';
  END IF;
  -- Verificar y cerrar los hace una persona, distinta de quien resolvió (o verificó).
  IF p_new_status IN ('verified_ops', 'closed_final') THEN
    IF v_service THEN
      RAISE EXCEPTION 'La verificación y el cierre en Operaciones los hace una persona en la app' USING ERRCODE = '42501';
    END IF;
    SELECT e.performed_by INTO v_previous FROM punch_post_handover_events e
    WHERE e.punch_id = p_punch_id AND e.to_status = v_cur ORDER BY e.performed_at DESC LIMIT 1;
    IF v_previous = auth.uid() THEN
      RAISE EXCEPTION 'Lo % una persona distinta de quien lo %', CASE WHEN p_new_status = 'verified_ops' THEN 'verifica' ELSE 'cierra' END,
        CASE WHEN p_new_status = 'verified_ops' THEN 'resolvió' ELSE 'verificó' END USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN CURRENT_DATE ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;


-- transfer_punch_to_ops  (supabase/functions-sql/transfer_punch_to_ops.sql)
CREATE OR REPLACE FUNCTION public.transfer_punch_to_ops(p_punch_id uuid, p_transferred_to uuid, p_ops_target_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_category   TEXT;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.category::text, pu.post_handover_status
    INTO v_project_id, v_category, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Punch not found';
  END IF;

  -- S06 (A-03): sin sesión solo el service role explícito (API v1, que ya validó la org); con sesión, un supervisor.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT public.is_project_editor(v_project_id) THEN
      RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_category <> 'B' THEN
    RAISE EXCEPTION 'Only Cat B punches can be transferred to Operations';
  END IF;
  IF COALESCE(v_cur_status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'El punch ya está en Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM punches WHERE id = p_punch_id AND status IN ('closed', 'cancelled')) THEN
    RAISE EXCEPTION 'El punch está cerrado o cancelado' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects p JOIN org_members m ON m.org_id = p.org_id WHERE p.id = v_project_id AND m.user_id = p_transferred_to) THEN
    RAISE EXCEPTION 'La persona de Operaciones no es miembro de la organización' USING ERRCODE = 'P0001';
  END IF;

  UPDATE punches SET
    post_handover_status   = 'transferred_to_ops',
    transferred_at         = now(),
    transferred_to_user_id = p_transferred_to,
    ops_target_date        = COALESCE(p_ops_target_date, ops_target_date),
    ops_notes              = COALESCE(p_notes, ops_notes),
    assigned_to            = p_transferred_to
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id, 'transferred', COALESCE(v_cur_status, 'active'),
    'transferred_to_ops', auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;


-- next_punch_number_atomic  (supabase/functions-sql/next_punch_number_atomic.sql)
CREATE OR REPLACE FUNCTION public.next_punch_number_atomic(p_project_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing INTEGER;
  v_next     INTEGER;
BEGIN
  -- S06 (B-10): el contador manda; el MAX por regex solo se calcula la primera vez de cada proyecto.
  UPDATE punch_counters SET last_seq = last_seq + 1 WHERE project_id = p_project_id RETURNING last_seq INTO v_next;
  IF NOT FOUND THEN
    SELECT COALESCE(MAX(CASE WHEN punch_number ~ '^P-\d+$' THEN SUBSTRING(punch_number FROM 3)::int ELSE 0 END), 0)
      INTO v_existing FROM punches WHERE project_id = p_project_id;
    INSERT INTO punch_counters (project_id, last_seq) VALUES (p_project_id, v_existing + 1)
    ON CONFLICT (project_id) DO UPDATE SET last_seq = GREATEST(punch_counters.last_seq, v_existing) + 1
    RETURNING last_seq INTO v_next;
  END IF;
  -- Un número cargado a mano (API, Excel) no debe chocar: se salta (índice único por proyecto, barato).
  WHILE EXISTS (SELECT 1 FROM punches WHERE project_id = p_project_id AND punch_number = 'P-' || LPAD(v_next::text, 4, '0')) LOOP
    UPDATE punch_counters SET last_seq = last_seq + 1 WHERE project_id = p_project_id RETURNING last_seq INTO v_next;
  END LOOP;

  RETURN 'P-' || LPAD(v_next::text, 4, '0');
END;
$function$;


-- my_work_counts  (supabase/functions-sql/my_work_counts.sql)
CREATE OR REPLACE FUNCTION public.my_work_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with proj as (
    select id from projects where org_id = p_org_id
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
        and wp.plan_date <= current_date
        and wp.project_id in (select id from proj)
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
      where pp.status = 'active'
        and pp.next_due_date < current_date
        and pp.project_id in (select id from proj)
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
        and (select role from me) = any (public.hold_release_roles(st.hold_capacity))
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
        and (select role from me) = any (public.hold_release_roles(ev.witness_capacity))
        and ev.project_id in (select id from proj)
    ),
    'transfers_to_sign', (
      select count(*)
      from ownership_transfers tr
      where tr.status = 'pending_signatures'
        and tr.project_id in (select id from proj)
        and auth.uid() is distinct from tr.commissioning_signed_by
        and auth.uid() is distinct from tr.operations_signed_by
        and ((tr.commissioning_signed_by is null and (select role from me) in ('owner', 'admin', 'architect', 'leader'))
          or (tr.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations'))))
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
        and ((pc.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations')))
          or (pc.client_signed_by is null and (select role from me) = 'client'))
    )
  );
$function$;


REVOKE EXECUTE ON FUNCTION public.cancel_punch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_punch(uuid, text) TO authenticated, service_role;
