"""REVIEW ONLY: new B2 access fixture/SQL requires separate exact owner approval.

No entry point or import-time execution. Uses the existing owned B1 harness and
ordinary identity role. The unchanged B1 canonical matrix is run as regression.
"""
import importlib.util
import hashlib
import json
import uuid


def run(b):
    raw = (b.ROOT/'scripts/pg11-rbac-matrix.py').read_bytes()
    if hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() != '45c144c9640388b22cf9a62dab96f30bd329fd86':
        raise RuntimeError('UNCHANGED_B1_MATRIX_REQUIRED')
    role, document, project, own, inherited, deny, actor_power = [str(uuid.uuid4()) for _ in range(7)]
    operator, target = b.U, b.V
    service = b.ROLE['identity']
    q = lambda value: "'" + str(value).replace("'", "''") + "'"

    def read(statement):
        return "BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));" + statement + 'COMMIT;'

    def grant(subject, action, kind, resource, identifier=None, effect='ALLOW'):
        return f"INSERT INTO app.access_rules VALUES('{b.A}','{identifier or uuid.uuid4()}',NULL,'{subject}',{q(action)},{q(kind)}," + (q(resource) if resource else 'NULL') + f",'{effect}',clock_timestamp()-interval '1m',NULL,NULL);"

    setup = f"""
      INSERT INTO app.access_resources VALUES('{b.A}','{operator}','users',NULL),('{b.A}','{target}','users',NULL),('{b.B}','{b.W}','users',NULL) ON CONFLICT DO NOTHING;
      INSERT INTO app.access_resources VALUES('{b.A}','{project}','projects',NULL),('{b.A}','{document}','documents','{project}');
      INSERT INTO app.access_roles VALUES('{b.A}','{role}','B2 synthetic scoped reader',NULL);
      INSERT INTO app.access_rules VALUES('{b.A}','{inherited}','{role}',NULL,'view','documents','{document}','ALLOW',clock_timestamp()-interval '1m',NULL,NULL);
    """
    setup += grant(operator,'view','users',None) + grant(operator,'view','access',target) + grant(operator,'manage_permissions','access',target)
    setup += grant(target,'view','documents',document,own)
    b.check('B2-access-synthetic-scoped-fixtures',setup)
    b.check('B2-helper-not-executable-by-identity',"SELECT has_function_privilege(current_user,'identity_private.evaluate_user_access(uuid,text,text,uuid)','EXECUTE');",'f',service)
    b.check('B2-helper-cannot-impersonate-directly',read(f"SELECT identity_private.evaluate_user_access('{target}','view','documents','{document}');"),role=service,failure='42501')
    b.check('B2-target-access-is-not-actor-access',read(f"SELECT NOT auth_api.effective_access('view','documents','{document}') AND auth_api.user_effective_access('{target}','view','documents','{document}');"),'t',service)
    b.check('B2-target-read-preserves-actor-context',read(f"SELECT auth_api.user_effective_access('{target}','view','documents','{document}');SELECT id='{operator}' FROM auth_api.current_identity();"),'t\nt',service)
    for subject in [b.W,str(uuid.uuid4())]:
        b.check('B2-target-foreign-or-absent-indistinguishable-'+subject,read(f"SELECT auth_api.user_effective_access('{subject}','view','documents','{document}');"),role=service,failure='P0002')
    b.check('B2-catalogue-does-not-offer-overdelegation',read(f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(auth_api.assignable_role_catalogue('{target}',NULL)->'items') r WHERE r->>'role_id'='{role}' AND r->>'assignable'='false');"),'t',service)
    b.check('B2-access-synthetic-fresh-stepup',f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{operator}','{b.S}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));")

    def assign(tag, correlation, success=False):
        version = b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
        payload = json.dumps({'operation':'MEMBERSHIP','target_user_id':target,'role_id':role,'start_at':'2026-01-01T00:00:00Z','expires_at':None,'expected_policy':version,'reason':'B2 synthetic role assignment'})
        key = f"crypto.digest({q(tag)},'sha256')"
        request = f"crypto.digest({q(payload)},'sha256')"
        finish = f"SELECT auth_api.complete_owned(NULL,'changeAccess',{key},{request},NULL);" if success else f"SELECT auth_api.discard_owned(NULL,'changeAccess',{key},{request});"
        return read(f"SELECT auth_api.reserve_owned(NULL,'changeAccess',{key},{request},true)->>'replay';SELECT auth_api.change_access_owned({q(payload)}::jsonb,{key},{request},'{correlation}')->>'changed';"+finish)

    refused = str(uuid.uuid4())
    b.check('B2-role-assignment-no-overdelegation',assign('b2-refused-role',refused),'false\nfalse\nt',service)
    b.check('B2-refused-role-change-durable-audit',f"SELECT EXISTS(SELECT 1 FROM app.audit_logs WHERE tenant_id='{b.A}' AND actor_user_id='{operator}' AND correlation_id='{refused}' AND outcome='DENY' AND action='auth.access.denied');",'t')
    b.check('B2-access-synthetic-operator-document-power',grant(operator,'view','documents',document,actor_power))
    b.check('B2-catalogue-assignable-after-real-grant',read(f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(auth_api.assignable_role_catalogue('{target}',NULL)->'items') r WHERE r->>'role_id'='{role}' AND r->>'assignable'='true');"),'t',service)
    accepted = str(uuid.uuid4())
    b.check('B2-audited-role-assignment',assign('b2-accepted-role',accepted,True),'false\ntrue\nt',service)
    b.check('B2-role-change-durable-before-after-audit',f"SELECT EXISTS(SELECT 1 FROM app.audit_logs WHERE tenant_id='{b.A}' AND actor_user_id='{operator}' AND correlation_id='{accepted}' AND outcome='SUCCESS' AND action='auth.access.change.detail' AND safe_metadata->>'reason'='B2 synthetic role assignment' AND safe_metadata ? 'before' AND safe_metadata ? 'after');",'t')
    b.REPORT['accessBrowserFixture'] = {'document':document,'target':target,'operator':operator,'role':role}
    b.check('B2-access-positive-ui-stepup',f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{operator}','{b.S}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));")
    # A browser hook may run after this exact fixture. This assertion applies only
    # when the runner explicitly records that the real browser actually ran.
    if b.REPORT.get('accessBrowserExecuted'):
        b.check('B2-UI-change-has-actor-reason-before-after-audit',f"SELECT EXISTS(SELECT 1 FROM app.audit_logs WHERE tenant_id='{b.A}' AND actor_user_id='{operator}' AND action='auth.access.change.detail' AND outcome='SUCCESS' AND safe_metadata->>'reason'='B2 browser explicit deny' AND safe_metadata ? 'before' AND safe_metadata ? 'after');",'t')
        b.check('B2-synthetic-browser-deny-cleanup',f"DELETE FROM app.access_rules WHERE tenant_id='{b.A}' AND user_id='{target}' AND resource_id='{document}' AND effect='DENY';")
    else:
        b.record('B2-UI-audit-check','SKIP','Functional browser has not executed; not UI acceptance.')
    b.check('B2-target-synthetic-explicit-deny',grant(target,'view','documents',document,deny,'DENY'))
    b.check('B2-target-explicit-deny-beats-allows',read(f"SELECT auth_api.user_effective_access('{target}','view','documents','{document}');"),'f',service)
    b.check('B2-target-synthetic-expiry-and-membership-revocation',f"UPDATE app.access_rules SET revoked_at=clock_timestamp() WHERE tenant_id='{b.A}' AND id='{deny}';UPDATE app.access_rules SET start_at=clock_timestamp()-interval '2m',expires_at=clock_timestamp()-interval '1m' WHERE tenant_id='{b.A}' AND id='{own}';UPDATE app.access_role_memberships SET revoked_at=clock_timestamp() WHERE tenant_id='{b.A}' AND role_id='{role}' AND user_id='{target}';")
    b.check('B2-target-expiry-and-revocation-effective',read(f"SELECT auth_api.user_effective_access('{target}','view','documents','{document}');"),'f',service)
    b.check('B2-target-synthetic-scheduled-access',f"UPDATE app.access_rules SET start_at=clock_timestamp()+interval '1m',expires_at=clock_timestamp()+interval '2m' WHERE tenant_id='{b.A}' AND id='{own}';")
    b.check('B2-target-future-access-not-effective',read(f"SELECT auth_api.user_effective_access('{target}','view','documents','{document}');"),'f',service)
    b.check('B2-target-synthetic-disabled-user',f"UPDATE app.access_rules SET start_at=clock_timestamp()-interval '1m',expires_at=NULL WHERE tenant_id='{b.A}' AND id='{own}';UPDATE app.users SET state='DISABLED' WHERE tenant_id='{b.A}' AND id='{target}';")
    b.check('B2-disabled-user-no-effective-authority',read(f"SELECT auth_api.user_effective_access('{target}','view','documents','{document}');"),'f',service)
    b.check('B2-target-synthetic-user-restored',f"UPDATE app.users SET state='ACTIVE' WHERE tenant_id='{b.A}' AND id='{target}';")
    spec = importlib.util.spec_from_file_location('b2_unchanged_B1_matrix',b.ROOT/'scripts/pg11-rbac-matrix.py')
    matrix = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(matrix)
    matrix.run(b)
