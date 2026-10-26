-- 2026-10-26 (decisión de Luis): la org DEMO arranca de cero con las revisiones v2/v3 de las plantillas ITR
-- activas. Corre DESPUÉS de scripts/ops/purge-demo-projects.sql (sin ITR que congelen plantillas).
-- Solo toca la org DEMO (e12c53b2-…); en cualquier otra BD no hace nada.
--   1. Borra las plantillas de prueba: QA-*, TEMV*-TPL, LCT-FT y P06A(1).
--   2. Corrige la última revisión de cada código (menos M06B, cuya v2 convirtió la lista en una tabla de
--      texto libre y queda en v1):
--      a. en una tabla con una sola columna de resultado manual (sin as found ni automático), esa columna
--         decide la aceptación y es obligatoria (hallazgo H3 del diagnóstico, A36);
--      b. etiquetas de columnas y filas en inglés → español (mapa exacto);
--      c. E29A: unidad µA en las tres fases;
--      d. secciones vacías fuera.
--   3. Activa la última revisión de cada código (M06B: v1; M13B: su única revisión) con la misma regla de
--      activate_itr_template_revision: desactiva las demás y la matriz sigue a la activa.
--   4. Acepta en bloque las filas propuestas de la matriz tipo de equipo × ITR.
DO $$
DECLARE
  v_org constant uuid := 'e12c53b2-85fd-462f-86f3-bba318aa77ee';
  v_actor constant uuid := 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366'; -- owner de DEMO (Luis)
  v_map constant jsonb := '{
    "# Bolts": "N.º de pernos",
    "*  Equipment Type": "Tipo de equipo",
    "Bolt diam": "Diámetro del perno",
    "Capacity": "Capacidad",
    "Check Sheet Description": "Descripción de la hoja de chequeo",
    "Check Sheet No.": "N.º de hoja de chequeo",
    "Circuit Description": "Descripción del circuito",
    "Circuit number": "N.º de circuito",
    "Confirm Lux levels according to design": "Niveles de iluminación (lux) según diseño",
    "Continuity": "Continuidad",
    "Cubicle": "Celda",
    "Cubicle No.": "N.º de celda",
    "DESCRIPTION": "Descripción",
    "Description": "Descripción",
    "Date": "Fecha",
    "Foreman": "Capataz",
    "Ground": "Tierra",
    "Highest Rated Power": "Potencia nominal máxima",
    "ISO#": "N.º de isométrico",
    "Inspection Description": "Descripción de la inspección",
    "Inspection Results": "Resultado de la inspección",
    "Item No.:": "N.º de ítem",
    "Insulation Resistance to Earth": "Resistencia de aislamiento a tierra",
    "Joint Tag": "Tag de la junta",
    "Last calibration date": "Fecha de última calibración",
    "Level": "Nivel",
    "Load Description": "Descripción de la carga",
    "Location": "Ubicación",
    "Manufacture": "Fabricante",
    "Manufacturer": "Fabricante",
    "Model": "Modelo",
    "Model No": "N.º de modelo",
    "Neutral": "Neutro",
    "On Phase A": "Fase A",
    "On Phase B": "Fase B",
    "On Phase C": "Fase C",
    "Phase A": "Fase A",
    "Phase B": "Fase B",
    "Phase C": "Fase C",
    "Operation": "Operación",
    "PDIT Tag No.": "Tag del PDIT",
    "Polarity": "Polaridad",
    "Protection": "Protección",
    "Protocol Test No.": "N.º de protocolo de prueba",
    "Range": "Rango",
    "Rating": "Clase (rating)",
    "Ratio": "Relación",
    "Relay Type": "Tipo de relé",
    "Serial": "N.º de serie",
    "Serial No.": "N.º de serie",
    "Size": "Tamaño",
    "Start Test Ground": "Prueba inicial de tierra",
    "TAG PANEL": "Tag del tablero",
    "Tag Description": "Descripción del tag",
    "Tag No.": "N.º de tag",
    "Test Insulation Resistance": "Prueba de resistencia de aislamiento",
    "Test insulation resistance": "Prueba de resistencia de aislamiento",
    "Torque Value": "Valor de torque",
    "Type": "Tipo",
    "UBICACION": "Ubicación",
    "VOLTAGE": "Tensión",
    "Voltage Level": "Nivel de tensión",
    "Vendor Drwg No''s": "N.º de planos del proveedor",
    "Verify Full Load Amps": "Verificar corriente a plena carga",
    "Verify Tag number label is correct": "Verificar la etiqueta del tag",
    "Verify Voltage level": "Verificar nivel de tensión",
    "Verify Voltage level at end of circuit": "Verificar tensión al final del circuito",
    "Verify correspondence between breaker and circuit associated lights.": "Verificar correspondencia breaker – luminarias del circuito",
    "Verify correspondence between breaker and circuit associated outlets": "Verificar correspondencia breaker – tomas del circuito",
    "Verify fuse/MCB according to design": "Verificar fusible / MCB según diseño",
    "Verify lights and fixtures are complete": "Verificar luminarias y accesorios completos",
    "Visual inspection for external damage": "Inspección visual de daños externos",
    "Voltage Transformer PRI": "Transformador de tensión – primario",
    "PRI": "Primario",
    "SEC": "Secundario",
    "EARTH": "TIERRA",
    "NEUTRAL": "NEUTRO",
    "PHASE A": "FASE A",
    "PHASE B": "FASE B",
    "PHASE C": "FASE C",
    "High Power Loudspeaker": "Altavoz de alta potencia",
    "Low Power Loudspeaker": "Altavoz de baja potencia",
    "Speaker Junction Box": "Caja de conexiones de altavoces",
    "Joint No": "N.º de junta",
    "Reading": "Lectura"
    }'::jsonb;
  r record;
  v_cols jsonb;
  v_rows jsonb;
  v_deactivated uuid[];
  v_n_decides integer := 0;
  v_n_activated integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM itrs i JOIN itr_templates t ON t.id = i.template_id WHERE t.org_id = v_org) THEN
    RAISE EXCEPTION 'La org DEMO todavía tiene ITR: correr primero scripts/ops/purge-demo-projects.sql';
  END IF;

  -- 1. Plantillas de prueba.
  DELETE FROM itr_templates WHERE org_id = v_org
    AND (code LIKE 'QA-%' OR code ~ '^TEMV.*-TPL$' OR code IN ('LCT-FT', 'P06A(1)'));

  CREATE TEMP TABLE v2_target ON COMMIT DROP AS
    SELECT DISTINCT ON (upper(code)) id, code, version FROM itr_templates
    WHERE org_id = v_org ORDER BY upper(code), version DESC;
  -- M06B se queda en v1.
  UPDATE v2_target t SET id = x.id, version = x.version
    FROM itr_templates x WHERE upper(t.code) = 'M06B' AND x.org_id = v_org AND upper(x.code) = 'M06B' AND x.version = 1;

  -- 2a/2b/2c. Tablas de la revisión que queda activa.
  FOR r IN SELECT i.id, i.options, upper(t.code) AS code FROM itr_template_items i JOIN v2_target t ON t.id = i.template_id
           WHERE i.item_type = 'table' AND upper(t.code) <> 'M06B' LOOP
    SELECT jsonb_agg(
             CASE WHEN c->>'type' = 'result' AND (c->'pass' IS NULL OR c->'pass' = 'null'::jsonb)
                       AND (c->'auto_from' IS NULL OR c->'auto_from' = 'null'::jsonb)
                       AND (SELECT count(*) FROM jsonb_array_elements(r.options->'columns') x WHERE x->>'type' = 'result') = 1
                  THEN c || jsonb_build_object('decides', true, 'required', true) ELSE c END
             || jsonb_build_object('label', coalesce(v_map->>(c->>'label'), c->>'label'))
             || CASE WHEN r.code = 'E29A' AND c->>'key' LIKE 'leakage_current_ua%' THEN jsonb_build_object('unit', 'µA') ELSE '{}'::jsonb END
             ORDER BY ord)
      INTO v_cols FROM jsonb_array_elements(r.options->'columns') WITH ORDINALITY AS e(c, ord);
    v_rows := r.options->'rows';
    IF v_rows->>'mode' = 'fixed' THEN
      v_rows := v_rows || jsonb_build_object('labels',
        (SELECT jsonb_agg(coalesce(v_map->>l, l) ORDER BY ord) FROM jsonb_array_elements_text(v_rows->'labels') WITH ORDINALITY AS e(l, ord)));
    ELSIF v_rows ? 'label' THEN
      v_rows := v_rows || jsonb_build_object('label', coalesce(v_map->>(v_rows->>'label'), v_rows->>'label'));
    END IF;
    IF v_cols IS DISTINCT FROM r.options->'columns' OR v_rows IS DISTINCT FROM r.options->'rows' THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) c WHERE c->>'decides' = 'true')
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.options->'columns') c WHERE c->>'decides' = 'true') THEN
        v_n_decides := v_n_decides + 1;
      END IF;
      UPDATE itr_template_items SET options = r.options || jsonb_build_object('columns', v_cols, 'rows', v_rows) WHERE id = r.id;
      IF NOT public.itr_table_config_valid((SELECT options FROM itr_template_items WHERE id = r.id)) THEN
        RAISE EXCEPTION 'Tabla inválida tras corregir: % (%)', r.code, r.id;
      END IF;
    END IF;
  END LOOP;

  -- 2d. Secciones vacías.
  DELETE FROM itr_template_sections s USING v2_target t
    WHERE s.template_id = t.id AND NOT EXISTS (SELECT 1 FROM itr_template_items i WHERE i.section_id = s.id);

  -- 3. Activar (misma regla que activate_itr_template_revision).
  FOR r IN SELECT t.* FROM v2_target t JOIN itr_templates x ON x.id = t.id
           WHERE NOT x.is_active OR EXISTS (SELECT 1 FROM itr_templates o WHERE o.org_id = v_org AND upper(o.code) = upper(t.code) AND o.id <> t.id AND o.is_active) LOOP
    SELECT coalesce(array_agg(id), '{}') INTO v_deactivated FROM itr_templates
      WHERE org_id = v_org AND upper(code) = upper(r.code) AND id <> r.id;
    UPDATE itr_templates SET is_active = false WHERE id = ANY(v_deactivated) AND is_active;
    UPDATE itr_templates SET is_active = true WHERE id = r.id AND NOT is_active;
    UPDATE equipment_type_templates m SET itr_template_id = r.id
      WHERE m.itr_template_id = ANY(v_deactivated)
        AND NOT EXISTS (SELECT 1 FROM equipment_type_templates x WHERE x.org_id = m.org_id AND x.equipment_type_id = m.equipment_type_id AND x.itr_template_id = r.id);
    DELETE FROM equipment_type_templates WHERE itr_template_id = ANY(v_deactivated);
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
      VALUES (v_org, v_actor, 'itr_template', r.id, 'revision_activated',
              jsonb_build_object('code', r.code, 'version', r.version, 'deactivated', to_jsonb(v_deactivated), 'source', 'migration 20270105120000'));
    v_n_activated := v_n_activated + 1;
  END LOOP;

  -- 4. Matriz aceptada en bloque.
  UPDATE equipment_type_templates SET status = 'accepted', reviewed_by = v_actor, reviewed_at = now()
    WHERE org_id = v_org AND status = 'proposed';

  RAISE NOTICE 'ITR v2 DEMO: % activadas, % tablas con resultado que decide', v_n_activated, v_n_decides;
END $$;
