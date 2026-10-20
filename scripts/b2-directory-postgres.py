"""Execute only the owner's exact B2 bundle in a new networkless hosted-CI PG16.

Reuses the original B1 local-socket transport, baseline synthetic fixtures and
inventory checks. Never connects to a URL, remote Docker endpoint or persistent DB.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
APPROVED = {
    'docs/proposals/b2-users/001-directory.review.sql': '8a380379b392536bb986136c997833c57ca4e482de3c418b389b898245e8e31f',
    'docs/proposals/b2-users/directory-tests.review.py': 'b5d669aad3c61935b89d90fad8ad845cd1fc048125d866d37563ac40123a78fe',
}
BASE_SHA = '965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa'
BASE_BLOB = '1971a9fdc5c1f3fd1fcb5f6706459678e5399256'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def preflight():
    if not (os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
            and os.environ.get('GITHUB_REPOSITORY') == 'novo34/cleanops-360'
            and os.environ.get('GITHUB_HEAD_REF') == 'feat/b2-users-access'):
        raise RuntimeError('HOSTED_CI_SCOPE_REQUIRED')
    # Inspect only names and presence. Never print environment or credential values.
    forbidden = re.compile(r'^(DATABASE_URL|CLEANOPS_TEST_DATABASE_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGPASSFILE|PGSERVICE|PGSERVICEFILE|DATABASE_.*|DB_.*|SUPABASE_.*|NEON_.*|RDS_.*|CLEANOPS_.*(?:DATABASE|DB_|BAO|SECRET|TOKEN|KEY).*)$')
    if any(value and forbidden.fullmatch(key) for key, value in os.environ.items()):
        raise RuntimeError('EXTERNAL_DATABASE_OR_SECRET_BINDING_PRESENT')
    owner = json.loads((ROOT / 'docs/implementation/b2/directory-authorization.json').read_text())
    if owner.get('ownerApproved') is not True or owner.get('referenceCommit') != 'f5cf6aa7bc3f2f66da4e8246a8d47bb6c824ee0e' or owner.get('sha256') != APPROVED:
        raise RuntimeError('B2_OWNER_AUTHORIZATION_MISMATCH')
    for path, expected in APPROVED.items():
        if hashlib.sha256((ROOT / path).read_bytes()).hexdigest() != expected:
            raise RuntimeError('EXACT_B2_SHA256_MISMATCH')
    approval = json.loads((ROOT / 'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json').read_text())
    raw = (ROOT / approval['candidatePath']).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if approval.get('ownerApproved') is not True or approval['candidate']['sha256'] != BASE_SHA or approval['candidate']['gitBlob'] != BASE_BLOB or hashlib.sha256(raw).hexdigest() != BASE_SHA or blob != BASE_BLOB:
        raise RuntimeError('EXACT_AUTHORIZED_SQL14_MISMATCH')
    session = json.loads((ROOT / 'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json').read_text())
    if session.get('ownerApproved') is not True or session['sessionPolicy']['sensitiveAbsoluteSeconds'] != 43200 or session['sessionPolicy']['operationalAbsoluteSeconds'] != 86400:
        raise RuntimeError('PRIOR_B1_SESSION_FIXTURE_AUTHORIZATION_REQUIRED')
    return raw.decode()


def browser(b):
    load('b2_existing_runtime_copy','scripts/pg-http-integration.py').copy_runtime(b,('scripts/b2-browser-backend.ts',))
    fixture = {'container':b.CID,'run':b.RUN,'foreign':b.W,'otherTenant':b.B}
    result = subprocess.run(['npx','--no-install','playwright','test','--config=playwright.b2-postgres.config.ts'],cwd=ROOT,
                            env=dict(b.ENV,B2_BROWSER_FIXTURE=json.dumps(fixture)),text=True,capture_output=True,timeout=180)
    path = ROOT / 'artifacts/b2-directory/playwright.json'
    count = 0
    if path.exists():
        try:
            data = json.loads(path.read_text())
            def collect(suite):
                nonlocal count
                for spec in suite.get('specs',[]):
                    statuses = [r['status'] for test in spec['tests'] for r in test['results']]
                    b.record('B2-browser-'+spec['title'],'PASS' if statuses == ['passed'] else 'FAIL',{'attemptStatuses':statuses})
                    count += 1
                for nested in suite.get('suites',[]):
                    collect(nested)
            for suite in data.get('suites',[]):
                collect(suite)
        finally:
            path.unlink()  # Never preserve raw browser errors, request headers or tokens.
    b.REPORT['functionalBrowser'] = 'PASS' if result.returncode == 0 and count == 2 else 'FAIL'
    b.record('B2-real-browser-process',b.REPORT['functionalBrowser'],'Real private backend and persisted PostgreSQL; raw output suppressed.')


def main():
    report = {'scope':'B2_DIRECTORY_EXACT_OWNER_BUNDLE','runtime':'closedBackend','checks':[], 'cleanup':'SKIP','result':'FAIL'}
    target = ROOT / 'artifacts/b2-directory/report.json'
    b = None
    before = None
    try:
        baseline = preflight()  # Must finish before Docker, SQL, or fixture imports.
        b = load('b2_original_b1_transport', 'scripts/pg-test-01.py')
        b.REPORT = report
        b.record('exact-B2-hashes-SQL14-authorization-hosted-CI-no-external-bindings','PASS')
        before = b.footprint()
        if b.docker('pull','postgres:16-bookworm',timeout=180).returncode:
            raise RuntimeError('OFFICIAL_PG16_PULL_FAILED')
        image = b.docker('image','inspect','postgres:16-bookworm','--format','{{index .RepoDigests 0}}').stdout.strip()
        if not re.fullmatch(r'postgres@sha256:[0-9a-f]{64}',image):
            raise RuntimeError('OFFICIAL_PG16_DIGEST_REQUIRED')
        report['image'] = image
        launched = b.docker('run','-d','--pull=never','--name','cleanops-b2-'+b.RUN,
                           '--label','cleanops.b2='+b.RUN,'--network=none','--security-opt=no-new-privileges',
                           '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=1g',
                           '--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--shm-size=128m',
                           '-e','POSTGRES_DB=core','-e','POSTGRES_PASSWORD='+secrets.token_urlsafe(32),image)
        if launched.returncode:
            raise RuntimeError('ISOLATED_CONTAINER_CREATION_FAILED')
        b.CID = launched.stdout.strip()
        meta = json.loads(b.docker('inspect',b.CID).stdout)[0]
        if (meta['Config']['Labels'].get('cleanops.b2') != b.RUN
                or meta['HostConfig']['NetworkMode'] != 'none' or meta['HostConfig']['PortBindings']
                or any(m['Type'] in ('bind','volume') for m in meta['Mounts'])):
            raise RuntimeError('OWNED_NETWORKLESS_TMPFS_ISOLATION_REQUIRED')
        b.record('owned-container-network-none-no-ports-no-bind-or-volume','PASS')
        for _ in range(60):
            if b.sql("SELECT current_setting('server_version_num')::integer BETWEEN 160000 AND 169999;").stdout.strip() == 't':
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('PG16_STARTUP_TIMEOUT')
        if not b.check('install-exact-authorized-SQL14', baseline):
            raise RuntimeError('SQL14_INSTALLATION_FAILED_B2_NOT_EXECUTED')
        if not b.check('postgres-function-body-validation-enabled', 'SHOW check_function_bodies;', 'on'):
            raise RuntimeError('FUNCTION_BODY_VALIDATION_REQUIRED')
        package = (ROOT / 'docs/proposals/b2-users/001-directory.review.sql').read_text()
        if not b.check('install-exact-authorized-B2-functions-and-EXECUTE', package):
            raise RuntimeError('B2_INSTALLATION_FAILED_NO_REPLACEMENT_SQL')
        if not b.fixtures():
            raise RuntimeError('BASELINE_SYNTHETIC_FIXTURES_FAILED')
        # Byte-for-byte SQL from the already authorized B1 SQL13 session fixture.
        # Applies the existing owner-approved profile; no B2 policy/ACL is added.
        if not b.check('B1-approved-12h24h-existing-session-fixture',"UPDATE identity_private.configuration SET values_json=jsonb_set(jsonb_set(values_json,'{absolute_sensitive}','43200'::jsonb),'{absolute_operational}','86400'::jsonb);"):
            raise RuntimeError('AUTHORIZED_B1_SESSION_FIXTURE_FAILED')
        original_check = b.check
        def with_browser(name, text, expected=None, role='postgres', failure=None):
            passed = original_check(name,text,expected,role,failure)
            if name == 'B2-synthetic-global-view' and passed:
                browser(b)
            return passed
        b.check = with_browser
        load('b2_exact_authorized_assertions','docs/proposals/b2-users/directory-tests.review.py').run(b)
    except Exception as error:
        item = {'name':'harness','status':'FAIL','detail':str(error) if isinstance(error,RuntimeError) else type(error).__name__}
        report['checks'].append(item)
        print(json.dumps(item),flush=True)
    finally:
        if b and b.CID:
            label = b.docker('inspect','--format','{{index .Config.Labels "cleanops.b2"}}',b.CID)
            if label.returncode == 0 and label.stdout.strip() == b.RUN:
                report['cleanup'] = 'PASS' if b.docker('rm','-f',b.CID).returncode == 0 else 'FAIL'
            else:
                report['cleanup'] = 'FAIL'
        if b and before is not None:
            try:
                b.record('preexisting-containers-networks-volumes-unchanged','PASS' if before == b.footprint() else 'FAIL')
            except Exception:
                b.record('preexisting-resource-inventory','FAIL')
        report['result'] = 'PASS' if report['cleanup'] == 'PASS' and report['checks'] and all(c['status']=='PASS' for c in report['checks']) else 'FAIL'
        report.setdefault('functionalBrowser','SKIP_PREREQUISITE_NOT_REACHED')
        report['b2TechReady'] = False
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(report,indent=2)+'\n')
        print('B2_DIRECTORY '+report['result'],flush=True)
    return 0 if report['result']=='PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
