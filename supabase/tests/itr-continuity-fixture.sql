-- Run in an EMPTY disposable database, never production. Transaction rolls back.
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
\ir ../migrations/20260909220000_itr_continuity_capture.sql
DO $test$
DECLARE
 d jsonb := '{"version":1,"grouping":"conductors","count":1,"shields":[],"measurementRequired":false,"rows":[{"id":"C1","from":"TB1:1","to":"TB2:1","result":"pass"}]}';
 p jsonb; value text; result jsonb;
 itr uuid := '00000000-0000-0000-0000-000000000001';
 tpl uuid := '00000000-0000-0000-0000-000000000002';
 item uuid := '00000000-0000-0000-0000-000000000003';
BEGIN
 ASSERT (public.evaluate_itr_continuity(d::text)->>'is_complete')::boolean, 'conductor valid';
 FOREACH value IN ARRAY ARRAY[NULL,'','{','null','[]','true','1','{"version":1}', '{"count":1e9999999}', E'{"value":"\\u0000"}', E'{"value":"\\ud800"}'] LOOP
   ASSERT NOT (public.evaluate_itr_continuity(value)->>'is_complete')::boolean, 'malformed rejected without exception';
 END LOOP;
 ASSERT NOT (public.evaluate_itr_continuity((d||'{"count":1.5}')::text)->>'is_complete')::boolean, 'fractional count';
 ASSERT NOT (public.evaluate_itr_continuity((d||'{"count":501}')::text)->>'is_complete')::boolean, 'count maximum';
 ASSERT NOT (public.evaluate_itr_continuity((d||'{"rows":[]}')::text)->>'is_complete')::boolean, 'missing row';
 ASSERT NOT (public.evaluate_itr_continuity(jsonb_set(d,'{rows}',(d->'rows')||(d->'rows'))::text)->>'is_complete')::boolean, 'duplicate';
 ASSERT NOT (public.evaluate_itr_continuity(jsonb_set(d,'{rows,0,id}','"C2"')::text)->>'is_complete')::boolean, 'extra row';
 ASSERT NOT (public.evaluate_itr_continuity(jsonb_set(d,'{rows,0,from}','null')::text)->>'is_complete')::boolean, 'terminal type';
 ASSERT NOT (public.evaluate_itr_continuity(jsonb_set(d,'{rows,0,from}',to_jsonb(chr(160)||chr(65279)))::text)->>'is_complete')::boolean, 'Unicode whitespace like JS trim';
 p := jsonb_set(d,'{rows,0,result}','"not_applicable"');
 ASSERT NOT (public.evaluate_itr_continuity(p::text)->>'is_complete')::boolean, 'NA justification';
 p := jsonb_set(p,'{rows,0,remarks}','"Spare"');
 ASSERT (public.evaluate_itr_continuity(p::text)->>'is_complete')::boolean, 'NA justified';
 ASSERT (public.evaluate_itr_continuity((p||'{"measurementRequired":true}')::text)->>'is_complete')::boolean, 'NA no measurement';
 p := d||'{"measurementRequired":true}';
 ASSERT NOT (public.evaluate_itr_continuity(p::text)->>'is_complete')::boolean, 'reading required';
 p := jsonb_set(jsonb_set(p,'{rows,0,reading}','0'),'{rows,0,unit}','"ohm"');
 ASSERT (public.evaluate_itr_continuity(p::text)->>'is_complete')::boolean, 'zero valid';
 ASSERT (public.evaluate_itr_continuity(jsonb_set(p,'{rows,0,reading}','1e-400')::text)->>'is_complete')::boolean, 'underflow is finite like JS';
 FOREACH value IN ARRAY ARRAY['"0"','"NaN"','null','true','1e400'] LOOP
   ASSERT NOT (public.evaluate_itr_continuity(jsonb_set(p,'{rows,0,reading}',value::jsonb)::text)->>'is_complete')::boolean, 'reading type or overflow';
 END LOOP;
 p := '{"version":1,"grouping":"pairs","count":1,"shields":["overall"],"measurementRequired":false,"rows":[{"id":"P1-A","from":"1","to":"1","result":"pass"},{"id":"P1-B","from":"2","to":"2","result":"pass"},{"id":"S:overall","from":"S","to":"S","result":"pass"}]}';
 ASSERT (public.evaluate_itr_continuity(p::text)->>'is_complete')::boolean, 'pair and shield';
 ASSERT NOT (public.evaluate_itr_continuity((p||'{"shields":["overall","overall"]}')::text)->>'is_complete')::boolean, 'duplicate shield';
 INSERT INTO public.itrs VALUES(itr,tpl);
 INSERT INTO public.itr_template_items(id,template_id,item_type) VALUES(item,tpl,'continuity');
 INSERT INTO public.itr_responses(itr_id,item_id,value_text) VALUES(itr,item,d::text);
 ASSERT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'integrated complete';
 UPDATE public.itr_responses SET value_text=jsonb_set(d,'{rows,0,result}','"fail"')::text,is_passed=true;
 result := public.evaluate_itr_capture(itr);
 ASSERT (result->>'is_complete')::boolean AND (result->>'has_critical_fail')::boolean, 'noncritical fail blocks regardless client pass';
 UPDATE public.itr_responses SET value_text=(d||'{"rows":[]}')::text;
 ASSERT NOT (public.evaluate_itr_capture(itr)->>'is_complete')::boolean, 'integrated incomplete';
END;
$test$;
ROLLBACK;
