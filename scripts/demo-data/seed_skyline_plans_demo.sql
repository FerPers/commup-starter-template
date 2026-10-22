-- Seed DEMO (E1, maquetas M aprobadas 2026-10-22): fechas de plan por sistema × liberación en DEMO-GLP para el
-- skyline de Planificación. Relativas al «hoy» del proyecto: hay vencidas, de esta semana y futuras; dos
-- sistemas quedan con solo pronóstico y uno sin fecha (bandeja «Sin fecha»).
--
-- Nunca pisa un plan existente (ON CONFLICT DO NOTHING): se puede correr de nuevo sin tocar lo que la gente cargó.
-- Uso:  supabase db query --linked -f scripts/demo-data/seed_skyline_plans_demo.sql

DO $seed$
DECLARE
  v_project uuid := 'abc47484-59d3-4f51-8966-7fb4f1174ba8';   -- DEMO Planta GLP - Fase 2
  v_org     uuid;
  v_today   date;
  v_n       integer;
BEGIN
  SELECT org_id INTO v_org FROM projects WHERE id = v_project;
  IF v_org IS NULL THEN RAISE NOTICE 'DEMO-GLP no existe: nada que sembrar'; RETURN; END IF;
  v_today := project_today(v_project);

  WITH plan(code, mc_days, forecast_only) AS (VALUES
    ('A100-S01', -14, false), ('A100-S02', -9, false), ('A200-S01', 6, false), ('A200-S02', 13, false),
    ('A200-S03', 12, true),   ('A300-S01', 27, false), ('A300-S02', 34, true), ('A300-S03', 41, false),
    ('OS01-S01', 20, false),  ('U100-S01', -12, false), ('U100-S02', 3, false), ('U200-S01', -5, false),
    ('U200-S02', 8, false)
    -- OS01-S02 queda sin fecha a propósito.
  ),
  gates(code, shift) AS (VALUES ('MC', 0), ('RFPC', 28), ('RFC', 56), ('RFSU', 84)),
  rows AS (
    SELECT s.id AS system_id, g.id AS gate_id, (v_today + p.mc_days + gs.shift) AS d, p.forecast_only,
           -- el pronóstico va 0–6 días detrás del compromiso según el sistema (determinista)
           (abs(hashtext(s.code)) % 7) AS slip
    FROM plan p
    JOIN systems s ON s.project_id = v_project AND s.code = p.code
    JOIN gates gs ON gs.code <> 'RFSU' OR p.code IN ('A100-S01', 'U100-S01', 'U200-S01', 'U200-S02')
    JOIN readiness_gates g ON g.org_id = v_org AND g.code = gs.code AND g.is_active
  )
  INSERT INTO system_gate_plans (system_id, gate_id, org_id, project_id, forecast_date, forecast_at, commitment_date, commitment_at)
  SELECT system_id, gate_id, v_org, v_project, d + slip, now(),
         CASE WHEN forecast_only THEN NULL ELSE d END, CASE WHEN forecast_only THEN NULL ELSE now() END
  FROM rows
  ON CONFLICT (system_id, gate_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Planes sembrados: %', v_n;
END
$seed$;
