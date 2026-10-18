/** Isolated test composition only. Never imported by routes/runtime. */
import { Pool } from 'pg'
import { hash, argon2id } from 'argon2'
import { randomBytes, randomUUID, createHmac, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { TOTP, Secret } from 'otpauth'
import type { IdentityPool } from '../lib/b1/pg-identity-driver.ts'
import {createPasswordAdmission} from '../lib/b1/password-admission.ts'
import { createApprovedPrivateBackend } from '../lib/b1/approved-backend.ts'
import { createAuthHandler } from '../lib/b1/service.ts'
import { canonical } from '../lib/b1/contracts.ts'
import { numeric } from '../lib/b1/config.ts'
import { sealEnrollmentSecret, openEnrollmentSecret } from '../lib/b1/ceremony-preparation.ts'

import { dispatchOneMail } from '../lib/b1/mail-worker.ts'
import { createMailDispatchStore } from '../lib/b1/mail-dispatch-store.ts'
import { createInterface } from 'node:readline'
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
const iterator = lines[Symbol.asyncIterator]()
const first = await iterator.next()
const input = JSON.parse(first.value!)
const recoveryScenario = ['abuse','recovery','reset','reset-admin','trusted','trusted-admin','authz','authz-readonly'].includes(input.scenario)
const emailScenario = ['email', 'email-enrollment', 'email-additional', 'email-multiple'].includes(input.scenario)
if(input.scenario==='multiple' || emailScenario || recoveryScenario){input.principal=randomUUID();input.user=randomUUID()}
input.email = input.scenario+'-'+input.principal+'@fixture.invalid'
const resetTarget=['reset-admin','trusted-admin','authz','authz-readonly'].includes(input.scenario)?{user:randomUUID(),principal:randomUUID(),email:'target-'+randomUUID()+'@fixture.invalid',method:randomUUID(),secret:randomBytes(32)}:null
const admin = new Pool({ host: '/var/run/postgresql', database: 'core', user: 'postgres', max: 1, connectionTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000 })
const identity = new Pool({ host: '/var/run/postgresql', database: 'core', user: input.identityRole, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000 })
const origin = 'https://127.0.0.1:3000'
const password = 'PG05 synthetic passphrase!'
const recoveryKey = randomBytes(32)
const recoverySecret = new Secret({size:numeric('recovery_entropy')})
const fixtureRecoveryCode = recoverySecret.base32
const resetTicket=randomBytes(32).toString('base64url')
recoverySecret.bytes.fill(0)
const mailKey = randomBytes(32), otpKey = randomBytes(32)
const mailPool = new Pool({ host: '/var/run/postgresql', database: 'core', user: 'pgtest_mail', max: 2 })
const key = randomBytes(32), secret = randomBytes(32), method = randomUUID()
const enrollmentContext = { tenantId: input.tenant, userId: input.user, methodId: method, initialMethodVersion: '1' as const, algorithm: 'SHA256' as const }
const envelope = sealEnrollmentSecret(secret, key, 'pg05-ephemeral', enrollmentContext)
let lastProofFingerprint: Buffer | undefined
let failNextEmailCommit = false
let loseNextCommitAck=false
let emailConsumption = false
const fixtureNetwork=randomBytes(32), fixtureDevice=randomBytes(32)
const fixtureRateKeys=new Set<string>()
const fixtureCorrelations=new Set<string>()
let setupComplete=false
const queryFailures: { operation: string; sqlstate: string }[] = []
try {
  const passwordHash = await hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
  if(input.scenario==='multiple' || emailScenario || recoveryScenario) {
    await admin.query("INSERT INTO identity_private.principals VALUES($1,$2,'ACTIVE',now())",[input.principal,(emailScenario || recoveryScenario) ? input.email : 'multi@fixture.invalid'])
    await admin.query('INSERT INTO identity_private.credentials VALUES($1,$2,1,now())',[input.principal,passwordHash])
    await admin.query("INSERT INTO app.users VALUES($1,$2,$3,'Synthetic multi','ACTIVE','SENSITIVE',now())",[input.tenant,input.user,input.principal])
  }
  if(resetTarget){
    await admin.query("INSERT INTO identity_private.principals VALUES($1,$2,'ACTIVE',now())",[resetTarget.principal,resetTarget.email])
    await admin.query('INSERT INTO identity_private.credentials VALUES($1,$2,1,now())',[resetTarget.principal,passwordHash])
    await admin.query("INSERT INTO app.users VALUES($1,$2,$3,'Synthetic reset subject','ACTIVE','SENSITIVE',now())",[input.tenant,resetTarget.user,resetTarget.principal])
    const targetCipher=sealEnrollmentSecret(resetTarget.secret,key,'pg05-ephemeral',{...enrollmentContext,userId:resetTarget.user,methodId:resetTarget.method})
    await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,'pg05-ephemeral',now(),1,'SHA256')",[input.tenant,resetTarget.method,resetTarget.user,targetCipher])
    await admin.query("INSERT INTO app.access_resources VALUES($1,$2,'users',NULL)",[input.tenant,resetTarget.user])
    for(const [action,kind] of input.scenario.startsWith('authz')?[]:[['edit','users'],['manage_permissions','access']])await admin.query("INSERT INTO app.access_rules VALUES($1,$2,NULL,$3,$4,$5,$6,'ALLOW',now()-interval '1m',NULL,NULL)",[input.tenant,randomUUID(),input.user,action,kind,resetTarget.user])
  }
  const accessRole=randomUUID(),accessRoleRule=randomUUID(),accessTargetRule=randomUUID(),accessResource=randomUUID(),accessForeign=randomUUID()
  if(input.scenario.startsWith('authz') && resetTarget){
    await admin.query("INSERT INTO app.access_resources VALUES($1,$2,'documents',NULL),($3,$4,'documents',NULL)",[input.tenant,accessResource,input.otherTenant,accessForeign])
    await admin.query("INSERT INTO app.access_rules VALUES($1,$2,NULL,$3,'view','access',NULL,'ALLOW',clock_timestamp(),NULL,NULL)",[input.tenant,randomUUID(),input.user])
    if(input.scenario==='authz'){
      for(const action of ['view','create','edit','approve','delete','export','manage_permissions'])for(const kind of ['access','users','documents'])await admin.query("INSERT INTO app.access_rules VALUES($1,$2,NULL,$3,$4,$5,NULL,'ALLOW',clock_timestamp(),NULL,NULL)",[input.tenant,randomUUID(),input.user,action,kind])
    }
    await admin.query("INSERT INTO app.access_roles VALUES($1,$2,'Synthetic scoped viewer',NULL)",[input.tenant,accessRole])
    await admin.query("INSERT INTO app.access_rules VALUES($1,$2,$3,NULL,'view','documents',$4,'ALLOW',clock_timestamp(),NULL,NULL)",[input.tenant,accessRoleRule,accessRole,accessResource])
    await admin.query("INSERT INTO app.access_role_memberships VALUES($1,$2,$3,clock_timestamp(),NULL,NULL)",[input.tenant,accessRole,resetTarget.user])
  }
  await admin.query('UPDATE identity_private.credentials SET argon2id_hash=$1 WHERE principal_id=$2', [passwordHash, input.principal])
  await admin.query("UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=$1 AND user_id=$2", [input.tenant, input.user])
  if ((!emailScenario || input.scenario === 'email-additional') && input.scenario !== 'enrollment') await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,'pg05-ephemeral',now(),1,'SHA256')", [input.tenant, method, input.user, envelope])
  if(input.scenario==='multiple') {
    const extraId=randomUUID(),extraSecret=randomBytes(32)
    try {
      const extraCipher=sealEnrollmentSecret(extraSecret,key,'pg05-ephemeral',{...enrollmentContext,methodId:extraId})
      await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,'pg05-ephemeral',now(),1,'SHA256')",[input.tenant,extraId,input.user,extraCipher])
    } finally {extraSecret.fill(0)}
  }
  await admin.query('UPDATE app.recovery_codes SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[input.tenant,input.user])
  if(input.scenario==='additional') {
    const batch=randomUUID()
    for(let i=0;i<numeric('recovery_count');i++) {
      const code=new Secret({size:numeric('recovery_entropy')})
      const mac=createHmac('sha256',recoveryKey).update(canonical(['RECOVERY',input.tenant,input.user,code.base32])).digest()
      try { await admin.query('INSERT INTO app.recovery_codes VALUES($1,$2,$3,$4,$5,now(),NULL,NULL)',[input.tenant,randomUUID(),input.user,batch,mac]) }
      finally {code.bytes.fill(0);mac.fill(0)}
    }
  }
  if (emailScenario) {
    const verifier = new Pool({ host: '/var/run/postgresql', database: 'core', user: 'pgtest_verifier' })
    try {
      const { createHash } = await import('node:crypto')
      await verifier.query('SELECT auth_api.record_verified_recipient($1::uuid,$2::uuid,0,$3::bytea,$4::uuid,$5::timestamptz,$6::uuid)',
        [input.tenant, input.user, createHash('sha256').update(input.email).digest(), randomUUID(), new Date(Date.now()+3600000), randomUUID()])
    } finally { await verifier.end() }
    if (['email','email-multiple'].includes(input.scenario)) await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,created_at,method_version) VALUES($1,$2,$3,'EMAIL_OTP','ACTIVE',now(),1)", [input.tenant,method,input.user])
  }
  if (input.scenario === 'email-multiple') await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,created_at,method_version) VALUES($1,$2,$3,'EMAIL_OTP','ACTIVE',now(),1)",[input.tenant,randomUUID(),input.user])
  if(recoveryScenario) {
    const proof=createHmac('sha256',recoveryKey).update(canonical(['RECOVERY',input.tenant,input.user,fixtureRecoveryCode])).digest()
    try {await admin.query('INSERT INTO app.recovery_codes VALUES($1,$2,$3,$4,$5,clock_timestamp(),NULL,NULL)',[input.tenant,randomUUID(),input.user,randomUUID(),proof])}
    finally {proof.fill(0)}
  }
  if(input.scenario.startsWith('trusted'))await admin.query('INSERT INTO app.auth_preferences VALUES($1,true) ON CONFLICT(tenant_id) DO UPDATE SET trusted_devices_enabled=true',[input.tenant])
  // Synthetic rows exercise the existing approved page_default, not a new UI default.
  await admin.query(`INSERT INTO app.sessions
    SELECT tenant_id,gen_random_uuid(),user_id,principal_id,
      crypto.digest(gen_random_uuid()::text,'sha256'),csrf_digest,state,
      created_at-g*interval '1 millisecond',last_activity_at,absolute_expires_at,idle_expires_at,
      idle_seconds,revoked_at,mfa_verified_at,credential_version,device_label,browser_label
    FROM (SELECT * FROM app.sessions WHERE tenant_id=$1 AND user_id=$2 LIMIT 1) s
    CROSS JOIN generate_series(1,$3::int) g`,[input.tenant,input.user,numeric('page_default')])
  const transportResult = await admin.query("SELECT encode(secret_ciphertext,'base64') AS encoded FROM app.mfa_methods WHERE tenant_id=$1 AND id=$2", [input.tenant, method])
  if ((!emailScenario || input.scenario === 'email-additional') && input.scenario !== 'enrollment') {
    const encoded: string = transportResult.rows[0].encoded
    assert.ok(encoded.includes('\n')); assert.equal(Buffer.from(encoded, 'base64').length, envelope.length)
  }
  const privatePool = { async connect() {
    const client = await identity.connect()
    client.on('error', () => {}) // Query/COMMIT still reject; synthetic termination must not crash the IPC process.
    return { async query(sql: string, values?: unknown[]) {
      try {
        if(input.scenario==='abuse' && sql.includes('auth_api.rate_attempt') && values && Buffer.isBuffer(values[0]))fixtureRateKeys.add(values[0].toString('hex'))
        if(input.scenario==='abuse' && sql.includes('auth_api.record_security_event') && typeof values?.[4]==='string')fixtureCorrelations.add(values[4])
        if ((sql.includes('auth_api.consume_email_v2') || sql.includes('auth_api.recover_to_enrollment') || sql.includes('auth_api.consume_enrollment_cas') || sql.includes('auth_api.reset_password_cas') || sql.includes('auth_api.register_trusted_device') || sql.includes('auth_api.revoke_trusted_device') || sql.includes('auth_api.admin_revoke_trusted_devices') || sql.includes('auth_api.change_access_owned') || sql.includes('auth_api.set_user_access_rule') || sql.includes('auth_api.set_access_role') || sql.includes('auth_api.set_role_membership') || sql.includes('auth_api.set_role_access_rule') || sql.includes('auth_api.revoke_access_assignment'))) emailConsumption = true
        if(sql==='COMMIT' && loseNextCommitAck && emailConsumption){
          loseNextCommitAck=false;emailConsumption=false
          await client.query(sql,values)
          throw new Error('REDACTED_COMMIT_ACK_LOST')
        }
        if (sql === 'COMMIT' && failNextEmailCommit && emailConsumption) {
          failNextEmailCommit = false; emailConsumption = false
          const pid = await client.query('SELECT pg_backend_pid() AS pid')
          await admin.query('SELECT pg_terminate_backend($1::int)',[pid.rows[0].pid])
        }
        return await client.query(sql, values)
      }
      catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN'
        queryFailures.push({ operation: /(?:auth_api|identity_private)\.[a-z_]+/.exec(sql)?.[0] ?? 'transaction', sqlstate: /^[0-9A-Z]{5}$/.test(code) ? code : 'TRANSPORT' })
        throw error
      }
    }, release(discard?: boolean) { client.release(discard) } }
  } }
  const corpus=Buffer.from(createHash('sha256').update('Compromised fixture password!').digest('hex')+'\n')
  const passwordAdmission=createPasswordAdmission({version:'synthetic-browser-fixture-v1',content:corpus,sha256:createHash('sha256').update(corpus).digest('hex')},{minimumCodePoints:numeric('password_min'),maximumCodePoints:numeric('password_max'),maximumCorpusBytes:1024})
  const backend = createApprovedPrivateBackend(privatePool, {
    passwordAdmission,
    factors: { dummyPasswordHash: await hash('PG05 synthetic dummy never an identity', { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }), auditKey: randomBytes(32), otpKey, recoveryKey,
      async decryptTotp(bytes, version, record) {
        assert.equal(version, 'pg05-ephemeral'); assert.equal(record.binding.tenantId, input.tenant)
        assert.ok(record.binding.userId===input.user || record.binding.userId===resetTarget?.user);
         assert.equal(record.algorithm, 'SHA256'); assert.equal(bytes[0], 2)
        return openEnrollmentSecret(bytes, key, version, { ...enrollmentContext, userId:record.binding.userId, methodId: record.binding.methodId })
      } },
    mail: emailScenario ? { async withWriteKey(tenant, work) { assert.equal(tenant,input.tenant); const borrowed=Buffer.from(mailKey); try{return work(borrowed,'synthetic-mail-browser-v1')} finally{borrowed.fill(0)} } } : undefined,
    enrollment: {
      async withWriteKey(tenantId, work) { assert.equal(tenantId, input.tenant); const borrowed = Buffer.from(key); try { return work(borrowed, 'pg05-ephemeral') } finally { borrowed.fill(0) } },
      async accountAlias() { return 'synthetic-enrollment-alias' },
    },
    cursorKey: randomBytes(32), transport: () => ({ network: fixtureNetwork, device: fixtureDevice }),
    normalizeEmail: email => email.trim().toLowerCase(), maxEligibleTotpMethods: 4,
    sessionLabels: () => ({ device: 'Synthetic PG05', browser: 'Synthetic PG05' }),
  })
  const handler = createAuthHandler(backend, origin)
  let previousDeliveryKey: string | undefined
  let controlId = input.rpcId
  const reply = (value: object, rpcId = controlId) => process.stdout.write(JSON.stringify({ ...value, rpcId }) + '\n')
  const pendingRequests = new Set<Promise<unknown>>()
  setupComplete=true;reply({ ready: true })
  for (;;) {
    const line = await iterator.next()
    if (line.done) break
    const message = JSON.parse(line.value)
    controlId = message.rpcId
    try {
      if(input.scenario==='abuse' && message.kind==='rotateAbuseTransport'){
        if(message.network)randomBytes(32).copy(fixtureNetwork)
        if(message.device)randomBytes(32).copy(fixtureDevice)
        reply({ok:true});continue
      }
      if(input.scenario==='abuse' && message.kind==='ageRateWindow'){
        const keys=[...fixtureRateKeys].map(k=>Buffer.from(k,'hex'))
        await admin.query('UPDATE identity_private.rate_buckets SET window_start=window_start-make_interval(secs=>$2) WHERE key_digest=ANY($1::bytea[])',[keys,numeric('rate_window')])
        reply({ok:true});continue
      }
      if(input.scenario==='abuse' && message.kind==='disableAbusePrincipal'){
        await admin.query("UPDATE identity_private.principals SET state='DISABLED' WHERE id=$1",[input.principal]);reply({ok:true});continue
      }
      if(input.scenario==='abuse' && message.kind==='ageChallengeCooldown'){
        await admin.query("UPDATE app.mfa_challenges SET issued_at=issued_at-make_interval(secs=>$3),expires_at=expires_at-make_interval(secs=>$3) WHERE tenant_id=$1 AND user_id=$2 AND state='ISSUED'",[input.tenant,input.user,numeric('otp_resend_cooldown')+1]);reply({ok:true});continue
      }
      if(input.scenario==='abuse' && message.kind==='expireAbuseChallenge'){
        await admin.query("UPDATE app.mfa_challenges SET issued_at=statement_timestamp()-make_interval(secs=>$3)-interval '1s',expires_at=statement_timestamp()-interval '1s' WHERE tenant_id=$1 AND user_id=$2 AND state='ISSUED'",[input.tenant,input.user,numeric('email_otp_ttl')]);reply({ok:true});continue
      }
      if(input.scenario==='abuse' && message.kind==='inspectAbuse'){
        const keys=[...fixtureRateKeys].map(k=>Buffer.from(k,'hex'))
        const rates=await admin.query("SELECT dimension,purpose,max(count)::int AS maximum,count(*)::int AS buckets FROM identity_private.rate_buckets WHERE key_digest=ANY($1::bytea[]) AND window_start=to_timestamp(floor(extract(epoch FROM statement_timestamp())/$2)*$2) GROUP BY dimension,purpose",[keys,numeric('rate_window')])
        const events=await admin.query("SELECT code,count(*)::int AS total,bool_and(octet_length(principal_hash)=32) AS subject_hashed,bool_and(network_hash IS NULL OR octet_length(network_hash)=32) AS network_hashed,bool_and(device_hash IS NULL OR octet_length(device_hash)=32) AS device_hashed FROM identity_private.security_log WHERE correlation_id=ANY($1::uuid[]) GROUP BY code",[[...fixtureCorrelations]])
        const sessions=await admin.query("SELECT count(*)::int AS active FROM app.sessions WHERE tenant_id=$1 AND user_id=$2 AND state='ACTIVE'",[input.tenant,input.user])
        const challenges=await admin.query('SELECT state,attempts FROM app.mfa_challenges WHERE tenant_id=$1 AND user_id=$2 ORDER BY issued_at',[input.tenant,input.user])
        const methods=await admin.query("SELECT count(*) FILTER(WHERE last_totp_counter IS NOT NULL)::int AS consumed FROM app.mfa_methods WHERE tenant_id=$1 AND user_id=$2 AND kind='TOTP'",[input.tenant,input.user])
        reply({rates:rates.rows,events:events.rows,active:sessions.rows[0].active,challenges:challenges.rows,consumedMethods:methods.rows[0].consumed});continue
      }
      if(message.kind==='accessFixture'  && resetTarget){reply({targetUser:resetTarget.user,targetEmail:resetTarget.email,roleId:accessRole,roleRuleId:accessRoleRule,ruleId:accessTargetRule,resourceId:accessResource,foreignResource:accessForeign,foreignUser:input.otherUser});continue}
      if(message.kind==='inspectAccess'){
        const policy=await admin.query('SELECT version::text AS version FROM app.policy_versions WHERE tenant_id=$1',[input.tenant])
        const rules=await admin.query('SELECT id,effect,action,resource_kind,revoked_at FROM app.access_rules WHERE tenant_id=$1 AND (id=$2 OR id=$3)',[input.tenant,accessTargetRule,accessRoleRule])
        const audit=await admin.query("SELECT action,outcome,safe_metadata,actor_user_id IS NOT NULL AS actor_recorded FROM app.audit_logs WHERE tenant_id=$1 AND actor_user_id=$2 AND action IN('auth.access.change','auth.access.revoke','auth.role.change','auth.role.assign','auth.role.permission','auth.access.denied','auth.access.change.detail') ORDER BY occurred_at",[input.tenant,input.user])
        reply({policy:policy.rows[0].version,rules:rules.rows,audit:audit.rows});continue
      }
      if(message.kind==='denyAccessOperator'){
        await admin.query("UPDATE app.access_rules SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2 AND action='manage_permissions'",[input.tenant,input.user]);reply({ok:true});continue
      }
      if(message.kind==='inspectTrusted'){
        const rows=await admin.query('SELECT id,created_at,expires_at,revoked_at,octet_length(token_digest)=32 AS digest_only FROM app.trusted_devices WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at',[input.tenant,input.user])
        const audit=await admin.query("SELECT action,count(*)::int AS n FROM app.audit_logs WHERE tenant_id=$1 AND actor_user_id=$2 AND action LIKE 'auth.device.%' GROUP BY action",[input.tenant,input.user])
        reply({devices:rows.rows,audit:audit.rows});continue
      }
      if(message.kind==='seedTrustedPage'){
        await admin.query("INSERT INTO app.trusted_devices SELECT $1,gen_random_uuid(),$2,$3,crypto.digest(gen_random_uuid()::text,'sha256'),1,statement_timestamp(),statement_timestamp()+interval '30 days',NULL FROM generate_series(1,$4::int)",[input.tenant,input.user,input.principal,numeric('page_max')+1]);reply({ok:true});continue
      }
      if(message.kind==='expireTrusted'){
        await admin.query("UPDATE app.trusted_devices SET created_at=clock_timestamp()-interval '31 days',expires_at=clock_timestamp()-interval '2 days' WHERE tenant_id=$1 AND user_id=$2",[input.tenant,input.user]);reply({ok:true});continue
      }
      if(message.kind==='disableTrusted'){
        await admin.query('UPDATE app.auth_preferences SET trusted_devices_enabled=false WHERE tenant_id=$1',[input.tenant]);reply({ok:true});continue
      }
      if(message.kind==='foreignTrusted'){
        const id=randomUUID(),value=randomBytes(32).toString('base64url')
        await admin.query("INSERT INTO app.trusted_devices VALUES($1,$2,$3,(SELECT principal_id FROM app.users WHERE tenant_id=$1 AND id=$3),$4,1,statement_timestamp(),statement_timestamp()+interval '30 days',NULL)",[input.otherTenant,id,input.otherUser,createHash('sha256').update(value).digest()])
        reply({deviceId:id,targetUser:input.otherUser,token:value});continue
      }
      if(message.kind==='targetTrusted' && resetTarget){
        await admin.query("INSERT INTO app.trusted_devices VALUES($1,$2,$3,$4,$5,1,statement_timestamp(),statement_timestamp()+interval '30 days',NULL)",[input.tenant,randomUUID(),resetTarget.user,resetTarget.principal,randomBytes(32)])
        reply({targetUser:resetTarget.user});continue
      }
      if(message.kind==='targetTrustedState' && resetTarget){
        const result=await admin.query('SELECT count(*) FILTER(WHERE revoked_at IS NULL)::int AS active FROM app.trusted_devices WHERE tenant_id=$1 AND user_id=$2',[input.tenant,resetTarget.user]);reply(result.rows[0]);continue
      }
      if(message.kind==='loseResetCommitAck'){loseNextCommitAck=true;emailConsumption=false;reply({armed:true});continue}
      if (['failEmailCommit','failFactorCommit'].includes(message.kind)) { failNextEmailCommit = true; emailConsumption = false; reply({ armed: true }); continue }
      if(message.kind==='recoveryProof'){reply({code:fixtureRecoveryCode});continue}
      if(message.kind==='resetProof'){
        const verifier=new Pool({host:'/var/run/postgresql',database:'core',user:'pgtest_verifier'})
        try{await verifier.query("SELECT auth_api.attest_reset($1::uuid,$2::uuid,$3::bytea,'PASSWORD',$4::uuid,$5::timestamptz,$6::uuid)",[input.tenant,resetTarget?.user??input.user,createHash('sha256').update(resetTicket).digest(),randomUUID(),new Date(Date.now()+numeric('preauth_ttl')*1000),randomUUID()])}finally{await verifier.end()}
        reply({ticket:resetTicket,code:fixtureRecoveryCode,targetUser:resetTarget?.user,targetEmail:resetTarget?.email});continue
      }
      if(message.kind==='crossTenantResetProof'){
        const foreignTicket=randomBytes(32).toString('base64url'),verifier=new Pool({host:'/var/run/postgresql',database:'core',user:'pgtest_verifier'})
        try{await verifier.query("SELECT auth_api.attest_reset($1::uuid,$2::uuid,$3::bytea,'PASSWORD',$4::uuid,$5::timestamptz,$6::uuid)",[input.otherTenant,input.otherUser,createHash('sha256').update(foreignTicket).digest(),randomUUID(),new Date(Date.now()+numeric('preauth_ttl')*1000),randomUUID()])}finally{await verifier.end()}
        reply({ticket:foreignTicket,targetUser:input.otherUser});continue
      }
      if(message.kind==='expireApproval'){
        await admin.query("UPDATE app.step_up_evidence SET verified_at=clock_timestamp()-interval '1m',expires_at=clock_timestamp()-interval '1s' WHERE user_id=$1",[input.user]);reply({ok:true});continue
      }
      if(message.kind==='denyResetAuthorization'){
        await admin.query("UPDATE app.access_rules SET revoked_at=clock_timestamp() WHERE user_id=$1",[input.user]);reply({ok:true});continue
      }
      if(message.kind==='targetProof' && resetTarget){
        reply({proof:TOTP.generate({secret:new Secret({buffer:Uint8Array.from(resetTarget.secret).buffer}),algorithm:'SHA256',period:numeric('totp_period'),digits:numeric('totp_digits')})});continue
      }
      if(message.kind==='expireReset'){
        await admin.query("UPDATE identity_private.reset_tickets SET created_at=clock_timestamp()-interval '700s',expires_at=clock_timestamp()-interval '1s' WHERE principal_id=$1",[input.principal]);reply({ok:true});continue
      }
      if(message.kind==='inspectReset'){
        const credentials=await admin.query('SELECT credential_version::text AS version FROM identity_private.credentials WHERE principal_id=$1',[resetTarget?.principal??input.principal])
        const tickets=await admin.query('SELECT count(*) FILTER(WHERE consumed_at IS NOT NULL)::int AS consumed FROM identity_private.reset_tickets WHERE principal_id=$1',[resetTarget?.principal??input.principal])
        const codes=await admin.query('SELECT count(*) FILTER(WHERE consumed_at IS NOT NULL)::int AS consumed FROM app.recovery_codes WHERE tenant_id=$1 AND user_id=$2',[input.tenant,resetTarget?.user??input.user])
        const sessions=await admin.query("SELECT count(*) FILTER(WHERE state='ACTIVE')::int AS active FROM app.sessions WHERE principal_id=$1",[resetTarget?.principal??input.principal])
        reply({version:credentials.rows[0].version,tickets:tickets.rows[0].consumed,codes:codes.rows[0].consumed,active:sessions.rows[0].active});continue
      }

      if(message.kind==='expireRecovery'){
        await admin.query("UPDATE identity_private.preauth SET created_at=clock_timestamp()-interval '700 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE principal_id=$1",[input.principal]);reply({ok:true});continue
      }
      if(message.kind==='inspectRecovery'){
        const preauth=await admin.query('SELECT state,expires_at FROM identity_private.preauth WHERE principal_id=$1 ORDER BY created_at',[input.principal])
        const methods=await admin.query('SELECT state FROM app.mfa_methods WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at',[input.tenant,input.user])
        const codes=await admin.query('SELECT count(*) FILTER(WHERE consumed_at IS NOT NULL)::int AS consumed,count(*) FILTER(WHERE revoked_at IS NULL AND consumed_at IS NULL)::int AS unused,bool_and(octet_length(digest)=32) AS hmac_only FROM app.recovery_codes WHERE tenant_id=$1 AND user_id=$2',[input.tenant,input.user])
        const sessions=await admin.query("SELECT count(*)::int AS n FROM app.sessions WHERE tenant_id=$1 AND user_id=$2 AND state='ACTIVE'",[input.tenant,input.user])
        const tags=lastProofFingerprint?await admin.query('SELECT NOT EXISTS(SELECT 1 FROM identity_private.ceremony_idempotency WHERE request_digest=$1) AS keyed',[lastProofFingerprint]):null
        const bindingTable=await admin.query("SELECT to_regclass('identity_private.recovery_enrollments') IS NOT NULL AS present")
        const bindings=bindingTable.rows[0].present?await admin.query('SELECT count(*)::int AS n FROM identity_private.recovery_enrollments WHERE tenant_id=$1 AND user_id=$2',[input.tenant,input.user]):null
        reply({preauth:preauth.rows,methods:methods.rows,codes:codes.rows[0],active:sessions.rows[0].n,recoveryBindings:bindings?.rows[0].n,proofFingerprintProtected:tags?.rows[0].keyed});continue
      }
      if (message.kind === 'diagnostics') { reply({ failures:queryFailures }); continue }
      if (message.kind === 'fixtureEmail') { reply({ email: input.email }); continue }
      if (message.kind === 'deliverEmail') {
        let proof = '', sameDeliveryKey = false
        const result = await dispatchOneMail({ store: createMailDispatchStore(mailPool as unknown as IdentityPool), now: Date.now,
          async withReadKey(tenant, version, work) { assert.equal(tenant,input.tenant); assert.equal(version,'synthetic-mail-browser-v1');return work(mailKey) },
          async deliver(payload, deliveryKey) { assert.equal(payload.recipient,input.email);proof=payload.code;sameDeliveryKey=previousDeliveryKey===deliveryKey;previousDeliveryKey=deliveryKey;return message.uncertain ? 'UNKNOWN' : message.transient ? 'TRANSIENT' : 'ACCEPTED' } })
        reply({ result, proof, sameDeliveryKey }); continue
      }
      if (message.kind === 'retryMailReady') {
        await admin.query("UPDATE app.auth_outbox SET available_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND user_id=$2 AND state='PENDING'",[input.tenant,input.user]);reply({ok:true});continue
      }
      if (message.kind === 'revokeRecipient') {
        await admin.query('UPDATE app.verified_recipients SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2',[input.tenant,input.user]);reply({ok:true});continue
      }
      if (message.kind === 'emailClock') {
        await admin.query("UPDATE app.mfa_challenges SET issued_at=clock_timestamp()-interval '60 seconds' WHERE tenant_id=$1 AND user_id=$2 AND kind='EMAIL_OTP'",[input.tenant,input.user])
        if (message.expire) await admin.query("UPDATE app.mfa_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND user_id=$2 AND kind='EMAIL_OTP'",[input.tenant,input.user])
        reply({ ok:true });continue
      }
      if (message.kind === 'inspectEmail') {
        const methods=await admin.query("SELECT state FROM app.mfa_methods WHERE tenant_id=$1 AND user_id=$2 AND kind='EMAIL_OTP'",[input.tenant,input.user])
        const sessions=await admin.query("SELECT count(*)::int AS n FROM app.sessions WHERE tenant_id=$1 AND user_id=$2 AND state='ACTIVE'",[input.tenant,input.user])
        const outbox=await admin.query('SELECT state,octet_length(payload_ciphertext)::int AS bytes FROM app.auth_outbox WHERE tenant_id=$1 AND user_id=$2 ORDER BY available_at',[input.tenant,input.user])
        const challenges=await admin.query("SELECT state,attempts,octet_length(proof_digest)::int AS digest_bytes,extract(epoch FROM (expires_at-issued_at))::float AS ttl FROM app.mfa_challenges WHERE tenant_id=$1 AND user_id=$2 AND kind='EMAIL_OTP' ORDER BY issued_at",[input.tenant,input.user])
        const fingerprints=lastProofFingerprint ? await admin.query('SELECT NOT EXISTS(SELECT 1 FROM identity_private.ceremony_idempotency WHERE request_digest=$1) AND NOT EXISTS(SELECT 1 FROM app.idempotency_records WHERE request_digest=$1) AS keyed',[lastProofFingerprint]) : null
        reply({ methods:methods.rows, active:sessions.rows[0].n, outbox:outbox.rows, challenges:challenges.rows, proofFingerprintProtected:fingerprints?.rows[0].keyed });continue
      }
      if(message.kind==='primaryMethod'){reply({id:method});continue}
      if (message.kind === 'proof') {
        const proof = TOTP.generate({ secret: new Secret({ buffer: Uint8Array.from(secret).buffer }), algorithm: 'SHA256', period: numeric('totp_period'), digits: numeric('totp_digits'), timestamp: Date.now() + (message.next ? numeric('totp_period') * 1000 : 0) })
        reply({ proof }); continue
      }
      if (message.kind === 'inspectEnrollment') {
        const methods = await admin.query('SELECT state,algorithm,octet_length(secret_ciphertext) AS bytes,last_totp_counter,method_version FROM app.mfa_methods WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC',[input.tenant,input.user])
        const codes = await admin.query('SELECT count(*) FILTER(WHERE revoked_at IS NULL)::int AS count,count(*) FILTER(WHERE revoked_at IS NOT NULL)::int AS revoked,bool_and(octet_length(digest)=32) AS hmac_only FROM app.recovery_codes WHERE tenant_id=$1 AND user_id=$2',[input.tenant,input.user])
        reply({ methods: methods.rows, recoveryCount: codes.rows[0].count, recoveryHmacOnly: codes.rows[0].hmac_only, revokedRecoveryCount: codes.rows[0].revoked }); continue
      }
      if (message.kind === 'inspect') {
        const rows = await admin.query("SELECT s.state,m.last_totp_counter FROM app.sessions s JOIN app.mfa_methods m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id WHERE s.tenant_id=$1 AND s.user_id=$2 AND m.id=$3 ORDER BY s.created_at DESC", [input.tenant,input.user,method])
        reply({ expectedSessions: numeric('page_default') + 2, states: rows.rows.map(r => r.state), counterConsumed: rows.rows.some(r => r.last_totp_counter !== null) }); continue
      }
      if (message.kind === 'bootstrap') {
        const result = await handler.bootstrap()
        reply(result instanceof Response ? { status: result.status } : { status: 200, cookies: result.headers.getSetCookie() }); continue
      }
      if (['confirmEmail','verifyMfa','recoverMfa'].includes(message.operation)) {
        lastProofFingerprint=createHash('sha256').update(canonical(JSON.parse(message.body))).digest()
      }
      const requestId = message.rpcId
      const task = (async () => {
        try {
          const response = await handler.handle(new Request(origin + message.path, { method: message.method, headers: message.headers, body: message.body || undefined }), message.operation)
          reply({ status: response.status, headers: [...response.headers].filter(([k]) => k !== 'set-cookie'), cookies: response.headers.getSetCookie(), body: await response.text() }, requestId)
        } catch { reply({ status: 503, transportFailure: true }, requestId) }
      })()
      pendingRequests.add(task)
      void task.finally(() => pendingRequests.delete(task))
    } catch { reply({ status: 503, transportFailure: true }) }
  }
  await Promise.allSettled([...pendingRequests])
} catch(error) {
  if(!setupComplete){const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'UNKNOWN';process.stdout.write(JSON.stringify({rpcId:input.rpcId,ready:false,sqlstate:/^[0-9A-Z]{5}$/.test(code)?code:'UNKNOWN'})+'\n')}
  process.exitCode=1
} finally {
  key.fill(0); secret.fill(0); resetTarget?.secret.fill(0); recoveryKey.fill(0); mailKey.fill(0); otpKey.fill(0)
  await mailPool.end()
  await identity.end(); await admin.end()
}
