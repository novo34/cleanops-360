-- Durable recovery authorization: expiration never grants a password-only fallback.
CREATE TABLE identity_private.recovery_enrollments (
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,principal_id uuid NOT NULL,
 cookie_digest bytea NOT NULL CHECK(octet_length(cookie_digest)=32),
 credential_version bigint NOT NULL CHECK(credential_version>0),created_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id,principal_id) REFERENCES app.users(tenant_id,id,principal_id) ON DELETE RESTRICT
);
ALTER TABLE identity_private.recovery_enrollments OWNER TO cleanops_ddl_owner;
ALTER TABLE identity_private.recovery_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_private.recovery_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY broker_internal ON identity_private.recovery_enrollments TO cleanops_auth_broker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE ON identity_private.recovery_enrollments TO cleanops_auth_broker;

CREATE OR REPLACE FUNCTION identity_private.checked_preauth(raw_cookie text) RETURNS identity_private.preauth
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; initial identity_private.preauth; origin app.sessions;
BEGIN
 IF raw_cookie IS NULL OR raw_cookie !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO initial FROM identity_private.preauth WHERE cookie_digest=crypto.digest(convert_to(raw_cookie,'UTF8'),'sha256');
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM identity_private.lock_principal(initial.principal_id);
 IF initial.origin_session_id IS NOT NULL THEN
  SELECT * INTO origin FROM app.sessions WHERE tenant_id=initial.origin_tenant_id AND id=initial.origin_session_id FOR NO KEY UPDATE;
  IF NOT FOUND OR origin.principal_id<>initial.principal_id THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO q FROM identity_private.preauth WHERE id=initial.id FOR UPDATE;
 IF NOT FOUND OR q.principal_id<>initial.principal_id
 OR ROW(q.origin_tenant_id,q.origin_session_id) IS DISTINCT FROM ROW(initial.origin_tenant_id,initial.origin_session_id)
 OR q.state IN('CONSUMED','REVOKED') OR clock_timestamp()>=q.expires_at
 OR q.credential_version<>(SELECT credential_version FROM identity_private.credentials WHERE principal_id=q.principal_id)
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM identity_private.lock_memberships(q.principal_id,ARRAY[q.tenant_id,q.origin_tenant_id]);
 IF q.tenant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=q.tenant_id AND id=q.user_id AND principal_id=q.principal_id AND state='ACTIVE')
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF q.origin_session_id IS NOT NULL AND (NOT identity_private.valid_session(origin.tenant_id,origin.id,origin.user_id)
 OR clock_timestamp()>=LEAST(origin.absolute_expires_at,origin.idle_expires_at))
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM identity_private.recovery_enrollments AS pending
 WHERE pending.tenant_id=q.tenant_id AND pending.user_id=q.user_id
 AND (pending.principal_id IS DISTINCT FROM q.principal_id
 OR pending.cookie_digest IS DISTINCT FROM q.cookie_digest
 OR pending.credential_version IS DISTINCT FROM q.credential_version))
 THEN RAISE EXCEPTION 'RECOVERY_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN q;
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
 INSERT INTO identity_private.recovery_enrollments(tenant_id,user_id,principal_id,cookie_digest,credential_version,created_at)
 VALUES(q.tenant_id,q.user_id,q.principal_id,new_cookie,q.credential_version,clock_timestamp());
 PERFORM identity_private.append_audit(q.tenant_id,q.user_id,'auth.recovery.enrollment_required',k,1,corr);RETURN k;
