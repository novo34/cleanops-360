-- REVIEW ONLY. Adds no identity or authentication authority to bootstrap.
CREATE FUNCTION auth_api.reserve_reset_owned(raw_bootstrap text,raw_csrf text,key_hash bytea,request_hash bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE binding jsonb; boot identity_private.csrf_bootstrap; reservation identity_private.ceremony_idempotency;
BEGIN
 PERFORM identity_private.require_enabled();
 IF raw_bootstrap IS NULL OR raw_csrf IS NULL OR raw_bootstrap !~ '^[A-Za-z0-9_-]{43}$'
 OR raw_csrf !~ '^[A-Za-z0-9_-]{43}$' OR key_hash IS NULL OR request_hash IS NULL
 OR octet_length(key_hash)<>32 OR octet_length(request_hash)<>32
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 binding:=auth_api.resolve_binding(raw_bootstrap,raw_csrf,'BOOTSTRAP');
 IF binding->>'kind' IS DISTINCT FROM 'BOOTSTRAP' THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO boot FROM identity_private.csrf_bootstrap
 WHERE cookie_digest=crypto.digest(convert_to(raw_bootstrap,'UTF8'),'sha256') FOR UPDATE;
 IF NOT FOUND OR boot.consumed_at IS NOT NULL OR boot.expires_at<=clock_timestamp()
 OR boot.csrf_digest IS DISTINCT FROM crypto.digest(convert_to(raw_csrf,'UTF8'),'sha256')
 THEN RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501'; END IF;
 -- Only this operation; never login, session issuance or an authorization grant.
 INSERT INTO identity_private.ceremony_idempotency(binding_digest,operation,key_digest,request_digest,state,response_safe,one_time_result,expires_at,owner_backend,owner_xid)
 VALUES(boot.cookie_digest,'resetPassword',key_hash,request_hash,'PENDING',NULL,true,boot.expires_at,pg_backend_pid(),pg_current_xact_id())
 ON CONFLICT(binding_digest,operation,key_digest) DO NOTHING;
 SELECT * INTO reservation FROM identity_private.ceremony_idempotency
 WHERE binding_digest=boot.cookie_digest AND operation='resetPassword' AND key_digest=key_hash FOR UPDATE;
 IF NOT FOUND OR reservation.request_digest IS DISTINCT FROM request_hash OR reservation.one_time_result IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH'; END IF;
 IF reservation.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_EXPIRED'; END IF;
 IF reservation.state='COMPLETED' THEN RAISE EXCEPTION 'RESULT_NOT_REPLAYABLE'; END IF;
 IF reservation.state IS DISTINCT FROM 'PENDING' OR reservation.owner_backend IS DISTINCT FROM pg_backend_pid()
 OR reservation.owner_xid IS DISTINCT FROM pg_current_xact_id() THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED'; END IF;
 RETURN jsonb_build_object('replay',false,'requestHash',encode(request_hash,'hex'),
 'expiresAt',floor(extract(epoch FROM reservation.expires_at)*1000),'oneTime',true,'data',NULL);
END $fn$;
ALTER FUNCTION auth_api.reserve_reset_owned(text,text,bytea,bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.reserve_reset_owned(text,text,bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.reserve_reset_owned(text,text,bytea,bytea) TO cleanops_identity_service;
