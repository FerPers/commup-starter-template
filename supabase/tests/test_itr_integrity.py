"""Disposable local PG17 integration tests. Never accepts a production URL."""
import subprocess, unittest, time
P=['/opt/homebrew/opt/postgresql@17/bin/psql','-X','-h','/tmp/commup-itr-pg-socket','-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-At']
def sql(s,user=None):
    if user: s=f"SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-{user:012}'; "+s
    return subprocess.run(P+['-c',s],capture_output=True,text=True)
def sign(user=101,role='executor'):
    return sql(f"SELECT public.sign_itr_atomic(public.test_id(11),'{role}',NULL)",user)
class Integrity(unittest.TestCase):
    def setUp(self):
        r=sql("DELETE FROM itr_signatures; UPDATE itr_responses SET value_text='Complete' WHERE id=test_id(12); UPDATE itrs SET status='not_started',progress_pct=0 WHERE id=test_id(11)")
        self.assertEqual(r.returncode,0,r.stderr)
    def ok(self,r): self.assertEqual(r.returncode,0,r.stderr)
    def denied(self,r): self.assertNotEqual(r.returncode,0,r.stdout)
    def test_direct_signature_denied(self):
        self.denied(sql("INSERT INTO itr_signatures(itr_id,user_id,role) VALUES(test_id(11),test_id(101),'executor')",101))
    def test_direct_approval_denied(self):
        self.denied(sql("UPDATE itrs SET status='approved' WHERE id=test_id(11)",101))
    def test_role_order_and_outsider(self):
        self.denied(sign(102,'supervisor'));self.denied(sign(102));self.denied(sign(105))
    def test_content_required(self):
        self.ok(sql("UPDATE itr_responses SET value_text='' WHERE id=test_id(12)"));self.denied(sign())
    def test_signed_content_assignment_delete_identity_blocked(self):
        self.ok(sign())
        for query in ["UPDATE itr_responses SET value_text='Changed' WHERE id=test_id(12)","DELETE FROM itr_responses WHERE id=test_id(12)","DELETE FROM itrs WHERE id=test_id(11)","UPDATE itr_assignments SET user_id=test_id(104) WHERE itr_id=test_id(11)","UPDATE itrs SET template_id=test_id(999) WHERE id=test_id(11)"]:
            self.denied(sql(query,104))
    def test_frozen_template(self):
        self.denied(sql("UPDATE itr_template_items SET description='Changed' WHERE id=test_id(10)",104))
        self.ok(sql("UPDATE itr_templates SET is_active=false WHERE id=test_id(8)",104))
    def test_three_signatures_and_reopen(self):
        self.ok(sign());self.ok(sign(102,'supervisor'));self.ok(sign(103,'client'))
        self.assertEqual(sql('SELECT status FROM itrs WHERE id=test_id(11)').stdout.strip(),'approved')
        self.denied(sql("SELECT reopen_itr_atomic(test_id(11),'Correction')",101))
        self.ok(sql("SELECT reopen_itr_atomic(test_id(11),'Correction')",104))
        self.assertEqual(sql('SELECT count(*) FROM itr_signatures').stdout.strip(),'0')
        self.ok(sql("UPDATE itr_responses SET value_text='Corrected' WHERE id=test_id(12)",101))
    def test_audit_failure_rolls_back_reopening(self):
        self.ok(sign())
        self.ok(sql("CREATE FUNCTION public.fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='revoked' THEN RAISE EXCEPTION 'Fixture audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_fail_audit BEFORE INSERT ON activity_log FOR EACH ROW EXECUTE FUNCTION fixture_fail_audit()"))
        try:
            self.denied(sql("SELECT reopen_itr_atomic(test_id(11),'Correction')",104))
            self.assertEqual(sql('SELECT count(*) FROM itr_signatures').stdout.strip(),'1')
        finally:self.ok(sql('DROP TRIGGER fixture_fail_audit ON activity_log; DROP FUNCTION fixture_fail_audit()'))
    def test_storage_delete_overwrite_denied(self):
        r=sql("DELETE FROM storage.objects WHERE bucket_id='itr-attachments' RETURNING id",101);self.ok(r);self.assertIn('DELETE 0',r.stdout)
        r=sql("UPDATE storage.objects SET name='overwritten' WHERE bucket_id='itr-attachments' RETURNING id",101);self.ok(r);self.assertIn('UPDATE 0',r.stdout)
    def test_reopen_preserves_content_snapshot(self):
        self.ok(sign());self.ok(sql("SELECT reopen_itr_atomic(test_id(11),'Snapshot check')",104))
        self.assertEqual(sql("SELECT payload->'responses'->0->>'value_text' FROM activity_log WHERE action='revoked' ORDER BY created_at DESC LIMIT 1").stdout.strip(),'Complete')
    def test_attachment_requires_existing_object_and_matching_item(self):
        self.denied(sql("INSERT INTO itr_attachments(itr_id,item_id,file_url,file_type,uploaded_by) VALUES(test_id(11),test_id(10),'missing','image/jpeg',test_id(101))",101))
        self.denied(sql("INSERT INTO itr_responses(itr_id,item_id,value_text) VALUES(test_id(11),test_id(999),'Wrong item')",101))
    def test_signed_attachment_is_blocked(self):
        self.ok(sql("INSERT INTO storage.objects(bucket_id,name) SELECT 'itr-attachments',test_id(11)::text||'/evidence' WHERE NOT EXISTS(SELECT 1 FROM storage.objects WHERE name=test_id(11)::text||'/evidence')"))
        self.ok(sign())
        self.denied(sql("INSERT INTO itr_attachments(itr_id,item_id,file_url,file_type,uploaded_by) VALUES(test_id(11),test_id(10),test_id(11)::text||'/evidence','image/jpeg',test_id(101))",101))
    def test_signature_then_concurrent_response(self):
        first=subprocess.Popen(P+['-c',"BEGIN; SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000101'; SELECT sign_itr_atomic(test_id(11),'executor',NULL); SELECT pg_sleep(1); COMMIT"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        time.sleep(.3)
        second=sql("UPDATE itr_responses SET value_text='Concurrent' WHERE id=test_id(12)",101)
        _,err=first.communicate();self.assertEqual(first.returncode,0,err);self.denied(second)
    def test_response_then_concurrent_signature(self):
        first=subprocess.Popen(P+['-c',"BEGIN; SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000101'; UPDATE itr_responses SET value_text='' WHERE id=test_id(12); SELECT pg_sleep(1); COMMIT"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        time.sleep(.3);second=sign();_,err=first.communicate();self.assertEqual(first.returncode,0,err);self.denied(second)
if __name__=='__main__':unittest.main(verbosity=2)
