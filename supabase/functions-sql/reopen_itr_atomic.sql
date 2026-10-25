-- fn: public.reopen_itr_atomic(uuid, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.reopen_itr_atomic(p_itr_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; uid uuid:=auth.uid(); org uuid; signatures jsonb; n integer;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid AND role::text IN ('owner','admin','architect')) THEN RAISE EXCEPTION 'Privileged role required'; END IF;
IF length(trim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Reopening reason required'; END IF;
SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::jsonb),count(*) INTO signatures,n FROM public.itr_signatures s WHERE itr_id=p_itr_id;
IF n=0 AND v.status<>'approved' THEN RAISE EXCEPTION 'No signatures to revoke'; END IF;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'revoked',jsonb_build_object('reason',trim(p_reason),'previousStatus',v.status,'previousSignatures',signatures,'template_id',v.template_id,'responses',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.itr_responses r WHERE r.itr_id=p_itr_id),'[]'::jsonb),'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.itr_attachments a WHERE a.itr_id=p_itr_id),'[]'::jsonb)));
DELETE FROM public.itr_signatures WHERE itr_id=p_itr_id;
UPDATE public.itrs SET status=CASE WHEN v.status='approved' THEN 'completed'::public.itr_status ELSE v.status END,
  returned_at=NULL,returned_by=NULL,return_reason=NULL WHERE id=p_itr_id;
RETURN jsonb_build_object('revoked_count',n,'previous_signatures',signatures,'project_id',v.project_id,'tag_id',v.tag_id,'itr_number',v.itr_number);
END $function$;
