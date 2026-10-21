-- REVIEW ONLY. Requires separate exact SQL5/ACL/fixture authorization.
-- No B1 preauth/session function is replaced. Pending invitation grants no business authority.
BEGIN;
ALTER TABLE identity_private.user_invitations ADD CONSTRAINT invitation_id_global_unique UNIQUE(id);
ALTER TABLE identity_private.invitation_policy ADD COLUMN default_risk_class text CHECK(default_risk_class IN('SENSITIVE','OPERATIONAL')),
 ADD COLUMN operational_mfa_required boolean;
-- No productive default or seed: explicit tenant risk policy is required.
CREATE TABLE identity_private.invitation_acceptances (
 tenant_id uuid NOT NULL, id uuid NOT NULL, invitation_id uuid NOT NULL, generation bigint NOT NULL,
 user_id uuid NOT NULL, principal_id uuid REFERENCES identity_private.principals(id), credential_version bigint,
 password_hash text, risk_class text NOT NULL CHECK(risk_class IN('SENSITIVE','OPERATIONAL')), mfa_required boolean NOT NULL,
 policy_version bigint NOT NULL, state text NOT NULL CHECK(state IN('DRAFT','PENDING_MFA','READY','CONSUMED','REVOKED')),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, password_verified_at timestamptz, factor_verified_at timestamptz,
 cookie_digest bytea UNIQUE CHECK(cookie_digest IS NULL OR octet_length(cookie_digest)=32),
 csrf_digest bytea CHECK(csrf_digest IS NULL OR octet_length(csrf_digest)=32),
 method_id uuid, secret_ciphertext bytea, key_version text, last_counter bigint CHECK(last_counter IS NULL OR last_counter>=0),
 owner_backend integer,owner_xid xid8, network_digest bytea NOT NULL CHECK(octet_length(network_digest)=32),
 recipient_digest bytea NOT NULL CHECK(octet_length(recipient_digest)=32),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,invitation_id) REFERENCES identity_private.user_invitations(tenant_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '10m'),
 CHECK((state='DRAFT')=(owner_backend IS NOT NULL AND owner_xid IS NOT NULL)),
 CHECK(state IN('DRAFT','REVOKED') OR (cookie_digest IS NOT NULL AND csrf_digest IS NOT NULL AND password_verified_at IS NOT NULL)),
 CHECK(risk_class<>'SENSITIVE' OR mfa_required),CHECK(password_hash IS NULL OR left(password_hash,10)='$argon2id$')
);
GRANT SELECT,INSERT,UPDATE,DELETE ON identity_private.invitation_acceptances TO cleanops_auth_broker;
REVOKE ALL ON identity_private.invitation_acceptances FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
GRANT INSERT ON identity_private.principals,identity_private.credentials,app.users,app.access_resources TO cleanops_auth_broker;

