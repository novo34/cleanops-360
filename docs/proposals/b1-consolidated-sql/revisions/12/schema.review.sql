-- CONSOLIDATED-09 REVIEW ONLY; separate exact owner authorization required.
-- CONSOLIDATED-08 REVIEW ONLY. Exact new owner authorization required before installation.
-- CleanOps 360: PROPOSED CANONICAL CONSOLIDATION, REVIEW ONLY. DO NOT EXECUTE.
-- Fresh empty PostgreSQL 16 only AFTER separate owner approval of this exact hash.
-- Not approved, not SQL-compiled, not a migration. B1/AUTH-GATE-05 OPEN; closedBackend.
BEGIN;

-- BEGIN SOURCE V4 a06dc23cbc889382b30924a1edc4cead66eeb3e0
CREATE ROLE cleanops_ddl_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE ROLE cleanops_auth_broker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE ROLE cleanops_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE ROLE cleanops_identity_service NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE ROLE cleanops_mail_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE SCHEMA app AUTHORIZATION cleanops_ddl_owner;
CREATE SCHEMA identity_private AUTHORIZATION cleanops_ddl_owner;
CREATE SCHEMA auth_api AUTHORIZATION cleanops_ddl_owner;
CREATE SCHEMA crypto AUTHORIZATION cleanops_ddl_owner;
CREATE EXTENSION pgcrypto WITH SCHEMA crypto;
REVOKE ALL ON SCHEMA app,identity_private,auth_api,crypto FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA crypto FROM PUBLIC;
GRANT USAGE ON SCHEMA app,identity_private,crypto,auth_api TO cleanops_auth_broker;
GRANT USAGE ON SCHEMA auth_api TO cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE cleanops_ddl_owner IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE cleanops_ddl_owner IN SCHEMA identity_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE cleanops_ddl_owner IN SCHEMA auth_api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE identity_private.configuration (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 deployment_enabled boolean NOT NULL DEFAULT false,
 values_json jsonb NOT NULL CHECK(jsonb_typeof(values_json)='object'),
 review_reference text NOT NULL, version bigint NOT NULL CHECK(version>0)
);
CREATE TABLE identity_private.principals (
 id uuid PRIMARY KEY, email_normalized text NOT NULL UNIQUE CHECK(length(email_normalized)<=254),
 state text NOT NULL CHECK(state IN('ACTIVE','DISABLED')), created_at timestamptz NOT NULL
);
CREATE TABLE identity_private.credentials (
 principal_id uuid PRIMARY KEY REFERENCES identity_private.principals(id) ON DELETE RESTRICT,
 argon2id_hash text NOT NULL CHECK(left(argon2id_hash,10)='$argon2id$'),
 credential_version bigint NOT NULL CHECK(credential_version>0), changed_at timestamptz NOT NULL
);
CREATE TABLE app.organizations (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 state text NOT NULL CHECK(state IN('ACTIVE','DISABLED')), disabled_at timestamptz,
 created_at timestamptz NOT NULL, version bigint NOT NULL CHECK(version>0),
 CHECK((state='DISABLED')=(disabled_at IS NOT NULL))
);
CREATE TABLE app.users (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
 id uuid NOT NULL, principal_id uuid NOT NULL REFERENCES identity_private.principals(id) ON DELETE RESTRICT,
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 120),
 state text NOT NULL CHECK(state IN('ACTIVE','DISABLED')), risk_class text NOT NULL CHECK(risk_class IN('SENSITIVE','OPERATIONAL')), created_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,principal_id), UNIQUE(tenant_id,id,principal_id)
);
CREATE TABLE app.policy_versions (
 tenant_id uuid PRIMARY KEY REFERENCES app.organizations(id) ON DELETE RESTRICT,
 version bigint NOT NULL CHECK(version>0)
);
CREATE TABLE app.self_service_rules (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
 rule_key text NOT NULL CHECK(rule_key IN('B1-SELF-01','B1-SELF-02','B1-SELF-03','B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-07','B1-SELF-08')),
 effect text NOT NULL CHECK(effect IN('ALLOW','DENY')),
 state text NOT NULL CHECK(state IN('PROPOSED','ACTIVE','REVOKED')),
 start_at timestamptz NOT NULL, expires_at timestamptz,
 review_reference text NOT NULL, PRIMARY KEY(tenant_id,rule_key),
 CHECK(expires_at IS NULL OR expires_at>start_at)
);
CREATE TABLE app.sessions (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL, principal_id uuid NOT NULL,
 token_digest bytea NOT NULL UNIQUE CHECK(octet_length(token_digest)=32),
 csrf_digest bytea NOT NULL CHECK(octet_length(csrf_digest)=32),
 state text NOT NULL CHECK(state IN('ACTIVE','REVOKED')),
 created_at timestamptz NOT NULL, last_activity_at timestamptz NOT NULL,
 absolute_expires_at timestamptz NOT NULL, idle_expires_at timestamptz NOT NULL,
 idle_seconds integer NOT NULL CHECK(idle_seconds IN(1800,28800)),
 revoked_at timestamptz, mfa_verified_at timestamptz,
 credential_version bigint NOT NULL, device_label text NOT NULL CHECK(length(device_label)<=120),
 browser_label text NOT NULL CHECK(length(browser_label)<=120),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,id,user_id),
 FOREIGN KEY(tenant_id,user_id,principal_id) REFERENCES app.users(tenant_id,id,principal_id) ON DELETE RESTRICT,
 CHECK(absolute_expires_at>created_at), CHECK(idle_expires_at>created_at),
 CHECK(last_activity_at>=created_at), CHECK((state='REVOKED')=(revoked_at IS NOT NULL))
);
CREATE TABLE identity_private.preauth (
 id uuid PRIMARY KEY, principal_id uuid NOT NULL REFERENCES identity_private.principals(id) ON DELETE RESTRICT,
 tenant_id uuid, user_id uuid, cookie_digest bytea NOT NULL UNIQUE CHECK(octet_length(cookie_digest)=32),
 csrf_digest bytea NOT NULL CHECK(octet_length(csrf_digest)=32),
 state text NOT NULL CHECK(state IN('SELECTION','PENDING_MFA','ENROLLMENT_REQUIRED','VERIFIED','CONSUMED','REVOKED')),
 password_verified_at timestamptz NOT NULL, factor_verified_at timestamptz, credential_version bigint NOT NULL,
 origin_tenant_id uuid, origin_session_id uuid, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,user_id,principal_id) REFERENCES app.users(tenant_id,id,principal_id) ON DELETE RESTRICT,
 FOREIGN KEY(origin_tenant_id,origin_session_id) REFERENCES app.sessions(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE(id,tenant_id,user_id), CHECK((tenant_id IS NULL)=(user_id IS NULL)),
 CHECK((origin_tenant_id IS NULL)=(origin_session_id IS NULL)), CHECK(expires_at>created_at)
);
CREATE TABLE app.mfa_methods (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('EMAIL_OTP','TOTP')),
 state text NOT NULL CHECK(state IN('PENDING','ACTIVE','REVOKED')),
 secret_ciphertext bytea, key_version text, last_totp_counter bigint,
 created_at timestamptz NOT NULL, enrollment_preauth_id uuid REFERENCES identity_private.preauth(id) ON DELETE RESTRICT,
 enrollment_session_id uuid, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,id,user_id),
 FOREIGN KEY(tenant_id,enrollment_session_id,user_id) REFERENCES app.sessions(tenant_id,id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(enrollment_preauth_id,tenant_id,user_id) REFERENCES identity_private.preauth(id,tenant_id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id) ON DELETE RESTRICT,
 CHECK((kind='TOTP' AND secret_ciphertext IS NOT NULL AND key_version IS NOT NULL)
 OR (kind='EMAIL_OTP' AND secret_ciphertext IS NULL AND key_version IS NULL)),
 CHECK(last_totp_counter IS NULL OR last_totp_counter>=0)
);
CREATE TABLE app.mfa_challenges (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL, preauth_id uuid,
 session_id uuid, method_id uuid, kind text NOT NULL CHECK(kind IN('EMAIL_OTP','TOTP')), purpose text NOT NULL CHECK(purpose IN('LOGIN','ENROLLMENT','STEP_UP')),
 state text NOT NULL CHECK(state IN('ISSUED','VERIFIED','EXPIRED','REVOKED','EXHAUSTED')),
 proof_digest bytea, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 recipient_version bigint,
 grant_key text, resource_id uuid, issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(preauth_id,tenant_id,user_id) REFERENCES identity_private.preauth(id,tenant_id,user_id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,id,user_id),
 FOREIGN KEY(tenant_id,session_id,user_id) REFERENCES app.sessions(tenant_id,id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,method_id,user_id) REFERENCES app.mfa_methods(tenant_id,id,user_id) ON DELETE RESTRICT,
 CHECK((preauth_id IS NULL)<>(session_id IS NULL)), CHECK(expires_at>issued_at),
 CHECK((state='VERIFIED')=(consumed_at IS NOT NULL))
);
CREATE TABLE app.recovery_codes (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL, batch_id uuid NOT NULL,
 digest bytea NOT NULL CHECK(octet_length(digest)=32), created_at timestamptz NOT NULL,
 consumed_at timestamptz, revoked_at timestamptz, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,user_id,digest),
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE app.step_up_evidence (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL, session_id uuid NOT NULL,
 grant_key text NOT NULL, resource_id uuid, verified_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,session_id,user_id) REFERENCES app.sessions(tenant_id,id,user_id) ON DELETE RESTRICT,
 CHECK(expires_at>verified_at)
);
CREATE TABLE app.auth_outbox (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL, challenge_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN('EMAIL_OTP','SECURITY_NOTICE')),
 payload_ciphertext bytea NOT NULL, key_version text NOT NULL,
 state text NOT NULL CHECK(state IN('PENDING','CLAIMED','DISPATCHING','QUARANTINED','SENT','FAILED','CANCELLED')),
 method_id uuid,method_version bigint,recipient_version bigint,
 dedup_key uuid NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 available_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, lease_until timestamptz,
 claim_digest bytea, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,dedup_key),
 FOREIGN KEY(tenant_id,challenge_id,user_id) REFERENCES app.mfa_challenges(tenant_id,id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id) ON DELETE RESTRICT,
 CHECK(expires_at>available_at)
);
CREATE TABLE app.audit_logs (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
 id uuid NOT NULL, actor_user_id uuid, actor_kind text NOT NULL CHECK(actor_kind IN('USER','SYSTEM')),
 action text NOT NULL CHECK(length(action) BETWEEN 1 AND 80), resource_id uuid,
 outcome text NOT NULL CHECK(outcome IN('SUCCESS','DENY','FAILURE')), correlation_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL, safe_metadata jsonb NOT NULL CHECK(jsonb_typeof(safe_metadata)='object'),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES app.users(tenant_id,id) ON DELETE RESTRICT,
 CHECK((actor_kind='USER')=(actor_user_id IS NOT NULL))
);
CREATE TABLE identity_private.security_log (
 id uuid PRIMARY KEY, principal_digest bytea, network_digest bytea, device_digest bytea,
 event_code text NOT NULL CHECK(length(event_code)<=80), correlation_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE identity_private.rate_buckets (
 key_digest bytea NOT NULL, dimension text NOT NULL CHECK(dimension IN('USER','IP','DEVICE')),
 purpose text NOT NULL CHECK(purpose IN('LOGIN','OTP_ISSUE','OTP_VERIFY')),
 window_start timestamptz NOT NULL, count integer NOT NULL CHECK(count>=0),
 blocked_until timestamptz, PRIMARY KEY(key_digest,dimension,purpose,window_start)
);
CREATE TABLE identity_private.tx_context (
 backend_pid integer NOT NULL, transaction_id xid8 NOT NULL, tenant_id uuid NOT NULL,
 session_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamptz NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id),
 FOREIGN KEY(tenant_id,session_id,user_id) REFERENCES app.sessions(tenant_id,id,user_id) ON DELETE RESTRICT
);
CREATE TABLE app.idempotency_records (
 tenant_id uuid NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL,
 operation text NOT NULL CHECK(length(operation)<=80), key_digest bytea NOT NULL, request_digest bytea NOT NULL,
 state text NOT NULL CHECK(state IN('PENDING','COMPLETED')),
 response_safe jsonb, one_time_result boolean NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,user_id,operation,key_digest),
 FOREIGN KEY(tenant_id,user_id) REFERENCES app.users(tenant_id,id) ON DELETE RESTRICT,
 CHECK(expires_at>created_at), CHECK(NOT one_time_result OR response_safe IS NULL)
);
CREATE TABLE identity_private.ceremony_idempotency (
 binding_digest bytea NOT NULL, operation text NOT NULL, key_digest bytea NOT NULL,
 request_digest bytea NOT NULL, state text NOT NULL CHECK(state IN('PENDING','COMPLETED')),
 response_safe jsonb, one_time_result boolean NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(binding_digest,operation,key_digest), CHECK(NOT one_time_result OR response_safe IS NULL)
);

CREATE INDEX sessions_subject_idx ON app.sessions(tenant_id,user_id,created_at DESC,id) WHERE revoked_at IS NULL;
CREATE INDEX challenge_subject_idx ON app.mfa_challenges(tenant_id,user_id,purpose,state,issued_at DESC);
CREATE INDEX outbox_claim_idx ON app.auth_outbox(state,available_at,id);
CREATE INDEX audit_time_idx ON app.audit_logs(tenant_id,occurred_at DESC,id);
CREATE INDEX preauth_expiry_idx ON identity_private.preauth(expires_at);
CREATE INDEX ctx_created_idx ON identity_private.tx_context(created_at);
CREATE INDEX idempotency_expiry_idx ON app.idempotency_records(expires_at);

-- Complete RLS on every business table; broker is a private non-login function owner,
-- not a runtime membership. True broker policies avoid recursive session lookup.
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','users','policy_versions','self_service_rules','sessions','mfa_methods','mfa_challenges','recovery_codes','step_up_evidence','auth_outbox','audit_logs','idempotency_records'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO cleanops_ddl_owner',t);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY broker_internal ON app.%I TO cleanops_auth_broker USING (true) WITH CHECK (true)',t);
 END LOOP;
END $policies$;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO cleanops_auth_broker;
GRANT SELECT,INSERT,UPDATE ON app.sessions,app.mfa_methods,app.mfa_challenges,app.recovery_codes,app.step_up_evidence,app.auth_outbox,app.idempotency_records TO cleanops_auth_broker;
GRANT INSERT ON app.audit_logs TO cleanops_auth_broker;
GRANT SELECT ON identity_private.configuration,identity_private.principals,identity_private.credentials TO cleanops_auth_broker;
GRANT SELECT,INSERT,UPDATE,DELETE ON identity_private.preauth,identity_private.tx_context,identity_private.ceremony_idempotency,identity_private.rate_buckets TO cleanops_auth_broker;
GRANT INSERT ON identity_private.security_log TO cleanops_auth_broker;
GRANT EXECUTE ON FUNCTION crypto.digest(bytea,text) TO cleanops_auth_broker;

CREATE FUNCTION identity_private.cfg(k text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE n integer;
BEGIN
 SELECT (values_json->>k)::integer INTO n FROM identity_private.configuration WHERE singleton;
 IF n IS NULL OR n<=0 THEN RAISE EXCEPTION 'SECURITY_CONFIGURATION_MISSING' USING ERRCODE='P0001'; END IF;
 RETURN n;
END $fn$;
-- Additional helpers below are part of the review contract, not installed here.
CREATE FUNCTION identity_private.require_enabled() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM identity_private.configuration WHERE singleton AND deployment_enabled) THEN
  RAISE EXCEPTION 'AUTH_GATE_05' USING ERRCODE='42501';
 END IF;
END $fn$;
CREATE FUNCTION identity_private.rule_allowed(t uuid,k text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM app.self_service_rules r WHERE r.tenant_id=t AND r.rule_key=k AND r.state='ACTIVE' AND r.effect='ALLOW' AND r.start_at<=statement_timestamp() AND (r.expires_at IS NULL OR statement_timestamp()<r.expires_at))
 AND NOT EXISTS(SELECT 1 FROM app.self_service_rules r WHERE r.tenant_id=t AND r.rule_key=k AND r.state='ACTIVE' AND r.effect='DENY' AND r.start_at<=statement_timestamp() AND (r.expires_at IS NULL OR statement_timestamp()<r.expires_at))
$fn$;
CREATE FUNCTION identity_private.valid_session(t uuid,s uuid,u uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM app.sessions x JOIN app.users a ON (a.tenant_id,a.id)=(x.tenant_id,x.user_id)
 JOIN app.organizations o ON o.id=x.tenant_id JOIN identity_private.principals p ON p.id=x.principal_id
 JOIN identity_private.credentials c ON c.principal_id=p.id
 WHERE x.tenant_id=t AND x.id=s AND x.user_id=u AND x.state='ACTIVE' AND x.revoked_at IS NULL
 AND a.state='ACTIVE' AND o.state='ACTIVE' AND p.state='ACTIVE' AND x.credential_version=c.credential_version
 AND statement_timestamp()<x.absolute_expires_at AND statement_timestamp()<x.idle_expires_at)
$fn$;
CREATE FUNCTION identity_private.context() RETURNS identity_private.tx_context
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT * INTO c FROM identity_private.tx_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 IF NOT FOUND OR NOT identity_private.valid_session(c.tenant_id,c.session_id,c.user_id) THEN RAISE EXCEPTION 'INVALID_SESSION_CONTEXT' USING ERRCODE='42501'; END IF;
 RETURN c;
