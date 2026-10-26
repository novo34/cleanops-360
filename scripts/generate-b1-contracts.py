"""Reproduce derived JSON, never edit the original V4 YAML. Requires PyYAML."""
from pathlib import Path
import argparse
import hashlib
import json
import yaml

root = Path(__file__).resolve().parent.parent
source = root / 'docs/canonical/auth-review/v4'
target = root / 'lib/b1'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
expected = {}
for name, output in [('block-1.openapi.yaml', 'openapi.json'), ('security-values.yaml', 'security-values.json')]:
    raw = (source / name).read_bytes()
    content = json.dumps(yaml.safe_load(raw), ensure_ascii=False, indent=2) + '\n'
    expected[target / output] = content
provenance = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in ['block-1.openapi.yaml', 'security-values.yaml']}
expected[target / 'provenance.json'] = json.dumps(provenance, indent=2) + '\n'
for path, content in expected.items():
    if args.check:
        if path.read_text() != content:
            raise SystemExit(f'Derived contract differs: {path.relative_to(root)}')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
print('PASS: all derived B1 JSON matches published V4 YAML')
