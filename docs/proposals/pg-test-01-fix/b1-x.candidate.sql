-- CLEANOPS 360 B1 V4 EXTENSION — REVIEW ONLY. DO NOT EXECUTE.
-- PROPOSED_REQUIRES_OWNER_APPROVAL. AUTH-GATE-05 OPEN. Runtime closedBackend.
-- Derived proposal; canonical V4 untouched. Not a migration, not SQL-compiled.
BEGIN;

-- All statements below are a review artifact, unreachable in this transaction.
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
 SELECT * INTO s FROM app.sessions WHERE tenant_id=c.tenant_id AND id=c.session_id AND user_id=c.user_id FOR UPDATE;
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
  SELECT * INTO origin FROM app.sessions WHERE tenant_id=initial.origin_tenant_id AND id=initial.origin_session_id FOR UPDATE;
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
 OR m.state<>CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END
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
ROLLBACK;
