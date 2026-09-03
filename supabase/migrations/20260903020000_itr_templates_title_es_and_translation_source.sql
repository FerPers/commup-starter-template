-- Catálogo ITR bilingüe (2026-09-03). Los títulos de plantilla estaban solo en
-- inglés (294/302) y los ítems ya tenían description_es. Se añade título en
-- español y una marca de origen para saber qué tradujo la IA sin revisar.

alter table public.itr_templates
  add column if not exists title_es text;

alter table public.itr_template_items
  add column if not exists description_es_source text
    check (description_es_source is null or description_es_source in ('human', 'ai'));

comment on column public.itr_templates.title_es is 'Título en español (opcional). Si es null, la UI usa title.';
comment on column public.itr_template_items.description_es_source is 'Origen de description_es: human (escrita/revisada) o ai (traducida por IA, pendiente de revisión). Null = heredado.';
