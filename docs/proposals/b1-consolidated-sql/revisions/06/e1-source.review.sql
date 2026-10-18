-- E1 source for a SINGLE fresh-install candidate. REVIEW ONLY; never install alone.
-- New privileges/contracts below require exact owner approval. No initial grants/data.
CREATE ROLE cleanops_recipient_verifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA auth_api TO cleanops_recipient_verifier;
CREATE TABLE app.verified_recipients (
 tenant_id uuid NOT NULL, user_id uuid NOT NULL, version bigint NOT NULL CHECK(version>0),
 address_digest bytea NOT NULL CHECK(octet_length(address_digest)=32),
 evidence_id uuid NOT NULL, verified_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id), CHECK(expires_at>verified_at)
);
CREATE TABLE app.auth_preferences (
 tenant_id uuid PRIMARY KEY REFERENCES app.organizations(id),trusted_devices_enabled boolean NOT NULL
);
CREATE TABLE app.trusted_devices (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL, principal_id uuid NOT NULL,
 token_digest bytea NOT NULL UNIQUE CHECK(octet_length(token_digest)=32), credential_version bigint NOT NULL,
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,user_id,principal_id) REFERENCES app.users(tenant_id,id,principal_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days')
);
CREATE TABLE app.access_resources (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id),id uuid NOT NULL,kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 80),parent_id uuid,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,parent_id) REFERENCES app.access_resources(tenant_id,id),CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE TABLE app.access_roles (
 tenant_id uuid NOT NULL, id uuid NOT NULL, label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 revoked_at timestamptz, PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id) REFERENCES app.organizations(id)
);
CREATE TABLE app.access_role_memberships (
 tenant_id uuid NOT NULL, role_id uuid NOT NULL, user_id uuid NOT NULL,
 start_at timestamptz NOT NULL, expires_at timestamptz, revoked_at timestamptz,
 PRIMARY KEY(tenant_id,role_id,user_id), FOREIGN KEY(tenant_id,role_id) REFERENCES app.access_roles(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id), CHECK(expires_at IS NULL OR expires_at>start_at)
);
CREATE TABLE app.access_rules (
 tenant_id uuid NOT NULL, id uuid NOT NULL, role_id uuid, user_id uuid,
 action text NOT NULL CHECK(action IN('view','create','edit','approve','delete','export','manage_permissions')),
 resource_kind text NOT NULL CHECK(length(resource_kind) BETWEEN 1 AND 80), resource_id uuid,
 effect text NOT NULL CHECK(effect IN('ALLOW','DENY')), start_at timestamptz NOT NULL,
 expires_at timestamptz, revoked_at timestamptz, PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,role_id) REFERENCES app.access_roles(tenant_id,id),
 FOREIGN KEY(tenant_id,resource_id) REFERENCES app.access_resources(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id),
 CHECK((role_id IS NULL)<>(user_id IS NULL)), CHECK(expires_at IS NULL OR expires_at>start_at)
);
-- Restricted reset receipt: never grants a session or privileged authorization.
CREATE TABLE app.identity_reset_evidence (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL, actor_user_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500), proof_reference uuid NOT NULL,
 created_at timestamptz NOT NULL, PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES app.users(tenant_id,id), CHECK(user_id<>actor_user_id)
);
DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['verified_recipients','auth_preferences','trusted_devices','access_resources','access_roles','access_role_memberships','access_rules','identity_reset_evidence'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO cleanops_ddl_owner',t);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY broker_internal ON app.%I TO cleanops_auth_broker USING(true) WITH CHECK(true)',t);
 END LOOP;
END $rls$;
GRANT SELECT,INSERT,UPDATE ON app.verified_recipients,app.trusted_devices,app.access_roles,app.access_role_memberships,app.access_rules TO cleanops_auth_broker;
GRANT SELECT,INSERT ON app.identity_reset_evidence TO cleanops_auth_broker;
GRANT SELECT ON app.auth_preferences,app.access_resources TO cleanops_auth_broker;
-- No direct service/worker/verifier table privileges, role memberships or BYPASSRLS.

