from pathlib import Path
import json,csv,io,yaml
R=Path(__file__).parent
values=[]
def value(key,val,unit,status,source,test):values.append(dict(key=key,value=val,unit=unit,status=status,source=source,verification=test))
approved='APPROVED';proposed='PROPOSED_BENCHMARK_REQUIRED'
for k,v,u,src in [('email_otp_ttl',300,'seconds','REQ-AUTH-011'),('idle_sensitive',1800,'seconds','REQ-AUTH-044'),('idle_operational',28800,'seconds','REQ-AUTH-044'),('trusted_device_max',2592000,'seconds (DEFERRED B1)','REQ-AUTH-046')]:value(k,v,u,approved,src,'Security regression; no reapproval')
value('password_hash','Argon2id','algorithm',approved,'OWNER 6195913199','Library maturity/security tests')
for k,v,u,test in [
 ('absolute_sensitive',28800,'seconds','Clock/role policy/load'),('absolute_operational',86400,'seconds','Clock/role policy/load'),('step_up_ttl',300,'seconds','Replay/resource binding'),
 ('preauth_ttl',600,'seconds','Expiry/enumeration'),('enrollment_ttl',600,'seconds','Single-use enrollment'),('argon_memory',65536,'KiB','Concurrent memory/DoS benchmark'),('argon_iterations',3,'passes','Latency/load'),('argon_parallelism',1,'lane','CPU/load'),('argon_salt',16,'bytes','Library CSPRNG'),
 ('otp_digits',6,'decimal digits','Entropy/abuse'),('otp_attempts',5,'per challenge','Parallel exhaustion'),('otp_resend_cooldown',60,'seconds','Concurrent resend'),
 ('login_user_limit',5,'failures per 900 seconds','Distributed spraying/false lockout'),('login_ip_limit',30,'failures per 900 seconds','NAT false positives'),('login_device_limit',10,'failures per 900 seconds','Device reset attacks'),
 ('progressive_backoff',[1,2,4,8,16,32,60],'seconds, cap60, reset after 900s','No permanent lockout/DoS'),('otp_issue_user_limit',5,'issues per 900 seconds','Mail abuse'),('otp_issue_ip_limit',30,'issues per 900 seconds','Mail abuse'),('otp_issue_device_limit',10,'issues per 900 seconds','Mail abuse'),
 ('totp_period',30,'seconds','RFC-compatible library drift'),('totp_digits',6,'digits','Library compatibility'),('totp_window',1,'counter each side','Replay/drift/concurrency'),
 ('session_token_entropy',32,'random bytes, base64url43','CSPRNG/no tokens in logs'),('csrf_entropy',32,'random bytes, base64url43','Login CSRF/cookie binding'),('preauth_entropy',32,'random bytes, base64url43','Binding/replay'),
 ('recovery_count',10,'codes per batch','One-time display/parallel consume'),('recovery_entropy',16,'random bytes per code, base32 length26','Atomic consume/no plaintext'),
 ('json_body_max',16384,'bytes','Request boundary/413'),('password_min',12,'Unicode code points','UX/compromised corpus'),('password_max',128,'Unicode code points','Hash DoS/Unicode'),('email_max',254,'characters','Normalization/index consistency'),('display_name_max',120,'characters','UX/schema'),('reason_max',500,'characters','Audit minimization'),
 ('page_default',50,'rows','Pagination performance'),('page_max',100,'rows','Query load'),('cursor_max',512,'characters','Tamper/tenant binding'),('idempotency_ttl',86400,'seconds','Concurrent replay/isolation'),('outbox_max_attempts',5,'attempts','SMTP outage'),('outbox_claim_lease',60,'seconds','Worker crash/redelivery'),('context_gc_age',3600,'seconds (only finished xids)','Pool/GC locks'),('preauth_security_log_retention',604800,'seconds synthetic staging proposal','Privacy/abuse analysis')]:value(k,v,u,proposed,'V4 engineering proposal, NOT OWNER approval',test)
