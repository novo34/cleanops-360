"""Verify approved source bytes; stage authorization metadata, never SQL/Docker.

The immutable review manifest stays unchanged in Git. Only its CI working copy
receives the ownerApproved/referenceCommit/status metadata described in APPROVAL.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
REFERENCE='3ea4ec890fd05a59ae803f005e29cad713d1e5e8'
MANIFEST='docs/proposals/b2-integration/AUTHORIZATION.review.json'
MANIFEST_SHA='133cc6643d7caa6082688bdbd6ba87cb4ffaad659de5c30911a6ef5b759f004b'


def prepare():
    owner=json.loads((ROOT/'docs/implementation/b2/combined-authorization.json').read_text())
    if (owner.get('ownerApproved') is not True or owner.get('referenceCommit')!=REFERENCE
            or owner.get('scope')!='SQL14+SQL1+SQL2+SQL3_HOSTED_EPHEMERAL_PG16'
            or owner.get('sourceManifest')!=MANIFEST or owner.get('sourceManifestSha256')!=MANIFEST_SHA):
        raise RuntimeError('EXACT_COMPOSITION_OWNER_APPROVAL_REQUIRED')
    raw=(ROOT/MANIFEST).read_bytes()
    historical=subprocess.run(['git','show',REFERENCE+':'+MANIFEST],cwd=ROOT,capture_output=True)
    if hashlib.sha256(raw).hexdigest()!=MANIFEST_SHA or historical.returncode or historical.stdout!=raw:
        raise RuntimeError('IMMUTABLE_APPROVED_MANIFEST_REQUIRED')
    manifest=json.loads(raw)
    for key,name in manifest['artifacts'].items():
        candidate=Path(name)
        if candidate.is_absolute() or '..' in candidate.parts:raise RuntimeError('INVALID_APPROVED_ARTIFACT')
        content=(ROOT/candidate).read_bytes()
        historical=subprocess.run(['git','show',REFERENCE+':'+name],cwd=ROOT,capture_output=True)
        if hashlib.sha256(content).hexdigest()!=manifest['sha256'][key] or historical.returncode or historical.stdout!=content:
            raise RuntimeError('EXACT_APPROVED_COMPOSITION_BYTES_REQUIRED')
    spec=importlib.util.spec_from_file_location('b2_owner_approved_preflight',ROOT/'scripts/b2-directory-postgres.py')
    runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
    runner.preflight()
    runner.authorize_package('access');runner.authorize_package('users')
    manifest.update(ownerApproved=True,referenceCommit=REFERENCE,status='OWNER_AUTHORIZED_PENDING_EXECUTION')
    (ROOT/MANIFEST).write_text(json.dumps(manifest,indent=2)+'\n')
    print('PASS exact source manifest, 20 historical artifacts, individual approvals and hosted scope; metadata staged only')


if __name__=='__main__':prepare()
