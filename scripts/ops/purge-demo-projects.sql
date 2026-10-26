-- 2026-10-26: borra los proyectos de demostración de prod (DEMO Planta GLP - Fase 2 y Proyecto Demo LNG)
-- con todo lo que cuelga de ellos, y conserva la configuración de las orgs (plantillas ITR, matriz, tipos
-- de equipo, disciplinas, fases, liberaciones, miembros). Las guardas de inmutabilidad (ITR firmado, C&E
-- probada, PSSR enviado…) y los triggers de eventos se apagan SOLO dentro de esta transacción con
-- DISABLE TRIGGER USER (las cascadas de las FK son triggers internos y siguen corriendo) y se vuelven a
-- encender antes del final. Los archivos de Storage se borran aparte por la API (scripts/ops/purge-demo-storage.mjs).
-- Uso: supabase db query --linked -f scripts/ops/purge-demo-projects.sql (termina en ROLLBACK salvo que se
-- cambie la última línea a COMMIT).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE purge_projects ON COMMIT DROP AS
  SELECT id FROM projects WHERE id IN ('abc47484-59d3-4f51-8966-7fb4f1174ba8', '0a39ad72-03ae-491d-abb7-927ecaca69d9');
CREATE TEMP TABLE purge_tables ON COMMIT DROP AS
  SELECT DISTINCT c.oid::regclass AS rel FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relname NOT IN ('org_members', 'itr_templates', 'itr_template_sections', 'itr_template_items', 'equipment_type_templates');

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rel FROM purge_tables LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', r.rel); END LOOP;
END $$;

-- Filas sin FK al proyecto que solo tienen sentido con él.
DELETE FROM notifications WHERE org_id IN (SELECT org_id FROM projects WHERE id IN (SELECT id FROM purge_projects));
DELETE FROM domain_events WHERE project_id IN (SELECT id FROM purge_projects);
DELETE FROM projects WHERE id IN (SELECT id FROM purge_projects);

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rel FROM purge_tables LOOP EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', r.rel); END LOOP;
END $$;

-- Verificación: lo que queda con org_id de las dos orgs.
CREATE TEMP TABLE purge_left (t text, n bigint) ON COMMIT DROP;
DO $$ DECLARE r record; n bigint; BEGIN
  FOR r IN SELECT c.table_name t FROM information_schema.columns c JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
           WHERE c.table_schema = 'public' AND c.column_name = 'org_id' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id IN (''e12c53b2-85fd-462f-86f3-bba318aa77ee'', ''0ea5bfe9-4b09-471f-8194-30e780ecbb25'')', r.t) INTO n;
    IF n > 0 THEN INSERT INTO purge_left VALUES (r.t, n); END IF;
  END LOOP;
END $$;
SELECT (SELECT count(*) FROM projects) projects_left,
       (SELECT count(*) FROM pg_trigger t JOIN purge_tables p ON p.rel = t.tgrelid WHERE NOT t.tgisinternal AND t.tgenabled = 'D') triggers_still_disabled,
       (SELECT string_agg(t || '=' || n, ' ' ORDER BY n DESC) FROM purge_left) org_rows_left;
ROLLBACK; -- en prod se aplicó el 2026-10-26 con COMMIT, junto con 20270105120000