value('membership_max',100,'memberships per principal B1',proposed,'V4 engineering proposal','Bounded broker lookup/pagination')
for k,v,u in [('rate_window',900,'seconds'),('rate_bucket_retention',86400,'seconds synthetic staging'),('outbox_retry_delay',60,'seconds'),('idempotency_key_min',16,'ASCII characters'),('idempotency_key_max',128,'ASCII characters'),('organization_hint_max',128,'characters'),('provisioning_uri_max',2048,'characters'),('set_cookie_header_max',2048,'characters'),('error_code_max',64,'characters'),('error_field_max',80,'characters'),('error_message_max',300,'characters'),('error_details_max',16,'items')]:value(k,v,u,proposed,'V4 technical contract proposal','Boundary/abuse/privacy tests')
value('compromised_password_check','local versioned corpus; fail safely on unavailable checker','deployment proposal',proposed,'OWNER approves detection, implementation proposed','No external password disclosure; corpus update/correctness')
(R/'security-values.yaml').write_text(yaml.safe_dump({'status':'APPROVED_VALUES_PLUS_EXPLICIT_PROPOSALS','values':values},sort_keys=False,allow_unicode=True))
with (R/'security-values.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(values[0]));w.writeheader();w.writerows(values)

S={}
def st(min=1,max=120,**kw):return dict(type='string',minLength=min,maxLength=max,**kw)
uuid=st(36,36,format='uuid');dt=st(20,35,format='date-time');token=st(43,43,pattern='^[A-Za-z0-9_-]{43}$');secret={**token,'writeOnly':True}
def ref(n):return {'$ref':'#/components/schemas/'+n}
def obj(n,p,req=None):S[n]={'type':'object','additionalProperties':False,'properties':p,'required':list(p) if req is None else req}
def ar(n,max=100):return {'type':'array','maxItems':max,'items':ref(n)}
obj('ErrorDetail',{'field':st(1,80),'code':st(1,64)},['code'])
obj('Error',{'error':{'type':'object','additionalProperties':False,'properties':{'code':st(1,64),'message':st(1,300),'details':ar('ErrorDetail',16)},'required':['code','message','details']},'correlation_id':uuid})
obj('Meta',{'correlation_id':uuid})
obj('LoginInput',{'email':st(3,254,format='email'),'password':st(12,128,writeOnly=True),'organization_hint':st(1,128)},['email','password'])
obj('ChallengeReference',{'challenge_id':uuid})
obj('MfaVerifyInput',{'challenge_id':uuid,'method':st(4,9,enum=['EMAIL_OTP','TOTP']),'proof':st(6,6,pattern='^[0-9]{6}$',writeOnly=True)})
obj('Reason',{'reason':st(1,500)})
obj('SwitchTenantInput',{'target_tenant_id':uuid,'reason':st(1,500)})
obj('TotpConfirmInput',{'enrollment_id':uuid,'proof':st(6,6,pattern='^[0-9]{6}$',writeOnly=True)})
obj('StepUpInput',{'grant_id':st(10,10,enum=['B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-08']),'resource_id':uuid},['grant_id'])
S['StepUpInput']['allOf']=[{'if':{'properties':{'grant_id':{'const':'B1-SELF-08'}}},'then':{'required':['resource_id']},'else':{'not':{'required':['resource_id']}}}]
obj('Active',{'state':{'const':'ACTIVE'},'session_id':uuid,'tenant_id':uuid,'absolute_expires_at':dt})
obj('PendingMfa',{'state':{'const':'PENDING_MFA'},'challenge_id':uuid,'allowed_methods':{'type':'array','minItems':1,'maxItems':2,'uniqueItems':True,'items':st(4,9,enum=['EMAIL_OTP','TOTP'])},'expires_at':dt})
obj('EnrollmentRequired',{'state':{'const':'ENROLLMENT_REQUIRED'},'allowed_methods':{'type':'array','minItems':1,'maxItems':1,'items':{'const':'TOTP'}},'expires_at':dt})
obj('TenantSelection',{'state':{'const':'TENANT_SELECTION_REQUIRED'},'expires_at':dt})
S['AuthResult']={'oneOf':[ref('Active'),ref('PendingMfa'),ref('EnrollmentRequired'),ref('TenantSelection')]}
obj('Challenge',{'challenge_id':uuid,'expires_at':dt,'method':st(4,9,enum=['EMAIL_OTP','TOTP'])})
obj('Session',{'id':uuid,'tenant_id':uuid,'user_id':uuid,'created_at':dt,'last_activity_at':dt,'absolute_expires_at':dt,'device_label':st(1,120),'browser_label':st(1,120),'is_current':{'type':'boolean'}})
obj('SessionList',{'items':ar('Session'),'next_cursor':{'oneOf':[st(1,512),{'type':'null'}]}})
obj('User',{'id':uuid,'tenant_id':uuid,'display_name':st(1,120),'email':st(3,254,format='email')})
obj('Tenant',{'id':uuid,'name':st(1,120)})
obj('TenantList',{'items':ar('Tenant'),'next_cursor':{'oneOf':[st(1,512),{'type':'null'}]}})
obj('Result',{'state':st(7,7,enum=['REVOKED']),'revoked_count':{'type':'integer','minimum':0,'maximum':2147483647}})
obj('TotpEnrollment',{'enrollment_id':uuid,'provisioning_uri':st(1,2048),'expires_at':dt})
obj('RecoveryCodes',{'codes':{'type':'array','minItems':10,'maxItems':10,'uniqueItems':True,'items':st(26,26,pattern='^[A-Z2-7]{26}$')},'display_once':{'const':True},'auth':ref('AuthResult')})
obj('StepUpResult',{'challenge_id':uuid,'expires_at':dt,'allowed_methods':{'type':'array','minItems':1,'maxItems':2,'uniqueItems':True,'items':st(4,9,enum=['EMAIL_OTP','TOTP'])}})
ops=[
 ('/auth/login','post','login','LoginInput','AuthResult',None,'CEREMONY',['REQ-AUTH-001','REQ-AUTH-002','REQ-AUTH-017']),
 ('/auth/otp/resend','post','resendOtp','ChallengeReference','Challenge',None,'CEREMONY',['REQ-AUTH-011','REQ-AUTH-013','REQ-AUTH-014','REQ-AUTH-015']),
 ('/auth/mfa/verify','post','verifyMfa','MfaVerifyInput','AuthResult',None,'CEREMONY',['REQ-AUTH-003','REQ-AUTH-010','REQ-AUTH-016']),
 ('/auth/logout','post','logout',None,'Result','B1-SELF-03','ACTIVE',['REQ-AUTH-042']),
 ('/auth/step-up','post','startStepUp','StepUpInput','StepUpResult',None,'ACTIVE',['REQ-AUTH-047']),
 ('/auth/me','get','getCurrentIdentity',None,'User','B1-SELF-01','ACTIVE',['REQ-AUTH-001']),
 ('/auth/tenants','get','listAuthorizedTenants',None,'TenantList','B1-SELF-07','VERIFIED_PRINCIPAL',['REQ-TEN-003']),
 ('/auth/tenant-switch','post','switchTenant','SwitchTenantInput','AuthResult','B1-SELF-08','ACTIVE_OR_SELECTION',['REQ-TEN-003','REQ-AUD-001']),
 ('/me/sessions','get','listSelfSessions',None,'SessionList','B1-SELF-02','ACTIVE',['REQ-AUTH-040','REQ-AUTH-041']),
 ('/me/sessions/{session_id}','delete','revokeSelfSession',None,'Result','B1-SELF-03','ACTIVE',['REQ-AUTH-042']),
 ('/me/sessions/revoke-other-own','post','revokeOtherOwnSessions','Reason','Result','B1-SELF-04','ACTIVE_STEP_UP',['REQ-AUTH-043','REQ-AUTH-047']),
 ('/mfa/totp/enroll','post','enrollTotp',None,'TotpEnrollment','B1-SELF-05','ACTIVE_STEP_UP_OR_ENROLLMENT',['REQ-AUTH-020','REQ-AUTH-022']),
 ('/mfa/totp/confirm','post','confirmTotp','TotpConfirmInput','RecoveryCodes','B1-SELF-06','ACTIVE_STEP_UP_OR_ENROLLMENT',['REQ-AUTH-021','REQ-AUTH-030','REQ-AUTH-031','REQ-AUTH-032'])]
doc={'openapi':'3.1.0','info':{'title':'CleanOps 360 — B1 final proposed HTTP contract','version':'0.4.0-review','description':'13 operations. Functional B1-SELF-01..08 APPROVED by OWNER 6197407914; NOT activated. Numeric values marked proposed in security-values.yaml require benchmark/acceptance. REVIEW ONLY; no servers deployed.'},'x-status':'FINAL_PROPOSAL_FOR_REVIEW','x-source-sha':'a505c4f7f05ca79730a6326b294c597eead912a9','x-functional-rule-approval':'https://github.com/novo34/cleanops-360/pull/5#issuecomment-6197407914','x-access-activation':False,'security':[{'SessionCookie':[]}],'paths':{},'components':{'schemas':S,'securitySchemes':{'SessionCookie':{'type':'apiKey','in':'cookie','name':'__Host-cleanops_session'},'PreauthCookie':{'type':'apiKey','in':'cookie','name':'__Host-cleanops_preauth'}}}}
for path,method,ident,inp,out,rule,auth,req in ops:
 envelope=ident+'Response';obj(envelope,{'data':ref(out),'meta':ref('Meta')})
 op={'operationId':ident,'summary':ident,'x-requirements':req+['REQ-TEN-001','REQ-TEN-002','REQ-TEN-003','REQ-TEN-004'],'x-rule':rule,'x-rule-status':'APPROVED_FUNCTIONAL_NOT_ACTIVE' if rule else 'CEREMONY_NO_BUSINESS_GRANT','x-authentication-state':auth,'x-numeric-parameters-status':'See security-values.yaml; non-approved values PROPOSED','parameters':[],'responses':{'200':{'description':'Confirmed result; see HTTP_CONTRACT.md for state/cookie transitions','headers':{'Cache-Control':{'schema':{'type':'string','const':'no-store'}},'Set-Cookie':{'schema':st(1,2048),'description':'Only transitions/revocation; Secure HttpOnly Path=/ SameSite=Lax; never Domain'}},'content':{'application/json':{'schema':ref(envelope)}}}}}
 if auth=='CEREMONY':op['security']=[] if ident=='login' else [{'PreauthCookie':[]},{'SessionCookie':[]}]
 elif auth in ['VERIFIED_PRINCIPAL','ACTIVE_OR_SELECTION','ACTIVE_STEP_UP_OR_ENROLLMENT']:op['security']=[{'SessionCookie':[]},{'PreauthCookie':[]}]
 if 'session_id' in path:op['parameters'].append({'in':'path','name':'session_id','required':True,'schema':uuid})
 if ident in ['listSelfSessions','listAuthorizedTenants']:
  op['parameters'] += [{'in':'query','name':'limit','schema':{'type':'integer','minimum':1,'maximum':100,'default':50}},{'in':'query','name':'cursor','schema':st(1,512)}]
 if method!='get':
  op['parameters'] += [{'in':'header','name':'X-CSRF-Token','required':True,'schema':token}]
  if ident not in ['login','verifyMfa']:
   op['parameters'].append({'in':'header','name':'Idempotency-Key','required':True,'schema':st(16,128,pattern='^[A-Za-z0-9_-]+$')})
 if inp:op['requestBody']={'required':True,'content':{'application/json':{'schema':ref(inp)}}}
 for code,desc in [(400,'Malformed JSON, illegal selector or unknown query'),(401,'Missing/invalid/expired session or bound ceremony, generic'),(403,'Policy/CSRF/step-up denied'),(404,'Absent/invisible session; indistinguishable cross-tenant'),(409,'State/replay/idempotency conflict or one-time result not replayable'),(413,'Request exceeds 16384 bytes'),(415,'Not application/json for JSON input'),(422,'Safe input/domain validation error'),(429,'Rate limited; Retry-After seconds, no account enumeration'),(503,'Dependency unavailable; no downgrade')]:
  op['responses'][str(code)]={'description':desc,'headers':{'Cache-Control':{'schema':{'type':'string','const':'no-store'}}},'content':{'application/json':{'schema':ref('Error')}}}
 op['responses']['429']['headers']['Retry-After']={'schema':{'type':'integer','minimum':1,'maximum':900}}
 doc['paths'].setdefault(path,{})[method]=op
(R/'block-1.openapi.yaml').write_text(yaml.safe_dump(doc,sort_keys=False,allow_unicode=True))
# Registrar aprobación funcional sin activar ninguna fila.
for filename in ['block-1-grants-requiring-approval.csv','block-1-role-projection.csv']:
 data=list(csv.DictReader(io.StringIO((R/'baseline-v3'/filename).read_text())))
 for row in data:row['approval_status']='APPROVED_FUNCTIONAL_NOT_ACTIVE';row['effective_decision']='DENY';row['approval_source']='6197407914'
 with (R/filename.replace('requiring-approval','functional-approved')).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(data[0]));w.writeheader();w.writerows(data)
print('Built 13 operations and',len(values),'security entries')
