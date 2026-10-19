-- Seed DEMO (fase 7, sesión 3, decisión §14.9): intento de la prueba de desempeño PTT-0001 «Capacidad del compresor C-103»
-- (A100-S02) de punta a punta con el simulador: 1 h de estabilización + 6 h de periodo formal, una perturbación que se
-- excluye del cálculo y el par de medidores F1 ↔ F2.
--
-- Re-ejecutable: aborta el intento en curso (si lo hay), reemplaza el lote SIMULATOR propio y abre un intento nuevo
-- (R2, R3…) que termina 10 min antes de ahora. Todo pasa por las RPC de la app actuando como luis.perdomo@outlook.com
-- (owner de DEMO), así que valida las mismas reglas que la UI. NO registra el resultado ni emite el PTC: eso se hace en
-- la app (Arranque → Desempeño → intento) para ver la evaluación sugerida «Aceptado».
--
-- Escenario (minuto 0 = inicio de la estabilización = hace 7 h 10 min):
--   min 0–59     estabilización: PT-101 9,0 → 11,5 barg, FT-106 15 → 18,2 MMSCFD
--   min 60–419   periodo formal: PT-101 ≈ 11,5 (banda 11–12), FT-106 ≈ 18,2, FT-107 = FT-106 − 1,5 % (par ≤ 5 %)
--   min 240–259  perturbación «trip del aeroenfriador»: PT-101 10,3, FT-106 15,4 → excluida (sin excluir, %t en banda
--                cae a ~94 % < 95 % y prom(F1) baja; con la exclusión todo cumple)
--   KW manual    lecturas de tablero ~1.555 kW → ESP = KW ÷ F1 ≈ 85 kW/MMSCFD (≤ 90)
--   FT-107       2 min con calidad mala (min 150–151) para que la validación lo informe
--
-- Uso:  supabase db query --linked -f scripts/demo-data/seed_performance_demo.sql

DO $seed$
DECLARE
  v_org     uuid := 'e12c53b2-85fd-462f-86f3-bba318aa77ee';   -- DEMO Refinería Los Andes
  v_project uuid := 'abc47484-59d3-4f51-8966-7fb4f1174ba8';   -- DEMO Planta GLP - Fase 2
  v_user    uuid := 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366';   -- luis.perdomo@outlook.com (owner)
  v_label   text := 'CommUp DEMO · prueba de desempeño C-103';
  v_test    uuid;
  v_rev     uuid;
  v_run     uuid;
  v_kw      uuid;
  v_dist    uuid;
  v_batch   uuid;
  v_t0      timestamptz := date_trunc('minute', now()) - interval '430 minutes';
  v_n       integer;
  v_read    record;
