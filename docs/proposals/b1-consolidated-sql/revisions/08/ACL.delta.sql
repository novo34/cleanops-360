ALTER TABLE identity_private.recovery_enrollments OWNER TO cleanops_ddl_owner;
ALTER TABLE identity_private.recovery_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_private.recovery_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY broker_internal ON identity_private.recovery_enrollments TO cleanops_auth_broker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE ON identity_private.recovery_enrollments TO cleanops_auth_broker;
ALTER FUNCTION auth_api.password_reset_material(bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.password_reset_material(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.password_reset_material(bytea) TO cleanops_identity_service;
