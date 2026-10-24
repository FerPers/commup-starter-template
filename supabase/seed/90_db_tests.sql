-- A13 (2026-10-24): proyecto de las pruebas de BD (`tests/db`, TEST_PROJECT_A_ID = …b2) en la org A. Aparte de la demo
-- para que lo que las suites siembran y borran no mueva sus cifras. Solo Supabase LOCAL.
--
-- Cada suite crea su propia jerarquía y la borra al final; aquí queda solo lo que la matriz de autorización
-- (authz-matrix) necesita encontrar para sondear sin escribir: subsistema, tag, punch, certificado y PSSR.

INSERT INTO public.projects (id, org_id, name, code, timezone) VALUES
  ('e2e00000-0000-4000-8000-0000000000b2', 'e2e00000-0000-4000-8000-000000000001', 'Pruebas de BD', 'TDB', 'America/Bogota');

INSERT INTO public.areas (id, project_id, name, code) VALUES
  ('e2e00000-0000-4000-8000-0000000009c1', 'e2e00000-0000-4000-8000-0000000000b2', 'Área de pruebas', 'T100');
INSERT INTO public.systems (id, area_id, project_id, name, code) VALUES
  ('e2e00000-0000-4000-8000-0000000009c2', 'e2e00000-0000-4000-8000-0000000009c1', 'e2e00000-0000-4000-8000-0000000000b2', 'Sistema de pruebas', 'T100-S01');
INSERT INTO public.subsystems (id, system_id, project_id, name, code) VALUES
  ('e2e00000-0000-4000-8000-0000000009c3', 'e2e00000-0000-4000-8000-0000000009c2', 'e2e00000-0000-4000-8000-0000000000b2', 'Subsistema de pruebas', 'T100-S01-01');

INSERT INTO public.tags (id, subsystem_id, project_id, discipline_id, tag_number, description) VALUES
  ('e2e00000-0000-4000-8000-0000000009f1', 'e2e00000-0000-4000-8000-0000000009c3', 'e2e00000-0000-4000-8000-0000000000b2',
   'e2e00000-0000-4000-8000-0000000000d1', 'PT-TDB-001', 'Transmisor de las pruebas de BD');

INSERT INTO public.punches (id, project_id, subsystem_id, tag_id, punch_number, category, description, discipline_id,
                            raised_by, status, priority) VALUES
  ('e2e00000-0000-4000-8000-000000000941', 'e2e00000-0000-4000-8000-0000000000b2', 'e2e00000-0000-4000-8000-0000000009c3',
   'e2e00000-0000-4000-8000-0000000009f1', '', 'C', 'Punch fijo de la matriz de autorización',
   'e2e00000-0000-4000-8000-0000000000d1', 'e2e00000-0000-4000-8000-0000000000a5', 'open', 'minor');

INSERT INTO public.certificates (id, project_id, phase_id, subsystem_id, certificate_number, title) VALUES
  ('e2e00000-0000-4000-8000-000000000951', 'e2e00000-0000-4000-8000-0000000000b2', 'e2e00000-0000-4000-8000-0000000000d2',
   'e2e00000-0000-4000-8000-0000000009c3', 'MC-TDB-0001', 'Certificado fijo de la matriz de autorización');

INSERT INTO public.pssr_reviews (id, org_id, project_id, system_id, review_number, title) VALUES
  ('e2e00000-0000-4000-8000-000000000961', 'e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000b2',
   'e2e00000-0000-4000-8000-0000000009c2', 'PSSR-TDB-0001', 'PSSR fijo de la matriz de autorización');
