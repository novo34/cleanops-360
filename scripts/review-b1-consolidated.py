#!/usr/bin/env python3
"""Reproducible lexical contract/diff review. Does not parse, compile or execute SQL."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'docs/proposals/b1-consolidated-sql'
CANDIDATE_SHA256 = '42169677305df68612d44a6c0f0a4b4bafe1ec142d041e9a9a0e426d84e97863'
CANDIDATE_BLOB = '7507a29dc58c27fa4b9ab7f3b6dd628397485c9a'
GUARD = "DO $review_only$ BEGIN\n RAISE EXCEPTION 'REVIEW_ONLY_OWNER_APPROVAL_AND_EXECUTION_AUTHORIZATION_REQUIRED';\nEND $review_only$;\n"

def hashes(raw):
    return {'sha256': hashlib.sha256(raw).hexdigest(),
            'gitBlob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()}

def statements(text):
    """Lexical tokens: quoted/dollar bodies are exact tokens; comments/outer space ignored."""
    result, tokens, i = [], [], 0
    while i < len(text):
        if text[i].isspace():
            i += 1
        elif text.startswith('--', i):
            end = text.find('\n', i)
            i = len(text) if end < 0 else end + 1
        elif text.startswith('/*', i):
            depth, i = 1, i + 2
            while depth and i < len(text):
                if text.startswith('/*', i):
                    depth, i = depth + 1, i + 2
                elif text.startswith('*/', i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
            if depth:
                raise ValueError('Unterminated block comment')
        elif text[i] in "'\"":
            quote, start, i = text[i], i, i + 1
            while i < len(text):
                if text[i] == quote:
                    if i + 1 < len(text) and text[i + 1] == quote:
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            else:
                raise ValueError('Unterminated quoted token')
            tokens.append(text[start:i])
        elif match := re.match(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$', text[i:]):
            tag = match.group()
            end = text.find(tag, i + len(tag))
            if end < 0:
                raise ValueError('Unterminated dollar body')
            tokens.append(text[i:end + len(tag)])
            i = end + len(tag)
        elif text[i] == ';':
            if tokens:
                result.append(tokens)
            tokens, i = [], i + 1
        else:
            match = re.match(r'[A-Za-z_0-9]+', text[i:])
            token = match.group() if match else text[i]
            tokens.append(token)
            i += len(token)
    if tokens:
        raise ValueError('Unterminated top-level statement')
    return result

def classify(tokens):
    upper = [token.upper() for token in tokens[:5]]
    if upper[:2] == ['CREATE', 'FUNCTION'] or upper[:4] == ['CREATE','OR','REPLACE','FUNCTION']:
        index = 2 if upper[1] == 'FUNCTION' else 4
        return 'function', ''.join(tokens[index:index + 3])
    if upper[0] in ('GRANT','REVOKE'):
        return 'acl', ' '.join(tokens)
    if upper[:2] == ['CREATE','ROLE']:
        return 'role', tokens[2]
    return 'other', None

def build(root=ROOT):
    manifest = json.loads((root / 'docs/proposals/b1-consolidated-sql/manifest.json').read_text())
    candidate = (root / manifest['candidate']['path']).read_bytes()
    digest = hashes(candidate)
    if digest != {'sha256': CANDIDATE_SHA256, 'gitBlob': CANDIDATE_BLOB}:
        raise ValueError('Reviewed consolidated candidate hash mismatch')
    original_bundle, expected, inventory = [], [], []
    for source in manifest['sources']:
        raw = (root / source['path']).read_bytes()
        if hashes(raw) != {key: source[key] for key in ('sha256','gitBlob')}:
            raise ValueError('Pinned original source mismatch: ' + source['name'])
        if source['name'] == 'D1-ACL':
            continue
        text = raw.decode()
        original_bundle.append(text)
        if source['name'] == 'V4':
            old = "IF absolute_seconds<>CASE WHEN risk='SENSITIVE' THEN identity_private.cfg('absolute_sensitive') ELSE identity_private.cfg('absolute_operational') END\n OR idle_seconds<>CASE WHEN risk='SENSITIVE' THEN 1800 ELSE 28800 END THEN"
            new = "IF absolute_seconds<>(CASE WHEN risk='SENSITIVE' THEN identity_private.cfg('absolute_sensitive') ELSE identity_private.cfg('absolute_operational') END)\n OR idle_seconds<>(CASE WHEN risk='SENSITIVE' THEN 1800 ELSE 28800 END) THEN"
            if text.count(old) != 1:
                raise ValueError('Unexpected V4 correction site')
            text = text.replace(old, new)
        else:
            if text.count(GUARD) != 1:
                raise ValueError('Unexpected overlay stop guard')
            text = text.replace(GUARD, '')
            if source['name'] == 'B1-X':
                old = "OR m.state<>CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END"
                if text.count(old) != 1:
                    raise ValueError('Unexpected B1-X correction site')
                text = text.replace(old, "OR m.state<>(CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END)")
        items = statements(text)
        if items[0] != ['BEGIN'] or items[-1] != (['COMMIT'] if source['name'] == 'V4' else ['ROLLBACK']):
            raise ValueError('Unexpected source transaction boundary')
        expected.extend(items[1:-1])
        for item in items[1:-1]:
            kind, value = classify(item)
            if kind != 'other':
                entry = {'source': source['name'], 'kind': kind, 'value': value}
                if kind == 'function':
                    body_index = next(i for i, token in enumerate(item) if token.startswith('$'))
                    entry['definitionHeader'] = ' '.join(item[:body_index])
                    entry['bodySha256'] = hashlib.sha256(item[body_index].encode()).hexdigest()
                inventory.append(entry)
    actual = statements(candidate.decode())
    if actual[0] != ['BEGIN'] or actual[-1] != ['COMMIT']:
        raise ValueError('Consolidation requires one outer BEGIN/COMMIT')
    if actual[1:-1] != expected:
        raise ValueError('Unapproved body/signature/DDL/ACL/statement-order delta')
    diff = ''.join(difflib.unified_diff(''.join(original_bundle).splitlines(keepends=True),
                                     candidate.decode().splitlines(keepends=True),
                                     fromfile='originals/V4+B1-X+D1.raw.sql',
                                     tofile='proposal/schema.review.sql', n=4))
    report = {
        'status': 'STATIC_CONTRACT_REVIEW_ONLY', 'referenceHead': '8026e989a2a76d9dec107700f710c415c1c6b994',
        'candidate': digest, 'sources': manifest['sources'], 'diffSha256': hashes(diff.encode())['sha256'],
        'statementOrderAndTokensPreservedExceptDeclaredChanges': True,
        'statementCount': len(expected),
        'functionDeclarations': len([item for item in inventory if item['kind'] == 'function']),
        'distinctFunctionNames': len({item['value'] for item in inventory if item['kind'] == 'function'}),
        'aclStatements': len([item for item in inventory if item['kind'] == 'acl']),
        'roleDeclarations': [item['value'] for item in inventory if item['kind'] == 'role'],
        'inventory': inventory, 'sqlCompiled': False, 'installed': False, 'installationAuthorized': False,
        'limits': 'Lexical source equivalence only; not a PostgreSQL parser, compilation, ACL runtime proof or B1 acceptance.',
        'authGate05': 'OPEN', 'runtime': 'closedBackend',
    }
    return {'FULL.diff': diff, 'static-review.json': json.dumps(report, indent=2) + '\n'}

def build_revision2(root=ROOT):
    # First revalidate the exact approved parent and all original source contracts.
    build(root)
    parent_path = root / 'docs/proposals/b1-consolidated-sql/schema.review.sql'
    directory = root / 'docs/proposals/b1-consolidated-sql/revisions/02'
    manifest = json.loads((directory / 'manifest.json').read_text())
    parent, raw = parent_path.read_bytes(), (directory / 'schema.review.sql').read_bytes()
    old = "OR m.state<>CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END"
    new = "OR m.state<>(CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END)"
    if parent.decode().count(old) != 1 or raw.decode() != parent.decode().replace(old, new):
        raise ValueError('Revision 02 may change only the missed D1 CASE operand')
    if hashes(raw) != {key: manifest['candidate'][key] for key in ('sha256','gitBlob')}:
        raise ValueError('Revision 02 manifest hash mismatch')
    before, after = statements(parent.decode()), statements(raw.decode())
    changed = [i for i, (a,b) in enumerate(zip(before, after)) if a != b]
    if len(before) != len(after) or len(changed) != 1:
        raise ValueError('Unexpected consolidated statement delta')
    index = changed[0]
    if classify(after[index]) != ('function', 'auth_api.totp_material_locked'):
        raise ValueError('Unexpected revised function')
    if before[index][:-1] != after[index][:-1]:
        raise ValueError('Function header/signature changed')
    acl_before = [item for item in before if classify(item)[0] == 'acl']
    acl_after = [item for item in after if classify(item)[0] == 'acl']
    if acl_before != acl_after:
        raise ValueError('ACL delta forbidden in revision 02')
    delta = ''.join(difflib.unified_diff(parent.decode().splitlines(keepends=True), raw.decode().splitlines(keepends=True), fromfile='approved/7507a29.sql', tofile='review-only/revision-02.sql', n=6))
    originals = ''.join((root / source['path']).read_text() for source in manifest['sources'] if source['name'] != 'D1-ACL')
    full = ''.join(difflib.unified_diff(originals.splitlines(keepends=True), raw.decode().splitlines(keepends=True), fromfile='originals/V4+B1-X+D1.raw.sql', tofile='review-only/revision-02.sql', n=4))
    report = {'status':'REVIEW_ONLY_NOT_AUTHORIZED_NOT_INSTALLED', 'candidate':manifest['candidate'],
              'approvedParent':hashes(parent),'changedFunction':'auth_api.totp_material_locked(text,uuid,text)',
              'changedStatements':1,'signatureChanges':0,'aclChanges':0,'predicatePolicyChanges':0,
              'correction':'Parenthesize exactly the D1 replacement CASE operand; both definitions covered by generator regression.',
              'deltaSha256':hashes(delta.encode())['sha256'],'fullDiffSha256':hashes(full.encode())['sha256'],
              'sqlCompiled':False,'installed':False,'authGate05':'OPEN','runtime':'closedBackend'}
    return {'APPROVED_TO_02.diff':delta,'FULL_SOURCE.diff':full,'static-review.json':json.dumps(report,indent=2)+'\n'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--revision', choices=['01','02'], default='01')
    args = parser.parse_args()
    artifacts = build() if args.revision == '01' else build_revision2()
    directory = TARGET if args.revision == '01' else TARGET / 'revisions' / '02'
    for name, content in artifacts.items():
        target = directory / name
        if args.check:
            if target.read_bytes() != content.encode():
                raise ValueError('Stale review artifact: ' + name)
        else:
            target.write_bytes(content.encode())
    print('PASS: full diff, tokens/order and source hashes checked; NO SQL parsed/compiled/executed')

if __name__ == '__main__':
    main()