END $fn$;
CREATE FUNCTION identity_private.verified_tenant() RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN c:=identity_private.context(); RETURN c.tenant_id; END $fn$;
CREATE FUNCTION auth_api.begin_verified_context(raw_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s app.sessions; c identity_private.tx_context;
BEGIN
 PERFORM identity_private.require_enabled();
 IF raw_token !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'INVALID_SESSION' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.sessions WHERE token_digest=crypto.digest(convert_to(raw_token,'UTF8'),'sha256');
 IF NOT FOUND OR NOT identity_private.valid_session(s.tenant_id,s.id,s.user_id) THEN RAISE EXCEPTION 'INVALID_SESSION' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM identity_private.tx_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 IF FOUND THEN
  IF c.session_id<>s.id OR c.tenant_id<>s.tenant_id THEN RAISE EXCEPTION 'CONTEXT_ALREADY_BOUND' USING ERRCODE='42501'; END IF;
 ELSE
  INSERT INTO identity_private.tx_context VALUES(pg_backend_pid(),pg_current_xact_id(),s.tenant_id,s.id,s.user_id,clock_timestamp());
 END IF;
END $fn$;
CREATE FUNCTION identity_private.guard(k text,step_required boolean DEFAULT false,resource uuid DEFAULT NULL) RETURNS identity_private.tx_context
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.context();
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id FOR SHARE;
 IF NOT FOUND OR NOT identity_private.rule_allowed(c.tenant_id,k) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF step_required AND NOT EXISTS(SELECT 1 FROM app.step_up_evidence e WHERE e.tenant_id=c.tenant_id AND e.user_id=c.user_id AND e.session_id=c.session_id AND e.grant_key=k AND e.resource_id IS NOT DISTINCT FROM resource AND statement_timestamp()<e.expires_at) THEN RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN c;
END $fn$;
CREATE FUNCTION identity_private.append_audit(t uuid,u uuid,a text,r uuid,n integer,corr uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
 VALUES(t,gen_random_uuid(),u,CASE WHEN u IS NULL THEN 'SYSTEM' ELSE 'USER' END,a,r,'SUCCESS',corr,clock_timestamp(),jsonb_build_object('count',n));
END $fn$;
CREATE FUNCTION auth_api.issue_challenge(raw_preauth text,method_kind text,method uuid,proof_hash bytea,payload bytea,payload_key text,grant_key text DEFAULT NULL,resource uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; c identity_private.tx_context; t uuid; u uuid; sid uuid; qid uuid; k uuid:=gen_random_uuid(); ttl integer; purpose_name text;
BEGIN
 IF method_kind NOT IN('EMAIL_OTP','TOTP') OR (method_kind='EMAIL_OTP' AND (proof_hash IS NULL OR octet_length(proof_hash)<>32 OR payload IS NULL)) THEN RAISE EXCEPTION 'INVALID_CHALLENGE'; END IF;
 IF raw_preauth IS NULL THEN
  c:=identity_private.context(); t:=c.tenant_id; u:=c.user_id; sid:=c.session_id; purpose_name:='STEP_UP';
  IF grant_key NOT IN('B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-08') OR NOT identity_private.rule_allowed(t,grant_key) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 ELSE
  q:=identity_private.checked_preauth(raw_preauth); t:=q.tenant_id; u:=q.user_id; qid:=q.id; purpose_name:='LOGIN';
  IF q.state NOT IN('PENDING_MFA','ENROLLMENT_REQUIRED') OR t IS NULL THEN RAISE EXCEPTION 'INVALID_CEREMONY'; END IF;
 END IF;
 PERFORM 1 FROM app.users WHERE tenant_id=t AND id=u AND state='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_SUBJECT'; END IF;
 IF method_kind='TOTP' AND NOT EXISTS(SELECT 1 FROM app.mfa_methods WHERE tenant_id=t AND id=method AND user_id=u AND state='ACTIVE' AND kind='TOTP') THEN RAISE EXCEPTION 'INVALID_FACTOR'; END IF;
 ttl:=CASE WHEN method_kind='EMAIL_OTP' THEN 300 ELSE identity_private.cfg('preauth_ttl') END;
 IF EXISTS(SELECT 1 FROM app.mfa_challenges WHERE tenant_id=t AND user_id=u AND purpose=purpose_name AND state='ISSUED' AND issued_at>statement_timestamp()-make_interval(secs=>identity_private.cfg('otp_resend_cooldown'))) THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
 UPDATE app.mfa_challenges SET state='REVOKED' WHERE tenant_id=t AND user_id=u AND purpose=purpose_name AND state='ISSUED' AND session_id IS NOT DISTINCT FROM sid AND preauth_id IS NOT DISTINCT FROM qid;
 INSERT INTO app.mfa_challenges(tenant_id,id,user_id,preauth_id,session_id,method_id,kind,purpose,state,proof_digest,attempts,grant_key,resource_id,issued_at,expires_at)
 VALUES(t,k,u,qid,sid,method,method_kind,purpose_name,'ISSUED',proof_hash,0,grant_key,resource,clock_timestamp(),clock_timestamp()+make_interval(secs=>ttl));
 IF method_kind='EMAIL_OTP' THEN
  INSERT INTO app.auth_outbox(tenant_id,id,user_id,challenge_id,event_type,payload_ciphertext,key_version,state,dedup_key,available_at,expires_at)
  VALUES(t,gen_random_uuid(),u,k,'EMAIL_OTP',payload,payload_key,'PENDING',k,clock_timestamp(),clock_timestamp()+interval '300 seconds');
 END IF;
 RETURN k;
END $fn$;
CREATE FUNCTION auth_api.verify_challenge(raw_preauth text,challenge uuid,submitted_digest bytea,validated_totp_counter bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; c identity_private.tx_context; x app.mfa_challenges; t uuid; u uuid; ok boolean:=false; n integer; counter_now bigint;
BEGIN
 IF raw_preauth IS NULL THEN c:=identity_private.context();t:=c.tenant_id;u:=c.user_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id; END IF;
 SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=challenge AND user_id=u FOR UPDATE;
 IF NOT FOUND OR x.state<>'ISSUED' THEN RETURN false; END IF;
 IF (raw_preauth IS NOT NULL AND x.preauth_id IS DISTINCT FROM q.id) OR (raw_preauth IS NULL AND x.session_id IS DISTINCT FROM c.session_id) THEN RETURN false; END IF;
 IF statement_timestamp()>=x.expires_at THEN UPDATE app.mfa_challenges SET state='EXPIRED' WHERE tenant_id=t AND id=x.id; RETURN false; END IF;
 IF x.attempts>=identity_private.cfg('otp_attempts') THEN UPDATE app.mfa_challenges SET state='EXHAUSTED' WHERE tenant_id=t AND id=x.id; RETURN false; END IF;
 IF x.kind='EMAIL_OTP' THEN ok:=submitted_digest IS NOT NULL AND x.proof_digest=submitted_digest;
 ELSE
  counter_now:=floor(extract(epoch FROM statement_timestamp())/identity_private.cfg('totp_period'))::bigint;
  IF validated_totp_counter IS NOT NULL AND abs(validated_totp_counter-counter_now)<=identity_private.cfg('totp_window') THEN
   UPDATE app.mfa_methods SET last_totp_counter=validated_totp_counter WHERE tenant_id=t AND id=x.method_id AND user_id=u AND state='ACTIVE' AND (last_totp_counter IS NULL OR last_totp_counter<validated_totp_counter);
   GET DIAGNOSTICS n=ROW_COUNT;ok:=n=1;
  END IF;
 END IF;
 UPDATE app.mfa_challenges SET attempts=attempts+1,state=CASE WHEN ok THEN 'VERIFIED' WHEN attempts+1>=identity_private.cfg('otp_attempts') THEN 'EXHAUSTED' ELSE 'ISSUED' END,consumed_at=CASE WHEN ok THEN clock_timestamp() ELSE NULL END WHERE tenant_id=t AND id=x.id;
 IF NOT ok THEN RETURN false; END IF;
 IF x.purpose='STEP_UP' THEN
  IF NOT identity_private.rule_allowed(t,x.grant_key) THEN RETURN false; END IF;
  INSERT INTO app.step_up_evidence VALUES(t,gen_random_uuid(),u,x.session_id,x.grant_key,x.resource_id,clock_timestamp(),clock_timestamp()+make_interval(secs=>identity_private.cfg('step_up_ttl')));
 ELSE UPDATE identity_private.preauth SET state='VERIFIED',factor_verified_at=clock_timestamp() WHERE id=q.id; END IF;
 PERFORM identity_private.append_audit(t,u,'auth.mfa.verify',x.id,1,corr); RETURN true;
END $fn$;
CREATE FUNCTION auth_api.begin_totp_enrollment(raw_preauth text,ciphertext bytea,key_version text,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; c identity_private.tx_context; t uuid;u uuid;k uuid:=gen_random_uuid();
BEGIN
 IF ciphertext IS NULL OR key_version IS NULL THEN RAISE EXCEPTION 'INVALID_ENROLLMENT'; END IF;
 IF raw_preauth IS NULL THEN c:=identity_private.guard('B1-SELF-05',true);t:=c.tenant_id;u:=c.user_id;
 ELSE
  q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id;
  IF q.state NOT IN('PENDING_MFA','ENROLLMENT_REQUIRED') OR NOT identity_private.rule_allowed(t,'B1-SELF-05') THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;
 END IF;
 PERFORM 1 FROM app.users WHERE tenant_id=t AND id=u FOR UPDATE;
 IF raw_preauth IS NOT NULL AND EXISTS(SELECT 1 FROM app.mfa_methods WHERE tenant_id=t AND user_id=u AND state='ACTIVE') THEN RAISE EXCEPTION 'STEP_UP_REQUIRED'; END IF;
 UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=t AND user_id=u AND kind='TOTP' AND state='PENDING';
 INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,enrollment_preauth_id,enrollment_session_id) VALUES(t,k,u,'TOTP','PENDING',ciphertext,key_version,clock_timestamp(),q.id,c.session_id);
 IF raw_preauth IS NOT NULL THEN UPDATE identity_private.preauth SET state='ENROLLMENT_REQUIRED' WHERE id=q.id; END IF;
 PERFORM identity_private.append_audit(t,u,'self_mfa.enroll',k,1,corr);RETURN k;
END $fn$;
CREATE FUNCTION auth_api.confirm_totp_enrollment(raw_preauth text,enrollment uuid,validated_counter bigint,recovery_digests bytea[],corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;c identity_private.tx_context;t uuid;u uuid;m app.mfa_methods;d bytea;batch uuid:=gen_random_uuid();counter_now bigint;
BEGIN
 IF raw_preauth IS NULL THEN c:=identity_private.guard('B1-SELF-06',true);t:=c.tenant_id;u:=c.user_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id;IF q.state<>'ENROLLMENT_REQUIRED' OR NOT identity_private.rule_allowed(t,'B1-SELF-06') THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF; END IF;
 SELECT * INTO m FROM app.mfa_methods WHERE tenant_id=t AND user_id=u AND id=enrollment AND state='PENDING' FOR UPDATE;
 IF NOT FOUND OR m.created_at+make_interval(secs=>identity_private.cfg('enrollment_ttl'))<=statement_timestamp() THEN RETURN false; END IF;
 IF (raw_preauth IS NOT NULL AND m.enrollment_preauth_id IS DISTINCT FROM q.id) OR (raw_preauth IS NULL AND m.enrollment_session_id IS DISTINCT FROM c.session_id) THEN RETURN false; END IF;
 counter_now:=floor(extract(epoch FROM statement_timestamp())/identity_private.cfg('totp_period'))::bigint;
 IF validated_counter IS NULL OR abs(validated_counter-counter_now)>identity_private.cfg('totp_window') THEN RETURN false; END IF;
 IF cardinality(recovery_digests)<>identity_private.cfg('recovery_count') OR (SELECT count(DISTINCT v) FROM unnest(recovery_digests) v)<>cardinality(recovery_digests) THEN RAISE EXCEPTION 'INVALID_RECOVERY_BATCH'; END IF;
 FOREACH d IN ARRAY recovery_digests LOOP IF d IS NULL OR octet_length(d)<>32 THEN RAISE EXCEPTION 'INVALID_RECOVERY_BATCH'; END IF; END LOOP;
 UPDATE app.mfa_methods SET state='ACTIVE',last_totp_counter=validated_counter WHERE tenant_id=t AND id=enrollment;
 UPDATE app.recovery_codes SET revoked_at=clock_timestamp() WHERE tenant_id=t AND user_id=u AND revoked_at IS NULL;
 FOREACH d IN ARRAY recovery_digests LOOP INSERT INTO app.recovery_codes VALUES(t,gen_random_uuid(),u,batch,d,clock_timestamp(),NULL,NULL); END LOOP;
 IF raw_preauth IS NOT NULL THEN UPDATE identity_private.preauth SET state='VERIFIED',factor_verified_at=clock_timestamp() WHERE id=q.id; END IF;
 PERFORM identity_private.append_audit(t,u,'self_mfa.confirm',enrollment,1,corr); RETURN true;
END $fn$;
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
CREATE FUNCTION auth_api.touch_activity() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN c:=identity_private.context(); UPDATE app.sessions SET last_activity_at=clock_timestamp(),idle_expires_at=LEAST(absolute_expires_at,clock_timestamp()+make_interval(secs=>idle_seconds)) WHERE tenant_id=c.tenant_id AND id=c.session_id AND state='ACTIVE'; END $fn$;
CREATE FUNCTION auth_api.reserve_idempotency(operation_name text,key_hash bytea,request_hash bytea,one_time boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;r app.idempotency_records;
BEGIN
 c:=identity_private.context();
 INSERT INTO app.idempotency_records VALUES(c.tenant_id,gen_random_uuid(),c.user_id,operation_name,key_hash,request_hash,'PENDING',NULL,one_time,clock_timestamp(),clock_timestamp()+make_interval(secs=>identity_private.cfg('idempotency_ttl'))) ON CONFLICT(tenant_id,user_id,operation,key_digest) DO NOTHING;
 SELECT * INTO r FROM app.idempotency_records WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND operation=operation_name AND key_digest=key_hash FOR UPDATE;
 IF r.request_digest<>request_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH'; END IF;
 IF r.expires_at<=statement_timestamp() THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_EXPIRED'; END IF;
 IF r.state='COMPLETED' AND r.one_time_result THEN RAISE EXCEPTION 'RESULT_NOT_REPLAYABLE'; END IF;
 RETURN r.response_safe;
END $fn$;
CREATE FUNCTION auth_api.complete_idempotency(operation_name text,key_hash bytea,safe_response jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT * INTO c FROM identity_private.tx_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'NO_BOUND_TRANSACTION'; END IF;
 UPDATE app.idempotency_records SET state='COMPLETED',response_safe=CASE WHEN one_time_result THEN NULL ELSE safe_response END WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND operation=operation_name AND key_digest=key_hash AND state='PENDING'; IF NOT FOUND THEN RAISE EXCEPTION 'IDEMPOTENCY_NOT_RESERVED'; END IF;
END $fn$;
CREATE FUNCTION auth_api.reserve_ceremony(raw_preauth text,operation_name text,key_hash bytea,request_hash bytea,one_time boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;r identity_private.ceremony_idempotency;
BEGIN
 q:=identity_private.checked_preauth(raw_preauth);
 INSERT INTO identity_private.ceremony_idempotency VALUES(q.cookie_digest,operation_name,key_hash,request_hash,'PENDING',NULL,one_time,q.expires_at) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM identity_private.ceremony_idempotency WHERE binding_digest=q.cookie_digest AND operation=operation_name AND key_digest=key_hash FOR UPDATE;
 IF r.request_digest<>request_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH'; END IF;
 IF r.state='COMPLETED' AND r.one_time_result THEN RAISE EXCEPTION 'RESULT_NOT_REPLAYABLE'; END IF; RETURN r.response_safe;
END $fn$;
CREATE FUNCTION auth_api.complete_ceremony(raw_preauth text,operation_name text,key_hash bytea,safe_response jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;
BEGIN q:=identity_private.checked_preauth(raw_preauth); UPDATE identity_private.ceremony_idempotency SET state='COMPLETED',response_safe=CASE WHEN one_time_result THEN NULL ELSE safe_response END WHERE binding_digest=q.cookie_digest AND operation=operation_name AND key_digest=key_hash AND state='PENDING'; IF NOT FOUND THEN RAISE EXCEPTION 'IDEMPOTENCY_NOT_RESERVED'; END IF; END $fn$;
CREATE FUNCTION auth_api.rate_attempt(key_hash bytea,dim text,purpose_name text,limit_count integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE bucket timestamptz;v integer;wait_seconds integer;
BEGIN
 PERFORM identity_private.require_enabled();
 IF limit_count<1 OR dim NOT IN('USER','IP','DEVICE') OR purpose_name NOT IN('LOGIN','OTP_ISSUE','OTP_VERIFY') THEN RAISE EXCEPTION 'INVALID_LIMIT'; END IF;
 bucket:=to_timestamp(floor(extract(epoch FROM statement_timestamp())/identity_private.cfg('rate_window'))*identity_private.cfg('rate_window'));
 INSERT INTO identity_private.rate_buckets VALUES(key_hash,dim,purpose_name,bucket,1,NULL)
 ON CONFLICT(key_digest,dimension,purpose,window_start) DO UPDATE SET count=identity_private.rate_buckets.count+1 RETURNING count INTO v;
 wait_seconds:=CASE WHEN v>=limit_count THEN LEAST(identity_private.cfg('rate_window'),ceil(extract(epoch FROM bucket+make_interval(secs=>identity_private.cfg('rate_window'))-statement_timestamp()))::integer) ELSE 0 END;
 RETURN wait_seconds;
END $fn$;
CREATE FUNCTION auth_api.record_security_event(code text,principal_hash bytea,network_hash bytea,device_hash bytea,corr uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF code NOT IN('LOGIN_DENIED','RATE_LIMITED','MFA_DENIED','CSRF_DENIED','DEPENDENCY_FAILURE') THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
 INSERT INTO identity_private.security_log VALUES(gen_random_uuid(),principal_hash,network_hash,device_hash,code,corr,clock_timestamp(),clock_timestamp()+make_interval(secs=>identity_private.cfg('preauth_security_log_retention')));
END $fn$;
CREATE FUNCTION auth_api.claim_mail(claim_hash bytea) RETURNS TABLE(tenant_id uuid,id uuid,payload_ciphertext bytea,key_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o app.auth_outbox;
BEGIN
 PERFORM identity_private.require_enabled();
 IF octet_length(claim_hash)<>32 THEN RAISE EXCEPTION 'INVALID_CLAIM'; END IF;
 SELECT * INTO o FROM app.auth_outbox x WHERE x.state IN('PENDING','CLAIMED') AND (x.lease_until IS NULL OR x.lease_until<statement_timestamp()) AND x.available_at<=statement_timestamp() AND x.expires_at>statement_timestamp() AND x.attempts<identity_private.cfg('outbox_max_attempts')
 AND EXISTS(SELECT 1 FROM app.mfa_challenges c JOIN app.users u ON (u.tenant_id,u.id)=(c.tenant_id,c.user_id) JOIN app.organizations g ON g.id=c.tenant_id WHERE c.tenant_id=x.tenant_id AND c.id=x.challenge_id AND c.state='ISSUED' AND c.expires_at>statement_timestamp() AND u.state='ACTIVE' AND g.state='ACTIVE') ORDER BY x.available_at,x.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE app.auth_outbox SET state='CLAIMED',attempts=attempts+1,claim_digest=claim_hash,lease_until=clock_timestamp()+make_interval(secs=>identity_private.cfg('outbox_claim_lease')) WHERE app.auth_outbox.tenant_id=o.tenant_id AND app.auth_outbox.id=o.id;
 RETURN QUERY SELECT o.tenant_id,o.id,o.payload_ciphertext,o.key_version;
END $fn$;
CREATE FUNCTION auth_api.finish_mail(t uuid,id uuid,claim_hash bytea,delivered boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 UPDATE app.auth_outbox SET payload_ciphertext=CASE WHEN delivered THEN decode('','hex') ELSE payload_ciphertext END,state=CASE WHEN delivered THEN 'SENT' WHEN attempts>=identity_private.cfg('outbox_max_attempts') THEN 'FAILED' ELSE 'PENDING' END,lease_until=NULL,claim_digest=NULL,available_at=clock_timestamp()+make_interval(secs=>identity_private.cfg('outbox_retry_delay'))
 WHERE tenant_id=t AND app.auth_outbox.id=finish_mail.id AND state='CLAIMED' AND claim_digest=claim_hash AND lease_until>statement_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CLAIM'; END IF;
END $fn$;
CREATE FUNCTION auth_api.consume_recovery_internal(raw_preauth text,code_hash bytea,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;n integer;
BEGIN
 q:=identity_private.checked_preauth(raw_preauth);
 UPDATE app.recovery_codes SET consumed_at=clock_timestamp() WHERE tenant_id=q.tenant_id AND user_id=q.user_id AND digest=code_hash AND consumed_at IS NULL AND revoked_at IS NULL; GET DIAGNOSTICS n=ROW_COUNT;
 IF n=1 THEN PERFORM identity_private.append_audit(q.tenant_id,q.user_id,'auth.recovery.consume',NULL,1,corr); END IF;
 -- Does not grant ACTIVE or administrative rights; future recovery protocol required.
 RETURN n=1;
END $fn$;
CREATE FUNCTION auth_api.gc_context() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE n integer;
BEGIN
 DELETE FROM identity_private.tx_context c WHERE c.created_at<clock_timestamp()-make_interval(secs=>identity_private.cfg('context_gc_age')) AND pg_visible_in_snapshot(c.transaction_id,pg_current_snapshot());
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $fn$;
CREATE FUNCTION auth_api.current_identity() RETURNS TABLE(id uuid,tenant_id uuid,display_name text,email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN c:=identity_private.guard('B1-SELF-01'); RETURN QUERY SELECT u.id,u.tenant_id,u.display_name,p.email_normalized FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE u.tenant_id=c.tenant_id AND u.id=c.user_id; END $fn$;
CREATE FUNCTION auth_api.own_sessions(page_size integer DEFAULT 50,before_time timestamptz DEFAULT NULL,before_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,tenant_id uuid,user_id uuid,created_at timestamptz,last_activity_at timestamptz,absolute_expires_at timestamptz,device_label text,browser_label text,is_current boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.guard('B1-SELF-02');
 IF page_size<1 OR page_size>identity_private.cfg('page_max') OR (before_time IS NULL)<>(before_id IS NULL) THEN RAISE EXCEPTION 'INVALID_PAGE'; END IF;
 RETURN QUERY SELECT s.id,s.tenant_id,s.user_id,s.created_at,s.last_activity_at,s.absolute_expires_at,s.device_label,s.browser_label,s.id=c.session_id FROM app.sessions s
 WHERE s.tenant_id=c.tenant_id AND s.user_id=c.user_id AND s.state='ACTIVE' AND s.absolute_expires_at>statement_timestamp() AND s.idle_expires_at>statement_timestamp()
 AND (before_time IS NULL OR (s.created_at,s.id)<(before_time,before_id)) ORDER BY s.created_at DESC,s.id DESC LIMIT page_size;
END $fn$;
CREATE FUNCTION auth_api.revoke_own_session(target uuid,corr uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; n integer;
BEGIN
 c:=identity_private.context();
 PERFORM s.id FROM app.sessions s WHERE s.tenant_id=c.tenant_id AND s.user_id=c.user_id AND s.id IN(c.session_id,target) ORDER BY s.id FOR NO KEY UPDATE;
 c:=identity_private.guard('B1-SELF-03');
 IF NOT EXISTS(SELECT 1 FROM app.sessions WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND id=target) THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND id=target AND state='ACTIVE'; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'self_sessions.revoke_self_session',target,n,corr); RETURN n;
END $fn$;
CREATE FUNCTION auth_api.revoke_other_own_sessions(corr uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; n integer;
BEGIN
 c:=identity_private.context();
 PERFORM s.id FROM app.sessions s WHERE s.tenant_id=c.tenant_id AND s.user_id=c.user_id ORDER BY s.id FOR NO KEY UPDATE;
 c:=identity_private.guard('B1-SELF-04',true);
 UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND id<>c.session_id AND state='ACTIVE'; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'self_sessions.revoke_other_own_sessions',NULL,n,corr); RETURN n;
END $fn$;
CREATE FUNCTION identity_private.reject_tenant_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'IMMUTABLE_TENANT' USING ERRCODE='42501'; END IF; RETURN NEW; END $fn$;

-- All remaining application-facing primitives are restricted to identity service,
-- never runtime or HTTP caller. Password/TOTP verification uses mature libraries
-- in that isolated service BEFORE invoking the attestation/issuance functions.
CREATE FUNCTION auth_api.new_preauth(p uuid,t uuid,cookie_hash bytea,csrf_hash bytea) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE u uuid; k uuid:=gen_random_uuid(); s text; cv bigint;
BEGIN
 PERFORM identity_private.require_enabled();
 IF octet_length(cookie_hash)<>32 OR octet_length(csrf_hash)<>32 OR NOT EXISTS(SELECT 1 FROM identity_private.principals WHERE id=p AND state='ACTIVE') THEN RAISE EXCEPTION 'INVALID_CEREMONY'; END IF;
 IF t IS NOT NULL THEN SELECT id INTO u FROM app.users WHERE tenant_id=t AND principal_id=p AND state='ACTIVE'; IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.organizations WHERE id=t AND state='ACTIVE') THEN RAISE EXCEPTION 'INVALID_CEREMONY'; END IF; END IF;
 s:=CASE WHEN t IS NULL THEN 'SELECTION' WHEN EXISTS(SELECT 1 FROM app.mfa_methods WHERE tenant_id=t AND user_id=u AND state='ACTIVE') THEN 'PENDING_MFA' ELSE 'ENROLLMENT_REQUIRED' END;
 SELECT credential_version INTO cv FROM identity_private.credentials WHERE principal_id=p;
 INSERT INTO identity_private.preauth(id,principal_id,tenant_id,user_id,cookie_digest,csrf_digest,state,password_verified_at,credential_version,created_at,expires_at)
 VALUES(k,p,t,u,cookie_hash,csrf_hash,s,clock_timestamp(),cv,clock_timestamp(),clock_timestamp()+make_interval(secs=>identity_private.cfg('preauth_ttl'))); RETURN k;
END $fn$;
CREATE FUNCTION identity_private.checked_preauth(raw_cookie text) RETURNS identity_private.preauth
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p identity_private.preauth;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT * INTO p FROM identity_private.preauth WHERE cookie_digest=crypto.digest(convert_to(raw_cookie,'UTF8'),'sha256') FOR UPDATE;
 IF NOT FOUND OR p.state IN('CONSUMED','REVOKED') OR statement_timestamp()>=p.expires_at OR NOT EXISTS(SELECT 1 FROM identity_private.principals a JOIN identity_private.credentials b ON b.principal_id=a.id WHERE a.id=p.principal_id AND a.state='ACTIVE' AND b.credential_version=p.credential_version) THEN RAISE EXCEPTION 'INVALID_CEREMONY' USING ERRCODE='42501'; END IF;
 RETURN p;
END $fn$;
CREATE FUNCTION auth_api.memberships(raw_preauth text DEFAULT NULL) RETURNS TABLE(id uuid,name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p uuid; c identity_private.tx_context; q identity_private.preauth;
BEGIN
 IF raw_preauth IS NULL THEN c:=identity_private.context(); SELECT principal_id INTO p FROM app.users WHERE tenant_id=c.tenant_id AND app.users.id=c.user_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth); p:=q.principal_id; END IF;
 IF (SELECT count(*) FROM app.users u WHERE u.principal_id=p AND u.state='ACTIVE')>identity_private.cfg('membership_max') THEN RAISE EXCEPTION 'MEMBERSHIP_LIMIT_REVIEW'; END IF;
 RETURN QUERY SELECT o.id,o.name FROM app.users u JOIN app.organizations o ON o.id=u.tenant_id WHERE u.principal_id=p AND u.state='ACTIVE' AND o.state='ACTIVE' AND identity_private.rule_allowed(o.id,'B1-SELF-07') ORDER BY o.id;
END $fn$;
CREATE FUNCTION auth_api.select_tenant(raw_preauth text,target_tenant uuid,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; u uuid;
BEGIN
 q:=identity_private.checked_preauth(raw_preauth);
 SELECT id INTO u FROM app.users WHERE tenant_id=target_tenant AND principal_id=q.principal_id AND state='ACTIVE';
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.organizations WHERE id=target_tenant AND state='ACTIVE') OR NOT identity_private.rule_allowed(target_tenant,'B1-SELF-08') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF q.tenant_id IS NOT NULL AND q.tenant_id<>target_tenant THEN RAISE EXCEPTION 'CEREMONY_ALREADY_BOUND'; END IF;
 UPDATE identity_private.preauth SET tenant_id=target_tenant,user_id=u,state=CASE WHEN EXISTS(SELECT 1 FROM app.mfa_methods WHERE tenant_id=target_tenant AND user_id=u AND state='ACTIVE') THEN 'PENDING_MFA' ELSE 'ENROLLMENT_REQUIRED' END WHERE id=q.id;
 RETURN q.id;
END $fn$;
CREATE FUNCTION auth_api.begin_switch(raw_new_cookie text,new_csrf_hash bytea,target_tenant uuid,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; p uuid; q uuid;
BEGIN
 c:=identity_private.guard('B1-SELF-08',true,target_tenant);
 SELECT principal_id INTO p FROM app.users WHERE tenant_id=c.tenant_id AND id=c.user_id;
 q:=auth_api.new_preauth(p,NULL,crypto.digest(convert_to(raw_new_cookie,'UTF8'),'sha256'),new_csrf_hash);
 UPDATE identity_private.preauth SET origin_tenant_id=c.tenant_id,origin_session_id=c.session_id WHERE id=q;
 PERFORM auth_api.select_tenant(raw_new_cookie,target_tenant,corr); RETURN q;
END $fn$;

CREATE FUNCTION auth_api.security_policy() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j jsonb;
BEGIN PERFORM identity_private.require_enabled(); SELECT values_json INTO j FROM identity_private.configuration WHERE singleton; RETURN j; END $fn$;

CREATE TABLE identity_private.csrf_bootstrap (
 cookie_digest bytea PRIMARY KEY CHECK(octet_length(cookie_digest)=32),
 csrf_digest bytea NOT NULL CHECK(octet_length(csrf_digest)=32),
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
GRANT SELECT,INSERT,UPDATE,DELETE ON identity_private.csrf_bootstrap TO cleanops_auth_broker;
CREATE FUNCTION auth_api.bootstrap_csrf(cookie_hash bytea,csrf_hash bytea) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM identity_private.require_enabled();
 IF cookie_hash IS NULL OR csrf_hash IS NULL OR octet_length(cookie_hash)<>32 OR octet_length(csrf_hash)<>32 THEN RAISE EXCEPTION 'INVALID_CSRF'; END IF;
 INSERT INTO identity_private.csrf_bootstrap VALUES(cookie_hash,csrf_hash,clock_timestamp()+make_interval(secs=>identity_private.cfg('preauth_ttl')),NULL);
END $fn$;
CREATE FUNCTION auth_api.csrf_valid(raw_cookie text,raw_csrf text,mode text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE d bytea; c bytea;
BEGIN
 PERFORM identity_private.require_enabled();
 IF raw_cookie IS NULL OR raw_csrf IS NULL OR raw_cookie !~ '^[A-Za-z0-9_-]{43}$' OR raw_csrf !~ '^[A-Za-z0-9_-]{43}$' THEN RETURN false; END IF;
 d:=crypto.digest(convert_to(raw_cookie,'UTF8'),'sha256');c:=crypto.digest(convert_to(raw_csrf,'UTF8'),'sha256');
 IF mode='BOOTSTRAP' THEN RETURN EXISTS(SELECT 1 FROM identity_private.csrf_bootstrap WHERE cookie_digest=d AND csrf_digest=c AND consumed_at IS NULL AND expires_at>statement_timestamp());
 ELSIF mode='PREAUTH' THEN RETURN EXISTS(SELECT 1 FROM identity_private.preauth WHERE cookie_digest=d AND csrf_digest=c AND state NOT IN('CONSUMED','REVOKED') AND expires_at>statement_timestamp());
 ELSIF mode='ACTIVE' THEN RETURN EXISTS(SELECT 1 FROM app.sessions x WHERE token_digest=d AND csrf_digest=c AND identity_private.valid_session(x.tenant_id,x.id,x.user_id));
 END IF;RETURN false;
END $fn$;
CREATE FUNCTION auth_api.login_material(normalized_email text) RETURNS TABLE(principal_id uuid,password_hash text,credential_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM identity_private.require_enabled();
 RETURN QUERY SELECT p.id,c.argon2id_hash,c.credential_version FROM identity_private.principals p JOIN identity_private.credentials c ON c.principal_id=p.id WHERE p.email_normalized=normalized_email AND p.state='ACTIVE';
END $fn$;
CREATE FUNCTION auth_api.challenge_material(raw_preauth text,challenge uuid) RETURNS TABLE(kind text,method_id uuid,grant_key text,resource_id uuid,secret_ciphertext bytea,key_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;c identity_private.tx_context;t uuid;u uuid;
BEGIN
 IF raw_preauth IS NULL THEN c:=identity_private.context();t:=c.tenant_id;u:=c.user_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id; END IF;
 RETURN QUERY SELECT x.kind,x.method_id,x.grant_key,x.resource_id,m.secret_ciphertext,m.key_version FROM app.mfa_challenges x LEFT JOIN app.mfa_methods m ON (m.tenant_id,m.id,m.user_id)=(x.tenant_id,x.method_id,x.user_id)
 WHERE x.tenant_id=t AND x.user_id=u AND x.id=challenge AND x.state='ISSUED' AND x.expires_at>statement_timestamp()
 AND ((raw_preauth IS NOT NULL AND x.preauth_id=q.id) OR (raw_preauth IS NULL AND x.session_id=c.session_id));
END $fn$;
CREATE FUNCTION auth_api.enrollment_material(raw_preauth text,enrollment uuid) RETURNS TABLE(secret_ciphertext bytea,key_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;c identity_private.tx_context;t uuid;u uuid;
BEGIN
 IF raw_preauth IS NULL THEN c:=identity_private.guard('B1-SELF-06',true);t:=c.tenant_id;u:=c.user_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id; END IF;
 RETURN QUERY SELECT m.secret_ciphertext,m.key_version FROM app.mfa_methods m WHERE m.tenant_id=t AND m.user_id=u AND m.id=enrollment AND m.state='PENDING'
 AND ((raw_preauth IS NOT NULL AND m.enrollment_preauth_id=q.id) OR (raw_preauth IS NULL AND m.enrollment_session_id=c.session_id))
 AND m.created_at+make_interval(secs=>identity_private.cfg('enrollment_ttl'))>statement_timestamp();
END $fn$;
GRANT DELETE ON app.idempotency_records TO cleanops_auth_broker;
REVOKE DELETE ON identity_private.security_log FROM cleanops_auth_broker;
CREATE FUNCTION auth_api.gc_ephemeral() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 UPDATE app.auth_outbox SET state='QUARANTINED',lease_until=NULL,claim_digest=NULL WHERE state IN('CLAIMED','DISPATCHING') AND (expires_at<=clock_timestamp() OR lease_until<=clock_timestamp());
 UPDATE app.auth_outbox SET payload_ciphertext=decode('','hex'),state='CANCELLED',lease_until=NULL,claim_digest=NULL WHERE expires_at<=statement_timestamp() AND state NOT IN('SENT','CANCELLED','QUARANTINED');
 UPDATE app.mfa_challenges SET state='EXPIRED',proof_digest=NULL WHERE expires_at<=statement_timestamp() AND state='ISSUED';
 UPDATE app.mfa_methods SET state='REVOKED',secret_ciphertext=CASE WHEN kind='TOTP' THEN decode('','hex') ELSE NULL END,key_version=CASE WHEN kind='TOTP' THEN 'PURGED' ELSE NULL END WHERE state='PENDING' AND created_at+make_interval(secs=>identity_private.cfg('enrollment_ttl'))<=statement_timestamp();
 UPDATE identity_private.preauth SET state='REVOKED' WHERE expires_at<=statement_timestamp() AND state NOT IN('CONSUMED','REVOKED');
 DELETE FROM identity_private.csrf_bootstrap WHERE expires_at<=statement_timestamp();
 DELETE FROM identity_private.ceremony_idempotency WHERE expires_at<=statement_timestamp();
 DELETE FROM app.idempotency_records WHERE expires_at<=statement_timestamp();
 PERFORM identity_private.purge_expired_security_log();
 DELETE FROM identity_private.rate_buckets WHERE window_start<statement_timestamp()-make_interval(secs=>identity_private.cfg('rate_bucket_retention'));
END $fn$;
CREATE FUNCTION auth_api.active_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN c:=identity_private.context(); RETURN (SELECT jsonb_build_object('state','ACTIVE','session_id',s.id,'tenant_id',s.tenant_id,'absolute_expires_at',s.absolute_expires_at) FROM app.sessions s WHERE s.tenant_id=c.tenant_id AND s.id=c.session_id); END $fn$;
CREATE FUNCTION auth_api.preauth_summary(raw_cookie text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth;
BEGIN q:=identity_private.checked_preauth(raw_cookie); RETURN jsonb_build_object('state',CASE WHEN q.state='SELECTION' THEN 'TENANT_SELECTION_REQUIRED' ELSE q.state END,'expires_at',q.expires_at); END $fn$;
-- Complete table ownership and non-bypass RLS for private technical data too.
DO $private_policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['configuration','principals','credentials','preauth','security_log','rate_buckets','tx_context','ceremony_idempotency','csrf_bootstrap'] LOOP
  EXECUTE format('ALTER TABLE identity_private.%I OWNER TO cleanops_ddl_owner',t);
  EXECUTE format('ALTER TABLE identity_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE identity_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY broker_private ON identity_private.%I TO cleanops_auth_broker USING (true) WITH CHECK (true)',t);
 END LOOP;
END $private_policies$;

-- Each app table has its own runtime boundary; runtime still receives NO direct DML.
DO $runtime_policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['users','policy_versions','self_service_rules','sessions','mfa_methods','mfa_challenges','recovery_codes','step_up_evidence','auth_outbox','audit_logs','idempotency_records'] LOOP
  EXECUTE format('CREATE POLICY runtime_tenant ON app.%I TO cleanops_runtime USING (tenant_id=identity_private.verified_tenant()) WITH CHECK (tenant_id=identity_private.verified_tenant())',t);
  EXECUTE format('CREATE TRIGGER immutable_tenant BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION identity_private.reject_tenant_change()',t);
 END LOOP;
END $runtime_policies$;
CREATE POLICY runtime_tenant ON app.organizations TO cleanops_runtime
 USING(id=identity_private.verified_tenant()) WITH CHECK(id=identity_private.verified_tenant());

-- Ownership changes require temporary CREATE solely for function owner reassignment.
GRANT CREATE ON SCHEMA identity_private,auth_api TO cleanops_auth_broker;
DO $function_owners$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('identity_private','auth_api') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO cleanops_auth_broker',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END $function_owners$;
REVOKE CREATE ON SCHEMA identity_private,auth_api FROM cleanops_auth_broker;
REVOKE ALL ON ALL TABLES IN SCHEMA app,identity_private FROM cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
-- No role membership is granted; deployment identity mapping remains unauthorized.
GRANT EXECUTE ON FUNCTION auth_api.begin_verified_context(text),auth_api.current_identity(),
 auth_api.own_sessions(integer,timestamptz,uuid),auth_api.revoke_own_session(uuid,uuid),
 auth_api.revoke_other_own_sessions(uuid),auth_api.touch_activity(),
 auth_api.memberships(text),auth_api.reserve_idempotency(text,bytea,bytea,boolean),
 auth_api.complete_idempotency(text,bytea,jsonb) TO cleanops_runtime;
GRANT EXECUTE ON FUNCTION auth_api.begin_verified_context(text),auth_api.security_policy(),
 auth_api.new_preauth(uuid,uuid,bytea,bytea),auth_api.memberships(text),
 auth_api.select_tenant(text,uuid,uuid),auth_api.begin_switch(text,bytea,uuid,uuid),
 auth_api.issue_challenge(text,text,uuid,bytea,bytea,text,text,uuid),
 auth_api.verify_challenge(text,uuid,bytea,bigint,uuid),
 auth_api.begin_totp_enrollment(text,bytea,text,uuid),
 auth_api.confirm_totp_enrollment(text,uuid,bigint,bytea[],uuid),
 auth_api.issue_active_session(text,bytea,bytea,integer,integer,text,text,uuid),
 auth_api.reserve_ceremony(text,text,bytea,bytea,boolean),auth_api.complete_ceremony(text,text,bytea,jsonb),
 auth_api.rate_attempt(bytea,text,text,integer),auth_api.record_security_event(text,bytea,bytea,bytea,uuid)
 TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.claim_mail(bytea),auth_api.finish_mail(uuid,uuid,bytea,boolean)
 TO cleanops_mail_worker;
-- Maintenance has no login, table access, business grants or memberships.
GRANT EXECUTE ON FUNCTION auth_api.active_summary(),auth_api.preauth_summary(text),auth_api.reserve_idempotency(text,bytea,bytea,boolean),auth_api.complete_idempotency(text,bytea,jsonb),auth_api.bootstrap_csrf(bytea,bytea),auth_api.csrf_valid(text,text,text),auth_api.login_material(text),auth_api.challenge_material(text,uuid),auth_api.enrollment_material(text,uuid) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.csrf_valid(text,text,text) TO cleanops_runtime;
CREATE ROLE cleanops_auth_maintenance NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA auth_api TO cleanops_auth_maintenance;
GRANT EXECUTE ON FUNCTION auth_api.gc_context(),auth_api.gc_ephemeral() TO cleanops_auth_maintenance;
GRANT USAGE ON SCHEMA identity_private TO cleanops_runtime;
GRANT EXECUTE ON FUNCTION identity_private.verified_tenant() TO cleanops_runtime;
-- consume_recovery_internal intentionally has NO caller grant in B1.
-- No INSERT into configuration/self_service_rules/principals/credentials/users:
-- an applied definition alone remains disabled and has no operational identity.
-- END SOURCE V4

-- BEGIN SOURCE B1-X 1499e90389b6e7c4d94b1dd17ed35cd4b539d436

ALTER TABLE app.mfa_methods ADD COLUMN method_version bigint NOT NULL DEFAULT 1 CHECK(method_version>0);
ALTER TABLE app.mfa_methods ADD COLUMN algorithm text CHECK(algorithm IN('SHA1','SHA256','SHA512'));
-- No algorithm backfill/default: unknown legacy ciphertext fails closed.
ALTER TABLE app.step_up_evidence ADD COLUMN policy_version bigint;
ALTER TABLE app.idempotency_records ADD COLUMN owner_backend integer;
ALTER TABLE app.idempotency_records ADD COLUMN owner_xid xid8;
ALTER TABLE identity_private.ceremony_idempotency ADD COLUMN owner_backend integer;
ALTER TABLE identity_private.ceremony_idempotency ADD COLUMN owner_xid xid8;

CREATE FUNCTION identity_private.version_totp_method() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NEW.last_totp_counter IS NULL AND OLD.last_totp_counter IS NOT NULL
 OR NEW.last_totp_counter<OLD.last_totp_counter THEN RAISE EXCEPTION 'COUNTER_ROLLBACK'; END IF;
 IF ROW(NEW.state,NEW.secret_ciphertext,NEW.key_version,NEW.algorithm,NEW.kind,NEW.user_id)
 IS DISTINCT FROM ROW(OLD.state,OLD.secret_ciphertext,OLD.key_version,OLD.algorithm,OLD.kind,OLD.user_id)
 THEN NEW.method_version:=OLD.method_version+1;
 ELSE NEW.method_version:=OLD.method_version; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER version_totp_method BEFORE UPDATE ON app.mfa_methods
 FOR EACH ROW EXECUTE FUNCTION identity_private.version_totp_method();

CREATE FUNCTION identity_private.lock_principal(p uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM identity_private.require_enabled();
 PERFORM 1 FROM identity_private.principals a WHERE a.id=p AND a.state='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM identity_private.credentials c WHERE c.principal_id=p FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
END $fn$;

CREATE FUNCTION identity_private.lock_memberships(p uuid, tenants uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM 1 FROM app.organizations o WHERE o.id=ANY(tenants) ORDER BY o.id FOR SHARE;
 PERFORM 1 FROM app.users u WHERE u.principal_id=p AND u.tenant_id=ANY(tenants) ORDER BY u.tenant_id,u.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(tenants) t WHERE t IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM app.organizations o JOIN app.users u ON u.tenant_id=o.id
  JOIN app.policy_versions v ON v.tenant_id=o.id
  WHERE o.id=t AND o.state='ACTIVE' AND u.principal_id=p AND u.state='ACTIVE'))
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
END $fn$;

-- Replace helpers only in this proposed overlay, preserving V4 signatures.
CREATE OR REPLACE FUNCTION identity_private.context() RETURNS identity_private.tx_context
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; s app.sessions; p uuid;
BEGIN
 SELECT * INTO c FROM identity_private.tx_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.sessions WHERE tenant_id=c.tenant_id AND id=c.session_id AND user_id=c.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 p:=s.principal_id; PERFORM identity_private.lock_principal(p);
 SELECT * INTO s FROM app.sessions WHERE tenant_id=c.tenant_id AND id=c.session_id AND user_id=c.user_id FOR NO KEY UPDATE;
 IF NOT FOUND OR s.principal_id IS DISTINCT FROM p THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM identity_private.lock_memberships(p,ARRAY[c.tenant_id]);
 IF NOT identity_private.valid_session(c.tenant_id,c.session_id,c.user_id)
 OR clock_timestamp()>=LEAST(s.absolute_expires_at,s.idle_expires_at)
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 RETURN c;
END $fn$;

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

CREATE FUNCTION auth_api.credential_material_locked(normalized_email text)
 RETURNS TABLE(principal_id uuid,password_hash text,credential_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p uuid;
BEGIN
 PERFORM identity_private.require_enabled();
 SELECT id INTO p FROM identity_private.principals WHERE email_normalized=normalized_email AND state='ACTIVE';
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM identity_private.lock_principal(p);
 RETURN QUERY SELECT c.principal_id,c.argon2id_hash,c.credential_version FROM identity_private.credentials c WHERE c.principal_id=p;
END $fn$;

CREATE FUNCTION auth_api.rehash_credential_cas(p uuid,expected_version bigint,expected_hash text,replacement_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE n integer;
BEGIN
 PERFORM identity_private.lock_principal(p);
 IF expected_version IS NULL OR expected_hash IS NULL OR replacement_hash IS NULL
 OR left(replacement_hash,10)<>'$argon2id$' OR octet_length(replacement_hash)>256
 THEN RAISE EXCEPTION 'INVALID_REHASH'; END IF;
 UPDATE identity_private.credentials SET argon2id_hash=replacement_hash,changed_at=clock_timestamp()
 WHERE principal_id=p AND credential_version=expected_version AND argon2id_hash=expected_hash;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $fn$;

CREATE FUNCTION auth_api.new_preauth_verified(p uuid,t uuid,expected_version bigint,expected_hash text,cookie_hash bytea,csrf_hash bytea) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM identity_private.lock_principal(p);
 IF expected_version IS NULL OR expected_hash IS NULL OR NOT EXISTS(
  SELECT 1 FROM identity_private.credentials c WHERE c.principal_id=p AND c.credential_version=expected_version AND c.argon2id_hash=expected_hash)
 THEN RAISE EXCEPTION 'CREDENTIAL_CHANGED' USING ERRCODE='42501'; END IF;
 IF cookie_hash IS NULL OR csrf_hash IS NULL OR octet_length(cookie_hash)<>32 OR octet_length(csrf_hash)<>32 THEN RAISE EXCEPTION 'INVALID_DIGEST'; END IF;
 PERFORM identity_private.lock_memberships(p,ARRAY[t]);
 RETURN auth_api.new_preauth(p,t,cookie_hash,csrf_hash);
END $fn$;

CREATE FUNCTION auth_api.resolve_binding(raw_cookie text,raw_csrf text,mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; s app.sessions; q identity_private.preauth; b identity_private.csrf_bootstrap; j jsonb;
BEGIN
 PERFORM identity_private.require_enabled();
 IF mode='ACTIVE' THEN
  PERFORM auth_api.begin_verified_context(raw_cookie); c:=identity_private.context();
  SELECT * INTO s FROM app.sessions WHERE tenant_id=c.tenant_id AND id=c.session_id;
  j:=jsonb_build_object('kind','ACTIVE','id',s.id,'sessionId',s.id,'tenantId',s.tenant_id,'userId',s.user_id,
   'csrfDigest',encode(s.csrf_digest,'hex'),'expiresAt',floor(extract(epoch FROM LEAST(s.absolute_expires_at,s.idle_expires_at))*1000));
 ELSIF mode='PREAUTH' THEN
  q:=identity_private.checked_preauth(raw_cookie);
  IF q.state NOT IN('SELECTION','PENDING_MFA','ENROLLMENT_REQUIRED') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  j:=jsonb_strip_nulls(jsonb_build_object('kind','PREAUTH','id',q.id,'tenantId',q.tenant_id,'userId',q.user_id,
   'state',CASE WHEN q.state='SELECTION' THEN 'TENANT_SELECTION_REQUIRED' ELSE q.state END,
   'csrfDigest',encode(q.csrf_digest,'hex'),'expiresAt',floor(extract(epoch FROM q.expires_at)*1000)));
 ELSIF mode='BOOTSTRAP' THEN
  SELECT * INTO b FROM identity_private.csrf_bootstrap WHERE cookie_digest=crypto.digest(convert_to(raw_cookie,'UTF8'),'sha256') FOR UPDATE;
  IF NOT FOUND OR b.consumed_at IS NOT NULL OR clock_timestamp()>=b.expires_at THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  j:=jsonb_build_object('kind','BOOTSTRAP','id',encode(b.cookie_digest,'hex'),'csrfDigest',encode(b.csrf_digest,'hex'),
   'expiresAt',floor(extract(epoch FROM b.expires_at)*1000));
 ELSE RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF auth_api.csrf_valid(raw_cookie,raw_csrf,mode) IS DISTINCT FROM true THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 RETURN j;
END $fn$;

CREATE FUNCTION auth_api.binding_authorization(raw_preauth text,rule_key text,resource uuid)
 RETURNS TABLE(allowed boolean,step_up boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; q identity_private.preauth; t uuid; pv bigint;
BEGIN
 IF rule_key IS NULL OR rule_key NOT IN('B1-SELF-01','B1-SELF-02','B1-SELF-03','B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-07','B1-SELF-08')
 OR (rule_key='B1-SELF-08')<>(resource IS NOT NULL) THEN RETURN QUERY SELECT false,false; RETURN; END IF;
 IF raw_preauth IS NULL THEN c:=identity_private.context(); t:=c.tenant_id;
 ELSE
  q:=identity_private.checked_preauth(raw_preauth); t:=q.tenant_id;
  IF q.state='SELECTION' THEN
   IF rule_key='B1-SELF-07' THEN
    -- Scoped permission to call memberships, NOT a tenant-wide ALLOW.
    -- memberships rechecks every returned tenant's B1-SELF-07 and owns the principal filter.
    PERFORM auth_api.memberships(raw_preauth);
    RETURN QUERY SELECT true,false; RETURN;
   ELSIF rule_key='B1-SELF-08' THEN
    PERFORM identity_private.lock_memberships(q.principal_id,ARRAY[resource]);
    PERFORM 1 FROM app.policy_versions WHERE tenant_id=resource FOR SHARE;
    RETURN QUERY SELECT identity_private.rule_allowed(resource,rule_key),false; RETURN;
   ELSE RETURN QUERY SELECT false,false; RETURN; END IF;
  END IF;
  IF q.state NOT IN('ENROLLMENT_REQUIRED','PENDING_MFA') OR rule_key NOT IN('B1-SELF-05','B1-SELF-06','B1-SELF-07')
  THEN RETURN QUERY SELECT false,false; RETURN; END IF;
 END IF;
 IF rule_key='B1-SELF-08' AND raw_preauth IS NULL THEN
  PERFORM identity_private.lock_memberships((SELECT principal_id FROM app.sessions WHERE tenant_id=t AND id=c.session_id),ARRAY[resource]);
 END IF;
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=ANY(ARRAY[t,CASE WHEN rule_key='B1-SELF-08' THEN resource ELSE NULL END]) ORDER BY tenant_id FOR SHARE;
 SELECT version INTO pv FROM app.policy_versions WHERE tenant_id=t;
 allowed:=FOUND AND identity_private.rule_allowed(t,rule_key);
 step_up:=raw_preauth IS NULL AND allowed AND EXISTS(SELECT 1 FROM app.step_up_evidence e
  WHERE e.tenant_id=t AND e.user_id=c.user_id AND e.session_id=c.session_id AND e.grant_key=rule_key
  AND e.resource_id IS NOT DISTINCT FROM resource AND e.policy_version=pv AND clock_timestamp()<e.expires_at);
 RETURN NEXT;
END $fn$;
-- Tenant enumeration/selection in SELECTION uses existing memberships/select_tenant brokers;
-- do not invent a tenant-specific authorization result for an unbound ceremony.

CREATE OR REPLACE FUNCTION identity_private.guard(k text,step_required boolean DEFAULT false,resource uuid DEFAULT NULL)
 RETURNS identity_private.tx_context
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; a record;
BEGIN
 c:=identity_private.context();
 SELECT * INTO a FROM auth_api.binding_authorization(NULL,k,resource);
 IF a.allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF step_required AND a.step_up IS DISTINCT FROM true THEN RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN c;
END $fn$;

CREATE FUNCTION auth_api.totp_material_locked(raw_preauth text,ceremony uuid,purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; q identity_private.preauth; m app.mfa_methods; x app.mfa_challenges;
 t uuid; u uuid; mid uuid; until_at timestamptz; g text; r uuid; sid uuid;
BEGIN
 IF purpose IS NULL OR purpose NOT IN('LOGIN','STEP_UP','ENROLLMENT')
 OR ceremony IS NULL OR (purpose='LOGIN' AND raw_preauth IS NULL)
 OR (purpose='STEP_UP' AND raw_preauth IS NOT NULL) THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF raw_preauth IS NULL THEN
  c:=identity_private.context();t:=c.tenant_id;u:=c.user_id;sid:=c.session_id;
  SELECT LEAST(absolute_expires_at,idle_expires_at) INTO until_at FROM app.sessions WHERE tenant_id=t AND id=sid;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id;until_at:=q.expires_at; END IF;
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=t FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF purpose='ENROLLMENT' THEN
  IF raw_preauth IS NULL THEN PERFORM identity_private.guard('B1-SELF-06',true);
  ELSIF q.state<>'ENROLLMENT_REQUIRED' OR NOT identity_private.rule_allowed(t,'B1-SELF-06') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  mid:=ceremony;
 ELSE
  IF purpose='LOGIN' AND q.state<>'PENDING_MFA' THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=ceremony AND user_id=u;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  mid:=x.method_id;
 END IF;
 SELECT * INTO m FROM app.mfa_methods WHERE tenant_id=t AND id=mid AND user_id=u FOR UPDATE;
 IF NOT FOUND OR m.kind<>'TOTP' OR m.algorithm IS NULL OR m.secret_ciphertext IS NULL
 OR m.state<>(CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END)
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF purpose='ENROLLMENT' THEN
  IF (raw_preauth IS NOT NULL AND m.enrollment_preauth_id IS DISTINCT FROM q.id)
  OR (raw_preauth IS NULL AND m.enrollment_session_id IS DISTINCT FROM sid) THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  until_at:=LEAST(until_at,m.created_at+make_interval(secs=>identity_private.cfg('enrollment_ttl')));
 ELSE
  SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=ceremony AND user_id=u FOR UPDATE;
  IF NOT FOUND OR x.method_id IS DISTINCT FROM mid OR x.kind<>'TOTP' OR x.purpose<>purpose OR x.state<>'ISSUED'
  OR x.attempts>=identity_private.cfg('otp_attempts')
  OR (raw_preauth IS NOT NULL AND x.preauth_id IS DISTINCT FROM q.id)
  OR (raw_preauth IS NULL AND x.session_id IS DISTINCT FROM sid)
  THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  until_at:=LEAST(until_at,x.expires_at); g:=x.grant_key;r:=x.resource_id;
  IF purpose='STEP_UP' AND (g IS NULL OR g NOT IN('B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-08')
  OR (g='B1-SELF-08')<>(r IS NOT NULL) OR NOT identity_private.rule_allowed(t,g))
  THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 IF clock_timestamp()>=until_at THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('binding',jsonb_build_object('tenantId',t,'userId',u,'methodId',m.id,'purpose',purpose,'ceremonyId',ceremony),
  'version',m.method_version::text,'lastCounter',m.last_totp_counter,'expiresAt',floor(extract(epoch FROM until_at)*1000),
  'algorithm',m.algorithm,'secret_ciphertext',encode(m.secret_ciphertext,'base64'),'key_version',m.key_version,
  'grant_key',g,'resource_id',r,'session_id',sid);
END $fn$;

CREATE OR REPLACE FUNCTION auth_api.verify_challenge(raw_preauth text,challenge uuid,submitted_digest bytea,validated_totp_counter bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; c identity_private.tx_context; x app.mfa_challenges; t uuid; u uuid; ok boolean:=false; n integer; counter_now bigint;
BEGIN
 IF raw_preauth IS NULL THEN c:=identity_private.context();t:=c.tenant_id;u:=c.user_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id; END IF;
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=t FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=challenge AND user_id=u FOR UPDATE;
 IF NOT FOUND OR x.state<>'ISSUED' THEN RETURN false; END IF;
 IF (raw_preauth IS NOT NULL AND x.preauth_id IS DISTINCT FROM q.id) OR (raw_preauth IS NULL AND x.session_id IS DISTINCT FROM c.session_id) THEN RETURN false; END IF;
 IF clock_timestamp()>=x.expires_at THEN UPDATE app.mfa_challenges SET state='EXPIRED' WHERE tenant_id=t AND id=x.id; RETURN false; END IF;
 IF x.attempts>=identity_private.cfg('otp_attempts') THEN UPDATE app.mfa_challenges SET state='EXHAUSTED' WHERE tenant_id=t AND id=x.id; RETURN false; END IF;
 -- Authorization precedes counter/challenge mutation.
 IF x.purpose='STEP_UP' AND (x.grant_key IS NULL OR x.grant_key NOT IN('B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-08')
 OR (x.grant_key='B1-SELF-08')<>(x.resource_id IS NOT NULL)
 OR NOT identity_private.rule_allowed(t,x.grant_key)) THEN RETURN false; END IF;
 IF x.kind='EMAIL_OTP' THEN ok:=submitted_digest IS NOT NULL AND x.proof_digest=submitted_digest;
 ELSE
  counter_now:=floor(extract(epoch FROM clock_timestamp())/identity_private.cfg('totp_period'))::bigint;
  IF validated_totp_counter IS NOT NULL AND abs(validated_totp_counter-counter_now)<=identity_private.cfg('totp_window') THEN
   UPDATE app.mfa_methods SET last_totp_counter=validated_totp_counter WHERE tenant_id=t AND id=x.method_id AND user_id=u AND state='ACTIVE' AND (last_totp_counter IS NULL OR last_totp_counter<validated_totp_counter);
   GET DIAGNOSTICS n=ROW_COUNT;ok:=n=1;
  END IF;
 END IF;
 UPDATE app.mfa_challenges SET attempts=attempts+1,state=CASE WHEN ok THEN 'VERIFIED' WHEN attempts+1>=identity_private.cfg('otp_attempts') THEN 'EXHAUSTED' ELSE 'ISSUED' END,consumed_at=CASE WHEN ok THEN clock_timestamp() ELSE NULL END WHERE tenant_id=t AND id=x.id;
 IF NOT ok THEN RETURN false; END IF;
 IF x.purpose='STEP_UP' THEN
  IF NOT identity_private.rule_allowed(t,x.grant_key) THEN RETURN false; END IF;
  INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,resource_id,verified_at,expires_at,policy_version)
  VALUES(t,gen_random_uuid(),u,x.session_id,x.grant_key,x.resource_id,clock_timestamp(),
   clock_timestamp()+make_interval(secs=>identity_private.cfg('step_up_ttl')),
   (SELECT version FROM app.policy_versions WHERE tenant_id=t));
 ELSE UPDATE identity_private.preauth SET state='VERIFIED',factor_verified_at=clock_timestamp() WHERE id=q.id; END IF;
 PERFORM identity_private.append_audit(t,u,'auth.mfa.verify',x.id,1,corr); RETURN true;
END $fn$;
CREATE FUNCTION auth_api.consume_totp_cas(raw_preauth text,ceremony uuid,purpose text,expected_method_version bigint,expected_counter bigint,validated_counter bigint,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j jsonb;
BEGIN
 IF purpose IS NULL OR purpose NOT IN('LOGIN','STEP_UP') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 j:=auth_api.totp_material_locked(raw_preauth,ceremony,purpose);
 IF expected_method_version IS NULL OR (j->>'version')::bigint<>expected_method_version
 OR (j->>'lastCounter')::bigint IS DISTINCT FROM expected_counter THEN RETURN false; END IF;
 IF validated_counter IS NOT NULL AND (
 validated_counter<0 OR (expected_counter IS NOT NULL AND validated_counter<=expected_counter)
 OR abs(validated_counter-floor(extract(epoch FROM clock_timestamp())/identity_private.cfg('totp_period'))::bigint)>identity_private.cfg('totp_window')) THEN RETURN false; END IF;
 -- NULL is an explicitly failed proof: V4 commits the attempt, never verifies it.
 RETURN auth_api.verify_challenge(raw_preauth,ceremony,NULL,validated_counter,corr);
END $fn$;

CREATE FUNCTION auth_api.consume_enrollment_cas(raw_preauth text,ceremony uuid,expected_method_version bigint,expected_counter bigint,validated_counter bigint,recovery_digests bytea[],corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j jsonb;
BEGIN
 j:=auth_api.totp_material_locked(raw_preauth,ceremony,'ENROLLMENT');
 IF expected_method_version IS NULL OR (j->>'version')::bigint<>expected_method_version
 OR (j->>'lastCounter')::bigint IS DISTINCT FROM expected_counter
 OR validated_counter IS NULL OR validated_counter<0
 OR (expected_counter IS NOT NULL AND validated_counter<=expected_counter)
 OR abs(validated_counter-floor(extract(epoch FROM clock_timestamp())/identity_private.cfg('totp_period'))::bigint)>identity_private.cfg('totp_window')
 THEN RETURN false; END IF;
 RETURN auth_api.confirm_totp_enrollment(raw_preauth,ceremony,validated_counter,recovery_digests,corr);
END $fn$;

CREATE FUNCTION auth_api.reserve_owned(raw_preauth text,operation_name text,key_hash bytea,request_hash bytea,one_time boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; q identity_private.preauth; j jsonb;
BEGIN
 IF operation_name IS NULL OR length(operation_name) NOT BETWEEN 1 AND 80 OR key_hash IS NULL OR request_hash IS NULL
 OR octet_length(key_hash)<>32 OR octet_length(request_hash)<>32 OR one_time IS NULL THEN RAISE EXCEPTION 'INVALID_RESERVATION'; END IF;
 IF raw_preauth IS NULL THEN
  c:=identity_private.context();
  INSERT INTO app.idempotency_records(tenant_id,id,user_id,operation,key_digest,request_digest,state,response_safe,one_time_result,created_at,expires_at,owner_backend,owner_xid)
   VALUES(c.tenant_id,gen_random_uuid(),c.user_id,operation_name,key_hash,request_hash,'PENDING',NULL,one_time,clock_timestamp(),
   clock_timestamp()+make_interval(secs=>identity_private.cfg('idempotency_ttl')),pg_backend_pid(),pg_current_xact_id())
   ON CONFLICT(tenant_id,user_id,operation,key_digest) DO NOTHING;
  SELECT to_jsonb(r) INTO j FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id
   AND r.operation=operation_name AND r.key_digest=key_hash FOR UPDATE;
 ELSE
  q:=identity_private.checked_preauth(raw_preauth);
  INSERT INTO identity_private.ceremony_idempotency(binding_digest,operation,key_digest,request_digest,state,response_safe,one_time_result,expires_at,owner_backend,owner_xid)
   VALUES(q.cookie_digest,operation_name,key_hash,request_hash,'PENDING',NULL,one_time,q.expires_at,pg_backend_pid(),pg_current_xact_id())
   ON CONFLICT(binding_digest,operation,key_digest) DO NOTHING;
  SELECT to_jsonb(r) INTO j FROM identity_private.ceremony_idempotency r WHERE r.binding_digest=q.cookie_digest
   AND r.operation=operation_name AND r.key_digest=key_hash FOR UPDATE;
 END IF;
 IF j IS NULL OR (j->>'request_digest')::bytea IS DISTINCT FROM request_hash
 OR (j->>'one_time_result')::boolean IS DISTINCT FROM one_time THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH'; END IF;
 IF (j->>'expires_at')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_EXPIRED'; END IF;
 IF j->>'state'='PENDING' AND ((j->>'owner_backend')::integer IS DISTINCT FROM pg_backend_pid()
 OR (j->>'owner_xid')::xid8 IS DISTINCT FROM pg_current_xact_id()) THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED'; END IF;
 IF j->>'state'='COMPLETED' AND one_time THEN RAISE EXCEPTION 'RESULT_NOT_REPLAYABLE'; END IF;
 RETURN jsonb_build_object('replay',j->>'state'='COMPLETED','requestHash',encode(request_hash,'hex'),
  'expiresAt',floor(extract(epoch FROM (j->>'expires_at')::timestamptz)*1000),
  'oneTime',one_time,'data',j->'response_safe');
END $fn$;

-- Completion is NOT a new authorization path. The owner fields restrict access
-- to a previously reserved row in this exact backend/xid, even after own logout.
CREATE FUNCTION identity_private.finish_owned(raw_preauth text,operation_name text,key_hash bytea,request_hash bytea,safe_response jsonb,discard boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; b bytea; n integer; one_time boolean;
BEGIN
 PERFORM identity_private.require_enabled();
 IF key_hash IS NULL OR request_hash IS NULL OR octet_length(key_hash)<>32 OR octet_length(request_hash)<>32 THEN RAISE EXCEPTION 'INVALID_RESERVATION'; END IF;
 IF raw_preauth IS NULL THEN
  SELECT * INTO c FROM identity_private.tx_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED'; END IF;
  SELECT r.one_time_result INTO one_time FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id
   AND r.operation=operation_name AND r.key_digest=key_hash AND r.request_digest=request_hash AND r.state='PENDING'
   AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id() AND r.expires_at>clock_timestamp() FOR UPDATE;
 ELSE
  IF raw_preauth !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED'; END IF;
  b:=crypto.digest(convert_to(raw_preauth,'UTF8'),'sha256');
  SELECT r.one_time_result INTO one_time FROM identity_private.ceremony_idempotency r WHERE r.binding_digest=b
   AND r.operation=operation_name AND r.key_digest=key_hash AND r.request_digest=request_hash AND r.state='PENDING'
   AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id() AND r.expires_at>clock_timestamp() FOR UPDATE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED'; END IF;
 IF NOT discard AND one_time AND safe_response IS NOT NULL THEN RAISE EXCEPTION 'ONE_TIME_PLAINTEXT_FORBIDDEN'; END IF;
 IF NOT discard AND safe_response IS NOT NULL AND (jsonb_typeof(safe_response)<>'object'
 OR octet_length(safe_response::text)>identity_private.cfg('json_body_max')) THEN RAISE EXCEPTION 'INVALID_SAFE_RESPONSE'; END IF;
 IF raw_preauth IS NULL THEN
  IF discard THEN
   DELETE FROM app.idempotency_records WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND operation=operation_name
    AND key_digest=key_hash AND request_digest=request_hash AND state='PENDING'
    AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id();
  ELSE
   UPDATE app.idempotency_records SET state='COMPLETED',response_safe=CASE WHEN one_time THEN NULL ELSE safe_response END
    WHERE tenant_id=c.tenant_id AND user_id=c.user_id AND operation=operation_name AND key_digest=key_hash
    AND request_digest=request_hash AND state='PENDING' AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id();
  END IF;
 ELSE
  IF discard THEN
   DELETE FROM identity_private.ceremony_idempotency WHERE binding_digest=b AND operation=operation_name
    AND key_digest=key_hash AND request_digest=request_hash AND state='PENDING'
    AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id();
  ELSE
   UPDATE identity_private.ceremony_idempotency SET state='COMPLETED',response_safe=CASE WHEN one_time THEN NULL ELSE safe_response END
    WHERE binding_digest=b AND operation=operation_name AND key_digest=key_hash AND request_digest=request_hash
    AND state='PENDING' AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id();
  END IF;
 END IF;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $fn$;

CREATE FUNCTION auth_api.discard_owned(raw_preauth text,operation_name text,key_hash bytea,request_hash bytea) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT identity_private.finish_owned(raw_preauth,operation_name,key_hash,request_hash,NULL,true)
$fn$;

CREATE FUNCTION auth_api.complete_owned(raw_preauth text,operation_name text,key_hash bytea,request_hash bytea,safe_response jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT identity_private.finish_owned(raw_preauth,operation_name,key_hash,request_hash,safe_response,false)
$fn$;

-- Keep old reserve signatures structurally valid after owner columns are added.
-- They remain retired for direct callers (REVOKE below); new adapters need the envelope.
CREATE OR REPLACE FUNCTION auth_api.reserve_idempotency(operation_name text,key_hash bytea,request_hash bytea,one_time boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j jsonb;
BEGIN j:=auth_api.reserve_owned(NULL,operation_name,key_hash,request_hash,one_time);
 IF (j->>'replay')::boolean THEN RETURN j->'data'; END IF; RETURN NULL;
END $fn$;
CREATE OR REPLACE FUNCTION auth_api.reserve_ceremony(raw_preauth text,operation_name text,key_hash bytea,request_hash bytea,one_time boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j jsonb;
BEGIN j:=auth_api.reserve_owned(raw_preauth,operation_name,key_hash,request_hash,one_time);
 IF (j->>'replay')::boolean THEN RETURN j->'data'; END IF; RETURN NULL;
END $fn$;


-- Keep EMAIL_OTP available without regranting the generic TOTP-attestation primitive.
CREATE FUNCTION auth_api.email_otp_material(raw_preauth text,challenge uuid) RETURNS TABLE(kind text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT m.kind FROM auth_api.challenge_material(raw_preauth,challenge) m WHERE m.kind='EMAIL_OTP'
$fn$;
CREATE FUNCTION auth_api.consume_email_otp(raw_preauth text,challenge uuid,submitted_digest bytea,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE m record;
BEGIN
 IF submitted_digest IS NOT NULL AND octet_length(submitted_digest)<>32 THEN RAISE EXCEPTION 'INVALID_DIGEST'; END IF;
 SELECT * INTO m FROM auth_api.challenge_material(raw_preauth,challenge);
 IF NOT FOUND OR m.kind<>'EMAIL_OTP' THEN RETURN false; END IF;
 RETURN auth_api.verify_challenge(raw_preauth,challenge,submitted_digest,NULL,corr);
END $fn$;

-- PROPOSED ACL/ownership, not executed and NOT authorized by approving this text.
GRANT UPDATE(argon2id_hash,changed_at) ON identity_private.credentials TO cleanops_auth_broker;
-- Explicit functions only: no new table privilege for identity_service or runtime.

CREATE FUNCTION auth_api.begin_totp_enrollment_explicit(raw_preauth text,ciphertext bytea,key_version text,algorithm text,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE k uuid; t uuid; q identity_private.preauth; c identity_private.tx_context;
BEGIN
 IF algorithm IS NULL OR algorithm NOT IN('SHA1','SHA256','SHA512') THEN RAISE EXCEPTION 'INVALID_ALGORITHM'; END IF;
 IF raw_preauth IS NULL THEN c:=identity_private.context();t:=c.tenant_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id; END IF;
 k:=auth_api.begin_totp_enrollment(raw_preauth,ciphertext,key_version,corr);
 UPDATE app.mfa_methods m SET algorithm=begin_totp_enrollment_explicit.algorithm WHERE m.tenant_id=t AND m.id=k AND m.state='PENDING';
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 RETURN k;
END $fn$;

ALTER FUNCTION identity_private.version_totp_method() OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.version_totp_method() FROM PUBLIC;

ALTER FUNCTION identity_private.lock_principal(uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.lock_principal(uuid) FROM PUBLIC;

ALTER FUNCTION identity_private.lock_memberships(uuid,uuid[]) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.lock_memberships(uuid,uuid[]) FROM PUBLIC;

ALTER FUNCTION identity_private.context() OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.context() FROM PUBLIC;

ALTER FUNCTION identity_private.checked_preauth(text) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.checked_preauth(text) FROM PUBLIC;

ALTER FUNCTION auth_api.credential_material_locked(text) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.credential_material_locked(text) FROM PUBLIC;

ALTER FUNCTION auth_api.rehash_credential_cas(uuid,bigint,text,text) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.rehash_credential_cas(uuid,bigint,text,text) FROM PUBLIC;

ALTER FUNCTION auth_api.new_preauth_verified(uuid,uuid,bigint,text,bytea,bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.new_preauth_verified(uuid,uuid,bigint,text,bytea,bytea) FROM PUBLIC;

ALTER FUNCTION auth_api.resolve_binding(text,text,text) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.resolve_binding(text,text,text) FROM PUBLIC;

ALTER FUNCTION auth_api.binding_authorization(text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.binding_authorization(text,text,uuid) FROM PUBLIC;

ALTER FUNCTION identity_private.guard(text,boolean,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.guard(text,boolean,uuid) FROM PUBLIC;

ALTER FUNCTION auth_api.totp_material_locked(text,uuid,text) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.totp_material_locked(text,uuid,text) FROM PUBLIC;

ALTER FUNCTION auth_api.verify_challenge(text,uuid,bytea,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.verify_challenge(text,uuid,bytea,bigint,uuid) FROM PUBLIC;

ALTER FUNCTION auth_api.consume_totp_cas(text,uuid,text,bigint,bigint,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.consume_totp_cas(text,uuid,text,bigint,bigint,bigint,uuid) FROM PUBLIC;

ALTER FUNCTION auth_api.consume_enrollment_cas(text,uuid,bigint,bigint,bigint,bytea[],uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.consume_enrollment_cas(text,uuid,bigint,bigint,bigint,bytea[],uuid) FROM PUBLIC;

ALTER FUNCTION auth_api.reserve_owned(text,text,bytea,bytea,boolean) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.reserve_owned(text,text,bytea,bytea,boolean) FROM PUBLIC;

ALTER FUNCTION identity_private.finish_owned(text,text,bytea,bytea,jsonb,boolean) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.finish_owned(text,text,bytea,bytea,jsonb,boolean) FROM PUBLIC;

ALTER FUNCTION auth_api.discard_owned(text,text,bytea,bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.discard_owned(text,text,bytea,bytea) FROM PUBLIC;

ALTER FUNCTION auth_api.complete_owned(text,text,bytea,bytea,jsonb) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.complete_owned(text,text,bytea,bytea,jsonb) FROM PUBLIC;

ALTER FUNCTION auth_api.reserve_idempotency(text,bytea,bytea,boolean) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.reserve_idempotency(text,bytea,bytea,boolean) FROM PUBLIC;

ALTER FUNCTION auth_api.reserve_ceremony(text,text,bytea,bytea,boolean) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.reserve_ceremony(text,text,bytea,bytea,boolean) FROM PUBLIC;

ALTER FUNCTION auth_api.begin_totp_enrollment_explicit(text,bytea,text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.begin_totp_enrollment_explicit(text,bytea,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.credential_material_locked(text) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.rehash_credential_cas(uuid,bigint,text,text) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.new_preauth_verified(uuid,uuid,bigint,text,bytea,bytea) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.resolve_binding(text,text,text) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.binding_authorization(text,text,uuid) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.totp_material_locked(text,uuid,text) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.consume_totp_cas(text,uuid,text,bigint,bigint,bigint,uuid) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.consume_enrollment_cas(text,uuid,bigint,bigint,bigint,bytea[],uuid) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.reserve_owned(text,text,bytea,bytea,boolean) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.complete_owned(text,text,bytea,bytea,jsonb) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.discard_owned(text,text,bytea,bytea) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.begin_totp_enrollment_explicit(text,bytea,text,text,uuid) TO cleanops_identity_service;

REVOKE EXECUTE ON FUNCTION auth_api.login_material(text),auth_api.new_preauth(uuid,uuid,bytea,bytea),
 auth_api.challenge_material(text,uuid),auth_api.enrollment_material(text,uuid),
 auth_api.verify_challenge(text,uuid,bytea,bigint,uuid),
 auth_api.confirm_totp_enrollment(text,uuid,bigint,bytea[],uuid),
 auth_api.begin_totp_enrollment(text,bytea,text,uuid)
 FROM cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.reserve_idempotency(text,bytea,bytea,boolean),
 auth_api.complete_idempotency(text,bytea,jsonb) FROM cleanops_runtime,cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.reserve_ceremony(text,text,bytea,bytea,boolean),
 auth_api.complete_ceremony(text,text,bytea,jsonb) FROM cleanops_identity_service;
-- Proposed extra function EXECUTE only: a complete private Backend needs its own
-- session functions on the SAME identity-service connection, never a second pool.
GRANT EXECUTE ON FUNCTION auth_api.current_identity(),auth_api.own_sessions(integer,timestamptz,uuid),
 auth_api.revoke_own_session(uuid,uuid),auth_api.revoke_other_own_sessions(uuid),auth_api.touch_activity()
 TO cleanops_identity_service;
ALTER FUNCTION auth_api.email_otp_material(text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.email_otp_material(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.email_otp_material(text,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.consume_email_otp(text,uuid,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.consume_email_otp(text,uuid,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.consume_email_otp(text,uuid,bytea,uuid) TO cleanops_identity_service;
-- No role membership, table access for callers, configuration seed or activation.
-- END SOURCE B1-X

-- BEGIN SOURCE D1 6454a7551e61e5857ef39090b24b93fcbdb03bb1

-- Depends on the separately reviewed B1-X overlay, not canonical V4 alone.
-- Minimal lifecycle snapshot: NULL legacy challenges MUST fail closed; no backfill.
ALTER TABLE app.mfa_challenges ADD COLUMN method_version bigint CHECK(method_version>0);
-- PostgreSQL locking SELECT requires UPDATE privilege on at least one column.
-- Existing B1-X lock_principal/lock_memberships/policy locks lack these four grants.
-- Broker only: callers retain zero table privileges. Requires explicit owner approval.
GRANT UPDATE(id) ON identity_private.principals TO cleanops_auth_broker;
GRANT UPDATE(id) ON app.organizations TO cleanops_auth_broker;
GRANT UPDATE(id) ON app.users TO cleanops_auth_broker;
GRANT UPDATE(tenant_id) ON app.policy_versions TO cleanops_auth_broker;
CREATE FUNCTION auth_api.trusted_mfa_material(raw_preauth text,purpose text,grant_key text,resource uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; c identity_private.tx_context; t uuid; u uuid;
 risk text; recipient text; methods jsonb; until_at timestamptz;
BEGIN
 IF purpose IS NULL OR purpose NOT IN('LOGIN','STEP_UP','ENROLLMENT','ISSUE_SESSION') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF raw_preauth IS NULL THEN
  IF purpose NOT IN('STEP_UP','ENROLLMENT') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  IF purpose='ENROLLMENT' THEN c:=identity_private.guard('B1-SELF-05',true);
  ELSE
   IF grant_key IS NULL OR grant_key NOT IN('B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-08')
    OR (grant_key='B1-SELF-08')<>(resource IS NOT NULL) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
   c:=identity_private.guard(grant_key,false,resource);
  END IF;
  t:=c.tenant_id;u:=c.user_id;
  SELECT LEAST(absolute_expires_at,idle_expires_at) INTO until_at FROM app.sessions WHERE tenant_id=t AND id=c.session_id;
 ELSE
  IF purpose='STEP_UP' OR grant_key IS NOT NULL OR resource IS NOT NULL THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id;until_at:=q.expires_at;
  IF t IS NULL OR u IS NULL
   OR (purpose='LOGIN' AND q.state<>'PENDING_MFA')
   OR (purpose='ISSUE_SESSION' AND (q.state<>'VERIFIED' OR q.factor_verified_at IS NULL))
   OR (purpose='ENROLLMENT' AND (q.state NOT IN('PENDING_MFA','ENROLLMENT_REQUIRED') OR NOT identity_private.rule_allowed(t,'B1-SELF-05')))
   THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 END IF;
 IF purpose<>'STEP_UP' AND (grant_key IS NOT NULL OR resource IS NOT NULL) THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=t FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT x.risk_class,p.email_normalized INTO risk,recipient
 FROM app.users x JOIN identity_private.principals p ON p.id=x.principal_id
 JOIN app.organizations o ON o.id=x.tenant_id
 WHERE x.tenant_id=t AND x.id=u AND x.state='ACTIVE' AND o.state='ACTIVE' AND p.state='ACTIVE'
; -- checked_preauth/context already hold membership SHARE; avoid lock upgrade.
 IF NOT FOUND OR risk IS NULL OR risk NOT IN('SENSITIVE','OPERATIONAL') OR until_at IS NULL OR clock_timestamp()>=until_at
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 -- User row serializes method enable/revoke/enroll with the existing broker.
 PERFORM 1 FROM app.mfa_methods m WHERE m.tenant_id=t AND m.user_id=u ORDER BY m.id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'version',m.method_version::text) ORDER BY m.id),'[]'::jsonb)
 INTO methods FROM app.mfa_methods m WHERE m.tenant_id=t AND m.user_id=u AND m.state='ACTIVE';
 -- A method lock can wait beyond the earlier validity check.
 IF clock_timestamp()>=until_at THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF purpose='ENROLLMENT' AND raw_preauth IS NOT NULL AND jsonb_array_length(methods)<>0
 THEN RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('tenantId',t,'userId',u,'bindingId',coalesce(q.id,c.session_id),
  'riskClass',risk,'enabledMethods',methods,
  'recipient',CASE WHEN purpose IN('LOGIN','STEP_UP') THEN recipient ELSE NULL END,'expiresAt',until_at);
END $fn$;

CREATE FUNCTION auth_api.issue_bound_challenge(raw_preauth text,method_kind text,method uuid,expected_version bigint,proof_hash bytea,payload bytea,payload_key text,grant_key text,resource uuid,corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE material jsonb; k uuid;
BEGIN
 IF method_kind IS DISTINCT FROM 'TOTP' THEN RAISE EXCEPTION 'USE_VERIFIED_EMAIL_CONTRACT' USING ERRCODE='42501';END IF;
 material:=auth_api.trusted_mfa_material(raw_preauth,CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END,grant_key,resource);
 IF method IS NULL OR expected_version IS NULL OR expected_version<=0 OR method_kind IS NULL
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(material->'enabledMethods') m
 WHERE m->>'id'=method::text AND m->>'kind'=method_kind AND m->>'version'=expected_version::text)
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF method_kind='EMAIL_OTP' AND (payload_key IS NULL OR length(payload_key)=0 OR payload IS NULL OR octet_length(payload)=0)
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 -- Private issuer MUST encrypt recipient from this locked material, not browser input.
 IF corr IS NULL OR (method_kind='TOTP' AND (proof_hash IS NOT NULL OR payload IS NOT NULL OR payload_key IS NOT NULL))
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 k:=auth_api.issue_challenge(raw_preauth,method_kind,method,proof_hash,payload,payload_key,grant_key,resource);
 UPDATE app.mfa_challenges x SET method_version=expected_version
 WHERE x.tenant_id=(material->>'tenantId')::uuid AND x.id=k AND x.user_id=(material->>'userId')::uuid AND x.state='ISSUED';
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM identity_private.append_audit((material->>'tenantId')::uuid,(material->>'userId')::uuid,'auth.challenge.issue',k,1,corr);
 RETURN k;
END $fn$;

CREATE FUNCTION auth_api.begin_totp_enrollment_assigned(raw_preauth text,expected_tenant uuid,expected_user uuid,assigned_method uuid,initial_version bigint,ciphertext bytea,key_version text,algorithm text,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE material jsonb; t uuid;u uuid;bid uuid;k uuid:=assigned_method;
BEGIN
 material:=auth_api.trusted_mfa_material(raw_preauth,'ENROLLMENT',NULL,NULL);
 t:=(material->>'tenantId')::uuid;u:=(material->>'userId')::uuid;bid:=(material->>'bindingId')::uuid;
 IF t IS DISTINCT FROM expected_tenant OR u IS DISTINCT FROM expected_user OR k IS NULL
 OR initial_version IS DISTINCT FROM 1::bigint OR corr IS NULL
 OR ciphertext IS NULL OR octet_length(ciphertext) NOT BETWEEN 45 AND 157 OR get_byte(ciphertext,0)<>2
 OR key_version IS NULL OR length(key_version)=0 OR algorithm IS NULL OR algorithm NOT IN('SHA1','SHA256','SHA512')
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=t AND user_id=u AND kind='TOTP' AND state='PENDING';
 -- No upsert: a repeated assigned UUID fails and rolls back pending revocations/audit.
 INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,algorithm,method_version,created_at,enrollment_preauth_id,enrollment_session_id)
 VALUES(t,k,u,'TOTP','PENDING',ciphertext,key_version,algorithm,initial_version,clock_timestamp(),
 CASE WHEN raw_preauth IS NOT NULL THEN bid END,CASE WHEN raw_preauth IS NULL THEN bid END);
 IF raw_preauth IS NOT NULL THEN UPDATE identity_private.preauth SET state='ENROLLMENT_REQUIRED' WHERE id=bid; END IF;
 PERFORM identity_private.append_audit(t,u,'self_mfa.enroll',k,1,corr);
 RETURN jsonb_build_object('methodId',k,'initialVersion',initial_version::text,
 'expiresAt',LEAST((material->>'expiresAt')::timestamptz,(SELECT m.created_at+make_interval(secs=>identity_private.cfg('enrollment_ttl')) FROM app.mfa_methods m WHERE m.tenant_id=t AND m.id=k)));
END $fn$;


-- Existing verifier material must reject challenges from a prior method generation.
CREATE OR REPLACE FUNCTION auth_api.totp_material_locked(raw_preauth text,ceremony uuid,purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; q identity_private.preauth; m app.mfa_methods; x app.mfa_challenges;
 t uuid; u uuid; mid uuid; until_at timestamptz; g text; r uuid; sid uuid;
BEGIN
 IF purpose IS NULL OR purpose NOT IN('LOGIN','STEP_UP','ENROLLMENT')
 OR ceremony IS NULL OR (purpose='LOGIN' AND raw_preauth IS NULL)
 OR (purpose='STEP_UP' AND raw_preauth IS NOT NULL) THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF raw_preauth IS NULL THEN
  c:=identity_private.context();t:=c.tenant_id;u:=c.user_id;sid:=c.session_id;
  SELECT LEAST(absolute_expires_at,idle_expires_at) INTO until_at FROM app.sessions WHERE tenant_id=t AND id=sid;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id;until_at:=q.expires_at; END IF;
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=t FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF purpose='ENROLLMENT' THEN
  IF raw_preauth IS NULL THEN PERFORM identity_private.guard('B1-SELF-06',true);
  ELSIF q.state<>'ENROLLMENT_REQUIRED' OR NOT identity_private.rule_allowed(t,'B1-SELF-06') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  mid:=ceremony;
 ELSE
  IF purpose='LOGIN' AND q.state<>'PENDING_MFA' THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=ceremony AND user_id=u;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  mid:=x.method_id;
 END IF;
 SELECT * INTO m FROM app.mfa_methods WHERE tenant_id=t AND id=mid AND user_id=u FOR UPDATE;
 IF NOT FOUND OR m.kind<>'TOTP' OR m.algorithm IS NULL OR m.secret_ciphertext IS NULL
 OR m.state<>(CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END)
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF purpose='ENROLLMENT' THEN
  IF (raw_preauth IS NOT NULL AND m.enrollment_preauth_id IS DISTINCT FROM q.id)
  OR (raw_preauth IS NULL AND m.enrollment_session_id IS DISTINCT FROM sid) THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  until_at:=LEAST(until_at,m.created_at+make_interval(secs=>identity_private.cfg('enrollment_ttl')));
 ELSE
  SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=ceremony AND user_id=u FOR UPDATE;
  IF NOT FOUND OR x.method_version IS DISTINCT FROM m.method_version OR x.method_id IS DISTINCT FROM mid OR x.kind<>'TOTP' OR x.purpose<>purpose OR x.state<>'ISSUED'
  OR x.attempts>=identity_private.cfg('otp_attempts')
  OR (raw_preauth IS NOT NULL AND x.preauth_id IS DISTINCT FROM q.id)
  OR (raw_preauth IS NULL AND x.session_id IS DISTINCT FROM sid)
  THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
  until_at:=LEAST(until_at,x.expires_at); g:=x.grant_key;r:=x.resource_id;
  IF purpose='STEP_UP' AND (g IS NULL OR g NOT IN('B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-08')
  OR (g='B1-SELF-08')<>(r IS NOT NULL) OR NOT identity_private.rule_allowed(t,g))
  THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 IF clock_timestamp()>=until_at THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('binding',jsonb_build_object('tenantId',t,'userId',u,'methodId',m.id,'purpose',purpose,'ceremonyId',ceremony),
  'version',m.method_version::text,'lastCounter',m.last_totp_counter,'expiresAt',floor(extract(epoch FROM until_at)*1000),
  'algorithm',m.algorithm,'secret_ciphertext',encode(m.secret_ciphertext,'base64'),'key_version',m.key_version,
  'grant_key',g,'resource_id',r,'session_id',sid);
END $fn$;


-- EMAIL_OTP must revalidate the ACTIVE method/version too, not just its digest.
CREATE OR REPLACE FUNCTION auth_api.consume_email_otp(raw_preauth text,challenge uuid,submitted_digest bytea,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; q identity_private.preauth; before_x app.mfa_challenges;
 x app.mfa_challenges; t uuid; u uuid; material jsonb;
BEGIN
 IF corr IS NULL OR (submitted_digest IS NOT NULL AND octet_length(submitted_digest)<>32) THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF raw_preauth IS NULL THEN c:=identity_private.context();t:=c.tenant_id;u:=c.user_id;
 ELSE q:=identity_private.checked_preauth(raw_preauth);t:=q.tenant_id;u:=q.user_id;
  IF q.state<>'PENDING_MFA' THEN RETURN false; END IF;
 END IF;
 -- Discovery only: no authority or mutation before locked re-read.
 SELECT * INTO before_x FROM app.mfa_challenges WHERE tenant_id=t AND id=challenge AND user_id=u;
 IF NOT FOUND OR before_x.kind<>'EMAIL_OTP' THEN RETURN false; END IF;
 material:=auth_api.trusted_mfa_material(raw_preauth,CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END,before_x.grant_key,before_x.resource_id);
 SELECT * INTO x FROM app.mfa_challenges WHERE tenant_id=t AND id=challenge AND user_id=u FOR UPDATE;
 IF NOT FOUND OR x.kind<>'EMAIL_OTP' OR x.state<>'ISSUED'
 OR ROW(x.method_id,x.method_version,x.grant_key,x.resource_id) IS DISTINCT FROM ROW(before_x.method_id,before_x.method_version,before_x.grant_key,before_x.resource_id)
 OR x.purpose IS DISTINCT FROM (CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END)
 OR (raw_preauth IS NULL AND x.session_id IS DISTINCT FROM c.session_id)
 OR (raw_preauth IS NOT NULL AND x.preauth_id IS DISTINCT FROM q.id)
 OR clock_timestamp()>=LEAST(x.expires_at,(material->>'expiresAt')::timestamptz)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(material->'enabledMethods') m
  WHERE m->>'id'=x.method_id::text AND m->>'kind'='EMAIL_OTP' AND m->>'version'=x.method_version::text)
 THEN RETURN false; END IF;
 RETURN auth_api.verify_challenge(raw_preauth,challenge,submitted_digest,NULL,corr);
END $fn$;

ALTER FUNCTION auth_api.trusted_mfa_material(text,text,text,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.issue_bound_challenge(text,text,uuid,bigint,bytea,bytea,text,text,uuid,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.begin_totp_enrollment_assigned(text,uuid,uuid,uuid,bigint,bytea,text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.trusted_mfa_material(text,text,text,uuid),
 auth_api.issue_bound_challenge(text,text,uuid,bigint,bytea,bytea,text,text,uuid,uuid),
 auth_api.begin_totp_enrollment_assigned(text,uuid,uuid,uuid,bigint,bytea,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.trusted_mfa_material(text,text,text,uuid),
 auth_api.issue_bound_challenge(text,text,uuid,bigint,bytea,bytea,text,text,uuid,uuid),
 auth_api.begin_totp_enrollment_assigned(text,uuid,uuid,uuid,bigint,bytea,text,text,uuid) TO cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.issue_challenge(text,text,uuid,bytea,bytea,text,text,uuid),
 auth_api.begin_totp_enrollment_explicit(text,bytea,text,text,uuid) FROM cleanops_identity_service;
-- Existing replacement functions retain their signatures and explicit restricted ACLs.
ALTER FUNCTION auth_api.totp_material_locked(text,uuid,text) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.consume_email_otp(text,uuid,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.totp_material_locked(text,uuid,text),
 auth_api.consume_email_otp(text,uuid,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.totp_material_locked(text,uuid,text),
 auth_api.consume_email_otp(text,uuid,bytea,uuid) TO cleanops_identity_service;
-- Existing issue_active_session + factor CAS reused; no alternate issuer/grant.
-- END SOURCE D1

-- REVIEW ONLY fragment. Generator embeds this once in the full consolidation.
CREATE ROLE cleanops_security_log_purger NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA identity_private TO cleanops_security_log_purger;
GRANT DELETE ON identity_private.security_log TO cleanops_security_log_purger;
GRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_security_log_purger;
CREATE POLICY security_log_purger_read_expired ON identity_private.security_log
 FOR SELECT TO cleanops_security_log_purger USING (expires_at<=statement_timestamp());
CREATE POLICY security_log_purger_delete_expired ON identity_private.security_log
 FOR DELETE TO cleanops_security_log_purger USING (expires_at<=statement_timestamp());
CREATE FUNCTION identity_private.purge_expired_security_log() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $purge$
 DELETE FROM identity_private.security_log WHERE expires_at<=statement_timestamp()
$purge$;
ALTER FUNCTION identity_private.purge_expired_security_log() OWNER TO cleanops_security_log_purger;
REVOKE ALL ON FUNCTION identity_private.purge_expired_security_log() FROM PUBLIC,
 cleanops_runtime,cleanops_identity_service,cleanops_mail_worker,cleanops_auth_maintenance;
GRANT EXECUTE ON FUNCTION identity_private.purge_expired_security_log() TO cleanops_auth_broker;


-- BEGIN E1 CONSOLIDATED REVIEW ONLY
-- E1 source for a SINGLE fresh-install candidate. REVIEW ONLY; never install alone.
-- New privileges/contracts below require exact owner approval. No initial grants/data.
GRANT UPDATE(version) ON app.policy_versions TO cleanops_auth_broker;
GRANT UPDATE(credential_version) ON identity_private.credentials TO cleanops_auth_broker;
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
DECLARE c identity_private.tx_context;s app.sessions;k uuid:=gen_random_uuid();registered_at timestamptz;
BEGIN
 c:=identity_private.guard('B1-SELF-06',true);
 IF (SELECT trusted_devices_enabled FROM app.auth_preferences WHERE tenant_id=c.tenant_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'ACCESS_DENIED';END IF;
 SELECT * INTO s FROM app.sessions WHERE tenant_id=c.tenant_id AND id=c.session_id;
 IF token_hash IS NULL OR octet_length(token_hash)<>32 OR corr IS NULL THEN RAISE EXCEPTION 'AUTH_INVALID';END IF;
 registered_at:=clock_timestamp();
 INSERT INTO app.trusted_devices VALUES(c.tenant_id,k,c.user_id,s.principal_id,token_hash,s.credential_version,registered_at,registered_at+interval '30 days',NULL);
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
 INSERT INTO identity_private.recovery_enrollments(tenant_id,user_id,principal_id,cookie_digest,credential_version,created_at)
 VALUES(q.tenant_id,q.user_id,q.principal_id,new_cookie,q.credential_version,clock_timestamp());
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
 admin_user_id uuid,admin_session_id uuid,admin_policy_version bigint,
 FOREIGN KEY(tenant_id,admin_session_id,admin_user_id) REFERENCES app.sessions(tenant_id,id,user_id),CHECK((admin_user_id IS NULL)=(admin_session_id IS NULL)),CHECK((admin_user_id IS NULL)=(admin_policy_version IS NULL)),
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
 INSERT INTO identity_private.reset_tickets(id,tenant_id,user_id,principal_id,token_digest,purpose,credential_version,evidence_id,created_at,expires_at) VALUES(k,t,u,p,token_hash,purpose_name,v,evidence,clock_timestamp(),until_at);
 PERFORM identity_private.append_audit(t,u,'auth.reset.attest',k,1,corr);RETURN k;
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

CREATE FUNCTION auth_api.authorize_password_reset(target uuid,ticket_hash bytea,reason text,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;r identity_private.reset_tickets;actor uuid;p uuid;
BEGIN
 SELECT s.principal_id INTO actor FROM identity_private.tx_context x JOIN app.sessions s ON(s.tenant_id,s.id)=(x.tenant_id,x.session_id) WHERE x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id();
 SELECT * INTO r FROM identity_private.reset_tickets WHERE token_digest=ticket_hash AND user_id=target AND purpose='PASSWORD';
 IF actor IS NULL OR r.principal_id IS NULL OR actor=r.principal_id THEN RETURN false;END IF;
 PERFORM identity_private.lock_pair_nowait(actor,r.principal_id);
 c:=identity_private.context();
 IF r.tenant_id IS DISTINCT FROM c.tenant_id OR target=c.user_id OR corr IS NULL OR reason IS NULL OR length(reason) NOT BETWEEN 1 AND 500 THEN RETURN false;END IF;
 PERFORM identity_private.lock_memberships(r.principal_id,ARRAY[c.tenant_id]);
 IF NOT auth_api.effective_access('edit','users',target) OR NOT auth_api.effective_access('manage_permissions','access',target) THEN RETURN false;END IF;
 PERFORM identity_private.guard('B1-SELF-06',true);
 SELECT * INTO r FROM identity_private.reset_tickets WHERE id=r.id FOR UPDATE;
 IF r.admin_user_id IS NOT NULL OR r.consumed_at IS NOT NULL OR clock_timestamp()>=r.expires_at OR r.credential_version IS DISTINCT FROM (SELECT credential_version FROM identity_private.credentials WHERE principal_id=r.principal_id) THEN RETURN false;END IF;
 UPDATE identity_private.reset_tickets SET admin_user_id=c.user_id,admin_session_id=c.session_id,admin_policy_version=(SELECT version FROM app.policy_versions WHERE tenant_id=c.tenant_id) WHERE id=r.id;
 INSERT INTO app.identity_reset_evidence VALUES(c.tenant_id,gen_random_uuid(),target,c.user_id,reason,r.evidence_id,clock_timestamp());
 PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'auth.password.reset_authorize',target,1,corr);RETURN true;
 -- Operator approves only the proof receipt. Never receives or chooses the password.
 -- Consumer requires unchanged policy, live approving session and fresh factor again.
END $fn$;

-- Internal only. Caller may already hold its own principal due to middleware;
-- NOWAIT on a second principal prevents reciprocal administration deadlocks.
CREATE FUNCTION identity_private.lock_pair_nowait(actor uuid,subject uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM identity_private.require_enabled();
 IF actor IS NULL OR subject IS NULL OR actor=subject THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM identity_private.principals p WHERE p.id=ANY(ARRAY[actor,subject]) AND p.state='ACTIVE' ORDER BY p.id FOR UPDATE NOWAIT;
 IF (SELECT count(*) FROM identity_private.principals WHERE id=ANY(ARRAY[actor,subject]) AND state='ACTIVE')<>2 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM identity_private.credentials c WHERE c.principal_id=ANY(ARRAY[actor,subject]) ORDER BY c.principal_id FOR UPDATE NOWAIT;
 IF (SELECT count(*) FROM identity_private.credentials WHERE principal_id=ANY(ARRAY[actor,subject]))<>2 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 -- 55P03 means rollback the WHOLE transaction; never continue effects or blindly retry
 -- a transport/COMMIT uncertainty. No public grant or lower isolation level.
END $fn$;

ALTER FUNCTION auth_api.record_verified_recipient(uuid,uuid,bigint,bytea,uuid,timestamptz,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.record_verified_recipient(uuid,uuid,bigint,bytea,uuid,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.record_verified_recipient(uuid,uuid,bigint,bytea,uuid,timestamptz,uuid) TO cleanops_recipient_verifier;
ALTER FUNCTION auth_api.mail_recipient_material(text,text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.mail_recipient_material(text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.mail_recipient_material(text,text,text,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.issue_email_assigned(text,uuid,bigint,bigint,uuid,uuid,bytea,bytea,text,timestamptz,text,uuid,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.issue_email_assigned(text,uuid,bigint,bigint,uuid,uuid,bytea,bytea,text,timestamptz,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.issue_email_assigned(text,uuid,bigint,bigint,uuid,uuid,bytea,bytea,text,timestamptz,text,uuid,uuid) TO cleanops_identity_service;
ALTER FUNCTION identity_private.lock_mail(uuid,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.lock_mail(uuid,uuid) FROM PUBLIC;
ALTER FUNCTION auth_api.claim_mail_v2(bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.claim_mail_v2(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.claim_mail_v2(bytea,uuid) TO cleanops_mail_worker;
ALTER FUNCTION auth_api.authorize_mail_dispatch(uuid,uuid,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.authorize_mail_dispatch(uuid,uuid,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.authorize_mail_dispatch(uuid,uuid,bytea,uuid) TO cleanops_mail_worker;
ALTER FUNCTION auth_api.finish_mail_outcome_cas(uuid,uuid,bytea,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.finish_mail_outcome_cas(uuid,uuid,bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.finish_mail_outcome_cas(uuid,uuid,bytea,text,uuid) TO cleanops_mail_worker;
ALTER FUNCTION auth_api.effective_access(text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.effective_access(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.effective_access(text,text,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.register_trusted_device(bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.register_trusted_device(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.register_trusted_device(bytea,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.trusted_device_valid(bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.trusted_device_valid(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.trusted_device_valid(bytea) TO cleanops_identity_service;
ALTER FUNCTION auth_api.revoke_trusted_device(uuid,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.revoke_trusted_device(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.revoke_trusted_device(uuid,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.recover_to_enrollment(text,bytea,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.recover_to_enrollment(text,bytea,bytea,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.recover_to_enrollment(text,bytea,bytea,bytea,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.rotate_preauth_tenant(text,uuid,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.rotate_preauth_tenant(text,uuid,bytea,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.rotate_preauth_tenant(text,uuid,bytea,bytea,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.begin_email_enrollment(text,uuid,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.begin_email_enrollment(text,uuid,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.begin_email_enrollment(text,uuid,bigint,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.issue_email_enrollment(text,uuid,bigint,bigint,uuid,uuid,bytea,bytea,text,timestamptz,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.issue_email_enrollment(text,uuid,bigint,bigint,uuid,uuid,bytea,bytea,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.issue_email_enrollment(text,uuid,bigint,bigint,uuid,uuid,bytea,bytea,text,timestamptz,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.consume_email_v2(text,uuid,bytea,bigint,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.consume_email_v2(text,uuid,bytea,bigint,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.consume_email_v2(text,uuid,bytea,bigint,bigint,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.attest_reset(uuid,uuid,bytea,text,uuid,timestamptz,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.attest_reset(uuid,uuid,bytea,text,uuid,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.attest_reset(uuid,uuid,bytea,text,uuid,timestamptz,uuid) TO cleanops_recipient_verifier;
ALTER FUNCTION auth_api.reset_password_cas(bytea,bigint,bytea,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.reset_password_cas(bytea,bigint,bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.reset_password_cas(bytea,bigint,bytea,text,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.admin_reset_mfa(uuid,bytea,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.admin_reset_mfa(uuid,bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.admin_reset_mfa(uuid,bytea,text,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.quarantine_expired_mail(uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.quarantine_expired_mail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.quarantine_expired_mail(uuid) TO cleanops_mail_worker;
ALTER FUNCTION auth_api.set_user_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.set_user_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.set_user_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.set_access_role(uuid,text,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.set_access_role(uuid,text,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.set_access_role(uuid,text,bigint,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.set_role_membership(uuid,uuid,timestamptz,timestamptz,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.set_role_membership(uuid,uuid,timestamptz,timestamptz,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.set_role_membership(uuid,uuid,timestamptz,timestamptz,bigint,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.set_role_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.set_role_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.set_role_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.revoke_access_assignment(text,uuid,uuid,bigint,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.revoke_access_assignment(text,uuid,uuid,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.revoke_access_assignment(text,uuid,uuid,bigint,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.access_detail(uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.access_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.access_detail(uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.admin_revoke_trusted_devices(uuid,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.admin_revoke_trusted_devices(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.admin_revoke_trusted_devices(uuid,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.own_trusted_devices(integer,timestamptz,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.own_trusted_devices(integer,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.own_trusted_devices(integer,timestamptz,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.authorize_password_reset(uuid,bytea,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.authorize_password_reset(uuid,bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.authorize_password_reset(uuid,bytea,text,uuid) TO cleanops_identity_service;
ALTER FUNCTION identity_private.lock_pair_nowait(uuid,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.lock_pair_nowait(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth_api.claim_mail(bytea),auth_api.finish_mail(uuid,uuid,bytea,boolean) FROM cleanops_mail_worker;
REVOKE EXECUTE ON FUNCTION auth_api.consume_email_otp(text,uuid,bytea,uuid),auth_api.email_otp_material(text,uuid) FROM cleanops_identity_service;
-- REVIEW ONLY. New private context reader; not installed under SQL07 authorization.
CREATE FUNCTION auth_api.password_reset_material(ticket_digest bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE initial identity_private.reset_tickets; locked identity_private.reset_tickets;
 actor_principal uuid; tenants uuid[]; current_version bigint;
BEGIN
 PERFORM identity_private.require_enabled();
 IF ticket_digest IS NULL OR octet_length(ticket_digest)<>32 THEN RETURN NULL; END IF;
 -- Discovery is not authorization. Acquire the same locks/order as reset_password_cas.
 SELECT ticket.* INTO initial FROM identity_private.reset_tickets AS ticket
 WHERE ticket.token_digest=ticket_digest AND ticket.purpose='PASSWORD';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT subject.principal_id INTO actor_principal FROM app.users AS subject
 WHERE subject.tenant_id=initial.tenant_id AND subject.id=initial.admin_user_id;
 IF actor_principal IS NULL THEN PERFORM identity_private.lock_principal(initial.principal_id);
 ELSE PERFORM identity_private.lock_pair_nowait(initial.principal_id,actor_principal); END IF;
 SELECT array_agg(subject.tenant_id ORDER BY subject.tenant_id) INTO tenants
 FROM app.users AS subject WHERE subject.principal_id=initial.principal_id;
 PERFORM identity_private.lock_memberships(initial.principal_id,tenants);
 SELECT ticket.* INTO locked FROM identity_private.reset_tickets AS ticket
 WHERE ticket.id=initial.id FOR UPDATE;
 IF NOT FOUND OR ROW(locked.tenant_id,locked.user_id,locked.principal_id,locked.purpose,
 locked.credential_version,locked.admin_user_id,locked.admin_session_id,locked.admin_policy_version,locked.token_digest)
 IS DISTINCT FROM ROW(initial.tenant_id,initial.user_id,initial.principal_id,initial.purpose,
 initial.credential_version,initial.admin_user_id,initial.admin_session_id,initial.admin_policy_version,initial.token_digest)
 OR locked.purpose<>'PASSWORD' OR locked.consumed_at IS NOT NULL OR clock_timestamp()>=locked.expires_at
 THEN RETURN NULL; END IF;
 SELECT credential.credential_version INTO current_version FROM identity_private.credentials AS credential
 WHERE credential.principal_id=locked.principal_id;
 IF current_version IS DISTINCT FROM locked.credential_version THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.users AS subject WHERE subject.tenant_id=locked.tenant_id
 AND subject.id=locked.user_id AND subject.principal_id=locked.principal_id AND subject.state='ACTIVE') THEN RETURN NULL; END IF;
 IF locked.admin_user_id IS NOT NULL THEN
  PERFORM 1 FROM app.policy_versions AS policy WHERE policy.tenant_id=locked.tenant_id
  AND policy.version=locked.admin_policy_version FOR SHARE;
  IF NOT FOUND OR locked.admin_user_id=locked.user_id
  OR NOT identity_private.valid_session(locked.tenant_id,locked.admin_session_id,locked.admin_user_id)
  OR NOT EXISTS(SELECT 1 FROM app.step_up_evidence AS evidence WHERE evidence.tenant_id=locked.tenant_id
  AND evidence.user_id=locked.admin_user_id AND evidence.session_id=locked.admin_session_id
  AND evidence.grant_key='B1-SELF-06' AND evidence.resource_id IS NULL
  AND evidence.policy_version=locked.admin_policy_version AND evidence.expires_at>clock_timestamp()) THEN RETURN NULL; END IF;
 END IF;
 -- Private service only. No address, password hash, recovery digest, token or proof.
 RETURN jsonb_build_object('tenantId',locked.tenant_id,'userId',locked.user_id,
 'principalId',locked.principal_id,'credentialVersion',current_version::text,
 'expiresAt',locked.expires_at,'requiresRecovery',locked.admin_user_id IS NULL);
END $fn$;
ALTER FUNCTION auth_api.password_reset_material(bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.password_reset_material(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.password_reset_material(bytea) TO cleanops_identity_service;
-- REVIEW ONLY. Adds no identity or authentication authority to bootstrap.
CREATE FUNCTION auth_api.reserve_reset_owned(raw_bootstrap text,raw_csrf text,key_hash bytea,request_hash bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE binding jsonb; boot identity_private.csrf_bootstrap; reservation identity_private.ceremony_idempotency;
BEGIN
 PERFORM identity_private.require_enabled();
 IF raw_bootstrap IS NULL OR raw_csrf IS NULL OR raw_bootstrap !~ '^[A-Za-z0-9_-]{43}$'
 OR raw_csrf !~ '^[A-Za-z0-9_-]{43}$' OR key_hash IS NULL OR request_hash IS NULL
 OR octet_length(key_hash)<>32 OR octet_length(request_hash)<>32
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 binding:=auth_api.resolve_binding(raw_bootstrap,raw_csrf,'BOOTSTRAP');
 IF binding->>'kind' IS DISTINCT FROM 'BOOTSTRAP' THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO boot FROM identity_private.csrf_bootstrap
 WHERE cookie_digest=crypto.digest(convert_to(raw_bootstrap,'UTF8'),'sha256') FOR UPDATE;
 IF NOT FOUND OR boot.consumed_at IS NOT NULL OR boot.expires_at<=clock_timestamp()
 OR boot.csrf_digest IS DISTINCT FROM crypto.digest(convert_to(raw_csrf,'UTF8'),'sha256')
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 -- Only this operation; never login, session issuance or an authorization grant.
 INSERT INTO identity_private.ceremony_idempotency(binding_digest,operation,key_digest,request_digest,state,response_safe,one_time_result,expires_at,owner_backend,owner_xid)
 VALUES(boot.cookie_digest,'resetPassword',key_hash,request_hash,'PENDING',NULL,true,boot.expires_at,pg_backend_pid(),pg_current_xact_id())
 ON CONFLICT(binding_digest,operation,key_digest) DO NOTHING;
 SELECT * INTO reservation FROM identity_private.ceremony_idempotency
 WHERE binding_digest=boot.cookie_digest AND operation='resetPassword' AND key_digest=key_hash FOR UPDATE;
 IF NOT FOUND OR reservation.request_digest IS DISTINCT FROM request_hash OR reservation.one_time_result IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH'; END IF;
 IF reservation.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_EXPIRED'; END IF;
 IF reservation.state='COMPLETED' THEN RAISE EXCEPTION 'RESULT_NOT_REPLAYABLE'; END IF;
 IF reservation.state IS DISTINCT FROM 'PENDING' OR reservation.owner_backend IS DISTINCT FROM pg_backend_pid()
 OR reservation.owner_xid IS DISTINCT FROM pg_current_xact_id() THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED'; END IF;
 RETURN jsonb_build_object('replay',false,'requestHash',encode(request_hash,'hex'),
 'expiresAt',floor(extract(epoch FROM reservation.expires_at)*1000),'oneTime',true,'data',NULL);
END $fn$;
ALTER FUNCTION auth_api.reserve_reset_owned(text,text,bytea,bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.reserve_reset_owned(text,text,bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.reserve_reset_owned(text,text,bytea,bytea) TO cleanops_identity_service;
-- REVIEW ONLY: mandatory audited permission changes through an owned reservation.
-- Existing primitive signatures/bodies remain intact, but their service EXECUTE is
-- revoked below so this audit/reactivation guard cannot be bypassed by a caller.
CREATE FUNCTION auth_api.change_access_owned(payload jsonb,key_hash bytea,request_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
 c identity_private.tx_context;op text;reason_value text;expected bigint;actual bigint;
 required_keys text[];changed boolean:=false;denial text:='POLICY_DENIED';
 role_uuid uuid;rule_uuid uuid;user_uuid uuid;before_state jsonb;after_state jsonb;
 audit_resource uuid;revoked_role boolean;delegation_denied boolean:=false;
BEGIN
 c:=identity_private.context();
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR corr IS NULL
 OR key_hash IS NULL OR octet_length(key_hash)<>32 OR request_hash IS NULL OR octet_length(request_hash)<>32
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 op:=payload->>'operation';
 IF op IS NULL OR op NOT IN('USER_RULE','ROLE','ROLE_RULE','MEMBERSHIP','REVOKE') THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 required_keys:=ARRAY['operation','reason','expected_policy'] || CASE op
 WHEN 'USER_RULE' THEN ARRAY['target_user_id','rule_id','action','resource_kind','resource_id','effect','start_at','expires_at']
 WHEN 'ROLE' THEN ARRAY['role_id','label']
 WHEN 'ROLE_RULE' THEN ARRAY['role_id','rule_id','action','resource_kind','resource_id','effect','start_at','expires_at']
 WHEN 'MEMBERSHIP' THEN ARRAY['role_id','target_user_id','start_at','expires_at']
 ELSE ARRAY['assignment_kind','target_id','subject_id'] END;
 IF NOT (payload ?& required_keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k(n) WHERE NOT k.n=ANY(required_keys))
 OR jsonb_typeof(payload->'reason')<>'string' OR length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 500
 OR jsonb_typeof(payload->'expected_policy')<>'string' OR (payload->>'expected_policy') !~ '^[1-9][0-9]{0,18}$'
 OR (length(payload->>'expected_policy')=19 AND (payload->>'expected_policy')>'9223372036854775807')
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 reason_value:=btrim(payload->>'reason');expected:=(payload->>'expected_policy')::bigint;
 PERFORM 1 FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id
 AND r.operation='changeAccess' AND r.key_digest=key_hash AND r.request_digest=request_hash
 AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id()
 AND r.state='PENDING' AND r.one_time_result AND r.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 -- Principal/session/membership and owned locks precede the exclusive policy lock.
 -- No authorization SHARE lock is acquired before this point.
 SELECT p.version INTO actual FROM app.policy_versions p WHERE p.tenant_id=c.tenant_id FOR UPDATE;
 IF actual IS NULL THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 IF op IN('ROLE','ROLE_RULE','MEMBERSHIP') THEN role_uuid:=(payload->>'role_id')::uuid;END IF;
 IF op IN('USER_RULE','ROLE_RULE') THEN rule_uuid:=(payload->>'rule_id')::uuid;END IF;
 IF op IN('USER_RULE','MEMBERSHIP') THEN user_uuid:=(payload->>'target_user_id')::uuid;END IF;
 IF op='REVOKE' THEN
  IF payload->>'assignment_kind'='ROLE' THEN role_uuid:=(payload->>'target_id')::uuid;
  ELSIF payload->>'assignment_kind'='MEMBERSHIP' THEN role_uuid:=(payload->>'target_id')::uuid;user_uuid:=(payload->>'subject_id')::uuid;
  ELSIF payload->>'assignment_kind'='RULE' THEN rule_uuid:=(payload->>'target_id')::uuid;user_uuid:=(payload->>'subject_id')::uuid;
  ELSE RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 END IF;
 before_state:=jsonb_build_object('policy_version',actual::text,
 'role',(SELECT to_jsonb(r) FROM app.access_roles r WHERE r.tenant_id=c.tenant_id AND r.id=role_uuid),
 'rule',(SELECT to_jsonb(r) FROM app.access_rules r WHERE r.tenant_id=c.tenant_id AND r.id=rule_uuid),
 'membership',(SELECT to_jsonb(r) FROM app.access_role_memberships r WHERE r.tenant_id=c.tenant_id AND r.role_id=role_uuid AND r.user_id=user_uuid));
 IF expected=actual THEN
  BEGIN
   -- Relabeling an ACTIVE role creates no authority. Reactivating a REVOKED role
   -- restores its existing grants: apply the same no-overdelegation rule used by
   -- set_role_membership, under the exclusive policy lock, before reactivation.
   IF op='ROLE' THEN
    SELECT r.revoked_at IS NOT NULL INTO revoked_role FROM app.access_roles r WHERE r.tenant_id=c.tenant_id AND r.id=role_uuid;
    IF revoked_role IS TRUE THEN
     SELECT EXISTS(SELECT 1 FROM app.access_rules r WHERE r.tenant_id=c.tenant_id AND r.role_id=role_uuid AND r.revoked_at IS NULL AND r.effect='ALLOW'
      AND auth_api.effective_access(r.action,r.resource_kind,r.resource_id) IS DISTINCT FROM true) INTO delegation_denied;
    END IF;
   END IF;
   IF NOT delegation_denied THEN
    IF op='USER_RULE' THEN changed:=auth_api.set_user_access_rule(user_uuid,rule_uuid,payload->>'action',payload->>'resource_kind',(payload->>'resource_id')::uuid,payload->>'effect',(payload->>'start_at')::timestamptz,(payload->>'expires_at')::timestamptz,expected,corr);
    ELSIF op='ROLE' THEN changed:=auth_api.set_access_role(role_uuid,payload->>'label',expected,corr);
    ELSIF op='ROLE_RULE' THEN changed:=auth_api.set_role_access_rule(role_uuid,rule_uuid,payload->>'action',payload->>'resource_kind',(payload->>'resource_id')::uuid,payload->>'effect',(payload->>'start_at')::timestamptz,(payload->>'expires_at')::timestamptz,expected,corr);
    ELSIF op='MEMBERSHIP' THEN changed:=auth_api.set_role_membership(role_uuid,user_uuid,(payload->>'start_at')::timestamptz,(payload->>'expires_at')::timestamptz,expected,corr);
    ELSE changed:=auth_api.revoke_access_assignment(payload->>'assignment_kind',(payload->>'target_id')::uuid,(payload->>'subject_id')::uuid,expected,corr);
    END IF;
   END IF;
  EXCEPTION WHEN insufficient_privilege THEN
   changed:=false;denial:=CASE WHEN SQLERRM='STEP_UP_REQUIRED' THEN 'STEP_UP_REQUIRED' ELSE 'POLICY_DENIED' END;
  WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR foreign_key_violation THEN
   changed:=false;denial:='INVALID_INPUT';
  END;
 ELSE denial:='ACCESS_CHANGE_REJECTED';END IF;
 -- Success snapshots are server-derived, tenant-filtered, locked and private.
 -- Denials expose/store no probed target's before/after data.
 IF changed THEN
  after_state:=jsonb_build_object('policy_version',(SELECT p.version::text FROM app.policy_versions p WHERE p.tenant_id=c.tenant_id),
   'role',(SELECT to_jsonb(r) FROM app.access_roles r WHERE r.tenant_id=c.tenant_id AND r.id=role_uuid),
   'rule',(SELECT to_jsonb(r) FROM app.access_rules r WHERE r.tenant_id=c.tenant_id AND r.id=rule_uuid),
   'membership',(SELECT to_jsonb(r) FROM app.access_role_memberships r WHERE r.tenant_id=c.tenant_id AND r.role_id=role_uuid AND r.user_id=user_uuid));
  audit_resource:=CASE WHEN user_uuid IS NOT NULL THEN user_uuid WHEN role_uuid IS NOT NULL THEN role_uuid ELSE rule_uuid END;
 ELSE before_state:=NULL;after_state:=NULL;audit_resource:=NULL;END IF;
 INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
 VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER',CASE WHEN changed THEN 'auth.access.change.detail' ELSE 'auth.access.denied' END,
  audit_resource,CASE WHEN changed THEN 'SUCCESS' ELSE 'DENY' END,corr,clock_timestamp(),
  jsonb_build_object('operation',op,'reason',reason_value,'before',before_state,'after',after_state));
 IF changed THEN RETURN jsonb_build_object('changed',true);END IF;
 RETURN jsonb_build_object('changed',false,'error',denial);
END $fn$;
ALTER FUNCTION auth_api.change_access_owned(jsonb,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.change_access_owned(jsonb,bytea,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.change_access_owned(jsonb,bytea,bytea,uuid) TO cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.set_user_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) FROM cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.set_access_role(uuid,text,bigint,uuid) FROM cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.set_role_membership(uuid,uuid,timestamptz,timestamptz,bigint,uuid) FROM cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.set_role_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid) FROM cleanops_identity_service;
REVOKE EXECUTE ON FUNCTION auth_api.revoke_access_assignment(text,uuid,uuid,bigint,uuid) FROM cleanops_identity_service;

-- REVIEW ONLY: owned tenant selection with real cookie/CSRF rotation; no session issuance.
CREATE FUNCTION auth_api.select_tenant_rotated_owned(raw_preauth text,new_cookie_hash bytea,new_csrf_hash bytea,target_tenant uuid,key_hash bytea,request_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q identity_private.preauth; selected_user uuid; rejected boolean:=false;
BEGIN
 q:=identity_private.checked_preauth(raw_preauth);
 IF q.state<>'SELECTION' OR q.tenant_id IS NOT NULL OR q.user_id IS NOT NULL OR q.factor_verified_at IS NOT NULL
 OR q.origin_tenant_id IS NOT NULL OR q.origin_session_id IS NOT NULL
 OR new_cookie_hash IS NULL OR octet_length(new_cookie_hash)<>32 OR new_cookie_hash=q.cookie_digest
 OR new_csrf_hash IS NULL OR octet_length(new_csrf_hash)<>32 OR new_csrf_hash=q.csrf_digest
 OR target_tenant IS NULL OR corr IS NULL OR key_hash IS NULL OR octet_length(key_hash)<>32
 OR request_hash IS NULL OR octet_length(request_hash)<>32
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM identity_private.ceremony_idempotency AS r
 WHERE r.binding_digest=q.cookie_digest AND r.operation='switchTenant' AND r.key_digest=key_hash AND r.request_digest=request_hash
 AND r.state='PENDING' AND r.one_time_result AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id()
 AND r.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 BEGIN
  PERFORM identity_private.lock_memberships(q.principal_id,ARRAY[target_tenant]);
  PERFORM 1 FROM app.policy_versions AS p WHERE p.tenant_id=target_tenant FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
  -- Revalidate the held marker after target/policy lock waits, before effects.
  IF NOT EXISTS(SELECT 1 FROM identity_private.ceremony_idempotency AS r
   WHERE r.binding_digest=q.cookie_digest AND r.operation='switchTenant' AND r.key_digest=key_hash AND r.request_digest=request_hash
   AND r.state='PENDING' AND r.one_time_result AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id()
   AND r.expires_at>clock_timestamp())
  THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
  PERFORM auth_api.select_tenant(raw_preauth,target_tenant,corr);
  IF clock_timestamp()>=q.expires_at
  OR q.credential_version IS DISTINCT FROM (SELECT c.credential_version FROM identity_private.credentials AS c WHERE c.principal_id=q.principal_id)
  THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
  UPDATE identity_private.preauth AS p SET cookie_digest=new_cookie_hash,csrf_digest=new_csrf_hash
  WHERE p.id=q.id AND p.principal_id=q.principal_id AND p.cookie_digest=q.cookie_digest AND p.csrf_digest=q.csrf_digest
  AND p.tenant_id=target_tenant AND p.state IN('PENDING_MFA','ENROLLMENT_REQUIRED') AND p.factor_verified_at IS NULL
  RETURNING p.user_id INTO selected_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
  PERFORM identity_private.append_audit(target_tenant,selected_user,'auth.tenant.selected',q.id,1,corr);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 -- The caller records its trusted keyed denial and discards its existing owned
 -- reservation in the outer transaction. Never return a target existence/state.
 IF rejected THEN RETURN jsonb_build_object('selected',false,'error','POLICY_DENIED');END IF;
 RETURN jsonb_build_object('selected',true,'binding_id',q.id);
END $fn$;
ALTER FUNCTION auth_api.select_tenant_rotated_owned(text,bytea,bytea,uuid,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.select_tenant_rotated_owned(text,bytea,bytea,uuid,bytea,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.select_tenant_rotated_owned(text,bytea,bytea,uuid,bytea,bytea,uuid) TO cleanops_identity_service;

COMMIT;
