-- Matriz "tipo de equipo × plantilla ITR" por organización (opción híbrida,
-- 2026-09-02). La IA propone filas (status = proposed) y un editor las acepta
-- o rechaza; también se pueden añadir a mano. La fase viene de la plantilla
-- (itr_templates.phase_id), así que no se repite aquí.
--
-- Reglas: la IA nunca asigna sola; cada fila guarda motivo, confianza, modelo
-- y quién la revisó. Una decisión humana (accepted/rejected) no se pisa al
-- regenerar.

create table public.equipment_type_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  itr_template_id uuid not null references public.itr_templates(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  source text not null default 'manual' check (source in ('ai', 'manual')),
  confidence numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reason text,
  model text,
  proposed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  unique (org_id, equipment_type_id, itr_template_id)
);

create index equipment_type_templates_org_type_idx on public.equipment_type_templates (org_id, equipment_type_id);
create index equipment_type_templates_template_idx on public.equipment_type_templates (itr_template_id);

alter table public.equipment_type_templates enable row level security;

create policy equipment_type_templates_select on public.equipment_type_templates
  for select using (org_id in (select public.get_my_org_ids()));
create policy equipment_type_templates_insert on public.equipment_type_templates
  for insert with check (public.is_org_editor(org_id));
create policy equipment_type_templates_update on public.equipment_type_templates
  for update using (public.is_org_editor(org_id));
create policy equipment_type_templates_delete on public.equipment_type_templates
  for delete using (public.is_org_editor(org_id));
