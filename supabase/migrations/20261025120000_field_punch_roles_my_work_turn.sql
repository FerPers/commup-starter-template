-- Sesión S1 del plan de ejecución de la revisión integral 2026-10-19.
--
-- C-03 · punch del inspector: las acciones (createPunch, addPunchComment, addPunchAttachment) pasan a
-- PUNCH_RAISE_ROLES = owner/admin/architect/leader/inspector (src/lib/constants/punch-roles.ts). La RLS ya dejaba
-- insertar a cualquier miembro del proyecto, también al cliente y a nombre de otro usuario; se alinea con el rol:
--   · punches / punch_comments / punch_attachments: INSERT solo con is_project_field_member y a nombre propio
--     (raised_by / user_id / uploaded_by = auth.uid()). Los RPC SECURITY DEFINER (vendors FAT/SAT) y la API v1
--     (service role) no pasan por estas políticas.
--   · punch_attachments DELETE: el editor o quien subió la foto (el inspector puede quitar su foto equivocada).
--
-- C-17 · Mi trabajo por «siguiente firma pendiente» (= isMyTurnToSign en src/lib/my-work/queues.ts):
--   · itrs_execute: ejecutor sin su firma y ITR no aprobado (incluye completado sin firmar y rechazado).
--   · itrs_review: supervisor cuando firmó el ejecutor; cliente cuando firmaron ejecutor y supervisor
--     (sign_itr_atomic exige ese orden: antes, el supervisor y el cliente veían el ITR sin poder firmar).

-- ── C-03 ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_project_field_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'architect', 'leader', 'inspector')
  )
$fn$;
REVOKE EXECUTE ON FUNCTION public.is_project_field_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_field_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS punches_insert ON public.punches;
CREATE POLICY punches_insert ON public.punches FOR INSERT
  WITH CHECK (
    project_id IN (SELECT get_my_project_ids())
    AND public.is_project_field_member(project_id)
    AND raised_by = auth.uid());

DROP POLICY IF EXISTS punch_comments_insert ON public.punch_comments;
CREATE POLICY punch_comments_insert ON public.punch_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM punches pu
                 WHERE pu.id = punch_comments.punch_id
                   AND pu.project_id IN (SELECT get_my_project_ids())
                   AND public.is_project_field_member(pu.project_id)));

DROP POLICY IF EXISTS punch_attachments_insert ON public.punch_attachments;
CREATE POLICY punch_attachments_insert ON public.punch_attachments FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND punch_id IN (SELECT punches.id FROM punches WHERE public.is_project_field_member(punches.project_id)));

DROP POLICY IF EXISTS punch_attachments_delete ON public.punch_attachments;
CREATE POLICY punch_attachments_delete ON public.punch_attachments FOR DELETE
  USING (punch_id IN (SELECT punches.id FROM punches
                       WHERE is_project_editor(punches.project_id)
                          OR (punch_attachments.uploaded_by = auth.uid() AND is_project_member(punches.project_id))));

-- ── C-17 ──────────────────────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_def text;
  v_exec_anchor text := $a$        and a.role = 'executor'
        and i.status in ('not_started', 'in_progress')
$a$;
  v_exec_new text := $a$        and a.role = 'executor'
        and i.status <> 'approved'
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
$a$;
  v_rev_anchor text := $a$        and not exists (
          select 1 from itr_signatures s where s.itr_id = i.id and s.role = a.role
        )
$a$;
  v_rev_new text := $a$        and not exists (
          select 1 from itr_signatures s where s.itr_id = i.id and s.role = a.role
        )
        and exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
        and (a.role = 'supervisor' or exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'supervisor'))
$a$;
BEGIN
  v_def := pg_get_functiondef('public.my_work_counts(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_exec_anchor, ''))) / length(v_exec_anchor) <> 1 THEN
    RAISE EXCEPTION 'my_work_counts: ancla itrs_execute no encontrada o repetida';
  END IF;
  IF (length(v_def) - length(replace(v_def, v_rev_anchor, ''))) / length(v_rev_anchor) <> 1 THEN
    RAISE EXCEPTION 'my_work_counts: ancla itrs_review no encontrada o repetida';
  END IF;
  EXECUTE replace(replace(v_def, v_exec_anchor, v_exec_new), v_rev_anchor, v_rev_new);
END;
$patch$;
