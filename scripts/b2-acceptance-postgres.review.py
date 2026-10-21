"""REVIEW ONLY. SQL5 never runs from current CI; exact approval required first."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
MANIFEST='docs/proposals/b2-invitations/sql5-manifest.review.json'
FIXTURES='docs/proposals/b2-invitations/acceptance-tests.review.py'


def authorize():
    path=ROOT/'docs/implementation/b2/invitation-acceptance-authorization.json'
    if not path.exists():raise RuntimeError('EXACT_SQL5_OWNER_APPROVAL_REQUIRED')
    owner=json.loads(path.read_text());reference=owner.get('referenceCommit')
    if owner.get('ownerApproved') is not True or owner.get('scope')!='SQL5_ACCEPTANCE_HOSTED_EPHEMERAL_PG16' or not re.fullmatch(r'[0-9a-f]{40}',reference or ''):
        raise RuntimeError('EXACT_SQL5_OWNER_APPROVAL_REQUIRED')
    prior=json.loads((ROOT/'docs/implementation/b2/invitation-administration-authorization.json').read_text())
    if prior.get('ownerApproved') is not True or prior.get('referenceCommit')!='cd138d71fb8fd8e9298e17c0f69b83e259ef3eba' or prior.get('sqlSha256')!='e32365999f4f41a1ded6ee7da375878b18c0c907bfd982fd86f68cf84336fc96':
        raise RuntimeError('EXACT_PRIOR_SQL4_APPROVAL_REQUIRED')
    raw=(ROOT/MANIFEST).read_bytes()
    historical=subprocess.run(['git','show',reference+':'+MANIFEST],cwd=ROOT,capture_output=True)
    if historical.returncode or historical.stdout!=raw or hashlib.sha256(raw).hexdigest()!=owner.get('manifestSha256'):
        raise RuntimeError('EXACT_SQL5_MANIFEST_REQUIRED')
    manifest=json.loads(raw)
    expected={'docs/proposals/b2-invitations/004-invitation-administration.review.sql','docs/proposals/b2-invitations/005-invitation-acceptance.review.sql',FIXTURES,'scripts/b2-acceptance-postgres.review.py'}
    if set(manifest['files'])!=expected:raise RuntimeError('EXACT_SQL5_FILE_SET_REQUIRED')
    for name,digest in manifest['files'].items():
        content=(ROOT/name).read_bytes()
        historical=subprocess.run(['git','show',reference+':'+name],cwd=ROOT,capture_output=True)
        if historical.returncode or historical.stdout!=content or hashlib.sha256(content).hexdigest()!=digest:
            raise RuntimeError('EXACT_SQL5_BYTES_REQUIRED')


def main():
    spec=importlib.util.spec_from_file_location('sql5_owned_harness',ROOT/'scripts/b2-directory-postgres.py')
    core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
    prior=core.authorize_composition
    def plan():
        selected=prior();authorize();selected['tests']=FIXTURES
        return selected
    core.authorize_composition=plan
    result=core.main('combined')
    source=ROOT/'artifacts/b2-combined/report.json'
    if source.exists():
        report=json.loads(source.read_text())
        report.update(scope='SQL5_NEW_IDENTITY_ACCEPTANCE',functionalBrowser='SKIP_NOT_IN_THIS_PACKAGE',existingIdentityAcceptance='SKIP_NOT_IMPLEMENTED',b2TechReady=False)
        destination=ROOT/'artifacts/b2-acceptance/report.json'
        destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_text(json.dumps(report,indent=2)+'\n')
    return result


if __name__=='__main__':raise SystemExit(main())