END $fn$;
CREATE FUNCTION auth_api.issue_active_session(raw_preauth text,new_token_hash bytea,new_csrf_hash bytea,absolute_seconds integer,idle_seconds integer,device text,browser text,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;k uuid:=gen_random_uuid();cv bigint;origin_user uuid; risk text;
BEGIN
 q:=identity_private.checked_preauth(raw_preauth);
 IF q.state<>'VERIFIED' OR q.factor_verified_at IS NULL OR q.tenant_id IS NULL THEN RAISE EXCEPTION 'MFA_REQUIRED' USING ERRCODE='42501'; END IF;
 IF absolute_seconds NOT IN(identity_private.cfg('absolute_sensitive'),identity_private.cfg('absolute_operational')) OR idle_seconds NOT IN(1800,28800) OR octet_length(new_token_hash)<>32 OR octet_length(new_csrf_hash)<>32 THEN RAISE EXCEPTION 'INVALID_SESSION_POLICY'; END IF;
 SELECT risk_class INTO risk FROM app.users WHERE tenant_id=q.tenant_id AND id=q.user_id;
 IF absolute_seconds<>(CASE WHEN risk='SENSITIVE' THEN identity_private.cfg('absolute_sensitive') ELSE identity_private.cfg('absolute_operational') END)
 OR idle_seconds<>(CASE WHEN risk='SENSITIVE' THEN 1800 ELSE 28800 END) THEN RAISE EXCEPTION 'RISK_POLICY_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.users u JOIN app.organizations o ON o.id=u.tenant_id WHERE u.tenant_id=q.tenant_id AND u.id=q.user_id AND u.state='ACTIVE' AND o.state='ACTIVE') THEN RAISE EXCEPTION 'INVALID_SUBJECT'; END IF;
 IF q.origin_session_id IS NOT NULL THEN
  SELECT user_id INTO origin_user FROM app.sessions WHERE tenant_id=q.origin_tenant_id AND id=q.origin_session_id FOR NO KEY UPDATE;
  IF NOT identity_private.valid_session(q.origin_tenant_id,q.origin_session_id,origin_user) OR NOT identity_private.rule_allowed(q.tenant_id,'B1-SELF-08') THEN RAISE EXCEPTION 'INVALID_SWITCH'; END IF;
 END IF;
 SELECT credential_version INTO cv FROM identity_private.credentials WHERE principal_id=q.principal_id;
 INSERT INTO app.sessions(tenant_id,id,user_id,principal_id,token_digest,csrf_digest,state,created_at,last_activity_at,absolute_expires_at,idle_expires_at,idle_seconds,credential_version,mfa_verified_at,device_label,browser_label)
 VALUES(q.tenant_id,k,q.user_id,q.principal_id,new_token_hash,new_csrf_hash,'ACTIVE',clock_timestamp(),clock_timestamp(),clock_timestamp()+make_interval(secs=>absolute_seconds),clock_timestamp()+make_interval(secs=>idle_seconds),idle_seconds,cv,q.factor_verified_at,device,browser);
 IF q.origin_session_id IS NOT NULL THEN
  UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=q.origin_tenant_id AND id=q.origin_session_id;
  PERFORM identity_private.append_audit(q.origin_tenant_id,origin_user,'tenant.switch.out',q.origin_session_id,1,corr);
 END IF;
 DELETE FROM identity_private.recovery_enrollments WHERE tenant_id=q.tenant_id AND user_id=q.user_id
 AND principal_id=q.principal_id AND cookie_digest=q.cookie_digest AND credential_version=q.credential_version;
 UPDATE identity_private.preauth SET state='CONSUMED' WHERE id=q.id;
 PERFORM identity_private.append_audit(q.tenant_id,q.user_id,CASE WHEN q.origin_session_id IS NULL THEN 'auth.login' ELSE 'tenant.switch.in' END,k,1,corr);
 RETURN (SELECT jsonb_build_object('state','ACTIVE','session_id',s.id,'tenant_id',s.tenant_id,'absolute_expires_at',s.absolute_expires_at) FROM app.sessions s WHERE s.tenant_id=q.tenant_id AND s.id=k);
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
 PERFORM identity_private.lock_pair_nowait(actor,subject);
 c:=identity_private.context();
 IF r.tenant_id IS DISTINCT FROM c.tenant_id OR target=c.user_id OR corr IS NULL OR reason IS NULL OR length(reason) NOT BETWEEN 1 AND 500 THEN RETURN false;END IF;
 PERFORM identity_private.lock_memberships(subject,ARRAY[c.tenant_id]);
 -- No privilege derives from B1-SELF: RBAC is required independently, DENY wins.
 IF NOT auth_api.effective_access('edit','users',target) OR NOT auth_api.effective_access('manage_permissions','access',target) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 SELECT * INTO r FROM identity_private.reset_tickets WHERE id=r.id FOR UPDATE;
 IF r.consumed_at IS NOT NULL OR clock_timestamp()>=r.expires_at OR r.credential_version IS DISTINCT FROM (SELECT credential_version FROM identity_private.credentials WHERE principal_id=subject) THEN RETURN false;END IF;
 UPDATE identity_private.reset_tickets SET consumed_at=clock_timestamp() WHERE id=r.id;
 -- Existing independently attested/admin-authorized reset is the recovery escape path.
 DELETE FROM identity_private.recovery_enrollments WHERE tenant_id=c.tenant_id AND user_id=target;
 UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=c.tenant_id AND user_id=target AND state<>'REVOKED';
 UPDATE app.recovery_codes SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND revoked_at IS NULL;
 UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND state='ACTIVE';
 UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND revoked_at IS NULL;
 UPDATE app.mfa_challenges SET state='REVOKED' WHERE tenant_id=c.tenant_id AND user_id=target AND state='ISSUED';
 UPDATE identity_private.preauth SET state='REVOKED' WHERE principal_id=subject AND tenant_id=c.tenant_id AND state NOT IN('CONSUMED','REVOKED');
 INSERT INTO app.identity_reset_evidence VALUES(c.tenant_id,gen_random_uuid(),target,c.user_id,reason,r.evidence_id,clock_timestamp());
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.mfa.admin_reset',target,1,corr);RETURN true;
END $fn$;
CREATE FUNCTION auth_api.reset_password_cas(token_hash bytea,expected_version bigint,recovery_hash bytea,replacement_hash text,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_private.reset_tickets;initial identity_private.reset_tickets;ts uuid[];admin_principal uuid;p uuid;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT * INTO r FROM identity_private.reset_tickets WHERE token_digest=token_hash AND purpose='PASSWORD';
 IF NOT FOUND THEN RETURN false;END IF;initial:=r;
 SELECT principal_id INTO admin_principal FROM app.users WHERE tenant_id=r.tenant_id AND id=r.admin_user_id;
 IF admin_principal IS NULL THEN PERFORM identity_private.lock_principal(r.principal_id);
 ELSE PERFORM identity_private.lock_pair_nowait(r.principal_id,admin_principal);END IF;
 SELECT array_agg(tenant_id ORDER BY tenant_id) INTO ts FROM app.users WHERE principal_id=r.principal_id;
 PERFORM identity_private.lock_memberships(r.principal_id,ts);
 SELECT * INTO r FROM identity_private.reset_tickets WHERE id=r.id FOR UPDATE;
 IF ROW(r.admin_user_id,r.admin_session_id,r.admin_policy_version) IS DISTINCT FROM ROW(initial.admin_user_id,initial.admin_session_id,initial.admin_policy_version) OR r.consumed_at IS NOT NULL OR clock_timestamp()>=r.expires_at OR r.credential_version IS DISTINCT FROM expected_version
 OR expected_version IS DISTINCT FROM (SELECT credential_version FROM identity_private.credentials WHERE principal_id=r.principal_id)
 OR replacement_hash IS NULL OR left(replacement_hash,10)<>'$argon2id$' OR corr IS NULL THEN RETURN false;END IF;
 IF r.admin_user_id IS NULL THEN
  IF recovery_hash IS NULL OR octet_length(recovery_hash)<>32 THEN RETURN false;END IF;
  UPDATE app.recovery_codes SET consumed_at=clock_timestamp() WHERE tenant_id=r.tenant_id AND user_id=r.user_id AND digest=recovery_hash AND consumed_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN false;END IF;
 ELSE
  PERFORM 1 FROM app.policy_versions WHERE tenant_id=r.tenant_id AND version=r.admin_policy_version FOR SHARE;
  IF NOT FOUND OR r.admin_user_id=r.user_id OR NOT identity_private.valid_session(r.tenant_id,r.admin_session_id,r.admin_user_id)
  OR NOT EXISTS(SELECT 1 FROM app.step_up_evidence e WHERE e.tenant_id=r.tenant_id AND e.user_id=r.admin_user_id AND e.session_id=r.admin_session_id AND e.grant_key='B1-SELF-06' AND e.resource_id IS NULL AND e.policy_version=r.admin_policy_version AND e.expires_at>clock_timestamp()) THEN RETURN false;END IF;
 END IF;
 UPDATE identity_private.credentials SET argon2id_hash=replacement_hash,credential_version=credential_version+1,changed_at=clock_timestamp() WHERE principal_id=r.principal_id AND credential_version=expected_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'CREDENTIAL_CAS_FAILED';END IF;
 -- A successful independently proven credential reset supersedes old recovery bindings.
 DELETE FROM identity_private.recovery_enrollments WHERE principal_id=r.principal_id;
 UPDATE identity_private.reset_tickets SET consumed_at=clock_timestamp() WHERE principal_id=r.principal_id AND consumed_at IS NULL;
 UPDATE identity_private.preauth SET state='REVOKED' WHERE principal_id=r.principal_id AND state NOT IN('CONSUMED','REVOKED');
 UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE principal_id=r.principal_id AND state='ACTIVE';
 UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE principal_id=r.principal_id AND revoked_at IS NULL;
 PERFORM identity_private.append_audit(r.tenant_id,r.user_id,'auth.password.reset',r.id,1,corr);RETURN true;
 -- No session issued. Next login still requires the approved MFA policy.
END $fn$;
