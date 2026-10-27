"""Execute only the owner's exact B2 bundle in a new networkless hosted-CI PG16.

Reuses the original B1 local-socket transport, baseline synthetic fixtures and
inventory checks. Never connects to a URL, remote Docker endpoint or persistent DB.
"""
import hashlib
import ast
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
from datetime import datetime, timezone

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


# These are data contracts, not additional runners or replaceable guard callbacks.
HISTORICAL_HARNESS_SHA = 'd968c9621cbd6327d9ce473b434b9bceebb58669c9cb4c60f79306f37027e00b'
COMPOSITION_REFERENCE = '3ea4ec890fd05a59ae803f005e29cad713d1e5e8'
COMPOSITION_MANIFEST = 'docs/proposals/b2-integration/AUTHORIZATION.review.json'
COMPOSITION_MANIFEST_SHA = '133cc6643d7caa6082688bdbd6ba87cb4ffaad659de5c30911a6ef5b759f004b'
COMPOSITION_FILES = frozenset({
    'scripts/b2-directory-postgres.py', 'docs/proposals/b2-integration/combined-tests.review.py',
    'docs/proposals/b2-integration/workflow.review.yml', 'scripts/pg-test-01.py',
    'scripts/pg-http-integration.py', 'scripts/pg11-rbac-matrix.py',
    'scripts/b2-browser-backend.ts', 'scripts/b2-real-browser-server.mjs',
    'playwright.b2-access-postgres.config.ts', 'playwright.b2-users-postgres.config.ts',
    'e2e/b2-access-postgres.spec.ts', 'e2e/b2-users-postgres.spec.ts', 'docs/RBAC_PERMISSIONS.md',
    'docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql', *APPROVED,
    *(name for package in PACKAGES.values() for name in (package['sql'], package['tests'])),
})
R3_SCOPE = 'SQL5_R3_ACCEPTANCE_HOSTED_EPHEMERAL_PG16'
R3_SQL = 'docs/proposals/b2-invitations/005-invitation-acceptance.r3-candidate.review.sql'
R3_FIXTURE = 'docs/proposals/b2-invitations/acceptance-tests.r3-candidate.review.py'
R3_MANIFEST = 'docs/proposals/b2-invitations/sql5-r3-candidate-manifest.review.json'
R3_WORKFLOW = '.github/workflows/b2-acceptance-r2-postgres.yml'
# Owner-authorized capability; each execution still requires a new exact C/M/W/B review.
# No environment variable or command-line option can grant that authorization.
R3_NATIVE_ENABLED = True
R3_CONTEXT = {
    'repository': 'novo34/cleanops-360', 'repositoryId': 1412999204,
    'pullRequest': 22, 'base': 'main', 'branch': 'codex/r3-sql5-controlled-preflight',
    'event': 'pull_request_review', 'action': 'submitted',
    'owner': 'novo34', 'ownerId': 17856013, 'workflow': R3_WORKFLOW,
}
R3_REFERENCES = {
    'compositionCommit': COMPOSITION_REFERENCE, 'compositionManifestSha256': COMPOSITION_MANIFEST_SHA,
    'sql5R2Commit': '0eb651f3cfce5733726ca1d122e09bd1d0162c26',
    'sql5R2Sha256': 'eb2d02cc459b1f26afa1107c99670d1e6c4132be504091c42026218046ac8de9',
}
R3_FILES = COMPOSITION_FILES | {
    R3_WORKFLOW, R3_SQL, R3_FIXTURE, 'lib/b1/security-values.json', COMPOSITION_MANIFEST,
    *(f'docs/implementation/b2/{name}-authorization.json' for name in
      ('directory','access','users','combined','invitation-administration')),
    'docs/implementation/b2/invitation-contract-approval.json',
    'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json',
    'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json',
    'docs/proposals/b2-invitations/004-invitation-administration.review.sql',
}
# Values/approval records not listed in the original twenty-file composition.
# Pin their unchanged bytes too; a new bundle approval cannot widen R3's diff.
R3_FIXED_DEPENDENCIES = {
    'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json': 'b459e9ec99c17da411fef8d482a50c8feb6f565f89ae44b456162b71aecc0b2d',
    'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json': '79a06ff669f518c8534252a2314ffc5e79553eb470c4ccb8cff4ef4957403e5d',
    'docs/implementation/b2/access-authorization.json': '9927805c91c8eaf1228758e172678eec3941342c00d560878702f87662ff9d33',
    'docs/implementation/b2/combined-authorization.json': 'f95e83f4ccd85cf58bb5e373510157bae207df387ab3c72558e71b6d7ae239b3',
    'docs/implementation/b2/directory-authorization.json': 'c3aadd44cbf9822b33370ba5e71bae2d6afdfe2a2092159a58b6ca07bfb0a503',
    'docs/implementation/b2/invitation-administration-authorization.json': '97a36198f371d5d260a6d90876fddeead8b4032f1d9d3080376daa4de0fe20e5',
    'docs/implementation/b2/invitation-contract-approval.json': '01e2e7e1b1ca543952ec5c1c4ba74f6e27c947e0bd147b06262067be178e2afb',
    'docs/implementation/b2/users-authorization.json': '2deccf311fc711208ac2827bbdc7711a2a47f00e3ae40bb4133ca3f9245e6cca',
    'lib/b1/security-values.json': '4640511dd6c82a882f9fe651e6bde883ca3802ee574a0c5e024c073d84a7c5ab',
}


