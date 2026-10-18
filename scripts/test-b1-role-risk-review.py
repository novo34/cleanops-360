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
 def test_private_read_only_and_dependency_order(self):
  new=(g.DEST/'schema.review.sql').read_text();catalogue=g.CATALOGUE
  self.assertIn('FORCE ROW LEVEL SECURITY',catalogue)
  self.assertIn('FOR SELECT USING(true)',catalogue)
  self.assertIn('GRANT SELECT ON identity_private.role_risk_catalogue TO cleanops_auth_broker;',catalogue)
  self.assertNotRegex(catalogue,r'GRANT (?:INSERT|UPDATE|DELETE|EXECUTE)')
  self.assertLess(new.index('CREATE TABLE app.access_roles ('),new.index('CREATE TABLE identity_private.role_risk_catalogue'))
  self.assertLess(new.index('CREATE TABLE app.access_role_memberships ('),new.index('CREATE FUNCTION identity_private.effective_risk('))
  self.assertLess(new.index('CREATE FUNCTION identity_private.effective_risk('),new.index('CREATE FUNCTION identity_private.valid_session('))
  self.assertIn("AND k.risk_class IS NULL) THEN NULL",catalogue)
  self.assertIn('m.tenant_id=t AND m.user_id=u',catalogue)
  self.assertIn("'ACTIVE',issued_at,issued_at,issued_at+",new)
if __name__=='__main__':unittest.main()
