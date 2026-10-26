-- CLEANOPS 360 B1 V4 — REVIEW ONLY. DO NOT EXECUTE.
-- Full proposed fresh-schema contract, NOT the migration of existing staging data.
-- No application identities, rule bindings, configuration rows or secrets are seeded.
BEGIN;
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
 state text NOT NULL CHECK(state IN('PENDING','CLAIMED','SENT','FAILED','CANCELLED')),
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
  SELECT user_id INTO origin_user FROM app.sessions WHERE tenant_id=q.origin_tenant_id AND id=q.origin_session_id FOR UPDATE;
  IF NOT identity_private.valid_session(q.origin_tenant_id,q.origin_session_id,origin_user) OR NOT identity_private.rule_allowed(q.tenant_id,'B1-SELF-08') THEN RAISE EXCEPTION 'INVALID_SWITCH'; END IF;
 END IF;
 SELECT credential_version INTO cv FROM identity_private.credentials WHERE principal_id=q.principal_id;
 INSERT INTO app.sessions(tenant_id,id,user_id,principal_id,token_digest,csrf_digest,state,created_at,last_activity_at,absolute_expires_at,idle_expires_at,idle_seconds,credential_version,mfa_verified_at,device_label,browser_label)
 VALUES(q.tenant_id,k,q.user_id,q.principal_id,new_token_hash,new_csrf_hash,'ACTIVE',clock_timestamp(),clock_timestamp(),clock_timestamp()+make_interval(secs=>absolute_seconds),clock_timestamp()+make_interval(secs=>idle_seconds),idle_seconds,cv,q.factor_verified_at,device,browser);
 IF q.origin_session_id IS NOT NULL THEN
  UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=q.origin_tenant_id AND id=q.origin_session_id;
  PERFORM identity_private.append_audit(q.origin_tenant_id,origin_user,'tenant.switch.out',q.origin_session_id,1,corr);
 END IF;
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
 PERFORM s.id FROM app.sessions s WHERE s.tenant_id=c.tenant_id AND s.user_id=c.user_id AND s.id IN(c.session_id,target) ORDER BY s.id FOR UPDATE;
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
 PERFORM s.id FROM app.sessions s WHERE s.tenant_id=c.tenant_id AND s.user_id=c.user_id ORDER BY s.id FOR UPDATE;
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
GRANT DELETE ON identity_private.security_log TO cleanops_auth_broker;
CREATE FUNCTION auth_api.gc_ephemeral() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 UPDATE app.auth_outbox SET payload_ciphertext=decode('','hex'),state='CANCELLED',lease_until=NULL,claim_digest=NULL WHERE expires_at<=statement_timestamp() AND state NOT IN('SENT','CANCELLED');
 UPDATE app.mfa_challenges SET state='EXPIRED',proof_digest=NULL WHERE expires_at<=statement_timestamp() AND state='ISSUED';
 UPDATE app.mfa_methods SET state='REVOKED',secret_ciphertext=decode('','hex'),key_version='PURGED' WHERE state='PENDING' AND created_at+make_interval(secs=>identity_private.cfg('enrollment_ttl'))<=statement_timestamp();
 UPDATE identity_private.preauth SET state='REVOKED' WHERE expires_at<=statement_timestamp() AND state NOT IN('CONSUMED','REVOKED');
 DELETE FROM identity_private.csrf_bootstrap WHERE expires_at<=statement_timestamp();
 DELETE FROM identity_private.ceremony_idempotency WHERE expires_at<=statement_timestamp();
 DELETE FROM app.idempotency_records WHERE expires_at<=statement_timestamp();
 DELETE FROM identity_private.security_log WHERE expires_at<=statement_timestamp();
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
COMMIT;
