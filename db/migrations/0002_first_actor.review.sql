-- PROPOSED B1 incremental, not authorized/applied. Uses MIGRATIONS-01 journal.
-- No BEGIN/COMMIT: the canonical migration runner owns the transaction.
CREATE ROLE cleanops_first_actor_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE ROLE cleanops_first_actor_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE ROLE cleanops_first_actor_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
CREATE SCHEMA identity_provision AUTHORIZATION cleanops_first_actor_owner;
REVOKE ALL ON SCHEMA identity_provision FROM PUBLIC;
GRANT USAGE ON SCHEMA identity_provision TO cleanops_first_actor_executor,cleanops_first_actor_reader;
GRANT USAGE ON SCHEMA app,identity_private TO cleanops_first_actor_owner;
CREATE TABLE identity_provision.first_actor (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 installation_id uuid NOT NULL UNIQUE, operation_id uuid NOT NULL UNIQUE,
 request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32), manifest jsonb NOT NULL,
 operator name NOT NULL, state text NOT NULL CHECK(state IN('RESERVED','PREPARED','CONFIRMED','COMMITTED','EXPIRED','ABORTED')),
 expires_at timestamptz NOT NULL, material jsonb, receipt jsonb,
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0), abort_reason text,
 owner_backend integer, owner_xid xid8, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 CHECK((state='COMMITTED')=(receipt IS NOT NULL)),
 CHECK(state NOT IN ('COMMITTED','ABORTED') OR material IS NULL),
 CHECK((state='ABORTED')=(abort_reason IS NOT NULL))
);
ALTER TABLE identity_provision.first_actor OWNER TO cleanops_first_actor_owner;
-- Immutable aborted generations retain manifest/digest/operator, never material.
CREATE TABLE identity_provision.first_actor_history (
 installation_id uuid NOT NULL, operation_id uuid NOT NULL UNIQUE,
 generation bigint NOT NULL, request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 manifest jsonb NOT NULL, operator name NOT NULL, expires_at timestamptz NOT NULL,
 abort_reason text NOT NULL, aborted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(installation_id,generation)
);
ALTER TABLE identity_provision.first_actor_history OWNER TO cleanops_first_actor_owner;
CREATE TABLE identity_provision.events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL,
 operation_id uuid NOT NULL, operator name NOT NULL, transition text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), request_digest bytea NOT NULL, generation bigint NOT NULL
);
ALTER TABLE identity_provision.events OWNER TO cleanops_first_actor_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA identity_provision FROM PUBLIC,cleanops_first_actor_executor;

