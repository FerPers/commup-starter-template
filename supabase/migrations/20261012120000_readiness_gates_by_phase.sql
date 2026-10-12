-- Readiness por fase, unificado con src/lib/certificates/eligibility.ts (2026-10-12).
--
-- Antes: compute_system_readiness calculaba gates fijos MC → RFSU → RFC sobre TODOS los ITRs
-- del sistema, sin RFPC, y bloqueaba con Cat B (RFSU) y Cat C (RFC). La emisión de
-- certificados (TS) evalúa por subsistema × fase y trata Cat B como excepción justificada, así
-- que Control Tower y Certificados podían contradecirse.
--
-- Ahora los gates son las fases configuradas de la org (project_phases, en order_index), y cada
-- subsistema × fase se evalúa con las mismas reglas que eligibility.ts:
--   rojo     : sin ITRs en la fase, ITRs sin aprobar, Cat A abiertos, o Cat B abiertos > límite
--   amarillo : Cat B abiertos dentro del límite (requieren justificación al emitir)
--   verde    : nada pendiente
--   Cat C nunca bloquea.
-- Límite de Cat B: organizations.settings.max_open_cat_b_per_subsystem
--   (ausente = 3, número = entero ≥ 0, null u otro = sin límite).
-- El sistema queda en el peor nivel de sus subsistemas; sin subsistemas = rojo.
-- `ready` = nivel verde o amarillo (amarillo = Ready with conditions).

DROP FUNCTION IF EXISTS public.compute_project_readiness(uuid);
DROP FUNCTION IF EXISTS public.compute_system_readiness(uuid);