CREATE FUNCTION identity_private.invitation_digest_equal(a bytea,b bytea) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE mismatch integer:=0;i integer;
BEGIN
 IF a IS NULL OR b IS NULL OR octet_length(a)<>32 OR octet_length(b)<>32 THEN RETURN false;END IF;
 FOR i IN 0..31 LOOP mismatch:=mismatch | (get_byte(a,i) # get_byte(b,i));END LOOP;
 RETURN mismatch=0;
END $fn$;
CREATE FUNCTION identity_private.invitation_cap_digest(raw text,purpose text) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE decoded bytea;
BEGIN
 IF raw IS NULL OR raw !~ '^[A-Za-z0-9_-]{43}$' OR purpose NOT IN('CAPABILITY','CSRF') THEN RETURN NULL;END IF;
 decoded:=decode(translate(raw,'-_','+/')||'=','base64');
 IF translate(rtrim(encode(decoded,'base64'),'='),'+/','-_')<>raw THEN RETURN NULL;END IF;
 RETURN crypto.digest(convert_to(array_to_json(ARRAY['CLEANOPS_INVITATION_ACCEPTANCE_V1',purpose,raw])::text,'UTF8'),'sha256');
END $fn$;
CREATE FUNCTION identity_private.invitation_attempt_denied(t uuid,invitation uuid,recipient bytea,network bytea,corr uuid,action_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM auth_api.rate_attempt(recipient,'USER','LOGIN',5);
 PERFORM auth_api.rate_attempt(crypto.digest(convert_to('INVITATION_FAILURE_ORIGIN','UTF8')||network,'sha256'),'IP','LOGIN',30);
 INSERT INTO identity_private.security_log VALUES(gen_random_uuid(),recipient,network,NULL,CASE WHEN action_name LIKE '%factor%' THEN 'INVITATION_MFA_DENIED' ELSE 'INVITATION_CREDENTIAL_DENIED' END,corr,clock_timestamp(),clock_timestamp()+make_interval(secs=>identity_private.cfg('preauth_security_log_retention')));
 IF (SELECT count(*) FROM identity_private.security_log WHERE principal_digest=recipient AND event_code IN('INVITATION_MFA_DENIED','INVITATION_CREDENTIAL_DENIED') AND occurred_at>clock_timestamp()-interval '15m')>=5 THEN
  UPDATE identity_private.rate_buckets SET blocked_until=clock_timestamp()+interval '15m' WHERE key_digest=recipient AND dimension='USER' AND purpose='LOGIN';
 END IF;
 IF (SELECT count(*) FROM identity_private.security_log WHERE network_digest=network AND event_code IN('INVITATION_MFA_DENIED','INVITATION_CREDENTIAL_DENIED') AND occurred_at>clock_timestamp()-interval '15m')>=30 THEN
  UPDATE identity_private.rate_buckets SET blocked_until=clock_timestamp()+interval '15m' WHERE key_digest=crypto.digest(convert_to('INVITATION_FAILURE_ORIGIN','UTF8')||network,'sha256') AND dimension='IP' AND purpose='LOGIN';
 END IF;
 INSERT INTO app.audit_logs VALUES(t,gen_random_uuid(),NULL,'SYSTEM',action_name,invitation,'DENY',corr,clock_timestamp(),'{}'::jsonb);
END $fn$;

CREATE FUNCTION auth_api.invitation_link_material(invitation uuid,raw_secret text,network bytea,device bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v identity_private.user_invitations;s identity_private.invitation_policy;p identity_private.principals;cred identity_private.credentials;
 candidate bytea;decoded bytea;recipient bytea;pid uuid;cap uuid:=gen_random_uuid();uid uuid:=gen_random_uuid();pv bigint;until_at timestamptz;mfa boolean;
BEGIN
 PERFORM identity_private.require_enabled();
 IF invitation IS NULL OR corr IS NULL OR network IS NULL OR octet_length(network)<>32 OR device IS NULL OR octet_length(device)<>32
 OR raw_secret IS NULL OR raw_secret !~ '^[A-Za-z0-9_-]{43}$' THEN RETURN NULL;END IF;
 IF identity_private.cfg('preauth_security_log_retention')<900 THEN RAISE EXCEPTION 'INVITATION_POLICY_UNAVAILABLE';END IF;
 INSERT INTO identity_private.security_log VALUES(gen_random_uuid(),crypto.digest(convert_to('INVITATION_LINK_ID'||invitation::text,'UTF8'),'sha256'),network,device,'INVITATION_LINK_ATTEMPT',corr,clock_timestamp(),clock_timestamp()+make_interval(secs=>identity_private.cfg('preauth_security_log_retention')));
 IF (SELECT count(*) FROM identity_private.security_log WHERE principal_digest=crypto.digest(convert_to('INVITATION_LINK_ID'||invitation::text,'UTF8'),'sha256') AND event_code='INVITATION_LINK_ATTEMPT' AND occurred_at>clock_timestamp()-interval '15m')>10 OR (SELECT count(*) FROM identity_private.security_log WHERE network_digest=network AND event_code='INVITATION_LINK_ATTEMPT' AND occurred_at>clock_timestamp()-interval '15m')>30 THEN RETURN NULL;END IF;
 IF auth_api.rate_attempt(crypto.digest(convert_to('INVITATION_LINK_ID'||invitation::text,'UTF8'),'sha256'),'USER','LOGIN',10)>0
 OR auth_api.rate_attempt(crypto.digest(convert_to('INVITATION_LINK_ORIGIN','UTF8')||network,'sha256'),'IP','LOGIN',30)>0 THEN PERFORM auth_api.record_security_event('RATE_LIMITED',crypto.digest(convert_to(invitation::text,'UTF8'),'sha256'),network,device,corr);RETURN NULL;END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE id=invitation;
 IF NOT FOUND THEN PERFORM auth_api.record_security_event('LOGIN_DENIED',crypto.digest(convert_to(invitation::text,'UTF8'),'sha256'),network,device,corr);RETURN NULL;END IF;
 -- Canonical compact JSON array equals the application's canonical array domain.
 decoded:=decode(translate(raw_secret,'-_','+/')||'=','base64');
 IF translate(rtrim(encode(decoded,'base64'),'='),'+/','-_')<>raw_secret THEN RETURN NULL;END IF;
 candidate:=crypto.digest(convert_to(array_to_json(ARRAY['CLEANOPS_INVITATION_LINK_V1',v.tenant_id::text,v.id::text,v.generation::text,v.email_normalized])::text,'UTF8')||decoded,'sha256');
 IF v.state<>'ISSUED' OR v.expires_at<=clock_timestamp() OR NOT identity_private.invitation_digest_equal(candidate,v.verifier) THEN PERFORM auth_api.record_security_event('LOGIN_DENIED',crypto.digest(convert_to(invitation::text,'UTF8'),'sha256'),network,device,corr);RETURN NULL;END IF;
 -- Email key serializes creation across invitations/tenants; no duplicate principal.
 PERFORM pg_advisory_xact_lock(hashtextextended('INVITATION_PRINCIPAL:'||v.email_normalized,0));
 SELECT id INTO pid FROM identity_private.principals WHERE email_normalized=v.email_normalized;
 IF pid IS NOT NULL THEN
  PERFORM identity_private.lock_principal(pid);
  SELECT * INTO p FROM identity_private.principals WHERE id=pid;
  SELECT * INTO cred FROM identity_private.credentials WHERE principal_id=pid FOR UPDATE;
  IF NOT FOUND OR p.state<>'ACTIVE' THEN RETURN NULL;END IF;
 END IF;
 PERFORM 1 FROM app.organizations WHERE id=v.tenant_id AND state='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT version INTO pv FROM app.policy_versions WHERE tenant_id=v.tenant_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE id=invitation FOR UPDATE;
 IF v.state<>'ISSUED' OR v.expires_at<=clock_timestamp() OR NOT identity_private.invitation_digest_equal(candidate,v.verifier) THEN PERFORM auth_api.record_security_event('LOGIN_DENIED',crypto.digest(convert_to(invitation::text,'UTF8'),'sha256'),network,device,corr);RETURN NULL;END IF;
 SELECT * INTO s FROM identity_private.invitation_policy WHERE tenant_id=v.tenant_id;
 IF NOT FOUND OR s.default_risk_class IS NULL OR (s.default_risk_class='OPERATIONAL' AND s.operational_mfa_required IS NULL) THEN RAISE EXCEPTION 'INVITATION_POLICY_UNAVAILABLE';END IF;
 mfa:=s.default_risk_class='SENSITIVE' OR s.operational_mfa_required;
 recipient:=crypto.digest(convert_to('INVITATION_RECIPIENT:'||v.email_normalized,'UTF8'),'sha256');
 IF EXISTS(SELECT 1 FROM identity_private.rate_buckets WHERE ((key_digest=recipient AND dimension='USER') OR (key_digest=crypto.digest(convert_to('INVITATION_FAILURE_ORIGIN','UTF8')||network,'sha256') AND dimension='IP')) AND purpose='LOGIN' AND blocked_until>clock_timestamp()) THEN RETURN NULL;END IF;
 IF pid IS NOT NULL AND EXISTS(SELECT 1 FROM app.users WHERE tenant_id=v.tenant_id AND principal_id=pid) THEN RETURN NULL;END IF;
 until_at:=LEAST(v.expires_at,clock_timestamp()+interval '10m');
 DELETE FROM identity_private.invitation_acceptances WHERE owner_backend=pg_backend_pid() AND state='DRAFT';
 INSERT INTO identity_private.invitation_acceptances(tenant_id,id,invitation_id,generation,user_id,principal_id,credential_version,risk_class,mfa_required,policy_version,state,created_at,expires_at,owner_backend,owner_xid,network_digest,recipient_digest)
 VALUES(v.tenant_id,cap,v.id,v.generation,uid,pid,cred.credential_version,s.default_risk_class,mfa,pv,'DRAFT',clock_timestamp(),until_at,pg_backend_pid(),pg_current_xact_id(),network,recipient);
 RETURN jsonb_build_object('tenant_id',v.tenant_id,'invitation_id',v.id,'generation',v.generation::text,'recipient',v.email_normalized,'principal_id',pid,'credential_version',cred.credential_version::text,'password_hash',cred.argon2id_hash,'user_id',uid,'acceptance_id',cap,'policy_version',pv::text,'risk_class',s.default_risk_class,'mfa_required',mfa,'expires_at',until_at);
END $fn$;

CREATE FUNCTION auth_api.invitation_credential_denied(invitation uuid,corr uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.invitation_acceptances;
BEGIN
 SELECT * INTO c FROM identity_private.invitation_acceptances WHERE invitation_id=invitation AND state='DRAFT' AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id() FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 PERFORM identity_private.invitation_attempt_denied(c.tenant_id,invitation,c.recipient_digest,c.network_digest,corr,'users.invitation.credential.denied');
 DELETE FROM identity_private.invitation_acceptances WHERE tenant_id=c.tenant_id AND id=c.id;
END $fn$;

CREATE FUNCTION auth_api.prepare_invitation_acceptance(payload jsonb,cookie bytea,csrf bytea,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.invitation_acceptances;v identity_private.user_invitations;cred identity_private.credentials;s identity_private.invitation_policy;until_at timestamptz;method jsonb;
BEGIN
 IF corr IS NULL OR cookie IS NULL OR octet_length(cookie)<>32 OR csrf IS NULL OR octet_length(csrf)<>32 OR jsonb_typeof(payload)<>'object' THEN RETURN false;END IF;
 IF NOT(payload ?& ARRAY['invitation_id','generation','principal_id','credential_version','expected_hash','replacement_hash','user_id','acceptance_id','policy_version','expires_at','method']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) x(k) WHERE x.k<>ALL(ARRAY['invitation_id','generation','principal_id','credential_version','expected_hash','replacement_hash','user_id','acceptance_id','policy_version','expires_at','method'])) THEN RETURN false;END IF;
 SELECT * INTO c FROM identity_private.invitation_acceptances WHERE id=(payload->>'acceptance_id')::uuid AND state='DRAFT' AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id() FOR UPDATE;
 IF NOT FOUND OR c.invitation_id::text<>payload->>'invitation_id' OR c.generation::text<>payload->>'generation' OR c.user_id::text<>payload->>'user_id' OR c.policy_version::text<>payload->>'policy_version' OR c.principal_id::text IS DISTINCT FROM payload->>'principal_id' OR c.credential_version::text IS DISTINCT FROM payload->>'credential_version' THEN RETURN false;END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND id=c.invitation_id FOR UPDATE;
 IF v.state<>'ISSUED' OR v.generation<>c.generation OR v.expires_at<=clock_timestamp() THEN RETURN false;END IF;
 SELECT * INTO s FROM identity_private.invitation_policy WHERE tenant_id=c.tenant_id;
 IF s.default_risk_class IS DISTINCT FROM c.risk_class OR (s.default_risk_class='SENSITIVE' OR s.operational_mfa_required) IS DISTINCT FROM c.mfa_required THEN RETURN false;END IF;
 IF c.principal_id IS NOT NULL THEN
  SELECT * INTO cred FROM identity_private.credentials WHERE principal_id=c.principal_id;
  IF NOT FOUND OR cred.credential_version<>c.credential_version OR cred.argon2id_hash IS DISTINCT FROM payload->>'expected_hash' OR payload->>'replacement_hash' IS NOT NULL THEN RETURN false;END IF;
 ELSE
  IF payload->>'expected_hash' IS NOT NULL OR coalesce(payload->>'replacement_hash','') NOT LIKE '$argon2id$%' OR length(payload->>'replacement_hash')>256 THEN RETURN false;END IF;
 END IF;
 until_at:=LEAST(c.expires_at,v.expires_at,(payload->>'expires_at')::timestamptz);
 IF until_at<=clock_timestamp() OR until_at>c.created_at+interval '10m' THEN RETURN false;END IF;
 method:=payload->'method';
 IF c.mfa_required THEN
  IF jsonb_typeof(method)<>'object' OR NOT(method ?& ARRAY['id','ciphertext','key_version','algorithm']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(method) x(k) WHERE x.k<>ALL(ARRAY['id','ciphertext','key_version','algorithm'])) OR method->>'algorithm' IS DISTINCT FROM 'SHA256' OR jsonb_typeof(method->'id')<>'string' OR jsonb_typeof(method->'ciphertext')<>'string' OR jsonb_typeof(method->'key_version')<>'string' OR coalesce(method->>'ciphertext','') !~ '^(?:[a-f0-9]{2}){29,512}$' OR length(method->>'key_version') NOT BETWEEN 1 AND 120 THEN RETURN false;END IF;
 ELSE IF method<>'null'::jsonb THEN RETURN false;END IF;END IF;
 UPDATE identity_private.invitation_acceptances SET state='REVOKED',password_hash=NULL,secret_ciphertext=NULL,owner_backend=NULL,owner_xid=NULL WHERE tenant_id=c.tenant_id AND invitation_id=c.invitation_id AND id<>c.id AND state IN('DRAFT','PENDING_MFA','READY');
 UPDATE identity_private.invitation_acceptances SET state=CASE WHEN c.mfa_required THEN 'PENDING_MFA' ELSE 'READY' END,password_hash=payload->>'replacement_hash',password_verified_at=clock_timestamp(),cookie_digest=cookie,csrf_digest=csrf,expires_at=until_at,method_id=(method->>'id')::uuid,secret_ciphertext=CASE WHEN c.mfa_required THEN decode(method->>'ciphertext','hex') ELSE NULL END,key_version=method->>'key_version',owner_backend=NULL,owner_xid=NULL WHERE tenant_id=c.tenant_id AND id=c.id;
 INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),NULL,'SYSTEM','users.invitation.prepare',c.invitation_id,'SUCCESS',corr,clock_timestamp(),'{}'::jsonb);
 RETURN true;
END $fn$;

CREATE FUNCTION identity_private.valid_invitation_cap(raw text,csrf text) RETURNS identity_private.invitation_acceptances
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.invitation_acceptances;v identity_private.user_invitations;p identity_private.principals;s identity_private.invitation_policy;pv bigint;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT * INTO c FROM identity_private.invitation_acceptances WHERE cookie_digest=identity_private.invitation_cap_digest(raw,'CAPABILITY');
 IF NOT FOUND OR NOT identity_private.invitation_digest_equal(c.csrf_digest,identity_private.invitation_cap_digest(csrf,'CSRF')) THEN RETURN NULL;END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND id=c.invitation_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('INVITATION_PRINCIPAL:'||v.email_normalized,0));
 IF c.principal_id IS NOT NULL THEN PERFORM identity_private.lock_principal(c.principal_id);END IF;
 PERFORM 1 FROM app.organizations WHERE id=c.tenant_id AND state='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT version INTO pv FROM app.policy_versions WHERE tenant_id=c.tenant_id FOR SHARE;
 SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND id=c.invitation_id FOR UPDATE;
 SELECT * INTO c FROM identity_private.invitation_acceptances WHERE tenant_id=c.tenant_id AND id=c.id FOR UPDATE;
 IF c.state NOT IN('PENDING_MFA','READY','CONSUMED') OR c.generation<>v.generation OR c.policy_version<>pv THEN RETURN NULL;END IF;
 IF c.expires_at<=clock_timestamp() THEN
  IF c.state<>'CONSUMED' THEN
   UPDATE identity_private.invitation_acceptances SET state='REVOKED',password_hash=NULL,secret_ciphertext=NULL WHERE tenant_id=c.tenant_id AND id=c.id;
   INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),NULL,'SYSTEM','users.invitation.capability.expire',c.invitation_id,'SUCCESS',gen_random_uuid(),clock_timestamp(),jsonb_build_object('acceptance_id',c.id));
  END IF;
  RETURN NULL;
 END IF;
 IF c.state='CONSUMED' AND v.state='CONSUMED' THEN RETURN c;END IF;
 IF v.state<>'ISSUED' OR v.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO s FROM identity_private.invitation_policy WHERE tenant_id=c.tenant_id;
 IF c.risk_class IS DISTINCT FROM s.default_risk_class OR c.mfa_required IS DISTINCT FROM (s.default_risk_class='SENSITIVE' OR s.operational_mfa_required) THEN RETURN NULL;END IF;
 IF c.principal_id IS NOT NULL THEN
  SELECT * INTO p FROM identity_private.principals WHERE id=c.principal_id;
  IF p.state<>'ACTIVE' OR NOT EXISTS(SELECT 1 FROM identity_private.credentials WHERE principal_id=c.principal_id AND credential_version=c.credential_version) THEN RETURN NULL;END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM identity_private.rate_buckets WHERE ((key_digest=c.recipient_digest AND dimension='USER') OR (key_digest=crypto.digest(convert_to('INVITATION_FAILURE_ORIGIN','UTF8')||c.network_digest,'sha256') AND dimension='IP')) AND purpose='LOGIN' AND blocked_until>clock_timestamp()) THEN RETURN NULL;END IF;
 RETURN c;
