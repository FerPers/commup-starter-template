-- A13 + A50 (2026-10-24): actores de la Supabase LOCAL. Primer archivo de la semilla (`supabase db reset` carga
-- supabase/seed/*.sql en orden; ver config.toml). Nunca contra prod.
--
-- Dos organizaciones y los seis roles. La org A («CommUp Demo») tiene la demo, el recorrido E2E y el proyecto de
-- las pruebas de BD; la org B («CommUp Demo B») solo existe para probar el aislamiento entre tenants.
-- Contraseña de todos: E2E_PASSWORD de e2e/fixtures.ts (la misma que pasa scripts/db-tests/run.mjs).
--
--   a1 inspector@e2e.commup.test   inspector   (ejecuta el ITR del E2E)
--   a2 leader@e2e.commup.test      leader
--   a3 client@e2e.commup.test      client
--   a4 architect@e2e.commup.test   architect
--   a5 owner@e2e.commup.test       owner       (TEST_USER_A de las pruebas de BD)
--   a6 admin@e2e.commup.test       admin
--   a7 outsider@e2e.commup.test    owner de la org B, sin membresía en A (TEST_USER_B)

-- GoTrue no admite NULL en los tokens: van como ''.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('e2e00000-0000-4000-8000-0000000000a1'::uuid, 'inspector@e2e.commup.test', 'Inés Inspectora'),
    ('e2e00000-0000-4000-8000-0000000000a2', 'leader@e2e.commup.test', 'Leo Líder'),
    ('e2e00000-0000-4000-8000-0000000000a3', 'client@e2e.commup.test', 'Clara Cliente'),
    ('e2e00000-0000-4000-8000-0000000000a4', 'architect@e2e.commup.test', 'Ana Arquitecta'),
    ('e2e00000-0000-4000-8000-0000000000a5', 'owner@e2e.commup.test', 'Óscar Owner'),
    ('e2e00000-0000-4000-8000-0000000000a6', 'admin@e2e.commup.test', 'Adela Admin'),
    ('e2e00000-0000-4000-8000-0000000000a7', 'outsider@e2e.commup.test', 'Bruno Otra Org')
  ) AS v(id, email, name) LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
                            phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
            r.email, crypt('E2e-commup-2026!', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.name), now(), now(),
            '', '', '', '', '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), r.id, r.id::text, 'email',
            jsonb_build_object('sub', r.id, 'email', r.email, 'email_verified', true), now(), now(), now());
    INSERT INTO public.profiles (id, full_name, locale) VALUES (r.id, r.name, 'es');
  END LOOP;
END $$;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('e2e00000-0000-4000-8000-000000000001', 'CommUp Demo', 'commup-e2e'),
  ('e2e00000-0000-4000-8000-000000000002', 'CommUp Demo B', 'commup-e2e-b');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a1', 'inspector', 'active'),
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a2', 'leader', 'active'),
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a3', 'client', 'active'),
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a4', 'architect', 'active'),
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a5', 'owner', 'active'),
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a6', 'admin', 'active'),
  ('e2e00000-0000-4000-8000-000000000002', 'e2e00000-0000-4000-8000-0000000000a7', 'owner', 'active');

-- Configuración base de la org A (la usan la demo, el E2E y las pruebas de BD). Cada fase siembra su liberación
-- (trigger en project_phases).
INSERT INTO public.disciplines (id, org_id, code, name, color) VALUES
  ('e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-000000000001', 'I', 'Instrumentación', '#2563eb');

INSERT INTO public.project_phases (id, org_id, code, name, order_index) VALUES
  ('e2e00000-0000-4000-8000-0000000000d2', 'e2e00000-0000-4000-8000-000000000001', 'A', 'Completamiento mecánico', 1),
  ('e2e00000-0000-4000-8000-0000000000d3', 'e2e00000-0000-4000-8000-000000000001', 'B', 'Precomisionamiento', 2),
  ('e2e00000-0000-4000-8000-0000000000d4', 'e2e00000-0000-4000-8000-000000000001', 'C', 'Comisionamiento', 3),
  ('e2e00000-0000-4000-8000-0000000000d5', 'e2e00000-0000-4000-8000-000000000001', 'D', 'Arranque', 4);

-- Org B: un proyecto con un área, para que el aislamiento se pruebe contra filas que existen.
INSERT INTO public.projects (id, org_id, name, code, timezone) VALUES
  ('e2e00000-0000-4000-8000-0000000000b3', 'e2e00000-0000-4000-8000-000000000002', 'Proyecto de la org B', 'ORGB', 'America/Bogota');
INSERT INTO public.areas (id, project_id, name, code) VALUES
  ('e2e00000-0000-4000-8000-0000000000c9', 'e2e00000-0000-4000-8000-0000000000b3', 'Área org B', 'B100');
