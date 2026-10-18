import { createPgIdentityUnitOfWork, type IdentityPool, type IdentityConnection } from './pg-identity-driver.ts'
import { valid } from './contracts.ts'
import { numeric } from './config.ts'
import { privateArtifact } from './ceremony-preparation.ts'
import { AuthError } from './service.ts'
import type { MailClaim, MailDispatchStore, MailOutcome } from './mail-worker.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown) => valid({type:'string',format:'uuid'},v)
async function query(c: IdentityConnection, sql: string, values: unknown[]) {
  const result = await c.query(sql,values)
  if (!object(result) || !Array.isArray(result.rows) || result.rows.length!==1 || !object(result.rows[0]) ||
      !Object.hasOwn(result.rows[0],'value')) throw unavailable()
  return result.rows[0].value
}
function digest(value: Buffer, correlation: string) {
  if (!Buffer.isBuffer(value) || value.length!==32 || !uuid(correlation)) throw unavailable()
}
function parseClaim(v: unknown): MailClaim | null {
  if (v===null) return null
  if (!object(v) || Object.keys(v).length!==10) throw unavailable()
  for (const k of ['tenantId','userId','methodId','outboxId','challengeId']) if (!uuid(v[k])) throw unavailable()
  for (const k of ['methodVersion','recipientVersion'])
    if (typeof v[k]!=='string' || !/^[1-9][0-9]{0,18}$/.test(v[k]) || BigInt(v[k])>9223372036854775807n) throw unavailable()
  if (typeof v.ciphertext!=='string' || !/^(?:[a-f0-9]{2})+$/.test(v.ciphertext) || v.ciphertext.length<60 ||
      v.ciphertext.length>(numeric('json_body_max')+29)*2 || typeof v.keyVersion!=='string' || !v.keyVersion.length ||
      v.keyVersion.length>120 || /[\p{Cc}\p{Cf}]/u.test(v.keyVersion) || typeof v.expiresAt!=='string') throw unavailable()
  const expiresAt=Date.parse(v.expiresAt)
  if (!Number.isSafeInteger(expiresAt) || expiresAt<=0) throw unavailable()
  const context=Object.freeze({tenantId:v.tenantId as string,userId:v.userId as string,methodId:v.methodId as string,
    methodVersion:v.methodVersion as string,recipientVersion:v.recipientVersion as string,outboxId:v.outboxId as string,challengeId:v.challengeId as string})
  return privateArtifact({}, {context,ciphertext:Buffer.from(v.ciphertext,'hex'),keyVersion:v.keyVersion,expiresAt})
}
/** Concrete parameterized REVIEW06 calls. Dedicated worker pool only; no wiring,
 * fallback, table access, role assumption or automatic transport retries.
 * Each method uses the existing unit of work and resolves only after COMMIT. */
export function createMailDispatchStore(pool: IdentityPool): MailDispatchStore {
  const {run}=createPgIdentityUnitOfWork(pool)
  return Object.freeze({
    async claim(claimDigest: Buffer,correlation: string) {
      digest(claimDigest,correlation);let result: MailClaim | null=null
      try {return await run(async c=>{
        result=parseClaim(await query(c,'SELECT auth_api.claim_mail_v2($1::bytea,$2::uuid) AS value',[claimDigest,correlation]))
        return result
      })} catch {if(result!==null)(result as MailClaim).ciphertext.fill(0);throw unavailable()}
    },
    async authorizeDispatch(claim: MailClaim,claimDigest: Buffer,correlation: string) {
      digest(claimDigest,correlation)
      if(!uuid(claim.context.tenantId)||!uuid(claim.context.outboxId))throw unavailable()
      return run(async c=>{
        const v=await query(c,'SELECT auth_api.authorize_mail_dispatch($1::uuid,$2::uuid,$3::bytea,$4::uuid) AS value',
          [claim.context.tenantId,claim.context.outboxId,claimDigest,correlation])
        if(typeof v!=='boolean')throw unavailable();return v
      })
    },
    async finish(claim: MailClaim,claimDigest: Buffer,outcome: MailOutcome,correlation: string) {
      digest(claimDigest,correlation)
      if(!uuid(claim.context.tenantId)||!uuid(claim.context.outboxId)||!['ACCEPTED','TRANSIENT','PERMANENT','UNKNOWN'].includes(outcome))throw unavailable()
      return run(async c=>{
        const v=await query(c,'SELECT auth_api.finish_mail_outcome_cas($1::uuid,$2::uuid,$3::bytea,$4::text,$5::uuid) AS value',
          [claim.context.tenantId,claim.context.outboxId,claimDigest,outcome,correlation])
        if(typeof v!=='boolean')throw unavailable();return v
      })
    },
  })
}