CREATE FUNCTION public.compute_system_readiness(p_system_id uuid)
RETURNS TABLE(
  system_id uuid,
  itr_total integer,
  itr_approved integer,
  itr_pct numeric,
  open_punches_a integer,
  open_punches_b integer,
  open_punches_c integer,
  cat_b_limit integer,
  gates jsonb,
  blockers jsonb
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_org          uuid;
  v_settings     jsonb;
  v_limit        integer;
  v_ss_count     integer := 0;
  v_itr_total    integer := 0;
  v_itr_approved integer := 0;
  v_itr_pct      numeric := 0;
  v_a            integer := 0;
  v_b            integer := 0;
  v_c            integer := 0;
  v_b_over       integer := 0;
  v_gates        jsonb   := '[]'::jsonb;
  v_blockers     jsonb   := '[]'::jsonb;
BEGIN
  -- Org del sistema (bajo RLS: si el sistema no es visible no se devuelve nada)
  SELECT p.org_id, o.settings
    INTO v_org, v_settings
  FROM systems s
  JOIN projects p      ON p.id = s.project_id
  JOIN organizations o ON o.id = p.org_id
  WHERE s.id = p_system_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  -- Límite de Cat B (mismo criterio que resolveCatBLimit en TS)
  IF v_settings IS NULL OR NOT (v_settings ? 'max_open_cat_b_per_subsystem') THEN
    v_limit := 3;
  ELSIF jsonb_typeof(v_settings -> 'max_open_cat_b_per_subsystem') = 'number' THEN
    v_limit := GREATEST(trunc((v_settings ->> 'max_open_cat_b_per_subsystem')::numeric)::int, 0);
  ELSE
    v_limit := NULL;
  END IF;

  SELECT COUNT(*)::int INTO v_ss_count FROM subsystems ss WHERE ss.system_id = p_system_id;

  -- ── Totales del sistema (todas las fases) ───────────────────
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

  SELECT
    COUNT(*) FILTER (WHERE p.category = 'A')::int,
    COUNT(*) FILTER (WHERE p.category = 'B')::int,
    COUNT(*) FILTER (WHERE p.category = 'C')::int
  INTO v_a, v_b, v_c
  FROM punches p
  JOIN subsystems ss ON ss.id = p.subsystem_id
  WHERE ss.system_id = p_system_id
    AND p.status IN ('open', 'in_progress');

  -- Subsistemas que superan el límite de Cat B
  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_b_over
    FROM (
      SELECT p.subsystem_id
      FROM punches p
      JOIN subsystems ss ON ss.id = p.subsystem_id
      WHERE ss.system_id = p_system_id
        AND p.category = 'B'
        AND p.status IN ('open', 'in_progress')
      GROUP BY p.subsystem_id
      HAVING COUNT(*) > v_limit
    ) over_limit;
  END IF;

  -- ── Gates por fase ──────────────────────────────────────────
  WITH ss AS (
    SELECT s.id FROM subsystems s WHERE s.system_id = p_system_id
  ),
  ph AS (
    SELECT f.id, f.code, f.name, f.certificate_name, f.order_index
    FROM project_phases f
    WHERE f.org_id = v_org
  ),
  pun AS (
    SELECT p.subsystem_id,
           COUNT(*) FILTER (WHERE p.category = 'A') AS a,
           COUNT(*) FILTER (WHERE p.category = 'B') AS b
    FROM punches p
    WHERE p.subsystem_id IN (SELECT id FROM ss)
      AND p.status IN ('open', 'in_progress')
    GROUP BY p.subsystem_id
  ),
  it AS (
    SELECT i.subsystem_id, i.phase_id,
           COUNT(*) AS t,
           COUNT(*) FILTER (WHERE i.status = 'approved') AS ap
    FROM itrs i
    WHERE i.subsystem_id IN (SELECT id FROM ss)
    GROUP BY i.subsystem_id, i.phase_id
  ),
  lvl AS (
    SELECT ph.id AS phase_id,
           COALESCE(it.t, 0)  AS t,
           COALESCE(it.ap, 0) AS ap,
           CASE
             WHEN COALESCE(pun.a, 0) > 0
               OR COALESCE(it.t, 0) = 0
               OR COALESCE(it.ap, 0) < COALESCE(it.t, 0)
               OR (v_limit IS NOT NULL AND COALESCE(pun.b, 0) > v_limit) THEN 'red'
             WHEN COALESCE(pun.b, 0) > 0 THEN 'yellow'
             ELSE 'green'
           END AS level
    FROM ph
    CROSS JOIN ss
    LEFT JOIN it  ON it.subsystem_id = ss.id AND it.phase_id = ph.id
    LEFT JOIN pun ON pun.subsystem_id = ss.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'phase_id',          ph.id,
           'code',              ph.code,
           'name',              ph.name,
           'certificate',       COALESCE(ph.certificate_name, ph.code),
           'order',             ph.order_index,
           'itr_total',         g.t,
           'itr_approved',      g.ap,
           'subsystems_total',  g.n,
           'subsystems_red',    g.r,
           'subsystems_yellow', g.y,
           'level',             CASE WHEN g.n = 0 OR g.r > 0 THEN 'red'
                                     WHEN g.y > 0 THEN 'yellow'
                                     ELSE 'green' END,
           'ready',             (g.n > 0 AND g.r = 0)
         ) ORDER BY ph.order_index), '[]'::jsonb)
    INTO v_gates
  FROM ph
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::int                                   AS n,
           COALESCE(SUM(l.t), 0)::int                      AS t,
           COALESCE(SUM(l.ap), 0)::int                     AS ap,
           (COUNT(*) FILTER (WHERE l.level = 'red'))::int    AS r,
           (COUNT(*) FILTER (WHERE l.level = 'yellow'))::int AS y
    FROM lvl l
    WHERE l.phase_id = ph.id
  ) g;

  -- ── Blockers (severidad descendente); la UI traduce por `code` ──
  IF v_ss_count = 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'no_subsystems', 'severity', 'high',
      'message', 'No subsystems defined for this system'));
  END IF;

  IF v_itr_total = 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'no_itrs', 'severity', 'high',
      'message', 'No ITRs defined for this system'));
  ELSIF v_itr_approved < v_itr_total THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'itrs_incomplete', 'severity', 'high',
      'message', format('%s of %s ITRs approved (%s%%)', v_itr_approved, v_itr_total, v_itr_pct),
      'pending', v_itr_total - v_itr_approved));
  END IF;

  IF v_a > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'punches_a_open', 'severity', 'high',
      'message', format('%s Category A punch(es) open — block every gate', v_a),
      'count', v_a));
  END IF;

  IF v_b_over > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'punches_b_over_limit', 'severity', 'high',
      'message', format('%s subsystem(s) exceed the limit of %s open Category B punches', v_b_over, v_limit),
      'count', v_b_over, 'limit', v_limit));
  END IF;

  IF v_b > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'punches_b_open', 'severity', 'medium',
      'message', format('%s Category B punch(es) open — require justification at issuance', v_b),
      'count', v_b));
  END IF;

  RETURN QUERY SELECT
    p_system_id,
    v_itr_total,
    v_itr_approved,
    v_itr_pct,
    v_a, v_b, v_c,
    v_limit,
    v_gates,
    v_blockers;
END;
$$;

CREATE FUNCTION public.compute_project_readiness(p_project_id uuid)
RETURNS TABLE(
  system_id uuid,
  system_code text,
  system_name text,
  area_code text,
  area_name text,
  itr_total integer,
  itr_approved integer,
  itr_pct numeric,
  open_punches_a integer,
  open_punches_b integer,
  open_punches_c integer,
  cat_b_limit integer,
  gates jsonb,
  blockers jsonb
)
LANGUAGE sql STABLE
SET search_path TO 'public'
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
    r.cat_b_limit,
    r.gates,
    r.blockers
  FROM systems s
  JOIN areas a ON a.id = s.area_id
  CROSS JOIN LATERAL compute_system_readiness(s.id) r
  WHERE s.project_id = p_project_id
  ORDER BY a.code, s.code;
$$;

-- SECURITY INVOKER (RLS aplica); solo usuarios autenticados.
REVOKE EXECUTE ON FUNCTION public.compute_system_readiness(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_project_readiness(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_system_readiness(uuid)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.compute_project_readiness(uuid) TO authenticated, service_role;
