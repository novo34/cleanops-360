"""REVIEW ONLY. SQL4 authorization gate + reuse of owned PG16 composition runner.

Never runs from existing CI. The separate reviewed workflow requires explicit
SQL4 approval. No Docker/SQL before both prior composition and SQL4 checks finish.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
MANIFEST='docs/proposals/b2-invitations/sql4-manifest.review.json'
FIXTURES='docs/proposals/b2-invitations/invitation-admin-tests.review.py'
ARTIFACTS={
    'docs/proposals/b2-invitations/004-invitation-administration.review.sql',FIXTURES,
    'scripts/b2-invitations-postgres.review.py','scripts/b2-invitation-browser-backend.ts',
    'scripts/b2-invitation-browser-server.mjs','playwright.b2-invitations-postgres.config.ts',
    'e2e/b2-invitations-postgres.spec.ts','docs/proposals/b2-invitations/workflow.review.yml',
}


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def authorize():
    path=ROOT/'docs/implementation/b2/invitation-administration-authorization.json'
    if not path.exists():raise RuntimeError('EXACT_SQL4_OWNER_APPROVAL_REQUIRED')
    owner=json.loads(path.read_text())
    reference=owner.get('referenceCommit')
    if owner.get('ownerApproved') is not True or not re.fullmatch(r'[0-9a-f]{40}',reference or '') or owner.get('scope')!='SQL4_INVITATION_ADMIN_HOSTED_EPHEMERAL_PG16':
        raise RuntimeError('EXACT_SQL4_OWNER_APPROVAL_REQUIRED')
    raw=(ROOT/MANIFEST).read_bytes()
    historical=subprocess.run(['git','show',reference+':'+MANIFEST],cwd=ROOT,capture_output=True)
    if hashlib.sha256(raw).hexdigest()!=owner.get('manifestSha256') or historical.returncode or historical.stdout!=raw:
        raise RuntimeError('EXACT_APPROVED_SQL4_MANIFEST_REQUIRED')
    manifest=json.loads(raw)
    if (set(manifest.get('artifacts',{}))!=set(manifest.get('sha256',{}))
            or set(manifest['artifacts'].values())!=ARTIFACTS or len(manifest['artifacts'])!=len(ARTIFACTS)):
        raise RuntimeError('EXACT_SQL4_ARTIFACT_SET_REQUIRED')
    for key,name in manifest['artifacts'].items():
        candidate=Path(name)
        if candidate.is_absolute() or '..' in candidate.parts:raise RuntimeError('INVALID_SQL4_ARTIFACT')
        content=(ROOT/candidate).read_bytes()
        historical=subprocess.run(['git','show',reference+':'+name],cwd=ROOT,capture_output=True)
        if hashlib.sha256(content).hexdigest()!=manifest['sha256'][key] or historical.returncode or historical.stdout!=content:
            raise RuntimeError('EXACT_APPROVED_SQL4_BYTES_REQUIRED')
    return manifest


def run_browser(b):
    load('sql4_runtime_copy','scripts/pg-http-integration.py').copy_runtime(b,('scripts/b2-invitation-browser-backend.ts',))
    fixture={'container':b.CID,'run':b.RUN}
    result=subprocess.run(['npx','--no-install','playwright','test','--config=playwright.b2-invitations-postgres.config.ts'],cwd=ROOT,
        env=dict(b.ENV,B2_BROWSER_FIXTURE=json.dumps(fixture)),text=True,capture_output=True,timeout=180)
    report=ROOT/'artifacts/b2-invitations/playwright.json';statuses=[]
    if report.exists():
        try:
            data=json.loads(report.read_text())
            def collect(suite):
                for spec in suite.get('specs',[]):
                    statuses.extend(r['status'] for test in spec['tests'] for r in test['results'])
                for child in suite.get('suites',[]):collect(child)
            for suite in data.get('suites',[]):collect(suite)
        finally:report.unlink()
    b.REPORT['invitationBrowserExecuted']=True
    b.record('SQL4-real-browser-persisted-invitation','PASS' if result.returncode==0 and statuses==['passed'] else 'FAIL',{'attemptStatuses':statuses})


def main():
    core=load('sql4_existing_composition_harness','scripts/b2-directory-postgres.py')
    prior=core.authorize_composition
    def plan():
        # Called by core only after its hosted/no-external-bindings preflight.
        selected=prior();authorize();selected['tests']=FIXTURES
        return selected
    core.authorize_composition=plan
    result=core.main('combined')
    source=ROOT/'artifacts/b2-combined/report.json'
    if source.exists():
        data=json.loads(source.read_text());data['scope']='SQL4_INVITATION_ADMIN_WITH_EXISTING_B2_COMPOSITION';data['b2TechReady']=False
        destination=ROOT/'artifacts/b2-invitations/report.json';destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_text(json.dumps(data,indent=2)+'\n')
    return result


if __name__=='__main__':raise SystemExit(main())
