-- Semilla de REVISIÓN en pantalla de las vistas por rol (inspector, líder, cliente). Solo Supabase LOCAL, encima de
-- supabase/seed/e2e.sql; no la carga `supabase db reset` (no está en config.toml) para no cambiar el mundo del E2E.
--   supabase db reset && docker exec -i supabase_db_commup psql -U postgres -v ON_ERROR_STOP=1 < supabase/seed/review.sql
--   node scripts/e2e/review-pid.mjs   (sube el PDF del P&ID de prueba PID-E2E-001)
-- Usuarios nuevos con la misma contraseña que el inspector del E2E (E2E_PASSWORD en e2e/fixtures.ts):
--   leader@e2e.commup.test (Líder) · client@e2e.commup.test (Cliente) · architect@e2e.commup.test (Arquitecta: revisa
--   lo que crea el líder, p. ej. los red-lines)
-- Cada cola de «Mi trabajo» de inspector y cliente queda con al menos un elemento.

-- ── Usuarios ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'leader@e2e.commup.test', crypt('E2e-commup-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Leo Líder"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated',
   'client@e2e.commup.test', crypt('E2e-commup-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Clara Cliente"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated',
   'architect@e2e.commup.test', crypt('E2e-commup-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Ana Arquitecta"}', now(), now(),
   '', '', '', '', '', '', '', '');

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-0000000000a2', 'email',
   '{"sub":"e2e00000-0000-4000-8000-0000000000a2","email":"leader@e2e.commup.test","email_verified":true}', now(), now(), now()),
  (gen_random_uuid(), 'e2e00000-0000-4000-8000-0000000000a3', 'e2e00000-0000-4000-8000-0000000000a3', 'email',
   '{"sub":"e2e00000-0000-4000-8000-0000000000a3","email":"client@e2e.commup.test","email_verified":true}', now(), now(), now()),
  (gen_random_uuid(), 'e2e00000-0000-4000-8000-0000000000a4', 'e2e00000-0000-4000-8000-0000000000a4', 'email',
   '{"sub":"e2e00000-0000-4000-8000-0000000000a4","email":"architect@e2e.commup.test","email_verified":true}', now(), now(), now());

INSERT INTO public.profiles (id, full_name, locale) VALUES
  ('e2e00000-0000-4000-8000-0000000000a2', 'Leo Líder', 'es'),
  ('e2e00000-0000-4000-8000-0000000000a3', 'Clara Cliente', 'es'),
  ('e2e00000-0000-4000-8000-0000000000a4', 'Ana Arquitecta', 'es');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a2', 'leader', 'active'),
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a3', 'client', 'active'),
  ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000a4', 'architect', 'active');

-- ── Más tags ────────────────────────────────────────────────────────────────
INSERT INTO public.tags (id, subsystem_id, project_id, discipline_id, tag_number, description) VALUES
  ('e2e00000-0000-4000-8000-0000000000f2', 'e2e00000-0000-4000-8000-0000000000c3', 'e2e00000-0000-4000-8000-0000000000b1',
   'e2e00000-0000-4000-8000-0000000000d1', 'FT-E2E-002', 'Transmisor de flujo E2E'),
  ('e2e00000-0000-4000-8000-0000000000f3', 'e2e00000-0000-4000-8000-0000000000c3', 'e2e00000-0000-4000-8000-0000000000b1',
   'e2e00000-0000-4000-8000-0000000000d1', 'XV-E2E-003', 'Válvula de corte E2E');

-- ── ITR: uno más por ejecutar (inspector) y uno completado esperando la firma del cliente ───────────────────────
-- Las firmas requeridas del ITR salen de su plantilla: la del cliente es otra plantilla (ejecutor + cliente).
INSERT INTO public.itr_templates (id, org_id, discipline_id, phase_id, code, title, required_signatures) VALUES
  ('e2e00000-0000-4000-8000-000000000012', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000d1',
   'e2e00000-0000-4000-8000-0000000000d2', 'I05A', 'Prueba de carrera de válvula (E2E, testigo cliente)', ARRAY['executor', 'client']);
INSERT INTO public.itr_template_sections (id, template_id, title, order_index) VALUES
  ('e2e00000-0000-4000-8000-000000000013', 'e2e00000-0000-4000-8000-000000000012', 'Prueba', 1);
INSERT INTO public.itr_template_items (id, section_id, template_id, description, item_type, order_index, item_number) VALUES
  ('e2e00000-0000-4000-8000-000000000025', 'e2e00000-0000-4000-8000-000000000013', 'e2e00000-0000-4000-8000-000000000012',
   'Carrera completa abierta/cerrada sin trabas', 'checkbox', 1, '1.1');

INSERT INTO public.itrs (id, template_id, subsystem_id, project_id, phase_id, tag_id, itr_number, status,
                         completed_date, progress_pct, required_signatures) VALUES
  ('e2e00000-0000-4000-8000-000000000032', 'e2e00000-0000-4000-8000-000000000010', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000d2', 'e2e00000-0000-4000-8000-0000000000f2',
   'E2E-0002', 'not_started', NULL, 0, ARRAY['executor', 'supervisor']),
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-000000000012', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000d2', 'e2e00000-0000-4000-8000-0000000000f3',
   'E2E-0003', 'completed', current_date - 1, 100, ARRAY['executor', 'client']);
