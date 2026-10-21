-- S20 sesión 2 · corrección de B-17. Las FK compuestas de 20261116120000 suman una SEGUNDA relación entre las mismas
-- tablas (tags→subsystems, itrs→tags, punches→itrs…) y PostgREST deja de resolver los embeds sin pista
-- (`subsystems(code)` → PGRST201 «more than one relationship»). Se quitan; las UNIQUE (id, project_id) quedan.
-- B-17 vuelve a pendiente: reemplazar la FK simple por la compuesta (una sola relación) o validar por trigger.
ALTER TABLE public.subsystems   DROP CONSTRAINT IF EXISTS subsystems_system_same_project_fkey;
ALTER TABLE public.tags         DROP CONSTRAINT IF EXISTS tags_subsystem_same_project_fkey;
ALTER TABLE public.itrs         DROP CONSTRAINT IF EXISTS itrs_subsystem_same_project_fkey;
ALTER TABLE public.itrs         DROP CONSTRAINT IF EXISTS itrs_tag_same_project_fkey;
ALTER TABLE public.punches      DROP CONSTRAINT IF EXISTS punches_subsystem_same_project_fkey;
ALTER TABLE public.punches      DROP CONSTRAINT IF EXISTS punches_tag_same_project_fkey;
ALTER TABLE public.punches      DROP CONSTRAINT IF EXISTS punches_itr_same_project_fkey;
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_subsystem_same_project_fkey;
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_system_same_project_fkey;
NOTIFY pgrst, 'reload schema';
