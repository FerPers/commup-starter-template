-- Fase 3 del plan readiness — registros controlados de estado temporal (2026-10-15, decisiones de Luis):
--   Un motor: register_types (por org; catálogo FIJO en src/lib/registers/catalog.ts) + register_items.
--   Tipos: temporary (TMP), blind (CIE), reinstatement (REI), bypass (BYP), energization (ENE), test_pack (TPK).
--   Ciclo: proposed → authorized → active → removed → verified (+ cancelled). Autoriza alguien distinto de
--   quien propuso; verifica alguien distinto de quien retiró. Escritura SOLO por RPC SECURITY DEFINER.
--   Tags N:M (register_item_tags; un test pack agrupa líneas de varios subsistemas) y vínculos entre ítems
--   (register_item_links: pack ↔ ciegas). Línea de tiempo en register_events.
--   compute_system_gates: criterio implícito `registers_clear` en el gate que bloquea cada tipo.
--   Los campos por tipo se validan en la app (catálogo); la BD solo exige jsonb objeto y la regla dura
--   «un test pack rechazado no se restituye ni se verifica».

-- ── 1. Tipos por organización ────────────────────────────────────────────
CREATE TABLE public.register_types (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  prefix         text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  blocks_gate_id uuid REFERENCES public.readiness_gates(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT register_types_kind_check CHECK (kind IN ('temporary', 'blind', 'reinstatement', 'bypass', 'energization', 'test_pack')),
  CONSTRAINT register_types_prefix_check CHECK (prefix ~ '^[A-Z]{2,5}$'),
  CONSTRAINT register_types_org_kind_uq UNIQUE (org_id, kind)
);

ALTER TABLE public.register_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY register_types_select ON public.register_types FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_my_org_ids()));

-- ── 2. Ítems ─────────────────────────────────────────────────────────────
CREATE TABLE public.register_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type_id       uuid NOT NULL REFERENCES public.register_types(id) ON DELETE RESTRICT,
  kind          text NOT NULL,
  seq           integer NOT NULL,
  number        text NOT NULL,
  title         text NOT NULL,
  description   text,
  system_id     uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'proposed',
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_by   uuid, proposed_at   timestamptz NOT NULL DEFAULT now(),
  authorized_by uuid, authorized_at timestamptz,
  activated_by  uuid, activated_at  timestamptz,
  removed_by    uuid, removed_at    timestamptz,
  verified_by   uuid, verified_at   timestamptz,
  cancelled_by  uuid, cancelled_at  timestamptz, cancel_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT register_items_status_check CHECK (status IN ('proposed', 'authorized', 'active', 'removed', 'verified', 'cancelled')),
  CONSTRAINT register_items_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT register_items_data_check CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT register_items_number_uq UNIQUE (project_id, number)
);
CREATE INDEX register_items_project_status_idx ON public.register_items (project_id, status);
CREATE INDEX register_items_system_idx ON public.register_items (system_id) WHERE system_id IS NOT NULL;
CREATE INDEX register_items_type_idx ON public.register_items (type_id);

