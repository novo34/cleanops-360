-- REVIEW ONLY: not executed, not a migration/installer, no application rows.
-- Expected identifiers below come from repository contracts, not observed grants.
-- Missing schemas/roles/functions are blockers; never replace the identity with bootstrap.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL search_path = pg_catalog;

-- 1. Endpoint/session identity and expected role attributes (no pg_authid/passwords).
SELECT current_database() AS database_name, current_user AS inspection_role,
       current_setting('server_version_num') AS server_version_num,
       current_setting('transaction_read_only') AS read_only;
WITH expected(rolname) AS (VALUES ('cleanops_identity_service'), ('cleanops_auth_broker'))
SELECT e.rolname AS expected_role, r.oid IS NOT NULL AS present,
       r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
       CASE WHEN r.oid IS NOT NULL THEN
         pg_has_role((SELECT oid FROM pg_roles WHERE rolname='cleanops_identity_service'), r.oid, 'MEMBER')
       END AS identity_is_member
FROM expected e LEFT JOIN pg_roles r ON r.rolname=e.rolname ORDER BY e.rolname;

-- Reachable memberships of the expected identity only, not a server-wide role dump.
WITH RECURSIVE inherited(oid) AS (
 SELECT oid FROM pg_roles WHERE rolname='cleanops_identity_service'
 UNION
 SELECT m.roleid FROM pg_auth_members m JOIN inherited i ON m.member=i.oid
)
SELECT r.rolname,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb
FROM inherited i JOIN pg_roles r ON r.oid=i.oid ORDER BY r.rolname;

-- 2. Metadata of exactly the auth chain + future R4/CRM compatibility sentinels.
-- Every overload is returned; compare exact argument types, owner and ACL to source.
WITH expected(nspname,proname) AS (
 VALUES
 ('auth_api','security_policy'), ('auth_api','bootstrap_csrf'),
 ('auth_api','credential_material_locked'), ('auth_api','rehash_credential_cas'),
 ('auth_api','new_preauth_verified'), ('auth_api','resolve_binding'),
 ('auth_api','begin_verified_context'), ('auth_api','binding_authorization'),
 ('auth_api','preauth_summary'), ('auth_api','memberships'),
 ('auth_api','trusted_mfa_material'), ('auth_api','issue_bound_challenge'),
 ('auth_api','totp_material_locked'), ('auth_api','consume_totp_cas'),
 ('auth_api','issue_active_session'), ('auth_api','active_summary'),
 ('auth_api','current_identity'), ('auth_api','touch_activity'),
 ('auth_api','rate_attempt'), ('auth_api','record_security_event'),
 ('auth_api','reserve_owned'), ('auth_api','complete_owned'), ('auth_api','discard_owned'),
 ('auth_api','reserve_ceremony'), ('auth_api','complete_ceremony'),
 ('auth_api','select_tenant_rotated_owned'), ('auth_api','csrf_valid'),
 ('auth_api','effective_access'), ('auth_api','consume_invitation_acceptance'),
 ('auth_api','crm_companies'), ('auth_api','crm_company'), ('auth_api','crm_change'),
 ('identity_private','crm_module_guard')
), identity_role AS (SELECT oid FROM pg_roles WHERE rolname='cleanops_identity_service')
SELECT e.nspname, e.proname, p.oid IS NOT NULL AS present,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_result(p.oid) AS result_type, owner.rolname AS owner_role,
       p.prosecdef AS security_definer, p.proacl AS acl,
       CASE WHEN n.oid IS NOT NULL THEN
         has_schema_privilege((SELECT oid FROM identity_role), n.oid, 'USAGE')
       END AS expected_identity_schema_usage,
       ARRAY(SELECT setting FROM unnest(p.proconfig) setting
             WHERE setting LIKE 'search_path=%' OR setting LIKE 'row_security=%') AS security_settings,
       CASE WHEN p.prokind IN ('f','p') THEN md5(pg_get_functiondef(p.oid)) END AS definition_md5,
       CASE WHEN p.oid IS NOT NULL THEN
         has_function_privilege((SELECT oid FROM identity_role), p.oid, 'EXECUTE')
       END AS expected_identity_can_execute
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname=e.nspname
LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.proname
LEFT JOIN pg_roles owner ON owner.oid=p.proowner
ORDER BY e.nspname,e.proname,identity_arguments;

-- 3. Relevant relation metadata, RLS/ACL and column types only. No SELECT on app data.
WITH expected(nspname,relname) AS (
 VALUES ('identity_private','configuration'), ('identity_private','principals'),
 ('identity_private','credentials'), ('identity_private','preauth'),
 ('identity_private','csrf_bootstrap'), ('identity_private','ceremony_idempotency'),
 ('identity_private','tx_context'), ('app','organizations'), ('app','users'),
 ('app','sessions'), ('app','mfa_methods'), ('app','mfa_challenges'),
 ('app','idempotency_records'), ('app','audit_logs'), ('app','access_resources'),
 ('app','access_rules'), ('public','feature_flags')
), identity_role AS (SELECT oid FROM pg_roles WHERE rolname='cleanops_identity_service')
SELECT e.nspname,e.relname,c.oid IS NOT NULL AS present,c.relkind,
       owner.rolname AS owner_role,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
       CASE WHEN c.oid IS NOT NULL THEN has_table_privilege((SELECT oid FROM identity_role),c.oid,'SELECT') END AS identity_select,
       CASE WHEN c.oid IS NOT NULL THEN has_table_privilege((SELECT oid FROM identity_role),c.oid,'INSERT') END AS identity_insert,
       CASE WHEN c.oid IS NOT NULL THEN has_table_privilege((SELECT oid FROM identity_role),c.oid,'UPDATE') END AS identity_update,
       a.attname,format_type(a.atttypid,a.atttypmod) AS column_type,a.attnotnull
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname=e.nspname
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.relname
LEFT JOIN pg_roles owner ON owner.oid=c.relowner
LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
ORDER BY e.nspname,e.relname,a.attnum;
COMMIT;