# Shared SQL5 authorizer/transport; AUD031 never inherits R3 execution permission.
AUD031_SCOPE = 'SQL5_AUD031_ACCEPTANCE_HOSTED_EPHEMERAL_PG16'
AUD031_SQL = 'docs/proposals/b2-invitations/005-invitation-acceptance.aud031-candidate.review.sql'
AUD031_FIXTURE = 'docs/proposals/b2-invitations/acceptance-tests.aud031-candidate.review.py'
AUD031_MANIFEST = 'docs/proposals/b2-invitations/sql5-aud031-candidate-manifest.review.json'
AUD031_NATIVE_ENABLED = False
# Approved immutable ref destination; C/M/W/B remain in the authorization digest.
AUD031_RESERVATION_TARGET = '4c625d2fb1f654fdfcabb751a4f63e5234fd9154'
AUD031_CONTEXT = {**R3_CONTEXT, 'pullRequest': 23, 'branch': 'codex/r4-aud-031'}
AUD031_FILES = R3_FILES | {R3_MANIFEST, AUD031_SQL, AUD031_FIXTURE,
    'lib/b1/v4-broker.ts', 'lib/b2/invitation-acceptance.ts', 'lib/b2/invitation-acceptance-http.ts',
    'components/invitation-acceptance-panel.tsx', 'tests/b2/invitation-acceptance.test.ts',
    'tests/b2/invitation-acceptance-http.test.ts', 'tests/static/test_b2_execution_preflight.py'}