END $fn$;

CREATE FUNCTION auth_api.invitation_factor_material(raw text,csrf text,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.invitation_acceptances;
BEGIN
 IF corr IS NULL THEN RETURN NULL;END IF;
 c:=identity_private.valid_invitation_cap(raw,csrf);
 IF c.id IS NULL OR c.state<>'PENDING_MFA' OR NOT c.mfa_required THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('tenant_id',c.tenant_id,'user_id',c.user_id,'acceptance_id',c.id,'method_id',c.method_id,'generation',c.generation::text,'policy_version',c.policy_version::text,'expires_at',c.expires_at,'ciphertext',encode(c.secret_ciphertext,'hex'),'key_version',c.key_version,'last_counter',c.last_counter);
END $fn$;
CREATE FUNCTION auth_api.invitation_factor_cas(raw text,csrf text,expected_generation bigint,expected_policy bigint,previous_counter bigint,next_counter bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.invitation_acceptances;current_counter bigint;
BEGIN
 c:=identity_private.valid_invitation_cap(raw,csrf);
 current_counter:=floor(extract(epoch FROM clock_timestamp())/identity_private.cfg('totp_period'))::bigint;
 IF corr IS NULL OR expected_generation IS NULL OR expected_policy IS NULL OR c.id IS NULL OR c.state<>'PENDING_MFA' OR c.generation<>expected_generation OR c.policy_version<>expected_policy OR c.last_counter IS DISTINCT FROM previous_counter OR next_counter IS NULL OR next_counter NOT BETWEEN current_counter-identity_private.cfg('totp_window') AND current_counter+identity_private.cfg('totp_window') OR (c.last_counter IS NOT NULL AND next_counter<=c.last_counter) THEN RETURN false;END IF;
 UPDATE identity_private.invitation_acceptances SET state='READY',last_counter=next_counter,factor_verified_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND id=c.id;
 INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),NULL,'SYSTEM','users.invitation.factor',c.invitation_id,'SUCCESS',corr,clock_timestamp(),'{}'::jsonb);
 RETURN true;
