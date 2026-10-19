-- Seed DEMO (fase 8, sesión 3): registro de documentos y paquetes de vendor para mostrar los KPIs de completitud
-- documental y readiness de vendors. Todo pasa por las RPC de la app actuando como luis.perdomo@outlook.com (owner).
--
-- Re-ejecutable: cada documento o paquete que ya existe (por número o título) se salta.
--   Documentos: 6 entre P&ID, hojas de datos, plano y manual en A100-S02 / A200-S01 / U100-S01, con revisiones
--               IFR → IFC → As-Built (3 quedan As-Built o Final, 1 sin revisión emitida).
--   Vendors:    empresa «Compresores del Caribe S.A.» (vendor) y paquete planificado «Compresor C-103 (OEM)» que
--               moviliza con el gate MC de A100-S02, con dos interfaces (una abierta) y una FAT planificada.
--
-- Uso:  supabase db query --linked -f scripts/demo-data/seed_documents_vendors_demo.sql

DO $seed$
DECLARE
  v_org     uuid := 'e12c53b2-85fd-462f-86f3-bba318aa77ee';
  v_project uuid := 'abc47484-59d3-4f51-8966-7fb4f1174ba8';
  v_user    uuid := 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366';
  v_mc      uuid := '1ce9f3d3-934f-4861-b396-ef38be1b9e3a';
  v_doc     uuid;
  v_vendor  uuid;
  v_pkg     uuid;
  d         record;
  r         record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  FOR d IN SELECT * FROM (VALUES
      ('PID-A100-002', 'P&ID succión y scrubber del C-103', 'pid', 'A100-S02', ARRAY['A:ifr', '0:ifc', '1:as_built']),
      ('DS-PT-101',    'Hoja de datos PT-101',             'datasheet', 'A100-S02', ARRAY['A:ifc', 'B:final']),
      ('PID-A200-001', 'P&ID separador trifásico V-201',   'pid', 'A200-S01', ARRAY['A:ifr', '0:ifc']),
      ('DWG-A200-010', 'Plano de disposición del V-201',   'drawing', 'A200-S01', ARRAY['0:as_built']),
      ('MAN-U100-001', 'Manual del compresor de aire',     'manual', 'U100-S01', ARRAY['A:draft']),
      ('PID-U100-001', 'P&ID aire de instrumentos',        'pid', 'U100-S01', ARRAY['A:ifr'])
    ) AS x(number, title, doc_type, system_code, revs)
  LOOP
    IF EXISTS (SELECT 1 FROM documents WHERE project_id = v_project AND upper(number) = d.number) THEN CONTINUE; END IF;
    v_doc := save_document(v_project, NULL, d.number, d.title, d.doc_type, NULL, NULL,
                           ARRAY(SELECT id FROM systems WHERE project_id = v_project AND code = d.system_code));
    FOR r IN SELECT split_part(x, ':', 1) AS rev, split_part(x, ':', 2) AS status FROM unnest(d.revs) x LOOP
      PERFORM add_document_revision(v_doc, r.rev, r.status, NULL, NULL, NULL, 'https://edms.example.com/DEMO/' || d.number || '/' || r.rev, NULL);
    END LOOP;
  END LOOP;

  SELECT id INTO v_vendor FROM companies WHERE org_id = v_org AND lower(name) = lower('Compresores del Caribe S.A.');
  IF v_vendor IS NULL THEN
    v_vendor := save_company(v_org, NULL, 'Compresores del Caribe S.A.', 'CDC', 'vendor', NULL, 'OEM del compresor C-103', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vendor_packages WHERE project_id = v_project AND title = 'Compresor C-103 (OEM)') THEN
    v_pkg := save_vendor_package(v_project, NULL, v_vendor, 'Compresor C-103 (OEM)',
      'Supervisión de montaje, alineación, pruebas en sitio y arranque del compresor C-103.',
      'Desde la brida de succión hasta la brida de descarga; tablero local del compresor; excluye el MCC.',
      ARRAY(SELECT id FROM systems WHERE project_id = v_project AND code = 'A100-S02'),
      ARRAY(SELECT t.id FROM tags t WHERE t.project_id = v_project AND t.tag_number IN ('C-103', 'PT-101', 'FT-106')),
      (SELECT id FROM systems WHERE project_id = v_project AND code = 'A100-S02'), v_mc, current_date + 14);
    PERFORM save_vendor_interface(v_pkg, NULL, NULL, 'Electricidad (EPC)', 'Alimentación 4,16 kV del motor desde el MCC', 'Supervisor eléctrico EPC', 'agreed');
    PERFORM save_vendor_interface(v_pkg, NULL, NULL, 'Instrumentación (EPC)', 'Señales del tablero local al DCS (vibración y temperatura)', 'Ing. de control', 'open');
    PERFORM save_vendor_activity(v_pkg, NULL, 'fat', 'FAT en fábrica del compresor', current_date + 7, 'Planta del fabricante', 'Prueba mecánica de funcionamiento 4 h');
  END IF;

  RAISE NOTICE 'Documentos: %, paquetes: %',
    (SELECT count(*) FROM documents WHERE project_id = v_project), (SELECT count(*) FROM vendor_packages WHERE project_id = v_project);
END;
$seed$;

SELECT take_mgmt_snapshot('abc47484-59d3-4f51-8966-7fb4f1174ba8') IS NOT NULL AS snapshot;
