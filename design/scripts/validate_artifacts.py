"""Validate deliverable links, formats and scope; does not run product or B1 tests."""
import json,re,tomllib,hashlib,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2];base='646c9af496b2497a542ab58d96ae1e7b17b1ee81'
checks=[]
for p in (root/'design').rglob('*.json'):
 if '.runtime' not in p.parts:json.loads(p.read_text())
checks.append('All committed-design JSON parses')
tomllib.loads((root/'.codex/config.toml').read_text());checks.append('Project MCP TOML parses')
missing=[]
for p in (root/'design').glob('*.md'):
 for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if not re.match(r'https?://|#',link) and not (p.parent/link.split('#')[0]).exists():missing.append(str(p.relative_to(root))+': '+link)
assert not missing,missing;checks.append('All design Markdown local links resolve')
for p in (root/'design/studies').glob('*.html'):
 for link in re.findall(r'(?:href|src)="([^"]+)"',p.read_text()):
  assert (p.parent/link).exists(),(p,link)
checks.append('All standalone study local links resolve')
expected={'emil-design-eng','cleanops-impeccable','cleanops-taste','cleanops-design'}
for name in expected:
 p=root/'.agents/skills'/name/'SKILL.md';s=p.read_text()
 assert s.startswith('---\n') and 'name: '+name in s and 'description:' in s and 'disable-model-invocation: true' in s
 if name!='cleanops-design':assert (p.parent/'LICENSE').exists()
checks.append('Skill manifests and third-party licenses present (not runtime discovery)')
changed=subprocess.check_output(['git','diff','--name-only',base,'--'],cwd=root,text=True).splitlines()
assert all(p.startswith(('.agents/skills/','.codex/','design/')) for p in changed),changed
assert not subprocess.check_output(['git','diff',base,'--','app','components','lib','db','deploy','.github','AGENTS.md','package.json','package-lock.json'],cwd=root,text=True)
checks.append('No product/B1/API/DB/deploy/CI/root instructions/dependency changes')
manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'.agents/skills').rglob('*') if p.is_file()}
(root/'design/evidence/skill-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
result={'checks':checks,'discovery':'PENDING; see codex-skills.json','base':base}
(root/'design/evidence/static-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
