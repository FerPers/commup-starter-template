-- ══════════════════════════════════════════════════════════════
-- STAGE 18 — Punch counter drift fix
-- ══════════════════════════════════════════════════════════════
-- Bug: next_punch_number_atomic genera P-NNNN basándose solo en
-- punch_counters.last_seq + 1. Si el counter está desincronizado
-- respecto a la data real (counter atrás de MAX(punch_number)),
-- la siguiente inserción colisiona con UNIQUE(project_id, punch_number).
--
-- Fix:
--   1) Endurecer next_punch_number_atomic con piso = MAX real.
--   2) Backfill punch_counters al MAX real por proyecto.

-- ── 1) Generator robusto ante drift ───────────────────────────
CREATE OR REPLACE FUNCTION public.next_punch_number_atomic(p_project_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_existing INTEGER;
  v_next     INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN punch_number ~ '^P-\d+$'
         THEN SUBSTRING(punch_number FROM 3)::int
         ELSE 0 END
  ), 0)
  INTO v_existing
  FROM punches WHERE project_id = p_project_id;

  INSERT INTO punch_counters (project_id, last_seq)
  VALUES (p_project_id, GREATEST(v_existing, 0) + 1)
  ON CONFLICT (project_id) DO UPDATE
    SET last_seq = GREATEST(punch_counters.last_seq, v_existing) + 1
  RETURNING last_seq INTO v_next;

  RETURN 'P-' || LPAD(v_next::text, 4, '0');
END;
$$;

-- ── 2) Backfill ───────────────────────────────────────────────
INSERT INTO punch_counters (project_id, last_seq)
SELECT
  project_id,
  MAX(CASE WHEN punch_number ~ '^P-\d+$' THEN SUBSTRING(punch_number FROM 3)::int ELSE 0 END)
FROM punches
GROUP BY project_id
ON CONFLICT (project_id) DO UPDATE
  SET last_seq = GREATEST(punch_counters.last_seq, EXCLUDED.last_seq);
