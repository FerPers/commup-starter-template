-- Fase 8, sesión 3 (decisiones de Luis, 2026-10-19; doc §11.13 y §15): los dos KPIs de gestión que faltaban,
-- sumados al snapshot diario `take_mgmt_snapshot` (mgmt_kpi_snapshots.kpis):
--   documents — completitud documental: documentos ligados a sistemas cuya revisión vigente es As-Built o Final
--               sobre los ligados; además documentos sin revisión emitida y referencias superadas en registros ya
--               firmados (ITR con firma) o aprobados (revisión vigente de un procedimiento).
--   vendors   — readiness de vendors: paquetes activos (movilizados o desmovilizados) sin bloqueos = sin FAT/SAT
--               pendiente o fallida, sin hallazgos abiertos (punch abierto o acción sin verificar) y sin
--               recomendaciones por decidir; además el conteo por estado y los hallazgos abiertos.
-- Se insertan al final del jsonb de KPIs reemplazando el ancla única que dejó la migración 20261020120000.

DO $patch$
DECLARE
  v_def text;
  v_anchor text := E'           WHERE t.project_id = p_project_id AND a.evaluated > 0)\n  ) INTO v_kpis;';
  v_new text := $ins$           WHERE t.project_id = p_project_id AND a.evaluated > 0),
    -- Completitud documental (F8, decisión 2026-10-19): As-Built/Final sobre los documentos ligados a sistemas.
    'documents', (SELECT jsonb_build_object(
             'total', COUNT(*),
             'linked', COUNT(*) FILTER (WHERE dx.linked),
             'as_built', COUNT(*) FILTER (WHERE dx.linked AND cur.status IN ('as_built', 'final')),
             'no_revision', COUNT(*) FILTER (WHERE d.current_revision_id IS NULL),
             'outdated_refs', (SELECT COUNT(*) FROM document_references dr JOIN documents d2 ON d2.id = dr.document_id
                               WHERE dr.project_id = p_project_id AND dr.revision_id <> d2.current_revision_id
                                 AND ((dr.itr_id IS NOT NULL AND EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = dr.itr_id))
                                   OR (dr.procedure_revision_id IS NOT NULL AND EXISTS (SELECT 1 FROM procedures pr2 WHERE pr2.current_revision_id = dr.procedure_revision_id)))))
           FROM documents d
           LEFT JOIN document_revisions cur ON cur.id = d.current_revision_id
           CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM document_systems ds WHERE ds.document_id = d.id) AS linked) dx
           WHERE d.project_id = p_project_id),
    -- Readiness de vendors (F8, decisión 2026-10-19): paquetes activos sin bloqueos.
    'vendors', (SELECT jsonb_build_object(
             'planned', COUNT(*) FILTER (WHERE vp.status = 'planned'),
             'mobilized', COUNT(*) FILTER (WHERE vp.status = 'mobilized'),
             'demobilized', COUNT(*) FILTER (WHERE vp.status = 'demobilized'),
             'active', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized')),
             'clear', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized') AND NOT vb.bad_tests AND vb.open_findings = 0 AND NOT vb.to_decide),
             'open_findings', COALESCE(SUM(vb.open_findings), 0))
           FROM vendor_packages vp
           CROSS JOIN LATERAL (SELECT
             EXISTS (SELECT 1 FROM vendor_activities va WHERE va.package_id = vp.id AND va.result IN ('pending', 'failed')) AS bad_tests,
             (SELECT COUNT(*) FROM vendor_findings vf
                LEFT JOIN punches pu ON pu.id = vf.punch_id
                LEFT JOIN actions ac ON ac.id = vf.action_id
               WHERE vf.package_id = vp.id
                 AND (pu.status::text IN ('open', 'in_progress') OR ac.status IN ('open', 'in_progress', 'done'))) AS open_findings,
             EXISTS (SELECT 1 FROM vendor_recommendations vr WHERE vr.package_id = vp.id AND vr.status = 'proposed') AS to_decide) vb
           WHERE vp.project_id = p_project_id AND vp.status <> 'cancelled')
  ) INTO v_kpis;$ins$;
BEGIN
  v_def := pg_get_functiondef('public.take_mgmt_snapshot(uuid, date)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'take_mgmt_snapshot: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor, v_new);
END;
$patch$;

-- Empresa del personal de operaciones y de los equipos de prueba (§15.1): el texto libre se mantiene (la UI sugiere
-- las empresas del catálogo) y se enlaza solo con la empresa de la org cuyo nombre o nombre corto coincide.
CREATE OR REPLACE FUNCTION public.company_link_from_text()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_text text; v_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'test_equipment' THEN v_text := NEW.owner_company; ELSE v_text := NEW.company; END IF;
  IF NULLIF(btrim(v_text), '') IS NOT NULL THEN
    SELECT c.id INTO v_id FROM companies c
     WHERE c.org_id = NEW.org_id AND (lower(btrim(c.name)) = lower(btrim(v_text)) OR lower(btrim(c.short_name)) = lower(btrim(v_text)))
     ORDER BY (lower(btrim(c.name)) = lower(btrim(v_text))) DESC LIMIT 1;
  END IF;
  IF TG_TABLE_NAME = 'test_equipment' THEN NEW.owner_company_id := v_id; ELSE NEW.company_id := v_id; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.company_link_from_text() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ops_personnel_company_link BEFORE INSERT OR UPDATE OF company ON public.ops_personnel
  FOR EACH ROW EXECUTE FUNCTION public.company_link_from_text();
CREATE TRIGGER test_equipment_company_link BEFORE INSERT OR UPDATE OF owner_company ON public.test_equipment
  FOR EACH ROW EXECUTE FUNCTION public.company_link_from_text();