BEGIN
  SELECT id, current_revision_id INTO v_test, v_rev FROM performance_tests WHERE project_id = v_project AND number = 'PTT-0001';
  IF v_test IS NULL THEN RAISE EXCEPTION 'PTT-0001 no existe en DEMO'; END IF;
  SELECT id INTO v_kw FROM performance_variables WHERE revision_id = v_rev AND key = 'KW';

  -- 1. Muestras simuladas (lote propio; no toca el lote de la bitácora de arranque).
  DELETE FROM signal_samples WHERE source_batch IN (SELECT id FROM signal_sample_batches WHERE org_id = v_org AND source = 'SIMULATOR' AND source_system = v_label);
  DELETE FROM signal_sample_batches WHERE org_id = v_org AND source = 'SIMULATOR' AND source_system = v_label;
  INSERT INTO signal_sample_batches (org_id, source, source_system) VALUES (v_org, 'SIMULATOR', v_label) RETURNING id INTO v_batch;

  WITH sig AS (
    SELECT s.id, s.signal_tag FROM signals s JOIN tags t ON t.id = s.tag_id
    WHERE t.project_id = v_project AND s.signal_tag IN ('PT-101', 'FT-106', 'FT-107')
  ),
  m AS (
    SELECT i,
      CASE WHEN i < 60 THEN 15 + 3.2 * (1 - exp(-i / 15.0))
           WHEN i BETWEEN 240 AND 259 THEN 15.4 + 0.1 * sin(i * 1.1)
           ELSE 18.2 + 0.18 * sin(i * 2.1) END AS f1
    FROM generate_series(0, 419) AS i
  ),
  vals AS (
    SELECT sig.id AS signal_id, v_t0 + make_interval(mins => m.i) AS sampled_at,
      CASE sig.signal_tag
        WHEN 'PT-101' THEN CASE WHEN m.i < 60 THEN 9.0 + 2.5 * (1 - exp(-m.i / 12.0)) + 0.05 * sin(m.i * 1.7)
                                WHEN m.i BETWEEN 240 AND 259 THEN 10.3 + 0.1 * sin(m.i * 1.3)
                                ELSE 11.5 + 0.12 * sin(m.i * 1.3) END
        WHEN 'FT-106' THEN m.f1
        WHEN 'FT-107' THEN m.f1 * 0.985 + 0.1 * sin(m.i * 1.7)
      END AS value,
      CASE WHEN sig.signal_tag = 'FT-107' AND m.i IN (150, 151) THEN 192 ELSE 0 END AS quality
    FROM sig CROSS JOIN m
  )
  INSERT INTO signal_samples (signal_id, sampled_at, value, quality, source_batch)
  SELECT signal_id, sampled_at, round(value::numeric, 3)::double precision, quality, v_batch FROM vals
  ON CONFLICT (signal_id, sampled_at) DO UPDATE SET value = EXCLUDED.value, quality = EXCLUDED.quality, source_batch = EXCLUDED.source_batch;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE signal_sample_batches SET sample_count = v_n, accepted_count = v_n WHERE id = v_batch;

  -- 2. Intento nuevo dirigido por el owner (las RPC leen auth.uid() de los claims).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  FOR v_run IN SELECT id FROM performance_runs WHERE test_id = v_test AND status IN ('planned', 'stabilizing', 'formal') LOOP
    PERFORM abort_performance_run(v_run, 'Reemplazado por el seed DEMO');
  END LOOP;

  v_run := start_performance_run(v_test);
  PERFORM advance_performance_run(v_run, 'stabilizing', v_t0, NULL);
  PERFORM advance_performance_run(v_run, 'formal', v_t0 + interval '60 minutes', NULL);

  FOR v_read IN SELECT * FROM (VALUES (0, 1490.0), (60, 1552.0), (120, 1561.0), (180, 1548.0), (230, 1557.0),
                                      (265, 1563.0), (300, 1550.0), (360, 1559.0), (419, 1554.0)) AS r(i, kw) LOOP
    PERFORM add_performance_manual_reading(v_run, v_kw, v_t0 + make_interval(mins => v_read.i), v_read.kw);
  END LOOP;

  v_dist := record_performance_disturbance(v_run, 'trip', 'Trip del aeroenfriador E-103 por vibración; el compresor bajó carga hasta el rearme.',
                                           v_t0 + interval '240 minutes', v_t0 + interval '260 minutes');

  PERFORM close_performance_run(v_run, v_t0 + interval '420 minutes', NULL);
  PERFORM set_performance_disturbance_exclusion(v_dist, true, 'Evento externo a la prueba (aeroenfriador fuera de la frontera); rearme en 20 min.');

  RAISE NOTICE 'SIMULATOR: % muestras desde %; intento % cerrado', v_n, v_t0, (SELECT number FROM performance_runs WHERE id = v_run);
END;
$seed$;

SELECT r.number, r.status, r.stabilization_started_at, r.formal_started_at, r.closed_at, r.early_close, r.frozen_rows,
       (SELECT count(*) FROM performance_disturbances d WHERE d.run_id = r.id AND d.excluded) AS excluded_disturbances
FROM performance_runs r JOIN performance_tests t ON t.id = r.test_id
WHERE t.project_id = 'abc47484-59d3-4f51-8966-7fb4f1174ba8' AND t.number = 'PTT-0001'
ORDER BY r.attempt;
