-- REVIEW ONLY: new SQL/ACL requires its own exact owner authorization.
-- Extends existing tenant memberships; no duplicate users, identity or session engine.
BEGIN;

ALTER TABLE app.users ADD COLUMN profile_version bigint NOT NULL DEFAULT 1 CHECK(profile_version>0);
CREATE FUNCTION identity_private.bump_user_profile_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF ROW(NEW.display_name,NEW.state,NEW.risk_class) IS DISTINCT FROM ROW(OLD.display_name,OLD.state,OLD.risk_class)
 THEN NEW.profile_version:=OLD.profile_version+1;
 ELSE NEW.profile_version:=OLD.profile_version;END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER user_profile_version BEFORE UPDATE OF display_name,state,risk_class,profile_version ON app.users
 FOR EACH ROW EXECUTE FUNCTION identity_private.bump_user_profile_version();

CREATE FUNCTION identity_private.user_profile_version(profile app.users) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT encode(crypto.digest(convert_to(jsonb_build_array(($1).id,($1).profile_version)::text,'UTF8'),'sha256'),'hex')
$fn$;

CREATE OR REPLACE FUNCTION auth_api.administration_user(target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; result jsonb;
BEGIN
 c:=identity_private.context();
 IF target IS NULL OR NOT auth_api.effective_access('view','users',target)
 THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT jsonb_build_object('user',jsonb_build_object('id',u.id,'display_name',u.display_name,
  'state',u.state,'risk_class',u.risk_class,'created_at',u.created_at),
  'organization',jsonb_build_object('id',o.id,'name',o.name),
  'resource_version',identity_private.user_profile_version(u),
  'can_edit',auth_api.effective_access('edit','users',u.id)) INTO result
 FROM app.users u JOIN app.organizations o ON o.id=u.tenant_id
 WHERE u.tenant_id=c.tenant_id AND u.id=target;
 IF result IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 RETURN result;
END $fn$;

CREATE FUNCTION auth_api.change_user_owned(payload jsonb,key_hash bytea,request_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; before_user app.users; after_user app.users;
 target uuid;actor_principal uuid;subject_principal uuid;op text;reason_value text;expected text;failure text;
 required_keys text[];session_ended boolean:=false;before_safe jsonb;after_safe jsonb;
BEGIN
 c:=identity_private.context();
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR key_hash IS NULL OR request_hash IS NULL
 OR octet_length(key_hash)<>32 OR octet_length(request_hash)<>32 OR corr IS NULL
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
 op:=payload->>'operation';
 required_keys:=ARRAY['operation','target_user_id','expected_version','reason'] || CASE op WHEN 'EDIT' THEN ARRAY['display_name'] WHEN 'STATE' THEN ARRAY['state'] ELSE ARRAY[]::text[] END;
 IF op IS NULL OR op NOT IN('EDIT','STATE') OR NOT(payload ?& required_keys)
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k(n) WHERE NOT k.n=ANY(required_keys))
 OR jsonb_typeof(payload->'target_user_id')<>'string' OR (payload->>'target_user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR jsonb_typeof(payload->'expected_version')<>'string' OR (payload->>'expected_version') !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(payload->'reason')<>'string' OR length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 500
 OR (op='EDIT' AND (jsonb_typeof(payload->'display_name')<>'string' OR length(btrim(payload->>'display_name')) NOT BETWEEN 1 AND 120))
 OR (op='STATE' AND (jsonb_typeof(payload->'state')<>'string' OR payload->>'state' NOT IN('ACTIVE','DISABLED')))
 THEN RETURN jsonb_build_object('changed',false,'error','INVALID_INPUT');END IF;
 target:=(payload->>'target_user_id')::uuid;expected:=payload->>'expected_version';reason_value:=btrim(payload->>'reason');
 PERFORM 1 FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id
 AND r.operation='changeAdministrationUser' AND r.key_digest=key_hash AND r.request_digest=request_hash
 AND r.state='PENDING' AND r.one_time_result AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id()
 AND r.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 failure:=NULL;
 BEGIN
  IF NOT auth_api.effective_access('view','users',target)
  OR NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=target)
  THEN failure:='NOT_FOUND';
  ELSIF NOT auth_api.effective_access('edit','users',target) THEN failure:='POLICY_DENIED';
  ELSE
   PERFORM identity_private.guard('B1-SELF-06',true);
   SELECT principal_id INTO actor_principal FROM app.users WHERE tenant_id=c.tenant_id AND id=c.user_id;
   SELECT principal_id INTO subject_principal FROM app.users WHERE tenant_id=c.tenant_id AND id=target;
   IF actor_principal IS DISTINCT FROM subject_principal THEN
    -- Reuse B1's ordered NOWAIT principal/credential lock. A collision must roll
    -- back the entire transaction; do not catch it and continue business effects.
    PERFORM identity_private.lock_pair_nowait(actor_principal,subject_principal);
   END IF;
   -- B1 lock_memberships intentionally rejects DISABLED subjects and therefore
   -- cannot be used to reactivate one. Keep its organization-before-membership
   -- ordering, with the caller still validated ACTIVE by the existing context.
   PERFORM 1 FROM app.organizations WHERE id=c.tenant_id AND state='ACTIVE' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';END IF;
   -- Non-key profile updates remain compatible with FK KEY SHARE locks held by
   -- existing permission writers; no SHARE-to-exclusive policy upgrade is needed.
   SELECT * INTO before_user FROM app.users WHERE tenant_id=c.tenant_id AND id=target FOR NO KEY UPDATE;
   IF NOT FOUND THEN failure:='NOT_FOUND';
   ELSIF identity_private.user_profile_version(before_user)<>expected THEN failure:='USER_CHANGE_CONFLICT';
   ELSE
    UPDATE app.users SET display_name=CASE WHEN op='EDIT' THEN btrim(payload->>'display_name') ELSE display_name END,
     state=CASE WHEN op='STATE' THEN payload->>'state' ELSE state END
    WHERE tenant_id=c.tenant_id AND id=target RETURNING * INTO after_user;
    IF op='STATE' AND after_user.state='DISABLED' THEN
     -- Same tenant-scoped lifecycle invalidation used by B1's administrative
     -- security flows. Other memberships/principal/credentials remain intact.
     UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND state='ACTIVE';
     UPDATE app.trusted_devices SET revoked_at=clock_timestamp() WHERE tenant_id=c.tenant_id AND user_id=target AND revoked_at IS NULL;
     UPDATE app.mfa_challenges SET state='REVOKED' WHERE tenant_id=c.tenant_id AND user_id=target AND state='ISSUED';
     UPDATE identity_private.preauth SET state='REVOKED' WHERE tenant_id=c.tenant_id AND user_id=target AND state NOT IN('CONSUMED','REVOKED');
     session_ended:=(target=c.user_id);
    END IF;
   END IF;
  END IF;
 EXCEPTION
  WHEN lock_not_available THEN RAISE EXCEPTION 'USER_CHANGE_BUSY' USING ERRCODE='55P03';
  WHEN insufficient_privilege THEN
   IF SQLERRM='STEP_UP_REQUIRED' THEN failure:='STEP_UP_REQUIRED';
   ELSIF SQLERRM='ACCESS_DENIED' THEN failure:='POLICY_DENIED';
   ELSE RAISE;END IF;
  WHEN raise_exception THEN
   IF SQLERRM='STEP_UP_REQUIRED' THEN failure:='STEP_UP_REQUIRED';
   ELSIF SQLERRM='ACCESS_DENIED' THEN failure:='POLICY_DENIED';
   ELSE RAISE;END IF;
 END;
 IF failure IS NOT NULL THEN
  INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
  VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','users.change.denied',NULL,'DENY',corr,clock_timestamp(),
   jsonb_build_object('operation',op,'reason',reason_value,'before',NULL,'after',NULL));
  RETURN jsonb_build_object('changed',false,'error',failure);
 END IF;
 before_safe:=jsonb_build_object('id',before_user.id,'display_name',before_user.display_name,'state',before_user.state,'risk_class',before_user.risk_class);
 after_safe:=jsonb_build_object('id',after_user.id,'display_name',after_user.display_name,'state',after_user.state,'risk_class',after_user.risk_class);
 INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
 VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER',CASE op WHEN 'EDIT' THEN 'users.profile.change' ELSE 'users.state.change' END,
  target,'SUCCESS',corr,clock_timestamp(),jsonb_build_object('operation',op,'reason',reason_value,'before',before_safe,'after',after_safe,
   'before_version',identity_private.user_profile_version(before_user),'after_version',identity_private.user_profile_version(after_user)));
 RETURN jsonb_build_object('changed',true,'user',after_safe||jsonb_build_object('created_at',after_user.created_at),
  'resource_version',identity_private.user_profile_version(after_user),'session_ended',session_ended);
END $fn$;

ALTER FUNCTION identity_private.user_profile_version(app.users) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.user_profile_version(app.users) FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER FUNCTION identity_private.bump_user_profile_version() OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.bump_user_profile_version() FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER FUNCTION auth_api.change_user_owned(jsonb,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.change_user_owned(jsonb,bytea,bytea,uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
GRANT EXECUTE ON FUNCTION auth_api.change_user_owned(jsonb,bytea,bytea,uuid) TO cleanops_identity_service;
GRANT UPDATE(display_name,state) ON app.users TO cleanops_auth_broker;
COMMIT;
