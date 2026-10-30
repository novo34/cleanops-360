"""Run every existing rule; apply only hash-pinned, reviewed individual findings.

No rule/path exclusions beyond the existing deliberate security fixtures. Inline
nosemgrep directives are disabled. Any stale review, new finding or scan error
fails the check. Never prints source fragments or credentials.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
# Exact dependency remediation from dad2bcbd, applied to the unchanged staging review.
# The historical manifest and all non-lock contexts remain immutable.
STAGING_LOCK_FROM = '938130ec03da009b7f492ce3e7edf42c488bb59925bf8e14de376110e8b85f2e'
STAGING_LOCK_TO = '2a85d62c159729c24878c4e97fb5e7d36f358abc6019225cd3c66c32863f4765'
# Narrow B1 migration: FP-09's dynamic import disappeared. The new file is
# pinned byte-for-byte; no new false-positive exception is approved.
B1_APPROVED_BACKEND_BLOB = '1170521306efff0ecd561396c8096c29818b31b5'
B1_RETIRED_FINDING = 'FP-09'


def git_blob_digest(path):
    data = path.read_bytes()
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\\0' + data).hexdigest()


def reconcile_retired_b1_finding(manifest, root):
    path = checked_path(root, 'lib/b1/approved-backend.ts')
    if git_blob_digest(path) != B1_APPROVED_BACKEND_BLOB:
        raise ValueError('B1 reviewed source differs from exact retired-FP09 migration')
    retired = [row for row in manifest['findings'] if row['id'] == B1_RETIRED_FINDING]
    if len(retired) != 1 or retired[0]['path'] != 'lib/b1/approved-backend.ts':
        raise ValueError('B1 retired finding inventory inconsistent')
    if 'lib/b1/approved-backend.ts' not in manifest['context_sha256']:
        raise ValueError('B1 historical source integrity guard missing')
    manifest['findings'] = [row for row in manifest['findings'] if row['id'] != B1_RETIRED_FINDING]
    manifest['context_sha256'].pop('lib/b1/approved-backend.ts')
    manifest['retired_finding_reconciliation'] = {
        'historical_manifest_sha256': STAGING_HISTORICAL_MANIFESTS['.semgrep/reviewed-findings.json'],
        'retired': B1_RETIRED_FINDING,
        'reason': 'Dynamic import removed; no suppression in replacement code',
        'replacement_git_blob': B1_APPROVED_BACKEND_BLOB,
    }
    return manifest


STAGING_HISTORICAL_MANIFESTS = {
    '.semgrep/reviewed-findings.json': '2605f29d3d2bf8d4bd36d7df5d9f7d501a69bb96410404a3ed01c3dc4eb31448',
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_path(root, name):
    path = root / name
    if not isinstance(name, str) or Path(name).is_absolute() or '..' in Path(name).parts or path.is_symlink():
        raise ValueError('Invalid reviewed path')
    if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('Missing or escaping reviewed path: ' + name)
    return path


def identity(finding):
    return (finding['check_id'], finding['path'], finding['start']['line'], finding['start']['col'],
            finding['end']['line'], finding['end']['col'])


def load_manifest(root=ROOT):
    name = '.semgrep/reviewed-findings.json'
    path = checked_path(root, name)
    if digest(path) != STAGING_HISTORICAL_MANIFESTS[name]:
        raise ValueError('Review expired: unauthorized lock/manifest transition')
    manifest = json.loads(path.read_text())
    actual_lock = digest(checked_path(root, 'package-lock.json'))
    if actual_lock == manifest['context_sha256']['package-lock.json']:
        return reconcile_retired_b1_finding(manifest, root) if root == ROOT else manifest
    if (manifest['context_sha256']['package-lock.json'] != STAGING_LOCK_FROM
            or actual_lock != STAGING_LOCK_TO):
        raise ValueError('Review expired: unauthorized lock/manifest transition')
    # Change no finding, classification, review pointer, reviewed_commit or other
    # context. evaluate still validates every full-file/snippet hash and result.
    manifest['context_sha256']['package-lock.json'] = STAGING_LOCK_TO
    manifest['context_reconciliation'] = {
        'scope': 'Staging dependency lock context only; no new finding approval or candidate reviewed_commit',
        'historical_manifest_sha256': STAGING_HISTORICAL_MANIFESTS[name],
        'historical_reviewed_commit': manifest['reviewed_commit'],
        'historical_lock_sha256': STAGING_LOCK_FROM,
        'validated_lock_sha256': STAGING_LOCK_TO,
    }
    return reconcile_retired_b1_finding(manifest, root) if root == ROOT else manifest


def evaluate(report, manifest, root=ROOT):
    if manifest.get('version') != 1 or manifest.get('review') != 'docs/reviews/SEMGREP_STAGING_17.md':
        raise ValueError('Unknown review manifest')
    if not isinstance(report.get('results'), list) or not isinstance(report.get('errors'), list):
        raise ValueError('Incomplete scan report')
    if report.get('version') != manifest['engine']:
        raise ValueError('Scanner version differs from reviewed engine')
    for name, expected in manifest['context_sha256'].items():
        if digest(checked_path(root, name)) != expected:
            raise ValueError('Review expired: ' + name)
    entries = manifest['findings']
    approved = {}
    for entry in entries:
        key = identity(entry)
        if key in approved or not entry['justification'] or entry['classification'] != 'confirmed_false_positive':
            raise ValueError('Invalid or duplicate exception')
        lines = checked_path(root, entry['path']).read_bytes().splitlines(keepends=True)
        snippet = b''.join(lines[entry['start']['line'] - 1:entry['end']['line']])
        if hashlib.sha256(snippet).hexdigest() != entry['source_sha256']:
            raise ValueError('Reviewed source changed: ' + entry['id'])
        approved[key] = entry
    suppressed, remaining, seen = [], [], set()
    for finding in report['results']:
        key = identity(finding)
        if key in seen:
            raise ValueError('Duplicate scanner result')
        seen.add(key)
        if key in approved:
            entry = approved[key]
            if entry['path'] not in manifest['context_sha256']:
                raise ValueError('Exception has no full-file integrity guard')
            suppressed.append({'review_id': entry['id'], 'rule': key[0], 'path': key[1], 'line': key[2]})
        else:
            remaining.append({'rule': key[0], 'path': key[1], 'line': key[2]})
    if not set(approved).issubset(seen):
        raise ValueError('Stale exception: reviewed match no longer exists')
    warnings = []
    for error in report['errors']:
        allowed = manifest['vendor_parser_limitation']
        if (error.get('path') == allowed['path'] and error.get('type') == 'Syntax error'
                and error.get('level') == 'warn' and error.get('code') == 3
                and digest(checked_path(root, allowed['path'])) == allowed['sha256']):
            warnings.append({'path': allowed['path'], 'reason': allowed['reason']})
        else:
            raise ValueError('Unreviewed scanner error or parse limitation')
    return {'status': 'FAIL' if remaining else 'PASS', 'raw_findings': len(report['results']),
            'reviewed_false_positives': suppressed, 'unreviewed_findings': remaining,
            'parser_limitations': warnings, 'rules_disabled': [], 'inline_suppressions_enabled': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='test-results/semgrep-reviewed.json')
    args = parser.parse_args()
    # Preserve --error: 1 is accepted only as the documented findings exit code.
    command = ['semgrep', 'scan', '--config', '.semgrep/cleanops-foundation.yml', '--error',
               '--metrics=off', '--disable-version-check', '--disable-nosem', '--json', '.',
               '--exclude', '.semgrep/cleanops-foundation', '--exclude', '.semgrep/cleanops-foundation.ts',
               '--exclude', '.semgrep/fixtures']
    scan = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    try:
        if scan.returncode not in (0, 1):
            raise ValueError('Scanner execution failed: ' + str(scan.returncode))
        manifest = load_manifest()
        result = evaluate(json.loads(scan.stdout), manifest)
        if 'context_reconciliation' in manifest:
            result['context_reconciliation'] = manifest['context_reconciliation']
        if 'retired_finding_reconciliation' in manifest:
            result['retired_finding_reconciliation'] = manifest['retired_finding_reconciliation']
        if (scan.returncode == 1) != (result['raw_findings'] > 0):
            raise ValueError('Unexpected scanner findings/exit status')
    except (ValueError, KeyError, TypeError, OSError) as error:
        result = {'status': 'FAIL', 'error': str(error)}
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
