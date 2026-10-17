"""Real synthetic B1 broker scenarios. Functional calls always use service LOGINs.
Administrator is used only for fixture DML and independent persisted-state assertions.
No SQL definitions, ACL changes, RLS bypass for functional calls, or external services.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import re
import secrets
import threading
import time
import uuid


def run(b):
    role = b.ROLE['identity']
    runtime = b.ROLE['runtime']
    uid = lambda: str(uuid.uuid4())
    quote = lambda s: "'" + str(s).replace("'", "''") + "'"
    # Digest values are prepared outside service SQL: services have no crypto ACL.
    import hashlib
    digest = lambda s: "decode('" + hashlib.sha256(s.encode()).hexdigest() + "','hex')"
    corr = lambda: quote(uid())
    old_hash = '$argon2id$fixture-not-a-real-password'
    new_hash = '$argon2id$synthetic-rehashed-password'
    def tx(body):
        return 'BEGIN; SET LOCAL statement_timeout=\'8s\';' + body + 'COMMIT;'
    def call(name, body, expected=None, failure=None):
        return b.check(name, tx(body), expected, role, failure)
    def scalar(body):
        result = b.sql(tx(body), role)
        if result.returncode:
            return None, b.state(result)
        values = [s for s in result.stdout.splitlines() if s]
        return values[-1] if values else '', None
    def blocked(names, reason):
        for name in names:
            b.record(name, 'BLOCKED', reason)
    def race(name, statements, expected_winners=1):
        barrier = threading.Barrier(len(statements))
        def execute(statement):
            barrier.wait(timeout=10)
            return b.sql(tx(statement), role)
        with ThreadPoolExecutor(max_workers=len(statements)) as pool:
            results = list(pool.map(execute, statements))
        outcomes = [{'sqlstate': b.state(r) if r.returncode else None,
                     'value': r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''} for r in results]
        winners = sum(o['value'] == 't' and o['sqlstate'] is None for o in outcomes)
        ok = winners == expected_winners and all(o['sqlstate'] is None and o['value'] in ('t','f') for o in outcomes)
        b.record(name, 'PASS' if ok else 'FAIL', {'outcomes': outcomes})
        return ok

    inventory = b.sql("SELECT jsonb_build_object('functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND p.prokind='f'),'procedures',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND p.prokind='p'),'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN('app','identity_private')),'policies',(SELECT count(*) FROM pg_policies WHERE schemaname IN('app','identity_private')));" )
    if inventory.returncode == 0:
        b.REPORT['installedCatalog'] = json.loads(inventory.stdout)
        b.record('complete-catalog-inventory', 'PASS')
    else:
        b.record('complete-catalog-inventory', 'FAIL', b.state(inventory))
    b.check('installed-definition-counts', "SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND p.prokind='f')=65 AND (SELECT count(*) FROM pg_policies WHERE schemaname IN('app','identity_private'))=33;", 't')
    # Every installed function body must have passed native CREATE validation.
    b.check('all-functions-have-pinned-search-path', "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND NOT coalesce(p.proconfig,'{}') @> ARRAY['search_path=pg_catalog'];", '0')
    # Real row contention, CAS mismatch and exactly one credential winner.
    statement = f"SELECT auth_api.rehash_credential_cas('{b.P}',1,{quote(old_hash)},{quote(new_hash)});"
    credential_ok = race('credential-CAS-concurrent-one-winner', [statement, statement])
    call('credential-CAS-stale-version', f"SELECT auth_api.rehash_credential_cas('{b.P}',0,{quote(new_hash)},{quote(old_hash)});", 'f')
    # Query material privately; never publish password hashes.
    call('credential-material-locked-private-projection', "SELECT count(*) FROM auth_api.credential_material_locked('u1@fixture.invalid');", '1')
    current_hash = new_hash if credential_ok else old_hash
    call('preauth-denies-unverified-credential-version', f"SELECT auth_api.new_preauth_verified('{b.P}','{b.A}',0,{quote(current_hash)},{digest('bad')},{digest('csrf')});", failure='42501')
    method = uid()
    # Opaque synthetic v2 ciphertext: no real key or provider; no crypto claim.
    setup = f"INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,last_totp_counter,created_at,method_version,algorithm) VALUES('{b.A}','{method}','{b.U}','TOTP','ACTIVE',decode('02'||repeat('ab',60),'hex'),'synthetic-key-v1',NULL,now(),1,'SHA256');"
    if not b.check('synthetic-TOTP-method-fixture', setup):
        blocked(['full-authentication-MFA-transitions','global-TOTP-CAS-concurrent-one-winner','D1-method-version-revalidation','owned-reservations-concurrent-consume'], 'Synthetic method fixture failed')
        return
    cookies, challenges = [], []
    csrf=secrets.token_urlsafe(32)
    for i in range(4):
        cookie = secrets.token_urlsafe(32)
        value, error = scalar(f"SELECT auth_api.new_preauth_verified('{b.P}','{b.A}',1,{quote(current_hash)},{digest(cookie)},{digest(csrf)});")
        b.record(f'preauth-verified-create-{i}', 'PASS' if value and not error else 'FAIL', {'sqlstate':error} if error else None)
        if not value or error:
            continue
        cookies.append(cookie)
        call(f'preauth-state-pending-MFA-{i}', f"SELECT auth_api.preauth_summary({quote(cookie)})->>'state';", 'PENDING_MFA')
        if i >= 3:
            continue  # Leave a fresh PENDING_MFA binding for negative/owned tests.
        if challenges:
            call(f'challenge-cooldown-enforced-{i}', f"SELECT auth_api.issue_bound_challenge({quote(cookie)},'TOTP','{method}',1,NULL,NULL,NULL,NULL,NULL,{corr()});", failure='P0001')
            values = json.loads((b.ROOT/'lib/b1/security-values.json').read_text())['values']
            remaining = next(v['value'] for v in values if v['key']=='otp_resend_cooldown') + 1
            while remaining:
                pause = min(20, remaining)
                time.sleep(pause)
                remaining -= pause
        challenge, error = scalar(f"SELECT auth_api.issue_bound_challenge({quote(cookie)},'TOTP','{method}',1,NULL,NULL,NULL,NULL,NULL,{corr()});")
        b.record(f'D1-bound-challenge-{i}', 'PASS' if challenge and not error else 'FAIL', {'sqlstate': error} if error else None)
        if challenge and not error:
            challenges.append((cookie, challenge))
    # Method freshness and tenant authority must fail before issuing any challenge.
    if cookies:
        call('D1-method-version-revalidation', f"SELECT auth_api.issue_bound_challenge({quote(cookies[0])},'TOTP','{method}',2,NULL,NULL,NULL,NULL,NULL,{corr()});", failure='42501')
        call('D1-method-foreign-UUID-denied', f"SELECT auth_api.issue_bound_challenge({quote(cookies[0])},'TOTP','{uid()}',1,NULL,NULL,NULL,NULL,NULL,{corr()});", failure='42501')
    else:
        blocked(['D1-method-version-revalidation'], 'Verified preauth unavailable')
    # Independent broker statements use separate connections and preauth bindings.
    counter_result = b.sql("SELECT floor(extract(epoch FROM clock_timestamp())/identity_private.cfg('totp_period'))::bigint;")
    counter = int(counter_result.stdout.strip()) if counter_result.returncode == 0 else 0
    if len(challenges) >= 2:
        statements = [f"SELECT auth_api.consume_totp_cas({quote(c)},'{ch}','LOGIN',1,NULL,{counter},{corr()});" for c,ch in challenges[:2]]
        race('global-TOTP-CAS-concurrent-one-winner', statements)
        verified = b.sql(f"SELECT count(*) FROM identity_private.preauth WHERE principal_id='{b.P}' AND state='VERIFIED';")
        b.record('TOTP-race-one-verified-binding', 'PASS' if verified.returncode == 0 and verified.stdout.strip() == '1' else 'FAIL')
        # Find the actual winning binding via fixture inspection; no secret logging.
        winner = next(((c,ch) for c,ch in challenges[:2] if b.sql(f"SELECT state FROM app.mfa_challenges WHERE tenant_id='{b.A}' AND id='{ch}';").stdout.strip() == 'VERIFIED'), None)
        if winner:
            cookie, challenge = winner
            token = secrets.token_urlsafe(32)
            values = json.loads((b.ROOT/'lib/b1/security-values.json').read_text())['values']
            absolute = next(v['value'] for v in values if v['key']=='absolute_sensitive')
            call('issue-session-requires-verified-MFA', f"SELECT auth_api.issue_active_session({quote(cookies[-1])},{digest(token+'bad')},{digest('csrf')},{absolute},1800,'Synthetic','Synthetic',{corr()});", failure='42501')
            session, error = scalar(f"SELECT auth_api.issue_active_session({quote(cookie)},{digest(token)},{digest('csrf')},{absolute},1800,'Synthetic','Synthetic',{corr()})->>'state';")
            b.record('full-authentication-MFA-transitions','PASS' if session=='ACTIVE' and not error else 'FAIL', {'sqlstate':error} if error else None)
            b.check('issued-session-real-runtime-binding', b.session_sql('a')+'ROLLBACK;', role=runtime)
            b.check('issued-session-token-usable', f"BEGIN;SELECT auth_api.begin_verified_context({quote(token)});SELECT count(*) FROM auth_api.current_identity();COMMIT;", role=runtime)
            call('consumed-preauth-cannot-reissue-session', f"SELECT auth_api.issue_active_session({quote(cookie)},{digest(token+'2')},{digest('csrf')},{absolute},1800,'Synthetic','Synthetic',{corr()});", failure='42501')
        else:
            blocked(['full-authentication-MFA-transitions'], 'No challenge successfully consumed')
    else:
        blocked(['global-TOTP-CAS-concurrent-one-winner','full-authentication-MFA-transitions'], 'Bound challenge prerequisites failed')
    if len(challenges)>=3:
        cookie, challenge = challenges[2]
        call('TOTP-global-counter-replay-denied', f"SELECT auth_api.consume_totp_cas({quote(cookie)},'{challenge}','LOGIN',1,{counter},{counter},{corr()});", 'f')
        call('TOTP-expired-counter-denied', f"SELECT auth_api.consume_totp_cas({quote(cookie)},'{challenge}','LOGIN',1,{counter},0,{corr()});", 'f')
    # Owned reservations serialize and replay one committed safe result.
    if cookies:
        cookie = cookies[-1]
        kh, rh = digest('owned-race'), digest('same-request')
        statement = f"SELECT (auth_api.reserve_owned({quote(cookie)},'synthetic-test',{kh},{rh},false)->>'replay')::boolean;SELECT auth_api.complete_owned({quote(cookie)},'synthetic-test',{kh},{rh},'{{\"ok\":true}}'::jsonb);"
        # Test separate reserve+complete attempts; second must replay, not complete.
        barrier = threading.Barrier(2)
        def reserve(_):
            barrier.wait(timeout=10)
            return b.sql(tx(f"SELECT auth_api.reserve_owned({quote(cookie)},'synthetic-race',{kh},{rh},false)->>'replay';"), role)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(reserve,range(2)))
        states = sorted(b.state(r) if r.returncode else r.stdout.strip() for r in results)
        # A committed PENDING row remains owned by its original backend/xid.
        # Exactly one creates it, the other must be denied; never steal ownership.
        b.record('owned-pending-reservation-cannot-be-stolen','PASS' if states==['P0001','false'] and any('RESERVATION_NOT_OWNED' in r.stderr for r in results) else 'FAIL', {'outcomes':states})
        call('owned-reserve-complete-atomic', statement, 'f\nt')
        call('owned-safe-result-idempotent-replay',f"SELECT auth_api.reserve_owned({quote(cookie)},'synthetic-test',{kh},{rh},false)->>'replay';",'true')
        call('owned-retry-request-mismatch-denied',f"SELECT auth_api.reserve_owned({quote(cookie)},'synthetic-test',{kh},{digest('other-request')},false);", failure='P0001')
    else:
        blocked(['owned-reservations-concurrent-consume'], 'No verified preauth available')
    # Exercise all exposed API declarations with typed NULL probes, in rollback-only
    # service transactions. This catches planning/dependency/permission defects;
    # business rejections are reported separately and do not prove positive paths.
    api = b.sql("SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'args',(SELECT string_agg('NULL::'||format_type(t,NULL),',' ORDER BY ord) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(t,ord)),'identity',has_function_privilege('pgtest_identity',p.oid,'EXECUTE'),'runtime',has_function_privilege('pgtest_runtime',p.oid,'EXECUTE'),'mail',has_function_privilege('pgtest_mail',p.oid,'EXECUTE'),'maintenance',has_function_privilege('pgtest_maintenance',p.oid,'EXECUTE')) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth_api';")
    probes=[]
    if not api.returncode:
        for function in json.loads(api.stdout):
            services=[s for s in ('identity','runtime','mail','maintenance') if function[s]]
            if not services:
                probes.append({'signature':function['signature'],'scope':'PRIVATE_NOT_EXPOSED'})
                continue
            result=b.sql('BEGIN;SET LOCAL statement_timeout=\'3s\';SELECT * FROM auth_api.'+function['name']+'('+(function['args'] or '')+');ROLLBACK;',b.ROLE[services[0]])
            state=b.state(result) if result.returncode else None
            # Syntax, dependency, ambiguous identifier and unintended ACL errors
            # must never be interpreted as expected authentication rejection.
            unexpected = state and (state.startswith('42') and state!='42501' or state not in ('42501','P0001','22023','23502','23514','22004'))
            privilege = result.returncode and 'permission denied for' in result.stderr
            message=re.search(r'ERROR:\s+[0-9A-Z]{5}:\s+([^\n]+)',result.stderr)
            detail={'signature':function['signature'],'sqlstate':state,'outcome':'UNEXPECTED_PLANNING_OR_PRIVILEGE_FAILURE' if unexpected or privilege else 'BUSINESS_REJECTION' if state else 'EXECUTED_ROLLED_BACK'}
            if unexpected or privilege:
                detail['message']=message.group(1)[:180] if message else 'Unclassified planning failure'
            probes.append(detail)
            b.record('API-plan-probe-'+function['name'],'FAIL' if unexpected or privilege else 'PASS',detail)
    else:
        b.record('API-planning-catalog-query','FAIL',b.state(api))
    b.REPORT['apiPlanningProbes']=probes

    # The original ACTIVE session must obtain fresh, policy-bound step-up evidence.
    if challenges:
        active=b.session_sql('a').split('BEGIN;',1)[1]
        step_challenge,error=scalar(active+f"SELECT auth_api.issue_bound_challenge(NULL,'TOTP','{method}',1,NULL,NULL,NULL,'B1-SELF-04',NULL,{corr()});")
        b.record('step-up-bound-challenge','PASS' if step_challenge and not error else 'FAIL',{'sqlstate':error} if error else None)
        if step_challenge and not error:
            latest=b.sql(f"SELECT last_totp_counter FROM app.mfa_methods WHERE tenant_id='{b.A}' AND id='{method}';").stdout.strip()
            now_counter=int(b.sql("SELECT floor(extract(epoch FROM clock_timestamp())/identity_private.cfg('totp_period'))::bigint;").stdout.strip())
            value=max(int(latest)+1,now_counter) if latest else now_counter
            call('step-up-CAS-consume',active+f"SELECT auth_api.consume_totp_cas(NULL,'{step_challenge}','STEP_UP',1,{latest or 'NULL'},{value},{corr()});",'t')
            call('step-up-evidence-policy-bound',active+"SELECT allowed AND step_up FROM auth_api.binding_authorization(NULL,'B1-SELF-04',NULL);",'t')
        call('foreign-tenant-method-selection-denied',b.session_sql('d').split('BEGIN;',1)[1]+f"SELECT auth_api.issue_bound_challenge(NULL,'TOTP','{method}',1,NULL,NULL,NULL,'B1-SELF-04',NULL,{corr()});",failure='42501')

    # Assigned UUID/version enrollment with a separate synthetic subject; no real
    # encryption/provider selection and no runtime route activation is implied.
    enrollment_cookie=secrets.token_urlsafe(32)
    enrollment_method=uid()
    preauth,error=scalar(f"SELECT auth_api.new_preauth_verified('{b.Q}','{b.A}',1,{quote(old_hash)},{digest(enrollment_cookie)},{digest('enroll-csrf')});")
    b.record('enrollment-preauth-credential-bound','PASS' if preauth and not error else 'FAIL',{'sqlstate':error} if error else None)
    if preauth and not error:
        assigned,error=scalar(f"SELECT auth_api.begin_totp_enrollment_assigned({quote(enrollment_cookie)},'{b.A}','{b.V}','{enrollment_method}',1,decode('02'||repeat('ab',60),'hex'),'synthetic-key-v1','SHA256',{corr()})->>'methodId';")
        b.record('enrollment-assigned-ID-and-version','PASS' if assigned==enrollment_method and not error else 'FAIL',{'sqlstate':error} if error else None)
        if assigned==enrollment_method and not error:
            values=json.loads((b.ROOT/'lib/b1/security-values.json').read_text())['values']
            count=next(v['value'] for v in values if v['key']=='recovery_count')
            recovery='ARRAY['+','.join(digest('synthetic-recovery-'+str(i)) for i in range(count))+']'
            counter_now=int(b.sql("SELECT floor(extract(epoch FROM clock_timestamp())/identity_private.cfg('totp_period'))::bigint;").stdout.strip())
            call('enrollment-confirm-CAS',f"SELECT auth_api.consume_enrollment_cas({quote(enrollment_cookie)},'{enrollment_method}',1,NULL,{counter_now},{recovery},{corr()});",'t')
            b.check('enrollment-persisted-recovery-batch',f"SELECT count(*) FROM app.recovery_codes WHERE tenant_id='{b.A}' AND user_id='{b.V}' AND consumed_at IS NULL AND revoked_at IS NULL;",str(count))
            b.check('enrollment-state-version-trigger',f"SELECT state||':'||method_version FROM app.mfa_methods WHERE tenant_id='{b.A}' AND id='{enrollment_method}';",'ACTIVE:2')

    # EMAIL SQL broker/outbox only, isolated payload fixture and no delivery service.
    email_method=uid(); email_cookie=secrets.token_urlsafe(32)
    b.check('synthetic-EMAIL-method-fixture',f"INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,created_at) VALUES('{b.A}','{email_method}','{b.V}','EMAIL_OTP','ACTIVE',now());")
    preauth,error=scalar(f"SELECT auth_api.new_preauth_verified('{b.Q}','{b.A}',1,{quote(old_hash)},{digest(email_cookie)},{digest('email-csrf')});")
    if preauth and not error:
        email_challenge,error=scalar(f"SELECT auth_api.issue_bound_challenge({quote(email_cookie)},'EMAIL_OTP','{email_method}',1,{digest('synthetic-otp')},decode('02'||repeat('cd',60),'hex'),'synthetic-key-v1',NULL,NULL,{corr()});")
        b.record('EMAIL-encrypted-outbox-atomic-issue','PASS' if email_challenge and not error else 'FAIL',{'sqlstate':error} if error else None)
        if email_challenge and not error:
            claim=digest('synthetic-worker-claim')
            b.check('EMAIL-worker-claim-no-network',tx(f"SELECT count(*) FROM auth_api.claim_mail({claim});"),'1',b.ROLE['mail'])
            mail_id=b.sql(f"SELECT id FROM app.auth_outbox WHERE tenant_id='{b.A}' AND challenge_id='{email_challenge}';").stdout.strip()
            b.check('EMAIL-worker-finish-synthetic-delivery',tx(f"SELECT auth_api.finish_mail('{b.A}','{mail_id}',{claim},true);"),role=b.ROLE['mail'])
            b.check('EMAIL-outbox-ciphertext-purged',f"SELECT state='SENT' AND octet_length(payload_ciphertext)=0 FROM app.auth_outbox WHERE tenant_id='{b.A}' AND id='{mail_id}';",'t')
            call('EMAIL-invalid-proof-denied',f"SELECT auth_api.consume_email_otp({quote(email_cookie)},'{email_challenge}',{digest('incorrect')},{corr()});",'f')
            call('EMAIL-valid-proof-atomic-consume',f"SELECT auth_api.consume_email_otp({quote(email_cookie)},'{email_challenge}',{digest('synthetic-otp')},{corr()});",'t')
            call('EMAIL-replay-denied',f"SELECT auth_api.consume_email_otp({quote(email_cookie)},'{email_challenge}',{digest('synthetic-otp')},{corr()});",'f')

    # Business rollback: reservation creation + completion are rolled back together.
    if cookies:
        cookie=cookies[-1]; key=digest('rollback-owned'); request=digest('rollback-request')
        body=f"SELECT auth_api.reserve_owned({quote(cookie)},'rollback-business',{key},{request},false);SELECT auth_api.complete_owned({quote(cookie)},'rollback-business',{key},{request},'{{}}');SELECT 1/0;"
        call('broker-effects-error-rolls-back',body,failure='22012')
        b.check('broker-owned-reservation-not-persisted',"SELECT count(*) FROM identity_private.ceremony_idempotency WHERE operation='rollback-business';",'0')
        # Actual COMMIT failure on a service transaction with broker effects.
        import subprocess
        peer=subprocess.Popen(b.DOCKER+['exec','-i',b.CID,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',role,'-d','core'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=b.ENV)
        try:
            peer.stdin.write(f"BEGIN;SELECT auth_api.reserve_owned({quote(cookie)},'commit-failure',{digest('commit-key')},{request},false)->>'replay';SELECT pg_backend_pid();\n");peer.stdin.flush()
            reserved=peer.stdout.readline().strip();pid_line=peer.stdout.readline().strip()
            if reserved!='false' or not pid_line.isdigit():
                raise RuntimeError('SERVICE_COMMIT_FIXTURE_FAILED')
            b.check('terminate-owned-service-transaction',f"SELECT pg_terminate_backend({int(pid_line)});",'t')
            peer.stdin.write('COMMIT;\n');peer.stdin.close();peer.wait(timeout=10)
            b.record('broker-COMMIT-failure','PASS' if peer.returncode else 'FAIL')
        finally:
            if peer.poll() is None:
                peer.kill();peer.wait()
        b.check('broker-failed-COMMIT-no-reservation',"SELECT count(*) FROM identity_private.ceremony_idempotency WHERE operation='commit-failure';",'0')
    bootstrap_cookie=secrets.token_urlsafe(32); bootstrap_token=secrets.token_urlsafe(32)
    call('CSRF-bootstrap-broker-create',f"SELECT auth_api.bootstrap_csrf({digest(bootstrap_cookie)},{digest(bootstrap_token)});")
    call('CSRF-bootstrap-valid',f"SELECT auth_api.csrf_valid({quote(bootstrap_cookie)},{quote(bootstrap_token)},'BOOTSTRAP');",'t')
    call('CSRF-bootstrap-wrong-token-denied',f"SELECT auth_api.csrf_valid({quote(bootstrap_cookie)},{quote(secrets.token_urlsafe(32))},'BOOTSTRAP');",'f')
    call('ACTIVE-binding-server-context',f"SELECT auth_api.resolve_binding({quote('a'*43)},{quote('e'*43)},'ACTIVE')->>'kind';",'ACTIVE')
    if cookies:
        cookie=cookies[-1]
        call('PREAUTH-binding-server-context',f"SELECT auth_api.resolve_binding({quote(cookie)},{quote(csrf)},'PREAUTH')->>'kind';",'PREAUTH')
        statement=f"SELECT CASE WHEN (auth_api.reserve_owned({quote(cookie)},'concurrent-complete',{digest('concurrent-complete')},{digest('concurrent-request')},false)->>'replay')::boolean THEN false ELSE auth_api.complete_owned({quote(cookie)},'concurrent-complete',{digest('concurrent-complete')},{digest('concurrent-request')},'{{\"ok\":true}}') END;"
        race('owned-reservations-concurrent-consume',[statement,statement])
    # Lifecycle negative fixtures are restored before legacy baseline assertions.
    b.check('fixture-credential-version-change',f"UPDATE identity_private.credentials SET credential_version=2 WHERE principal_id='{b.P}';")
    try:
        call('ACTIVE-denied-after-credential-version-change',f"SELECT auth_api.resolve_binding({quote('a'*43)},{quote('e'*43)},'ACTIVE');",failure='42501')
    finally:
        b.check('fixture-credential-version-restored',f"UPDATE identity_private.credentials SET credential_version=1 WHERE principal_id='{b.P}';")
    b.check('fixture-tenant-disabled',f"UPDATE app.organizations SET state='DISABLED',disabled_at=now() WHERE id='{b.A}';")
    try:
        call('ACTIVE-disabled-tenant-denied',f"SELECT auth_api.resolve_binding({quote('a'*43)},{quote('e'*43)},'ACTIVE');",failure='42501')
        b.check('other-tenant-survives-disabling-first',b.session_sql('d')+"SELECT count(*) FROM auth_api.current_identity();ROLLBACK;",'1',runtime)
    finally:
        b.check('fixture-tenant-restored',f"UPDATE app.organizations SET state='ACTIVE',disabled_at=NULL WHERE id='{b.A}';")
    if len(challenges)>=3:
        cookie,challenge=challenges[2]
        b.check('fixture-expired-challenge',f"UPDATE app.mfa_challenges SET issued_at=now()-interval '2 minutes',expires_at=now()-interval '1 second' WHERE tenant_id='{b.A}' AND id='{challenge}';")
        call('expired-challenge-material-denied',f"SELECT auth_api.totp_material_locked({quote(cookie)},'{challenge}','LOGIN');",failure='42501')
        b.check('fixture-method-generation-change',f"UPDATE app.mfa_methods SET key_version='synthetic-key-v2' WHERE tenant_id='{b.A}' AND id='{method}';")
        b.check('method-generation-trigger-incremented',f"SELECT method_version FROM app.mfa_methods WHERE tenant_id='{b.A}' AND id='{method}';",'2')
        call('prior-generation-challenge-denied',f"SELECT auth_api.totp_material_locked({quote(cookie)},'{challenge}','LOGIN');",failure='42501')
        b.check('fixture-method-revocation',f"UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id='{b.A}' AND id='{method}';")
        call('revoked-method-cannot-issue-challenge',f"SELECT auth_api.issue_bound_challenge({quote(cookie)},'TOTP','{method}',3,NULL,NULL,NULL,NULL,NULL,{corr()});",failure='42501')
    b.REPORT['protocolTestLimitations'] = ['Synthetic opaque Argon2id/ciphertext fixtures test broker attestation and CAS, not cryptographic verification or key custody.', 'Counter values are attested synthetic service inputs; real crypto library/E2E acceptance is separate.', 'Catalog inventory and native installation validation do not prove every runtime branch or dynamic query.']
