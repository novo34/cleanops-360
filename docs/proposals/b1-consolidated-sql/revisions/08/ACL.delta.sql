ALTER FUNCTION auth_api.password_reset_material(bytea) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.password_reset_material(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_api.password_reset_material(bytea) TO cleanops_identity_service;
