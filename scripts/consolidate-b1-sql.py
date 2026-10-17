#!/usr/bin/env python3
"""Generate/check a REVIEW ONLY fresh-install proposal. Never connects to a DB."""
import argparse
import hashlib
import json
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

def generate():
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
        for old, new in REPLACEMENTS[name]:
            if text.count(old) != 1:
                raise ValueError('Unexpected correction site: ' + name)
            text = text.replace(old, new)
        text = text.replace('-- All statements below are a review artifact, unreachable in this transaction.\n', '')
        parts.append('-- BEGIN SOURCE ' + name + ' ' + expected + '\n' + text.rstrip() + '\n-- END SOURCE ' + name)
    sql = ('-- CleanOps 360: PROPOSED CANONICAL CONSOLIDATION, REVIEW ONLY. DO NOT EXECUTE.\n'
           '-- Fresh empty PostgreSQL 16 only AFTER separate owner approval of this exact hash.\n'
           '-- Not approved, not SQL-compiled, not a migration. B1/AUTH-GATE-05 OPEN; closedBackend.\n'
           'BEGIN;\n\n' + '\n\n'.join(parts) + '\n\nCOMMIT;\n')
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
    return sql, json.dumps(manifest, indent=2) + '\n'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    sql, manifest = generate()
    expected = {'schema.review.sql': sql, 'manifest.json': manifest}
    if args.check:
        for path, content in expected.items():
            if (TARGET / path).read_bytes() != content.encode():
                raise ValueError('Stale consolidated proposal: ' + path)
        print('PASS: deterministic consolidation and four pinned sources; NO SQL executed')
    else:
        TARGET.mkdir(parents=True, exist_ok=True)
        for path, content in expected.items():
            (TARGET / path).write_bytes(content.encode())
        print('Generated REVIEW ONLY candidate; NO SQL executed')

if __name__ == '__main__':
    main()
