-- REVIEW ONLY fragment. Generator embeds this once in the full consolidation.
CREATE ROLE cleanops_security_log_purger NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA identity_private TO cleanops_security_log_purger;
GRANT DELETE ON identity_private.security_log TO cleanops_security_log_purger;
GRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_security_log_purger;
CREATE POLICY security_log_purger_read_expired ON identity_private.security_log
 FOR SELECT TO cleanops_security_log_purger USING (expires_at<=statement_timestamp());
CREATE POLICY security_log_purger_delete_expired ON identity_private.security_log
 FOR DELETE TO cleanops_security_log_purger USING (expires_at<=statement_timestamp());
CREATE FUNCTION identity_private.purge_expired_security_log() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $purge$
 DELETE FROM identity_private.security_log WHERE expires_at<=statement_timestamp()
$purge$;
ALTER FUNCTION identity_private.purge_expired_security_log() OWNER TO cleanops_security_log_purger;
REVOKE ALL ON FUNCTION identity_private.purge_expired_security_log() FROM PUBLIC,
 cleanops_runtime,cleanops_identity_service,cleanops_mail_worker,cleanops_auth_maintenance;
GRANT EXECUTE ON FUNCTION identity_private.purge_expired_security_log() TO cleanops_auth_broker;
