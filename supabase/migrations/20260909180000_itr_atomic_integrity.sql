-- Integration candidate, not an applied migration. PostgreSQL 16+.
-- The caller must also enforce assignments, signatures and transaction locking.
CREATE OR REPLACE FUNCTION public.evaluate_itr_capture(p_itr_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
WITH RECURSIVE
items AS MATERIALIZED (
  SELECT i.*, r.value_text, r.value_numeric, r.value_bool, r.value_option,
    CASE WHEN i.item_type::text='measurement' AND r.value_numeric IS NOT NULL
      AND (i.acceptance_min IS NOT NULL OR i.acceptance_max IS NOT NULL)
      THEN r.value_numeric::text NOT IN ('NaN','Infinity','-Infinity')
        AND (i.acceptance_min IS NULL OR r.value_numeric>=i.acceptance_min)
        AND (i.acceptance_max IS NULL OR r.value_numeric<=i.acceptance_max)
      ELSE r.is_passed END AS is_passed,
    CASE i.item_type::text
      WHEN 'checkbox' THEN r.value_bool::text
      WHEN 'yes_no' THEN r.value_bool::text
      WHEN 'number' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'measurement' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'select' THEN r.value_option
      ELSE r.value_text
    END AS condition_actual,
    COALESCE(r.value_numeric IS NOT NULL AND r.value_numeric::text NOT IN ('NaN', 'Infinity', '-Infinity'), false) AS finite_number,
    EXISTS (
      SELECT 1 FROM public.itr_attachments a
      WHERE a.itr_id = p_itr_id AND a.item_id = i.id
        AND a.file_url ~ '[^[:space:]]' AND a.file_type LIKE 'image/%'
    ) AS has_photo
  FROM public.itrs itr
  JOIN public.itr_template_items i ON i.template_id = itr.template_id
  LEFT JOIN public.itr_responses r ON r.itr_id = itr.id AND r.item_id = i.id
  WHERE itr.id = p_itr_id
),
-- Walk every ancestor even after a false condition, so invalid graphs cannot
-- silently hide a required branch. Path bounds traversal in cyclic graphs.
walk AS (
  SELECT i.id AS origin, i.id, i.condition_item_id, i.condition_value,
    ARRAY[i.id] AS path, true AS matches
  FROM items i
  UNION ALL
  SELECT w.origin, p.id, p.condition_item_id, p.condition_value,
    w.path || p.id,
    w.matches AND COALESCE(p.condition_actual = w.condition_value, false)
  FROM walk w
  JOIN items p ON p.id = w.condition_item_id
  WHERE NOT p.id = ANY(w.path)
),
visibility AS (
  SELECT w.origin,
    bool_or(w.condition_item_id IS NOT NULL AND (
      w.condition_value IS NULL OR w.condition_item_id = ANY(w.path)
      OR NOT EXISTS (SELECT 1 FROM items p WHERE p.id = w.condition_item_id)
    )) AS invalid,
    bool_and(w.matches) AND bool_or(w.condition_item_id IS NULL) AS applicable
  FROM walk w GROUP BY w.origin
),
evaluated AS (
  SELECT i.id, i.is_required, i.is_critical, i.is_passed,
    v.invalid, v.applicable AND NOT v.invalid AS applicable,
    COALESCE(
      (NOT i.requires_photo OR i.has_photo)
      AND (NOT i.requires_measurement OR i.finite_number)
      AND CASE i.item_type::text
        WHEN 'text' THEN i.value_text ~ '[^[:space:]]'
        WHEN 'number' THEN i.finite_number
        WHEN 'measurement' THEN i.finite_number
        WHEN 'checkbox' THEN i.value_bool IS NOT NULL
        WHEN 'yes_no' THEN i.value_bool IS NOT NULL
        WHEN 'select' THEN i.value_option ~ '[^[:space:]]'
          AND pg_catalog.jsonb_typeof(i.options) = 'array'
          AND i.options @> pg_catalog.jsonb_build_array(i.value_option)
        WHEN 'date' THEN i.value_text ~ '^\d{4}-\d{2}-\d{2}$'
          AND pg_catalog.pg_input_is_valid(i.value_text, 'date')
        WHEN 'photo' THEN i.has_photo
        ELSE false -- Item-level signature capture is not implemented.
      END, false
    ) AS filled
  FROM items i JOIN visibility v ON v.origin = i.id
),
counts AS (
  SELECT count(*) FILTER (WHERE applicable) AS applicable_count,
    count(*) FILTER (WHERE applicable AND is_required) AS required_count,
    count(*) FILTER (WHERE applicable AND filled) AS completed_count,
    count(*) FILTER (WHERE applicable AND is_required AND filled) AS completed_required_count,
    count(*) FILTER (WHERE invalid) AS invalid_count,
    COALESCE(bool_or(applicable AND is_critical AND is_passed IS FALSE), false) AS has_critical_fail,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable), '[]'::jsonb) AS applicable_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE invalid), '[]'::jsonb) AS invalid_condition_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable AND is_required AND NOT filled), '[]'::jsonb) AS missing_required_item_ids
  FROM evaluated
), result AS (
  SELECT *, applicable_count > 0 AND invalid_count = 0
    AND completed_required_count = required_count AS is_complete FROM counts
)
SELECT pg_catalog.jsonb_build_object(
  'is_complete', is_complete,
  'progress_pct', CASE WHEN is_complete THEN 100 WHEN required_count > 0
    THEN LEAST(99, FLOOR(completed_required_count::numeric * 100 / required_count)) ELSE 0 END,
  'has_critical_fail', has_critical_fail,
  'applicable_count', applicable_count,
  'required_count', required_count,
  'completed_count', completed_count,
  'completed_required_count', completed_required_count,
  'applicable_item_ids', applicable_item_ids,
  'invalid_condition_item_ids', invalid_condition_item_ids,
  'missing_required_item_ids', missing_required_item_ids
) FROM result;
$function$;

