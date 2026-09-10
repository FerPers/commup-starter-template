-- Fase 6 (2026-09-10): la matriz equipo×ITR de una organización catálogo es
-- legible por cualquier usuario autenticado, igual que sus plantillas, tipos de
-- equipo, disciplinas y fases (is_catalog_org). Permite clonar la matriz junto
-- con la plantilla al importar desde el catálogo.
CREATE POLICY equipment_type_templates_select_catalog ON public.equipment_type_templates
  FOR SELECT TO authenticated USING (public.is_catalog_org(org_id));
