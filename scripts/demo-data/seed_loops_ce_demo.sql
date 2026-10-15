-- Fase 4 · bloque D, sesión 3: datos DEMO de lazos (señales con su cadena de loop check) y matrices C&E.
-- Proyecto DEMO Planta GLP - Fase 2. Re-ejecutable: actualiza lo existente por claves naturales.
-- Ampliar CE-A100-S02 deja «desactualizado» el ITR de prueba de C-01 (su foto tenía solo E-01): sirve
-- para mostrar la revisión R2.
DO $$
DECLARE
  pid uuid := 'abc47484-59d3-4f51-8966-7fb4f1174ba8';
  r record; v_loop uuid; v_tag uuid; v_sub uuid; v_disc uuid; m uuid; sys uuid;
BEGIN
  -- ── Lazos y señales: loop, tag, señal, tipo, rango min/max, unidad, alarmas, JB, marshalling, tarjeta, canal, tag DCS, HMI
  FOR r IN SELECT * FROM (VALUES
    ('L-101','PT-101','PT-101','AI',0,16,'barg','PALL 0,5 / PAHH 9,5','JB-01','MC-01','R1-S3','CH-04','PI-101','COMP-01','Presión de succión compresor'),
    ('L-102','LT-101','LT-101','AI',0,100,'%','LAHH 85','JB-01','MC-01','R1-S3','CH-05','LI-101','COMP-01','Nivel depurador de succión'),
    ('L-106','FT-106','FT-106','AI',0,50,'MMSCFD','FALL 8','JB-02','MC-01','R1-S3','CH-06','FI-106','COMP-01','Flujo de descarga (antisurge)'),
    ('L-107','FT-107','FT-107','AI',0,50,'MMSCFD',NULL,'JB-02','MC-01','R1-S3','CH-07','FI-107',NULL,'Flujo de recirculación'),
    ('L-110','XV-102','XV-102-ZSO','DI',NULL,NULL,NULL,NULL,'JB-03','MC-01','R1-S5','CH-01','ZSO-102','COMP-02','Válvula de descarga'),
    ('L-110','XV-102','XV-102-ZSC','DI',NULL,NULL,NULL,NULL,'JB-03','MC-01','R1-S5','CH-02','ZSC-102','COMP-02','Válvula de descarga'),
    ('L-110','XV-102','XV-102-XY','DO',NULL,NULL,NULL,NULL,'JB-03','MC-01','R1-S6','CH-01','XY-102','COMP-02','Válvula de descarga'),
    ('L-111','XV-104','XV-104-ZSO','DI',NULL,NULL,NULL,NULL,'JB-03','MC-01','R1-S5','CH-03','ZSO-104','COMP-02','Venteo / blowdown'),
    ('L-111','XV-104','XV-104-ZSC','DI',NULL,NULL,NULL,NULL,'JB-03','MC-01','R1-S5','CH-04','ZSC-104','COMP-02','Venteo / blowdown'),
    ('L-111','XV-104','XV-104-XY','DO',NULL,NULL,NULL,NULL,'JB-03','MC-01','R1-S6','CH-02','XY-104','COMP-02','Venteo / blowdown'),
    ('L-112','ESDV-7621003','ESDV-7621003-ZSO','DI',NULL,NULL,NULL,NULL,'JB-04','MC-02','R2-S1','CH-01','ZSO-7621003','ESD-01','ESDV de entrada'),
    ('L-112','ESDV-7621003','ESDV-7621003-ZSC','DI',NULL,NULL,NULL,NULL,'JB-04','MC-02','R2-S1','CH-02','ZSC-7621003','ESD-01','ESDV de entrada'),
    ('L-112','ESDV-7621003','ESDV-7621003-XY','DO',NULL,NULL,NULL,NULL,'JB-04','MC-02','R2-S2','CH-01','XY-7621003','ESD-01','ESDV de entrada'),
    ('L-201','LT-109','LT-109','AI',0,100,'%','LALL 15 / LAHH 85','JB-11','MC-03','R3-S1','CH-01','LI-109','SEP-01','Nivel del separador'),
    ('L-202','TT-106','TT-106','AI',0,150,'°C','TAHH 95','JB-11','MC-03','R3-S1','CH-02','TI-106','SEP-01','Temperatura del separador'),
    ('L-203','GD-101','GD-101','AI',0,100,'% LIE','GAH 10 / GAHH 20','JB-12','MC-03','R3-S2','CH-01','AI-101','F&G-01','Detección de gas área separador'),
    ('L-204','FV-107','FV-107','AO',0,100,'%',NULL,'JB-11','MC-03','R3-S4','CH-01','FC-107','SEP-01','Control de flujo de aceite'),
    ('L-205','XV-116','XV-116-ZSO','DI',NULL,NULL,NULL,NULL,'JB-12','MC-03','R3-S3','CH-01','ZSO-116','SEP-02','Válvula de entrada al separador'),
    ('L-205','XV-116','XV-116-ZSC','DI',NULL,NULL,NULL,NULL,'JB-12','MC-03','R3-S3','CH-02','ZSC-116','SEP-02','Válvula de entrada al separador'),
    ('L-205','XV-116','XV-116-XY','DO',NULL,NULL,NULL,NULL,'JB-12','MC-03','R3-S4','CH-02','XY-116','SEP-02','Válvula de entrada al separador')
  ) AS t(loop_number, tag_number, signal_tag, signal_type, rmin, rmax, unit, alarms, jb, marsh, card, chan, dcs, hmi, service) LOOP
    SELECT id, subsystem_id, discipline_id INTO v_tag, v_sub, v_disc FROM public.tags WHERE project_id = pid AND tag_number = r.tag_number;
    IF v_tag IS NULL THEN RAISE NOTICE 'Tag % no existe', r.tag_number; CONTINUE; END IF;
    INSERT INTO public.loops (project_id, subsystem_id, loop_number, discipline_id, description)
    VALUES (pid, v_sub, r.loop_number, v_disc, r.service)
    ON CONFLICT (project_id, loop_number) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_loop;
    INSERT INTO public.loop_tags (loop_id, tag_id, role_in_loop) VALUES (v_loop, v_tag, 'instrument') ON CONFLICT (loop_id, tag_id) DO NOTHING;
    INSERT INTO public.signals (tag_id, signal_tag, signal_type, range_min, range_max, eng_unit, alarm_setpoints, service, loop_id,
                                junction_box, marshalling, io_card, io_channel, dcs_tag, hmi_display, origin)
    VALUES (v_tag, r.signal_tag, r.signal_type::public.signal_type, r.rmin, r.rmax, r.unit, r.alarms, r.service, v_loop,
            r.jb, r.marsh, r.card, r.chan, r.dcs, r.hmi, r.tag_number)
    ON CONFLICT (tag_id, signal_tag) DO UPDATE SET signal_type = EXCLUDED.signal_type, range_min = EXCLUDED.range_min, range_max = EXCLUDED.range_max,
      eng_unit = EXCLUDED.eng_unit, alarm_setpoints = EXCLUDED.alarm_setpoints, service = EXCLUDED.service, loop_id = EXCLUDED.loop_id,
      junction_box = EXCLUDED.junction_box, marshalling = EXCLUDED.marshalling, io_card = EXCLUDED.io_card, io_channel = EXCLUDED.io_channel,
      dcs_tag = EXCLUDED.dcs_tag, hmi_display = EXCLUDED.hmi_display;
  END LOOP;

  -- ── Matriz CE-A100-S02 (paro de compresión de gas de entrada) ──
  SELECT id INTO sys FROM public.systems WHERE project_id = pid AND code = 'A100-S02';
  INSERT INTO public.ce_matrices (org_id, project_id, system_id, code, title, revision, source_document, source)
  SELECT p.org_id, pid, sys, 'CE-A100-S02', 'Paro de compresión de gas de entrada', 'A', 'CE-A100-S02-001', 'manual' FROM public.projects p WHERE p.id = pid
  ON CONFLICT (project_id, code) DO NOTHING;
  SELECT id INTO m FROM public.ce_matrices WHERE project_id = pid AND code = 'CE-A100-S02';
  INSERT INTO public.ce_causes (matrix_id, project_id, seq, code, description, tag_id, condition, setpoint, voting)
  SELECT m, pid, c.seq, c.code, c.descr, (SELECT id FROM public.tags WHERE project_id = pid AND tag_number = c.tag), c.cond, c.sp, c.vote
  FROM (VALUES
    (10,'C-01','Muy alta presión de succión','PT-101','HH','9,5 barg','1oo1'),
    (20,'C-02','Muy baja presión de succión','PT-101','LL','0,5 barg','1oo1'),
    (30,'C-03','Muy alto nivel en depurador de succión','LT-101','HH','85 %','1oo1'),
    (40,'C-04','Bajo flujo de descarga (protección antisurge)','FT-106','LL','8 MMSCFD','1oo1'),
    (50,'C-05','Paro de emergencia manual (botón ESD en sala de control)',NULL,'manual',NULL,NULL),
    (60,'C-06','Baja presión de aire de instrumentos',NULL,'L','4 barg','other')
  ) AS c(seq, code, descr, tag, cond, sp, vote)
  ON CONFLICT (matrix_id, code) DO UPDATE SET description = EXCLUDED.description, tag_id = EXCLUDED.tag_id, condition = EXCLUDED.condition, setpoint = EXCLUDED.setpoint, voting = EXCLUDED.voting, seq = EXCLUDED.seq;
  INSERT INTO public.ce_effects (matrix_id, project_id, seq, code, description, tag_id, action)
  SELECT m, pid, e.seq, e.code, e.descr, (SELECT id FROM public.tags WHERE project_id = pid AND tag_number = e.tag), e.act
  FROM (VALUES
    (10,'E-01','Cierre de válvula de entrada','ESDV-7621003','close'),
    (20,'E-02','Paro del compresor C-103','C-103','stop'),
    (30,'E-03','Cierre de válvula de descarga','XV-102','close'),
    (40,'E-04','Apertura de venteo (blowdown)','XV-104','open'),
    (50,'E-05','Alarma en sala de control',NULL,'alarm')
  ) AS e(seq, code, descr, tag, act)
  ON CONFLICT (matrix_id, code) DO UPDATE SET description = EXCLUDED.description, tag_id = EXCLUDED.tag_id, action = EXCLUDED.action, seq = EXCLUDED.seq;
  INSERT INTO public.ce_links (cause_id, effect_id, project_id, link_type, delay_s)
  SELECT c.id, e.id, pid, CASE WHEN l.d IS NULL THEN 'direct' ELSE 'delayed' END, l.d
  FROM (VALUES ('C-01','E-01',5),('C-01','E-02',NULL),('C-01','E-03',NULL),('C-01','E-05',NULL),
               ('C-02','E-02',NULL),('C-02','E-05',NULL),
               ('C-03','E-01',NULL),('C-03','E-02',NULL),('C-03','E-05',NULL),
               ('C-04','E-02',NULL),('C-04','E-05',NULL),
               ('C-05','E-01',NULL),('C-05','E-02',NULL),('C-05','E-03',NULL),('C-05','E-04',NULL),('C-05','E-05',NULL),
               ('C-06','E-01',NULL),('C-06','E-02',NULL),('C-06','E-05',NULL)) AS l(c, e, d)
  JOIN public.ce_causes c ON c.matrix_id = m AND c.code = l.c
  JOIN public.ce_effects e ON e.matrix_id = m AND e.code = l.e
  ON CONFLICT (cause_id, effect_id) DO NOTHING;

  -- ── Matriz CE-A200-S01 (paro del separador trifásico) ──
  SELECT id INTO sys FROM public.systems WHERE project_id = pid AND code = 'A200-S01';
  INSERT INTO public.ce_matrices (org_id, project_id, system_id, code, title, revision, source_document, source)
  SELECT p.org_id, pid, sys, 'CE-A200-S01', 'Paro del separador trifásico', 'B', 'CE-A200-S01-001', 'manual' FROM public.projects p WHERE p.id = pid
  ON CONFLICT (project_id, code) DO NOTHING;
  SELECT id INTO m FROM public.ce_matrices WHERE project_id = pid AND code = 'CE-A200-S01';
  INSERT INTO public.ce_causes (matrix_id, project_id, seq, code, description, tag_id, condition, setpoint, voting)
  SELECT m, pid, c.seq, c.code, c.descr, (SELECT id FROM public.tags WHERE project_id = pid AND tag_number = c.tag), c.cond, c.sp, c.vote
  FROM (VALUES
    (10,'C-01','Muy alto nivel en el separador','LT-109','HH','85 %','1oo1'),
    (20,'C-02','Muy bajo nivel en el separador','LT-109','LL','15 %','1oo1'),
    (30,'C-03','Muy alta temperatura en el separador','TT-106','HH','95 °C','1oo1'),
    (40,'C-04','Gas confirmado en el área del separador','GD-101','HH','20 % LIE','1oo2'),
    (50,'C-05','Paro de emergencia manual',NULL,'manual',NULL,NULL)
  ) AS c(seq, code, descr, tag, cond, sp, vote)
  ON CONFLICT (matrix_id, code) DO UPDATE SET description = EXCLUDED.description, tag_id = EXCLUDED.tag_id, condition = EXCLUDED.condition, setpoint = EXCLUDED.setpoint, voting = EXCLUDED.voting, seq = EXCLUDED.seq;
  INSERT INTO public.ce_effects (matrix_id, project_id, seq, code, description, tag_id, action)
  SELECT m, pid, e.seq, e.code, e.descr, (SELECT id FROM public.tags WHERE project_id = pid AND tag_number = e.tag), e.act
  FROM (VALUES
    (10,'E-01','Cierre de válvula de entrada al separador','XV-116','close'),
    (20,'E-02','Cierre de válvula de salida de aceite','XV-117','close'),
    (30,'E-03','Paro de bomba de aceite','P-104B','stop'),
    (40,'E-04','Alarma en sala de control',NULL,'alarm')
  ) AS e(seq, code, descr, tag, act)
  ON CONFLICT (matrix_id, code) DO UPDATE SET description = EXCLUDED.description, tag_id = EXCLUDED.tag_id, action = EXCLUDED.action, seq = EXCLUDED.seq;
  INSERT INTO public.ce_links (cause_id, effect_id, project_id, link_type, delay_s)
  SELECT c.id, e.id, pid, CASE WHEN l.d IS NULL THEN 'direct' ELSE 'delayed' END, l.d
  FROM (VALUES ('C-01','E-01',NULL),('C-01','E-04',NULL),
               ('C-02','E-02',NULL),('C-02','E-03',NULL),('C-02','E-04',NULL),
               ('C-03','E-01',NULL),('C-03','E-04',NULL),
               ('C-04','E-01',NULL),('C-04','E-02',NULL),('C-04','E-03',10),('C-04','E-04',NULL),
               ('C-05','E-01',NULL),('C-05','E-02',NULL),('C-05','E-03',NULL),('C-05','E-04',NULL)) AS l(c, e, d)
  JOIN public.ce_causes c ON c.matrix_id = m AND c.code = l.c
  JOIN public.ce_effects e ON e.matrix_id = m AND e.code = l.e
  ON CONFLICT (cause_id, effect_id) DO NOTHING;
END $$;
