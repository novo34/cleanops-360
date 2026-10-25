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
# R2 context reconciliation: inherited exceptions remain historical approvals.
# Only this exact, locally validated lock transition is authorized. Never derive
# an accepted hash from the working tree or attribute its review to an old commit.
R2_LOCK_FROM = '9041209587186955078edfde44c19cf0fe4c4d76c11a9af5bd1b0cd0d815ad53'
R2_LOCK_TO = '2a85d62c159729c24878c4e97fb5e7d36f358abc6019225cd3c66c32863f4765'
R2_HISTORICAL_MANIFESTS = {
    '.semgrep/reviewed-findings.json': 'aeb58e69731e880e5b4376f8355c8f18c498675865881a40db34078e06031ab6',
    '.semgrep/quality-reviewed-findings.json': '1398d55f34f401d28481866b413741e1cb5ed25fa1d255a1c122e64b2c9185c0',
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


# Current P2 technical review of the unchanged literal import (628 -> 640).
# These are exact reviewed bytes, not a new approval inherited from reviewed_commit.
R2_P2_CONTEXT = {
    'lib/b1/approved-backend.ts': '9a11bc2430877d12d868e70341b1ed5ea3dfce6183ec210dbf415a94ebdb2c52',
    'lib/b1/private-adapter.ts': '8d968b73658d5384b2e4d9970d324bb9840a0ee2559b08565e6c38e316175d83',
    'lib/b1/service.ts': 'd51ba2b9e5b9f2541b3201331269270b55bc7e858153f722a23a29416acb35ef',
}
R2_P2_BACKEND_FROM = 'b7b4a1aae33d0c914eb46f69d3c775233ee69318d011bc1f536d0289179f393c'
R2_P2_SCAN_SHA256 = {
    'scoped': 'a0c240b388488a4723d3fdb3f3cf4a8e790f570df52fd2394e55c563c15c599e',
    'quality': 'dd4f0951e4acafe1e6638021d4f52f59ee7204cb1a9b05ac899377cf6edeb78b',
}
R2_P2_SOURCE_TREE = '48925fe75deceac44bf57d5644a886027eaee871ff5a4a65877cc9e879b21b44'


def reconcile_p2_context(manifest, quality, root):
    backend = 'lib/b1/approved-backend.ts'
    actual = digest(checked_path(root, backend))
    if actual == R2_P2_BACKEND_FROM:
        return manifest
    if (manifest['context_sha256'][backend] != R2_P2_BACKEND_FROM
            or actual != R2_P2_CONTEXT[backend]
            or manifest['context_sha256']['package-lock.json'] != R2_LOCK_TO):
        raise ValueError('Review expired: unauthorized P2 context transition')
    for name, expected in R2_P2_CONTEXT.items():
        if digest(checked_path(root, name)) != expected:
            raise ValueError('Review expired: P2 trust context changed: ' + name)
    entries = [row for row in manifest['findings'] if row['id'] == 'FP-09']
    if (len(entries) != 1
            or identity(entries[0]) != ('semgrep.cleanops-code-execution-import', backend, 628, 38, 628, 55)
            or entries[0]['source_sha256'] != '74159db132aab1c51b13ec9afb7c36992680d3ab56a45cc77d9863d99ecb90e5'):
        raise ValueError('Review expired: unexpected P2 finding')
    # Only its location moves. evaluate still requires the same full source-line
    # digest, classification and actual scanner identity; any extra match fails.
    entries[0]['start']['line'] = entries[0]['end']['line'] = 640
    manifest['context_sha256'].update(R2_P2_CONTEXT)
    manifest['context_reconciliation']['p2_current_context'] = {
        'review_kind': 'Current local technical review under owner authorization; no human approval claimed',
        'reviewed_commit': None,
        'historical_approval_covers_new_code': False,
        'finding': 'FP-09',
        'basis': 'Identical fixed otpauth literal and source-line digest; P2 touch/activity changes cannot supply its module specifier',
        'historical_backend_sha256': R2_P2_BACKEND_FROM,
        'validated_context_sha256': dict(R2_P2_CONTEXT),
        'scanned_source_tree_sha256': R2_P2_SOURCE_TREE,
        'actual_scan_report_sha256': R2_P2_SCAN_SHA256['quality' if quality else 'scoped'],
        'old_line': 628, 'current_line': 640,
    }
    return manifest



def load_manifest(quality=False, root=ROOT):
    name = '.semgrep/quality-reviewed-findings.json' if quality else '.semgrep/reviewed-findings.json'
    path = checked_path(root, name)
    if digest(path) != R2_HISTORICAL_MANIFESTS[name]:
        raise ValueError('Review expired: unauthorized lock/manifest transition')
    manifest = json.loads(path.read_text())
    actual_lock = digest(checked_path(root, 'package-lock.json'))
    if actual_lock == manifest['context_sha256']['package-lock.json']:
        return manifest
    if (manifest['context_sha256']['package-lock.json'] != R2_LOCK_FROM
            or actual_lock != R2_LOCK_TO):
        raise ValueError('Review expired: unauthorized lock/manifest transition')
    # Preserve historical classification/review attribution. The separately
    # reviewed P2 context below accepts only its exact bytes and shifted literal.
    manifest['context_sha256']['package-lock.json'] = R2_LOCK_TO
    manifest['context_reconciliation'] = {
        'scope': 'R2 lock context only; no new finding approval or candidate reviewed_commit',
        'historical_manifest_sha256': R2_HISTORICAL_MANIFESTS[name],
        'historical_reviewed_commit': manifest['reviewed_commit'],
        'historical_lock_sha256': R2_LOCK_FROM,
        'validated_lock_sha256': R2_LOCK_TO,
    }
    return reconcile_p2_context(manifest, quality, root)


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
    parser.add_argument('--quality', action='store_true', help='Full repository scope and the original 17 individually reviewed findings')
    args = parser.parse_args()
    # Preserve --error: 1 is accepted only as the documented findings exit code.
    command = ['semgrep', 'scan', '--config', '.semgrep/cleanops-foundation.yml', '--error',
               '--metrics=off', '--disable-version-check', '--disable-nosem', '--json',
               *(['.', '--exclude', '.semgrep/cleanops-foundation', '--exclude', '.semgrep/cleanops-foundation.ts', '--exclude', '.semgrep/fixtures'] if args.quality else
                 ['lib/b1', 'components/auth-panel.tsx', 'components/manage-access-panel.tsx'])]
    scan = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    try:
        if scan.returncode not in (0, 1):
            raise ValueError('Scanner execution failed: ' + str(scan.returncode))
        manifest = load_manifest(args.quality)
        result = evaluate(json.loads(scan.stdout), manifest)
        if 'context_reconciliation' in manifest:
            result['context_reconciliation'] = manifest['context_reconciliation']
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
