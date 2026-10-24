-- A17: borra el proyecto de referencia REF-5K de la BD LOCAL (seed-reference.sql). Sin triggers: las guardas de
-- borrado (ITR firmados, certificados emitidos) no aplican a un banco desechable.
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL session_replication_role = replica;
DELETE FROM projects WHERE id = '5e0f5000-0000-4000-8000-000000000002';
DELETE FROM organizations WHERE id = '5e0f5000-0000-4000-8000-000000000001';
COMMIT;
