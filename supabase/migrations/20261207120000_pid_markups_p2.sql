-- P2 (plan referente 2026-10-22, «Marcas LOSH en escritorio»; maqueta del visor aprobada por Luis en M):
-- límites de sistema dibujados sobre una REVISIÓN de un P&ID, como los pines. Tres formas, sin polígonos (en un
-- P&ID los sistemas se entrecruzan):
--   line  = resaltar el recorrido de líneas del sistema (polilínea gruesa y translúcida, 2..500 vértices);
--   limit = barra de límite en un punto de aislamiento (2 puntos = los extremos de la barra, perpendicular a la
--           línea), con el sistema de cada lado (other_system_id NULL = límite de batería / fuera del alcance);
--   label = etiqueta con el código del sistema (1 punto).
-- Coordenadas: unidad 0..1 sobre la página YA ROTADA, con el tamaño (puntos PDF) y la rotación de la página al
-- dibujar, para reproyectar si la revisión siguiente viene girada (src/lib/pid/geometry.ts, reprojectPoint).
-- Capa: 'losh' (límites, Líder+ y Arquitecto = editores, igual que los pines). 'redline' queda reservada para el
-- red-line de campo (F-21): hoy ninguna política deja escribirla.
-- Revisión nueva vigente → las marcas LOSH se copian «por revisar» (pid_carry_markups), igual que los pines.
-- Sistema con liberación aprobada: editar sus marcas NO se bloquea, queda registrado en activity_log
-- (pid_markup_audit, con las liberaciones aprobadas a esa hora).

-- ── 1. Tabla ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pid_markup_points_ok(p_kind text, p_points jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_points IS NULL OR jsonb_typeof(p_points) <> 'array' THEN false
    WHEN jsonb_array_length(p_points) < (CASE p_kind WHEN 'label' THEN 1 ELSE 2 END) THEN false
    WHEN jsonb_array_length(p_points) > (CASE p_kind WHEN 'line' THEN 500 WHEN 'limit' THEN 2 ELSE 1 END) THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_points) e
      WHERE CASE
        WHEN jsonb_typeof(e) <> 'array' OR jsonb_array_length(e) <> 2 THEN true
        WHEN jsonb_typeof(e -> 0) <> 'number' OR jsonb_typeof(e -> 1) <> 'number' THEN true
        ELSE (e ->> 0)::numeric NOT BETWEEN 0 AND 1 OR (e ->> 1)::numeric NOT BETWEEN 0 AND 1
      END)
  END
$function$;

CREATE TABLE public.pid_markups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  revision_id     uuid NOT NULL REFERENCES public.document_revisions(id) ON DELETE CASCADE,
  page_num        integer NOT NULL DEFAULT 1 CHECK (page_num >= 1),
  layer           text NOT NULL DEFAULT 'losh' CHECK (layer IN ('losh', 'redline')),
  kind            text NOT NULL CHECK (kind IN ('line', 'limit', 'label')),
  system_id       uuid REFERENCES public.systems(id) ON DELETE CASCADE,
  other_system_id uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  points          jsonb NOT NULL,
  page_width      numeric(10,2) NOT NULL CHECK (page_width > 0),
  page_height     numeric(10,2) NOT NULL CHECK (page_height > 0),
  page_rotation   smallint NOT NULL DEFAULT 0 CHECK (page_rotation IN (0, 90, 180, 270)),
  label           text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 80),
  needs_review    boolean NOT NULL DEFAULT false,
  created_by      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.profiles(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pid_markups_points_ok CHECK (public.pid_markup_points_ok(kind, points)),
  CONSTRAINT pid_markups_losh_system CHECK (layer <> 'losh' OR system_id IS NOT NULL),
  CONSTRAINT pid_markups_other_system CHECK (
    other_system_id IS NULL OR (kind = 'limit' AND other_system_id <> system_id))
);
CREATE INDEX pid_markups_revision_idx ON public.pid_markups (revision_id, page_num);
CREATE INDEX pid_markups_project_idx ON public.pid_markups (project_id);
CREATE INDEX pid_markups_system_idx ON public.pid_markups (system_id);
CREATE INDEX pid_markups_other_system_idx ON public.pid_markups (other_system_id) WHERE other_system_id IS NOT NULL;

COMMENT ON TABLE public.pid_markups IS
  'P2: marcas sobre una revisión de un P&ID (línea resaltada, límite, etiqueta). Puntos en unidad 0..1 de la página rotada.';

-- ── 2. Integridad: revisión de un P&ID del mismo proyecto, sistemas del mismo proyecto ──
-- pid_hotspot_guard (N2d) sirve tal cual: revision_id → documento P&ID del mismo proyecto y org.
CREATE TRIGGER pid_markups_guard BEFORE INSERT OR UPDATE OF revision_id, project_id, org_id ON public.pid_markups
  FOR EACH ROW EXECUTE FUNCTION public.pid_hotspot_guard();
CREATE TRIGGER pid_markups_same_project BEFORE INSERT OR UPDATE OF system_id, project_id ON public.pid_markups
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();

