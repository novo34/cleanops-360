"""Real synthetic B1 broker scenarios. Functional calls always use service LOGINs.
Administrator is used only for fixture DML and independent persisted-state assertions.
No SQL definitions, ACL changes, RLS bypass for functional calls, or external services.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import re
import secrets
import threading
import uuid


def run(b):
    role = b.ROLE['identity']
    runtime = b.ROLE['runtime']
    uid = lambda: str(uuid.uuid4())
    quote = lambda s: "'" + str(s).replace("'", "''") + "'"
    digest = lambda s: "crypto.digest(convert_to(" + quote(s) + ",'UTF8'),'sha256')"
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
    for i in range(4):
        cookie = secrets.token_urlsafe(32)
        value, error = scalar(f"SELECT auth_api.new_preauth_verified('{b.P}','{b.A}',1,{quote(current_hash)},{digest(cookie)},{digest('synthetic-csrf')});")
        b.record(f'preauth-verified-create-{i}', 'PASS' if value and not error else 'FAIL', {'sqlstate':error} if error else None)
        if not value or error:
            continue
        cookies.append(cookie)
        call(f'preauth-state-pending-MFA-{i}', f"SELECT auth_api.preauth_summary({quote(cookie)})->>'state';", 'PENDING_MFA')
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
        b.record('owned-reservations-concurrent-consume','PASS' if states==['P0001','false'] and any('RESERVATION_NOT_OWNED' in r.stderr for r in results) else 'FAIL', {'outcomes':states})
        call('owned-reserve-complete-atomic', statement, 'false\nt')
        call('owned-safe-result-idempotent-replay',f"SELECT auth_api.reserve_owned({quote(cookie)},'synthetic-test',{kh},{rh},false)->>'replay';",'true')
        call('owned-retry-request-mismatch-denied',f"SELECT auth_api.reserve_owned({quote(cookie)},'synthetic-test',{kh},{digest('other-request')},false);", failure='P0001')
    else:
        blocked(['owned-reservations-concurrent-consume'], 'No verified preauth available')
    b.REPORT['protocolTestLimitations'] = ['Synthetic opaque Argon2id/ciphertext fixtures test broker attestation and CAS, not cryptographic verification or key custody.', 'Counter values are attested synthetic service inputs; real crypto library/E2E acceptance is separate.', 'Catalog inventory and native installation validation do not prove every runtime branch or dynamic query.']
