-- Seed DEMO (fase 6, sesión 2, decisión §12.17): curva de arranque simulada del compresor C-103 (A100-S02)
-- para mostrar la foto IIoT y el gráfico de la bitácora de arranque.
--
-- Re-ejecutable: borra su propio lote SIMULATOR anterior de la org DEMO y genera 2 h de muestras por minuto que
-- terminan en el minuto actual (la curva queda fechada el día en que se corre). No crea eventos: el hito se
-- registra en la app (Arranque → Bitácora) para ver cómo se congela la foto.
--
-- Escenario (minuto 0 = hace 2 h):
--   ESDV-7621003 abre en el min 8 · XV-102 en el min 10 · XV-104 en el min 24
--   PT-101 (barg)   0,3 → 11,8 desde el min 10 (rampa exponencial) + ruido
--   FT-106/107      0 → ~18 MMSCFD desde el min 25 («primer HC»), FT-107 con 2 min de retraso
--   LT-101 (%)      20 → ~45 (se estabiliza)
--
-- Uso:  supabase db query --linked -f scripts/demo-data/seed_startup_samples_demo.sql

DO $seed$
DECLARE
  v_org     uuid := 'e12c53b2-85fd-462f-86f3-bba318aa77ee';   -- DEMO Refinería Los Andes
  v_project uuid := 'abc47484-59d3-4f51-8966-7fb4f1174ba8';   -- DEMO Planta GLP - Fase 2
  v_batch   uuid;
  v_start   timestamptz := date_trunc('minute', now()) - interval '119 minutes';
  v_n       integer;
BEGIN
  -- E-35: solo el lote propio (por source_system); el de desempeño (seed_performance_demo.sql) se conserva.
  DELETE FROM signal_samples WHERE source_batch IN (SELECT id FROM signal_sample_batches WHERE org_id = v_org AND source = 'SIMULATOR' AND source_system = 'CommUp DEMO · arranque C-103');
  DELETE FROM signal_sample_batches WHERE org_id = v_org AND source = 'SIMULATOR' AND source_system = 'CommUp DEMO · arranque C-103';

  INSERT INTO signal_sample_batches (org_id, source, source_system)
  VALUES (v_org, 'SIMULATOR', 'CommUp DEMO · arranque C-103')
  RETURNING id INTO v_batch;

  WITH sig AS (
    SELECT s.id, s.signal_tag FROM signals s JOIN tags t ON t.id = s.tag_id
    WHERE t.project_id = v_project AND s.signal_tag IN
      ('PT-101', 'FT-106', 'FT-107', 'LT-101', 'XV-102-ZSO', 'XV-102-ZSC', 'XV-104-ZSO', 'XV-104-ZSC', 'ESDV-7621003-ZSO', 'ESDV-7621003-ZSC')
  ),
  m AS (SELECT generate_series(0, 119) AS i),
  vals AS (
    SELECT sig.id AS signal_id, v_start + (m.i || ' minutes')::interval AS sampled_at,
      CASE sig.signal_tag
        WHEN 'PT-101' THEN CASE WHEN m.i < 10 THEN 0.3 ELSE 0.3 + 11.5 * (1 - exp(-(m.i - 10) / 8.0)) END + 0.08 * sin(m.i * 1.7)
        WHEN 'FT-106' THEN CASE WHEN m.i < 25 THEN 0 ELSE 18 * (1 - exp(-(m.i - 25) / 10.0)) + 0.25 * sin(m.i * 2.3) END
        WHEN 'FT-107' THEN CASE WHEN m.i < 27 THEN 0 ELSE 17.2 * (1 - exp(-(m.i - 27) / 10.0)) + 0.25 * sin(m.i * 1.9) END
        WHEN 'LT-101' THEN 20 + 25 * (1 - exp(-m.i / 30.0)) + 0.4 * sin(m.i * 0.9)
        WHEN 'XV-102-ZSO' THEN CASE WHEN m.i >= 10 THEN 1 ELSE 0 END
        WHEN 'XV-102-ZSC' THEN CASE WHEN m.i >= 10 THEN 0 ELSE 1 END
        WHEN 'XV-104-ZSO' THEN CASE WHEN m.i >= 24 THEN 1 ELSE 0 END
        WHEN 'XV-104-ZSC' THEN CASE WHEN m.i >= 24 THEN 0 ELSE 1 END
        WHEN 'ESDV-7621003-ZSO' THEN CASE WHEN m.i >= 8 THEN 1 ELSE 0 END
        WHEN 'ESDV-7621003-ZSC' THEN CASE WHEN m.i >= 8 THEN 0 ELSE 1 END
      END AS value
    FROM sig CROSS JOIN m
  )
  INSERT INTO signal_samples (signal_id, sampled_at, value, quality, source_batch)
  SELECT signal_id, sampled_at, round(GREATEST(value, 0)::numeric, 3)::double precision, 0, v_batch FROM vals;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE signal_sample_batches SET sample_count = v_n, accepted_count = v_n WHERE id = v_batch;
  RAISE NOTICE 'SIMULATOR: % muestras desde %', v_n, v_start;
END;
$seed$;

SELECT s.signal_tag, COUNT(*) AS samples, MIN(ss.sampled_at) AS desde, MAX(ss.sampled_at) AS hasta, ROUND(MAX(ss.value)::numeric, 2) AS max_value
FROM signal_samples ss JOIN signals s ON s.id = ss.signal_id
JOIN signal_sample_batches b ON b.id = ss.source_batch AND b.source = 'SIMULATOR'
GROUP BY s.signal_tag ORDER BY s.signal_tag;
