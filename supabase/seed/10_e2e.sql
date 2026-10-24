-- G-17: semilla de las pruebas E2E (Playwright). Solo para el Supabase LOCAL (`supabase db reset` la carga
-- después del baseline, las migraciones y 00_actors.sql; ver supabase/config.toml). Nunca contra prod.
-- Ids fijos con el prefijo e2e00000-… (los usa e2e/fixtures.ts). Contraseña de los usuarios: la de E2E_PASSWORD
-- en e2e/fixtures.ts.
--
-- Mundo mínimo: org «CommUp Demo» → proyecto E2E → área/sistema/subsistema → tag PT-E2E-001 → ITR E2E-0001
-- (plantilla con casilla, medición con rango, texto y foto obligatoria), asignado al inspector como ejecutor.

-- Usuarios, organizaciones, disciplina «I» y fase «A»: supabase/seed/00_actors.sql.

-- ── Proyecto ─────────────────────────────────────────────────────────────────
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