END $fn$;
CREATE FUNCTION auth_api.invitation_factor_denied(raw text,csrf text,corr uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.invitation_acceptances;
BEGIN
 c:=identity_private.valid_invitation_cap(raw,csrf);
 IF c.id IS NULL OR c.state<>'PENDING_MFA' OR corr IS NULL THEN RETURN;END IF;
 PERFORM identity_private.invitation_attempt_denied(c.tenant_id,c.invitation_id,c.recipient_digest,c.network_digest,corr,'users.invitation.factor.denied');
END $fn$;

CREATE FUNCTION auth_api.consume_invitation_acceptance(raw text,csrf text,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.invitation_acceptances;v identity_private.user_invitations;p uuid;at_time timestamptz;
BEGIN
 IF corr IS NULL THEN RETURN false;END IF;
 c:=identity_private.valid_invitation_cap(raw,csrf);
 IF c.id IS NULL THEN RETURN false;END IF;
 IF c.state='CONSUMED' THEN RETURN true;END IF;
 IF c.state<>'READY' OR c.password_verified_at IS NULL OR (c.mfa_required AND (c.factor_verified_at IS NULL OR c.factor_verified_at<=clock_timestamp()-interval '5m' OR c.last_counter IS NULL)) THEN RETURN false;END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND id=c.invitation_id;
 SELECT id INTO p FROM identity_private.principals WHERE email_normalized=v.email_normalized;
 IF c.principal_id IS NULL AND p IS NOT NULL THEN RETURN false;END IF;
 IF c.principal_id IS NOT NULL AND p IS DISTINCT FROM c.principal_id THEN RETURN false;END IF;
 IF p IS NOT NULL AND EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND principal_id=p) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=c.user_id) OR EXISTS(SELECT 1 FROM app.access_resources WHERE tenant_id=c.tenant_id AND id=c.user_id) THEN RETURN false;END IF;
 at_time:=clock_timestamp();
 IF p IS NULL THEN
  p:=gen_random_uuid();
  IF c.password_hash IS NULL THEN RETURN false;END IF;
  INSERT INTO identity_private.principals VALUES(p,v.email_normalized,'ACTIVE',at_time);
  INSERT INTO identity_private.credentials VALUES(p,c.password_hash,1,at_time);
 END IF;
 INSERT INTO app.users(tenant_id,id,principal_id,display_name,state,risk_class,created_at) VALUES(c.tenant_id,c.user_id,p,v.display_name,'ACTIVE',c.risk_class,at_time);
 INSERT INTO app.access_resources VALUES(c.tenant_id,c.user_id,'users',NULL);
 IF c.mfa_required THEN
  INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,last_totp_counter,created_at,method_version,algorithm)
  VALUES(c.tenant_id,c.method_id,c.user_id,'TOTP','ACTIVE',c.secret_ciphertext,c.key_version,c.last_counter,at_time,1,'SHA256');
 END IF;
 UPDATE identity_private.user_invitations SET state='CONSUMED',verifier=NULL,consumed_at=at_time WHERE tenant_id=c.tenant_id AND id=c.invitation_id;
 UPDATE identity_private.invitation_acceptances SET state=CASE WHEN id=c.id THEN 'CONSUMED' ELSE 'REVOKED' END,password_hash=NULL,secret_ciphertext=NULL,owner_backend=NULL,owner_xid=NULL WHERE tenant_id=c.tenant_id AND invitation_id=c.invitation_id;
 UPDATE app.auth_outbox SET state='CANCELLED',payload_ciphertext=decode('','hex'),claim_digest=NULL,lease_until=NULL WHERE tenant_id=c.tenant_id AND invitation_id=c.invitation_id AND state IN('PENDING','CLAIMED','DISPATCHING','QUARANTINED');
 INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),NULL,'SYSTEM','users.invitation.accept',c.invitation_id,'SUCCESS',corr,at_time,jsonb_build_object('user_id',c.user_id));
 RETURN true;
