-- 2026-10-26: borra por completo la org DEMO («Test CPF Orotoy», antes «DEMO Refinería Los Andes») para que Luis
-- recorra el alta desde cero (/setup → importar plantillas del Catálogo). Corre después de
-- scripts/ops/sync-catalog-from-demo.sql (las v2/v3 ya viven en el Catálogo). Las cuentas de usuario (auth.users)
-- se conservan; sus membresías a esta org se van con ella. Mismo método que purge-demo-projects.sql: triggers de
-- usuario apagados solo dentro de la transacción, cascadas de las FK activas.
-- Uso: supabase db query --linked -f scripts/ops/purge-demo-org.sql (termina en ROLLBACK; COMMIT para aplicar).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE purge_tables ON COMMIT DROP AS
  SELECT DISTINCT c.oid::regclass AS rel FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rel FROM purge_tables LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', r.rel); END LOOP;
END $$;

DELETE FROM organizations WHERE id = 'e12c53b2-85fd-462f-86f3-bba318aa77ee';

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rel FROM purge_tables LOOP EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', r.rel); END LOOP;
END $$;

CREATE TEMP TABLE purge_left (t text, n bigint) ON COMMIT DROP;
DO $$ DECLARE r record; n bigint; BEGIN
  FOR r IN SELECT c.table_name t FROM information_schema.columns c JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
           WHERE c.table_schema = 'public' AND c.column_name = 'org_id' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = ''e12c53b2-85fd-462f-86f3-bba318aa77ee''', r.t) INTO n;
    IF n > 0 THEN INSERT INTO purge_left VALUES (r.t, n); END IF;
  END LOOP;
END $$;
SELECT (SELECT string_agg(name, ', ') FROM organizations) orgs,
       (SELECT count(*) FROM pg_trigger t JOIN purge_tables p ON p.rel = t.tgrelid WHERE NOT t.tgisinternal AND t.tgenabled = 'D') triggers_still_disabled,
       (SELECT coalesce(string_agg(t || '=' || n, ' '), 'nada') FROM purge_left) demo_rows_left,
       (SELECT count(*) FROM itr_templates WHERE org_id = '0ea5bfe9-4b09-471f-8194-30e780ecbb25' AND is_active) catalogo_activas,
       (SELECT string_agg(u.email, ', ') FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM org_members m WHERE m.user_id = u.id)) usuarios_sin_org;
ROLLBACK;
