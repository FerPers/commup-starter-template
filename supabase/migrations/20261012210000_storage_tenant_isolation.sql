-- Aislamiento multi-tenant de los buckets de adjuntos (2026-10-12).
--
-- Antes: itr-attachments, punch-attachments y preservation-attachments solo verificaban el bucket
-- en SELECT/INSERT (punch y preservación incluso para el rol public/anon): conociendo la ruta,
-- cualquiera podía leer o subir archivos de otra organización.
--
-- Ahora el primer segmento de la ruta identifica la entidad dueña (convención existente del código):
--   itr-attachments           <itr_id>/<item_id>/<archivo>   (src/lib/sync/outbox-utils.ts)
--   punch-attachments         <punch_id>/<archivo>           (PunchPhotosSection.tsx)
--   preservation-attachments  <record_id>/<archivo>          (PreservationPhotosSection.tsx)
-- y las políticas exigen que esa entidad pertenezca a un proyecto del usuario. Solo rol authenticated.
-- Borrar sigue limitado al dueño del objeto (y en itr-attachments, prohibido: evidencia inmutable).

CREATE OR REPLACE FUNCTION public.storage_object_in_my_project(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seg     text := split_part(p_name, '/', 1);
  v_id      uuid;
  v_project uuid;
BEGIN
  IF auth.uid() IS NULL
     OR v_seg !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_id := v_seg::uuid;

  IF p_bucket = 'itr-attachments' THEN
    SELECT i.project_id INTO v_project FROM itrs i WHERE i.id = v_id;
  ELSIF p_bucket = 'punch-attachments' THEN
    SELECT p.project_id INTO v_project FROM punches p WHERE p.id = v_id;
  ELSIF p_bucket = 'preservation-attachments' THEN
    SELECT pl.project_id INTO v_project
    FROM preservation_records r JOIN preservation_plans pl ON pl.id = r.plan_id
    WHERE r.id = v_id;
  ELSE
    RETURN false;
  END IF;

  RETURN v_project IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects pr
    JOIN org_members om ON om.org_id = pr.org_id
    WHERE pr.id = v_project AND om.user_id = auth.uid()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.storage_object_in_my_project(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.storage_object_in_my_project(text, text) TO authenticated, service_role;

-- ── ITR ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS itr_attach_storage_select ON storage.objects;
DROP POLICY IF EXISTS itr_attach_storage_insert ON storage.objects;
DROP POLICY IF EXISTS itr_attach_storage_delete ON storage.objects;

CREATE POLICY itr_attach_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'itr-attachments' AND public.storage_object_in_my_project(bucket_id, name));
CREATE POLICY itr_attach_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'itr-attachments' AND public.storage_object_in_my_project(bucket_id, name));
-- (itr_evidence_no_delete / itr_evidence_no_overwrite RESTRICTIVE siguen vigentes)

-- ── Punch ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS punch_attach_storage_select ON storage.objects;
DROP POLICY IF EXISTS punch_attach_storage_insert ON storage.objects;
DROP POLICY IF EXISTS punch_attach_storage_delete ON storage.objects;

CREATE POLICY punch_attach_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'punch-attachments' AND public.storage_object_in_my_project(bucket_id, name));
CREATE POLICY punch_attach_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'punch-attachments' AND public.storage_object_in_my_project(bucket_id, name));
CREATE POLICY punch_attach_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'punch-attachments' AND owner = auth.uid()
         AND public.storage_object_in_my_project(bucket_id, name));

-- ── Preservación ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS preservation_attach_storage_select ON storage.objects;
DROP POLICY IF EXISTS preservation_attach_storage_insert ON storage.objects;
DROP POLICY IF EXISTS preservation_attach_storage_delete ON storage.objects;

CREATE POLICY preservation_attach_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'preservation-attachments' AND public.storage_object_in_my_project(bucket_id, name));
CREATE POLICY preservation_attach_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'preservation-attachments' AND public.storage_object_in_my_project(bucket_id, name));
CREATE POLICY preservation_attach_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'preservation-attachments' AND owner = auth.uid()
         AND public.storage_object_in_my_project(bucket_id, name));
