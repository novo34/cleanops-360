"""Static SQL14 review checks, no database, no acceptance claim."""
import hashlib,importlib.util,json,re,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('riskreview',ROOT/'scripts/consolidate-b1-role-risk.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Review(unittest.TestCase):
 def test_exact_reproducible_candidate(self):
  for name,text in g.generate().items():self.assertEqual((g.DEST/name).read_text(),text)
  meta=json.loads((g.DEST/'manifest.json').read_text());raw=(g.DEST/'schema.review.sql').read_bytes()
  self.assertFalse(meta['installationAuthorized']);self.assertEqual(meta['status'],'REVIEW ONLY')
  self.assertEqual(hashlib.sha256(raw).hexdigest(),meta['candidateArtifact']['sha256'])
  self.assertEqual(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),meta['candidateArtifact']['gitBlob'])
 def test_no_public_signature_role_or_existing_rls_change(self):
  old=g.BASE.read_text();new=(g.DEST/'schema.review.sql').read_text()
  public=lambda s:re.findall(r'CREATE (?:OR REPLACE )?FUNCTION auth_api\.[^\n]+',s)
  self.assertEqual(public(old),public(new))
  self.assertEqual(re.findall(r'CREATE ROLE [^;]+;',old),re.findall(r'CREATE ROLE [^;]+;',new))
  oldpolicies=re.findall(r'CREATE POLICY [^;]+;',old);newpolicies=re.findall(r'CREATE POLICY [^;]+;',new)
  self.assertEqual([p for p in newpolicies if 'role_risk_catalogue' not in p],oldpolicies)
  self.assertEqual(new.count('CREATE FUNCTION identity_private.effective_risk('),1)
 def test_only_intended_existing_function_bodies_change(self):
  def bodies(text):
   return {m.group(1):m.group(0) for m in re.finditer(r'CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+\.[a-z_][a-z_0-9]*)\([^$]+\$fn\$[\s\S]*?\$fn\$;',text)}
  old=bodies(g.BASE.read_text());new=bodies((g.DEST/'schema.review.sql').read_text())
  changed={name for name in old if old[name]!=new[name]}
  self.assertEqual(changed,{'identity_private.valid_session','auth_api.issue_active_session','auth_api.trusted_mfa_material','auth_api.binding_authorization'})
  self.assertEqual(old['auth_api.consume_email_v2'],new['auth_api.consume_email_v2'])
  authorization=new['auth_api.binding_authorization']
  self.assertLess(authorization.index('ORDER BY tenant_id FOR SHARE;'),authorization.index('NOT identity_private.valid_session('))
  self.assertLess(authorization.index('NOT identity_private.valid_session('),authorization.index('allowed:='))
 def test_prepared_test_artifact_pin_and_no_auto_entrypoint(self):
  meta=json.loads((g.DEST/'manifest.json').read_text())
  prepared=(ROOT/'scripts/pg14-role-risk-tests.ts').read_text()
  self.assertIn(meta['candidateArtifact']['gitBlob'],prepared)
  self.assertIn(meta['candidateArtifact']['sha256'],prepared)
  self.assertIn('export async function runPreparedRoleRiskTests(',prepared)
  self.assertNotIn('new Pool(',prepared)
  self.assertNotIn('await runPreparedRoleRiskTests(',prepared)
  plan=json.loads((g.DEST/'TEST_PLAN.json').read_text())
  self.assertEqual(plan['artifact'],meta['candidateArtifact'])
  self.assertFalse(plan['installationAuthorized'])
  self.assertEqual({c['id'] for c in plan['nativeCases']},set(re.findall(r"'(MR[0-9]{2})'",prepared)))
  self.assertTrue(all(c['status']=='NOT_EXECUTED' for c in plan['nativeCases']))
 def test_private_read_only_and_dependency_order(self):
  new=(g.DEST/'schema.review.sql').read_text();catalogue=g.CATALOGUE
  self.assertIn('FORCE ROW LEVEL SECURITY',catalogue)
  self.assertIn('FOR SELECT TO cleanops_auth_broker USING(true)',catalogue)
  self.assertIn('GRANT SELECT ON identity_private.role_risk_catalogue TO cleanops_auth_broker;',catalogue)
  self.assertNotRegex(catalogue,r'GRANT (?:INSERT|UPDATE|DELETE|EXECUTE)')
  self.assertLess(new.index('CREATE TABLE app.access_roles ('),new.index('CREATE TABLE identity_private.role_risk_catalogue'))
  self.assertLess(new.index('CREATE TABLE app.access_role_memberships ('),new.index('CREATE FUNCTION identity_private.effective_risk('))
  self.assertLess(new.index('CREATE FUNCTION identity_private.effective_risk('),new.index('CREATE FUNCTION identity_private.valid_session('))
  self.assertIn("WHERE risk_class IS NULL) THEN NULL",catalogue)
  self.assertIn('WITH moment AS MATERIALIZED(SELECT clock_timestamp() AS checked_at)',catalogue)
  self.assertIn('classifications AS MATERIALIZED',catalogue)
  self.assertIn('m.tenant_id=t AND m.user_id=u',catalogue)
  self.assertIn("'ACTIVE',issued_at,issued_at,issued_at+",new)
if __name__=='__main__':unittest.main()
