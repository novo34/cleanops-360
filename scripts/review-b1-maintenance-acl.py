#!/usr/bin/env python3
"""Review exact consolidated 04 ACL delta and inventory every final SQL definition."""
import argparse
import difflib
import importlib.util
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'docs/proposals/b1-consolidated-sql/revisions/04'
spec=importlib.util.spec_from_file_location('review',ROOT/'scripts/review-b1-consolidated.py')
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
PARENT={'gitBlob':'7290c09ab32b74fecc4c39dc5d91a3bbc7f2723e','sha256':'07e6637d1d39b50962bc2a034416f8e43bdbb0ec775234a20d12998bf58ec779'}
CANDIDATE={'gitBlob':'f2c3c7c1f0859b9a6e0e2ed2c701f3c5d060774c','sha256':'81538c713e7e031a5acdc0b374f36a55e34ded733d9d08c99bc363c606d61083'}
GRANT='GRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_auth_broker;'
ANCHOR='GRANT DELETE ON identity_private.security_log TO cleanops_auth_broker;'


def verify_delta(parent,candidate):
    if review.hashes(parent.encode())!=PARENT or review.hashes(candidate.encode())!=CANDIDATE:
        raise ValueError('Pinned parent/candidate mismatch')
    if parent.count(ANCHOR)!=1 or candidate!=parent.replace(ANCHOR,ANCHOR+'\n'+GRANT):
        raise ValueError('Unexpected SQL/ACL delta')
    a,b=review.statements(parent),review.statements(candidate)
    grant=review.statements(GRANT)[0]
    if len(b)!=len(a)+1 or b.count(grant)!=1:
        raise ValueError('Unexpected added statement count')
    b.remove(grant)
    if a!=b:
        raise ValueError('Function, role, policy or other contract statement changed')


def inventory(sql):
    final={}; declarations=0
    tables=set(re.findall(r'CREATE TABLE ((?:app|identity_private)\.[a-z_]+)',sql))
    for tokens in review.statements(sql):
        kind,name=review.classify(tokens)
        if kind!='function':continue
        declarations+=1
        body=next(t for t in tokens if re.match(r'^\$[A-Za-z_0-9]*\$',t))
        refs=set(re.findall(r'\b(?:app|identity_private|auth_api|crypto)\.[a-z_]+',body))
        final[name]={'name':name,'referencedRelations':sorted(refs&tables),'qualifiedReferences':sorted(refs)}
    if declarations!=73 or len(final)!=65:raise ValueError('Unexpected definition inventory')
    return {'declarations':declarations,'finalDefinitions':len(final),'functions':[final[k] for k in sorted(final)],
            'limitation':'Lexical qualified-reference inventory, not a catalog dependency planner or exhaustive runtime branch proof.'}


def build():
    review.build_revision2() # pin all canonical originals and historical transformations
    parent=(TARGET.parent/'03/schema.review.sql').read_text()
    candidate=(TARGET/'schema.review.sql').read_text()
    verify_delta(parent,candidate)
    report={'status':'REVIEW_ONLY_OWNER_APPROVAL_REQUIRED_NOT_INSTALLED','candidate':CANDIDATE,'parent':PARENT,
            'changedFunctionBodies':0,'signatureChanges':0,'aclChanges':1,'policyChanges':0,'schemaChanges':0,
            'newPrivilege':GRANT,'sqlCompiled':False,'installed':False,'runtime':'closedBackend','authGate05':'OPEN',
            'nativeFailure':{'run':39046545296,'function':'auth_api.gc_ephemeral()','sqlstate':'42501','table':'identity_private.security_log'},
            'securityImpact':'Existing NOLOGIN/NOBYPASSRLS broker can read expiration timestamps, solely the column referenced by its existing DELETE predicate. No service table grant, new membership, ownership, RLS or SECURITY DEFINER change.'}
    delta=''.join(difflib.unified_diff(parent.splitlines(True),candidate.splitlines(True),fromfile='CONSOLIDATED-03-AUTHORIZED',tofile='CONSOLIDATED-04-REVIEW-ONLY'))
    return {'static-review.json':json.dumps(report,indent=2)+'\n','APPROVED_TO_04.diff':delta,
            'dependency-inventory.json':json.dumps(inventory(candidate),indent=2)+'\n'}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for name,content in build().items():
        path=TARGET/name
        if args.check:
            if path.read_bytes()!=content.encode():raise ValueError('Stale maintenance ACL review')
        else:path.write_text(content)
    print('PASS: exact minimal ACL delta, all 73 declarations/65 final definitions inventoried; NO SQL executed')

if __name__=='__main__':main()
