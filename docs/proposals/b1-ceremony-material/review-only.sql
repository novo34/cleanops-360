-- REVIEW ONLY. PROPOSED_REQUIRES_OWNER_APPROVAL. NOT A MIGRATION.
-- AUTH-GATE-05 OPEN; closedBackend unchanged. Never executed/compiled.
BEGIN;
DO $review_only$ BEGIN
 RAISE EXCEPTION 'REVIEW_ONLY_OWNER_APPROVAL_AND_EXECUTION_AUTHORIZATION_REQUIRED';
END $review_only$;

-- Depends on the separately reviewed B1-X overlay, not canonical V4 alone.
-- No new table, column, state or table privilege. Private function EXECUTE only.
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
 FOR UPDATE OF x;
 IF NOT FOUND OR risk IS NULL OR risk NOT IN('SENSITIVE','OPERATIONAL') OR until_at IS NULL OR clock_timestamp()>=until_at
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 -- User row serializes method enable/revoke/enroll with the existing broker.
 PERFORM 1 FROM app.mfa_methods m WHERE m.tenant_id=t AND m.user_id=u ORDER BY m.id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'version',m.method_version::text) ORDER BY m.id),'[]'::jsonb)
 INTO methods FROM app.mfa_methods m WHERE m.tenant_id=t AND m.user_id=u AND m.state='ACTIVE';
 IF purpose='ENROLLMENT' AND raw_preauth IS NOT NULL AND jsonb_array_length(methods)<>0
 THEN RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('tenantId',t,'userId',u,'bindingId',coalesce(q.id,c.session_id),
  'riskClass',risk,'enabledMethods',methods,'recipient',recipient,'expiresAt',until_at);
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
 k:=auth_api.issue_challenge(raw_preauth,method_kind,method,proof_hash,payload,payload_key,grant_key,resource);
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
 OR initial_version IS DISTINCT FROM 1::bigint OR ciphertext IS NULL OR octet_length(ciphertext)=0
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
-- Existing issue_active_session + factor CAS reused; no alternate issuer/grant.
ROLLBACK;
