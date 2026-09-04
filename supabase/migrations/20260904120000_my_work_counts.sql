-- Sprint N (2026-09-04): contadores de «Mi trabajo» para el usuario autenticado.
-- SECURITY INVOKER a propósito: corre bajo las políticas RLS del usuario, sin service role.
-- Devuelve seis contadores; la app decide cuáles suman al badge según el rol
-- (ver src/lib/my-work/queues.ts → badgeTotal).

create or replace function public.my_work_counts(p_org_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with proj as (
    select id from projects where org_id = p_org_id
  )
  select jsonb_build_object(
    -- ITRs asignados a mí como ejecutor y aún por ejecutar
    'itrs_execute', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role = 'executor'
        and i.status in ('not_started', 'in_progress')
        and i.project_id in (select id from proj)
    ),
    -- ITRs completados que esperan mi firma como supervisor o cliente
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
    ),
    -- Punches asignados a mí y abiertos
    'punches', (
      select count(*)
      from punches p
      where p.assigned_to = auth.uid()
        and p.status in ('open', 'in_progress')
        and p.project_id in (select id from proj)
    ),
    -- Ítems de plan de trabajo asignados a mí, del día o vencidos, sin cerrar
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
    -- Certificados emitidos sin firma de completion (solo cuenta para roles firmantes)
    'signatures', (
      select count(*)
      from certificates c
      where c.status = 'issued'
        and c.project_id in (select id from proj)
        and not exists (
          select 1 from certificate_signatures cs
          where cs.certificate_id = c.id and cs.role = 'completion'
        )
    ),
    -- Preservación vencida en la org (no es personal: se muestra a leader+)
    'preservation_overdue', (
      select count(*)
      from preservation_plans pp
      where pp.status = 'active'
        and pp.next_due_date < current_date
        and pp.project_id in (select id from proj)
    )
  );
$$;

revoke execute on function public.my_work_counts(uuid) from anon, public;
grant execute on function public.my_work_counts(uuid) to authenticated, service_role;
