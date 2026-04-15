-- ══════════════════════════════════════════════════════════════
-- Stage 10.3 — System Readiness Engine v1
-- ══════════════════════════════════════════════════════════════
-- compute_system_readiness(system_id) devuelve el estado de
-- preparación de un sistema para sus hitos de completion:
--   · itr_pct          % de ITRs aprobados en subsystems del sistema
--   · open_punches_a   punches categoría A abiertos (bloquean MC)
--   · open_punches_b   categoría B abiertos (bloquean RFSU)
--   · open_punches_c   categoría C abiertos (bloquean RFC)
--   · ready_mc         todos ITRs aprobados + 0 punches A
--   · ready_rfsu       ready_mc + 0 punches B
--   · ready_rfc        ready_rfsu + 0 punches C
--   · blockers         jsonb[] con códigos y mensajes legibles
--
-- compute_project_readiness(project_id) aplica la función a todos
-- los sistemas de un proyecto (usado por Control Tower).
--
-- SECURITY INVOKER: las funciones respetan RLS del caller —
-- usuarios solo ven readiness de proyectos a los que pertenecen.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_system_readiness(p_system_id uuid)
RETURNS TABLE (
  system_id        uuid,
  itr_total        integer,
  itr_approved     integer,
  itr_pct          numeric,
  open_punches_a   integer,
  open_punches_b   integer,
  open_punches_c   integer,
  ready_mc         boolean,
  ready_rfsu       boolean,
  ready_rfc        boolean,
  blockers         jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_itr_total    integer := 0;
  v_itr_approved integer := 0;
  v_itr_pct      numeric := 0;
  v_a            integer := 0;
  v_b            integer := 0;
  v_c            integer := 0;
  v_mc           boolean;
  v_rfsu         boolean;
  v_rfc          boolean;
  v_blockers     jsonb   := '[]'::jsonb;
BEGIN
  -- ── ITR stats vía subsystems ────────────────────────────────
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE i.status = 'approved')::int
  INTO v_itr_total, v_itr_approved
  FROM itrs i
  JOIN subsystems ss ON ss.id = i.subsystem_id
  WHERE ss.system_id = p_system_id;

  IF v_itr_total > 0 THEN
    v_itr_pct := ROUND((v_itr_approved::numeric / v_itr_total) * 100, 2);
  END IF;

  -- ── Punches abiertos por categoría ──────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE p.category = 'A')::int,
    COUNT(*) FILTER (WHERE p.category = 'B')::int,
    COUNT(*) FILTER (WHERE p.category = 'C')::int
  INTO v_a, v_b, v_c
  FROM punches p
  JOIN subsystems ss ON ss.id = p.subsystem_id
  WHERE ss.system_id = p_system_id
    AND p.status IN ('open', 'in_progress');

  -- ── Gates de readiness ──────────────────────────────────────
  v_mc   := (v_itr_total > 0) AND (v_itr_approved = v_itr_total) AND (v_a = 0);
  v_rfsu := v_mc AND (v_b = 0);
  v_rfc  := v_rfsu AND (v_c = 0);

  -- ── Blockers (orden: severidad descendente) ─────────────────
  IF v_itr_total = 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'no_itrs',
      'severity','high',
      'message', 'No ITRs defined for this system'
    ));
  ELSIF v_itr_approved < v_itr_total THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'itrs_incomplete',
      'severity','high',
      'message', format('%s of %s ITRs approved (%s%%)',
                        v_itr_approved, v_itr_total, v_itr_pct),
      'pending', v_itr_total - v_itr_approved
    ));
  END IF;

  IF v_a > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'punches_a_open',
      'severity','high',
      'message', format('%s Category A punch(es) open — blocks MC', v_a),
      'count',   v_a
    ));
  END IF;

  IF v_b > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'punches_b_open',
      'severity','medium',
      'message', format('%s Category B punch(es) open — blocks RFSU', v_b),
      'count',   v_b
    ));
  END IF;

  IF v_c > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code',    'punches_c_open',
      'severity','low',
      'message', format('%s Category C punch(es) open — blocks RFC', v_c),
      'count',   v_c
    ));
  END IF;

  RETURN QUERY SELECT
    p_system_id,
    v_itr_total,
    v_itr_approved,
    v_itr_pct,
    v_a, v_b, v_c,
    v_mc, v_rfsu, v_rfc,
    v_blockers;
END;
$$;

GRANT EXECUTE ON FUNCTION compute_system_readiness(uuid) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- compute_project_readiness — batch para Control Tower
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_project_readiness(p_project_id uuid)
RETURNS TABLE (
  system_id       uuid,
  system_code     text,
  system_name     text,
  area_code       text,
  area_name       text,
  itr_total       integer,
  itr_approved    integer,
  itr_pct         numeric,
  open_punches_a  integer,
  open_punches_b  integer,
  open_punches_c  integer,
  ready_mc        boolean,
  ready_rfsu      boolean,
  ready_rfc       boolean,
  blockers        jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.code,
    s.name,
    a.code,
    a.name,
    r.itr_total,
    r.itr_approved,
    r.itr_pct,
    r.open_punches_a,
    r.open_punches_b,
    r.open_punches_c,
    r.ready_mc,
    r.ready_rfsu,
    r.ready_rfc,
    r.blockers
  FROM systems s
  JOIN areas a ON a.id = s.area_id
  CROSS JOIN LATERAL compute_system_readiness(s.id) r
  WHERE s.project_id = p_project_id
  ORDER BY a.code, s.code;
$$;

GRANT EXECUTE ON FUNCTION compute_project_readiness(uuid) TO authenticated;
