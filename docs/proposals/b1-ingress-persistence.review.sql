-- PROPOSAL ONLY. Not installed, not part of SQL14 or trusted-migrations.
-- Requires independent review of schema/ACL, operator authorization and retention.
-- No automatic grants, operator role, extension, pool or cleanup procedure.
-- Existing SQL14 schemas and cleanops_ddl_owner are prerequisites.
BEGIN;
SET LOCAL ROLE cleanops_ddl_owner;
CREATE TABLE identity_private.ingress_claims (
 issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 256),
 audience text NOT NULL CHECK(length(audience) BETWEEN 1 AND 256),
 nonce text NOT NULL CHECK(nonce ~ '^[A-Za-z0-9_-]{43}$'),
 expires_at bigint NOT NULL CHECK(expires_at > 0),
 PRIMARY KEY(issuer,audience,nonce)
);
-- Claims are never deleted here, including expired ones. A later authorized
-- retention procedure may delete ONLY expired claims using trusted server time.
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
REVOKE ALL ON identity_private.ingress_claims,identity_private.ingress_credentials FROM PUBLIC;

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

-- Operator writes remain owner-only. A reference is audit metadata, NOT authority.
-- No runtime permission is proposed for these functions. Owner must first approve
-- an independent operator channel/role before any application can call them.
CREATE FUNCTION auth_api.ingress_enroll(i text,a text,d text,t bigint,e bigint,r text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF t IS NULL OR e IS NULL OR t > floor(extract(epoch FROM clock_timestamp())*1000) OR
    e <= floor(extract(epoch FROM clock_timestamp())*1000) THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 INSERT INTO identity_private.ingress_credentials(issuer,audience,id,issued_at,expires_at,state,enrollment_reference)
 VALUES(i,a,d,t,e,'active',r);
END $$;
CREATE FUNCTION auth_api.ingress_revoke(i text,a text,d text,v bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE identity_private.ingress_credentials SET state='revoked',revision=revision+1
 WHERE issuer=i AND audience=a AND id=d AND revision=v AND state='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
END $$;
CREATE FUNCTION auth_api.ingress_recover(i text,a text,old_id text,v bigint,new_id text,t bigint,e bigint,r text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF old_id=new_id THEN RAISE EXCEPTION 'INGRESS_DENIED'; END IF;
 PERFORM auth_api.ingress_revoke(i,a,old_id,v);
 PERFORM auth_api.ingress_enroll(i,a,new_id,t,e,r);
 -- One transaction: failed replacement rolls back revocation as well.
END $$;
REVOKE ALL ON FUNCTION auth_api.ingress_claim(text,text,text,bigint),
 auth_api.ingress_credential_read(text,text,text),
 auth_api.ingress_enroll(text,text,text,bigint,bigint,text),
 auth_api.ingress_revoke(text,text,text,bigint),
 auth_api.ingress_recover(text,text,text,bigint,text,bigint,bigint,text) FROM PUBLIC;
-- PENDING SECURITY DIFF: EXECUTE claim/read for cleanops_identity_service ONLY.
-- Do not apply a GRANT before independent approval of these new entry points.
COMMIT;
