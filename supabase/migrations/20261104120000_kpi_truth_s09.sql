-- S09 (2026-10-19) — «cero filas para contar»: los KPIs se cuentan en SQL, no sobre ≤1000 filas.
--
--   B-01/D-08  take_kpi_snapshot(p_project_id, p_date): reemplaza el snapshot hecho en JavaScript (cron y
--              «Tomar snapshot») que contaba sobre las primeras 1000 filas de itrs/punches/preservación.
--              Solo service_role (como take_mgmt_snapshot); la acción verifica el proyecto antes.
--   B-25       clave única por (proyecto, fecha, fase, subsistema, área, sistema) NULLS NOT DISTINCT y
--              escritura idempotente (ON CONFLICT); las tablas ya no aceptan escritura directa.
--   D11        los snapshots históricos no se pueden recalcular: `suspect` marca los que pudieron salir
--              truncados (ver COMMENT). Los nuevos nacen con suspect = false.
--   B-24       una sola definición de «preservación vencida»: preservation_is_overdue() (plan activo con
--              próxima fecha anterior a hoy, sin tolerancia) y preservation_due_counts() para las pantallas.
--              my_work_counts la usa (archivo canónico).
--   B-02       subsystem_phase_itr_counts(): ITR por (subsistema, fase) para la matriz de certificados.
--   B-09       guard_itr_row toma la plantilla con FOR KEY SHARE (antes FOR UPDATE): las altas de ITR con
--              la misma plantilla ya no se serializan entre sí; la edición de la plantilla (FOR UPDATE en
--              guard_assigned_itr_template) sigue excluyéndolas.
-- Los índices (B-05, B-27) van aparte en 20261104130000, con CONCURRENTLY y fuera de transacción.

-- ── Preservación vencida: una definición ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.preservation_is_overdue(
  p_status public.preservation_plan_status, p_next_due date, p_ref date DEFAULT CURRENT_DATE
) RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT p_status = 'active' AND p_next_due < p_ref
$$;
COMMENT ON FUNCTION public.preservation_is_overdue(public.preservation_plan_status, date, date) IS
  'S09 (B-24): única definición de plan de preservación vencido (activo y próxima fecha < hoy). La usan my_work_counts, take_kpi_snapshot y preservation_due_counts.';

