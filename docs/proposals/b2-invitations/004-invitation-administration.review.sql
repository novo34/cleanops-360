-- REVIEW ONLY. New B2 SQL/ACL/fixtures require exact individual owner approval.
-- Administrative issuance only; no principal, credential, membership, MFA or session activation.
BEGIN;
CREATE TABLE identity_private.user_invitations (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id), id uuid NOT NULL,
 email_normalized text NOT NULL CHECK(length(email_normalized) BETWEEN 3 AND 254),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 120),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 generation bigint NOT NULL CHECK(generation>0), state text NOT NULL CHECK(state IN('DRAFT','ISSUED','REVOKED','CONSUMED')),
 verifier bytea CHECK(verifier IS NULL OR octet_length(verifier)=32),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, consumed_at timestamptz,
 created_by uuid NOT NULL, owner_backend integer, owner_xid xid8,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES app.users(tenant_id,id),
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '24h'),
 CHECK((state='ISSUED')=(verifier IS NOT NULL)),
 CHECK((owner_backend IS NULL)=(owner_xid IS NULL))
);
CREATE UNIQUE INDEX user_invitation_open_recipient ON identity_private.user_invitations(tenant_id,email_normalized) WHERE state IN('DRAFT','ISSUED');
CREATE TABLE identity_private.invitation_delivery_attempts (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id), actor_id uuid NOT NULL,
 recipient_digest bytea NOT NULL CHECK(octet_length(recipient_digest)=32), requested_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.users(tenant_id,id)
);
CREATE INDEX invitation_delivery_window ON identity_private.invitation_delivery_attempts(tenant_id,requested_at);
CREATE TABLE identity_private.invitation_policy (
 tenant_id uuid PRIMARY KEY REFERENCES app.organizations(id),
 link_seconds integer NOT NULL CHECK(link_seconds BETWEEN 3600 AND 86400)
);
GRANT SELECT,INSERT,UPDATE ON identity_private.user_invitations TO cleanops_auth_broker;
GRANT SELECT,INSERT ON identity_private.invitation_delivery_attempts TO cleanops_auth_broker;
GRANT SELECT ON identity_private.invitation_policy TO cleanops_auth_broker;
REVOKE ALL ON identity_private.user_invitations,identity_private.invitation_delivery_attempts,identity_private.invitation_policy FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;

-- Extend the SAME outbox. OTP and SECURITY_NOTICE retain their existing required
-- subject/challenge fields. Invitations have no fabricated MFA challenge/user.
ALTER TABLE app.auth_outbox ADD COLUMN invitation_id uuid, ADD COLUMN invitation_generation bigint;
ALTER TABLE app.auth_outbox ALTER COLUMN user_id DROP NOT NULL, ALTER COLUMN challenge_id DROP NOT NULL;
ALTER TABLE app.auth_outbox DROP CONSTRAINT auth_outbox_event_type_check;
ALTER TABLE app.auth_outbox ADD CONSTRAINT auth_outbox_event_type_check CHECK(event_type IN('EMAIL_OTP','SECURITY_NOTICE','INVITATION'));
ALTER TABLE app.auth_outbox ADD CONSTRAINT invitation_outbox_reference FOREIGN KEY(tenant_id,invitation_id) REFERENCES identity_private.user_invitations(tenant_id,id);
ALTER TABLE app.auth_outbox ADD CONSTRAINT invitation_outbox_purpose CHECK(
 (event_type='INVITATION' AND invitation_id IS NOT NULL AND invitation_generation IS NOT NULL AND invitation_generation>0 AND user_id IS NULL AND challenge_id IS NULL AND method_id IS NULL AND method_version IS NULL AND recipient_version IS NULL)
 OR (event_type IN('EMAIL_OTP','SECURITY_NOTICE') AND invitation_id IS NULL AND invitation_generation IS NULL AND user_id IS NOT NULL AND challenge_id IS NOT NULL));

