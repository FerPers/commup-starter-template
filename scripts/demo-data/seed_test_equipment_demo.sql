-- DEMO «Refinería Los Andes»: inventario de equipos de prueba (fase 4 · bloque B). Re-ejecutable:
-- inserta por código y no toca los que ya existen. Fechas relativas a hoy para que siempre haya
-- uno vigente, uno por vencer (<30 días) y uno vencido.
INSERT INTO public.test_equipment (org_id, code, kind, make, model, serial_number, owner_company, certificate_number, calibrated_on, calibration_due)
VALUES
  ('e12c53b2-85fd-462f-86f3-bba318aa77ee', 'CAL-01', 'loop_calibrator', 'Fluke', '754', '4417021', 'Instrumentos del Llano Ltda.', 'MET-2025-1187', current_date - 345, current_date + 20),
  ('e12c53b2-85fd-462f-86f3-bba318aa77ee', 'PG-01', 'pressure_gauge', 'WIKA', 'CPG1500', 'WK-88231', 'Montajes Andinos S.A.S.', 'LAB-PR-2025-0093', current_date - 380, current_date - 15),
  ('e12c53b2-85fd-462f-86f3-bba318aa77ee', 'MM-01', 'multimeter', 'Fluke', '87V', '99120345', 'Montajes Andinos S.A.S.', 'MET-2026-0221', current_date - 60, current_date + 305)
ON CONFLICT (org_id, code) DO NOTHING;