AUD031_FIXED_DEPENDENCIES = {
    'docs/RBAC_PERMISSIONS.md': 'f56577c90fd5b6fedde417bf24556367b7369931cf2be38b720aeb3435ecf0b3',
    'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json': 'b459e9ec99c17da411fef8d482a50c8feb6f565f89ae44b456162b71aecc0b2d',
    'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json': '79a06ff669f518c8534252a2314ffc5e79553eb470c4ccb8cff4ef4957403e5d',
    'docs/implementation/b2/access-authorization.json': '9927805c91c8eaf1228758e172678eec3941342c00d560878702f87662ff9d33',
    'docs/implementation/b2/combined-authorization.json': 'f95e83f4ccd85cf58bb5e373510157bae207df387ab3c72558e71b6d7ae239b3',
    'docs/implementation/b2/directory-authorization.json': 'c3aadd44cbf9822b33370ba5e71bae2d6afdfe2a2092159a58b6ca07bfb0a503',
    'docs/implementation/b2/invitation-administration-authorization.json': '97a36198f371d5d260a6d90876fddeead8b4032f1d9d3080376daa4de0fe20e5',
    'docs/implementation/b2/invitation-contract-approval.json': '01e2e7e1b1ca543952ec5c1c4ba74f6e27c947e0bd147b06262067be178e2afb',
    'docs/implementation/b2/users-authorization.json': '2deccf311fc711208ac2827bbdc7711a2a47f00e3ae40bb4133ca3f9245e6cca',
    'docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql': '965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa',
    'docs/proposals/b2-access/002-effective-access.review.sql': 'd11842d50959ea6e2e90afe8d90d7c327bcbc8ca45685e893c436baae3549efe',
    'docs/proposals/b2-access/access-tests.r2.review.py': '72ed26f1e515ef5e7126271a91e9cdfb38575826e861a04b2196ea6e0e7e2550',
    'docs/proposals/b2-integration/AUTHORIZATION.review.json': '133cc6643d7caa6082688bdbd6ba87cb4ffaad659de5c30911a6ef5b759f004b',
    'docs/proposals/b2-integration/combined-tests.review.py': '710038fe021b2863338230c09d868712ef06a0864b2dc17058da624d176b58f3',
    'docs/proposals/b2-integration/workflow.review.yml': 'bc2f34f905d57e26b7d7d3a1e56e16e7655eb4b748c222e5275f055ca9257fce',
    'docs/proposals/b2-invitations/004-invitation-administration.review.sql': 'e32365999f4f41a1ded6ee7da375878b18c0c907bfd982fd86f68cf84336fc96',
    'docs/proposals/b2-invitations/005-invitation-acceptance.r3-candidate.review.sql': 'b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2',
    'docs/proposals/b2-invitations/acceptance-tests.r3-candidate.review.py': 'aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb',
    'docs/proposals/b2-invitations/sql5-r3-candidate-manifest.review.json': '907d691791d73be42d03db266b5e7ad92c5c5ead098a29134f022709aa6e6b97',
    'docs/proposals/b2-users/001-directory.review.sql': '8a380379b392536bb986136c997833c57ca4e482de3c418b389b898245e8e31f',
    'docs/proposals/b2-users/003-user-changes.review.sql': '77c3d298602d1e2a273db104b5ee28d7d4db2c8824558c9b7d1775440bf8df4b',
    'docs/proposals/b2-users/directory-tests.review.py': 'b5d669aad3c61935b89d90fad8ad845cd1fc048125d866d37563ac40123a78fe',
    'docs/proposals/b2-users/user-change-tests.r2.review.py': '1a66ccf3610b01bf840ad1f8a9e01c6917c7fe55ed72123b574008442168e6b2',
    'e2e/b2-access-postgres.spec.ts': '6f5a93e3c855a96a41cc0f71c84b59ab08ed5fe94ec839fd1f373d9c6979fc54',
    'e2e/b2-users-postgres.spec.ts': 'c0f6642dbe2047f00ce7259b8df29a9d1f165392dbdfa1b957caf459b815a664',
    'lib/b1/security-values.json': '4640511dd6c82a882f9fe651e6bde883ca3802ee574a0c5e024c073d84a7c5ab',
    'playwright.b2-access-postgres.config.ts': '83237058780991aad9c93f2b094c9f504e1d6116d1766b8840559c1d24c440bf',
    'playwright.b2-users-postgres.config.ts': '5b7259656591d0a4e9a4ae47dde3ba1dc7a939c9d58a0a637337f4ae0df18798',
    'scripts/b2-browser-backend.ts': '2e7b8b538d357bf6ec1bc27f99bacf7b15286e6ce5b4de1a92844d444c43c272',
    'scripts/b2-real-browser-server.mjs': 'c6a937aaa805a2978d27e403acbb9f63261511dc1258e36016ffd74486bb5944',
    'scripts/pg-http-integration.py': '4e77ef4f077f285970ffd9cd40c446def06c1573983ec000ad90c8eed30b788a',
    'scripts/pg-test-01.py': '15ccd429880bf512f9ec570790df3eb0d00831f1ca1167ee393c7f0d093b5e7e',
    'scripts/pg11-rbac-matrix.py': 'f9627f2628da3c1ebf4dfff0653480c0a9115426ce13038887790c4c966d838f',
}


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise RuntimeError('DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=pairs)
    except (ValueError, TypeError, UnicodeError):
        raise RuntimeError('INVALID_AUTHORIZATION_JSON') from None


def artifact_bytes(name):
    path = Path(name)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        raise RuntimeError('INVALID_BUNDLE_PATH')
    current = ROOT
    for part in path.parts:
        current = current / part
        if current.is_symlink():
            raise RuntimeError('BUNDLE_SYMLINK_FORBIDDEN')
    if not current.is_file():
        raise RuntimeError('BUNDLE_FILE_REQUIRED')
    return current.read_bytes()


def git_bytes(reference, name, *, fetch_workflow=False):
    if not re.fullmatch(r'[0-9a-f]{40}', reference or '') or name not in R3_FILES | AUD031_FILES | {R3_MANIFEST, AUD031_MANIFEST, 'docs/proposals/b2-invitations/005-invitation-acceptance.r2.review.sql'}:
        raise RuntimeError('EXACT_GIT_REFERENCE_REQUIRED')
    if fetch_workflow:
        if name != R3_WORKFLOW or reference != os.environ.get('GITHUB_WORKFLOW_SHA'):
            raise RuntimeError('EXACT_R3_WORKFLOW_FETCH_REQUIRED')
        try:
            present = subprocess.run(['git','--no-replace-objects','cat-file','-e',reference+'^{commit}'],
                                     cwd=ROOT, capture_output=True, timeout=15)
            if present.returncode:
                fetched = subprocess.run(['git','--no-replace-objects','fetch','--no-tags',
                    '--no-recurse-submodules','--no-write-fetch-head','--no-auto-maintenance',
                    'https://github.com/novo34/cleanops-360.git',reference],
                    cwd=ROOT, capture_output=True, timeout=60)
                if fetched.returncode:
                    raise RuntimeError('EXACT_R3_WORKFLOW_FETCH_FAILED')
            verified = subprocess.run(['git','--no-replace-objects','rev-parse','--verify',reference+'^{commit}'],
                                      cwd=ROOT, capture_output=True, timeout=15)
            if verified.returncode or verified.stdout.strip() != reference.encode():
                raise RuntimeError('EXACT_R3_WORKFLOW_OBJECT_REQUIRED')
        except (OSError, subprocess.SubprocessError):
            raise RuntimeError('EXACT_R3_WORKFLOW_FETCH_FAILED') from None
    result = subprocess.run(['git','--no-replace-objects','show',reference+':'+name], cwd=ROOT, capture_output=True)
    if result.returncode:
        raise RuntimeError('EXACT_GIT_OBJECT_REQUIRED')
    return result.stdout


def execution_context(scope):
    if scope not in {'directory','access','users','combined','sql5-r3','sql5-aud031'}:
        raise RuntimeError('EXACT_SCOPE_REQUIRED')
    sql5 = scope in ('sql5-r3','sql5-aud031')
    context = AUD031_CONTEXT if scope=='sql5-aud031' else R3_CONTEXT
    if scope=='sql5-aud031' and (type(context['pullRequest']) is not int or context['pullRequest']<=0):
        raise RuntimeError('AUD031_REVIEW_CONTEXT_NOT_CONFIGURED')
    env = os.environ
    if not (env.get('GITHUB_ACTIONS') == 'true' and env.get('RUNNER_ENVIRONMENT') == 'github-hosted'
            and env.get('GITHUB_REPOSITORY') == 'novo34/cleanops-360'):
        raise RuntimeError('HOSTED_CI_SCOPE_REQUIRED')
    try:
        event = strict_json(Path(env['GITHUB_EVENT_PATH']).read_bytes())
        repo, pr = event['repository'], event['pull_request']
        number = context['pullRequest'] if sql5 else 12
        branch = context['branch'] if sql5 else 'feat/b2-users-access'
        owner = {'login':'novo34', 'id':17856013}
        identity = lambda value: all(value.get(k) == v for k, v in owner.items())
        repository = lambda value: value['full_name'] == 'novo34/cleanops-360' and value['id'] == 1412999204
        if not (repository(repo) and identity(repo['owner']) and identity(event['sender'])
                and env.get('GITHUB_REPOSITORY_ID') == '1412999204'
                and env.get('GITHUB_ACTOR') == 'novo34' and env.get('GITHUB_ACTOR_ID') == '17856013'
                and env.get('GITHUB_TRIGGERING_ACTOR') == 'novo34' and env.get('GITHUB_RUN_ATTEMPT') == '1'
                and pr['number'] == number and pr['state'] == 'open'
                and repository(pr['head']['repo']) and not pr['head']['repo'].get('fork', True)
                and repository(pr['base']['repo']) and pr['head']['ref'] == branch
                and (not sql5 or pr['base']['ref'] == 'main')
                and (not env.get('GITHUB_HEAD_REF') or env['GITHUB_HEAD_REF'] == branch)):
            raise RuntimeError('HOSTED_CI_SCOPE_REQUIRED')
        review_event = env.get('GITHUB_EVENT_NAME') == 'pull_request_review'
        if review_event:
            review = event['review']
            if not (event['action'] == 'submitted' and identity(review['user'])
                    and review['state'] == 'commented' and type(review['id']) is int and review['id'] > 0
                    and review['commit_id'] == pr['head']['sha']):
                raise RuntimeError('EXACT_OWNER_REVIEW_REQUIRED')
            if sql5:
                if not re.fullmatch(r'[1-9][0-9]*', env.get('GITHUB_RUN_ID', '')):
                    raise RuntimeError('EXACT_R3_RUN_REQUIRED')
                submitted = review.get('submitted_at')
                try:
                    if not isinstance(submitted, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', submitted):
                        raise ValueError('UTC_TIMESTAMP_REQUIRED')
                    timestamp = datetime.strptime(submitted, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
                    age = time.time() - timestamp
                    if not 0 <= age <= 900:
                        raise ValueError('REVIEW_OUTSIDE_15_MINUTES')
                except (ValueError, OverflowError, OSError):
                    raise RuntimeError('FRESH_R3_OWNER_REVIEW_REQUIRED') from None
            if not sql5 and not (scope == 'combined' and review['body'] ==
                    'Execute owner-authorized SQL5-R2 0eb651f3cfce5733726ca1d122e09bd1d0162c26; native isolated validation only.'):
                raise RuntimeError('EXACT_OWNER_REVIEW_REQUIRED')
        elif not (not sql5 and env.get('GITHUB_EVENT_NAME') == 'pull_request'
                  and event['action'] in {'opened','synchronize','reopened'}):
            raise RuntimeError('EXACT_EVENT_REQUIRED')
        return event
    except (KeyError, TypeError, AttributeError, OSError):
        raise RuntimeError('HOSTED_CI_SCOPE_REQUIRED') from None


def authorize_r3(scope='sql5-r3'):
    # One canonical SQL5 gate; retain the existing R3 API/default for consumers.
    if scope not in ('sql5-r3','sql5-aud031'):raise RuntimeError('EXACT_SCOPE_REQUIRED')
    aud031 = scope=='sql5-aud031'
    context = AUD031_CONTEXT if aud031 else R3_CONTEXT
    manifest_path = AUD031_MANIFEST if aud031 else R3_MANIFEST
    bundle_scope = AUD031_SCOPE if aud031 else R3_SCOPE
    files = AUD031_FILES if aud031 else R3_FILES
    fixed = AUD031_FIXED_DEPENDENCIES if aud031 else R3_FIXED_DEPENDENCIES
    fixture = AUD031_FIXTURE if aud031 else R3_FIXTURE
    tag = 'AUD031' if aud031 else 'R3'
    event = execution_context(scope)
    raw = artifact_bytes(manifest_path)
    manifest = strict_json(raw)
    if (not isinstance(manifest, dict) or set(manifest) != ({'schemaVersion','scope','context','historicalReferences','files','contractApproved','executionAuthorized'} if aud031 else {'schemaVersion','scope','context','historicalReferences','files'})
            or type(manifest['schemaVersion']) is not int or manifest['schemaVersion'] != 1
            or manifest['scope'] != bundle_scope or manifest['context'] != context
            or manifest['historicalReferences'] != R3_REFERENCES
            or not isinstance(manifest['files'], dict) or set(manifest['files']) != files):
        raise RuntimeError('EXACT_R3_MANIFEST_REQUIRED')
    if aud031 and (manifest['contractApproved'] is not True or manifest['executionAuthorized'] is not True):
        raise RuntimeError('AUD031_EXACT_OWNER_APPROVAL_REQUIRED')
    candidate = event['review']['commit_id']
    workflow = os.environ.get('GITHUB_WORKFLOW_SHA', '')
    base = event['pull_request']['base'].get('sha', '')
    if not all(isinstance(value, str) and re.fullmatch(r'[0-9a-f]{40}', value) for value in (candidate, workflow, base)):
        raise RuntimeError('EXACT_R3_REFERENCE_REQUIRED')
    digest = hashlib.sha256(raw).hexdigest()
    expected_body = f'Execute owner-authorized SQL5-{tag} candidate {candidate} manifest {digest} workflow {workflow} base {base}; native isolated validation only.'
    if event['review']['body'] != expected_body:
        raise RuntimeError('NEW_R3_C_M_W_AUTHORIZATION_REQUIRED')
    head = subprocess.run(['git','--no-replace-objects','rev-parse','HEAD'], cwd=ROOT, capture_output=True)
    if head.returncode or head.stdout.strip().decode() != candidate:
        raise RuntimeError('EXACT_R3_CHECKOUT_REQUIRED')
    review_ref = f"refs/pull/{context['pullRequest']}/merge"
    if (os.environ.get('GITHUB_REF') != review_ref
            or os.environ.get('GITHUB_WORKFLOW_REF') != 'novo34/cleanops-360/'+R3_WORKFLOW+'@'+review_ref
            or os.environ.get('GITHUB_SHA') != workflow):
        raise RuntimeError('EXACT_R3_WORKFLOW_CONTEXT_REQUIRED')
    if git_bytes(candidate, manifest_path) != raw:
        raise RuntimeError('EXACT_R3_MANIFEST_BYTES_REQUIRED')
    for name, expected in manifest['files'].items():
        content = artifact_bytes(name)
        if (not isinstance(expected, str) or not re.fullmatch(r'[0-9a-f]{64}', expected)
                or hashlib.sha256(content).hexdigest() != expected or git_bytes(candidate, name) != content):
            raise RuntimeError('EXACT_R3_BUNDLE_BYTES_REQUIRED')
        if name in fixed and expected != fixed[name]:
            raise RuntimeError('UNEXPECTED_FIXED_DEPENDENCY_CHANGE')
    if git_bytes(workflow, R3_WORKFLOW, fetch_workflow=True) != artifact_bytes(R3_WORKFLOW):
        raise RuntimeError('EXACT_R3_WORKFLOW_BYTES_REQUIRED')
    # W is an exact merge snapshot, never a mutable-ref replacement for C or B.
    try:
        parents = subprocess.run(['git','--no-replace-objects','rev-list','--parents','-n','1',workflow],
                                 cwd=ROOT, capture_output=True, timeout=15)
        if parents.returncode or parents.stdout.split() != [value.encode() for value in (workflow, base, candidate)]:
            raise RuntimeError('EXACT_R3_MERGE_PARENTS_REQUIRED')
        expected_refs = {b'refs/heads/main':base.encode(),
                         ('refs/heads/'+context['branch']).encode():candidate.encode(),
                         review_ref.encode():workflow.encode()}
        refs = subprocess.run(['git','--no-replace-objects','ls-remote','--exit-code',
            'https://github.com/novo34/cleanops-360.git',*(name.decode() for name in expected_refs)],
            cwd=ROOT, capture_output=True, timeout=30)
        lines = [line.split(b'\t') for line in refs.stdout.splitlines()]
        if (refs.returncode or len(lines) != 3 or any(len(line) != 2 for line in lines)
                or {name:sha for sha,name in lines} != expected_refs):
            raise RuntimeError('CURRENT_R3_REFERENCES_REQUIRED')
    except (OSError, subprocess.SubprocessError):
        raise RuntimeError('CURRENT_R3_REFERENCES_REQUIRED') from None
    historical_raw = git_bytes(COMPOSITION_REFERENCE, COMPOSITION_MANIFEST)
    if (hashlib.sha256(historical_raw).hexdigest() != COMPOSITION_MANIFEST_SHA
            or artifact_bytes(COMPOSITION_MANIFEST) != historical_raw):
        raise RuntimeError('IMMUTABLE_HISTORICAL_MANIFEST_REQUIRED')
    historical = strict_json(historical_raw)
    if (set(historical['artifacts']) != set(historical['sha256'])
            or len(historical['artifacts']) != len(COMPOSITION_FILES)
            or set(historical['artifacts'].values()) != COMPOSITION_FILES):
        raise RuntimeError('EXACT_HISTORICAL_ARTIFACT_SET_REQUIRED')
    for key, name in historical['artifacts'].items():
        original = git_bytes(COMPOSITION_REFERENCE, name)
        if hashlib.sha256(original).hexdigest() != historical['sha256'][key]:
            raise RuntimeError('EXACT_HISTORICAL_BYTES_REQUIRED')
        if name != 'scripts/b2-directory-postgres.py' and artifact_bytes(name) != original:
            raise RuntimeError('UNEXPECTED_DEPENDENCY_CHANGE')
    # Revalidate immutable dependencies, not their permission to run new bytes.
    authorize_package('access'); authorize_package('users')
    combined = strict_json(artifact_bytes('docs/implementation/b2/combined-authorization.json'))
    if not (combined.get('ownerApproved') is True and combined.get('referenceCommit') == COMPOSITION_REFERENCE
            and combined.get('sourceManifest') == COMPOSITION_MANIFEST and combined.get('sourceManifestSha256') == COMPOSITION_MANIFEST_SHA
            and combined.get('scope') == 'SQL14+SQL1+SQL2+SQL3_HOSTED_EPHEMERAL_PG16'):
        raise RuntimeError('PRIOR_COMPOSITION_PROVENANCE_REQUIRED')
    prior = strict_json(artifact_bytes('docs/implementation/b2/invitation-administration-authorization.json'))
    sql4 = 'docs/proposals/b2-invitations/004-invitation-administration.review.sql'
    if not (prior.get('ownerApproved') is True and prior.get('scope') == 'SQL4_INVITATION_ADMIN_HOSTED_EPHEMERAL_PG16'
            and prior.get('referenceCommit') == 'cd138d71fb8fd8e9298e17c0f69b83e259ef3eba'
            and prior.get('sqlSha256') == 'e32365999f4f41a1ded6ee7da375878b18c0c907bfd982fd86f68cf84336fc96'
            and hashlib.sha256(artifact_bytes(sql4)).hexdigest() == prior['sqlSha256']
            and git_bytes(prior['referenceCommit'], sql4) == artifact_bytes(sql4)):
        raise RuntimeError('EXACT_PRIOR_SQL4_PROVENANCE_REQUIRED')
    contract = strict_json(artifact_bytes('docs/implementation/b2/invitation-contract-approval.json'))
    if not (contract.get('ownerApproved') is True and contract.get('parametersApproved') is True
            and contract.get('implementationAuthorized') is True and contract.get('sqlExecutionAuthorized') is False
            and contract.get('referenceCommit') == COMPOSITION_REFERENCE
            and contract.get('sha256') == '63d01265908831372bd1e3e423867dc8b0be5c0a3fc000b060ad279e8ba48d5a'):
        raise RuntimeError('PRIOR_INVITATION_CONTRACT_REQUIRED')
    ast.parse(artifact_bytes(fixture), filename=fixture)
    # Git acquisition and provenance checks must not extend the review lifetime.
    if execution_context(scope) != event:
        raise RuntimeError('UNCHANGED_R3_REVIEW_CONTEXT_REQUIRED')
    return {'tests':fixture, 'packages':['access','users'], 'authorization':{
        'candidate':candidate, 'manifestSha256':digest, 'workflow':workflow, 'base':base,
        'reviewId':event['review']['id'], 'reviewBodySha256':hashlib.sha256(expected_body.encode()).hexdigest(),
        'runId':os.environ.get('GITHUB_RUN_ID'), 'attempt':1,
    }}


def reserve_aud031(authorization, create_reference):
    """Trusted-writer primitive, NOT a PR job entrypoint or a token consumer.

    A future trusted base-workflow may supply the exclusive GitHub POST only.
    Never supply a write credential to this module loaded from a PR. Integration
    remains blocked pending trusted workflow installation and namespace rules.
    No GET-before-POST, retry, update, delete or recovery of uncertain creation.
    """
    required = {'candidate','manifestSha256','workflow','base','reviewId',
                'reviewBodySha256','runId','attempt'}
    if not isinstance(authorization, dict) or set(authorization) != required:
        raise RuntimeError('AUD031_RESERVATION_IDENTITY_REQUIRED')
    for key in ('candidate','workflow','base','manifestSha256','reviewBodySha256'):
        length = 40 if key in ('candidate','workflow','base') else 64
        if not isinstance(authorization[key],str) or not re.fullmatch('[0-9a-f]{'+str(length)+'}',authorization[key]):
            raise RuntimeError('AUD031_RESERVATION_IDENTITY_REQUIRED')
    if (type(authorization['reviewId']) is not int or authorization['reviewId'] <= 0
            or type(authorization['attempt']) is not int or authorization['attempt'] != 1
            or not isinstance(authorization['runId'],str)
            or not re.fullmatch('[1-9][0-9]*',authorization['runId'])):
        raise RuntimeError('AUD031_RESERVATION_IDENTITY_REQUIRED')
    identity = {'repository':'novo34/cleanops-360','pullRequest':23,
                'scope':AUD031_SCOPE,'ownerId':17856013,
                **{k:authorization[k] for k in required - {'runId','attempt'}}}
    digest = hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    ref = 'refs/tags/cleanops-native-auth/aud031/'+digest
    # Only a confirmed exclusive creation can win. An uncertain successful
    # server write burns the authorization; callers must never resume it.
    try:
        status, response = create_reference(ref,AUD031_RESERVATION_TARGET)
        if (type(status) is not int or status != 201 or not isinstance(response,dict)
                or response.get('ref') != ref or not isinstance(response.get('object'),dict)
                or response['object'].get('type') != 'commit'
                or response['object'].get('sha') != AUD031_RESERVATION_TARGET):
            raise ValueError('UNCONFIRMED_CREATION')
    except Exception:
        raise RuntimeError('AUD031_EXCLUSIVE_RESERVATION_NOT_CONFIRMED') from None
    return {'ref':ref,'candidate':authorization['candidate'],
            'reservationTarget':AUD031_RESERVATION_TARGET,'runId':authorization['runId'],'reviewId':authorization['reviewId']}


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


def authorize_composition():
    """Individual approvals never authorize composition. No transport import here."""
    path=ROOT/'docs/proposals/b2-integration/AUTHORIZATION.review.json'
    owner=json.loads(path.read_text())
    if owner.get('ownerApproved') is not True or not re.fullmatch(r'[0-9a-f]{40}',owner.get('referenceCommit') or ''):
        raise RuntimeError('EXPLICIT_COMPOSITION_APPROVAL_REQUIRED')
    if owner.get('scope')!='SQL14+SQL1+SQL2+SQL3_HOSTED_EPHEMERAL_PG16':
        raise RuntimeError('EXACT_COMPOSITION_SCOPE_REQUIRED')
    for scope in ('access','users'):
        authorize_package(scope)
    artifacts=owner.get('artifacts',{})
    hashes=owner.get('sha256',{})
    if not isinstance(artifacts,dict) or not isinstance(hashes,dict) or set(artifacts)!=set(hashes):
        raise RuntimeError('EXACT_COMPOSITION_ARTIFACTS_REQUIRED')
    expected={name:hashes[key] for key,name in artifacts.items()}
    if len(expected)!=len(artifacts):raise RuntimeError('EXACT_COMPOSITION_ARTIFACTS_REQUIRED')
    required=COMPOSITION_FILES
    if set(expected)!=required:raise RuntimeError('EXACT_COMPOSITION_ARTIFACTS_REQUIRED')
    for name,sha in expected.items():
        candidate=Path(name)
        if candidate.is_absolute() or '..' in candidate.parts or not re.fullmatch(r'[0-9a-f]{64}',sha):
            raise RuntimeError('INVALID_COMPOSITION_ARTIFACT')
        raw=(ROOT/candidate).read_bytes()
        historical=subprocess.run(['git','show',owner['referenceCommit']+':'+name],cwd=ROOT,capture_output=True)
        if hashlib.sha256(raw).hexdigest()!=sha or historical.returncode or historical.stdout!=raw:
            raise RuntimeError('EXACT_COMPOSITION_BYTES_REQUIRED')
    return {'tests':'docs/proposals/b2-integration/combined-tests.review.py','packages':['access','users']}


def preflight(*, scope='directory'):
    execution_context(scope)
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
    if scope in ('sql5-r3','sql5-aud031'):
        target = ROOT / ('artifacts/b2-acceptance-aud031/report.json' if scope=='sql5-aud031' else 'artifacts/b2-acceptance-r3/report.json')
        report.update(scope=AUD031_SCOPE if scope=='sql5-aud031' else R3_SCOPE, functionalBrowser='SKIP_NOT_IN_THIS_PACKAGE')
    b = None
    before = None
    try:
        baseline = preflight(scope=scope)  # Must finish before Docker, SQL, or fixture imports.
        if scope in ('sql5-r3','sql5-aud031'):
            selected = authorize_r3(scope)
            report['authorization'] = selected['authorization']
            # Activation is not execution permission. All authorization checks above
            # must finish before the first transport import below.
            if not (AUD031_NATIVE_ENABLED if scope=='sql5-aud031' else R3_NATIVE_ENABLED):
                raise RuntimeError('AUD031_NATIVE_ACTIVATION_REQUIRED' if scope=='sql5-aud031' else 'R3_NATIVE_ACTIVATION_REQUIRED')
        else:
            selected=authorize_composition() if scope=='combined' else authorize_package(scope) if scope!='directory' else None
            if hashlib.sha256((ROOT / 'scripts/b2-directory-postgres.py').read_bytes()).hexdigest() != HISTORICAL_HARNESS_SHA:
                raise RuntimeError('HISTORICAL_APPROVAL_DOES_NOT_AUTHORIZE_NEW_HARNESS')
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
        for kind in (selected['packages'] if scope in ('combined','sql5-r3','sql5-aud031') else [scope] if selected else []):
            if not b.check('install-exact-authorized-'+kind+'-SQL-and-ACL',(ROOT/PACKAGES[kind]['sql']).read_text()):
                raise RuntimeError('SELECTED_INSTALLATION_FAILED_NO_REPLACEMENT_SQL')
        original_check = b.check
        def with_browser(name, text, expected=None, role='postgres', failure=None):
            passed = original_check(name,text,expected,role,failure)
            if scope=='combined' and passed:
                for kind in ('access','users'):
                    if name==PACKAGES[kind]['hook']:browser(b,kind)
            elif scope!='combined' and name == (selected['hook'] if selected else 'B2-synthetic-global-view') and passed:
                browser(b,scope)
            return passed
        if scope not in ('sql5-r3','sql5-aud031'):
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
    parser.add_argument('--package',choices=['directory','access','users','combined','sql5-r3','sql5-aud031'],default='directory')
    sys.exit(main(parser.parse_args().package))
