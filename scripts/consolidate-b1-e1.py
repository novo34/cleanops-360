#!/usr/bin/env python3
"""Generate one REVIEW ONLY E1 fresh-install SQL/ACL candidate; never executes SQL."""
import argparse
import difflib
import hashlib
import json
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/proposals/b1-consolidated-sql/revisions/06'
BASE = ROOT / 'docs/proposals/b1-consolidated-sql/revisions/05/schema.review.sql'
def hashes(raw):
    return {'gitBlob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
def generate(revision="06"):
    if revision not in ("06","07"):raise ValueError("Unsupported E1 revision")
    raw=BASE.read_bytes()
    if hashes(raw)['gitBlob']!='62cec23e534fe15888ddba98cf76add7e857cfef' or hashes(raw)['sha256']!='3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c':
        raise ValueError('Approved05 source mismatch')
    base=raw.decode();source=(DEST.with_name(revision)/'e1-source.review.sql').read_text();sql=base
    if revision=='07':
        approved=generate('06')['schema.review.sql'].encode()
        if hashes(approved)['gitBlob']!='939a521911e34296e055eb05c57264cbeee6d785' or hashes(approved)['sha256']!='aade4ed7aeb065899c086f0ee02e11aef024d2cb84f2d9e4a13155a273ab0962':raise ValueError('Approved06 mismatch')
        # Fix the lifecycle implementation at generation, never execute repair SQL.
        old=" UPDATE app.auth_outbox SET payload_ciphertext=decode('','hex'),state='CANCELLED',lease_until=NULL,claim_digest=NULL WHERE expires_at<=statement_timestamp() AND state NOT IN('SENT','CANCELLED');"
        new=" UPDATE app.auth_outbox SET state='QUARANTINED',lease_until=NULL,claim_digest=NULL WHERE state IN('CLAIMED','DISPATCHING') AND (expires_at<=clock_timestamp() OR lease_until<=clock_timestamp());\n UPDATE app.auth_outbox SET payload_ciphertext=decode('','hex'),state='CANCELLED',lease_until=NULL,claim_digest=NULL WHERE expires_at<=statement_timestamp() AND state NOT IN('SENT','CANCELLED','QUARANTINED');"
        assert sql.count(old)==1;sql=sql.replace(old,new)
        old="UPDATE app.mfa_methods SET state='REVOKED',secret_ciphertext=decode('','hex'),key_version='PURGED'"
        new="UPDATE app.mfa_methods SET state='REVOKED',secret_ciphertext=CASE WHEN kind='TOTP' THEN decode('','hex') ELSE NULL END,key_version=CASE WHEN kind='TOTP' THEN 'PURGED' ELSE NULL END"
        assert sql.count(old)==1;sql=sql.replace(old,new)
        # Session PKs are never changed. NO KEY UPDATE still excludes writes/deletes,
        # but permits tx_context FK KEY SHARE while another actor waits on principal.
        pattern=r'(FROM app\.sessions[^;]*?)FOR UPDATE'
        assert len(re.findall(pattern,sql))==5
        sql=re.sub(pattern,r'\1FOR NO KEY UPDATE',sql)
    old="state text NOT NULL CHECK(state IN('PENDING','CLAIMED','SENT','FAILED','CANCELLED')),"
    assert sql.count(old)==1
    sql=sql.replace(old,"state text NOT NULL CHECK(state IN('PENDING','CLAIMED','DISPATCHING','QUARANTINED','SENT','FAILED','CANCELLED')),\n method_id uuid,method_version bigint,recipient_version bigint,")
    old="proof_digest bytea, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),"
    assert sql.count(old)==1
    sql=sql.replace(old,old+'\n recipient_version bigint,')
    # Keep the existing TOTP signature, close the legacy EMAIL issuer bypass.
    old="DECLARE material jsonb; k uuid;\nBEGIN\n material:="
    assert sql.count(old)==1
    sql=sql.replace(old,"DECLARE material jsonb; k uuid;\nBEGIN\n IF method_kind IS DISTINCT FROM 'TOTP' THEN RAISE EXCEPTION 'USE_VERIFIED_EMAIL_CONTRACT' USING ERRCODE='42501';END IF;\n material:=")
    functions=[];acl=[]
    worker={'claim_mail_v2','authorize_mail_dispatch','finish_mail_outcome_cas','quarantine_expired_mail'}
    verifier={'record_verified_recipient','attest_reset'}
    for name,args in re.findall(r'CREATE FUNCTION ([a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*)\(([^)]*)\)',source):
        signature=name+'('+','.join(a.strip().split()[1] for a in args.split(','))+')'
        role=None if name.startswith('identity_private.') else ('cleanops_mail_worker' if name.split('.')[1] in worker else 'cleanops_recipient_verifier' if name.split('.')[1] in verifier else 'cleanops_identity_service')
        acl+=['ALTER FUNCTION '+signature+' OWNER TO cleanops_auth_broker;','REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC;']
        if role:acl+=['GRANT EXECUTE ON FUNCTION '+signature+' TO '+role+';']
        functions.append({'signature':signature,'execute':role,'owner':'cleanops_auth_broker','searchPath':'pg_catalog'})
    acl+=['REVOKE EXECUTE ON FUNCTION auth_api.claim_mail(bytea),auth_api.finish_mail(uuid,uuid,bytea,boolean) FROM cleanops_mail_worker;',
          'REVOKE EXECUTE ON FUNCTION auth_api.consume_email_otp(text,uuid,bytea,uuid),auth_api.email_otp_material(text,uuid) FROM cleanops_identity_service;']
    sql=sql.removesuffix('COMMIT;\n')+'\n-- BEGIN E1 CONSOLIDATED REVIEW ONLY\n'+source+'\n'+'\n'.join(acl)+'\nCOMMIT;\n'
    manifest={'status':'REVIEW_ONLY_NOT_INSTALLED','base':hashes(raw),'candidate':hashes(sql.encode()),'source':hashes(source.encode()),'functions':functions,
      'authorizationRequired':'Exact new SQL/ACL hash in fresh isolated synthetic PG16 only','installationAuthorized':False,'sqlCompiled':False,'runtime':'closedBackend','B1':'OPEN','AUTH-GATE-05':'OPEN'}
    if revision=='07':
        manifest['revision']='07';manifest['previousApproved']=hashes(approved);manifest['candidatePath']='docs/proposals/b1-consolidated-sql/revisions/07/schema.review.sql';manifest['nativeCompiled']=False
    delta=''.join(difflib.unified_diff(base.splitlines(True),sql.splitlines(True),fromfile='approved05',tofile='review06'))
    outputs={'schema.review.sql':sql,'APPROVED_05_TO_06.diff':delta,'manifest.json':json.dumps(manifest,indent=2)+'\n','ACL.sql':'-- REVIEW ONLY; embedded in complete candidate, not standalone install\n'+'\n'.join(acl)+'\n'}
    if revision=='07':
        outputs.pop('APPROVED_05_TO_06.diff')
        outputs['FULL_05_TO_07.diff']=''.join(difflib.unified_diff(base.splitlines(True),sql.splitlines(True),fromfile='approved05',tofile='review07'))
        outputs['APPROVED_06_TO_07.diff']=''.join(difflib.unified_diff(approved.decode().splitlines(True),sql.splitlines(True),fromfile='approved06',tofile='review07'))
        outputs['ACL.sql']='-- REVIEW ONLY, new column privileges plus function ownership/ACL\nGRANT UPDATE(version) ON app.policy_versions TO cleanops_auth_broker;\nGRANT UPDATE(credential_version) ON identity_private.credentials TO cleanops_auth_broker;\n'+'\n'.join(acl)+'\n'
    return outputs
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--revision',choices=['06','07'],default='06');a=p.parse_args()
    for name,value in generate(a.revision).items():
        path=DEST.with_name(a.revision)/name
        if a.check:
            if not path.exists() or path.read_text()!=value:raise ValueError('Stale candidate: '+name)
        else:path.write_text(value)
    print('E1 consolidated'+a.revision+' reproducible: PASS; no database execution')
if __name__=='__main__':main()
