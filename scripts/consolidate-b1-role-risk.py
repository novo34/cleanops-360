"""SQL14 consolidated REVIEW ONLY; static generation, NEVER connects to PostgreSQL."""
import difflib,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'docs/proposals/b1-consolidated-sql/revisions/13/schema.review.sql'
DEST=ROOT/'docs/proposals/b1-consolidated-sql/revisions/14'
CATALOGUE="""-- REVIEW ONLY: server-reviewed role classification; no runtime/service writer.
CREATE TABLE identity_private.role_risk_catalogue (
 tenant_id uuid NOT NULL,role_id uuid NOT NULL,risk_class text NOT NULL CHECK(risk_class IN('SENSITIVE','OPERATIONAL')),
 PRIMARY KEY(tenant_id,role_id),FOREIGN KEY(tenant_id,role_id) REFERENCES app.access_roles(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE identity_private.role_risk_catalogue OWNER TO cleanops_ddl_owner;
ALTER TABLE identity_private.role_risk_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_private.role_risk_catalogue FORCE ROW LEVEL SECURITY;
CREATE POLICY broker_read ON identity_private.role_risk_catalogue TO cleanops_auth_broker FOR SELECT USING(true);
GRANT SELECT ON identity_private.role_risk_catalogue TO cleanops_auth_broker;
REVOKE ALL ON identity_private.role_risk_catalogue FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
CREATE FUNCTION identity_private.effective_risk(t uuid,u uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN x.risk_class='SENSITIVE' THEN 'SENSITIVE'
 WHEN EXISTS(SELECT 1 FROM app.access_role_memberships m JOIN app.access_roles r ON (r.tenant_id,r.id)=(m.tenant_id,m.role_id)
 LEFT JOIN identity_private.role_risk_catalogue k ON (k.tenant_id,k.role_id)=(m.tenant_id,m.role_id)
 WHERE m.tenant_id=t AND m.user_id=u AND r.revoked_at IS NULL AND m.revoked_at IS NULL
 AND m.start_at<=statement_timestamp() AND (m.expires_at IS NULL OR statement_timestamp()<m.expires_at)
 AND k.risk_class IS NULL) THEN NULL
 WHEN EXISTS(SELECT 1 FROM app.access_role_memberships m JOIN app.access_roles r ON (r.tenant_id,r.id)=(m.tenant_id,m.role_id)
 JOIN identity_private.role_risk_catalogue k ON (k.tenant_id,k.role_id)=(m.tenant_id,m.role_id)
 WHERE m.tenant_id=t AND m.user_id=u AND r.revoked_at IS NULL AND m.revoked_at IS NULL
 AND m.start_at<=statement_timestamp() AND (m.expires_at IS NULL OR statement_timestamp()<m.expires_at)
 AND k.risk_class='SENSITIVE') THEN 'SENSITIVE' ELSE x.risk_class END
 FROM app.users x WHERE x.tenant_id=t AND x.id=u AND x.state='ACTIVE'
$fn$;
"""
def generate():
 raw=BASE.read_bytes();assert hashlib.sha256(raw).hexdigest()=='a052d028206d004b17c375bc56868d86c4014fc4dd72e0d78d8fdb49b741b279'
 text=raw.decode()
 # Move the two existing definitions byte-identically before the SQL helper that
 # references them. No forward SQL-language dependency and no duplicate overlay.
 start=text.index('CREATE TABLE app.access_roles (');end=text.index('CREATE TABLE app.access_rules (',start)
 roles=text[start:end];text=text[:start]+text[end:]
 anchor='CREATE FUNCTION identity_private.valid_session(t uuid,s uuid,u uuid) RETURNS boolean'
 assert text.count(anchor)==1;text=text.replace(anchor,roles+CATALOGUE+anchor,1)
 old=' JOIN identity_private.credentials c ON c.principal_id=p.id\n WHERE x.tenant_id=t'
 new=" JOIN identity_private.credentials c ON c.principal_id=p.id\n CROSS JOIN LATERAL (SELECT identity_private.effective_risk(x.tenant_id,x.user_id) AS risk OFFSET 0) e\n WHERE x.tenant_id=t"
 assert text.count(old)==1;text=text.replace(old,new)
 old=' AND statement_timestamp()<x.absolute_expires_at AND statement_timestamp()<x.idle_expires_at)'
 new=" AND statement_timestamp()<x.absolute_expires_at AND statement_timestamp()<x.idle_expires_at\n AND e.risk IN('SENSITIVE','OPERATIONAL')\n AND x.idle_seconds<=(CASE WHEN e.risk='SENSITIVE' THEN 1800 ELSE 28800 END)\n AND x.absolute_expires_at<=x.created_at+make_interval(secs=>identity_private.cfg(CASE WHEN e.risk='SENSITIVE' THEN 'absolute_sensitive' ELSE 'absolute_operational' END)))"
 assert text.count(old)==1;text=text.replace(old,new)
 old=' SELECT risk_class INTO risk FROM app.users WHERE tenant_id=q.tenant_id AND id=q.user_id;'
 new=" PERFORM 1 FROM app.policy_versions WHERE tenant_id=q.tenant_id FOR SHARE;\n IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;\n risk:=identity_private.effective_risk(q.tenant_id,q.user_id);\n IF risk IS NULL OR risk NOT IN('SENSITIVE','OPERATIONAL') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;"
 assert text.count(old)==1;text=text.replace(old,new)
 old=' SELECT x.risk_class,p.email_normalized INTO risk,recipient'
 new=' SELECT identity_private.effective_risk(x.tenant_id,x.id),p.email_normalized INTO risk,recipient'
 assert text.count(old)==1;text=text.replace(old,new)
 # Use one timestamp for creation and absolute ceiling, not a tolerance that
 # silently enlarges the approved maximum (same class of issue fixed in SQL10).
 old="DECLARE q identity_private.preauth;k uuid:=gen_random_uuid();cv bigint;origin_user uuid; risk text;"
 new=old[:-1]+";issued_at timestamptz;"
 assert text.count(old)==1;text=text.replace(old,new)
 old=" INSERT INTO app.sessions(tenant_id,id,user_id,principal_id,token_digest,csrf_digest,state,created_at,last_activity_at,absolute_expires_at,idle_expires_at,idle_seconds,credential_version,mfa_verified_at,device_label,browser_label)\n VALUES(q.tenant_id,k,q.user_id,q.principal_id,new_token_hash,new_csrf_hash,'ACTIVE',clock_timestamp(),clock_timestamp(),clock_timestamp()+make_interval(secs=>absolute_seconds),clock_timestamp()+make_interval(secs=>idle_seconds),idle_seconds,cv,q.factor_verified_at,device,browser);"
 new=old.replace(" INSERT INTO app.sessions", " issued_at:=clock_timestamp();\n INSERT INTO app.sessions").replace("'ACTIVE',clock_timestamp(),clock_timestamp(),clock_timestamp()+make_interval(secs=>absolute_seconds),clock_timestamp()+make_interval(secs=>idle_seconds)","'ACTIVE',issued_at,issued_at,issued_at+make_interval(secs=>absolute_seconds),issued_at+make_interval(secs=>idle_seconds)")
 assert text.count(old)==1;text=text.replace(old,new)
 # Existing binding authorization takes SHARE only after the AUTHZ writer's
 # special pre-exclusive-lock path. Revalidate current session after its wait.
 old=" SELECT version INTO pv FROM app.policy_versions WHERE tenant_id=t FOR SHARE;"
 if old not in text:
  old=" SELECT p.version INTO pv FROM app.policy_versions p WHERE p.tenant_id=t FOR SHARE;"
 assert text.count(old)==1
 text=text.replace(old,old+"\n IF raw_preauth IS NULL AND NOT identity_private.valid_session(c.tenant_id,c.session_id,c.user_id) THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;")
 data=text.encode();diff=''.join(difflib.unified_diff(raw.decode().splitlines(keepends=True),text.splitlines(keepends=True),fromfile='SQL13-authorized.sql',tofile='SQL14-REVIEW-ONLY.sql'))
 meta={'candidate':'PG-TEST-01-CONSOLIDATED-14','status':'REVIEW ONLY','installationAuthorized':False,'candidateArtifact':{'gitBlob':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)},'diffSha256':hashlib.sha256(diff.encode()).hexdigest(),'changes':['Read-only private tenant/role UUID risk catalogue, FORCE RLS; SELECT only for private broker, no public/service writers','One private effective_risk(uuid,uuid), owned/revoked by the existing fixed function-owner pass; no public signature or role changes','Revalidate existing session ceilings against current effective risk without extending expiry','Use same effective risk for locked D1 material and session issuance; issuance holds policy SHARE; authorization rechecks after SHARE wait','Use one issuance timestamp for created/idle/absolute so strict ceiling cannot reject microsecond clock skew or gain an expiry tolerance','Relocate access_roles and access_role_memberships definitions byte-identically before their new SQL dependency'],'notClaimed':['Not installed, compiled in PostgreSQL or security-accepted','No productive UUID classification, custodian or classification writer invented','Real role-change/concurrency/expiry regression remains mandatory after exact owner authorization'],'runtime':'closedBackend','B1':'OPEN','AUTH-GATE-05':'OPEN'}
 return {'schema.review.sql':text,'SQL13_TO_SQL14.diff':diff,'manifest.json':json.dumps(meta,indent=2)+'\n'}
if __name__=='__main__':
 DEST.mkdir(parents=True,exist_ok=True)
 for name,text in generate().items():
  if '--check' in sys.argv:assert (DEST/name).read_text()==text,name
  else:(DEST/name).write_text(text)
 print('SQL14 REVIEW ONLY generated/checkable; no SQL executed')
