-- Disposable harness only. No production connection.
CREATE FUNCTION public.test_id(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION public.is_project_member(p_project_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.projects p JOIN public.org_members m ON m.org_id=p.org_id WHERE p.id=p_project_id AND m.user_id=auth.uid()) $$;
INSERT INTO public.projects(id,org_id,name,code) VALUES(test_id(2),test_id(1),'Local test','TEST');
INSERT INTO public.org_members(org_id,user_id,role) VALUES(test_id(1),test_id(101),'inspector'),(test_id(1),test_id(102),'inspector'),(test_id(1),test_id(103),'client'),(test_id(1),test_id(104),'owner');
INSERT INTO public.project_phases(id,org_id,code,name,order_index) VALUES(test_id(3),test_id(1),'A','Construction',0);
INSERT INTO public.systems(id,area_id,project_id,name,code) VALUES(test_id(5),test_id(4),test_id(2),'System','S');
INSERT INTO public.subsystems(id,system_id,project_id,name,code) VALUES(test_id(6),test_id(5),test_id(2),'Subsystem','SS');
INSERT INTO public.tags(id,subsystem_id,project_id,discipline_id,tag_number,description) VALUES(test_id(7),test_id(6),test_id(2),test_id(20),'PT-001','Test');
INSERT INTO public.itr_templates(id,org_id,discipline_id,phase_id,code,title) VALUES(test_id(8),test_id(1),test_id(20),test_id(3),'TEST-A','Test');
INSERT INTO public.itr_template_sections(id,template_id,title,order_index) VALUES(test_id(9),test_id(8),'Data',0);
INSERT INTO public.itr_template_items(id,template_id,section_id,description,item_type,order_index) VALUES(test_id(10),test_id(8),test_id(9),'Required text','text',0);
INSERT INTO public.itrs(id,template_id,tag_id,subsystem_id,project_id,phase_id,itr_number) VALUES(test_id(11),test_id(8),test_id(7),test_id(6),test_id(2),test_id(3),'TEST-A/PT-001');
INSERT INTO public.itr_assignments(itr_id,user_id,role) VALUES(test_id(11),test_id(101),'executor'),(test_id(11),test_id(102),'supervisor'),(test_id(11),test_id(103),'client');
INSERT INTO public.itr_responses(id,itr_id,item_id,value_text) VALUES(test_id(12),test_id(11),test_id(10),'Complete');
INSERT INTO storage.objects(bucket_id,name) VALUES('itr-attachments','test-evidence');
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_storage_access ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['itrs','itr_responses','itr_attachments','itr_assignments','itr_signatures'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 IF t='itrs' THEN EXECUTE format('CREATE POLICY fixture_access ON public.%I FOR ALL TO authenticated USING(public.is_project_member(project_id)) WITH CHECK(public.is_project_member(project_id))',t);
 ELSE EXECUTE format('CREATE POLICY fixture_access ON public.%I FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.itrs i WHERE i.id=itr_id AND public.is_project_member(i.project_id))) WITH CHECK(EXISTS(SELECT 1 FROM public.itrs i WHERE i.id=itr_id AND public.is_project_member(i.project_id)))',t); END IF;
 END LOOP;
END $$;