INSERT INTO public.itr_assignments (itr_id, user_id, role) VALUES
  ('e2e00000-0000-4000-8000-000000000032', 'e2e00000-0000-4000-8000-0000000000a1', 'executor'),
  ('e2e00000-0000-4000-8000-000000000032', 'e2e00000-0000-4000-8000-0000000000a2', 'supervisor'),
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-0000000000a1', 'executor'),
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-0000000000a3', 'client');
INSERT INTO public.itr_responses (itr_id, item_id, value_bool, is_passed, responded_by) VALUES
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-000000000025', true, true, 'e2e00000-0000-4000-8000-0000000000a1');
INSERT INTO public.itr_signatures (itr_id, user_id, role, signed_at) VALUES
  ('e2e00000-0000-4000-8000-000000000033', 'e2e00000-0000-4000-8000-0000000000a1', 'executor', now() - interval '1 day');

-- ── Punch ───────────────────────────────────────────────────────────────────
-- A abierto y B en curso asignados al inspector; C levantado por el cliente y resuelto por el inspector (el cliente
-- lo verifica); B levantado por el inspector y resuelto por el líder (el inspector lo verifica).
INSERT INTO public.punches (id, project_id, subsystem_id, tag_id, punch_number, category, description, discipline_id,
                            raised_by, assigned_to, status, priority, target_date, resolved_at, resolved_by) VALUES
  ('e2e00000-0000-4000-8000-000000000041', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f1', '', 'A', 'Falta el prensaestopas del cable de señal',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-0000000000a1',
   'open', 'critical', current_date + 2, NULL, NULL),
  ('e2e00000-0000-4000-8000-000000000042', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f2', '', 'B', 'Placa de identificación ilegible',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-0000000000a1',
   'in_progress', 'major', current_date - 3, NULL, NULL),
  ('e2e00000-0000-4000-8000-000000000043', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f3', '', 'C', 'Pintura dañada en el actuador',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a3', 'e2e00000-0000-4000-8000-0000000000a1',
   'in_progress', 'minor', current_date + 10, now() - interval '2 hours', 'e2e00000-0000-4000-8000-0000000000a1'),
  ('e2e00000-0000-4000-8000-000000000044', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000c3',
   'e2e00000-0000-4000-8000-0000000000f1', '', 'B', 'Soporte del transmisor flojo',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-0000000000a2',
   'in_progress', 'major', current_date + 5, now() - interval '1 hour', 'e2e00000-0000-4000-8000-0000000000a2');

-- ── Preservación vencida a cargo del inspector ──────────────────────────────
INSERT INTO public.preservation_procedures (id, org_id, code, title, frequency, interval_days, discipline_id) VALUES
  ('e2e00000-0000-4000-8000-000000000051', 'e2e00000-0000-4000-8000-000000000001', 'PR-I-01',
   'Inspección visual y desecante', 'weekly', 7, 'e2e00000-0000-4000-8000-0000000000d1');
