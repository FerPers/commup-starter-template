-- 2026-09-03: Start-Up no es una 4ª letra de ITR (decisión de producto, ver guía SEC 05).
-- La fase de arranque pasa de código D a SU; la letra D queda reservada para
-- Decomisionamiento y R para Recomisionamiento (se crean por configuración).
-- Solo renombra: certificados RFSU existentes conservan su phase_id.
UPDATE public.project_phases
SET code = 'SU', name = 'Start-Up / Puesta en marcha'
WHERE code = 'D' AND certificate_name = 'RFSU';
