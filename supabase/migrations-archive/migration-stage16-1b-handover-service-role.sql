-- Stage 16.1b — Allow service_role to bypass auth.uid() check in generate_handover_package
--
-- Context: the function is invoked from server-side code (admin/handover action
-- and /api/v1/handover/export) using the service_role client. In that context
-- auth.uid() is NULL and the membership check fails with "Access denied".
-- Both callers already perform their own authorization (org membership for UI,
-- API key scope for REST), so it is safe to skip the membership check when the
-- call originates from service_role.

CREATE OR REPLACE FUNCTION generate_handover_package(
  p_project_id UUID,
  p_system_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id  UUID;
  v_project JSONB;
  v_systems JSONB;
  v_punches JSONB;
  v_certs   JSONB;
  v_result  JSONB;
BEGIN
  SELECT p.org_id INTO v_org_id FROM projects p WHERE p.id = p_project_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM org_members om
    WHERE om.org_id = v_org_id AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'id',       p.id,
    'name',     p.name,
    'code',     p.code,
    'client',   p.client,
    'location', p.location,
    'status',   p.status,
    'start_date', p.start_date,
    'end_date',   p.end_date
  ) INTO v_project
  FROM projects p
  WHERE p.id = p_project_id;

  WITH scoped_systems AS (
    SELECT s.*
    FROM systems s
    WHERE s.project_id = p_project_id
      AND (p_system_ids IS NULL OR array_length(p_system_ids, 1) IS NULL
           OR s.id = ANY(p_system_ids))
  ),
  sys_tags AS (
    SELECT ss.id AS system_id, t.*
    FROM scoped_systems ss
    JOIN subsystems sub ON sub.system_id = ss.id
    JOIN tags t         ON t.subsystem_id = sub.id
  ),
  sys_itrs AS (
    SELECT ss.id AS system_id, i.*, t.tag_number, t.description AS tag_description
    FROM scoped_systems ss
    JOIN subsystems sub ON sub.system_id = ss.id
    LEFT JOIN tags t    ON t.subsystem_id = sub.id
    JOIN itrs i         ON (i.tag_id = t.id OR (i.tag_id IS NULL AND i.subsystem_id = sub.id))
                        AND i.project_id = p_project_id
  ),
  sys_punches AS (
    SELECT ss.id AS system_id, p.*
    FROM scoped_systems ss
    JOIN subsystems sub ON sub.system_id = ss.id
    JOIN punches p      ON p.subsystem_id = sub.id
                        AND p.project_id  = p_project_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'system_id',   s.id,
      'code',        s.code,
      'name',        s.name,
      'description', s.description,
      'tag_count',      (SELECT COUNT(*) FROM sys_tags    st WHERE st.system_id = s.id),
      'itr_count',      (SELECT COUNT(*) FROM sys_itrs    si WHERE si.system_id = s.id),
      'itr_approved',   (SELECT COUNT(*) FROM sys_itrs    si WHERE si.system_id = s.id AND si.status = 'approved'),
      'punch_summary', jsonb_build_object(
        'cat_a_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'A' AND sp.status IN ('open','in_progress')),
        'cat_b_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'B' AND sp.status IN ('open','in_progress')),
        'cat_c_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'C' AND sp.status IN ('open','in_progress')),
        'total_open', (SELECT COUNT(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.status IN ('open','in_progress'))
      ),
      'itrs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'itr_id',         si.id,
          'itr_number',     si.itr_number,
          'status',         si.status,
          'progress_pct',   si.progress_pct,
          'scheduled_date', si.scheduled_date,
          'completed_date', si.completed_date,
          'tag_number',     si.tag_number,
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'role',      sig.role,
              'user_id',   sig.user_id,
              'signed_at', sig.signed_at,
              'signature_url', sig.signature_url
            ))
            FROM itr_signatures sig WHERE sig.itr_id = si.id
          ), '[]'::jsonb)
        ) ORDER BY si.itr_number)
        FROM sys_itrs si WHERE si.system_id = s.id
      ), '[]'::jsonb),
      'tags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'tag_id',      st.id,
          'tag_number',  st.tag_number,
          'description', st.description,
          'manufacturer', st.manufacturer,
          'model',       st.model,
          'serial_number', st.serial_number,
          'status',      st.status
        ) ORDER BY st.tag_number)
        FROM sys_tags st WHERE st.system_id = s.id
      ), '[]'::jsonb)
    )
    ORDER BY s.code
  )
  INTO v_systems
  FROM scoped_systems s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'punch_id',     pu.id,
    'punch_number', pu.punch_number,
    'category',     pu.category,
    'description',  pu.description,
    'status',       pu.status,
    'priority',     pu.priority,
    'raised_by',    pu.raised_by,
    'assigned_to',  pu.assigned_to,
    'target_date',  pu.target_date,
    'closed_date',  pu.closed_date,
    'subsystem_id', pu.subsystem_id,
    'tag_id',       pu.tag_id,
    'created_at',   pu.created_at
  ) ORDER BY pu.punch_number), '[]'::jsonb)
  INTO v_punches
  FROM punches pu
  JOIN subsystems sub ON sub.id = pu.subsystem_id
  WHERE pu.project_id = p_project_id
    AND pu.category = 'B'
    AND (p_system_ids IS NULL OR array_length(p_system_ids, 1) IS NULL
         OR sub.system_id = ANY(p_system_ids));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'certificate_id',     c.id,
    'certificate_number', c.certificate_number,
    'title',              c.title,
    'status',             c.status,
    'issued_date',        c.issued_date,
    'issued_by',          c.issued_by,
    'approved_by',        c.approved_by,
    'system_id',          c.system_id,
    'subsystem_id',       c.subsystem_id,
    'document_url',       c.document_url
  ) ORDER BY c.certificate_number), '[]'::jsonb)
  INTO v_certs
  FROM certificates c
  WHERE c.project_id = p_project_id
    AND (p_system_ids IS NULL OR array_length(p_system_ids, 1) IS NULL
         OR c.system_id = ANY(p_system_ids));

  v_result := jsonb_build_object(
    'handover_package', jsonb_build_object(
      'schema_version', '2.0',
      'generated_at',   to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'org_id',         v_org_id,
      'project',        v_project,
      'systems',        COALESCE(v_systems, '[]'::jsonb),
      'punch_items',    v_punches,
      'certificates',   v_certs
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_handover_package(UUID, UUID[]) TO authenticated, service_role;