-- No anonymous RPC. SECURITY INVOKER retains table RLS for authenticated callers.
REVOKE ALL ON FUNCTION public.evaluate_itr_capture(uuid) FROM PUBLIC;
-- Deployment grants belong to the migration and require the Supabase roles:
-- GRANT EXECUTE ON FUNCTION public.evaluate_itr_capture(uuid) TO authenticated, service_role;

-- evaluate_itr_capture(uuid) is installed immediately before this block.
-- No user-controlled transaction flags bypass these invariants.
CREATE OR REPLACE FUNCTION public.guard_itr_content() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.itrs; target uuid; item_template uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.itr_id IS DISTINCT FROM OLD.itr_id THEN
    RAISE EXCEPTION 'Cannot move ITR content between records';
  END IF;
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.itr_id ELSE NEW.itr_id END;
  SELECT * INTO v FROM public.itrs WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN
    -- Parent deletion has already passed guard_itr_row; allow its unsigned cascade.
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'ITR unavailable';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'Project membership required'; END IF;
  IF v.status = 'approved' OR EXISTS (SELECT 1 FROM public.itr_signatures WHERE itr_id = target) THEN
    RAISE EXCEPTION 'Signed ITR requires audited reopening';
  END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME IN ('itr_responses','itr_attachments') THEN
    IF NEW.item_id IS NOT NULL THEN
      SELECT template_id INTO item_template FROM public.itr_template_items WHERE id = NEW.item_id;
      IF item_template IS DISTINCT FROM v.template_id THEN RAISE EXCEPTION 'Item does not belong to assigned revision'; END IF;
    END IF;
    IF TG_TABLE_NAME = 'itr_attachments' THEN
      IF NEW.file_url NOT LIKE target::text || '/%' OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='itr-attachments' AND o.name=NEW.file_url) THEN
        RAISE EXCEPTION 'Evidence object must exist in this ITR storage path';
      END IF;
      IF NEW.response_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.itr_responses r WHERE r.id = NEW.response_id AND r.itr_id = target AND r.item_id IS NOT DISTINCT FROM NEW.item_id) THEN
        RAISE EXCEPTION 'Attachment response mismatch';
      END IF;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'itr_assignments' THEN
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members m JOIN public.projects p ON p.org_id = m.org_id WHERE p.id = v.project_id AND m.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'Assigned user is not a project organization member'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER itr_responses_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.itr_responses FOR EACH ROW EXECUTE FUNCTION public.guard_itr_content();
CREATE TRIGGER itr_attachments_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.itr_attachments FOR EACH ROW EXECUTE FUNCTION public.guard_itr_content();
CREATE TRIGGER itr_assignments_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.itr_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_itr_content();

