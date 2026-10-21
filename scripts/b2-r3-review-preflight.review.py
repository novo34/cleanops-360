"""REVIEW ONLY: R3-specific branch guard, no SQL execution without separate orchestration approval.

Uses the original B2 harness unchanged. Duplicates only its preflight checks with
one explicit difference: exact authorized R3 review branch instead of B2 PR head.
Never alters GITHUB_HEAD_REF or B1/SQL fixtures.
"""
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REFERENCE='aff420f40d37e1e6a44942e80c7ff70fadd612ba'
BRANCH='review/b2-sql5-r3-regex-fix'


def preflight_r3(core):
    # Ensure the shared harness is unchanged from the owner's approved R3 commit.
    path='scripts/b2-directory-postgres.py'
    original=subprocess.run(['git','show',REFERENCE+':'+path],cwd=ROOT,capture_output=True,check=True).stdout
    if original != (ROOT/path).read_bytes():
        raise RuntimeError('ORIGINAL_HARNESS_BYTES_CHANGED')
    # Validate actual GitHub runner context; do not spoof or overwrite event values.
    if not (os.environ.get('GITHUB_ACTIONS')=='true'
            and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted'
            and os.environ.get('GITHUB_REPOSITORY')=='novo34/cleanops-360'
            and os.environ.get('GITHUB_HEAD_REF')==BRANCH):
        raise RuntimeError('SQL5_R3_HOSTED_REVIEW_SCOPE_REQUIRED')
    # Same external-binding guard as the unmodified B2 harness.
    forbidden=re.compile(r'^(DATABASE_URL|CLEANOPS_TEST_DATABASE_URL|PG[A-Z_]*|DATABASE_.*|DB_.*|SUPABASE_.*|NEON_.*|RDS_.*|OPENBAO_.*|VAULT_.*|CLEANOPS_.*(?:DATABASE|DB_|BAO|SECRET|TOKEN|KEY).*)$')
    if any(value and forbidden.fullmatch(key) for key,value in os.environ.items()):
        raise RuntimeError('EXTERNAL_DATABASE_OR_SECRET_BINDING_PRESENT')
    owner=json.loads((ROOT/'docs/implementation/b2/directory-authorization.json').read_text())
    if owner.get('ownerApproved') is not True or owner.get('referenceCommit')!='f5cf6aa7bc3f2f66da4e8246a8d47bb6c824ee0e' or owner.get('sha256')!=core.APPROVED:
        raise RuntimeError('B2_OWNER_AUTHORIZATION_MISMATCH')
    for path,expected in core.APPROVED.items():
        if hashlib.sha256((ROOT/path).read_bytes()).hexdigest()!=expected:
            raise RuntimeError('EXACT_B2_SHA256_MISMATCH')
    approval=json.loads((ROOT/'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json').read_text())
    raw=(ROOT/approval['candidatePath']).read_bytes()
    blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\\0'+raw).hexdigest()
    if (approval.get('ownerApproved') is not True or approval['candidate']['sha256']!=core.BASE_SHA
            or approval['candidate']['gitBlob']!=core.BASE_BLOB
            or hashlib.sha256(raw).hexdigest()!=core.BASE_SHA or blob!=core.BASE_BLOB):
        raise RuntimeError('EXACT_AUTHORIZED_SQL14_MISMATCH')
    session=json.loads((ROOT/'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json').read_text())
    if (session.get('ownerApproved') is not True
            or session['sessionPolicy']['sensitiveAbsoluteSeconds']!=43200
            or session['sessionPolicy']['operationalAbsoluteSeconds']!=86400):
        raise RuntimeError('PRIOR_B1_SESSION_FIXTURE_AUTHORIZATION_REQUIRED')
    return raw.decode()
