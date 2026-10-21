"""Execute only the owner's exact B2 bundle in a new networkless hosted-CI PG16.

Reuses the original B1 local-socket transport, baseline synthetic fixtures and
inventory checks. Never connects to a URL, remote Docker endpoint or persistent DB.
"""
import hashlib
import argparse
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
PACKAGES = {
 'access': {'reference':'9f4eb74af74d4b5c2420d2ff1c602e79c41cc6b5',
  'sql':'docs/proposals/b2-access/002-effective-access.review.sql','sqlHash':'d11842d50959ea6e2e90afe8d90d7c327bcbc8ca45685e893c436baae3549efe',
  'tests':'docs/proposals/b2-access/access-tests.r2.review.py','testsHash':'72ed26f1e515ef5e7126271a91e9cdfb38575826e861a04b2196ea6e0e7e2550',
  'fixtureReference':'147dac36c921e1ff1ee6af7ca1b30bf9425c0062',
  'hook':'B2-access-positive-ui-stepup','fixture':'accessBrowserFixture','executed':'accessBrowserExecuted'},
 'users': {'reference':'d16f79f3f8748e08ee6a5354c6c9b6668da60666',
  'sql':'docs/proposals/b2-users/003-user-changes.review.sql','sqlHash':'77c3d298602d1e2a273db104b5ee28d7d4db2c8824558c9b7d1775440bf8df4b',
  'tests':'docs/proposals/b2-users/user-change-tests.r2.review.py','testsHash':'1a66ccf3610b01bf840ad1f8a9e01c6917c7fe55ed72123b574008442168e6b2',
  'fixtureReference':'147dac36c921e1ff1ee6af7ca1b30bf9425c0062',
  'hook':'B2-user-positive-ui-stepup','fixture':'userChangeBrowserFixture','executed':'userChangeBrowserExecuted'},
}


def fixture_reference_bytes(package):
    result=subprocess.run(['git','show',package['fixtureReference']+':'+package['tests']],cwd=ROOT,capture_output=True)
    if result.returncode:raise RuntimeError('EXACT_FIXTURE_COMMIT_UNAVAILABLE')
    return result.stdout


def authorize_package(scope):
    package=PACKAGES[scope]
    owner=json.loads((ROOT/f'docs/implementation/b2/{scope}-authorization.json').read_text())
    expected={package['sql']:package['sqlHash'],package['tests']:package['testsHash']}
    if (owner.get('ownerApproved') is not True or owner.get('referenceCommit')!=package['reference']
            or owner.get('artifacts')!={'sql':package['sql'],'fixtures':package['tests']}
            or owner.get('sha256')!={'sql':package['sqlHash'],'fixtures':package['testsHash']}
            or owner.get('fixtureApproval',{}).get('ownerApproved') is not True
            or owner['fixtureApproval'].get('referenceCommit')!=package['fixtureReference']):
        raise RuntimeError('EXACT_SELECTED_PACKAGE_AUTHORIZATION_REQUIRED')
    for path,sha in expected.items():
        if hashlib.sha256((ROOT/path).read_bytes()).hexdigest()!=sha:
            raise RuntimeError('EXACT_SELECTED_PACKAGE_HASH_MISMATCH')
    if fixture_reference_bytes(package)!=(ROOT/package['tests']).read_bytes():
        raise RuntimeError('EXACT_FIXTURE_COMMIT_BYTES_MISMATCH')
    if scope=='access':
        raw=(ROOT/'scripts/pg11-rbac-matrix.py').read_bytes()
        if hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!='45c144c9640388b22cf9a62dab96f30bd329fd86':
            raise RuntimeError('UNCHANGED_B1_MATRIX_REQUIRED_BEFORE_INSTALL')
    return package


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
    forbidden = re.compile(r'^(DATABASE_URL|CLEANOPS_TEST_DATABASE_URL|PG[A-Z_]*|DATABASE_.*|DB_.*|SUPABASE_.*|NEON_.*|RDS_.*|OPENBAO_.*|VAULT_.*|CLEANOPS_.*(?:DATABASE|DB_|BAO|SECRET|TOKEN|KEY).*)$')
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


def browser(b,scope='directory'):
    load('b2_existing_runtime_copy','scripts/pg-http-integration.py').copy_runtime(b,('scripts/b2-browser-backend.ts',))
    fixture = {'container':b.CID,'run':b.RUN,'foreign':b.W,'otherTenant':b.B}
    if scope!='directory':
        package=PACKAGES[scope]
        fixture.update(b.REPORT[package['fixture']])
        fixture['access' if scope=='access' else 'userChanges']=True
        b.REPORT[package['executed']]=True
    config='playwright.b2-postgres.config.ts' if scope=='directory' else f'playwright.b2-{scope}-postgres.config.ts'
    result = subprocess.run(['npx','--no-install','playwright','test','--config='+config],cwd=ROOT,
                            env=dict(b.ENV,B2_BROWSER_FIXTURE=json.dumps(fixture)),text=True,capture_output=True,timeout=180)
    path = ROOT / f'artifacts/b2-{scope}/playwright.json'
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
    b.REPORT['functionalBrowser'] = 'PASS' if result.returncode == 0 and count == (2 if scope=='directory' else 1) else 'FAIL'
    b.record('B2-real-browser-process',b.REPORT['functionalBrowser'],'Real private backend and persisted PostgreSQL; raw output suppressed.')


def main(scope='directory'):
    report = {'scope':f'B2_{scope.upper()}_EXACT_OWNER_BUNDLE','runtime':'closedBackend','checks':[], 'cleanup':'SKIP','result':'FAIL'}
    target = ROOT / f'artifacts/b2-{scope}/report.json'
    b = None
    before = None
    try:
        baseline = preflight()  # Must finish before Docker, SQL, or fixture imports.
        selected=authorize_package(scope) if scope!='directory' else None
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
        if selected and not b.check('install-exact-authorized-'+scope+'-SQL-and-ACL',(ROOT/selected['sql']).read_text()):
            raise RuntimeError('SELECTED_INSTALLATION_FAILED_NO_REPLACEMENT_SQL')
        original_check = b.check
        def with_browser(name, text, expected=None, role='postgres', failure=None):
            passed = original_check(name,text,expected,role,failure)
            if name == (selected['hook'] if selected else 'B2-synthetic-global-view') and passed:
                browser(b,scope)
            return passed
        b.check = with_browser
        load('b2_exact_authorized_assertions',selected['tests'] if selected else 'docs/proposals/b2-users/directory-tests.review.py').run(b)
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
        print('B2_'+scope.upper()+' '+report['result'],flush=True)
    return 0 if report['result']=='PASS' else 1


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package',choices=['directory','access','users'],default='directory')
    sys.exit(main(parser.parse_args().package))
