-- Leads del form público del landing (L1).
-- RLS habilitado SIN policies: la tabla solo es accesible vía service role
-- (server action submitLead en src/app/actions/leads.ts). Ningún cliente
-- autenticado ni anónimo puede leerla o escribirla por PostgREST.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  company text not null,
  email text not null,
  project_type text,
  message text,
  locale text,
  source text,
  ip_hash text,
  user_agent text,
  status text not null default 'new',
  constraint leads_name_len check (char_length(name) between 1 and 120),
  constraint leads_company_len check (char_length(company) between 1 and 120),
  constraint leads_email_len check (char_length(email) between 3 and 254),
  constraint leads_message_len check (message is null or char_length(message) <= 2000),
  constraint leads_project_type_check check (
    project_type is null or project_type in ('oil_gas', 'lng', 'renewables', 'mining', 'industrial', 'other')
  ),
  constraint leads_status_check check (status in ('new', 'contacted', 'qualified', 'discarded'))
);

alter table public.leads enable row level security;

-- Rate limiting del server action: cuenta envíos recientes por IP (hasheada) y por email.
create index leads_ip_hash_created_idx on public.leads (ip_hash, created_at desc);
create index leads_email_created_idx on public.leads (email, created_at desc);
create index leads_created_at_idx on public.leads (created_at desc);

comment on table public.leads is 'Leads del form público del landing. Sin policies RLS a propósito: solo service role.';
