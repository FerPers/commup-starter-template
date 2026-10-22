-- E2 (ajuste tras verificar en pantalla): la categoría pid_coverage de Calidad de datos solo cuenta planos cuya
-- revisión vigente tiene PDF. Sin PDF no hay visor ni pin posible; ese caso ya lo muestra el registro de
-- documentos. Misma vista que en 20261129120000 con esa condición.

CREATE OR REPLACE VIEW public.data_quality_issues WITH (security_invoker = on) AS
SELECT 'critical'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    'ITR aprobado sin firma de ejecutor'::text AS description,
    'Solicitar firma antes de validar aprobación'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.status = 'approved'::itr_status AND NOT (EXISTS ( SELECT 1
           FROM itr_signatures s
          WHERE s.itr_id = i.id AND s.role = 'executor'::signature_role))
UNION ALL
 SELECT 'warning'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    'ITR con progreso 100% pero status='::text || i.status AS description,
    'Revisar estado del ITR y avanzar a completed/approved'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.progress_pct >= 100::numeric AND (i.status <> ALL (ARRAY['approved'::itr_status, 'completed'::itr_status]))
UNION ALL
 SELECT 'error'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    ('ITR aprobado con progreso '::text || COALESCE(i.progress_pct, 0::numeric)) || '%'::text AS description,
    'Completar todos los items antes de aprobar, o revisar aprobación'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.status = 'approved'::itr_status AND COALESCE(i.progress_pct, 0::numeric) < 100::numeric
UNION ALL
 SELECT 'error'::text AS severity,
    'date_logic'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    p.org_id,
    ((('ITR con completed_date ('::text || i.completed_date) || ') anterior a created_at ('::text) || i.created_at::date) || ')'::text AS description,
    'Corregir fechas. Posible carga manual incorrecta.'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
  WHERE i.completed_date IS NOT NULL AND i.completed_date < i.created_at::date
UNION ALL
 SELECT 'critical'::text AS severity,
    'punch_orphans'::text AS category,
    'punch'::text AS entity_type,
    pu.id AS entity_id,
    pu.punch_number AS entity_label,
    pu.project_id,
    pr.org_id,
    ('Punch Cat A '::text || pu.punch_number) || ' sin ejecutor asignado'::text AS description,
    'Asignar ejecutor responsable. Bloquea Mechanical Completion.'::text AS suggested_fix,
    (('/projects/'::text || pu.project_id) || '/punch-list/'::text) || pu.id AS fix_url
   FROM punches pu
     JOIN projects pr ON pr.id = pu.project_id
  WHERE pu.category = 'A'::punch_category AND (pu.status <> ALL (ARRAY['closed'::punch_status, 'cancelled'::punch_status])) AND pu.assigned_to IS NULL
UNION ALL
 SELECT 'error'::text AS severity,
    'date_logic'::text AS category,
    'punch'::text AS entity_type,
    pu.id AS entity_id,
    pu.punch_number AS entity_label,
    pu.project_id,
    pr.org_id,
    ('Punch '::text || pu.punch_number) || ' con closed_date anterior a creación'::text AS description,
    'Corregir fechas del punch'::text AS suggested_fix,
    (('/projects/'::text || pu.project_id) || '/punch-list/'::text) || pu.id AS fix_url
   FROM punches pu
     JOIN projects pr ON pr.id = pu.project_id
  WHERE pu.closed_date IS NOT NULL AND pu.closed_date < pu.created_at::date
UNION ALL
 SELECT 'warning'::text AS severity,
    'loop_coverage'::text AS category,
    'loop'::text AS entity_type,
    l.id AS entity_id,
    l.loop_number AS entity_label,
    l.project_id,
    pr.org_id,
    ('Loop '::text || l.loop_number) || ' sin instrumentos asignados'::text AS description,
    'Vincular tags al loop desde el módulo de Loops'::text AS suggested_fix,
    (('/projects/'::text || l.project_id) || '/loops/'::text) || l.id AS fix_url
   FROM loops l
     JOIN projects pr ON pr.id = l.project_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM loop_tags lt
          WHERE lt.loop_id = l.id))