CREATE OR REPLACE FUNCTION public.preservation_due_counts(p_project_ids uuid[], p_days integer DEFAULT 7)
RETURNS TABLE(project_id uuid, active bigint, overdue bigint, due_soon bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT pp.project_id,
         count(*) FILTER (WHERE pp.status = 'active'),
         count(*) FILTER (WHERE public.preservation_is_overdue(pp.status, pp.next_due_date)),
         count(*) FILTER (WHERE pp.status = 'active' AND pp.next_due_date >= CURRENT_DATE
                            AND pp.next_due_date <= CURRENT_DATE + greatest(p_days, 0))
  FROM public.preservation_plans pp
  WHERE pp.project_id = ANY (p_project_ids)
  GROUP BY pp.project_id
$$;
REVOKE ALL ON FUNCTION public.preservation_is_overdue(public.preservation_plan_status, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preservation_is_overdue(public.preservation_plan_status, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.preservation_due_counts(uuid[], integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preservation_due_counts(uuid[], integer) TO authenticated, service_role;

-- ── ITR por subsistema × fase (matriz de certificados) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.subsystem_phase_itr_counts(p_project_id uuid)
RETURNS TABLE(subsystem_id uuid, phase_id uuid, itr_total bigint, itr_approved bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT i.subsystem_id, i.phase_id, count(*), count(*) FILTER (WHERE i.status = 'approved')
  FROM public.itrs i
  WHERE i.project_id = p_project_id AND i.subsystem_id IS NOT NULL AND i.phase_id IS NOT NULL
  GROUP BY i.subsystem_id, i.phase_id
$$;
REVOKE ALL ON FUNCTION public.subsystem_phase_itr_counts(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subsystem_phase_itr_counts(uuid) TO authenticated, service_role;

-- ── kpi_snapshots: clave única, marca de sospecha y escritura solo por función ───────────────────
-- Duplicados del mismo día (cron + manual simultáneos): se conserva una fila por clave.
DELETE FROM public.kpi_snapshots k
USING public.kpi_snapshots d
WHERE k.project_id = d.project_id AND k.snapshot_date = d.snapshot_date
  AND k.phase_id IS NOT DISTINCT FROM d.phase_id AND k.subsystem_id IS NOT DISTINCT FROM d.subsystem_id
  AND k.area_id IS NOT DISTINCT FROM d.area_id AND k.system_id IS NOT DISTINCT FROM d.system_id
  AND k.id < d.id;

CREATE UNIQUE INDEX IF NOT EXISTS kpi_snapshots_uq ON public.kpi_snapshots
  (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) NULLS NOT DISTINCT;
DROP INDEX IF EXISTS public.idx_kpi_snapshots_date;
DROP INDEX IF EXISTS public.idx_kpi_snapshots_project;

ALTER TABLE public.kpi_snapshots ADD COLUMN IF NOT EXISTS suspect boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.kpi_snapshots.suspect IS
  'D11 (S09): true = snapshot histórico calculado en JavaScript sobre ≤1000 filas que pudo salir truncado. Regla: algún contador ≥ 1000, o la fecha es igual o posterior al día en que el proyecto superó 1000 ITR, punches o planes de preservación (por created_at / start_date). No se recalcula: se muestra como dato dudoso. Los snapshots de take_kpi_snapshot nacen con false.';

WITH thresholds AS (
  SELECT p.id AS project_id,
         (SELECT i.created_at::date FROM public.itrs i WHERE i.project_id = p.id ORDER BY i.created_at OFFSET 1000 LIMIT 1) AS itrs_from,
         (SELECT pu.created_at::date FROM public.punches pu WHERE pu.project_id = p.id ORDER BY pu.created_at OFFSET 1000 LIMIT 1) AS punches_from,
         (SELECT pp.start_date FROM public.preservation_plans pp WHERE pp.project_id = p.id ORDER BY pp.start_date OFFSET 1000 LIMIT 1) AS pres_from
  FROM public.projects p
)
UPDATE public.kpi_snapshots k SET suspect = true
FROM thresholds t
WHERE t.project_id = k.project_id
  AND (k.total_itrs >= 1000 OR k.total_punches_a + k.total_punches_b >= 1000 OR k.total_preservation >= 1000
       OR k.snapshot_date >= t.itrs_from OR k.snapshot_date >= t.punches_from OR k.snapshot_date >= t.pres_from);

DROP POLICY IF EXISTS kpi_snapshots_insert ON public.kpi_snapshots;
DROP POLICY IF EXISTS kpi_snapshots_update ON public.kpi_snapshots;
DROP POLICY IF EXISTS kpi_snapshots_delete ON public.kpi_snapshots;

-- ── take_kpi_snapshot ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.take_kpi_snapshot(p_project_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.kpi_snapshots%ROWTYPE;
  v_phases integer;
BEGIN
  IF p_project_id IS NULL OR p_date IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.kpi_snapshots AS k (
    project_id, snapshot_date, total_itrs, completed_itrs, total_punches_a, open_punches_a,
    total_punches_b, open_punches_b, total_tags, total_preservation, overdue_preservation, completion_pct, suspect)
  SELECT p_project_id, p_date, i.total, i.done, pu.ta, pu.oa, pu.tb, pu.ob,
         (SELECT count(*) FROM public.tags t WHERE t.project_id = p_project_id),
         pp.total, pp.overdue,
         CASE WHEN i.total > 0 THEN round(i.done * 100.0 / i.total, 2) ELSE 0 END,
         false
  FROM (SELECT count(*) AS total, count(*) FILTER (WHERE status = 'approved') AS done
          FROM public.itrs WHERE project_id = p_project_id) i,
       (SELECT count(*) FILTER (WHERE category = 'A') AS ta,
               count(*) FILTER (WHERE category = 'A' AND status IN ('open', 'in_progress')) AS oa,
               count(*) FILTER (WHERE category = 'B') AS tb,
               count(*) FILTER (WHERE category = 'B' AND status IN ('open', 'in_progress')) AS ob
          FROM public.punches WHERE project_id = p_project_id) pu,
       (SELECT count(*) AS total,
               count(*) FILTER (WHERE public.preservation_is_overdue(status, next_due_date, p_date)) AS overdue
          FROM public.preservation_plans WHERE project_id = p_project_id AND status = 'active') pp
  ON CONFLICT (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) DO UPDATE SET
    total_itrs = EXCLUDED.total_itrs, completed_itrs = EXCLUDED.completed_itrs,
    total_punches_a = EXCLUDED.total_punches_a, open_punches_a = EXCLUDED.open_punches_a,
    total_punches_b = EXCLUDED.total_punches_b, open_punches_b = EXCLUDED.open_punches_b,
    total_tags = EXCLUDED.total_tags, total_preservation = EXCLUDED.total_preservation,
    overdue_preservation = EXCLUDED.overdue_preservation, completion_pct = EXCLUDED.completion_pct,
    suspect = false
  RETURNING k.* INTO v_row;

  -- Por fase: solo métricas de ITR (punches, tags y preservación no tienen fase).
  INSERT INTO public.kpi_snapshots AS k (project_id, snapshot_date, phase_id, total_itrs, completed_itrs, completion_pct, suspect)
  SELECT p_project_id, p_date, phase_id, count(*), count(*) FILTER (WHERE status = 'approved'),
         round(count(*) FILTER (WHERE status = 'approved') * 100.0 / count(*), 2), false
  FROM public.itrs WHERE project_id = p_project_id AND phase_id IS NOT NULL
  GROUP BY phase_id
  ON CONFLICT (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) DO UPDATE SET
    total_itrs = EXCLUDED.total_itrs, completed_itrs = EXCLUDED.completed_itrs,
    completion_pct = EXCLUDED.completion_pct, suspect = false;
  GET DIAGNOSTICS v_phases = ROW_COUNT;

  -- Re-snapshot del mismo día: fases que ya no tienen ITR.
  DELETE FROM public.kpi_snapshots k
  WHERE k.project_id = p_project_id AND k.snapshot_date = p_date AND k.phase_id IS NOT NULL
    AND k.subsystem_id IS NULL AND k.area_id IS NULL AND k.system_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.itrs i WHERE i.project_id = p_project_id AND i.phase_id = k.phase_id);

  RETURN jsonb_build_object('date', p_date, 'total_itrs', v_row.total_itrs, 'completed_itrs', v_row.completed_itrs,
    'completion_pct', v_row.completion_pct, 'open_punches_a', v_row.open_punches_a, 'open_punches_b', v_row.open_punches_b,
    'overdue_preservation', v_row.overdue_preservation, 'phases', v_phases);
END $$;
REVOKE ALL ON FUNCTION public.take_kpi_snapshot(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.take_kpi_snapshot(uuid, date) TO service_role;

-- ── Funciones canónicas (supabase/functions-sql) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_itr_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE trusted boolean; tpl_org uuid; project_org uuid;
BEGIN
trusted:=current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.itrs'::regclass));
IF TG_OP<>'INSERT' THEN
IF TG_OP='UPDATE' AND (NEW.template_id,NEW.project_id,NEW.tag_id,NEW.phase_id,NEW.itr_number) IS DISTINCT FROM (OLD.template_id,OLD.project_id,OLD.tag_id,OLD.phase_id,OLD.itr_number) THEN RAISE EXCEPTION 'ITR identity and assigned revision are immutable'; END IF;
-- C-16 (D9): el subsistema solo cambia con su tag, por move_tag_subsystem (dueño de la tabla), en el mismo proyecto y nunca firmado.
IF TG_OP='UPDATE' AND NEW.subsystem_id IS DISTINCT FROM OLD.subsystem_id THEN
IF NOT trusted THEN RAISE EXCEPTION 'ITR identity and assigned revision are immutable'; END IF;
IF OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.subsystems s JOIN public.systems sy ON sy.id=s.system_id WHERE s.id=NEW.subsystem_id AND sy.project_id=NEW.project_id) THEN RAISE EXCEPTION 'Subsystem project mismatch'; END IF;
END IF;
IF NOT trusted AND (OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id)) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
-- S04 (D4): las firmas requeridas se congelan al crear el ITR; solo las cambia el dueño de la tabla (migraciones, RPC).
IF TG_OP='UPDATE' AND NOT trusted AND NEW.required_signatures IS DISTINCT FROM OLD.required_signatures THEN RAISE EXCEPTION 'Required signatures are fixed when the ITR is created'; END IF;
IF TG_OP='DELETE' THEN IF OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id) THEN RAISE EXCEPTION 'Cannot delete signed ITR'; END IF; RETURN OLD; END IF;
ELSE
SELECT org_id INTO tpl_org FROM public.itr_templates WHERE id=NEW.template_id FOR KEY SHARE;
SELECT org_id INTO project_org FROM public.projects WHERE id=NEW.project_id;
IF tpl_org IS NULL OR (tpl_org IS DISTINCT FROM project_org AND NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND is_global)) THEN RAISE EXCEPTION 'Template organization mismatch'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.subsystems s JOIN public.systems sy ON sy.id=s.system_id WHERE s.id=NEW.subsystem_id AND sy.project_id=NEW.project_id) THEN RAISE EXCEPTION 'Subsystem project mismatch'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND phase_id=NEW.phase_id) THEN RAISE EXCEPTION 'Phase revision mismatch'; END IF;
IF NEW.tag_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tags WHERE id=NEW.tag_id AND project_id=NEW.project_id) THEN RAISE EXCEPTION 'Tag project mismatch'; END IF;
-- S04 (D4): firmas que pide la plantilla, más el cliente si la fase lo exige. Lo que mande el cliente se ignora.
NEW.required_signatures:=public.itr_signing_roles((SELECT t.required_signatures || CASE WHEN ph.itr_client_signature THEN ARRAY['client'] ELSE ARRAY[]::text[] END
  FROM public.itr_templates t LEFT JOIN public.project_phases ph ON ph.id=NEW.phase_id WHERE t.id=NEW.template_id));
END IF;
IF NOT trusted AND NEW.status='approved' THEN RAISE EXCEPTION 'Approval requires atomic signing'; END IF;
RETURN NEW;
END $function$;

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
      where public.preservation_is_overdue(pp.status, pp.next_due_date)
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

