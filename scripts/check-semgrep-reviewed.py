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
MANIFEST = ROOT / '.semgrep/reviewed-findings.json'


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
               '--metrics=off', '--disable-version-check', '--disable-nosem', '--json',
               'lib/b1', 'components/auth-panel.tsx', 'components/manage-access-panel.tsx']
    scan = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    try:
        if scan.returncode not in (0, 1):
            raise ValueError('Scanner execution failed: ' + str(scan.returncode))
        result = evaluate(json.loads(scan.stdout), json.loads(MANIFEST.read_text()))
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
