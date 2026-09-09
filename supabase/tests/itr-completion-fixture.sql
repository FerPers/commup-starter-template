-- Run only in an EMPTY disposable database, never in production.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/itr-completion-fixture.sql
BEGIN;
CREATE TABLE public.itrs (id uuid PRIMARY KEY, template_id uuid NOT NULL);
CREATE TABLE public.itr_template_items (
 id uuid PRIMARY KEY, template_id uuid NOT NULL, item_type text NOT NULL DEFAULT 'text',
 is_required boolean NOT NULL DEFAULT true, is_critical boolean NOT NULL DEFAULT false,
 requires_photo boolean NOT NULL DEFAULT false, requires_measurement boolean NOT NULL DEFAULT false,
 option_outcomes jsonb NOT NULL DEFAULT '{}', options jsonb, condition_item_id uuid, condition_value text, acceptance_min numeric, acceptance_max numeric
);
CREATE TABLE public.itr_responses (
 itr_id uuid NOT NULL, item_id uuid NOT NULL, value_text text, value_numeric numeric,
 value_bool boolean, value_option text, remarks text, is_passed boolean, UNIQUE(itr_id,item_id)
);
CREATE TABLE public.itr_attachments (itr_id uuid NOT NULL, item_id uuid, file_url text, file_type text);
\ir itr-completion-function.sql
INSERT INTO public.itrs VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
DO $test$
DECLARE
 itr uuid := '00000000-0000-0000-0000-000000000001';
 tpl uuid := '00000000-0000-0000-0000-000000000002';
 a uuid := '00000000-0000-0000-0000-000000000003';
 b uuid := '00000000-0000-0000-0000-000000000004';
 c uuid := '00000000-0000-0000-0000-000000000005';
 r jsonb;
BEGIN
 r := public.evaluate_itr_capture(itr);
 ASSERT (r->>'is_complete')::boolean IS FALSE, 'empty template';
 INSERT INTO public.itr_template_items(id,template_id) SELECT md5(n::text)::uuid,tpl FROM generate_series(1,200) n;
 INSERT INTO public.itr_responses(itr_id,item_id,value_text) SELECT itr,md5(n::text)::uuid,CASE WHEN n=200 THEN '  ' ELSE 'ok' END FROM generate_series(1,200) n;
 r := public.evaluate_itr_capture(itr);
 ASSERT r->>'progress_pct'='99' AND (r->>'is_complete')::boolean IS FALSE, '199/200 must not complete';
 DELETE FROM public.itr_responses; DELETE FROM public.itr_template_items;
 INSERT INTO public.itr_template_items(id,template_id,item_type) VALUES (a,tpl,'measurement'),(b,tpl,'yes_no');
 INSERT INTO public.itr_responses(itr_id,item_id,value_numeric) VALUES (itr,a,0);
 INSERT INTO public.itr_responses(itr_id,item_id,value_bool) VALUES (itr,b,false);
 ASSERT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'zero and false are filled';
 UPDATE public.itr_responses SET value_numeric='NaN' WHERE item_id=a;
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'NaN missing';
 DELETE FROM public.itr_responses; DELETE FROM public.itr_template_items;
 INSERT INTO public.itr_template_items(id,template_id,item_type) VALUES (a,tpl,'yes_no');
 INSERT INTO public.itr_template_items(id,template_id,condition_item_id,condition_value,is_critical) VALUES (b,tpl,a,'true',true),(c,tpl,b,'yes',true);
 INSERT INTO public.itr_responses(itr_id,item_id,value_bool) VALUES (itr,a,false);
 INSERT INTO public.itr_responses(itr_id,item_id,value_text,is_passed) VALUES (itr,b,'yes',false),(itr,c,'stale',false);
 r := public.evaluate_itr_capture(itr);
 ASSERT (r->>'is_complete')::boolean AND r->>'applicable_count'='1' AND NOT (r->>'has_critical_fail')::boolean, 'hidden descendants and hidden failures';
 UPDATE public.itr_template_items SET condition_item_id=c,condition_value='stale' WHERE id=a;
 r := public.evaluate_itr_capture(itr);
 ASSERT NOT (r->>'is_complete')::boolean AND jsonb_array_length(r->'invalid_condition_item_ids')=3, 'cycles fail closed';
 UPDATE public.itr_template_items SET condition_item_id=tpl WHERE id=a;
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'missing reference fails closed';
 DELETE FROM public.itr_responses; DELETE FROM public.itr_template_items;
 INSERT INTO public.itr_template_items(id,template_id,item_type,requires_photo,requires_measurement) VALUES (a,tpl,'text',true,true);
 INSERT INTO public.itr_responses(itr_id,item_id,value_text,value_numeric) VALUES (itr,a,'ok',0);
 INSERT INTO public.itr_attachments VALUES (itr,NULL,'general','image/jpeg');
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'general photo does not satisfy item';
 INSERT INTO public.itr_attachments VALUES (itr,a,'item','image/jpeg');
 ASSERT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'item evidence';
 UPDATE public.itr_template_items SET item_type='select',requires_photo=false,requires_measurement=false,options='["Aceptado","Rechazado"]'::jsonb;
 UPDATE public.itr_responses SET value_option='Rechazado';
 ASSERT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'rejection is captured not auto interpreted';
 UPDATE public.itr_responses SET value_option='unknown';
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'invalid select';
 UPDATE public.itr_template_items SET item_type='date';
 UPDATE public.itr_responses SET value_text='2026-02-30';
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'impossible date';
 UPDATE public.itr_responses SET value_text='2024-02-29';
 ASSERT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'leap date';
 UPDATE public.itr_template_items SET item_type='signature';
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'unsupported signature';
 UPDATE public.itr_template_items SET is_required=false;
 ASSERT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'optional does not block';
 UPDATE public.itr_template_items SET item_type='measurement',is_required=true,is_critical=true,acceptance_min=0,acceptance_max=10;
 UPDATE public.itr_responses SET value_numeric=20,is_passed=true;
 ASSERT (public.evaluate_itr_capture(itr)->>'has_critical_fail')::boolean, 'numeric bounds must not trust submitted acceptance';
 UPDATE public.itr_template_items SET item_type='select',is_critical=false,options='["X","NA","No"]',option_outcomes='{"X":"fail","NA":"not_applicable"}';
 UPDATE public.itr_responses SET value_option='NA',remarks=NULL;
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'NA needs justification';
 UPDATE public.itr_responses SET remarks='Not in scope';
 ASSERT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'NA justified';
 UPDATE public.itr_responses SET value_option='X',is_passed=true;
 ASSERT (public.evaluate_itr_capture(itr)->>'has_critical_fail')::boolean, 'Explicit fail blocks even noncritical';
 UPDATE public.itr_responses SET value_option='No',is_passed=false;
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'has_critical_fail')::boolean, 'Neutral selection has no textual effect';
 RAISE NOTICE 'ITR capture SQL fixture: all assertions passed';
END;
$test$;
ROLLBACK;
