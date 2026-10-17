#!/usr/bin/env python3
"""Generate/check a REVIEW ONLY fresh-install proposal. Never connects to a DB."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'docs/proposals/b1-consolidated-sql'
SOURCES = [
    ('V4', 'docs/canonical/auth-review/v4/b1-review-only.sql', 'a06dc23cbc889382b30924a1edc4cead66eeb3e0'),
    ('B1-X', 'docs/proposals/b1-v4-extension/review-only.sql', '1499e90389b6e7c4d94b1dd17ed35cd4b539d436'),
    ('D1', 'docs/proposals/b1-ceremony-material/review-only.sql', '6454a7551e61e5857ef39090b24b93fcbdb03bb1'),
    ('D1-ACL', 'docs/proposals/b1-ceremony-material/approval-matrix.json', '50590047d35467b2473945731384ae3da5729f28'),
]
GUARD = "DO $review_only$ BEGIN\n RAISE EXCEPTION 'REVIEW_ONLY_OWNER_APPROVAL_AND_EXECUTION_AUTHORIZATION_REQUIRED';\nEND $review_only$;\n"
REPLACEMENTS = {
    'V4': [("IF absolute_seconds<>CASE WHEN risk='SENSITIVE' THEN identity_private.cfg('absolute_sensitive') ELSE identity_private.cfg('absolute_operational') END\n OR idle_seconds<>CASE WHEN risk='SENSITIVE' THEN 1800 ELSE 28800 END THEN", "IF absolute_seconds<>(CASE WHEN risk='SENSITIVE' THEN identity_private.cfg('absolute_sensitive') ELSE identity_private.cfg('absolute_operational') END)\n OR idle_seconds<>(CASE WHEN risk='SENSITIVE' THEN 1800 ELSE 28800 END) THEN")],
    'B1-X': [("OR m.state<>CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END", "OR m.state<>(CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END)")],
    'D1': [],
}

def hashes(raw):
    return {'gitBlob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(),
            'sha256': hashlib.sha256(raw).hexdigest()}

def validate_revision2(sql):
    definitions = re.findall(r'CREATE(?: OR REPLACE)? FUNCTION auth_api\.totp_material_locked\(', sql)
    corrected = "OR m.state<>(CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END)"
    if len(definitions) != 2 or sql.count(corrected) != 2 or 'OR m.state<>CASE' in sql:
        raise ValueError('Both TOTP material definitions must have their CASE operand parenthesized')

def generate(revision="01"):
    if revision not in ("01", "02", "03", "04", "05"):
        raise ValueError("Unsupported consolidated revision")
    sources, parts = [], []
    for name, path, expected in SOURCES:
        raw = (ROOT / path).read_bytes()
        digest = hashes(raw)
        if digest['gitBlob'] != expected:
            raise ValueError('Pinned source mismatch: ' + name)
        sources.append({'name': name, 'path': path, **digest})
        if name == 'D1-ACL':
            continue
        text = raw.decode()
        # Remove only documentary headers and exact outer transaction wrappers.
        header, text = text.split('BEGIN;\n', 1)
        if any(not line.startswith('--') and line.strip() for line in header.splitlines()):
            raise ValueError('Unexpected source header: ' + name)
        end = 'COMMIT;\n' if name == 'V4' else 'ROLLBACK;\n'
        if not text.endswith(end):
            raise ValueError('Unexpected transaction terminator: ' + name)
        text = text[:-len(end)]
        if name != 'V4':
            if text.count(GUARD) != 1:
                raise ValueError('Unexpected review guard: ' + name)
            text = text.replace(GUARD, '')
        corrections = list(REPLACEMENTS[name])
        if revision in ('02', '03', '04', '05') and name == 'D1':
            corrections.extend(REPLACEMENTS['B1-X'])
        if revision in ('03', '04', '05') and name == 'D1':
            corrections.append(("OR x.purpose IS DISTINCT FROM CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END", "OR x.purpose IS DISTINCT FROM (CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END)"))
        if revision == '04' and name == 'V4':
            grant = 'GRANT DELETE ON identity_private.security_log TO cleanops_auth_broker;'
            corrections.append((grant, grant + '\nGRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_auth_broker;'))
        if revision == '05' and name == 'V4':
            corrections.extend([('GRANT DELETE ON identity_private.security_log TO cleanops_auth_broker;', 'REVOKE DELETE ON identity_private.security_log FROM cleanops_auth_broker;'), ('DELETE FROM identity_private.security_log WHERE expires_at<=statement_timestamp();', 'PERFORM identity_private.purge_expired_security_log();')])
        for old, new in corrections:
            if text.count(old) != 1:
                raise ValueError('Unexpected correction site: ' + name)
            text = text.replace(old, new)
        text = text.replace('-- All statements below are a review artifact, unreachable in this transaction.\n', '')
        parts.append('-- BEGIN SOURCE ' + name + ' ' + expected + '\n' + text.rstrip() + '\n-- END SOURCE ' + name)
    sql = ('-- CleanOps 360: PROPOSED CANONICAL CONSOLIDATION, REVIEW ONLY. DO NOT EXECUTE.\n'
           '-- Fresh empty PostgreSQL 16 only AFTER separate owner approval of this exact hash.\n'
           '-- Not approved, not SQL-compiled, not a migration. B1/AUTH-GATE-05 OPEN; closedBackend.\n'
           'BEGIN;\n\n' + '\n\n'.join(parts) + '\n\nCOMMIT;\n')
    if revision in ('02', '03', '04', '05'):
        validate_revision2(sql)
    manifest = {
        'status': 'PROPOSED_CANONICAL_CONSOLIDATION_REVIEW_ONLY',
        'sourceHead': '994a9363d488ec4cc2fddd403ff368195b215067',
        'sources': sources, 'candidate': {'path': 'docs/proposals/b1-consolidated-sql/schema.review.sql', **hashes(sql.encode())},
        'transformations': [
            'V4: parenthesize exactly two issue_active_session CASE operands (PATCH-01 authorized/tested).',
            'B1-X: parenthesize exactly one totp_material_locked CASE operand (new REVIEW ONLY).',
            'B1-X/D1: remove exact unconditional REVIEW_ONLY guard; consolidate outer transaction wrappers.',
            'Replace V4 COMMIT and overlay ROLLBACK wrappers with one BEGIN/COMMIT across all three sources.',
            'Remove source header comments and the now-inaccurate unreachable-transaction comment only.',
        ],
        'acl': 'Exactly the combined V4/B1-X/D1 statements; no extra grants or role mapping.',
        'sqlCompiled': False, 'installationAuthorized': False, 'installed': False,
        'authGate05': 'OPEN', 'runtime': 'closedBackend',
    }
    if revision in ('02', '03', '04', '05'):
        manifest['revision'] = '02'
        manifest['sourceHead'] = 'b8a00e4e6d9f3906e8642bd7cc5ef21c573ede99'
        manifest['supersedes'] = {'gitBlob': '7507a29dc58c27fa4b9ab7f3b6dd628397485c9a', 'failedRun': 39036655470}
        manifest['candidate']['path'] = 'docs/proposals/b1-consolidated-sql/revisions/02/schema.review.sql'
        manifest['transformations'].append('D1 replacement of totp_material_locked: parenthesize the same CASE operand; both definitions regression-checked. No ACL/signature/predicate changes.')
    if revision in ('03', '04', '05'):
        manifest['revision'] = '03'
        manifest['sourceHead'] = 'c1f384def052458a623c90645967a164a2d76ed7'
        manifest['supersedes'] = {'gitBlob': 'd723ff9f615caafa701418dbaea60dec43479bba', 'failedRun': 39044517403}
        manifest['candidate']['path'] = 'docs/proposals/b1-consolidated-sql/revisions/03/schema.review.sql'
        manifest['transformations'].append('Parenthesize the D1 consume_email_otp IS DISTINCT FROM CASE operand; no signature, ACL or predicate changes.')
    if revision == '04':
        manifest['revision'] = '04'
        manifest['sourceHead'] = 'd84dd8b8d73ec9c6f9e066a08f6c54c4e35f17d5'
        manifest['supersedes'] = {'gitBlob': '7290c09ab32b74fecc4c39dc5d91a3bbc7f2723e', 'failedRun': 39046545296}
        manifest['candidate']['path'] = 'docs/proposals/b1-consolidated-sql/revisions/04/schema.review.sql'
        manifest['transformations'].append('Minimal broker SELECT(expires_at) on security_log for the existing DELETE expiration predicate; explicit ACL change, REVIEW ONLY.')
        manifest['acl'] = 'Combined V4/B1-X/D1 plus exactly broker SELECT(expires_at) on identity_private.security_log; owner approval required.'
    if revision == '05':
        boundary = (TARGET / 'revisions/05/purge-boundary.review.sql').read_text()
        sql = sql.removesuffix('COMMIT;\n') + boundary + '\nCOMMIT;\n'
        manifest['revision'] = '05'
        manifest['sourceHead'] = '97515fb26c4ccdd8593de1b090b24b771d7e4ecb'
        manifest['supersedes'] = {'gitBlob': 'f2c3c7c1f0859b9a6e0e2ed2c701f3c5d060774c', 'reason': 'PG04 conditional row-visibility gate failed before installation'}
        manifest['candidate'] = {'path': 'docs/proposals/b1-consolidated-sql/revisions/05/schema.review.sql', **hashes(sql.encode())}
        manifest['purgeBoundarySource'] = {'path': 'docs/proposals/b1-consolidated-sql/revisions/05/purge-boundary.review.sql', **hashes(boundary.encode())}
        manifest['transformations'].append('No PG04 broker SELECT. Revoke broker DELETE on security_log; replace existing GC DELETE with a void helper; dedicated NOLOGIN expiry-only RLS role, column ACL and private EXECUTE. REVIEW ONLY.')
        manifest['acl'] = 'Explicit restricted-purge replacement: new internal role/helper and two expiry RLS policies; broker INSERT retained, no broker SELECT/DELETE. Owner approval required.'
    return sql, json.dumps(manifest, indent=2) + '\n'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--revision', choices=['01', '02', '03', '04', '05'], default='01')
    args = parser.parse_args()
    sql, manifest = generate(args.revision)
    destination = TARGET if args.revision == '01' else TARGET / 'revisions' / args.revision
    expected = {'schema.review.sql': sql, 'manifest.json': manifest}
    if args.check:
        for path, content in expected.items():
            if (destination / path).read_bytes() != content.encode():
                raise ValueError('Stale consolidated proposal: ' + path)
        print('PASS: deterministic consolidation and four pinned sources; NO SQL executed')
    else:
        destination.mkdir(parents=True, exist_ok=True)
        for path, content in expected.items():
            (destination / path).write_bytes(content.encode())
        print('Generated REVIEW ONLY candidate; NO SQL executed')

if __name__ == '__main__':
    main()
