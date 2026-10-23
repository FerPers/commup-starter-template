-- G-17: semilla de las pruebas E2E (Playwright). Solo para el Supabase LOCAL (`supabase db reset` la carga
-- después del baseline y las migraciones; ver supabase/config.toml). Nunca contra prod.
-- Ids fijos con el prefijo e2e00000-… (los usa e2e/fixtures.ts). Contraseña de los usuarios: la de E2E_PASSWORD
-- en e2e/fixtures.ts.
--
-- Mundo mínimo: org «CommUp E2E» → proyecto E2E → área/sistema/subsistema → tag PT-E2E-001 → ITR E2E-0001
-- (plantilla con casilla, medición con rango, texto y foto obligatoria), asignado al inspector como ejecutor.

-- ── Usuarios (auth) ─────────────────────────────────────────────────────────
-- GoTrue no admite NULL en los tokens: van como ''.
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'inspector@e2e.commup.test', crypt('E2e-commup-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Inés Inspectora"}', now(), now(),
   '', '', '', '', '', '', '', '');

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-0000000000a1', 'email',
   '{"sub":"e2e00000-0000-4000-8000-0000000000a1","email":"inspector@e2e.commup.test","email_verified":true}', now(), now(), now());

INSERT INTO public.profiles (id, full_name, locale) VALUES
  ('e2e00000-0000-4000-8000-0000000000a1', 'Inés Inspectora', 'es');

-- ── Organización y proyecto ─────────────────────────────────────────────────
INSERT INTO public.organizations (id, name, slug) VALUES
  ('e2e00000-0000-4000-8000-000000000001', 'CommUp E2E', 'commup-e2e');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a1', 'inspector', 'active');

INSERT INTO public.disciplines (id, org_id, code, name, color) VALUES
  ('e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-000000000001', 'I', 'Instrumentación', '#2563eb');

INSERT INTO public.project_phases (id, org_id, code, name, order_index) VALUES
  ('e2e00000-0000-4000-8000-0000000000d2', 'e2e00000-0000-4000-8000-000000000001', 'A', 'Completamiento mecánico', 1);

INSERT INTO public.projects (id, org_id, name, code, timezone) VALUES
  ('e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-000000000001', 'Proyecto E2E', 'E2E', 'America/Bogota');

INSERT INTO public.areas (id, project_id, name, code) VALUES
  ('e2e00000-0000-4000-8000-0000000000c1', 'e2e00000-0000-4000-8000-0000000000b1', 'Área E2E', 'A100');
INSERT INTO public.systems (id, area_id, project_id, name, code) VALUES
  ('e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000c1', 'e2e00000-0000-4000-8000-0000000000b1', 'Sistema E2E', 'A100-S01');
INSERT INTO public.subsystems (id, system_id, project_id, name, code) VALUES
  ('e2e00000-0000-4000-8000-0000000000c3', 'e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000b1', 'Subsistema E2E', 'A100-S01-01');

INSERT INTO public.tags (id, subsystem_id, project_id, discipline_id, tag_number, description) VALUES
  ('e2e00000-0000-4000-8000-0000000000f1', 'e2e00000-0000-4000-8000-0000000000c3', 'e2e00000-0000-4000-8000-0000000000b1',
   'e2e00000-0000-4000-8000-0000000000d1', 'PT-E2E-001', 'Transmisor de presión E2E');

-- ── Plantilla ITR ───────────────────────────────────────────────────────────
INSERT INTO public.itr_templates (id, org_id, discipline_id, phase_id, code, title) VALUES
  ('e2e00000-0000-4000-8000-000000000010', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000d1',
   'e2e00000-0000-4000-8000-0000000000d2', 'I01A', 'Inspección de transmisor (E2E)');
INSERT INTO public.itr_template_sections (id, template_id, title, order_index) VALUES
  ('e2e00000-0000-4000-8000-000000000011', 'e2e00000-0000-4000-8000-000000000010', 'Inspección', 1);
INSERT INTO public.itr_template_items (id, section_id, template_id, description, item_type, order_index, item_number,
                                       unit, acceptance_min, acceptance_max, requires_photo) VALUES
  ('e2e00000-0000-4000-8000-000000000021', 'e2e00000-0000-4000-8000-000000000011', 'e2e00000-0000-4000-8000-000000000010',
   'Placa de identificación conforme', 'checkbox', 1, '1.1', NULL, NULL, NULL, false),
  ('e2e00000-0000-4000-8000-000000000022', 'e2e00000-0000-4000-8000-000000000011', 'e2e00000-0000-4000-8000-000000000010',
   'Resistencia de aislamiento', 'measurement', 2, '1.2', 'MΩ', 100, NULL, false),
  ('e2e00000-0000-4000-8000-000000000023', 'e2e00000-0000-4000-8000-000000000011', 'e2e00000-0000-4000-8000-000000000010',
   'Observaciones de montaje', 'text', 3, '1.3', NULL, NULL, NULL, false),
  ('e2e00000-0000-4000-8000-000000000024', 'e2e00000-0000-4000-8000-000000000011', 'e2e00000-0000-4000-8000-000000000010',
   'Foto del equipo instalado', 'photo', 4, '1.4', NULL, NULL, NULL, true);

-- ── ITR asignado al inspector ───────────────────────────────────────────────
INSERT INTO public.itrs (id, template_id, subsystem_id, project_id, phase_id, tag_id, itr_number) VALUES
  ('e2e00000-0000-4000-8000-000000000031', 'e2e00000-0000-4000-8000-000000000010', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000d2', 'e2e00000-0000-4000-8000-0000000000f1', 'E2E-0001');
INSERT INTO public.itr_assignments (itr_id, user_id, role) VALUES
  ('e2e00000-0000-4000-8000-000000000031', 'e2e00000-0000-4000-8000-0000000000a1', 'executor');
