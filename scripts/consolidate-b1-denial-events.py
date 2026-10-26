"""Consolidated REVIEW ONLY; no database connection or SQL execution."""
import difflib,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'docs/proposals/b1-consolidated-sql/revisions/12/schema.review.sql'
APPROVED=ROOT/'docs/proposals/b1-consolidated-sql/revisions/11/schema.review.sql'
DEST=ROOT/'docs/proposals/b1-consolidated-sql/revisions/13'
OLD="IF code NOT IN('LOGIN_DENIED','RATE_LIMITED','MFA_DENIED','CSRF_DENIED','DEPENDENCY_FAILURE') THEN"
NEW="IF code NOT IN('LOGIN_DENIED','RATE_LIMITED','MFA_DENIED','CSRF_DENIED','DEPENDENCY_FAILURE','POLICY_DENIED','STEP_UP_REQUIRED') THEN"
def generate():
 base=BASE.read_bytes();approved=APPROVED.read_bytes()
 assert hashlib.sha256(base).hexdigest()=='78c222c842c63da80eb7f967cbae6a93dad7306f366787f3a9f5c7016b4d05da'
 assert hashlib.sha256(approved).hexdigest()=='54f9c0d94441ed3f72f6dc1c3d4d9bca1b9f0072a7d0f7c6059debe80eea9d6e'
 text=base.decode();assert text.count(OLD)==1
 sql=text.replace(OLD,NEW);data=sql.encode();blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 diff=''.join(difflib.unified_diff(approved.decode().splitlines(keepends=True),sql.splitlines(keepends=True),fromfile='SQL11-authorized.sql',tofile='SQL13-REVIEW-ONLY.sql'))
 meta={'candidate':'PG-TEST-01-CONSOLIDATED-13','status':'REVIEW ONLY','installationAuthorized':False,'supersedesUninstalledProposal':'SQL12; its exact owned PREAUTH rotation function is retained byte-identically','candidateArtifact':{'gitBlob':blob,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'path':'docs/proposals/b1-consolidated-sql/revisions/13/schema.review.sql'},'baseApproved':'SQL11 blob3f13bb1132c5b1ffdd35d4993bb9aa2ca3c75f06','fullDiffSha256':hashlib.sha256(diff.encode()).hexdigest(),'changes':['Exact SQL12 owned PREAUTH rotation function and its existing documented function ACL','Only add POLICY_DENIED and STEP_UP_REQUIRED to existing record_security_event code allowlist'],'tableChanges':[],'roleChanges':[],'rlsChanges':[],'directTablePrivilegeChanges':[],'existingSignatureChanges':[],'runtime':'closedBackend','B1':'OPEN','AUTH-GATE-05':'OPEN'}
 return {'schema.review.sql':sql,'SQL11_TO_SQL13.diff':diff,'manifest.json':json.dumps(meta,indent=2)+'\n'}
if __name__=='__main__':
 files=generate()
 for name,text in files.items():
  p=DEST/name
  if '--check' in sys.argv:assert p.read_text()==text,name
  else:p.write_text(text)
 print('SQL13 REVIEW ONLY reproducibility PASS; no SQL executed')