CREATE FUNCTION auth_api.invitation_draft_owned(payload jsonb,candidate uuid,key_hash bytea,request_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; v identity_private.user_invitations; op text; keys text[]; recipient text; label_value text;
 seconds integer; reason_value text; now_at timestamptz; pseudonym bytea; retry boolean; policy_ok boolean; step_ok boolean; outbox uuid:=gen_random_uuid();
BEGIN
 c:=identity_private.context();
 IF candidate IS NULL OR corr IS NULL OR key_hash IS NULL OR octet_length(key_hash)<>32 OR request_hash IS NULL OR octet_length(request_hash)<>32
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id AND r.operation='changeUserInvitation'
 AND r.key_digest=key_hash AND r.request_digest=request_hash AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id()
 AND r.state='PENDING' AND r.one_time_result AND r.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 op:=payload->>'operation';
 keys:=ARRAY['operation','reason']||CASE WHEN op='CREATE' THEN ARRAY['email','display_name'] ELSE ARRAY['invitation_id','expected_version'] END;
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR op IS NULL OR op NOT IN('CREATE','RESEND','REVOKE')
 OR NOT(payload ?& keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) x(k) WHERE NOT x.k=ANY(keys))
 OR jsonb_typeof(payload->'reason')<>'string' OR length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
 reason_value:=btrim(payload->>'reason');
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id FOR UPDATE;
 policy_ok:=FOUND AND auth_api.effective_access('create','users',NULL);
 SELECT a.step_up INTO step_ok FROM auth_api.binding_authorization(NULL,'B1-SELF-06',NULL) a;
 IF NOT policy_ok OR step_ok IS DISTINCT FROM true THEN
  INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','users.invitation.denied',NULL,'DENY',corr,clock_timestamp(),jsonb_build_object('operation',op));
  RETURN jsonb_build_object('error',CASE WHEN NOT policy_ok THEN 'POLICY_DENIED' ELSE 'STEP_UP_REQUIRED' END);
 END IF;
 IF op='CREATE' THEN
  recipient:=payload->>'email';label_value:=btrim(payload->>'display_name');
  IF jsonb_typeof(payload->'email')<>'string' OR length(recipient) NOT BETWEEN 3 AND 254 OR recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR jsonb_typeof(payload->'display_name')<>'string' OR length(label_value) NOT BETWEEN 1 AND 120 THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
 ELSE
  IF (payload->>'invitation_id') IS DISTINCT FROM candidate::text OR coalesce(payload->>'expected_version','') !~ '^[1-9][0-9]{0,18}$' THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
  SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND id=candidate FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND');END IF;
  IF v.generation::text<>payload->>'expected_version' THEN RETURN jsonb_build_object('error','INVITATION_CONFLICT');END IF;
  IF v.state NOT IN('ISSUED','REVOKED') OR (op='RESEND' AND v.state<>'ISSUED') THEN RETURN jsonb_build_object('error','INVITATION_CONFLICT');END IF;
  recipient:=v.email_normalized;label_value:=v.display_name;
 END IF;
 IF op='REVOKE' THEN
  UPDATE identity_private.user_invitations SET state='REVOKED',verifier=NULL,revoked_at=clock_timestamp(),generation=generation+1 WHERE tenant_id=c.tenant_id AND id=candidate;
  UPDATE app.auth_outbox SET state='CANCELLED',payload_ciphertext=decode('','hex'),claim_digest=NULL,lease_until=NULL WHERE tenant_id=c.tenant_id AND invitation_id=candidate AND state IN('PENDING','CLAIMED','DISPATCHING','QUARANTINED');
  INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','users.invitation.revoke',candidate,'SUCCESS',corr,clock_timestamp(),jsonb_build_object('reason',reason_value,'before_version',v.generation::text,'after_version',(v.generation+1)::text));
  RETURN jsonb_build_object('accepted',true);
 END IF;
 SELECT link_seconds INTO seconds FROM identity_private.invitation_policy WHERE tenant_id=c.tenant_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','AUTH_DEPENDENCY_UNAVAILABLE');END IF;
 now_at:=clock_timestamp();pseudonym:=crypto.digest(recipient,'sha256');
 SELECT count(*) FILTER(WHERE requested_at>now_at-interval '1h')>=100
 OR count(*) FILTER(WHERE actor_id=c.user_id AND requested_at>now_at-interval '1h')>=20
 OR count(*) FILTER(WHERE recipient_digest=pseudonym)>=10
 OR count(*) FILTER(WHERE recipient_digest=pseudonym AND requested_at>now_at-interval '1h')>=3
 OR count(*) FILTER(WHERE recipient_digest=pseudonym AND requested_at>now_at-interval '60s')>0 INTO retry
 FROM identity_private.invitation_delivery_attempts WHERE tenant_id=c.tenant_id AND requested_at>now_at-interval '1d';
 IF retry THEN
  INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','users.invitation.rate_limited',NULL,'DENY',corr,now_at,jsonb_build_object('operation',op));
  RETURN jsonb_build_object('error','RATE_LIMITED');
 END IF;
 INSERT INTO identity_private.invitation_delivery_attempts VALUES(c.tenant_id,c.user_id,pseudonym,now_at);
 IF op='CREATE' THEN
  -- Suppress duplicate open requests without disclosing a principal in another tenant.
  IF EXISTS(SELECT 1 FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND email_normalized=recipient AND state IN('DRAFT','ISSUED'))
  OR EXISTS(SELECT 1 FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE u.tenant_id=c.tenant_id AND p.email_normalized=recipient) THEN
   PERFORM identity_private.append_audit(c.tenant_id,c.user_id,'users.invitation.request',NULL,1,corr);
   RETURN jsonb_build_object('accepted',true);
  END IF;
  INSERT INTO identity_private.user_invitations VALUES(c.tenant_id,candidate,recipient,label_value,reason_value,1,'DRAFT',NULL,now_at,now_at+make_interval(secs=>seconds),NULL,NULL,c.user_id,pg_backend_pid(),pg_current_xact_id()) RETURNING * INTO v;
 ELSE
  UPDATE app.auth_outbox SET state='CANCELLED',payload_ciphertext=decode('','hex'),claim_digest=NULL,lease_until=NULL WHERE tenant_id=c.tenant_id AND invitation_id=candidate AND state IN('PENDING','CLAIMED','DISPATCHING','QUARANTINED');
  UPDATE identity_private.user_invitations SET generation=generation+1,state='DRAFT',reason=reason_value,verifier=NULL,issued_at=now_at,expires_at=now_at+make_interval(secs=>seconds),owner_backend=pg_backend_pid(),owner_xid=pg_current_xact_id() WHERE tenant_id=c.tenant_id AND id=candidate RETURNING * INTO v;
 END IF;
 RETURN jsonb_build_object('tenant_id',c.tenant_id,'invitation_id',v.id,'generation',v.generation::text,'recipient',v.email_normalized,'issued_at',v.issued_at,'expires_at',v.expires_at,'outbox_id',outbox);
