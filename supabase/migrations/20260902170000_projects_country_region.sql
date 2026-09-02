-- Geopark (2026-09-02): jerarquía corporativa País → Región → Campo.
-- project = Campo; país y región viven en el proyecto para agrupar y filtrar
-- (listado de proyectos, gerentes por país). Opcionales: los proyectos
-- existentes siguen válidos.

alter table public.projects
  add column if not exists country text,
  add column if not exists region text;

comment on column public.projects.country is 'País del campo/proyecto (p.ej. Colombia, Argentina). Libre, se normaliza en UI.';
comment on column public.projects.region is 'Región/eje dentro del país (p.ej. Llanos, Neuquén). Opcional.';
