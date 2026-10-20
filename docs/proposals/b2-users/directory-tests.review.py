"""REVIEW ONLY. Synthetic B2 assertions for the existing isolated B1 harness.

No entry point, installer, connection, or import-time execution. Requires specific
owner approval of this file and 001-directory.review.sql before run(b) is called.
The caller must verify the B1-owned ephemeral PG16 container and exact SQL14 base.
"""
import uuid


def run(b):
    actor, peer = b.V, b.U
    grant, deny = str(uuid.uuid4()), str(uuid.uuid4())
    service = b.ROLE['identity']

    def read(statement):
        return "BEGIN;SELECT auth_api.begin_verified_context(repeat('c',43));" + statement + 'COMMIT;'

    b.check('B2-synthetic-existing-user-resources', f"""
      INSERT INTO app.access_resources VALUES
       ('{b.A}','{peer}','users',NULL),('{b.A}','{actor}','users',NULL),('{b.B}','{b.W}','users',NULL)
       ON CONFLICT DO NOTHING;
      DELETE FROM app.access_rules WHERE tenant_id='{b.A}' AND user_id='{actor}';
      DELETE FROM app.access_role_memberships WHERE tenant_id='{b.A}' AND user_id='{actor}';
      UPDATE app.users SET display_name='B2 literal % _ example' WHERE tenant_id='{b.A}' AND id='{actor}';
    """)
    b.check('B2-no-context-denied', "SELECT auth_api.administration_users('',NULL,NULL,25);", role=service, failure='42501')
    b.check('B2-no-grant-denied', read("SELECT auth_api.administration_users('',NULL,NULL,25);"), role=service, failure='42501')
    b.check('B2-runtime-no-execute', "SELECT has_function_privilege(current_user,'auth_api.administration_users(text,text,uuid,integer)','EXECUTE');", 'f', b.ROLE['runtime'])
    b.check('B2-identity-no-direct-users', "SELECT * FROM app.users;", role=service, failure='42501')
    b.check('B2-synthetic-global-view', f"INSERT INTO app.access_rules VALUES('{b.A}','{grant}',NULL,'{actor}','view','users',NULL,'ALLOW',clock_timestamp()-interval '1m',NULL,NULL);")
    b.check('B2-list-own-tenant-only', read(f"SELECT jsonb_array_length(auth_api.administration_users('',NULL,NULL,25)->'items')=2;"), 't', service)
    b.check('B2-detail-own-organization', read(f"SELECT auth_api.administration_user('{peer}')->'organization'->>'id'='{b.A}';"), 't', service)
    b.check('B2-detail-foreign-invisible', read(f"SELECT auth_api.administration_user('{b.W}');"), role=service, failure='P0002')
    b.check('B2-detail-absent-indistinguishable', read(f"SELECT auth_api.administration_user('{uuid.uuid4()}');"), role=service, failure='P0002')
    first, second = sorted([actor, peer])
    b.check('B2-first-page-stable-keyset', read(f"SELECT auth_api.administration_users('',NULL,NULL,1)->>'next_after'='{first}';"), 't', service)
    b.check('B2-second-page-no-duplicate', read(f"SELECT auth_api.administration_users('',NULL,'{first}',1)->'items'->0->>'id'='{second}';"), 't', service)
    b.check('B2-literal-wildcard-search', read("SELECT jsonb_array_length(auth_api.administration_users('%',NULL,NULL,25)->'items')=1;"), 't', service)
    b.check('B2-empty-search-result', read("SELECT auth_api.administration_users('not-present-synthetic',NULL,NULL,25)->'items'='[]'::jsonb;"), 't', service)
    b.check('B2-no-disabled-users', read("SELECT auth_api.administration_users('','DISABLED',NULL,25)->'items'='[]'::jsonb;"), 't', service)
    b.check('B2-invalid-page-limit', read("SELECT auth_api.administration_users('',NULL,NULL,51);"), role=service, failure='42501')
    b.check('B2-synthetic-individual-deny', f"INSERT INTO app.access_rules VALUES('{b.A}','{deny}',NULL,'{actor}','view','users','{peer}','DENY',clock_timestamp()-interval '1m',NULL,NULL);")
    b.check('B2-explicit-deny-filters-global-grant', read(f"SELECT auth_api.administration_users('',NULL,NULL,25)->'items'->0->>'id'='{actor}' AND jsonb_array_length(auth_api.administration_users('',NULL,NULL,25)->'items')=1;"), 't', service)
    b.check('B2-denied-detail-is-invisible', read(f"SELECT auth_api.administration_user('{peer}');"), role=service, failure='P0002')
    b.check('B2-synthetic-scoped-only-grant', f"DELETE FROM app.access_rules WHERE tenant_id='{b.A}' AND id='{deny}';UPDATE app.access_rules SET resource_id='{peer}' WHERE tenant_id='{b.A}' AND id='{grant}';")
    b.check('B2-scoped-only-directory', read(f"SELECT auth_api.administration_users('',NULL,NULL,25)->'items'->0->>'id'='{peer}' AND jsonb_array_length(auth_api.administration_users('',NULL,NULL,25)->'items')=1;"), 't', service)
    b.check('B2-synthetic-expired-grant', f"UPDATE app.access_rules SET start_at=clock_timestamp()-interval '2m',expires_at=clock_timestamp()-interval '1m' WHERE tenant_id='{b.A}' AND id='{grant}';")
    b.check('B2-expiration-effective-next-request', read("SELECT auth_api.administration_users('',NULL,NULL,25);"), role=service, failure='42501')
    b.check('B2-synthetic-future-grant', f"UPDATE app.access_rules SET start_at=clock_timestamp()+interval '1m',expires_at=clock_timestamp()+interval '2m' WHERE tenant_id='{b.A}' AND id='{grant}';")
    b.check('B2-not-yet-started-denied', read("SELECT auth_api.administration_users('',NULL,NULL,25);"), role=service, failure='42501')
    b.check('B2-synthetic-revoked-grant', f"UPDATE app.access_rules SET start_at=clock_timestamp()-interval '1m',expires_at=NULL,revoked_at=clock_timestamp() WHERE tenant_id='{b.A}' AND id='{grant}';")
    b.check('B2-revocation-effective-next-request', read("SELECT auth_api.administration_users('',NULL,NULL,25);"), role=service, failure='42501')
    b.check('B2-synthetic-revoked-session', f"UPDATE app.sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE tenant_id='{b.A}' AND id='{b.X}';")
    b.check('B2-revoked-session-cannot-read', read("SELECT auth_api.administration_users('',NULL,NULL,25);"), role=service, failure='42501')