END $fn$;

CREATE FUNCTION auth_api.publish_invitation_owned(invite uuid,generation_value bigint,outbox uuid,verifier_value bytea,payload bytea,key_version_value text,key_hash bytea,request_hash bytea,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;v identity_private.user_invitations;
BEGIN
 c:=identity_private.context();
 IF corr IS NULL OR outbox IS NULL OR verifier_value IS NULL OR octet_length(verifier_value)<>32 OR payload IS NULL OR octet_length(payload) NOT BETWEEN 29 AND 2048 OR key_version_value IS NULL OR length(key_version_value) NOT BETWEEN 1 AND 120 THEN RETURN false;END IF;
 PERFORM 1 FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id AND r.operation='changeUserInvitation' AND r.key_digest=key_hash AND r.request_digest=request_hash AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id() AND r.state='PENDING' AND r.one_time_result AND r.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND id=invite AND generation=generation_value AND state='DRAFT' AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id() FOR UPDATE;
 IF NOT FOUND OR v.expires_at<=clock_timestamp() THEN RETURN false;END IF;
 UPDATE identity_private.user_invitations SET state='ISSUED',verifier=verifier_value,owner_backend=NULL,owner_xid=NULL WHERE tenant_id=c.tenant_id AND id=invite;
 INSERT INTO app.auth_outbox(tenant_id,id,user_id,challenge_id,event_type,payload_ciphertext,key_version,state,dedup_key,attempts,available_at,expires_at,invitation_id,invitation_generation)
 VALUES(c.tenant_id,outbox,NULL,NULL,'INVITATION',payload,key_version_value,'PENDING',outbox,0,v.issued_at,v.expires_at,invite,generation_value);
 INSERT INTO app.audit_logs VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','users.invitation.issue',invite,'SUCCESS',corr,clock_timestamp(),jsonb_build_object('reason',v.reason,'before_generation',(generation_value-1)::text,'after_generation',generation_value::text));
 RETURN true;
END $fn$;

CREATE FUNCTION auth_api.administration_invitations(after_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;result jsonb;
BEGIN
 c:=identity_private.context();
 IF NOT auth_api.effective_access('view','users',NULL) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 WITH visible AS MATERIALIZED(SELECT id,display_name,email_normalized AS email,generation::text AS version,
 CASE WHEN state='ISSUED' AND expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE state END AS state,expires_at
 FROM identity_private.user_invitations WHERE tenant_id=c.tenant_id AND state<>'DRAFT' AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 26),
 page AS MATERIALIZED(SELECT * FROM visible ORDER BY id LIMIT 25)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM page p),'[]'::jsonb),'next_after',CASE WHEN (SELECT count(*) FROM visible)>25 THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END,'can_invite',auth_api.effective_access('create','users',NULL)) INTO result;
 IF octet_length(result::text)>identity_private.cfg('json_body_max') THEN RAISE EXCEPTION 'RESPONSE_LIMIT';END IF;
 RETURN result;
