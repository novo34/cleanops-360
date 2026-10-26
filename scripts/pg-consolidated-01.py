#!/usr/bin/env python3
"""Authorized exact consolidated PG16 run; reuses bounded isolated legacy transport."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BLOB = '7507a29dc58c27fa4b9ab7f3b6dd628397485c9a'
SHA256 = '42169677305df68612d44a6c0f0a4b4bafe1ec142d041e9a9a0e426d84e97863'

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

base = module('pg_isolation_transport', 'pg-test-01.py')
review = module('consolidated_review', 'review-b1-consolidated.py')
original_record, original_sql, original_fixtures = base.record, base.sql, base.fixtures


def authorized_payload():
    approval = json.loads((ROOT / 'docs/implementation/b1/consolidated-test-01/AUTHORIZATION.json').read_text())
    if approval['authorization'] != 'PG-TEST-01-CONSOLIDATED-01' or approval['ownerApproved'] is not True:
        raise RuntimeError('CONSOLIDATED_APPROVAL_MISSING')
    raw = (ROOT / approval['candidate']['path']).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    digest = hashlib.sha256(raw).hexdigest()
    if blob != BLOB or digest != SHA256 or approval['candidate']['gitBlob'] != BLOB or approval['candidate']['sha256'] != SHA256:
        raise RuntimeError('AUTHORIZED_CONSOLIDATED_HASH_MISMATCH')
    for path, content in review.build().items():
        if (ROOT / 'docs/proposals/b1-consolidated-sql' / path).read_bytes() != content.encode():
            raise RuntimeError('AUTHORIZED_DIFF_OR_ACL_MISMATCH')
    diff = (ROOT / approval['fullDiff']['path']).read_bytes()
    if hashlib.sha256(diff).hexdigest() != approval['fullDiff']['sha256']:
        raise RuntimeError('AUTHORIZED_DIFF_HASH_MISMATCH')
    base.REPORT['authorization'] = approval
    base.REPORT['candidate'] = {'gitBlob': blob, 'sha256': digest, 'bytes': len(raw)}
    original_record('authorized-consolidated-blob-sha256-diff-acl', 'PASS')
    # The legacy V4 label selects its existing 21-table atomic persistence probe.
    # Exactly ONE payload; not V4 followed by overlays or any rewritten statement.
    return [('V4', raw.decode())]


def record(name, status, detail=None):
    if name == 'install-V4':
        name = 'install-consolidated'
    if isinstance(detail, str):
        detail = detail.replace('V4 schema failed atomic installation', 'Authorized consolidated schema failed atomic installation')
    return original_record(name, status, detail)


def sql(text, role='postgres', database='core'):
    # File/line diagnostics for the immutable installation, not factor/token commands.
    if role == 'postgres' and hashlib.sha256(text.encode()).hexdigest() == SHA256:
        original = original_sql('SHOW check_function_bodies;')
        if original.returncode or original.stdout.strip() != 'on':
            raise RuntimeError('FUNCTION_BODY_VALIDATION_DISABLED')
        original_record('function-bodies-validation-enabled', 'PASS')
        base.REPORT['submittedSqlSha256'] = SHA256
        return base.docker('exec', '-i', base.CID, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                           '-v', 'VERBOSITY=verbose', '-U', role, '-d', database, '-f', '-', data=text)
    return original_sql(text, role, database)


def fixtures():
    if not base.check('all-broker-contracts-persisted', "SELECT to_regprocedure('auth_api.rehash_credential_cas(uuid,bigint,text,text)') IS NOT NULL AND to_regprocedure('auth_api.consume_totp_cas(text,uuid,text,bigint,bigint,bigint,uuid)') IS NOT NULL AND to_regprocedure('auth_api.trusted_mfa_material(text,text,text,uuid)') IS NOT NULL;", 't'):
        return False
    return original_fixtures()


def main():
    base.verified_candidates = authorized_payload
    base.record, base.sql, base.fixtures = record, sql, fixtures
    base.REPORT['scope'] = 'PG-TEST-01-CONSOLIDATED-01'
    result = base.main()
    installed = any(c['name'] == 'install-consolidated' and c['status'] == 'PASS' for c in base.REPORT['checks'])
    obligations = ['authentication-MFA-sessions', 'roles-ACL-SECURITY-DEFINER', 'RLS-positive-negative-two-tenants',
                   'credential-and-global-TOTP-CAS', 'owned-reservations-and-method-revalidation',
                   'concurrency-and-row-locks', 'functional-rollback-and-COMMIT-failure', 'backup-restore-integrity']
    if not installed:
        for name in obligations:
            record(name, 'BLOCKED', 'Authorized schema unavailable after installation prerequisite/failure; no replacement SQL/ACL installed.')
    # Legacy unexecuted sentinels remain BLOCKED and prohibit a false full acceptance.
    required = ['credential-CAS-concurrent-one-winner', 'global-TOTP-CAS-concurrent-one-winner',
                'D1-method-version-revalidation', 'full-authentication-MFA-transitions', 'owned-reservations-concurrent-consume']
    base.REPORT['mandatoryProductScenariosComplete'] = all(any(c['name'] == name and c['status'] == 'PASS' for c in base.REPORT['checks']) for name in required)
    base.REPORT['mandatoryProtocolCases'] = {name: next((c['status'] for c in base.REPORT['checks'] if c['name'] == name), 'BLOCKED') for name in required}
    base.REPORT['b1RequirementsComplete'] = {'count': 0, 'total': 44, 'basis': 'No complete real B1 requirement accepted by this run.'}
    base.REPORT['result'] = 'PASS' if not result and base.REPORT['mandatoryProductScenariosComplete'] else 'FAIL'
    target = ROOT / 'artifacts/pg-consolidated-01'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'report.json').write_text(json.dumps(base.REPORT, indent=2) + '\n')
    return 1 if result or not base.REPORT['mandatoryProductScenariosComplete'] else 0

if __name__ == '__main__':
    sys.exit(main())