CREATE TABLE public.register_item_tags (
  item_id    uuid NOT NULL REFERENCES public.register_items(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'subject',
  CONSTRAINT register_item_tags_role_check CHECK (role IN ('subject', 'line', 'gauge')),
  PRIMARY KEY (item_id, tag_id, role)
);
CREATE INDEX register_item_tags_tag_idx ON public.register_item_tags (tag_id);

CREATE TABLE public.register_item_links (
  item_id        uuid NOT NULL REFERENCES public.register_items(id) ON DELETE CASCADE,
  linked_item_id uuid NOT NULL REFERENCES public.register_items(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT register_item_links_not_self CHECK (item_id <> linked_item_id),
  PRIMARY KEY (item_id, linked_item_id)
);
CREATE INDEX register_item_links_linked_idx ON public.register_item_links (linked_item_id);

CREATE TABLE public.register_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.register_items(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action      text NOT NULL,
  from_status text,
  to_status   text,
  user_id     uuid,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX register_events_item_idx ON public.register_events (item_id, created_at);

ALTER TABLE public.register_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_item_tags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_events     ENABLE ROW LEVEL SECURITY;
CREATE POLICY register_items_select ON public.register_items FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY register_item_tags_select ON public.register_item_tags FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY register_item_links_select ON public.register_item_links FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY register_events_select ON public.register_events FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 3. Helpers internos ──────────────────────────────────────────────────
-- Rol del usuario actual en la org del proyecto (NULL si no es miembro del proyecto).
CREATE OR REPLACE FUNCTION public.register_caller_role(p_project_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT om.role::text
  FROM projects p JOIN org_members om ON om.org_id = p.org_id AND om.user_id = auth.uid()
  WHERE p.id = p_project_id AND public.is_project_member(p_project_id);
$fn$;

-- Reemplaza los tags de un ítem validando que sean del proyecto y que el rol sea válido.
CREATE OR REPLACE FUNCTION public.register_set_tags(p_item_id uuid, p_project_id uuid, p_tags jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_bad integer;
BEGIN
  IF p_tags IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_tags) <> 'array' OR jsonb_array_length(p_tags) > 2000 THEN
    RAISE EXCEPTION 'Lista de tags no válida' USING ERRCODE = '22023';
  END IF;
  SELECT COUNT(*) INTO v_bad
  FROM jsonb_array_elements(p_tags) e
  WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.id = NULLIF(e ->> 'tag_id', '')::uuid AND t.project_id = p_project_id)
     OR COALESCE(e ->> 'role', 'subject') NOT IN ('subject', 'line', 'gauge');
  IF v_bad > 0 THEN RAISE EXCEPTION 'Hay tags que no pertenecen al proyecto' USING ERRCODE = '22023'; END IF;
  DELETE FROM register_item_tags WHERE item_id = p_item_id;
  INSERT INTO register_item_tags (item_id, tag_id, project_id, role)
  SELECT DISTINCT p_item_id, (e ->> 'tag_id')::uuid, p_project_id, COALESCE(e ->> 'role', 'subject')
  FROM jsonb_array_elements(p_tags) e;
END;
$fn$;

-- ── 4. Tipos: siembra idempotente y configuración ───────────────────────
-- Prefijos y bloqueo por defecto = catálogo TS (src/lib/registers/catalog.ts). Bloqueo por posición del gate.
CREATE OR REPLACE FUNCTION public.ensure_register_types(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_gates uuid[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(id ORDER BY order_index, code) INTO v_gates FROM readiness_gates WHERE org_id = p_org_id AND is_active;
  INSERT INTO register_types (org_id, kind, prefix, blocks_gate_id)
  SELECT p_org_id, d.kind, d.prefix,
         CASE d.pos
           WHEN 'first' THEN v_gates[1]
           WHEN 'penultimate' THEN v_gates[GREATEST(cardinality(v_gates) - 1, 1)]
           WHEN 'last' THEN v_gates[cardinality(v_gates)]
         END
  FROM (VALUES ('temporary', 'TMP', 'penultimate'), ('blind', 'CIE', 'penultimate'), ('reinstatement', 'REI', 'last'),
               ('bypass', 'BYP', 'last'), ('energization', 'ENE', NULL), ('test_pack', 'TPK', 'first')) AS d(kind, prefix, pos)
  ON CONFLICT (org_id, kind) DO NOTHING;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.configure_register_type(p_type_id uuid, p_is_active boolean, p_blocks_gate_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM register_types WHERE id = p_type_id;
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = v_org AND user_id = auth.uid()
                                    AND role::text IN ('owner', 'admin', 'architect')) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_blocks_gate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM readiness_gates WHERE id = p_blocks_gate_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'Gate de otra organización' USING ERRCODE = '22023';
  END IF;
  UPDATE register_types SET is_active = p_is_active, blocks_gate_id = p_blocks_gate_id WHERE id = p_type_id;
END;
$fn$;

-- ── 5. Crear / editar ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_register_item(
  p_project_id  uuid,
  p_kind        text,
  p_title       text,
  p_description text  DEFAULT NULL,
  p_system_id   uuid  DEFAULT NULL,
  p_data        jsonb DEFAULT '{}'::jsonb,
  p_tags        jsonb DEFAULT '[]'::jsonb,
  p_owner_id    uuid  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_role text; v_org uuid; v_type register_types%ROWTYPE; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  PERFORM public.ensure_register_types(v_org);
  SELECT * INTO v_type FROM register_types WHERE org_id = v_org AND kind = p_kind;
  IF NOT FOUND OR NOT v_type.is_active THEN RAISE EXCEPTION 'Tipo de registro no disponible' USING ERRCODE = '22023'; END IF;
  IF p_system_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM systems WHERE id = p_system_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = v_org AND user_id = p_owner_id) THEN
    RAISE EXCEPTION 'El responsable no es miembro de la organización' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Datos no válidos' USING ERRCODE = '22023'; END IF;

  -- Numeración atómica por proyecto y tipo.
  PERFORM pg_advisory_xact_lock(hashtext('register_items:' || p_project_id::text || ':' || v_type.id::text));
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM register_items WHERE project_id = p_project_id AND type_id = v_type.id;

  INSERT INTO register_items (org_id, project_id, type_id, kind, seq, number, title, description, system_id, owner_id, data, proposed_by)
  VALUES (v_org, p_project_id, v_type.id, v_type.kind, v_seq, v_type.prefix || '-' || lpad(v_seq::text, 4, '0'),
          btrim(p_title), NULLIF(btrim(COALESCE(p_description, '')), ''), p_system_id, COALESCE(p_owner_id, auth.uid()),
          p_data, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.register_set_tags(v_id, p_project_id, COALESCE(p_tags, '[]'::jsonb));
  INSERT INTO register_events (item_id, org_id, project_id, action, to_status, user_id)
  VALUES (v_id, v_org, p_project_id, 'created', 'proposed', auth.uid());
  RETURN v_id;
END;
$fn$;

-- Edita datos/vínculos mientras el ítem no esté cerrado. p_tags NULL = no tocar los tags.
CREATE OR REPLACE FUNCTION public.update_register_item(
  p_item_id     uuid,
  p_title       text,
  p_description text,
  p_system_id   uuid,
  p_data        jsonb,
  p_tags        jsonb DEFAULT NULL,
  p_owner_id    uuid  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_item register_items%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_item FROM register_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_item.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_item.status IN ('verified', 'cancelled') THEN
    RAISE EXCEPTION 'El registro % está cerrado y no se puede editar', v_item.number USING ERRCODE = 'P0001';
  END IF;
  IF p_system_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM systems WHERE id = p_system_id AND project_id = v_item.project_id) THEN
    RAISE EXCEPTION 'El sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = v_item.org_id AND user_id = p_owner_id) THEN
    RAISE EXCEPTION 'El responsable no es miembro de la organización' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Datos no válidos' USING ERRCODE = '22023'; END IF;

  UPDATE register_items
     SET title = btrim(p_title), description = NULLIF(btrim(COALESCE(p_description, '')), ''),
         system_id = p_system_id, data = p_data, owner_id = COALESCE(p_owner_id, owner_id), updated_at = now()
   WHERE id = p_item_id;
  PERFORM public.register_set_tags(p_item_id, v_item.project_id, p_tags);
  INSERT INTO register_events (item_id, org_id, project_id, action, user_id)
  VALUES (p_item_id, v_item.org_id, v_item.project_id, 'updated', auth.uid());
END;
$fn$;

-- ── 6. Ciclo de vida ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_register_item(
  p_item_id uuid,
  p_to      text,
  p_comment text  DEFAULT NULL,
  p_data    jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_item register_items%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_data jsonb; v_comment text;
BEGIN
  SELECT * INTO v_item FROM register_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_item.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := NULLIF(left(btrim(COALESCE(p_comment, '')), 2000), '');
  v_data := v_item.data;
  IF p_data IS NOT NULL THEN
    IF jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Datos no válidos' USING ERRCODE = '22023'; END IF;
    v_data := p_data;
  END IF;

  IF p_to = 'cancelled' THEN
    IF v_item.status IN ('verified', 'cancelled') THEN RAISE EXCEPTION 'El registro % ya está cerrado', v_item.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar registros', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE register_items SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment,
                              data = v_data, updated_at = now() WHERE id = p_item_id;
  ELSE
    IF NOT ((v_item.status = 'proposed' AND p_to = 'authorized') OR (v_item.status = 'authorized' AND p_to = 'active')
         OR (v_item.status = 'active' AND p_to = 'removed') OR (v_item.status = 'removed' AND p_to = 'verified')) THEN
      RAISE EXCEPTION 'Transición no permitida: % → %', v_item.status, p_to USING ERRCODE = 'P0001';
    END IF;
    IF p_to = 'authorized' THEN
      IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede autorizar registros', v_role USING ERRCODE = '42501'; END IF;
      IF v_uid = v_item.proposed_by THEN RAISE EXCEPTION 'Quien propone no puede autorizar su propio registro' USING ERRCODE = '42501'; END IF;
    END IF;
    IF p_to = 'verified' AND v_uid = v_item.removed_by THEN
      RAISE EXCEPTION 'La verificación debe hacerla una persona distinta de quien retiró/restauró' USING ERRCODE = '42501';
    END IF;
    IF v_item.kind = 'test_pack' AND p_to IN ('removed', 'verified') AND v_data ->> 'result' = 'rejected' THEN
      RAISE EXCEPTION 'La prueba del % fue rechazada: repite la prueba antes de restituir o verificar', v_item.number USING ERRCODE = 'P0001';
    END IF;
    UPDATE register_items SET
      status = p_to, data = v_data, updated_at = now(),
      authorized_by = CASE WHEN p_to = 'authorized' THEN v_uid ELSE authorized_by END,
      authorized_at = CASE WHEN p_to = 'authorized' THEN now() ELSE authorized_at END,
      activated_by  = CASE WHEN p_to = 'active'     THEN v_uid ELSE activated_by END,
      activated_at  = CASE WHEN p_to = 'active'     THEN now() ELSE activated_at END,
      removed_by    = CASE WHEN p_to = 'removed'    THEN v_uid ELSE removed_by END,
      removed_at    = CASE WHEN p_to = 'removed'    THEN now() ELSE removed_at END,
      verified_by   = CASE WHEN p_to = 'verified'   THEN v_uid ELSE verified_by END,
      verified_at   = CASE WHEN p_to = 'verified'   THEN now() ELSE verified_at END
    WHERE id = p_item_id;
  END IF;

  INSERT INTO register_events (item_id, org_id, project_id, action, from_status, to_status, user_id, comment)
  VALUES (p_item_id, v_item.org_id, v_item.project_id, 'transition', v_item.status, p_to, v_uid, v_comment);
  RETURN p_to;
END;
$fn$;

-- Vincula/desvincula ítems del mismo proyecto (ej. un test pack y sus ciegas).
CREATE OR REPLACE FUNCTION public.link_register_items(p_item_id uuid, p_linked_item_id uuid, p_link boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid; v_role text;
BEGIN
  SELECT project_id INTO v_project FROM register_items WHERE id = p_item_id;
  IF v_project IS NULL OR NOT EXISTS (SELECT 1 FROM register_items WHERE id = p_linked_item_id AND project_id = v_project) THEN
    RAISE EXCEPTION 'Registros no encontrados en el mismo proyecto' USING ERRCODE = 'P0002';
  END IF;
  v_role := public.register_caller_role(v_project);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_link THEN
    INSERT INTO register_item_links (item_id, linked_item_id, project_id) VALUES (p_item_id, p_linked_item_id, v_project)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM register_item_links WHERE item_id = p_item_id AND linked_item_id = p_linked_item_id;
  END IF;
END;
$fn$;

-- Borrar solo borradores: ítems nunca autorizados (propuestos, o cancelados antes de autorizar).
-- Lo puede hacer quien lo propuso u owner/admin. Un registro con firmas es historia y no se borra.
CREATE OR REPLACE FUNCTION public.delete_register_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_item register_items%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_item FROM register_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_item.project_id);
  IF v_role IS NULL OR NOT (v_item.proposed_by = auth.uid() OR v_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_item.authorized_at IS NOT NULL OR v_item.status NOT IN ('proposed', 'cancelled') THEN
    RAISE EXCEPTION 'Solo se pueden borrar borradores nunca autorizados; cancela el registro en su lugar' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM register_items WHERE id = p_item_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.register_caller_role(uuid)                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_set_tags(uuid, uuid, jsonb)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_register_types(uuid)                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.configure_register_type(uuid, boolean, uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_register_item(uuid, text, text, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_register_item(uuid, text, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_register_item(uuid, text, text, jsonb)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.link_register_items(uuid, uuid, boolean)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_register_item(uuid)                                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_register_item(uuid)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_register_types(uuid)                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_register_type(uuid, boolean, uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_register_item(uuid, text, text, text, uuid, jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_register_item(uuid, text, text, uuid, jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_register_item(uuid, text, text, jsonb)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_register_items(uuid, uuid, boolean)                      TO authenticated, service_role;

-- Siembra para las organizaciones existentes (auth.uid() es NULL en la migración: sin chequeo de miembro).
SELECT public.ensure_register_types(id) FROM public.organizations;

-- ── 7. Motor de gates: criterio implícito registers_clear ────────────────
CREATE OR REPLACE FUNCTION public.compute_system_gates(p_system_id uuid)
RETURNS TABLE(
  gate_id             uuid,
  gate_code           text,
  gate_name           text,
  gate_order          integer,
  gate_phase_id       uuid,
  requires_previous   boolean,
  approval_roles      text[],
  required_signatures text[],
  cosign_roles        text[],
  computed_level      text,
  status              text,
  criteria            jsonb,
  approval            jsonb
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_org     uuid;
  v_limit   integer;
  v_prev_ok boolean := true;
  v_first   boolean := true;
  g         record;
  c         record;
  v_phase   uuid;
  v_crit    jsonb;
  v_res     jsonb;
  v_result  text;
  v_level   text;
  v_appr    jsonb;
  v_levels  text[];
  v_total   integer;
  v_fail    jsonb;
  v_failn   integer;
BEGIN
  SELECT p.org_id INTO v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  v_limit := public.org_cat_b_limit(v_org);

  FOR g IN
    SELECT rg.* FROM readiness_gates rg
    WHERE rg.org_id = v_org AND rg.is_active
    ORDER BY rg.order_index, rg.code
  LOOP
    v_crit  := '[]'::jsonb;
    v_level := 'green';

    IF g.requires_previous AND NOT v_first THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'previous_gate', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_prev_ok THEN 'pass' ELSE 'fail' END, 'detail', '{}'::jsonb));
      IF NOT v_prev_ok THEN v_level := 'red'; END IF;
    END IF;

    -- Dependencias entre sistemas (F2): criterio implícito y siempre bloqueante. El proveedor
    -- cumple si su gate requerido tiene una aprobación vigente con todas las firmas.
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE NOT x.ok)::int,
           COALESCE(jsonb_agg(jsonb_build_object(
             'dependency_id', x.dep_id, 'kind', x.kind,
             'system_id', x.sys_id, 'system_code', x.sys_code, 'system_name', x.sys_name,
             'gate_id', x.gate_id, 'gate_code', x.gate_code,
             'provider_status', x.appr_status, 'ok', x.ok) ORDER BY x.ok, x.sys_code), '[]'::jsonb)
      INTO v_total, v_failn, v_fail
    FROM (
      SELECT d.id AS dep_id, d.kind, ps.id AS sys_id, ps.code AS sys_code, ps.name AS sys_name,
             rg.id AS gate_id, rg.code AS gate_code, sa.status AS appr_status,
             COALESCE(sa.status IN ('approved', 'approved_with_conditions'), false) AS ok
      FROM system_dependencies d
      JOIN systems ps         ON ps.id = d.depends_on_system_id
      JOIN readiness_gates rg ON rg.id = d.required_gate_id AND rg.is_active
      LEFT JOIN system_gate_approvals sa
             ON sa.system_id = ps.id AND sa.gate_id = rg.id AND sa.revoked_at IS NULL
      WHERE d.system_id = p_system_id AND d.blocked_gate_id = g.id
    ) x;
    IF v_total > 0 THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'dependencies_ready', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('total', v_total, 'missing_count', v_failn, 'dependencies', v_fail)));
      IF v_failn > 0 THEN v_level := 'red'; END IF;
    END IF;

    -- Registros controlados (F3): criterio implícito si algún tipo activo bloquea este gate.
    -- Bloquea todo ítem no verificado ni cancelado del sistema (por system_id o por sus tags).
    IF EXISTS (SELECT 1 FROM register_types rt WHERE rt.org_id = v_org AND rt.is_active AND rt.blocks_gate_id = g.id) THEN
      SELECT COUNT(*)::int,
             COALESCE(jsonb_agg(jsonb_build_object(
               'id', ri.id, 'number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title
             ) ORDER BY ri.number), '[]'::jsonb)
        INTO v_failn, v_fail
      FROM register_items ri
      JOIN register_types rt ON rt.id = ri.type_id AND rt.is_active AND rt.blocks_gate_id = g.id
      WHERE ri.status IN ('proposed', 'authorized', 'active', 'removed')
        AND (ri.system_id = p_system_id OR EXISTS (
              SELECT 1 FROM register_item_tags rit
              JOIN tags t ON t.id = rit.tag_id
              JOIN subsystems ss ON ss.id = t.subsystem_id
              WHERE rit.item_id = ri.id AND ss.system_id = p_system_id));
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'registers_clear', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('open_count', v_failn, 'open', v_fail)));
      IF v_failn > 0 THEN v_level := 'red'; END IF;
    END IF;

    FOR c IN
      SELECT gc.* FROM gate_criteria gc WHERE gc.gate_id = g.id ORDER BY gc.order_index, gc.created_at
    LOOP
      v_phase := COALESCE(NULLIF(c.params ->> 'phase_id', '')::uuid, g.phase_id);
      v_res   := '{}'::jsonb;
      v_result := 'fail';

      IF c.kind = 'itr_phase_approved' THEN
        IF v_phase IS NULL THEN
          v_res := jsonb_build_object('error', 'no_phase');
        ELSE
          v_res := public.system_phase_level(p_system_id, v_phase, v_limit);
          v_result := CASE v_res ->> 'level' WHEN 'green' THEN 'pass' WHEN 'yellow' THEN 'warn' ELSE 'fail' END;
        END IF;

      ELSIF c.kind = 'certificates_issued' THEN
        IF v_phase IS NULL THEN
          v_res := jsonb_build_object('error', 'no_phase');
        ELSE
          SELECT COUNT(*)::int,
                 COUNT(*) FILTER (WHERE NOT EXISTS (
                   SELECT 1 FROM certificates ce
                   WHERE ce.subsystem_id = ss.id AND ce.phase_id = v_phase AND ce.status = 'issued'))::int,
                 COALESCE(jsonb_agg(jsonb_build_object('id', ss.id, 'code', ss.code) ORDER BY ss.code)
                   FILTER (WHERE NOT EXISTS (
                     SELECT 1 FROM certificates ce
                     WHERE ce.subsystem_id = ss.id AND ce.phase_id = v_phase AND ce.status = 'issued')), '[]'::jsonb)
            INTO v_total, v_failn, v_fail
          FROM subsystems ss WHERE ss.system_id = p_system_id;
          v_res := jsonb_build_object('subsystems_total', v_total, 'missing_count', v_failn, 'missing', v_fail);
          v_result := CASE WHEN v_total > 0 AND v_failn = 0 THEN 'pass' ELSE 'fail' END;
        END IF;

      ELSIF c.kind = 'pssr_approved' THEN
        SELECT jsonb_build_object('review_id', pr.id, 'review_number', pr.review_number, 'review_status', pr.status)
          INTO v_res
        FROM pssr_reviews pr
        WHERE pr.system_id = p_system_id
        ORDER BY (pr.status = 'approved') DESC, pr.created_at DESC
        LIMIT 1;
        v_res := COALESCE(v_res, '{}'::jsonb);
        v_result := CASE WHEN v_res ->> 'review_status' = 'approved' THEN 'pass' ELSE 'fail' END;

      ELSIF c.kind = 'critical_tags_ready' THEN
        SELECT COALESCE(array_agg(x), ARRAY['safety', 'process'])
          INTO v_levels
        FROM jsonb_array_elements_text(COALESCE(c.params -> 'levels', '[]'::jsonb)) x;

        WITH crit AS (
          SELECT t.id, t.tag_number, t.criticality
          FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
          WHERE ss.system_id = p_system_id AND t.criticality = ANY (v_levels)
        ),
        chk AS (
          SELECT crit.*,
                 (SELECT COUNT(*) FROM itrs i
                   WHERE i.tag_id = crit.id AND i.status <> 'approved'
                     AND (v_phase IS NULL OR i.phase_id = v_phase)) AS itrs_pending,
                 (SELECT COUNT(*) FROM punches p
                   WHERE p.tag_id = crit.id AND p.category IN ('A', 'B')
                     AND p.status IN ('open', 'in_progress')) AS punches_open
          FROM crit
        )
        SELECT COUNT(*)::int,
               COUNT(*) FILTER (WHERE itrs_pending > 0 OR punches_open > 0)::int,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'id', id, 'tag_number', tag_number, 'criticality', criticality,
                 'itrs_pending', itrs_pending, 'punches_open', punches_open) ORDER BY tag_number)
                 FILTER (WHERE itrs_pending > 0 OR punches_open > 0), '[]'::jsonb)
          INTO v_total, v_failn, v_fail
        FROM chk;
        v_res := jsonb_build_object('critical_total', v_total, 'failing_count', v_failn,
                                    'failing', v_fail, 'levels', to_jsonb(v_levels));
        v_result := CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END;

      ELSIF c.kind = 'manual_attestation' THEN
        SELECT jsonb_build_object('attestation_id', a.id, 'comment', a.comment, 'file_path', a.file_path,
                                  'attested_by', a.attested_by, 'attested_at', a.attested_at)
          INTO v_res
        FROM system_gate_attestations a
        WHERE a.system_id = p_system_id AND a.criterion_id = c.id AND a.revoked_at IS NULL;
        v_result := CASE WHEN v_res IS NULL THEN 'fail' ELSE 'pass' END;
        v_res := COALESCE(v_res, '{}'::jsonb);
      END IF;

      IF v_result = 'fail' AND NOT c.is_blocking THEN
        v_result := 'warn';
      END IF;

      IF v_result = 'fail' THEN
        v_level := 'red';
      ELSIF v_result = 'warn' AND v_level = 'green' THEN
        v_level := 'yellow';
      END IF;

      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', c.id, 'kind', c.kind, 'label', c.params ->> 'label',
        'blocking', c.is_blocking, 'result', v_result, 'detail', v_res));
    END LOOP;

    SELECT jsonb_build_object(
             'id', a.id, 'status', a.status, 'target_status', a.target_status,
             'conditions', a.conditions, 'notes', a.notes,
             'approved_by', a.approved_by, 'approved_role', a.approved_role, 'approved_at', a.approved_at,
             'signatures', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'capacity', s.capacity, 'user_id', s.user_id, 'user_role', s.user_role,
                        'comments', s.comments, 'signed_at', s.signed_at) ORDER BY s.signed_at)
               FROM system_gate_signatures s WHERE s.approval_id = a.id), '[]'::jsonb))
      INTO v_appr
    FROM system_gate_approvals a
    WHERE a.system_id = p_system_id AND a.gate_id = g.id AND a.revoked_at IS NULL;

    gate_id             := g.id;
    gate_code           := g.code;
    gate_name           := g.name;
    gate_order          := g.order_index;
    gate_phase_id       := g.phase_id;
    requires_previous   := g.requires_previous;
    approval_roles      := g.approval_roles;
    required_signatures := g.required_signatures;
    cosign_roles        := g.cosign_roles;
    computed_level      := v_level;
    criteria            := v_crit;
    approval            := v_appr;
    status := CASE
      WHEN v_appr IS NOT NULL AND v_level = 'red' THEN 'regressed'
      WHEN v_appr IS NOT NULL THEN v_appr ->> 'status'
      WHEN v_level = 'green'  THEN 'ready'
      WHEN v_level = 'yellow' THEN 'ready_with_conditions'
      ELSE 'not_ready'
    END;
    RETURN NEXT;

    -- Solo un gate con todas sus firmas habilita al siguiente.
    v_prev_ok := v_appr IS NOT NULL AND v_appr ->> 'status' <> 'pending_signatures';
    v_first   := false;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_system_gates(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_system_gates(uuid) TO authenticated, service_role;
