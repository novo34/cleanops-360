"""Offline static checks only. Does not connect to PostgreSQL, install or execute SQL."""
from pathlib import Path
import unittest,json,re,csv,io,yaml
from jsonschema import Draft202012Validator,RefResolver
R=Path(__file__).parent
class ClosureChecks(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.doc=yaml.safe_load((R/'block-1.openapi.yaml').read_text());cls.sql=(R/'b1-review-only.sql').read_text();cls.values=yaml.safe_load((R/'security-values.yaml').read_text())['values']
 def validator(self,n):return Draft202012Validator(self.doc['components']['schemas'][n],resolver=RefResolver.from_schema(self.doc))
 def test_thirteen_and_no_admin(self):
  ops=[o['operationId'] for p in self.doc['paths'].values() for o in p.values()]
  self.assertEqual(len(ops),13);self.assertEqual(len(set(ops)),13)
  self.assertFalse(any(p.startswith(('/admin','/users','/access','/api/system-status')) for p in self.doc['paths']))
 def test_refs_and_schemas(self):
  def visit(x):
   if isinstance(x,dict):
    if '$ref' in x:
     z=self.doc
     for k in x['$ref'][2:].split('/'):z=z[k]
    for v in x.values():visit(v)
   elif isinstance(x,list):
    for v in x:visit(v)
  visit(self.doc)
  for s in self.doc['components']['schemas'].values():Draft202012Validator.check_schema(s)
 def test_every_string_bounded_or_constant(self):
  def visit(x):
   if isinstance(x,dict):
    if x.get('type')=='string':self.assertTrue('maxLength' in x or 'const' in x,x)
    for v in x.values():visit(v)
   elif isinstance(x,list):
    for v in x:visit(v)
  visit(self.doc['components']['schemas'])
 def test_unknown_foreign_selectors_rejected(self):
  v=self.validator('Reason');self.assertTrue(v.is_valid({'reason':'self'}))
  for key in ['tenant_id','user_id','principal_id','session_ids']:self.assertFalse(v.is_valid({'reason':'self',key:'forged'}))
  self.assertFalse(v.is_valid({'reason':'x'*501}))
 def test_credentials_and_codes_limits(self):
  v=self.validator('LoginInput');self.assertTrue(v.is_valid({'email':'a@example.test','password':'a'*12}))
  self.assertFalse(v.is_valid({'email':'a@example.test','password':'a'*129}))
  self.assertFalse(v.is_valid({'email':'a@example.test','password':'a'*12,'role':'Super Admin'}))
  otp=self.validator('MfaVerifyInput');p={'challenge_id':'00000000-0000-0000-0000-000000000001','method':'TOTP','proof':'123456'}
  self.assertTrue(otp.is_valid(p));p['proof']='12345';self.assertFalse(otp.is_valid(p))
 def test_stepup_binding(self):
  v=self.validator('StepUpInput');self.assertFalse(v.is_valid({'grant_id':'B1-SELF-08'}))
  self.assertTrue(v.is_valid({'grant_id':'B1-SELF-08','resource_id':'00000000-0000-0000-0000-000000000001'}))
  self.assertFalse(v.is_valid({'grant_id':'B1-SELF-04','resource_id':'00000000-0000-0000-0000-000000000001'}))
 def test_methods_csrf_and_path_parameters(self):
  for path,item in self.doc['paths'].items():
   for method,o in item.items():
    self.assertEqual(set(re.findall(r'{(.*?)}',path)),{p['name'] for p in o['parameters'] if p['in']=='path'})
    if method!='get':self.assertTrue(any(p['name']=='X-CSRF-Token' and p['required'] for p in o['parameters']))
    self.assertIn('413',o['responses']);self.assertIn('429',o['responses'])
 def test_approved_values_not_changed_or_invented(self):
  actual={x['key']:x['value'] for x in self.values if x['status']=='APPROVED'}
  self.assertEqual(actual,{'email_otp_ttl':300,'idle_sensitive':1800,'idle_operational':28800,'trusted_device_max':2592000,'password_hash':'Argon2id'})
  self.assertTrue(all(x['status'] in ['APPROVED','PROPOSED_BENCHMARK_REQUIRED'] for x in self.values))
 def test_rules_approved_functional_not_active(self):
  data=list(csv.DictReader(io.StringIO((R/'block-1-grants-functional-approved.csv').read_text())))
  self.assertEqual(len(data),8)
  self.assertTrue(all(x['approval_status']=='APPROVED_FUNCTIONAL_NOT_ACTIVE' and x['effective_decision']=='DENY' for x in data))
  self.assertFalse(self.doc['x-access-activation'])
 def test_sql_dollar_quotes_and_transaction(self):
  self.assertEqual(self.sql.count('$fn$')%2,0)
  self.assertEqual(self.sql.count('BEGIN;'),1);self.assertTrue(self.sql.rstrip().endswith('COMMIT;'))
  for tag in set(re.findall(r'(?:AS|DO)\s+(\$[A-Za-z_][A-Za-z_0-9]*\$)',self.sql)):self.assertEqual(self.sql.count(tag)%2,0,tag)
 def test_sql_all_custom_callees_defined(self):
  defined=set(re.findall(r'CREATE FUNCTION ((?:auth_api|identity_private)\.\w+)\(',self.sql))
  called=set(re.findall(r'((?:auth_api|identity_private)\.\w+)\(',self.sql))
  tables=set(re.findall(r'CREATE TABLE ((?:app|identity_private)\.\w+)\s*\(',self.sql))
  self.assertFalse(called-defined-tables,called-defined-tables)
 def test_sql_all_tables_policy_covered(self):
  tables=re.findall(r'CREATE TABLE ((?:app|identity_private)\.\w+)\s*\(',self.sql)
  self.assertEqual(len(tables),21)
  # Loop arrays are deliberately literal inventories, not discovered at deployment.
  for full in tables:
   schema,n=full.split('.')
   self.assertTrue("'"+n+"'" in self.sql or full=='app.organizations',full)
  self.assertIn('ENABLE ROW LEVEL SECURITY',self.sql);self.assertIn('FORCE ROW LEVEL SECURITY',self.sql)
  self.assertIn('WITH CHECK',self.sql);self.assertIn('runtime_tenant ON app.organizations',self.sql)
 def test_sql_no_privilege_bypass_or_business_seeds(self):
  self.assertNotRegex(self.sql,r'(?m)^CREATE ROLE .*\sBYPASSRLS(?:;|\s)')
  self.assertNotIn('ON DELETE SET NULL',self.sql)
  self.assertNotRegex(self.sql,r'GRANT\s+cleanops_auth_broker\s+TO')
  self.assertNotIn('INSERT INTO app.self_service_rules',self.sql);self.assertNotIn('INSERT INTO identity_private.configuration',self.sql)
  self.assertIn('deployment_enabled boolean NOT NULL DEFAULT false',self.sql)
 def test_sql_bulk_ownership_and_current_exclusion(self):
  fn=re.search(r'CREATE FUNCTION auth_api.revoke_other_own_sessions.*?END \$fn\$;',self.sql,re.S).group()
  for invariant in ['tenant_id=c.tenant_id','user_id=c.user_id','id<>c.session_id',"guard('B1-SELF-04',true)",'ORDER BY s.id FOR UPDATE']:self.assertIn(invariant,fn)
 def test_sql_ceremony_counter_and_consumption(self):
  self.assertIn('last_totp_counter<validated_totp_counter',self.sql)
  self.assertIn('m.enrollment_preauth_id IS DISTINCT FROM q.id',self.sql)
  self.assertIn("q.state<>'VERIFIED'",self.sql)
  self.assertIn("SET state='CONSUMED'",self.sql)
  self.assertIn('b.credential_version=p.credential_version',self.sql)
 def test_requirements_exist(self):
  s=(R/'sources/docs/CLEANOPS_360_SRS_V1_1.md').read_text()
  for item in self.doc['paths'].values():
   for op in item.values():
    for req in op['x-requirements']:self.assertIn(req,s)
 def test_no_sql_placeholders(self):
  for text in ['TODO','IMPLEMENT_ME','RETURN NULL; -- stub','RAISE EXCEPTION \'NOT_IMPLEMENTED']:self.assertNotIn(text,self.sql)
 def test_grant_targets_exist_and_no_public_execute(self):
  self.assertIn("REVOKE ALL ON FUNCTION %s FROM PUBLIC",self.sql)
  self.assertNotRegex(self.sql,r'GRANT EXECUTE[^;]*TO PUBLIC')
  self.assertIn('REVOKE CREATE ON SCHEMA identity_private,auth_api FROM cleanops_auth_broker',self.sql)
  self.assertIn('SET search_path=pg_catalog',self.sql)

if __name__=='__main__':
 stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ClosureChecks))
 (R/'static-tests.log').write_text(stream.getvalue())
 report={'status':'PASS' if result.wasSuccessful() else 'FAIL','tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'postgresql_executed':False,'sql_parser_or_plpgsql_compiler_used':False,'migrations_executed':0,'grants_activated':0,'production_identities_used':0,'auth_gate_05':'OPEN','limitations':['SQL checks are lexical/inventory/reference checks, not full PostgreSQL grammar or semantic compilation','No RLS/lock/mail/browser execution; must pass isolated PostgreSQL integration later','Proposed numeric security values remain subject to benchmarking and review']}
 (R/'validation-report.json').write_text(json.dumps(report,indent=2)+'\n')
 print(stream.getvalue());print(json.dumps(report));raise SystemExit(0 if result.wasSuccessful() else 1)
