-- PROPOSED B1 incremental, not authorized/applied. Uses MIGRATIONS-01 journal.
-- No BEGIN/COMMIT: the canonical migration runner owns the transaction and writes
-- the journal row after this file. A COMMIT here would commit a half-registered
-- journal, and a role left switched would make the runner's own UPDATE fail.
-- Requires SQL14 (roles, schemas) and an installer that may SET ROLE to
-- cleanops_ddl_owner and ALTER FUNCTION ... OWNER TO cleanops_auth_broker, exactly
-- like SQL14 itself. Requires independent review of schema/ACL and retention.
-- Runtime receives only claim/read. Credential writes (enroll/revoke/recover) belong to the
-- NOLOGIN role cleanops_ingress_operator (D1, first-actor pattern as in 0002). No LOGIN, password
-- or membership is created here: the owner creates the dedicated operator login out of band
-- (CREATE ROLE <login> LOGIN IN ROLE cleanops_ingress_operator) and never in the runtime pool.
-- Roles are cluster-wide: tolerate a prior rollback-surviving role but always enforce its attributes.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='cleanops_ingress_operator') THEN
  CREATE ROLE cleanops_ingress_operator NOLOGIN;
 END IF;
END $$;
ALTER ROLE cleanops_ingress_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
SET LOCAL ROLE cleanops_ddl_owner;
CREATE TABLE identity_private.ingress_claims (
 issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 256),
 audience text NOT NULL CHECK(length(audience) BETWEEN 1 AND 256),
 nonce text NOT NULL CHECK(nonce ~ '^[A-Za-z0-9_-]{43}$'),
 expires_at bigint NOT NULL CHECK(expires_at > 0),
 PRIMARY KEY(issuer,audience,nonce)
);
-- Claims are never deleted by the runtime. auth_api.ingress_gc (cleanops_auth_maintenance
-- only) deletes ONLY claims expired more than 60 s ago, in bounded batches, on server time.
CREATE TABLE identity_private.ingress_credentials (
 issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 256),
 audience text NOT NULL CHECK(length(audience) BETWEEN 1 AND 256),
 id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_-]{43}$'),
 issued_at bigint NOT NULL CHECK(issued_at > 0),
 expires_at bigint NOT NULL CHECK(expires_at > issued_at),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 state text NOT NULL CHECK(state IN ('active','revoked')),
 enrollment_reference text NOT NULL CHECK(length(enrollment_reference) BETWEEN 1 AND 256),
 PRIMARY KEY(issuer,audience,id)
);
-- Append-only operator audit written in the same transaction as every credential change.
-- operator is session_user (the dedicated login), the reference is metadata, not authority.
CREATE TABLE identity_private.ingress_operator_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 operator name NOT NULL DEFAULT session_user,
 action text NOT NULL CHECK(action IN ('enroll','revoke','recover')),
 issuer text NOT NULL, audience text NOT NULL,
 credential_id text NOT NULL, replaced_credential_id text,
 authorization_reference text NOT NULL CHECK(length(authorization_reference) BETWEEN 1 AND 256)
);
REVOKE ALL ON identity_private.ingress_claims,identity_private.ingress_credentials,identity_private.ingress_operator_audit FROM PUBLIC;
-- SQL14 pattern: tables belong to cleanops_ddl_owner; definer functions belong to
-- cleanops_auth_broker, which receives only the table privileges its functions use.
GRANT SELECT,INSERT,DELETE ON identity_private.ingress_claims TO cleanops_auth_broker;
GRANT SELECT,INSERT,UPDATE ON identity_private.ingress_credentials TO cleanops_auth_broker;
GRANT INSERT ON identity_private.ingress_operator_audit TO cleanops_auth_broker;

