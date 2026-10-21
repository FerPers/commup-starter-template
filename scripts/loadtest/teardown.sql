-- S20 — borra el banco de carga LOADTEST (org, proyecto y todo lo que cuelga por cascada).
-- Uso: supabase db query --linked -f scripts/loadtest/teardown.sql
-- Se apagan los mismos triggers que en seed.sql (eventos y guardas que exigen el flujo real) solo dentro de la transacción.
BEGIN;
SET LOCAL statement_timeout = 0;
ALTER TABLE tags DISABLE TRIGGER trg_events_tags;
ALTER TABLE systems DISABLE TRIGGER trg_events_systems;
ALTER TABLE subsystems DISABLE TRIGGER trg_events_subsystems;
ALTER TABLE certificates DISABLE TRIGGER trg_events_certificates;
ALTER TABLE itrs DISABLE TRIGGER trg_events_itrs, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_certificate_base;
ALTER TABLE punches DISABLE TRIGGER trg_events_punches, DISABLE TRIGGER punches_guard, DISABLE TRIGGER punches_certificate_base;
ALTER TABLE itr_assignments DISABLE TRIGGER itr_assignments_integrity;
DELETE FROM organizations WHERE id = '10ad7e57-0000-4000-8000-000000000001';
ALTER TABLE tags ENABLE TRIGGER trg_events_tags;
ALTER TABLE systems ENABLE TRIGGER trg_events_systems;
ALTER TABLE subsystems ENABLE TRIGGER trg_events_subsystems;
ALTER TABLE certificates ENABLE TRIGGER trg_events_certificates;
ALTER TABLE itrs ENABLE TRIGGER trg_events_itrs, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_certificate_base;
ALTER TABLE punches ENABLE TRIGGER trg_events_punches, ENABLE TRIGGER punches_guard, ENABLE TRIGGER punches_certificate_base;
ALTER TABLE itr_assignments ENABLE TRIGGER itr_assignments_integrity;
COMMIT;