INSERT INTO public.preservation_plans (id, tag_id, project_id, procedure_id, responsible_user_id, start_date, next_due_date, status) VALUES
  ('e2e00000-0000-4000-8000-000000000052', 'e2e00000-0000-4000-8000-0000000000f3', 'e2e00000-0000-4000-8000-0000000000b1',
   'e2e00000-0000-4000-8000-000000000051', 'e2e00000-0000-4000-8000-0000000000a1', current_date - 30, current_date - 4, 'active');

-- ── Gestión diaria: TQ al cliente (por responder), TQ del cliente (respondida) y acción del cliente ────────────────
INSERT INTO public.technical_queries (id, org_id, project_id, seq, number, subject, question, discipline_id, system_id,
                                      addressed_to, required_by, status, issued_by, issued_at, raised_by,
                                      response, responded_by, responded_by_name, responded_at) VALUES
  ('e2e00000-0000-4000-8000-000000000061', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   1, 'TQ-0001', 'Rango del transmisor PT-E2E-001', '¿Se calibra a 0–10 bar o a 0–16 bar como dice la hoja de datos rev. B?',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000c2', 'client', current_date + 3, 'issued',
   'e2e00000-0000-4000-8000-0000000000a2', now() - interval '1 day', 'e2e00000-0000-4000-8000-0000000000a2',
   NULL, NULL, NULL, NULL),
  ('e2e00000-0000-4000-8000-000000000062', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   2, 'TQ-0002', 'Color de la placa de válvulas', '¿Las placas de las válvulas de corte van en rojo o en amarillo?',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000c2', 'engineering', current_date + 7, 'answered',
   'e2e00000-0000-4000-8000-0000000000a3', now() - interval '3 days', 'e2e00000-0000-4000-8000-0000000000a3',
   'Amarillo, según la especificación de rotulado del proyecto.', 'e2e00000-0000-4000-8000-0000000000a2', 'Leo Líder',
   now() - interval '5 hours');

INSERT INTO public.actions (id, org_id, project_id, seq, number, title, description, source_kind, system_id, owner_id,
                            due_date, priority, verification_method, status, created_by) VALUES
  ('e2e00000-0000-4000-8000-000000000071', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   1, 'ACC-0001', 'Enviar la hoja de datos firmada del PT-E2E-001', 'La pide el TQ-0001 para cerrar el rango.',
   'manual', 'e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000a3',
   current_date + 4, 'high', 'document', 'open', 'e2e00000-0000-4000-8000-0000000000a2'),
  ('e2e00000-0000-4000-8000-000000000072', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   2, 'ACC-0002', 'Revisar el torque de las bridas del XV-E2E-003', NULL,
   'manual', 'e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000a1',
   current_date + 1, 'medium', 'field', 'open', 'e2e00000-0000-4000-8000-0000000000a2');

-- ── P&ID para el visor (red-line, pines, límites) ───────────────────────────
-- El PDF lo sube scripts/e2e/review-pid.mjs a project-documents/<project>/<document>/rev-A.pdf.
INSERT INTO public.documents (id, org_id, project_id, number, title, doc_type) VALUES
  ('e2e00000-0000-4000-8000-0000000000e1', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b1',
   'PID-E2E-001', 'P&ID unidad E2E, hoja 1', 'pid');
INSERT INTO public.document_revisions (id, document_id, project_id, seq, rev, status, issued_on, file_path, file_name) VALUES
  ('e2e00000-0000-4000-8000-0000000000e2', 'e2e00000-0000-4000-8000-0000000000e1', 'e2e00000-0000-4000-8000-0000000000b1',
   1, 'A', 'ifc', current_date - 20,
   'e2e00000-0000-4000-8000-0000000000b1/e2e00000-0000-4000-8000-0000000000e1/rev-A.pdf', 'PID-E2E-001_A.pdf');
UPDATE public.documents SET current_revision_id = 'e2e00000-0000-4000-8000-0000000000e2' WHERE id = 'e2e00000-0000-4000-8000-0000000000e1';