UNION ALL
 SELECT 'critical'::text AS severity,
    'certificate_prereqs'::text AS category,
    'certificate'::text AS entity_type,
    c.id AS entity_id,
    c.certificate_number AS entity_label,
    c.project_id,
    pr.org_id,
    ('Certificado '::text || c.certificate_number) || ' emitido con Cat A abiertos'::text AS description,
    'Revisar y cerrar punches Cat A, o registrar excepción formal'::text AS suggested_fix,
    (('/projects/'::text || c.project_id) || '/certificates/'::text) || c.id AS fix_url
   FROM certificates c
     JOIN projects pr ON pr.id = c.project_id
  WHERE c.status = 'issued'::certificate_status AND c.subsystem_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM punches pu
          WHERE pu.subsystem_id = c.subsystem_id AND pu.category = 'A'::punch_category AND (pu.status <> ALL (ARRAY['closed'::punch_status, 'cancelled'::punch_status])) AND NOT (EXISTS ( SELECT 1
                   FROM certificate_punch_exceptions cpe
                  WHERE cpe.certificate_id = c.id AND cpe.punch_id = pu.id))))
UNION ALL
 SELECT 'warning'::text AS severity,
    'system_completeness'::text AS category,
    'subsystem'::text AS entity_type,
    s.id AS entity_id,
    s.code AS entity_label,
    s.project_id,
    pr.org_id,
    ('Subsistema '::text || s.code) || ' tiene tags pero 0 ITRs'::text AS description,
    'Generar o asignar ITRs desde templates para cubrir los tags'::text AS suggested_fix,
    (('/projects/'::text || s.project_id) || '/explorer?subsystem='::text) || s.id AS fix_url
   FROM subsystems s
     JOIN projects pr ON pr.id = s.project_id
  WHERE (EXISTS ( SELECT 1
           FROM tags t
          WHERE t.subsystem_id = s.id)) AND NOT (EXISTS ( SELECT 1
           FROM itrs i
          WHERE i.subsystem_id = s.id))
UNION ALL
 SELECT 'warning'::text AS severity,
    'system_completeness'::text AS category,
    'signal'::text AS entity_type,
    sg.id AS entity_id,
    sg.signal_tag AS entity_label,
    t.project_id,
    pr.org_id,
    ('Señal '::text || sg.signal_tag) || ' sin loop asignado'::text AS description,
    'Vincular la señal a un loop o marcar como independiente'::text AS suggested_fix,
    (('/projects/'::text || t.project_id) || '/tags/'::text) || sg.tag_id AS fix_url
   FROM signals sg
     JOIN tags t ON t.id = sg.tag_id
     JOIN projects pr ON pr.id = t.project_id
  WHERE sg.loop_id IS NULL
UNION ALL
 SELECT 'warning'::text AS severity,
    'itr_integrity'::text AS category,
    'itr'::text AS entity_type,
    i.id AS entity_id,
    i.itr_number AS entity_label,
    i.project_id,
    pr.org_id,
    ((('ITR '::text || i.itr_number) || ' rechazado '::text) || cnt.n) || ' veces (posible problema sistemático)'::text AS description,
    'Revisar causa raíz: alcance, capacitación o procedimiento'::text AS suggested_fix,
    (('/projects/'::text || i.project_id) || '/itrs/'::text) || i.id AS fix_url
   FROM itrs i
     JOIN projects pr ON pr.id = i.project_id
     JOIN ( SELECT ((de.payload -> 'new'::text) ->> 'id'::text)::uuid AS itr_id,
            count(*) AS n
           FROM domain_events de
          WHERE de.aggregate_type = 'itrs'::text AND de.event_type = 'itrs.updated'::text AND ((de.payload -> 'new'::text) ->> 'status'::text) = 'rejected'::text
          GROUP BY (((de.payload -> 'new'::text) ->> 'id'::text)::uuid)
         HAVING count(*) >= 3) cnt ON cnt.itr_id = i.id
UNION ALL
 SELECT 'warning'::text AS severity,
    'pid_coverage'::text AS category,
    'tag'::text AS entity_type,
    t.id AS entity_id,
    t.tag_number AS entity_label,
    t.project_id,
    pr.org_id,
    ((('El tag cita el plano '::text || d.number) || ' (rev '::text) || r.rev) || ') pero no tiene pin en la revisión vigente'::text AS description,
    'Ubicar el tag en el plano con un pin'::text AS suggested_fix,
    (((('/projects/'::text || t.project_id) || '/documents/'::text) || d.id) || '/viewer?tag='::text) || t.id AS fix_url
   FROM tags t
     JOIN projects pr ON pr.id = t.project_id
     JOIN documents d ON d.project_id = t.project_id AND d.doc_type = 'pid'::text AND d.current_revision_id IS NOT NULL AND d.number = upper(btrim(regexp_replace(t.pid_drawing, '\s+'::text, ' '::text, 'g'::text)))
     JOIN document_revisions r ON r.id = d.current_revision_id
  WHERE t.pid_drawing IS NOT NULL AND r.file_path IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM pid_hotspots h
          WHERE h.revision_id = d.current_revision_id AND h.tag_id = t.id));
