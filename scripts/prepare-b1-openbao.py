#!/usr/bin/env python3
"""Offline renderer only: no socket, subprocess, credentials, init, install or deploy."""
import argparse, ipaddress, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'docs/implementation/b1/operational-acceptance/openbao'
PURPOSES={'totp-aead','mail-aead','otp-hmac','recovery-hmac','audit-hmac','cursor-hmac'}
WORKLOADS={'identity-verifier','enrollment-issuer','mail-worker'}
def name(v):
 if not isinstance(v,str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}',v):raise ValueError('INVALID_IDENTIFIER')
 return v
def positive(v):
 if type(v) is not int or v<=0:raise ValueError('EXPLICIT_POSITIVE_INTEGER_REQUIRED')
 return v
def prepare(d):
 env=name(d['environment'])
 if env in {'prod','production'}:raise ValueError('PRODUCTION_OUT_OF_SCOPE')
 ip=ipaddress.ip_address(d['private_ipv4'])
 if ip.version!=4 or not any(ip in ipaddress.ip_network(n) for n in ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']):raise ValueError('RFC1918_REQUIRED')
 dns=d['api_dns']
 if not isinstance(dns,str) or len(dns)>253 or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',l) for l in dns.split('.')):raise ValueError('INVALID_PRIVATE_DNS')
 ttl=positive(d['token_ttl_seconds']);maximum=positive(d['token_max_ttl_seconds']);sid=positive(d['secret_id_ttl_seconds'])
 if ttl>maximum or sid>maximum:raise ValueError('TTL_EXCEEDS_MAX')
 cidrs=d['workload_cidrs']
 if not cidrs:raise ValueError('WORKLOAD_CIDRS_REQUIRED')
 for c in cidrs:
  n=ipaddress.ip_network(c,strict=True)
  if n.version!=4 or not any(n.subnet_of(ipaddress.ip_network(p)) for p in ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']):raise ValueError('PRIVATE_WORKLOAD_CIDR_REQUIRED')
 raw=(BASE/'server.template.json').read_text()
 for k,v in {'API_DNS':dns,'PRIVATE_IPV4':str(ip),'NODE_ID':name(d['node_id']),'TOKEN_TTL':ttl,'TOKEN_MAX_TTL':maximum}.items():raw=raw.replace('@'+k+'@',str(v))
 server=json.loads(raw);outputs={'server.json':server};policies={w:{'path':{}} for w in WORKLOADS};creator={'path':{}}
 tenants={k['tenant'] for field in ['approved_key_reads','approved_key_creates'] for k in d[field]}
 if len(tenants)!=1:raise ValueError('EXACTLY_ONE_TENANT_PER_WORKLOAD_PACKAGE_REQUIRED')
 role_tenant=next(iter(tenants))
 seen=set()
 for field,op in [('approved_key_reads','read'),('approved_key_creates','create')]:
  for key in d[field]:
   # Exact paths only: no mount root/list/metadata/write/delete or cross-tenant wildcard.
   tenant=key['tenant'];purpose=key['purpose'];kid=name(key['key_id'])
   if not isinstance(tenant,str) or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',tenant) or purpose not in PURPOSES:raise ValueError('INVALID_KEY_SCOPE')
   path=f'b1-keys/data/{env}/{tenant}/{purpose}/{kid}'
   if op=='create':
    if path in creator['path']:raise ValueError('DUPLICATE_CREATE')
    creator['path'][path]={'capabilities':['create']}
   else:
    workload=key['workload']
    allowed={'mail-worker':{'mail-aead'},'enrollment-issuer':{'totp-aead','mail-aead'},'identity-verifier':{'totp-aead','otp-hmac','recovery-hmac','audit-hmac','cursor-hmac'}}
    if workload not in WORKLOADS or purpose not in allowed[workload]:raise ValueError('WRONG_PURPOSE_FOR_WORKLOAD')
    if (workload,path) in seen:raise ValueError('DUPLICATE_READ')
    seen.add((workload,path));policies[workload]['path'][path]={'capabilities':['read']}
 for w,p in policies.items():
  # Empty roles must never authenticate using only an inherited default policy.
  if not p['path']:continue
  outputs[w+'.policy.json']=p
  outputs[w+'.approle.json']={'bind_secret_id':True,'secret_id_num_uses':1,'secret_id_ttl':sid,'secret_id_bound_cidrs':cidrs,'token_bound_cidrs':cidrs,'token_no_default_policy':True,'token_policies':['b1-'+env+'-'+role_tenant+'-'+w],'token_ttl':ttl,'token_max_ttl':maximum,'token_type':'service'}
 if creator['path']:outputs['key-creator.policy.json']=creator
 outputs['kv-mount.json']={'type':'kv','options':{'version':'2'}}
 outputs['kv-config.json']={'cas_required':True,'delete_version_after':'0s'}
 outputs['snapshot-reader.policy.json']={'path':{'sys/storage/raft/snapshot':{'capabilities':['read']}}}
 outputs['restore-operator.policy.json']={'path':{'sys/storage/raft/snapshot':{'capabilities':['update']}}}
 return outputs
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--inputs',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 try:
  result=prepare(json.loads(a.inputs.read_text()));a.out.mkdir(parents=True,exist_ok=False)
  for name_,content in result.items():(a.out/name_).write_text(json.dumps(content,indent=2)+'\n')
  print('PREPARED_ONLY: offline files; no syntax compilation or server/ACL installation performed')
 except (ValueError,KeyError,TypeError,FileExistsError):raise SystemExit('INPUTS_INVALID_OR_OUTPUT_EXISTS: no runtime operation attempted')