END $fn$;

ALTER FUNCTION identity_private.invitation_digest_equal(bytea,bytea) OWNER TO cleanops_auth_broker;
ALTER FUNCTION identity_private.invitation_cap_digest(text,text) OWNER TO cleanops_auth_broker;
ALTER FUNCTION identity_private.invitation_attempt_denied(uuid,uuid,bytea,bytea,uuid,text) OWNER TO cleanops_auth_broker;
ALTER FUNCTION identity_private.valid_invitation_cap(text,text) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.invitation_digest_equal(bytea,bytea),identity_private.invitation_cap_digest(text,text),identity_private.invitation_attempt_denied(uuid,uuid,bytea,bytea,uuid,text),identity_private.valid_invitation_cap(text,text) FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER FUNCTION auth_api.invitation_link_material(uuid,text,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.invitation_credential_denied(uuid,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.prepare_invitation_acceptance(jsonb,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.invitation_factor_material(text,text,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.invitation_factor_cas(text,text,bigint,bigint,bigint,bigint,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.invitation_factor_denied(text,text,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.consume_invitation_acceptance(text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.invitation_link_material(uuid,text,bytea,bytea,uuid),auth_api.invitation_credential_denied(uuid,uuid),auth_api.prepare_invitation_acceptance(jsonb,bytea,bytea,uuid),auth_api.invitation_factor_material(text,text,uuid),auth_api.invitation_factor_cas(text,text,bigint,bigint,bigint,bigint,uuid),auth_api.invitation_factor_denied(text,text,uuid),auth_api.consume_invitation_acceptance(text,text,uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
GRANT EXECUTE ON FUNCTION auth_api.invitation_link_material(uuid,text,bytea,bytea,uuid),auth_api.invitation_credential_denied(uuid,uuid),auth_api.prepare_invitation_acceptance(jsonb,bytea,bytea,uuid),auth_api.invitation_factor_material(text,text,uuid),auth_api.invitation_factor_cas(text,text,bigint,bigint,bigint,bigint,uuid),auth_api.invitation_factor_denied(text,text,uuid),auth_api.consume_invitation_acceptance(text,text,uuid) TO cleanops_identity_service;
COMMIT;