CREATE FUNCTION identity_provision.first_actor_status(i uuid,o uuid,d bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_provision.first_actor; h identity_provision.first_actor_history;
BEGIN
 PERFORM pg_advisory_xact_lock(1869764913,2);
 SELECT * INTO r FROM identity_provision.first_actor WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','ABSENT'); END IF;
 IF r.installation_id IS DISTINCT FROM i OR d IS NULL THEN RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT' USING ERRCODE='42501'; END IF;
 IF r.operation_id IS DISTINCT FROM o THEN
  SELECT * INTO h FROM identity_provision.first_actor_history
   WHERE installation_id=i AND operation_id=o AND request_digest=d AND operator=session_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('state','ABORTED','generation',h.generation,'abortReason',h.abort_reason,
   'expiresAt',floor(extract(epoch FROM h.expires_at)*1000)::bigint,'receipt',NULL);
 END IF;
 IF r.request_digest IS DISTINCT FROM d OR (r.operator<>session_user AND NOT
   (r.state='COMMITTED' AND pg_has_role(session_user,'cleanops_first_actor_reader','USAGE'))) THEN
  RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT' USING ERRCODE='42501'; END IF;
 IF r.state NOT IN ('COMMITTED','EXPIRED','ABORTED') AND r.expires_at<=clock_timestamp() THEN
  UPDATE identity_provision.first_actor SET state='EXPIRED',material=NULL,owner_backend=NULL,owner_xid=NULL WHERE singleton;
  INSERT INTO identity_provision.events(installation_id,operation_id,operator,transition,request_digest,generation) VALUES(i,o,session_user,'EXPIRED',d,r.generation);
  r.state:='EXPIRED';
 END IF;
 RETURN jsonb_build_object('state',r.state,'generation',r.generation,'abortReason',r.abort_reason,
  'expiresAt',floor(extract(epoch FROM r.expires_at)*1000)::bigint,'receipt',r.receipt);
END $fn$;

-- Historical status must never authorize a writer against the new active row.
CREATE FUNCTION identity_provision.first_actor_assert_current(i uuid,o uuid,d bytea) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_provision.first_actor;
BEGIN
 PERFORM pg_advisory_xact_lock(1869764913,2);
 SELECT * INTO r FROM identity_provision.first_actor WHERE singleton FOR UPDATE;
 IF NOT FOUND OR r.installation_id IS DISTINCT FROM i OR r.operation_id IS DISTINCT FROM o OR d IS NULL OR
  r.request_digest IS DISTINCT FROM d OR r.operator<>session_user THEN RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT' USING ERRCODE='42501'; END IF;
END $fn$;

CREATE FUNCTION identity_provision.first_actor_begin(m jsonb,d bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_provision.first_actor;
BEGIN
 PERFORM pg_advisory_xact_lock(1869764913,2);
 SELECT * INTO r FROM identity_provision.first_actor WHERE singleton FOR UPDATE;
 IF FOUND THEN
  IF r.installation_id IS DISTINCT FROM (m->>'installationId')::uuid OR r.operator<>session_user THEN RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT'; END IF;
  IF r.operation_id=(m->>'operationId')::uuid THEN
   IF r.manifest IS DISTINCT FROM m THEN RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT'; END IF;
   RETURN identity_provision.first_actor_status(r.installation_id,r.operation_id,d);
  END IF;
  -- A retry of any archived operation is status-only, never regeneration.
  IF EXISTS(SELECT 1 FROM identity_provision.first_actor_history WHERE operation_id=(m->>'operationId')::uuid) THEN
   RETURN identity_provision.first_actor_status(r.installation_id,(m->>'operationId')::uuid,d);
  END IF;
  IF r.state<>'ABORTED' OR (r.manifest-'operationId') IS DISTINCT FROM (m-'operationId') OR d IS NULL OR octet_length(d)<>32 THEN
   RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT'; END IF;
  UPDATE identity_provision.first_actor SET operation_id=(m->>'operationId')::uuid,manifest=m,request_digest=d,
   generation=generation+1,abort_reason=NULL,state='RESERVED',material=NULL,receipt=NULL,attempts=0,
   expires_at=clock_timestamp()+interval '10 minutes',owner_backend=pg_backend_pid(),owner_xid=pg_current_xact_id() WHERE singleton;
 ELSE
  IF octet_length(d)<>32 OR d IS NULL OR jsonb_typeof(m)<>'object' OR
     coalesce(length(m->>'approval'),0)=0 OR coalesce(length(m->>'approval'),121)>120 OR
     m->'rules' IS DISTINCT FROM '["B1-SELF-01","B1-SELF-02","B1-SELF-03","B1-SELF-04","B1-SELF-05","B1-SELF-06","B1-SELF-07","B1-SELF-08"]'::jsonb OR
     jsonb_typeof(m->'policy') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FIRST_ACTOR_MANIFEST'; END IF;
  IF EXISTS(SELECT 1 FROM app.organizations) OR EXISTS(SELECT 1 FROM identity_private.principals) THEN RAISE EXCEPTION 'FIRST_ACTOR_NOT_EMPTY'; END IF;
  INSERT INTO identity_provision.first_actor(singleton,installation_id,operation_id,request_digest,manifest,operator,state,expires_at,owner_backend,owner_xid)
  VALUES(true,(m->>'installationId')::uuid,(m->>'operationId')::uuid,d,m,session_user,'RESERVED',clock_timestamp()+interval '10 minutes',pg_backend_pid(),pg_current_xact_id());
 END IF;
 INSERT INTO identity_provision.events(installation_id,operation_id,operator,transition,request_digest,generation)
 VALUES((m->>'installationId')::uuid,(m->>'operationId')::uuid,session_user,'RESERVED',d,(SELECT generation FROM identity_provision.first_actor WHERE singleton));
 RETURN identity_provision.first_actor_status((m->>'installationId')::uuid,(m->>'operationId')::uuid,d);
END $fn$;

CREATE FUNCTION identity_provision.first_actor_abort(i uuid,o uuid,d bytea,reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_provision.first_actor; result jsonb;
BEGIN
 IF reason IS NULL OR reason NOT IN ('DELIVERY_LOST','EXPIRED','ATTEMPTS_EXHAUSTED','OPERATOR_CANCELLED') THEN RAISE EXCEPTION 'FIRST_ACTOR_ABORT_REASON'; END IF;
 result:=identity_provision.first_actor_status(i,o,d);
 IF result->>'state'='ABORTED' THEN
  IF result->>'abortReason' IS DISTINCT FROM reason THEN RAISE EXCEPTION 'FIRST_ACTOR_CONFLICT'; END IF;
  RETURN result;
 END IF;
 PERFORM identity_provision.first_actor_assert_current(i,o,d);
 SELECT * INTO r FROM identity_provision.first_actor WHERE singleton FOR UPDATE;
 IF r.state='COMMITTED' OR (reason='EXPIRED' AND r.state<>'EXPIRED') OR
   (reason='ATTEMPTS_EXHAUSTED' AND r.attempts<(r.manifest->'policy'->>'otp_attempts')::integer) THEN RAISE EXCEPTION 'FIRST_ACTOR_STATE'; END IF;
 INSERT INTO identity_provision.first_actor_history(installation_id,operation_id,generation,request_digest,manifest,operator,expires_at,abort_reason)
 VALUES(i,o,r.generation,d,r.manifest,r.operator,r.expires_at,reason);
 UPDATE identity_provision.first_actor SET state='ABORTED',abort_reason=reason,material=NULL,owner_backend=NULL,owner_xid=NULL WHERE singleton;
 INSERT INTO identity_provision.events(installation_id,operation_id,operator,transition,request_digest,generation)
 VALUES(i,o,session_user,'ABORTED_'||reason,d,r.generation);
 RETURN identity_provision.first_actor_status(i,o,d);
END $fn$;

CREATE FUNCTION identity_provision.first_actor_stage(i uuid,o uuid,d bytea,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_provision.first_actor;
BEGIN
 PERFORM identity_provision.first_actor_assert_current(i,o,d);
 PERFORM identity_provision.first_actor_status(i,o,d);
 SELECT * INTO r FROM identity_provision.first_actor WHERE singleton FOR UPDATE;
 IF r.state<>'RESERVED' OR r.owner_backend<>pg_backend_pid() OR r.owner_xid<>pg_current_xact_id() OR r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FIRST_ACTOR_STATE'; END IF;
 IF coalesce(p->>'passwordHash','') NOT LIKE '$argon2id$%' OR coalesce(p->>'capDigest','') !~ '^[a-f0-9]{64}$' OR
    coalesce(p->>'ciphertext','') !~ '^[a-f0-9]{90,314}$' OR coalesce(jsonb_array_length(p->'recovery'),-1)<> (r.manifest->'policy'->>'recovery_count')::integer OR
    p->>'keyVersion' IS DISTINCT FROM r.manifest->'keyCatalog'->>'keyVersion' THEN RAISE EXCEPTION 'FIRST_ACTOR_MATERIAL'; END IF;
 PERFORM (p->>'methodId')::uuid;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'recovery') x WHERE x !~ '^[a-f0-9]{64}$') OR
    (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p->'recovery') x)<>jsonb_array_length(p->'recovery') THEN RAISE EXCEPTION 'FIRST_ACTOR_RECOVERY'; END IF;
 UPDATE identity_provision.first_actor SET state='PREPARED',material=p,owner_backend=NULL,owner_xid=NULL WHERE singleton;
 INSERT INTO identity_provision.events(installation_id,operation_id,operator,transition,request_digest,generation) VALUES(i,o,session_user,'PREPARED',d,(SELECT generation FROM identity_provision.first_actor WHERE singleton));
 RETURN identity_provision.first_actor_status(i,o,d);
END $fn$;

CREATE FUNCTION identity_provision.first_actor_material(i uuid,o uuid,d bytea,cap bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_provision.first_actor;
BEGIN
 PERFORM identity_provision.first_actor_assert_current(i,o,d);
 PERFORM identity_provision.first_actor_status(i,o,d);
 SELECT * INTO r FROM identity_provision.first_actor WHERE singleton FOR UPDATE;
 IF r.state<>'PREPARED' OR r.expires_at<=clock_timestamp() OR cap IS NULL OR r.material->>'capDigest'<>encode(cap,'hex') THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('methodId',r.material->>'methodId','ciphertext',r.material->>'ciphertext','keyVersion',r.material->>'keyVersion','counter',NULL);
END $fn$;

CREATE FUNCTION identity_provision.first_actor_confirm(i uuid,o uuid,d bytea,cap bytea,counter bigint,ack boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF identity_provision.first_actor_material(i,o,d,cap) IS NULL OR counter IS NULL OR counter<0 OR ack IS DISTINCT FROM true THEN RETURN false; END IF;
 UPDATE identity_provision.first_actor SET state='CONFIRMED',material=jsonb_set(material,'{counter}',to_jsonb(counter)) WHERE singleton AND state='PREPARED';
 INSERT INTO identity_provision.events(installation_id,operation_id,operator,transition,request_digest,generation) VALUES(i,o,session_user,'CONFIRMED_RECOVERY_ACK',d,(SELECT generation FROM identity_provision.first_actor WHERE singleton));
 RETURN true;
END $fn$;

CREATE FUNCTION identity_provision.first_actor_denied(i uuid,o uuid,d bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM identity_provision.first_actor_assert_current(i,o,d);
 PERFORM identity_provision.first_actor_status(i,o,d);
 IF NOT EXISTS(SELECT 1 FROM identity_provision.first_actor WHERE singleton) THEN RAISE EXCEPTION 'FIRST_ACTOR_ABSENT'; END IF;
 UPDATE identity_provision.first_actor SET attempts=attempts+1 WHERE singleton AND state='PREPARED';
 UPDATE identity_provision.first_actor SET state='EXPIRED',material=NULL,expires_at=clock_timestamp()
 WHERE singleton AND state='PREPARED' AND attempts>=(manifest->'policy'->>'otp_attempts')::integer;
 INSERT INTO identity_provision.events(installation_id,operation_id,operator,transition,request_digest,generation) VALUES(i,o,session_user,'FACTOR_DENIED',d,(SELECT generation FROM identity_provision.first_actor WHERE singleton));
 RETURN true;
END $fn$;

-- Policies apply only to this NOLOGIN owner executing the fixed commit below.
CREATE FUNCTION identity_provision.first_actor_scope(subject uuid,kind text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM identity_provision.first_actor r WHERE singleton AND state='CONFIRMED'
 AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id()
 AND subject=(r.manifest->>CASE WHEN kind='tenant' THEN 'tenantId' ELSE 'principalId' END)::uuid)
$fn$;
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','users','policy_versions','self_service_rules','mfa_methods','recovery_codes','audit_logs'] LOOP
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO cleanops_first_actor_owner',t);
  EXECUTE format('CREATE POLICY first_actor_read ON app.%I FOR SELECT TO cleanops_first_actor_owner USING(true)',t);
  EXECUTE format('CREATE POLICY first_actor_insert ON app.%I FOR INSERT TO cleanops_first_actor_owner WITH CHECK(identity_provision.first_actor_scope(%I,''tenant''))',t,CASE WHEN t='organizations' THEN 'id' ELSE 'tenant_id' END);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['principals','credentials'] LOOP
  EXECUTE format('GRANT SELECT,INSERT ON identity_private.%I TO cleanops_first_actor_owner',t);
  EXECUTE format('CREATE POLICY first_actor_read ON identity_private.%I FOR SELECT TO cleanops_first_actor_owner USING(true)',t);
  EXECUTE format('CREATE POLICY first_actor_insert ON identity_private.%I FOR INSERT TO cleanops_first_actor_owner WITH CHECK(identity_provision.first_actor_scope(%I,''principal''))',t,CASE WHEN t='principals' THEN 'id' ELSE 'principal_id' END);
 END LOOP;
END $policies$;
GRANT SELECT,INSERT ON identity_private.configuration TO cleanops_first_actor_owner;
CREATE POLICY first_actor_configuration_read ON identity_private.configuration FOR SELECT TO cleanops_first_actor_owner USING(true);
CREATE POLICY first_actor_configuration_insert ON identity_private.configuration FOR INSERT TO cleanops_first_actor_owner
 WITH CHECK(NOT deployment_enabled AND EXISTS(SELECT 1 FROM identity_provision.first_actor WHERE singleton AND state='CONFIRMED' AND owner_backend=pg_backend_pid() AND owner_xid=pg_current_xact_id()));

CREATE FUNCTION identity_provision.first_actor_commit(i uuid,o uuid,d bytea,cap bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r identity_provision.first_actor;m jsonb;p jsonb;t uuid;u uuid;principal uuid;at_time timestamptz;batch uuid:=gen_random_uuid();v text;
BEGIN
 PERFORM identity_provision.first_actor_assert_current(i,o,d);
 PERFORM identity_provision.first_actor_status(i,o,d);
 SELECT * INTO r FROM identity_provision.first_actor WHERE singleton FOR UPDATE;
 IF r.state='COMMITTED' THEN RETURN identity_provision.first_actor_status(i,o,d); END IF;
 IF r.state<>'CONFIRMED' OR r.expires_at<=clock_timestamp() OR cap IS NULL OR r.material->>'capDigest'<>encode(cap,'hex') THEN RAISE EXCEPTION 'FIRST_ACTOR_STATE'; END IF;
 IF EXISTS(SELECT 1 FROM app.organizations) OR EXISTS(SELECT 1 FROM identity_private.principals) THEN RAISE EXCEPTION 'FIRST_ACTOR_NOT_EMPTY'; END IF;
 UPDATE identity_provision.first_actor SET owner_backend=pg_backend_pid(),owner_xid=pg_current_xact_id() WHERE singleton;
 m:=r.manifest;p:=r.material;t:=(m->>'tenantId')::uuid;u:=(m->>'userId')::uuid;principal:=(m->>'principalId')::uuid;at_time:=clock_timestamp();
 IF EXISTS(SELECT 1 FROM identity_private.configuration WHERE values_json<>m->'policy' OR deployment_enabled) THEN RAISE EXCEPTION 'FIRST_ACTOR_POLICY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM identity_private.configuration) THEN
  INSERT INTO identity_private.configuration(singleton,deployment_enabled,values_json,review_reference,version) VALUES(true,false,m->'policy',m->>'approval',1);
 END IF;
 INSERT INTO app.organizations(id,name,state,disabled_at,created_at,version) VALUES(t,m->>'tenantName','ACTIVE',NULL,at_time,1);
 INSERT INTO identity_private.principals(id,email_normalized,state,created_at) VALUES(principal,m->>'email','ACTIVE',at_time);
 INSERT INTO identity_private.credentials(principal_id,argon2id_hash,credential_version,changed_at) VALUES(principal,p->>'passwordHash',1,at_time);
 INSERT INTO app.users(tenant_id,id,principal_id,display_name,state,risk_class,created_at) VALUES(t,u,principal,m->>'displayName','ACTIVE','SENSITIVE',at_time);
 INSERT INTO app.policy_versions(tenant_id,version) VALUES(t,1);
 FOR v IN SELECT jsonb_array_elements_text(m->'rules') LOOP
  INSERT INTO app.self_service_rules(tenant_id,rule_key,effect,state,start_at,expires_at,review_reference) VALUES(t,v,'ALLOW','ACTIVE',at_time,NULL,m->>'approval');
 END LOOP;
 INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,last_totp_counter,created_at,method_version,algorithm)
 VALUES(t,(p->>'methodId')::uuid,u,'TOTP','ACTIVE',decode(p->>'ciphertext','hex'),p->>'keyVersion',(p->>'counter')::bigint,at_time,1,'SHA256');
 FOR v IN SELECT jsonb_array_elements_text(p->'recovery') LOOP
  INSERT INTO app.recovery_codes(tenant_id,id,user_id,batch_id,digest,created_at) VALUES(t,gen_random_uuid(),u,batch,decode(v,'hex'),at_time);
 END LOOP;
 INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
 VALUES(t,gen_random_uuid(),NULL,'SYSTEM','installation.first_actor.commit',u,'SUCCESS',o,at_time,jsonb_build_object('installation_id',i,'operation_id',o,'approval',m->>'approval','operator',session_user,'request_digest',encode(d,'hex')));
 UPDATE identity_provision.first_actor SET state='COMMITTED',material=NULL,owner_backend=NULL,owner_xid=NULL,
 receipt=jsonb_build_object('installationId',i,'operationId',o,'tenantId',t,'userId',u,'requestDigest',encode(d,'hex'),'generation',r.generation) WHERE singleton;
 INSERT INTO identity_provision.events(installation_id,operation_id,operator,transition,request_digest,generation) VALUES(i,o,session_user,'COMMITTED',d,(SELECT generation FROM identity_provision.first_actor WHERE singleton));
 RETURN identity_provision.first_actor_status(i,o,d);
END $fn$;

DO $owners$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity_provision' LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO cleanops_first_actor_owner',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END $owners$;
GRANT EXECUTE ON FUNCTION identity_provision.first_actor_begin(jsonb,bytea),identity_provision.first_actor_stage(uuid,uuid,bytea,jsonb),
 identity_provision.first_actor_material(uuid,uuid,bytea,bytea),identity_provision.first_actor_confirm(uuid,uuid,bytea,bytea,bigint,boolean),
 identity_provision.first_actor_denied(uuid,uuid,bytea),identity_provision.first_actor_abort(uuid,uuid,bytea,text),
 identity_provision.first_actor_commit(uuid,uuid,bytea,bytea),identity_provision.first_actor_status(uuid,uuid,bytea) TO cleanops_first_actor_executor;
GRANT EXECUTE ON FUNCTION identity_provision.first_actor_status(uuid,uuid,bytea) TO cleanops_first_actor_reader;
-- No role memberships, LOGIN credentials, web permissions, session, deployment flag
-- activation or DML provisioning are performed by this proposed migration.