CREATE FUNCTION auth_api.ingress_claim(i text,a text,n text,e bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE inserted integer;
BEGIN
 IF i IS NULL OR a IS NULL OR n IS NULL OR e IS NULL OR
    e <= floor(extract(epoch FROM clock_timestamp())*1000) OR
    e > floor(extract(epoch FROM clock_timestamp())*1000)+30000 THEN
   RAISE EXCEPTION 'INGRESS_DENIED';
 END IF;
 INSERT INTO identity_private.ingress_claims VALUES(i,a,n,e)
 ON CONFLICT(issuer,audience,nonce) DO NOTHING;
 GET DIAGNOSTICS inserted = ROW_COUNT;
 IF e <= floor(extract(epoch FROM clock_timestamp())*1000) THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 RETURN CASE WHEN inserted=1 THEN 'claimed' ELSE 'duplicate' END;
END $$;

CREATE FUNCTION auth_api.ingress_credential_read(i text,a text,d text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('issuer',issuer,'audience',audience,'id',id,
   'issuedAt',issued_at,'expiresAt',expires_at,'revision',revision::text,
   'state',state,'enrollmentReference',enrollment_reference)
 FROM identity_private.ingress_credentials
 WHERE issuer=i AND audience=a AND id=d
   AND issued_at <= floor(extract(epoch FROM clock_timestamp())*1000)
   AND expires_at > floor(extract(epoch FROM clock_timestamp())*1000)
$$;

-- Operator writes: EXECUTE only for cleanops_ingress_operator. The authorization reference
-- (auth) is mandatory audit metadata, NOT authority; authority is the dedicated login.
CREATE FUNCTION auth_api.ingress_enroll(i text,a text,d text,t bigint,e bigint,r text,auth text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF t IS NULL OR e IS NULL OR auth IS NULL OR length(auth) NOT BETWEEN 1 AND 256 OR
    t > floor(extract(epoch FROM clock_timestamp())*1000) OR
    e <= floor(extract(epoch FROM clock_timestamp())*1000) THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 INSERT INTO identity_private.ingress_credentials(issuer,audience,id,issued_at,expires_at,state,enrollment_reference)
 VALUES(i,a,d,t,e,'active',r);
 INSERT INTO identity_private.ingress_operator_audit(action,issuer,audience,credential_id,authorization_reference)
 VALUES('enroll',i,a,d,auth);
END $$;
CREATE FUNCTION auth_api.ingress_revoke(i text,a text,d text,v bigint,auth text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth IS NULL OR length(auth) NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 UPDATE identity_private.ingress_credentials SET state='revoked',revision=revision+1
 WHERE issuer=i AND audience=a AND id=d AND revision=v AND state='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 INSERT INTO identity_private.ingress_operator_audit(action,issuer,audience,credential_id,authorization_reference)
 VALUES('revoke',i,a,d,auth);
END $$;
CREATE FUNCTION auth_api.ingress_recover(i text,a text,old_id text,v bigint,new_id text,t bigint,e bigint,r text,auth text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF old_id=new_id OR auth IS NULL OR length(auth) NOT BETWEEN 1 AND 256 OR t IS NULL OR e IS NULL OR
    t > floor(extract(epoch FROM clock_timestamp())*1000) OR
    e <= floor(extract(epoch FROM clock_timestamp())*1000) THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 -- One transaction: a failed replacement rolls back the revocation and the audit row as well.
 UPDATE identity_private.ingress_credentials SET state='revoked',revision=revision+1
 WHERE issuer=i AND audience=a AND id=old_id AND revision=v AND state='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 INSERT INTO identity_private.ingress_credentials(issuer,audience,id,issued_at,expires_at,state,enrollment_reference)
 VALUES(i,a,new_id,t,e,'active',r);
 INSERT INTO identity_private.ingress_operator_audit(action,issuer,audience,credential_id,replaced_credential_id,authorization_reference)
 VALUES('recover',i,a,new_id,old_id,auth);
END $$;
-- Bounded retention. Safe against replay: ingress_claim itself refuses any expiry that is
-- not in the future, so a purged claim can never be claimed again. No FOR UPDATE:
-- it would need UPDATE on the table; the DELETE row-locks and the batch bounds lock time.
CREATE FUNCTION auth_api.ingress_gc(max_rows integer) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE purged bigint;
BEGIN
 IF max_rows IS NULL OR max_rows NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 DELETE FROM identity_private.ingress_claims c USING (
   SELECT ctid AS row_id FROM identity_private.ingress_claims
   WHERE expires_at < floor(extract(epoch FROM clock_timestamp())*1000) - 60000
   LIMIT max_rows) expired
 WHERE c.ctid = expired.row_id;
 GET DIAGNOSTICS purged = ROW_COUNT;
 RETURN purged;
END $$;

-- Leave cleanops_ddl_owner before changing ownership (it cannot SET ROLE to the new owner).
RESET ROLE;
ALTER FUNCTION auth_api.ingress_claim(text,text,text,bigint) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.ingress_credential_read(text,text,text) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.ingress_enroll(text,text,text,bigint,bigint,text,text) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.ingress_revoke(text,text,text,bigint,text) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.ingress_recover(text,text,text,bigint,text,bigint,bigint,text,text) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.ingress_gc(integer) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.ingress_claim(text,text,text,bigint),
 auth_api.ingress_credential_read(text,text,text),
 auth_api.ingress_enroll(text,text,text,bigint,bigint,text,text),
 auth_api.ingress_revoke(text,text,text,bigint,text),
 auth_api.ingress_recover(text,text,text,bigint,text,bigint,bigint,text,text),
 auth_api.ingress_gc(integer) FROM PUBLIC;
-- PROPOSED ONLY: two read/claim entry points for the runtime, never enrollment or recovery.
GRANT EXECUTE ON FUNCTION auth_api.ingress_claim(text,text,text,bigint),
 auth_api.ingress_credential_read(text,text,text) TO cleanops_identity_service;
-- Retention belongs to the existing SQL14 maintenance role, never to the runtime.
GRANT EXECUTE ON FUNCTION auth_api.ingress_gc(integer) TO cleanops_auth_maintenance;
-- Operator channel (D1): dedicated NOLOGIN role, no runtime/maintenance membership.
GRANT USAGE ON SCHEMA auth_api TO cleanops_ingress_operator;
GRANT EXECUTE ON FUNCTION auth_api.ingress_enroll(text,text,text,bigint,bigint,text,text),
 auth_api.ingress_revoke(text,text,text,bigint,text),
 auth_api.ingress_recover(text,text,text,bigint,text,bigint,bigint,text,text) TO cleanops_ingress_operator;