-- guard_same_project solo mira system_id; el sistema del otro lado del límite también es del proyecto. Y quién
-- y cuándo cambió una marca lo pone la BD.
CREATE OR REPLACE FUNCTION public.pid_markup_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.other_system_id IS NOT NULL
     AND (SELECT s.project_id FROM systems s WHERE s.id = NEW.other_system_id) IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'pid_markups.other_system_id: % es de otro proyecto', NEW.other_system_id USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER pid_markups_stamp BEFORE INSERT OR UPDATE ON public.pid_markups
  FOR EACH ROW EXECUTE FUNCTION public.pid_markup_stamp();

-- ── 3. RLS: como los pines (leer = miembros del proyecto; escribir = editores), solo la capa LOSH ──
ALTER TABLE public.pid_markups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pid_markups FROM anon;

CREATE POLICY pid_markups_select ON public.pid_markups FOR SELECT TO authenticated
  USING (project_id IN (SELECT get_my_project_ids()));
CREATE POLICY pid_markups_insert ON public.pid_markups FOR INSERT TO authenticated
  WITH CHECK (layer = 'losh' AND created_by = auth.uid() AND project_id IN (SELECT get_my_editor_project_ids()));
CREATE POLICY pid_markups_update ON public.pid_markups FOR UPDATE TO authenticated
  USING (layer = 'losh' AND project_id IN (SELECT get_my_editor_project_ids()))
  WITH CHECK (layer = 'losh' AND project_id IN (SELECT get_my_editor_project_ids()));
CREATE POLICY pid_markups_delete ON public.pid_markups FOR DELETE TO authenticated
  USING (layer = 'losh' AND project_id IN (SELECT get_my_editor_project_ids()));

-- ── 4. Revisión nueva vigente → marcas LOSH «por revisar» ─────────────────────
-- Mismas reglas que pid_carry_hotspots: solo hacia adelante y solo si la nueva aún no tiene marcas. Se copian
-- tamaño y rotación de la página de origen: el visor reproyecta si la hoja nueva viene girada.
CREATE OR REPLACE FUNCTION public.pid_carry_markups()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.doc_type <> 'pid' OR NEW.current_revision_id IS NULL OR OLD.current_revision_id IS NULL
     OR NEW.current_revision_id = OLD.current_revision_id THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pid_markups WHERE revision_id = NEW.current_revision_id) THEN RETURN NULL; END IF;
  IF (SELECT seq FROM document_revisions WHERE id = NEW.current_revision_id)
     <= (SELECT seq FROM document_revisions WHERE id = OLD.current_revision_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO pid_markups (org_id, project_id, revision_id, page_num, layer, kind, system_id, other_system_id,
                           points, page_width, page_height, page_rotation, label, needs_review, created_by)
  SELECT m.org_id, m.project_id, NEW.current_revision_id, m.page_num, m.layer, m.kind, m.system_id, m.other_system_id,
         m.points, m.page_width, m.page_height, m.page_rotation, m.label, true, m.created_by
  FROM pid_markups m WHERE m.revision_id = OLD.current_revision_id AND m.layer = 'losh';
  RETURN NULL;
END;
$function$;
CREATE TRIGGER documents_pid_carry_markups AFTER UPDATE OF current_revision_id ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.pid_carry_markups();

-- ── 5. Sistema con liberación aprobada: el cambio queda registrado (no se bloquea) ──
CREATE OR REPLACE FUNCTION public.pid_markup_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_systems uuid[];
  v_gates jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  -- La copia «por revisar» de una revisión nueva no es una edición de nadie.
  IF TG_OP = 'INSERT' AND NEW.needs_review THEN RETURN NULL; END IF;
  v_systems := array_remove(ARRAY[(v_row ->> 'system_id')::uuid, (v_row ->> 'other_system_id')::uuid,
                                  (v_old ->> 'system_id')::uuid, (v_old ->> 'other_system_id')::uuid], NULL);
  SELECT jsonb_agg(jsonb_build_object('system_id', a.system_id, 'gate', g.code, 'status', a.status) ORDER BY g.order_index)
    INTO v_gates
    FROM system_gate_approvals a JOIN readiness_gates g ON g.id = a.gate_id
   WHERE a.revoked_at IS NULL AND a.system_id = ANY (v_systems);
  IF v_gates IS NULL THEN RETURN NULL; END IF;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES ((v_row ->> 'org_id')::uuid, auth.uid(), 'pid_markups', (v_row ->> 'id')::uuid, lower(TG_OP),
          jsonb_build_object('approved_gates', v_gates,
                             'new', CASE WHEN TG_OP <> 'DELETE' THEN v_row END, 'old', v_old));
  RETURN NULL;
END;
$function$;
CREATE TRIGGER pid_markups_audit AFTER INSERT OR UPDATE OR DELETE ON public.pid_markups
  FOR EACH ROW EXECUTE FUNCTION public.pid_markup_audit();

REVOKE EXECUTE ON FUNCTION public.pid_markup_stamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pid_carry_markups() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pid_markup_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pid_markup_points_ok(text, jsonb) FROM anon;