-- Invoker context deliberately distinguishes the privileged RPC owner from API users.
CREATE OR REPLACE FUNCTION public.guard_itr_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE trusted boolean; tpl_org uuid; project_org uuid;
BEGIN
  trusted := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.itrs'::regclass));
  IF TG_OP <> 'INSERT' THEN
    IF TG_OP = 'UPDATE' AND (NEW.template_id,NEW.project_id,NEW.tag_id,NEW.subsystem_id,NEW.phase_id,NEW.itr_number) IS DISTINCT FROM (OLD.template_id,OLD.project_id,OLD.tag_id,OLD.subsystem_id,OLD.phase_id,OLD.itr_number) THEN
      RAISE EXCEPTION 'ITR identity and assigned revision are immutable';
    END IF;
    IF NOT trusted AND (OLD.status = 'approved' OR EXISTS (SELECT 1 FROM public.itr_signatures WHERE itr_id = OLD.id)) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'approved' OR EXISTS (SELECT 1 FROM public.itr_signatures WHERE itr_id = OLD.id) THEN RAISE EXCEPTION 'Cannot delete signed ITR'; END IF;
      RETURN OLD;
    END IF;
  ELSE
    SELECT org_id INTO tpl_org FROM public.itr_templates WHERE id = NEW.template_id FOR UPDATE;
    SELECT org_id INTO project_org FROM public.projects WHERE id = NEW.project_id;
    IF tpl_org IS NULL OR (tpl_org IS DISTINCT FROM project_org AND NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND is_global)) THEN RAISE EXCEPTION 'Template organization mismatch'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.subsystems s JOIN public.systems sy ON sy.id=s.system_id WHERE s.id=NEW.subsystem_id AND sy.project_id=NEW.project_id) THEN RAISE EXCEPTION 'Subsystem project mismatch'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND phase_id=NEW.phase_id) THEN RAISE EXCEPTION 'Phase revision mismatch'; END IF;
    IF NEW.tag_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tags WHERE id=NEW.tag_id AND project_id=NEW.project_id) THEN RAISE EXCEPTION 'Tag project mismatch'; END IF;
  END IF;
  IF NOT trusted AND NEW.status='approved' THEN RAISE EXCEPTION 'Approval requires atomic signing'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER itrs_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.itrs FOR EACH ROW EXECUTE FUNCTION public.guard_itr_row();

CREATE OR REPLACE FUNCTION public.guard_assigned_itr_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid uuid;
BEGIN
  IF TG_TABLE_NAME='itr_templates' THEN tid:=OLD.id;
  ELSE
    tid:=CASE WHEN TG_OP='DELETE' THEN OLD.template_id ELSE NEW.template_id END;
    IF TG_OP='UPDATE' AND NEW.template_id IS DISTINCT FROM OLD.template_id THEN RAISE EXCEPTION 'Cannot move template content'; END IF;
  END IF;
  PERFORM 1 FROM public.itr_templates WHERE id=tid FOR UPDATE;
  IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.itr_templates t JOIN public.org_members m ON m.org_id=t.org_id WHERE t.id=tid AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','architect','leader')) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;
  IF EXISTS(SELECT 1 FROM public.itrs WHERE template_id=tid) THEN
    IF TG_TABLE_NAME='itr_templates' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'is_active')=(to_jsonb(OLD)-'is_active') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Assigned revision is immutable; publish a new revision';
  END IF;
  IF TG_TABLE_NAME='itr_template_items' AND TG_OP<>'DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM public.itr_template_sections WHERE id=NEW.section_id AND template_id=NEW.template_id) THEN RAISE EXCEPTION 'Section revision mismatch'; END IF;
    IF NEW.condition_item_id IS NOT NULL AND (NEW.condition_item_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.itr_template_items WHERE id=NEW.condition_item_id AND template_id=NEW.template_id)) THEN RAISE EXCEPTION 'Condition revision mismatch'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER itr_template_frozen BEFORE UPDATE OR DELETE ON public.itr_templates FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_itr_template();
