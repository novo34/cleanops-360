#!/usr/bin/env python3
"""Exact REVIEW ONLY restricted-purge consolidation. No SQL execution."""
import argparse
import difflib
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'docs/proposals/b1-consolidated-sql/revisions/05'
spec=importlib.util.spec_from_file_location('previous_review',ROOT/'scripts/review-b1-maintenance-acl.py')
previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
review=previous.review
PIN={'gitBlob':'62cec23e534fe15888ddba98cf76add7e857cfef','sha256':'3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c'}
OLD='DELETE FROM identity_private.security_log WHERE expires_at<=statement_timestamp();'
NEW='PERFORM identity_private.purge_expired_security_log();'


def validate(candidate):
    previous.build() # pinned originals, parent 03 and exact 04 delta
    source=(TARGET.parent/'03/schema.review.sql').read_text()
    fragment=(TARGET/'purge-boundary.review.sql').read_text()
    expected=source.replace('GRANT DELETE ON identity_private.security_log TO cleanops_auth_broker;',
                            'REVOKE DELETE ON identity_private.security_log FROM cleanops_auth_broker;').replace(OLD,NEW)
    expected=expected.removesuffix('COMMIT;\n')+fragment+'\nCOMMIT;\n'
    if candidate!=expected or review.hashes(candidate.encode())!=PIN:
        raise ValueError('Unexpected restricted purge SQL/ACL change')
    old_functions={name:tokens for tokens in review.statements(source) for kind,name in [review.classify(tokens)] if kind=='function'}
    new_functions={name:tokens for tokens in review.statements(candidate) for kind,name in [review.classify(tokens)] if kind=='function'}
    if set(new_functions)-set(old_functions)!={'identity_private.purge_expired_security_log'}:
        raise ValueError('Unexpected new API')
    changed=[name for name,tokens in old_functions.items() if new_functions[name]!=tokens]
    if changed!=['auth_api.gc_ephemeral'] or old_functions[changed[0]][:-1]!=new_functions[changed[0]][:-1]:
        raise ValueError('Unexpected body/public signature change')
    return source


def build():
    sql=(TARGET/'schema.review.sql').read_text();source=validate(sql)
    parent=(TARGET.parent/'04/schema.review.sql').read_text()
    report={'status':'REVIEW_ONLY_NOT_APPROVED_NOT_INSTALLED','candidate':PIN,'parent':previous.CANDIDATE,
            'baselineNativeTested03':previous.PARENT,'changedExistingBodies':['auth_api.gc_ephemeral()'],
            'publicSignatureChanges':0,'newInternalSignature':'identity_private.purge_expired_security_log() RETURNS void',
            'newRole':'cleanops_security_log_purger','newExpiryOnlyPolicies':2,
            'brokerLogPrivileges':['INSERT'],'purgerLogPrivileges':['DELETE','SELECT(expires_at)'],
            'helperExecuteGrantees':['cleanops_auth_broker'],'roleMembershipsAdded':[],
            'limits':'Static exact-diff verification, not native PG16 compilation, privileges or RLS proof.',
            'postgresInstalled':False,'runtime':'closedBackend','authGate05':'OPEN'}
    return {'static-review.json':json.dumps(report,indent=2)+'\n',
            'PARENT_04_TO_05.diff':''.join(difflib.unified_diff(parent.splitlines(True),sql.splitlines(True),fromfile='CONSOLIDATED-04-NOT-INSTALLED',tofile='CONSOLIDATED-05-REVIEW-ONLY')),
            'NATIVE_03_TO_05.diff':''.join(difflib.unified_diff(source.splitlines(True),sql.splitlines(True),fromfile='CONSOLIDATED-03-NATIVE-TESTED',tofile='CONSOLIDATED-05-REVIEW-ONLY'))}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for name,content in build().items():
        path=TARGET/name
        if args.check:
            if path.read_bytes()!=content.encode():raise ValueError('Stale restricted-purge review')
        else:path.write_text(content)
    print('PASS: exact restricted-purge delta, no public API change; NO SQL executed')

if __name__=='__main__':main()