CREATE FUNCTION auth_api.record_verified_recipient(t uuid,u uuid,expected_version bigint,address_hash bytea,evidence uuid,until_at timestamptz,corr uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p uuid; v bigint;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT principal_id INTO p FROM app.users WHERE tenant_id=t AND id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM identity_private.lock_principal(p);PERFORM identity_private.lock_memberships(p,ARRAY[t]);
 IF address_hash IS NULL OR octet_length(address_hash)<>32 OR evidence IS NULL OR corr IS NULL
 OR until_at IS NULL OR until_at<=clock_timestamp() OR expected_version IS NULL OR expected_version<0
 THEN RAISE EXCEPTION 'INVALID_RECIPIENT'; END IF;
 -- Proof must cover the current server address; this dedicated role is a trust boundary.
 IF address_hash IS DISTINCT FROM (SELECT crypto.digest(convert_to(email_normalized,'UTF8'),'sha256') FROM identity_private.principals WHERE id=p)
 THEN RAISE EXCEPTION 'INVALID_RECIPIENT'; END IF;
 SELECT version INTO v FROM app.verified_recipients WHERE tenant_id=t AND user_id=u FOR UPDATE;
 IF coalesce(v,0)<>expected_version THEN RETURN NULL; END IF;
 INSERT INTO app.verified_recipients VALUES(t,u,expected_version+1,address_hash,evidence,clock_timestamp(),until_at,NULL)
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET version=EXCLUDED.version,address_digest=EXCLUDED.address_digest,
 evidence_id=EXCLUDED.evidence_id,verified_at=EXCLUDED.verified_at,expires_at=EXCLUDED.expires_at,revoked_at=NULL;
 PERFORM identity_private.append_audit(t,u,'auth.recipient.verified',evidence,1,corr);RETURN expected_version+1;
END $fn$;

CREATE FUNCTION auth_api.mail_recipient_material(raw_preauth text,purpose text,grant_key text,resource uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE m jsonb; r app.verified_recipients; address text;
BEGIN
 m:=auth_api.trusted_mfa_material(raw_preauth,purpose,grant_key,resource);
 SELECT * INTO r FROM app.verified_recipients WHERE tenant_id=(m->>'tenantId')::uuid AND user_id=(m->>'userId')::uuid FOR SHARE;
 SELECT p.email_normalized INTO address FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE u.tenant_id=r.tenant_id AND u.id=r.user_id;
 IF r.version IS NULL OR r.revoked_at IS NOT NULL OR clock_timestamp()>=r.expires_at
 OR r.address_digest IS DISTINCT FROM crypto.digest(convert_to(address,'UTF8'),'sha256') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 RETURN m||jsonb_build_object('recipient',address,'recipientVersion',r.version::text,'recipientExpiresAt',r.expires_at);
END $fn$;

CREATE FUNCTION auth_api.issue_email_assigned(raw_preauth text,method uuid,expected_version bigint,recipient_version bigint,challenge uuid,outbox uuid,proof bytea,payload bytea,payload_key text,payload_expires_at timestamptz,grant_key text,resource uuid,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE material jsonb;t uuid;u uuid;q identity_private.preauth;c identity_private.tx_context;m app.mfa_methods; until_at timestamptz;
BEGIN
 material:=auth_api.mail_recipient_material(raw_preauth,CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END,grant_key,resource);
 t:=(material->>'tenantId')::uuid;u:=(material->>'userId')::uuid;
 IF raw_preauth IS NULL THEN c:=identity_private.context();ELSE q:=identity_private.checked_preauth(raw_preauth);END IF;
 SELECT * INTO m FROM app.mfa_methods WHERE tenant_id=t AND id=method AND user_id=u FOR UPDATE;
 IF NOT FOUND OR m.kind<>'EMAIL_OTP' OR m.state<>'ACTIVE' OR m.method_version IS DISTINCT FROM expected_version
 OR recipient_version IS DISTINCT FROM (material->>'recipientVersion')::bigint OR challenge IS NULL OR outbox IS NULL OR corr IS NULL
 OR proof IS NULL OR octet_length(proof)<>32 OR payload IS NULL OR octet_length(payload)<30 OR payload_key IS NULL OR length(payload_key) NOT BETWEEN 1 AND 120
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM app.mfa_challenges x WHERE x.tenant_id=t AND x.user_id=u AND x.kind='EMAIL_OTP' AND x.issued_at>clock_timestamp()-make_interval(secs=>identity_private.cfg('otp_resend_cooldown')))
 THEN RAISE EXCEPTION 'RATE_LIMITED';END IF;
 UPDATE app.mfa_challenges SET state='REVOKED' WHERE tenant_id=t AND user_id=u AND kind='EMAIL_OTP' AND state='ISSUED' AND preauth_id IS NOT DISTINCT FROM q.id AND session_id IS NOT DISTINCT FROM c.session_id;
 until_at:=payload_expires_at;
 IF until_at IS NULL OR until_at<=clock_timestamp() OR until_at>LEAST(clock_timestamp()+interval '300 seconds',(material->>'expiresAt')::timestamptz,(material->>'recipientExpiresAt')::timestamptz) THEN RAISE EXCEPTION 'INVALID_EXPIRY';END IF;
 INSERT INTO app.mfa_challenges(tenant_id,id,user_id,preauth_id,session_id,method_id,kind,purpose,state,proof_digest,attempts,grant_key,resource_id,issued_at,expires_at,method_version,recipient_version)
 VALUES(t,challenge,u,q.id,c.session_id,method,'EMAIL_OTP',CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END,'ISSUED',proof,0,grant_key,resource,clock_timestamp(),until_at,expected_version,recipient_version);
 INSERT INTO app.auth_outbox(tenant_id,id,user_id,challenge_id,event_type,payload_ciphertext,key_version,state,dedup_key,available_at,expires_at,method_id,method_version,recipient_version)
 VALUES(t,outbox,u,challenge,'EMAIL_OTP',payload,payload_key,'PENDING',challenge,clock_timestamp(),until_at,method,expected_version,recipient_version);
 PERFORM identity_private.append_audit(t,u,'auth.email.issue',challenge,1,corr); RETURN challenge;
END $fn$;

-- Worker discovery is not authorization; lock principal first, then membership,
-- method, recipient, challenge, outbox. Same principal serializes issuance/revocation.
CREATE FUNCTION identity_private.lock_mail(t uuid,k uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o app.auth_outbox;p uuid;m app.mfa_methods;r app.verified_recipients;x app.mfa_challenges;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT * INTO o FROM app.auth_outbox WHERE tenant_id=t AND id=k;
 SELECT principal_id INTO p FROM app.users WHERE tenant_id=t AND id=o.user_id;
 IF p IS NULL THEN RETURN false;END IF;
 PERFORM identity_private.lock_principal(p);PERFORM identity_private.lock_memberships(p,ARRAY[t]);
 SELECT * INTO m FROM app.mfa_methods WHERE tenant_id=t AND id=o.method_id AND user_id=o.user_id FOR UPDATE;
 SELECT * INTO r FROM app.verified_recipients WHERE tenant_id=t AND user_id=o.user_id FOR SHARE;
 SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=o.challenge_id AND user_id=o.user_id FOR UPDATE;
 SELECT * INTO o FROM app.auth_outbox WHERE tenant_id=t AND id=k FOR UPDATE;
 RETURN FOUND AND m.state=(CASE WHEN x.purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END) AND m.kind='EMAIL_OTP' AND m.method_version=o.method_version
 AND r.version=o.recipient_version AND r.revoked_at IS NULL AND r.expires_at>clock_timestamp()
 AND r.address_digest=(SELECT crypto.digest(convert_to(email_normalized,'UTF8'),'sha256') FROM identity_private.principals WHERE id=p)
 AND x.state='ISSUED' AND x.method_id=m.id AND x.method_version=m.method_version AND x.recipient_version=r.version
 AND clock_timestamp()<LEAST(x.expires_at,o.expires_at)
 AND ((x.preauth_id IS NOT NULL AND EXISTS(SELECT 1 FROM identity_private.preauth q WHERE q.id=x.preauth_id AND q.state=(CASE WHEN x.purpose='ENROLLMENT' THEN 'ENROLLMENT_REQUIRED' ELSE 'PENDING_MFA' END) AND q.credential_version=(SELECT credential_version FROM identity_private.credentials WHERE principal_id=p) AND q.expires_at>clock_timestamp()))
 OR (x.session_id IS NOT NULL AND identity_private.valid_session(t,x.session_id,o.user_id)));
END $fn$;

CREATE FUNCTION auth_api.claim_mail_v2(claim_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o app.auth_outbox;
BEGIN
 PERFORM identity_private.require_enabled();
 IF claim_hash IS NULL OR octet_length(claim_hash)<>32 OR corr IS NULL THEN RAISE EXCEPTION 'INVALID_CLAIM';END IF;
 -- Expired claims are never reclaimed; a separate quarantine sweep has no principal locks.
 SELECT * INTO o FROM app.auth_outbox WHERE state='PENDING' AND available_at<=clock_timestamp() AND expires_at>clock_timestamp() AND attempts<identity_private.cfg('outbox_max_attempts') ORDER BY available_at,id LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF identity_private.lock_mail(o.tenant_id,o.id) IS DISTINCT FROM true THEN
  UPDATE app.auth_outbox SET state='CANCELLED',payload_ciphertext=decode('','hex') WHERE tenant_id=o.tenant_id AND id=o.id AND state='PENDING';RETURN NULL;END IF;
 SELECT * INTO o FROM app.auth_outbox WHERE tenant_id=o.tenant_id AND id=o.id FOR UPDATE;
 IF o.state<>'PENDING' OR o.available_at>clock_timestamp() OR o.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 UPDATE app.auth_outbox SET state='CLAIMED',attempts=attempts+1,claim_digest=claim_hash,lease_until=clock_timestamp()+make_interval(secs=>identity_private.cfg('outbox_claim_lease')) WHERE tenant_id=o.tenant_id AND id=o.id;
 RETURN jsonb_build_object('tenantId',o.tenant_id,'userId',o.user_id,'methodId',o.method_id,'methodVersion',o.method_version::text,'recipientVersion',o.recipient_version::text,'outboxId',o.id,'challengeId',o.challenge_id,'ciphertext',encode(o.payload_ciphertext,'hex'),'keyVersion',o.key_version,'expiresAt',o.expires_at);
END $fn$;
CREATE FUNCTION auth_api.authorize_mail_dispatch(t uuid,k uuid,claim_hash bytea,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF corr IS NULL OR claim_hash IS NULL OR octet_length(claim_hash)<>32 THEN RETURN false;END IF;
 IF identity_private.lock_mail(t,k) IS DISTINCT FROM true THEN RETURN false;END IF;
 UPDATE app.auth_outbox SET state='DISPATCHING' WHERE tenant_id=t AND id=k AND state='CLAIMED' AND claim_digest=claim_hash AND lease_until>clock_timestamp();
 RETURN FOUND;
END $fn$;
CREATE FUNCTION auth_api.finish_mail_outcome_cas(t uuid,k uuid,claim_hash bytea,outcome text,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o app.auth_outbox;next_at timestamptz;next_state text;
BEGIN
 PERFORM identity_private.require_enabled();
 IF corr IS NULL OR claim_hash IS NULL OR octet_length(claim_hash)<>32 OR outcome IS NULL OR outcome NOT IN('ACCEPTED','TRANSIENT','PERMANENT','UNKNOWN') THEN RETURN false;END IF;
 SELECT * INTO o FROM app.auth_outbox WHERE tenant_id=t AND id=k AND state='DISPATCHING' AND claim_digest=claim_hash AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 next_at:=clock_timestamp()+make_interval(secs=>identity_private.cfg('outbox_retry_delay'));
 next_state:=CASE WHEN outcome='UNKNOWN' THEN 'QUARANTINED' WHEN outcome='ACCEPTED' THEN 'SENT'
 WHEN outcome='PERMANENT' OR o.attempts>=identity_private.cfg('outbox_max_attempts') OR next_at>=o.expires_at THEN 'FAILED' ELSE 'PENDING' END;
 UPDATE app.auth_outbox SET state=next_state,available_at=CASE WHEN next_state='PENDING' THEN next_at ELSE available_at END,
 claim_digest=NULL,lease_until=NULL,payload_ciphertext=CASE WHEN next_state IN('SENT','FAILED') THEN decode('','hex') ELSE payload_ciphertext END WHERE tenant_id=t AND id=k;
 PERFORM identity_private.append_audit(t,o.user_id,'auth.email.'||lower(next_state),k,1,corr);RETURN true;
END $fn$;

CREATE FUNCTION auth_api.effective_access(action_name text,kind text,resource uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;result boolean;scope_ids uuid[];scope_kinds text[];cyclic boolean;
BEGIN
 c:=identity_private.context();
 IF action_name IS NULL OR action_name NOT IN('view','create','edit','approve','delete','export','manage_permissions') OR kind IS NULL THEN RETURN false;END IF;
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF resource IS NOT NULL THEN
  -- Resource identity/ancestry is server-owned, never a caller-provided tenant claim.
  IF NOT EXISTS(SELECT 1 FROM app.access_resources WHERE tenant_id=c.tenant_id AND id=resource AND (app.access_resources.kind=effective_access.kind OR (effective_access.kind='access' AND app.access_resources.kind='users'))) THEN RETURN false;END IF;
  WITH RECURSIVE lineage AS (
   SELECT n.id,n.kind,n.parent_id,ARRAY[n.id] AS path,false AS cycle FROM app.access_resources n WHERE n.tenant_id=c.tenant_id AND n.id=resource
   UNION ALL
   SELECT n.id,n.kind,n.parent_id,l.path||n.id,n.id=ANY(l.path) FROM lineage l JOIN app.access_resources n ON n.tenant_id=c.tenant_id AND n.id=l.parent_id WHERE NOT l.cycle
  ) SELECT array_agg(id),array_agg(CASE WHEN id=resource THEN effective_access.kind ELSE lineage.kind END),bool_or(cycle) INTO scope_ids,scope_kinds,cyclic FROM lineage;
  IF cyclic IS DISTINCT FROM false THEN RETURN false;END IF;
 ELSE scope_ids:=ARRAY[]::uuid[];scope_kinds:=ARRAY[kind];END IF;
 SELECT coalesce(bool_or(r.effect='ALLOW'),false) AND NOT coalesce(bool_or(r.effect='DENY'),false) INTO result
 FROM app.access_rules r WHERE r.tenant_id=c.tenant_id AND r.action=action_name
 AND (r.resource_kind='*' OR r.resource_kind=ANY(scope_kinds)) AND (r.resource_id IS NULL OR r.resource_id=ANY(scope_ids))
 AND r.revoked_at IS NULL AND r.start_at<=clock_timestamp() AND (r.expires_at IS NULL OR clock_timestamp()<r.expires_at)
 AND (r.user_id=c.user_id OR EXISTS(SELECT 1 FROM app.access_role_memberships a JOIN app.access_roles v ON (v.tenant_id,v.id)=(a.tenant_id,a.role_id)
 WHERE a.tenant_id=c.tenant_id AND a.user_id=c.user_id AND a.role_id=r.role_id AND v.revoked_at IS NULL AND a.revoked_at IS NULL AND a.start_at<=clock_timestamp() AND (a.expires_at IS NULL OR clock_timestamp()<a.expires_at)));
 RETURN coalesce(result,false);
END $fn$;

CREATE FUNCTION auth_api.register_trusted_device(token_hash bytea,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;s app.sessions;k uuid:=gen_random_uuid();
BEGIN
 c:=identity_private.guard('B1-SELF-06',true);
 IF (SELECT trusted_devices_enabled FROM app.auth_preferences WHERE tenant_id=c.tenant_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'ACCESS_DENIED';END IF;
 SELECT * INTO s FROM app.sessions WHERE tenant_id=c.tenant_id AND id=c.session_id;
 IF token_hash IS NULL OR octet_length(token_hash)<>32 OR corr IS NULL THEN RAISE EXCEPTION 'AUTH_INVALID';END IF;
 INSERT INTO app.trusted_devices VALUES(c.tenant_id,k,c.user_id,s.principal_id,token_hash,s.credential_version,clock_timestamp(),clock_timestamp()+interval '30 days',NULL);
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.device.register',k,1,corr);RETURN k;
END $fn$;
CREATE FUNCTION auth_api.trusted_device_valid(token_hash bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;s app.sessions;
BEGIN
 c:=identity_private.context();SELECT * INTO s FROM app.sessions WHERE tenant_id=c.tenant_id AND id=c.session_id;
 RETURN token_hash IS NOT NULL AND (SELECT trusted_devices_enabled FROM app.auth_preferences WHERE tenant_id=c.tenant_id) IS TRUE AND EXISTS(SELECT 1 FROM app.trusted_devices d WHERE d.tenant_id=c.tenant_id AND d.user_id=c.user_id AND d.principal_id=s.principal_id AND d.token_digest=token_hash AND d.credential_version=s.credential_version AND d.revoked_at IS NULL AND d.expires_at>clock_timestamp());
 -- This metadata NEVER changes PREAUTH, MFA/session expiry or step-up requirements.
END $fn$;
CREATE FUNCTION auth_api.revoke_trusted_device(target uuid,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.guard('B1-SELF-06',true);
 UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND id=target AND revoked_at IS NULL;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.device.revoke',target,1,corr);RETURN true;
END $fn$;

CREATE FUNCTION auth_api.recover_to_enrollment(raw_preauth text,code_hash bytea,new_cookie bytea,new_csrf bytea,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;k uuid:=gen_random_uuid();
BEGIN
 q:=identity_private.checked_preauth(raw_preauth);
 IF q.state<>'PENDING_MFA' OR q.tenant_id IS NULL OR code_hash IS NULL OR octet_length(code_hash)<>32 OR new_cookie IS NULL OR octet_length(new_cookie)<>32 OR new_csrf IS NULL OR octet_length(new_csrf)<>32 OR corr IS NULL THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 IF auth_api.consume_recovery_internal(raw_preauth,code_hash,corr) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=q.tenant_id AND user_id=q.user_id AND state<>'REVOKED';
 UPDATE app.recovery_codes SET revoked_at=clock_timestamp() WHERE tenant_id=q.tenant_id AND user_id=q.user_id AND revoked_at IS NULL;
 UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=q.tenant_id AND user_id=q.user_id AND state='ACTIVE';
 UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE tenant_id=q.tenant_id AND user_id=q.user_id AND revoked_at IS NULL;
 UPDATE app.mfa_challenges SET state='REVOKED' WHERE tenant_id=q.tenant_id AND user_id=q.user_id AND state='ISSUED';
 UPDATE identity_private.preauth SET state='REVOKED' WHERE principal_id=q.principal_id AND tenant_id=q.tenant_id AND state NOT IN('CONSUMED','REVOKED');
 INSERT INTO identity_private.preauth(id,principal_id,tenant_id,user_id,cookie_digest,csrf_digest,state,password_verified_at,credential_version,created_at,expires_at)
 VALUES(k,q.principal_id,q.tenant_id,q.user_id,new_cookie,new_csrf,'ENROLLMENT_REQUIRED',q.password_verified_at,q.credential_version,clock_timestamp(),q.expires_at);
 PERFORM identity_private.append_audit(q.tenant_id,q.user_id,'auth.recovery.enrollment_required',k,1,corr);RETURN k;
END $fn$;

CREATE FUNCTION auth_api.rotate_preauth_tenant(raw_preauth text,target uuid,new_cookie bytea,new_csrf bytea,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;u uuid;k uuid:=gen_random_uuid();next_state text;
BEGIN
 q:=identity_private.checked_preauth(raw_preauth);
 IF q.state NOT IN('SELECTION','PENDING_MFA','ENROLLMENT_REQUIRED') OR target IS NULL OR corr IS NULL OR new_cookie IS NULL OR octet_length(new_cookie)<>32 OR new_csrf IS NULL OR octet_length(new_csrf)<>32 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 PERFORM identity_private.lock_memberships(q.principal_id,ARRAY[target]);
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=target FOR SHARE;
 IF NOT FOUND OR NOT identity_private.rule_allowed(target,'B1-SELF-08') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT id INTO u FROM app.users WHERE tenant_id=target AND principal_id=q.principal_id AND state='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID';END IF;
 next_state:=CASE WHEN EXISTS(SELECT 1 FROM app.mfa_methods WHERE tenant_id=target AND user_id=u AND state='ACTIVE') THEN 'PENDING_MFA' ELSE 'ENROLLMENT_REQUIRED' END;
 UPDATE identity_private.preauth SET state='CONSUMED' WHERE id=q.id;
 INSERT INTO identity_private.preauth(id,principal_id,tenant_id,user_id,cookie_digest,csrf_digest,state,password_verified_at,credential_version,origin_tenant_id,origin_session_id,created_at,expires_at)
 VALUES(k,q.principal_id,target,u,new_cookie,new_csrf,next_state,q.password_verified_at,q.credential_version,q.origin_tenant_id,q.origin_session_id,clock_timestamp(),q.expires_at);
 PERFORM identity_private.append_audit(target,u,'auth.preauth.rotate',k,1,corr);RETURN k;
END $fn$;

CREATE FUNCTION auth_api.begin_email_enrollment(raw_preauth text,assigned_method uuid,recipient_version bigint,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j jsonb;t uuid;u uuid;q uuid;s uuid;
BEGIN
 j:=auth_api.mail_recipient_material(raw_preauth,'ENROLLMENT',NULL,NULL);t:=(j->>'tenantId')::uuid;u:=(j->>'userId')::uuid;
 IF assigned_method IS NULL OR corr IS NULL OR recipient_version IS DISTINCT FROM (j->>'recipientVersion')::bigint THEN RAISE EXCEPTION 'AUTH_INVALID';END IF;
 IF raw_preauth IS NULL THEN s:=(j->>'bindingId')::uuid;ELSE q:=(j->>'bindingId')::uuid;END IF;
 INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,created_at,enrollment_preauth_id,enrollment_session_id,method_version)
 VALUES(t,assigned_method,u,'EMAIL_OTP','PENDING',clock_timestamp(),q,s,1);
 PERFORM identity_private.append_audit(t,u,'auth.email.enrollment.begin',assigned_method,1,corr);RETURN assigned_method;
END $fn$;
CREATE FUNCTION auth_api.issue_email_enrollment(raw_preauth text,method uuid,expected_version bigint,recipient_version bigint,challenge uuid,outbox uuid,proof bytea,payload bytea,payload_key text,payload_expires_at timestamptz,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j jsonb;t uuid;u uuid;q uuid;s uuid;m app.mfa_methods;until_at timestamptz;
BEGIN
 j:=auth_api.mail_recipient_material(raw_preauth,'ENROLLMENT',NULL,NULL);t:=(j->>'tenantId')::uuid;u:=(j->>'userId')::uuid;
 IF raw_preauth IS NULL THEN s:=(j->>'bindingId')::uuid;ELSE q:=(j->>'bindingId')::uuid;END IF;
 SELECT * INTO m FROM app.mfa_methods WHERE tenant_id=t AND id=method AND user_id=u FOR UPDATE;
 IF NOT FOUND OR m.kind<>'EMAIL_OTP' OR m.state<>'PENDING' OR m.method_version IS DISTINCT FROM expected_version
 OR ROW(m.enrollment_preauth_id,m.enrollment_session_id) IS DISTINCT FROM ROW(q,s)
 OR recipient_version IS DISTINCT FROM (j->>'recipientVersion')::bigint OR challenge IS NULL OR outbox IS NULL OR corr IS NULL
 OR proof IS NULL OR octet_length(proof)<>32 OR payload IS NULL OR octet_length(payload)<30 OR payload_key IS NULL OR length(payload_key) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'AUTH_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM app.mfa_challenges x WHERE x.tenant_id=t AND x.user_id=u AND x.kind='EMAIL_OTP' AND x.issued_at>clock_timestamp()-make_interval(secs=>identity_private.cfg('otp_resend_cooldown'))) THEN RAISE EXCEPTION 'RATE_LIMITED';END IF;
 UPDATE app.mfa_challenges SET state='REVOKED' WHERE tenant_id=t AND user_id=u AND kind='EMAIL_OTP' AND purpose='ENROLLMENT' AND state='ISSUED' AND preauth_id IS NOT DISTINCT FROM q AND session_id IS NOT DISTINCT FROM s;
 until_at:=payload_expires_at;
 IF until_at IS NULL OR until_at<=clock_timestamp() OR until_at>LEAST(clock_timestamp()+interval '300 seconds',(j->>'expiresAt')::timestamptz,(j->>'recipientExpiresAt')::timestamptz) THEN RAISE EXCEPTION 'INVALID_EXPIRY';END IF;
 INSERT INTO app.mfa_challenges(tenant_id,id,user_id,preauth_id,session_id,method_id,kind,purpose,state,proof_digest,attempts,issued_at,expires_at,method_version,recipient_version)
 VALUES(t,challenge,u,q,s,method,'EMAIL_OTP','ENROLLMENT','ISSUED',proof,0,clock_timestamp(),until_at,expected_version,recipient_version);
 INSERT INTO app.auth_outbox(tenant_id,id,user_id,challenge_id,event_type,payload_ciphertext,key_version,state,dedup_key,available_at,expires_at,method_id,method_version,recipient_version)
 VALUES(t,outbox,u,challenge,'EMAIL_OTP',payload,payload_key,'PENDING',challenge,clock_timestamp(),until_at,method,expected_version,recipient_version);
 PERFORM identity_private.append_audit(t,u,'auth.email.enrollment.issue',method,1,corr);RETURN challenge;
END $fn$;
CREATE FUNCTION auth_api.consume_email_v2(raw_preauth text,challenge uuid,submitted_digest bytea,expected_version bigint,recipient_version bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;c identity_private.tx_context;t uuid;u uuid;x app.mfa_challenges;m app.mfa_methods;r app.verified_recipients;ok boolean;pv bigint;
BEGIN
 IF raw_preauth IS NULL THEN c:=identity_private.context();t:=c.tenant_id;u:=c.user_id;ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id;END IF;
 IF corr IS NULL OR expected_version IS NULL OR expected_version<1 OR recipient_version IS NULL OR recipient_version<1 OR submitted_digest IS NULL OR octet_length(submitted_digest)<>32 THEN RETURN false;END IF;
 SELECT version INTO pv FROM app.policy_versions WHERE tenant_id=t FOR SHARE;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=challenge AND user_id=u;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO m FROM app.mfa_methods WHERE tenant_id=t AND id=x.method_id AND user_id=u FOR UPDATE;
 SELECT * INTO r FROM app.verified_recipients WHERE tenant_id=t AND user_id=u FOR SHARE;
 SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=challenge AND user_id=u FOR UPDATE;
 IF NOT FOUND OR r.version IS NULL OR m.id IS NULL OR x.kind<>'EMAIL_OTP' OR x.state<>'ISSUED' OR m.kind<>'EMAIL_OTP'
 OR ROW(m.method_version,x.method_version,r.version,x.recipient_version) IS DISTINCT FROM ROW(expected_version,expected_version,recipient_version,recipient_version)
 OR r.revoked_at IS NOT NULL OR clock_timestamp()>=LEAST(r.expires_at,x.expires_at)
 OR r.address_digest IS DISTINCT FROM (SELECT crypto.digest(convert_to(p.email_normalized,'UTF8'),'sha256') FROM app.users a JOIN identity_private.principals p ON p.id=a.principal_id WHERE a.tenant_id=t AND a.id=u)
 OR (raw_preauth IS NULL AND x.session_id IS DISTINCT FROM c.session_id) OR (raw_preauth IS NOT NULL AND x.preauth_id IS DISTINCT FROM q.id)
 OR (x.purpose='ENROLLMENT' AND (m.state<>'PENDING' OR ROW(m.enrollment_preauth_id,m.enrollment_session_id) IS DISTINCT FROM ROW(q.id,c.session_id)))
 OR (x.purpose<>'ENROLLMENT' AND m.state<>'ACTIVE')
 OR (raw_preauth IS NOT NULL AND ((x.purpose='ENROLLMENT' AND q.state<>'ENROLLMENT_REQUIRED') OR (x.purpose='LOGIN' AND q.state<>'PENDING_MFA') OR x.purpose='STEP_UP'))
 OR (raw_preauth IS NULL AND (x.purpose NOT IN('ENROLLMENT','STEP_UP') OR (x.purpose='ENROLLMENT' AND NOT EXISTS(SELECT 1 FROM auth_api.binding_authorization(NULL,'B1-SELF-06',NULL) a WHERE a.allowed AND a.step_up))))
 OR (x.purpose='STEP_UP' AND NOT EXISTS(SELECT 1 FROM auth_api.binding_authorization(NULL,x.grant_key,x.resource_id) a WHERE a.allowed))
 THEN RETURN false;END IF;
 IF x.attempts>=identity_private.cfg('otp_attempts') THEN RETURN false;END IF;
 ok:=x.proof_digest=submitted_digest;
 UPDATE app.mfa_challenges SET attempts=attempts+1,state=CASE WHEN ok THEN 'VERIFIED' WHEN attempts+1>=identity_private.cfg('otp_attempts') THEN 'EXHAUSTED' ELSE 'ISSUED' END,consumed_at=CASE WHEN ok THEN clock_timestamp() ELSE NULL END WHERE tenant_id=t AND id=challenge;
 IF NOT ok THEN RETURN false;END IF;
 IF x.purpose='ENROLLMENT' THEN UPDATE app.mfa_methods SET state='ACTIVE' WHERE tenant_id=t AND id=m.id;END IF;
 IF x.purpose='STEP_UP' THEN
  INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,resource_id,verified_at,expires_at,policy_version)
  VALUES(t,gen_random_uuid(),u,c.session_id,x.grant_key,x.resource_id,clock_timestamp(),clock_timestamp()+make_interval(secs=>identity_private.cfg('step_up_ttl')),pv);
 ELSIF raw_preauth IS NOT NULL THEN UPDATE identity_private.preauth SET state='VERIFIED',factor_verified_at=clock_timestamp() WHERE id=q.id;END IF;
 PERFORM identity_private.append_audit(t,u,'auth.email.verify',challenge,1,corr);RETURN true;
END $fn$;

CREATE TABLE identity_private.reset_tickets (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,user_id uuid NOT NULL,principal_id uuid NOT NULL,
 token_digest bytea NOT NULL UNIQUE CHECK(octet_length(token_digest)=32),purpose text NOT NULL CHECK(purpose IN('PASSWORD','MFA_RESET')),
 credential_version bigint NOT NULL,evidence_id uuid NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,
 FOREIGN KEY(tenant_id,user_id,principal_id) REFERENCES app.users(tenant_id,id,principal_id),CHECK(expires_at>created_at)
);
ALTER TABLE identity_private.reset_tickets OWNER TO cleanops_ddl_owner;
ALTER TABLE identity_private.reset_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_private.reset_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY broker_internal ON identity_private.reset_tickets TO cleanops_auth_broker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON identity_private.reset_tickets TO cleanops_auth_broker;
CREATE FUNCTION auth_api.attest_reset(t uuid,u uuid,token_hash bytea,purpose_name text,evidence uuid,until_at timestamptz,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p uuid;v bigint;k uuid:=gen_random_uuid();
BEGIN
 SELECT principal_id INTO p FROM app.users WHERE tenant_id=t AND id=u;
 PERFORM identity_private.lock_principal(p);PERFORM identity_private.lock_memberships(p,ARRAY[t]);
 IF token_hash IS NULL OR octet_length(token_hash)<>32 OR evidence IS NULL OR corr IS NULL OR purpose_name IS NULL OR purpose_name NOT IN('PASSWORD','MFA_RESET') OR until_at IS NULL OR until_at<=clock_timestamp() OR until_at>clock_timestamp()+make_interval(secs=>identity_private.cfg('preauth_ttl')) THEN RAISE EXCEPTION 'AUTH_INVALID';END IF;
 SELECT credential_version INTO v FROM identity_private.credentials WHERE principal_id=p;
 INSERT INTO identity_private.reset_tickets VALUES(k,t,u,p,token_hash,purpose_name,v,evidence,clock_timestamp(),until_at,NULL);
 PERFORM identity_private.append_audit(t,u,'auth.reset.attest',k,1,corr);RETURN k;
END $fn$;
CREATE FUNCTION auth_api.reset_password_cas(token_hash bytea,expected_version bigint,recovery_hash bytea,replacement_hash text,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_private.reset_tickets;ts uuid[];
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT * INTO r FROM identity_private.reset_tickets WHERE token_digest=token_hash AND purpose='PASSWORD';
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM identity_private.lock_principal(r.principal_id);
 SELECT array_agg(tenant_id ORDER BY tenant_id) INTO ts FROM app.users WHERE principal_id=r.principal_id;
 PERFORM identity_private.lock_memberships(r.principal_id,ts);
 SELECT * INTO r FROM identity_private.reset_tickets WHERE id=r.id FOR UPDATE;
 IF r.consumed_at IS NOT NULL OR clock_timestamp()>=r.expires_at OR r.credential_version IS DISTINCT FROM expected_version
 OR expected_version IS DISTINCT FROM (SELECT credential_version FROM identity_private.credentials WHERE principal_id=r.principal_id)
 OR recovery_hash IS NULL OR octet_length(recovery_hash)<>32 OR replacement_hash IS NULL OR left(replacement_hash,10)<>'$argon2id$' OR corr IS NULL THEN RETURN false;END IF;
 UPDATE app.recovery_codes SET consumed_at=clock_timestamp() WHERE tenant_id=r.tenant_id AND user_id=r.user_id AND digest=recovery_hash AND consumed_at IS NULL AND revoked_at IS NULL;
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE identity_private.credentials SET argon2id_hash=replacement_hash,credential_version=credential_version+1,changed_at=clock_timestamp() WHERE principal_id=r.principal_id AND credential_version=expected_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'CREDENTIAL_CAS_FAILED';END IF;
 UPDATE identity_private.reset_tickets SET consumed_at=clock_timestamp() WHERE principal_id=r.principal_id AND consumed_at IS NULL;
 UPDATE identity_private.preauth SET state='REVOKED' WHERE principal_id=r.principal_id AND state NOT IN('CONSUMED','REVOKED');
 UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE principal_id=r.principal_id AND state='ACTIVE';
 UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE principal_id=r.principal_id AND revoked_at IS NULL;
 PERFORM identity_private.append_audit(r.tenant_id,r.user_id,'auth.password.reset',r.id,1,corr);RETURN true;
 -- No session issued. Next login still requires the approved MFA policy.
END $fn$;
CREATE FUNCTION auth_api.admin_reset_mfa(target uuid,ticket_hash bytea,reason text,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;r identity_private.reset_tickets;actor uuid;subject uuid;p uuid;
BEGIN
 -- Discovery ONLY, followed by sorted principal locks before context validation.
 SELECT s.principal_id INTO actor FROM identity_private.tx_context x JOIN app.sessions s ON(s.tenant_id,s.id)=(x.tenant_id,x.session_id) WHERE x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id();
 SELECT * INTO r FROM identity_private.reset_tickets WHERE token_digest=ticket_hash AND user_id=target AND purpose='MFA_RESET';
 subject:=r.principal_id;
 IF actor IS NULL OR subject IS NULL OR actor=subject THEN RETURN false;END IF;
 FOR p IN SELECT v FROM unnest(ARRAY[actor,subject]) v ORDER BY v LOOP PERFORM identity_private.lock_principal(p);END LOOP;
 c:=identity_private.context();
 IF r.tenant_id IS DISTINCT FROM c.tenant_id OR target=c.user_id OR corr IS NULL OR reason IS NULL OR length(reason) NOT BETWEEN 1 AND 500 THEN RETURN false;END IF;
 PERFORM identity_private.lock_memberships(subject,ARRAY[c.tenant_id]);
 -- No privilege derives from B1-SELF: RBAC is required independently, DENY wins.
 IF NOT auth_api.effective_access('edit','users',target) OR NOT auth_api.effective_access('manage_permissions','access',target) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 SELECT * INTO r FROM identity_private.reset_tickets WHERE id=r.id FOR UPDATE;
 IF r.consumed_at IS NOT NULL OR clock_timestamp()>=r.expires_at OR r.credential_version IS DISTINCT FROM (SELECT credential_version FROM identity_private.credentials WHERE principal_id=subject) THEN RETURN false;END IF;
 UPDATE identity_private.reset_tickets SET consumed_at=clock_timestamp() WHERE id=r.id;
 UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=c.tenant_id AND user_id=target AND state<>'REVOKED';
 UPDATE app.recovery_codes SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND revoked_at IS NULL;
 UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND state='ACTIVE';
 UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND revoked_at IS NULL;
 UPDATE app.mfa_challenges SET state='REVOKED' WHERE tenant_id=c.tenant_id AND user_id=target AND state='ISSUED';
 UPDATE identity_private.preauth SET state='REVOKED' WHERE principal_id=subject AND tenant_id=c.tenant_id AND state NOT IN('CONSUMED','REVOKED');
 INSERT INTO app.identity_reset_evidence VALUES(c.tenant_id,gen_random_uuid(),target,c.user_id,reason,r.evidence_id,clock_timestamp());
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.mfa.admin_reset',target,1,corr);RETURN true;
END $fn$;

CREATE FUNCTION auth_api.quarantine_expired_mail(corr uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE n integer;
BEGIN
 PERFORM identity_private.require_enabled();IF corr IS NULL THEN RAISE EXCEPTION 'INVALID_CORRELATION';END IF;
 UPDATE app.auth_outbox SET state='QUARANTINED',claim_digest=NULL,lease_until=NULL
 WHERE state IN('CLAIMED','DISPATCHING') AND lease_until<=clock_timestamp();GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
 -- Dedicated short transaction: do not combine with claim/dispatch principal locks.
END $fn$;
CREATE FUNCTION auth_api.set_user_access_rule(target uuid,rule_id uuid,action_name text,kind text,resource uuid,effect_name text,starts timestamptz,ends timestamptz,expected_policy bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.context();
 -- Exclusive policy lock BEFORE any authorization SHARE lock; no lock upgrade.
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id AND version=expected_policy FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF NOT auth_api.effective_access('manage_permissions','access',target) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 IF NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=target AND state='ACTIVE')
 OR action_name IS NULL OR action_name NOT IN('view','create','edit','approve','delete','export','manage_permissions')
 OR kind IS NULL OR length(kind) NOT BETWEEN 1 AND 80 OR kind='*' OR effect_name IS NULL OR effect_name NOT IN('ALLOW','DENY')
 OR starts IS NULL OR (ends IS NOT NULL AND ends<=starts) OR rule_id IS NULL OR corr IS NULL THEN RETURN false;END IF;
 -- No delegation above actor's own effective authorization. No implicit admin role.
 IF effect_name='ALLOW' AND NOT auth_api.effective_access(action_name,kind,resource) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM app.access_rules WHERE tenant_id=c.tenant_id AND id=rule_id AND user_id IS DISTINCT FROM target) THEN RETURN false;END IF;
 INSERT INTO app.access_rules VALUES(c.tenant_id,rule_id,NULL,target,action_name,kind,resource,effect_name,starts,ends,NULL)
 ON CONFLICT(tenant_id,id) DO UPDATE SET action=EXCLUDED.action,resource_kind=EXCLUDED.resource_kind,resource_id=EXCLUDED.resource_id,effect=EXCLUDED.effect,start_at=EXCLUDED.start_at,expires_at=EXCLUDED.expires_at,revoked_at=NULL;
 UPDATE app.policy_versions SET version=version+1 WHERE tenant_id=c.tenant_id;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.access.change',target,1,corr);RETURN true;
END $fn$;

CREATE FUNCTION auth_api.set_access_role(role uuid,label text,expected_policy bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.context();PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id AND version=expected_policy FOR UPDATE;
 IF NOT FOUND OR NOT auth_api.effective_access('manage_permissions','access',NULL) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 IF role IS NULL OR label IS NULL OR length(label) NOT BETWEEN 1 AND 120 OR corr IS NULL THEN RETURN false;END IF;
 INSERT INTO app.access_roles VALUES(c.tenant_id,role,label,NULL) ON CONFLICT(tenant_id,id) DO UPDATE SET label=EXCLUDED.label,revoked_at=NULL;
 UPDATE app.policy_versions SET version=version+1 WHERE tenant_id=c.tenant_id;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.role.change',role,1,corr);RETURN true;
END $fn$;
CREATE FUNCTION auth_api.set_role_membership(role uuid,target uuid,starts timestamptz,ends timestamptz,expected_policy bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;r app.access_rules;
BEGIN
 c:=identity_private.context();PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id AND version=expected_policy FOR UPDATE;
 IF NOT FOUND OR NOT auth_api.effective_access('manage_permissions','access',target) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 IF starts IS NULL OR (ends IS NOT NULL AND ends<=starts) OR corr IS NULL OR NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=target AND state='ACTIVE') OR NOT EXISTS(SELECT 1 FROM app.access_roles WHERE tenant_id=c.tenant_id AND id=role AND revoked_at IS NULL) THEN RETURN false;END IF;
 FOR r IN SELECT * FROM app.access_rules WHERE tenant_id=c.tenant_id AND role_id=role AND revoked_at IS NULL AND effect='ALLOW' LOOP
  IF NOT auth_api.effective_access(r.action,r.resource_kind,r.resource_id) THEN RETURN false;END IF;
 END LOOP;
 INSERT INTO app.access_role_memberships VALUES(c.tenant_id,role,target,starts,ends,NULL)
 ON CONFLICT(tenant_id,role_id,user_id) DO UPDATE SET start_at=EXCLUDED.start_at,expires_at=EXCLUDED.expires_at,revoked_at=NULL;
 UPDATE app.policy_versions SET version=version+1 WHERE tenant_id=c.tenant_id;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.role.assign',target,1,corr);RETURN true;
END $fn$;
CREATE FUNCTION auth_api.set_role_access_rule(role uuid,rule_id uuid,action_name text,kind text,resource uuid,effect_name text,starts timestamptz,ends timestamptz,expected_policy bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.context();PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id AND version=expected_policy FOR UPDATE;
 IF NOT FOUND OR NOT auth_api.effective_access('manage_permissions','access',NULL) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 IF NOT EXISTS(SELECT 1 FROM app.access_roles WHERE tenant_id=c.tenant_id AND id=role AND revoked_at IS NULL)
 OR action_name IS NULL OR action_name NOT IN('view','create','edit','approve','delete','export','manage_permissions') OR kind IS NULL OR kind='*' OR length(kind) NOT BETWEEN 1 AND 80 OR effect_name IS NULL OR effect_name NOT IN('ALLOW','DENY') OR starts IS NULL OR (ends IS NOT NULL AND ends<=starts) OR rule_id IS NULL OR corr IS NULL THEN RETURN false;END IF;
 IF effect_name='ALLOW' AND NOT auth_api.effective_access(action_name,kind,resource) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM app.access_rules WHERE tenant_id=c.tenant_id AND id=rule_id AND role_id IS DISTINCT FROM role) THEN RETURN false;END IF;
 INSERT INTO app.access_rules VALUES(c.tenant_id,rule_id,role,NULL,action_name,kind,resource,effect_name,starts,ends,NULL)
 ON CONFLICT(tenant_id,id) DO UPDATE SET action=EXCLUDED.action,resource_kind=EXCLUDED.resource_kind,resource_id=EXCLUDED.resource_id,effect=EXCLUDED.effect,start_at=EXCLUDED.start_at,expires_at=EXCLUDED.expires_at,revoked_at=NULL;
 UPDATE app.policy_versions SET version=version+1 WHERE tenant_id=c.tenant_id;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.role.permission',role,1,corr);RETURN true;
END $fn$;
CREATE FUNCTION auth_api.revoke_access_assignment(kind text,target uuid,subject uuid,expected_policy bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;n integer;
BEGIN
 c:=identity_private.context();PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id AND version=expected_policy FOR UPDATE;
 IF NOT FOUND OR NOT auth_api.effective_access('manage_permissions','access',subject) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 IF corr IS NULL OR target IS NULL OR kind IS NULL OR kind NOT IN('RULE','ROLE','MEMBERSHIP') THEN RETURN false;END IF;
 IF kind='RULE' THEN UPDATE app.access_rules SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND id=target AND revoked_at IS NULL AND (user_id=subject OR (role_id IS NOT NULL AND subject IS NULL));
 ELSIF kind='ROLE' THEN
  IF subject IS NOT NULL OR NOT auth_api.effective_access('manage_permissions','access',NULL) THEN RETURN false;END IF;
  UPDATE app.access_roles SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND id=target AND revoked_at IS NULL;
 ELSE UPDATE app.access_role_memberships SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND role_id=target AND user_id=subject AND revoked_at IS NULL;END IF;
 GET DIAGNOSTICS n=ROW_COUNT;IF n=0 THEN RETURN false;END IF;
 UPDATE app.policy_versions SET version=version+1 WHERE tenant_id=c.tenant_id;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.access.revoke',target,n,corr);RETURN true;
END $fn$;
CREATE FUNCTION auth_api.access_detail(target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;j jsonb;
BEGIN
 c:=identity_private.context();
 IF NOT auth_api.effective_access('view','access',target) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=target) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 j:=jsonb_build_object('policyVersion',(SELECT version::text FROM app.policy_versions WHERE tenant_id=c.tenant_id),
 'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'startAt',a.start_at,'expiresAt',a.expires_at)) FROM app.access_roles r JOIN app.access_role_memberships a ON(a.tenant_id,a.role_id)=(r.tenant_id,r.id) WHERE r.tenant_id=c.tenant_id AND a.user_id=target AND r.revoked_at IS NULL AND a.revoked_at IS NULL),'[]'::jsonb),
 'rules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'roleId',r.role_id,'action',r.action,'resourceKind',r.resource_kind,'resourceId',r.resource_id,'effect',r.effect,'startAt',r.start_at,'expiresAt',r.expires_at)) FROM app.access_rules r WHERE r.tenant_id=c.tenant_id AND r.revoked_at IS NULL AND (r.user_id=target OR EXISTS(SELECT 1 FROM app.access_role_memberships a WHERE a.tenant_id=c.tenant_id AND a.user_id=target AND a.role_id=r.role_id AND a.revoked_at IS NULL))),'[]'::jsonb));
 IF octet_length(j::text)>identity_private.cfg('json_body_max') THEN RAISE EXCEPTION 'RESPONSE_LIMIT';END IF;RETURN j;
END $fn$;
CREATE FUNCTION auth_api.admin_revoke_trusted_devices(target uuid,corr uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;n integer;
BEGIN
 c:=identity_private.context();IF corr IS NULL OR NOT auth_api.effective_access('edit','users',target) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND revoked_at IS NULL;GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.device.admin_revoke',target,n,corr);RETURN n;
END $fn$;

CREATE FUNCTION auth_api.own_trusted_devices(page_size integer,before_time timestamptz,before_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;j jsonb;
BEGIN
 c:=identity_private.guard('B1-SELF-02');
 IF page_size IS NULL OR page_size<1 OR page_size>identity_private.cfg('page_max') OR (before_time IS NULL)<>(before_id IS NULL) THEN RAISE EXCEPTION 'INVALID_PAGE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'createdAt',d.created_at,'expiresAt',d.expires_at) ORDER BY d.created_at DESC,d.id DESC),'[]'::jsonb) INTO j FROM
 (SELECT id,created_at,expires_at FROM app.trusted_devices WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND revoked_at IS NULL AND expires_at>clock_timestamp() AND (before_time IS NULL OR (created_at,id)<(before_time,before_id)) ORDER BY created_at DESC,id DESC LIMIT page_size) d;
 RETURN j;
END $fn$;
