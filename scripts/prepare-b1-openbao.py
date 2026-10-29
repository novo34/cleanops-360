#!/usr/bin/env python3
"""Offline renderer only: no socket, subprocess, credentials, init, install or deploy."""
import argparse, ipaddress, json, re, ssl
from urllib.parse import urlsplit
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
def prepare(d, agent_only=False):
 env=name(d['environment'])
 if env in {'prod','production'} and not agent_only:raise ValueError('PRODUCTION_OUT_OF_SCOPE')
 ttl=positive(d['token_ttl_seconds']);maximum=positive(d['token_max_ttl_seconds'])
 sid=positive(d['secret_id_ttl_seconds']) if not agent_only else 0
 if ttl>maximum or sid>maximum:raise ValueError('TTL_EXCEEDS_MAX')
 cidrs=d['workload_cidrs']
 if not cidrs:raise ValueError('WORKLOAD_CIDRS_REQUIRED')
 for c in cidrs:
  n=ipaddress.ip_network(c,strict=True)
  if n.version!=4 or not any(n.subnet_of(ipaddress.ip_network(p)) for p in ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']):raise ValueError('PRIVATE_WORKLOAD_CIDR_REQUIRED')
 outputs={};policies={w:{'path':{}} for w in WORKLOADS};creator={'path':{}}
 if not agent_only:
  ip=ipaddress.ip_address(d['private_ipv4'])
  if ip.version!=4 or not any(ip in ipaddress.ip_network(n) for n in ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']):raise ValueError('RFC1918_REQUIRED')
  dns=d['api_dns']
  if not isinstance(dns,str) or len(dns)>253 or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',l) for l in dns.split('.')):raise ValueError('INVALID_PRIVATE_DNS')
  raw=(BASE/'server.template.json').read_text()
  for k,v in {'API_DNS':dns,'PRIVATE_IPV4':str(ip),'NODE_ID':name(d['node_id']),'TOKEN_TTL':ttl,'TOKEN_MAX_TTL':maximum}.items():raw=raw.replace('@'+k+'@',str(v))
  outputs['server.json']=json.loads(raw)
 catalog={'approved_key_reads':d['approved_key_reads'],'approved_key_creates':d.get('approved_key_creates',[]) if agent_only else d['approved_key_creates']}
 if agent_only and catalog['approved_key_creates']:raise ValueError('AGENT_READ_SCOPE_ONLY')
 tenants={k['tenant'] for keys in catalog.values() for k in keys}
 if len(tenants)!=1:raise ValueError('EXACTLY_ONE_TENANT_PER_WORKLOAD_PACKAGE_REQUIRED')
 role_tenant=next(iter(tenants))
 seen=set()
 for field,op in [('approved_key_reads','read'),('approved_key_creates','create')]:
  for key in catalog[field]:
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
 outputs['restore-breakglass.policy.json']={'path':{'sys/storage/raft/snapshot-force':{'capabilities':['update']}}}
 if agent_only:
  a=d['agent'];workload=a['workload']
  if workload not in policies or not policies[workload]['path']:raise ValueError('EXPLICIT_WORKLOAD_REQUIRED')
  address=urlsplit(a['address'])
  if address.scheme!='https' or not address.hostname or address.username or address.password or address.path not in ('','/') or address.query or address.fragment:raise ValueError('VERIFIED_TLS_ORIGIN_REQUIRED')
  if len(address.hostname)>253 or not all(re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?',p) for p in address.hostname.split('.')) or (address.port is not None and not 1<=address.port<=65535):raise ValueError('VERIFIED_TLS_ORIGIN_REQUIRED')
  for k in ['ca_file','client_cert_file','client_key_file','sink_file']:
   p=Path(a[k])
   if not p.is_absolute() or '..' in p.parts or not re.fullmatch(r'[A-Za-z0-9_./-]+',str(p)):raise ValueError('ABSOLUTE_PRIVATE_PATH_REQUIRED')
  mount=name(a['cert_mount']);role=name(a['cert_name']);cn=name(a['certificate_common_name'])
  if a['sink_mode'] not in ['0600','0640'] or any(type(a[k]) is not int or a[k]<0 for k in ['sink_uid','sink_gid']):raise ValueError('EXPLICIT_SINK_OWNERSHIP_REQUIRED')
  if a['directory_mode'] not in ['0700','0750'] or any(type(a[k]) is not int or a[k]<0 for k in ['directory_uid','directory_gid']) or type(a['read_timeout_ms']) is not int or not 1<=a['read_timeout_ms']<=5000:raise ValueError('EXPLICIT_SINK_DIRECTORY_REQUIRED')
  certificate=a['public_auth_ca_pem']
  if not isinstance(certificate,str) or not certificate.startswith('-----BEGIN CERTIFICATE-----\n') or 'PRIVATE' in certificate:raise ValueError('PUBLIC_AUTH_CA_REQUIRED')
  trust=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT);trust.load_verify_locations(cadata=certificate)
  policy=policies[workload]
  policy['path']['auth/token/renew-self']={'capabilities':['update']}
  policy_name='b1-'+env+'-'+role_tenant+'-'+workload
  q=json.dumps
  agent='vault {\n'+''.join('  '+k+' = '+q(v)+'\n' for k,v in {'address':a['address'],'ca_cert':a['ca_file'],'client_cert':a['client_cert_file'],'client_key':a['client_key_file']}.items())+'  tls_skip_verify = false\n}\n'
  agent+='auto_auth {\n  method "cert" {\n    mount_path = '+q('auth/'+mount)+'\n    config = {\n'
  agent+=''.join('      '+k+' = '+q(v)+'\n' for k,v in {'name':role,'ca_cert':a['ca_file'],'client_cert':a['client_cert_file'],'client_key':a['client_key_file']}.items())+'      reload = true\n    }\n  }\n'
  agent+='  sink "file" {\n    config = {\n      path = '+q(a['sink_file'])+'\n      mode = '+q(a['sink_mode'])+'\n      uid = '+str(a['sink_uid'])+'\n      gid = '+str(a['sink_gid'])+'\n    }\n  }\n}\n'
  return {
   'agent.hcl':agent,
   workload+'.sink-reader.json':{'path':a['sink_file'],'uid':a['sink_uid'],'gid':a['sink_gid'],'directoryUid':a['directory_uid'],'directoryGid':a['directory_gid'],'mode':int(a['sink_mode'],8),'directoryMode':int(a['directory_mode'],8),'timeoutMs':a['read_timeout_ms']},
   workload+'.policy.json':policy,
   workload+'.cert-role.json':{'certificate':certificate,'allowed_common_names':[cn],'token_policies':[policy_name],
    'token_no_default_policy':True,'token_ttl':ttl,'token_max_ttl':maximum,'token_num_uses':0,'token_bound_cidrs':cidrs},
  }
 return outputs
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--inputs',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--agent-cert',action='store_true');a=p.parse_args()
 try:
  result=prepare(json.loads(a.inputs.read_text()),agent_only=a.agent_cert);a.out.mkdir(parents=True,exist_ok=False)
  for name_,content in result.items():(a.out/name_).write_text(content if isinstance(content,str) else json.dumps(content,indent=2)+'\n')
  print('PREPARED_ONLY: offline files; no syntax compilation or server/ACL installation performed')
 except (ValueError,KeyError,TypeError,FileExistsError,ssl.SSLError):raise SystemExit('INPUTS_INVALID_OR_OUTPUT_EXISTS: no runtime operation attempted')
