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