END $fn$;

ALTER FUNCTION auth_api.invitation_draft_owned(jsonb,uuid,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.publish_invitation_owned(uuid,bigint,uuid,bytea,bytea,text,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.administration_invitations(uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.invitation_draft_owned(jsonb,uuid,bytea,bytea,uuid),auth_api.publish_invitation_owned(uuid,bigint,uuid,bytea,bytea,text,bytea,bytea,uuid),auth_api.administration_invitations(uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
GRANT EXECUTE ON FUNCTION auth_api.invitation_draft_owned(jsonb,uuid,bytea,bytea,uuid),auth_api.publish_invitation_owned(uuid,bigint,uuid,bytea,bytea,text,bytea,bytea,uuid),auth_api.administration_invitations(uuid) TO cleanops_identity_service;
-- OTP claim replacement and invitation worker calls follow before COMMIT.
CREATE OR REPLACE FUNCTION auth_api.claim_mail_v2(claim_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o app.auth_outbox;
BEGIN
 PERFORM identity_private.require_enabled();
 IF claim_hash IS NULL OR octet_length(claim_hash)<>32 OR corr IS NULL THEN RAISE EXCEPTION 'INVALID_CLAIM';END IF;
 -- Expired claims are never reclaimed; a separate quarantine sweep has no principal locks.
 SELECT * INTO o FROM app.auth_outbox WHERE event_type IN('EMAIL_OTP','SECURITY_NOTICE') AND state='PENDING' AND available_at<=clock_timestamp() AND expires_at>clock_timestamp() AND attempts<identity_private.cfg('outbox_max_attempts') ORDER BY available_at,id LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF identity_private.lock_mail(o.tenant_id,o.id) IS DISTINCT FROM true THEN
  UPDATE app.auth_outbox SET state='CANCELLED',payload_ciphertext=decode('','hex') WHERE tenant_id=o.tenant_id AND id=o.id AND state='PENDING';RETURN NULL;END IF;
 SELECT * INTO o FROM app.auth_outbox WHERE tenant_id=o.tenant_id AND id=o.id FOR UPDATE;
 IF o.state<>'PENDING' OR o.available_at>clock_timestamp() OR o.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 UPDATE app.auth_outbox SET state='CLAIMED',attempts=attempts+1,claim_digest=claim_hash,lease_until=clock_timestamp()+make_interval(secs=>identity_private.cfg('outbox_claim_lease')) WHERE tenant_id=o.tenant_id AND id=o.id;
 RETURN jsonb_build_object('tenantId',o.tenant_id,'userId',o.user_id,'methodId',o.method_id,'methodVersion',o.method_version::text,'recipientVersion',o.recipient_version::text,'outboxId',o.id,'challengeId',o.challenge_id,'ciphertext',encode(o.payload_ciphertext,'hex'),'keyVersion',o.key_version,'expiresAt',o.expires_at);
END $fn$;
CREATE FUNCTION auth_api.claim_invitation_mail(claim_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o app.auth_outbox;v identity_private.user_invitations;
BEGIN
 PERFORM identity_private.require_enabled();
 IF corr IS NULL OR claim_hash IS NULL OR octet_length(claim_hash)<>32 THEN RAISE EXCEPTION 'INVALID_CLAIM';END IF;
 SELECT * INTO o FROM app.auth_outbox WHERE event_type='INVITATION' AND state='PENDING' AND available_at<=clock_timestamp() AND expires_at>clock_timestamp() AND attempts<identity_private.cfg('outbox_max_attempts') ORDER BY available_at,id LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 PERFORM 1 FROM app.organizations WHERE id=o.tenant_id AND state='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=o.tenant_id AND id=o.invitation_id FOR UPDATE;
 IF NOT FOUND OR v.state<>'ISSUED' OR v.generation<>o.invitation_generation OR v.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO o FROM app.auth_outbox WHERE tenant_id=o.tenant_id AND id=o.id AND event_type='INVITATION' AND state='PENDING' AND available_at<=clock_timestamp() AND expires_at>clock_timestamp() FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE app.auth_outbox SET state='CLAIMED',attempts=attempts+1,claim_digest=claim_hash,lease_until=clock_timestamp()+make_interval(secs=>identity_private.cfg('outbox_claim_lease')) WHERE tenant_id=o.tenant_id AND id=o.id;
 RETURN jsonb_build_object('tenantId',o.tenant_id,'invitationId',v.id,'generation',v.generation::text,'recipient',v.email_normalized,'outboxId',o.id,'ciphertext',encode(o.payload_ciphertext,'hex'),'keyVersion',o.key_version,'expiresAt',o.expires_at);
END $fn$;
CREATE FUNCTION auth_api.authorize_invitation_dispatch(t uuid,k uuid,claim_hash bytea,corr uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o app.auth_outbox;v identity_private.user_invitations;
BEGIN
 PERFORM identity_private.require_enabled();
 IF corr IS NULL OR claim_hash IS NULL OR octet_length(claim_hash)<>32 THEN RETURN false;END IF;
 SELECT * INTO o FROM app.auth_outbox WHERE tenant_id=t AND id=k AND event_type='INVITATION';
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM 1 FROM app.organizations WHERE id=t AND state='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO v FROM identity_private.user_invitations WHERE tenant_id=t AND id=o.invitation_id FOR UPDATE;
 IF NOT FOUND OR v.state<>'ISSUED' OR v.generation<>o.invitation_generation OR v.expires_at<=clock_timestamp() THEN RETURN false;END IF;
 UPDATE app.auth_outbox SET state='DISPATCHING' WHERE tenant_id=t AND id=k AND event_type='INVITATION' AND state='CLAIMED' AND claim_digest=claim_hash AND lease_until>clock_timestamp() AND expires_at>clock_timestamp();
 RETURN FOUND;
END $fn$;
ALTER FUNCTION auth_api.claim_invitation_mail(bytea,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.authorize_invitation_dispatch(uuid,uuid,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.claim_invitation_mail(bytea,uuid),auth_api.authorize_invitation_dispatch(uuid,uuid,bytea,uuid) FROM PUBLIC,cleanops_runtime,cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.claim_invitation_mail(bytea,uuid),auth_api.authorize_invitation_dispatch(uuid,uuid,bytea,uuid) TO cleanops_mail_worker;
-- Completion uses existing finish_mail_outcome_cas with SYSTEM audit (user_id NULL).
COMMIT;