CREATE TRIGGER itr_items_frozen BEFORE INSERT OR UPDATE OR DELETE ON public.itr_template_items FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_itr_template();
CREATE TRIGGER itr_sections_frozen BEFORE INSERT OR UPDATE OR DELETE ON public.itr_template_sections FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_itr_template();

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.itr_signatures FROM PUBLIC,authenticated,anon,service_role;
CREATE OR REPLACE FUNCTION public.sign_itr_atomic(p_itr_id uuid,p_role text,p_signature_image text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.itrs; e jsonb; roles text[]:=ARRAY['executor','supervisor','client']; uid uuid:=auth.uid(); org uuid; result_status text;
BEGIN
 SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
 IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
 SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
 IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
 IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
 IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
 IF EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=p_itr_id AND NOT EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=p_itr_id AND a.role=s.role AND a.user_id=s.user_id)) THEN RAISE EXCEPTION 'Existing signature assignment mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(roles[1:array_position(roles,p_role)-1]) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN RAISE EXCEPTION 'Previous signature required'; END IF;
 e:=public.evaluate_itr_capture(p_itr_id);
 IF NOT COALESCE((e->>'is_complete')::boolean,false) OR COALESCE((e->>'has_critical_fail')::boolean,true) THEN RAISE EXCEPTION 'Applicable content incomplete or rejected'; END IF;
 INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
 result_status:=CASE WHEN (SELECT count(DISTINCT role) FROM public.itr_signatures WHERE itr_id=p_itr_id)=3 THEN 'approved' ELSE 'completed' END;
 UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=CURRENT_DATE WHERE id=p_itr_id;
 INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
 IF result_status='approved' THEN
 UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
 INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
 END IF;
 RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $$;
CREATE OR REPLACE FUNCTION public.reopen_itr_atomic(p_itr_id uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.itrs; uid uuid:=auth.uid(); org uuid; signatures jsonb; n integer;
BEGIN
 SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
 IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
 SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
 IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid AND role::text IN ('owner','admin','architect')) THEN RAISE EXCEPTION 'Privileged role required'; END IF;
 IF length(trim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Reopening reason required'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::jsonb),count(*) INTO signatures,n FROM public.itr_signatures s WHERE itr_id=p_itr_id;
 IF n=0 AND v.status<>'approved' THEN RAISE EXCEPTION 'No signatures to revoke'; END IF;
 INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'revoked',jsonb_build_object('reason',trim(p_reason),'previousStatus',v.status,'previousSignatures',signatures,'template_id',v.template_id,
   'responses',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.itr_responses r WHERE r.itr_id=p_itr_id),'[]'::jsonb),
   'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.itr_attachments a WHERE a.itr_id=p_itr_id),'[]'::jsonb)));
 DELETE FROM public.itr_signatures WHERE itr_id=p_itr_id;
 UPDATE public.itrs SET status=CASE WHEN v.status='approved' THEN 'completed'::public.itr_status ELSE v.status END WHERE id=p_itr_id;
 RETURN jsonb_build_object('revoked_count',n,'previous_signatures',signatures,'project_id',v.project_id,'tag_id',v.tag_id,'itr_number',v.itr_number);
END $$;
REVOKE ALL ON FUNCTION public.sign_itr_atomic(uuid,text,text),public.reopen_itr_atomic(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sign_itr_atomic(uuid,text,text),public.reopen_itr_atomic(uuid,text) TO authenticated;

-- Restrictive policies supplement existing bucket access; they never grant access.
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
 EXECUTE 'CREATE POLICY itr_evidence_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (bucket_id <> ''itr-attachments'') WITH CHECK (bucket_id <> ''itr-attachments'')';
 EXECUTE 'CREATE POLICY itr_evidence_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (bucket_id <> ''itr-attachments'')';
 END IF;
END $$;
