-- A19 · E6 (plan docs/PLAN-A08-A25-A47-A19-2026-10-25.md, menú C aprobado por Luis el 2026-10-25): la lista de punch se
-- filtra por fase (atajo «Punch de <fase>» del menú y selector de la lista). El punch toma la fase del ITR que lo
-- originó; uno sin ITR sale en «Sin fase». punch_list_v suma itr_phase_id al final (no cambia ninguna columna).

CREATE OR REPLACE VIEW public.punch_list_v WITH (security_invoker = true) AS
 SELECT pu.id,
    pu.project_id,
    p.org_id,
    p.name AS project_name,
    p.code AS project_code,
    pu.punch_number,
    pu.category,
    pu.description,
    pu.status,
    pu.priority,
    pu.target_date,
    pu.closed_date,
    pu.created_at,
    pu.itr_id,
    pu.assigned_to,
    pu.raised_by,
    rb.full_name AS raised_by_name,
    ab.full_name AS assigned_to_name,
    pu.discipline_id,
    d.code AS discipline_code,
    d.name AS discipline_name,
    d.color AS discipline_color,
    pu.tag_id,
    tg.tag_number,
    tg.description AS tag_description,
    pu.subsystem_id,
    ss.code AS subsystem_code,
    ss.name AS subsystem_name,
    ss.system_id,
    s.code AS system_code,
    s.name AS system_name,
    (((((((((pu.punch_number || ' '::text) || COALESCE(pu.description, ''::text)) || ' '::text) || COALESCE(tg.tag_number, ''::text)) || ' '::text) || COALESCE(ss.code, ''::text)) || ' '::text) || COALESCE(ab.full_name, ''::text)) || ' '::text) || COALESCE(p.name, ''::text) AS search_text,
    pu.resolved_at,
    pu.resolved_by,
    rs.full_name AS resolved_by_name,
    pu.verified_by,
    pu.impact,
    pu.startup_disposition,
    pu.category_reviewed_at,
    it.phase_id AS itr_phase_id
   FROM punches pu
     JOIN projects p ON p.id = pu.project_id
     LEFT JOIN profiles rb ON rb.id = pu.raised_by
     LEFT JOIN profiles ab ON ab.id = pu.assigned_to
     LEFT JOIN profiles rs ON rs.id = pu.resolved_by
     LEFT JOIN disciplines d ON d.id = pu.discipline_id
     LEFT JOIN tags tg ON tg.id = pu.tag_id
     LEFT JOIN subsystems ss ON ss.id = pu.subsystem_id
     LEFT JOIN systems s ON s.id = ss.system_id
     LEFT JOIN itrs it ON it.id = pu.itr_id;
