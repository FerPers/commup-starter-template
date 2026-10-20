-- S07 — Importaciones sin pérdida de datos (C-28, F-36; el resto de S07 vive en la app). 2026-10-19.
--
-- C-28: `bootstrap_org` crea perfil, organización, membresía owner, proyecto, fases (y sus gates por trigger),
--       disciplinas, tipos de equipo y la plantilla PSSR en UNA transacción. Solo service role.
-- F-36: `create_ce_matrix_from_review` crea la matriz C&E revisada con causas, efectos y cruces en una
--       transacción. SECURITY INVOKER (rige la RLS del editor).
--
-- Funciones en su archivo canónico (supabase/functions-sql/) y emitidas completas.

-- bootstrap_org  (supabase/functions-sql/bootstrap_org.sql)
CREATE OR REPLACE FUNCTION public.bootstrap_org(p_user_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_slug text := p_input #>> '{org,slug}';
  v_org uuid; v_project uuid; v_template uuid;
BEGIN
  -- S07 (C-28): el asistente de configuración en UNA transacción. Antes, un fallo a mitad dejaba una org
  -- sin proyecto o sin fases y el usuario ya era miembro (el layout no lo devolvía a /setup).
  -- Solo service role (completeSetup ya validó la sesión y la entrada con zod).
  IF NOT COALESCE(auth.role() = 'service_role', false) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM org_members WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Ya perteneces a una organización: crea el proyecto desde ella' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO profiles (id, full_name) VALUES (p_user_id, p_input->>'userFullName')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  IF EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;
  INSERT INTO organizations (name, slug, plan, settings) VALUES (p_input #>> '{org,name}', v_slug, 'starter', '{}')
  RETURNING id INTO v_org;
  INSERT INTO org_members (org_id, user_id, role) VALUES (v_org, p_user_id, 'owner');

  INSERT INTO projects (org_id, name, code, location, client, country, region, start_date, end_date, status)
  SELECT v_org, p->>'name', upper(p->>'code'), NULLIF(p->>'location', ''), NULLIF(p->>'client', ''),
         NULLIF(p->>'country', ''), NULLIF(p->>'region', ''), NULLIF(p->>'start_date', '')::date, NULLIF(p->>'end_date', '')::date, 'active'
  FROM (SELECT p_input->'project' AS p) s
  RETURNING id INTO v_project;

  INSERT INTO project_phases (org_id, code, name, order_index, color, certificate_name)
  SELECT v_org, x->>'code', x->>'name', (x->>'order_index')::int, x->>'color', NULLIF(x->>'certificate_name', '')
  FROM jsonb_array_elements(p_input->'phases') x;

  INSERT INTO disciplines (org_id, code, name, color)
  SELECT v_org, x->>'code', x->>'name', x->>'color' FROM jsonb_array_elements(p_input->'disciplines') x;

  INSERT INTO equipment_types (org_id, code, name, category)
  SELECT v_org, x->>'code', x->>'name', x->>'category' FROM jsonb_array_elements(COALESCE(p_input->'equipmentTypes', '[]')) x;

  IF jsonb_array_length(COALESCE(p_input->'pssrItems', '[]')) > 0 THEN
    INSERT INTO pssr_templates (org_id, name, description, created_by, is_active)
    VALUES (v_org, 'PSSR Estándar O&G', 'Plantilla de Pre-Startup Safety Review con 22 ítems estándar de la industria', p_user_id, true)
    RETURNING id INTO v_template;
    INSERT INTO pssr_template_items (template_id, item_order, category, element, requirement, notes_hint)
    SELECT v_template, o::int, x->>'category', x->>'element', x->>'requirement', x->>'notes_hint'
    FROM jsonb_array_elements(p_input->'pssrItems') WITH ORDINALITY AS t(x, o);
  END IF;

  RETURN jsonb_build_object('org_id', v_org, 'project_id', v_project);
END;
$function$;


-- create_ce_matrix_from_review  (supabase/functions-sql/create_ce_matrix_from_review.sql)
CREATE OR REPLACE FUNCTION public.create_ce_matrix_from_review(p_matrix jsonb, p_causes jsonb, p_effects jsonb, p_links jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_matrix uuid; v_project uuid := (p_matrix->>'project_id')::uuid;
BEGIN
  -- S07 (F-36): la matriz revisada se crea entera o nada (antes: cuatro inserciones y un borrado
  -- compensatorio que, si fallaba, dejaba una matriz parcial). SECURITY INVOKER: rige la RLS del editor.
  INSERT INTO ce_matrices (project_id, org_id, system_id, code, title, source, revision, source_document, notes)
  VALUES (v_project, (p_matrix->>'org_id')::uuid, NULLIF(p_matrix->>'system_id', '')::uuid, p_matrix->>'code', p_matrix->>'title', 'ai',
          NULLIF(p_matrix->>'revision', ''), NULLIF(p_matrix->>'source_document', ''), p_matrix->>'notes')
  RETURNING id INTO v_matrix;

  INSERT INTO ce_causes (matrix_id, project_id, seq, code, description, tag_id, condition, setpoint, voting, notes)
  SELECT v_matrix, v_project, (x->>'seq')::int, x->>'code', x->>'description', NULLIF(x->>'tag_id', '')::uuid,
         NULLIF(x->>'condition', ''), NULLIF(x->>'setpoint', ''), x->>'voting', NULLIF(x->>'notes', '')
  FROM jsonb_array_elements(p_causes) x;

  INSERT INTO ce_effects (matrix_id, project_id, seq, code, description, tag_id, action, notes)
  SELECT v_matrix, v_project, (x->>'seq')::int, x->>'code', x->>'description', NULLIF(x->>'tag_id', '')::uuid,
         x->>'action', NULLIF(x->>'notes', '')
  FROM jsonb_array_elements(p_effects) x;

  INSERT INTO ce_links (cause_id, effect_id, project_id, link_type, delay_s, note)
  SELECT c.id, e.id, v_project, x->>'link_type', NULLIF(x->>'delay_s', '')::numeric, NULLIF(x->>'note', '')
  FROM jsonb_array_elements(p_links) x
  JOIN ce_causes c ON c.matrix_id = v_matrix AND c.code = x->>'cause_code'
  JOIN ce_effects e ON e.matrix_id = v_matrix AND e.code = x->>'effect_code';

  RETURN v_matrix;
END;
$function$;


REVOKE ALL ON FUNCTION public.bootstrap_org(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_org(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.create_ce_matrix_from_review(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ce_matrix_from_review(jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;
