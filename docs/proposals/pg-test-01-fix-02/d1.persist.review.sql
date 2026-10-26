-- REVIEW ONLY. PROPOSED_REQUIRES_OWNER_APPROVAL. NOT A MIGRATION.
-- AUTH-GATE-05 OPEN; closedBackend unchanged. Never executed/compiled.
BEGIN;

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
 OR m.state<>CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END
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
 OR x.purpose IS DISTINCT FROM CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END
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
COMMIT;
