-- ══════════════════════════════════════════════════════════════
-- Stage 17 — Fase 10: Dashboard widgets configurables por rol
-- ══════════════════════════════════════════════════════════════
-- Persistencia del layout de widgets por usuario.
-- Shape esperado: { "widgets": [ { "id": "<widget_id>", "hidden": <bool> }, ... ] }
-- NULL = usar default por rol (resuelto en aplicación).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dashboard_layout JSONB;

COMMENT ON COLUMN profiles.dashboard_layout IS
  'Per-user dashboard widget layout. NULL → role-based default. Shape: { widgets: [{ id, hidden }] }.';
