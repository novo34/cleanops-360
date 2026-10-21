"""REVIEW ONLY. New synthetic SQL4 fixtures; no import-time execution/connection.

Native ciphertext is deliberately synthetic (not delivered). The browser uses
real AES-GCM via the private adapter and persists its actual encrypted outbox.
"""
import hashlib
import importlib.util
import json
import uuid


def run(b):
    if not b.check('install-exact-owner-authorized-SQL4',(b.ROOT/'docs/proposals/b2-invitations/004-invitation-administration.review.sql').read_text()):
        raise RuntimeError('SQL4_INSTALLATION_FAILED')
    service=b.ROLE['identity'];worker=b.ROLE['mail']
    q=lambda value:"'"+str(value).replace("'","''")+"'"
    digest=lambda value:"decode('"+hashlib.sha256(value.encode()).hexdigest()+"','hex')"
    invite=str(uuid.uuid4());foreign=str(uuid.uuid4())
    create={'operation':'CREATE','display_name':'SQL4 synthetic invitee','email':'sql4-new@fixture.invalid','reason':'SQL4 synthetic invitation'}
    def change(tag,body,candidate=invite,success=False,token='a',ending='COMMIT;'):
        payload=json.dumps(body);key=digest('sql4-'+tag);request=digest(payload);corr=str(uuid.uuid4())
        # Same owned transaction from material through encrypted publish and completion.
        statement=f"BEGIN;SELECT auth_api.begin_verified_context(repeat({q(token)},43));SELECT auth_api.reserve_owned(NULL,'changeUserInvitation',{key},{request},true)->>'replay';"
        statement+=f"WITH d AS MATERIALIZED(SELECT auth_api.invitation_draft_owned({q(payload)}::jsonb,'{candidate}',{key},{request},'{corr}') AS value) SELECT CASE WHEN value ? 'error' THEN value->>'error' WHEN value ? 'accepted' THEN value->>'accepted' ELSE auth_api.publish_invitation_owned('{candidate}',(value->>'generation')::bigint,(value->>'outbox_id')::uuid,decode(repeat('aa',32),'hex'),decode(repeat('bb',64),'hex'),'sql4-native-ciphertext-not-delivered',{key},{request},'{corr}')::text END FROM d;"
        statement+=f"SELECT auth_api.{'complete_owned' if success else 'discard_owned'}(NULL,'changeUserInvitation',{key},{request}"+(',NULL);' if success else ');')+ending
        return statement
    def grant(tenant,user,action):
        return f"INSERT INTO app.access_rules VALUES('{tenant}','{uuid.uuid4()}',NULL,'{user}',{q(action)},'users',NULL,'ALLOW',clock_timestamp()-interval '1m',NULL,NULL);"
    def step(tenant,user,session):
        return f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{tenant}','{uuid.uuid4()}','{user}','{session}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{tenant}'));"
    b.check('SQL4-explicit-approved-link-policy',f"INSERT INTO identity_private.invitation_policy VALUES('{b.A}',86400),('{b.B}',86400);")
    b.check('SQL4-identity-no-private-table-read','SELECT * FROM identity_private.user_invitations;',role=service,failure='42501')
    b.check('SQL4-no-create-grant-denied',change('denied',create),'false\nPOLICY_DENIED\nt',service)
    b.check('SQL4-synthetic-create-and-directory-view',grant(b.A,b.U,'create')+grant(b.A,b.U,'view'))
    b.check('SQL4-fresh-MFA-required',change('no-mfa',create),'false\nSTEP_UP_REQUIRED\nt',service)
    b.check('SQL4-synthetic-fresh-stepup',step(b.A,b.U,b.S))
    b.check('SQL4-create-owned-and-publish',change('create',create,success=True),'false\ntrue\nt',service)
    b.check('SQL4-no-user-or-credential-provisioned',"SELECT (SELECT count(*) FROM app.users)=3 AND (SELECT count(*) FROM identity_private.credentials)=2;",'t')
    b.check('SQL4-ciphertext-only-outbox-no-fabricated-MFA',f"SELECT count(*)=1 AND bool_and(user_id IS NULL AND challenge_id IS NULL AND event_type='INVITATION' AND invitation_generation=1 AND octet_length(payload_ciphertext)=64) FROM app.auth_outbox WHERE tenant_id='{b.A}' AND invitation_id='{invite}';",'t')
    b.check('SQL4-immediate-resend-throttled',change('rate',{**{'operation':'RESEND','invitation_id':invite,'expected_version':'1','reason':'Synthetic resend'}}),'false\nRATE_LIMITED\nt',service)
    b.check('SQL4-version-conflict',change('stale',{'operation':'REVOKE','invitation_id':invite,'expected_version':'2','reason':'Synthetic stale request'}),'false\nINVITATION_CONFLICT\nt',service)
    b.check('SQL4-old-OTP-worker-does-not-claim-or-cancel-invitation',f"SELECT auth_api.claim_mail_v2({digest('sql4-otp-worker')},'{uuid.uuid4()}') IS NULL;",'t',worker)
    b.check('SQL4-invitation-still-pending',f"SELECT state='PENDING' FROM app.auth_outbox WHERE tenant_id='{b.A}' AND invitation_id='{invite}';",'t')
    b.check('SQL4-synthetic-forward-clock-window',f"UPDATE identity_private.invitation_delivery_attempts SET requested_at=requested_at-interval '2m' WHERE tenant_id='{b.A}';")
    b.check('SQL4-resend-invalidates-generation',change('resend',{'operation':'RESEND','invitation_id':invite,'expected_version':'1','reason':'Synthetic resend'},success=True),'false\ntrue\nt',service)
    b.check('SQL4-resend-cancels-and-wipes-old-envelope',f"SELECT count(*)=1 AND bool_and(state='CANCELLED' AND octet_length(payload_ciphertext)=0) FROM app.auth_outbox WHERE tenant_id='{b.A}' AND invitation_id='{invite}' AND invitation_generation=1;",'t')
    b.check('SQL4-revoke-owned',change('revoke',{'operation':'REVOKE','invitation_id':invite,'expected_version':'2','reason':'Synthetic revoke'},success=True),'false\ntrue\nt',service)
    b.check('SQL4-revoked-link-verifier-and-queue-invalidated',f"SELECT (SELECT state='REVOKED' AND verifier IS NULL AND generation=3 FROM identity_private.user_invitations WHERE tenant_id='{b.A}' AND id='{invite}') AND NOT EXISTS(SELECT 1 FROM app.auth_outbox WHERE tenant_id='{b.A}' AND invitation_id='{invite}' AND state IN('PENDING','CLAIMED','DISPATCHING'));",'t')
    b.check('SQL4-cross-tenant-scoped-create-authority',grant(b.B,b.W,'create')+grant(b.B,b.W,'view')+step(b.B,b.W,b.Y))
    b.check('SQL4-foreign-invitation-hidden',change('foreign',{'operation':'REVOKE','invitation_id':invite,'expected_version':'3','reason':'Synthetic foreign request'},token='d'),'false\nNOT_FOUND\nt',service)
    b.check('SQL4-cross-tenant-directory-empty',"BEGIN;SELECT auth_api.begin_verified_context(repeat('d',43));SELECT jsonb_array_length(auth_api.administration_invitations(NULL)->'items')=0;COMMIT;",'t',service)
    b.check('SQL4-rollback-issuance',change('rollback',{**create,'email':'sql4-rollback@fixture.invalid'},candidate=foreign,success=True,ending='ROLLBACK;'),'false\ntrue\nt',service)
    b.check('SQL4-rollback-no-invitation-outbox-or-issue-audit',f"SELECT NOT EXISTS(SELECT 1 FROM identity_private.user_invitations WHERE id='{foreign}') AND NOT EXISTS(SELECT 1 FROM app.auth_outbox WHERE invitation_id='{foreign}') AND NOT EXISTS(SELECT 1 FROM app.audit_logs WHERE resource_id='{foreign}');",'t')
    b.check('SQL4-audit-no-email-link-or-verifier',"SELECT count(*)>=5 AND bool_and(NOT(safe_metadata ?| ARRAY['email','recipient','token','verifier','password'])) FROM app.audit_logs WHERE action LIKE 'users.invitation.%';",'t')
    b.check('SQL4-one-time-journal-no-plaintext-response',"SELECT count(*)>=3 AND bool_and(one_time_result AND response_safe IS NULL) FROM app.idempotency_records WHERE operation='changeUserInvitation' AND state='COMPLETED';",'t')
    b.REPORT['invitationBrowserFixture']={'operator':b.U}
    if b.check('SQL4-positive-ui-stepup',step(b.A,b.U,b.S)):
        spec=importlib.util.spec_from_file_location('sql4_browser_driver',b.ROOT/'scripts/b2-invitations-postgres.review.py')
        driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver);driver.run_browser(b)
    if b.REPORT.get('invitationBrowserExecuted'):
        b.check('SQL4-UI-encrypted-invitation-and-revocation-durable',"SELECT count(*)=1 AND bool_and(state='REVOKED' AND verifier IS NULL) FROM identity_private.user_invitations WHERE display_name='B2 browser invitee';",'t')
        b.check('SQL4-UI-reason-audited',"SELECT EXISTS(SELECT 1 FROM app.audit_logs WHERE action='users.invitation.revoke' AND safe_metadata->>'reason'='B2 browser revoke invitation' AND outcome='SUCCESS');",'t')
    else:b.record('SQL4-functional-browser','SKIP','Not executed; no UI acceptance.')

    # Reuse the whole approved composition regression AFTER SQL4 and its UI.
    spec=importlib.util.spec_from_file_location('sql4_unchanged_combined_regression',b.ROOT/'docs/proposals/b2-integration/combined-tests.review.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.run(b)
