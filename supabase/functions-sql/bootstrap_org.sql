-- fn: public.bootstrap_org(uuid, jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
