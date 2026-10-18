import { inspect } from 'node:util'
import { AuthError } from './service.ts'
import { createPgIdentityUnitOfWork, type IdentityConnection, type IdentityPool } from './pg-identity-driver.ts'

/** Internal identity-service calls only. No public RPC, SQL interpolation, tables or role changes.
 * Signatures follow canonical V4 and owner-approved B1-X/D1 design contracts; values stay separate pg parameters. */
const statements = {
"mailMaterial": {"sql": "SELECT auth_api.mail_recipient_material($1::text,$2::text,$3::text,$4::uuid) AS value", "arity": 4, "kind": "json"},
"beginEmail": {"sql": "SELECT auth_api.begin_email_enrollment($1::text,$2::uuid,$3::bigint,$4::uuid) AS value", "arity": 4, "kind": "uuid"},
"issueEmailEnrollment": {"sql": "SELECT auth_api.issue_email_enrollment($1::text,$2::uuid,$3::bigint,$4::bigint,$5::uuid,$6::uuid,$7::bytea,$8::bytea,$9::text,$10::timestamptz,$11::uuid) AS value", "arity": 11, "kind": "uuid"},
"issueEmail": {"sql": "SELECT auth_api.issue_email_assigned($1::text,$2::uuid,$3::bigint,$4::bigint,$5::uuid,$6::uuid,$7::bytea,$8::bytea,$9::text,$10::timestamptz,$11::text,$12::uuid,$13::uuid) AS value", "arity": 13, "kind": "uuid"},
"consumeEmail": {"sql": "SELECT auth_api.consume_email_v2($1::text,$2::uuid,$3::bytea,$4::bigint,$5::bigint,$6::uuid) AS value", "arity": 6, "kind": "boolean"},

"mfaMaterial": {"sql":"SELECT auth_api.trusted_mfa_material($1::text, $2::text, $3::text, $4::uuid) AS value","arity":4,"kind":"json"},
"boundChallenge": {"sql":"SELECT auth_api.issue_bound_challenge($1::text, $2::text, $3::uuid, $4::bigint, $5::bytea, $6::bytea, $7::text, $8::text, $9::uuid, $10::uuid) AS value","arity":10,"kind":"uuid"},
"enrollAssigned": {"sql":"SELECT auth_api.begin_totp_enrollment_assigned($1::text, $2::uuid, $3::uuid, $4::uuid, $5::bigint, $6::bytea, $7::text, $8::text, $9::uuid) AS value","arity":9,"kind":"json"},
"credentialLocked": {"sql":"SELECT * FROM auth_api.credential_material_locked($1::text)","arity":1,"kind":"rows"},
"rehashCas": {"sql":"SELECT auth_api.rehash_credential_cas($1::uuid, $2::bigint, $3::text, $4::text) AS value","arity":4,"kind":"boolean"},
"preauthVerified": {"sql":"SELECT auth_api.new_preauth_verified($1::uuid, $2::uuid, $3::bigint, $4::text, $5::bytea, $6::bytea) AS value","arity":6,"kind":"uuid"},
"binding": {"sql":"SELECT auth_api.resolve_binding($1::text, $2::text, $3::text) AS value","arity":3,"kind":"json"},
"authorization": {"sql":"SELECT * FROM auth_api.binding_authorization($1::text, $2::text, $3::uuid)","arity":3,"kind":"rows"},
"totpMaterial": {"sql":"SELECT auth_api.totp_material_locked($1::text, $2::uuid, $3::text) AS value","arity":3,"kind":"json"},
"consumeTotp": {"sql":"SELECT auth_api.consume_totp_cas($1::text, $2::uuid, $3::text, $4::bigint, $5::bigint, $6::bigint, $7::uuid) AS value","arity":7,"kind":"boolean"},
"consumeEnrollment": {"sql":"SELECT auth_api.consume_enrollment_cas($1::text, $2::uuid, $3::bigint, $4::bigint, $5::bigint, $6::bytea[], $7::uuid) AS value","arity":7,"kind":"boolean"},
"enrollExplicit": {"sql":"SELECT auth_api.begin_totp_enrollment_explicit($1::text, $2::bytea, $3::text, $4::text, $5::uuid) AS value","arity":5,"kind":"uuid"},
"otpMaterial": {"sql":"SELECT * FROM auth_api.email_otp_material($1::text, $2::uuid)","arity":2,"kind":"rows"},
"consumeOtp": {"sql":"SELECT auth_api.consume_email_otp($1::text, $2::uuid, $3::bytea, $4::uuid) AS value","arity":4,"kind":"boolean"},
"reserveOwned": {"sql":"SELECT auth_api.reserve_owned($1::text, $2::text, $3::bytea, $4::bytea, $5::boolean) AS value","arity":5,"kind":"json"},
"discardOwned": {"sql":"SELECT auth_api.discard_owned($1::text, $2::text, $3::bytea, $4::bytea) AS value","arity":4,"kind":"boolean"},
"completeOwned": {"sql":"SELECT auth_api.complete_owned($1::text, $2::text, $3::bytea, $4::bytea, $5::jsonb) AS value","arity":5,"kind":"boolean"},
  "verifiedTenant": { "sql": "SELECT identity_private.verified_tenant() AS value", "arity": 0, "kind": "uuid" },
  "beginContext": {
    "sql": "SELECT auth_api.begin_verified_context($1::text) AS value",
    "arity": 1,
    "kind": "void"
  },
  "policy": {
    "sql": "SELECT auth_api.security_policy() AS value",
    "arity": 0,
    "kind": "json"
  },
  "bootstrap": {
    "sql": "SELECT auth_api.bootstrap_csrf($1::bytea, $2::bytea) AS value",
    "arity": 2,
    "kind": "void"
  },
  "csrf": {
    "sql": "SELECT auth_api.csrf_valid($1::text, $2::text, $3::text) AS value",
    "arity": 3,
    "kind": "boolean"
  },
  "loginMaterial": {
    "sql": "SELECT * FROM auth_api.login_material($1::text)",
    "arity": 1,
    "kind": "rows"
  },
  "newPreauth": {
    "sql": "SELECT auth_api.new_preauth($1::uuid, $2::uuid, $3::bytea, $4::bytea) AS value",
    "arity": 4,
    "kind": "uuid"
  },
  "preauthSummary": {
    "sql": "SELECT auth_api.preauth_summary($1::text) AS value",
    "arity": 1,
    "kind": "json"
  },
  "activeSummary": {
    "sql": "SELECT auth_api.active_summary() AS value",
    "arity": 0,
    "kind": "json"
  },
  "identity": {
    "sql": "SELECT * FROM auth_api.current_identity()",
    "arity": 0,
    "kind": "rows"
  },
  "memberships": {
    "sql": "SELECT * FROM auth_api.memberships($1::text)",
    "arity": 1,
    "kind": "rows"
  },
  "sessions": {
    "sql": "SELECT * FROM auth_api.own_sessions($1::integer, $2::timestamptz, $3::uuid)",
    "arity": 3,
    "kind": "rows"
  },
  "revokeSession": {
    "sql": "SELECT auth_api.revoke_own_session($1::uuid, $2::uuid) AS value",
    "arity": 2,
    "kind": "count"
  },
  "revokeOtherSessions": {
    "sql": "SELECT auth_api.revoke_other_own_sessions($1::uuid) AS value",
    "arity": 1,
    "kind": "count"
  },
  "touch": {
    "sql": "SELECT auth_api.touch_activity() AS value",
    "arity": 0,
    "kind": "void"
  },
  "selectTenant": {
    "sql": "SELECT auth_api.select_tenant($1::text, $2::uuid, $3::uuid) AS value",
    "arity": 3,
    "kind": "uuid"
  },
  "beginSwitch": {
    "sql": "SELECT auth_api.begin_switch($1::text, $2::bytea, $3::uuid, $4::uuid) AS value",
    "arity": 4,
    "kind": "uuid"
  },
  "issueChallenge": {
    "sql": "SELECT auth_api.issue_challenge($1::text, $2::text, $3::uuid, $4::bytea, $5::bytea, $6::text, $7::text, $8::uuid) AS value",
    "arity": 8,
    "kind": "uuid"
  },
  "challengeMaterial": {
    "sql": "SELECT * FROM auth_api.challenge_material($1::text, $2::uuid)",
    "arity": 2,
    "kind": "rows"
  },
  "enrollmentMaterial": {
    "sql": "SELECT * FROM auth_api.enrollment_material($1::text, $2::uuid)",
    "arity": 2,
    "kind": "rows"
  },
  "verifyChallenge": {
    "sql": "SELECT auth_api.verify_challenge($1::text, $2::uuid, $3::bytea, $4::bigint, $5::uuid) AS value",
    "arity": 5,
    "kind": "boolean"
  },
  "beginEnrollment": {
    "sql": "SELECT auth_api.begin_totp_enrollment($1::text, $2::bytea, $3::text, $4::uuid) AS value",
    "arity": 4,
    "kind": "uuid"
  },
  "confirmEnrollment": {
    "sql": "SELECT auth_api.confirm_totp_enrollment($1::text, $2::uuid, $3::bigint, $4::bytea[], $5::uuid) AS value",
    "arity": 5,
    "kind": "boolean"
  },
  "issueSession": {
    "sql": "SELECT auth_api.issue_active_session($1::text, $2::bytea, $3::bytea, $4::integer, $5::integer, $6::text, $7::text, $8::uuid) AS value",
    "arity": 8,
    "kind": "json"
  },
  "reserveActive": {
    "sql": "SELECT auth_api.reserve_idempotency($1::text, $2::bytea, $3::bytea, $4::boolean) AS value",
    "arity": 4,
    "kind": "json"
  },
  "completeActive": {
    "sql": "SELECT auth_api.complete_idempotency($1::text, $2::bytea, $3::jsonb) AS value",
    "arity": 3,
    "kind": "void"
  },
  "reserveCeremony": {
    "sql": "SELECT auth_api.reserve_ceremony($1::text, $2::text, $3::bytea, $4::bytea, $5::boolean) AS value",
    "arity": 5,
    "kind": "json"
  },
  "completeCeremony": {
    "sql": "SELECT auth_api.complete_ceremony($1::text, $2::text, $3::bytea, $4::jsonb) AS value",
    "arity": 4,
    "kind": "void"
  },
  "rateAttempt": {
    "sql": "SELECT auth_api.rate_attempt($1::bytea, $2::text, $3::text, $4::integer) AS value",
    "arity": 4,
    "kind": "count"
  },
  "securityEvent": {
    "sql": "SELECT auth_api.record_security_event($1::text, $2::bytea, $3::bytea, $4::bytea, $5::uuid) AS value",
    "arity": 5,
    "kind": "void"
  }
} as const
export type MfaPurpose = 'LOGIN' | 'STEP_UP' | 'ENROLLMENT' | 'ISSUE_SESSION'
export type D1EnabledMethod = Readonly<{ id: string; kind: 'TOTP' | 'EMAIL_OTP'; version: string }>
/** Private result, never an HTTP payload. Serialization/inspection are redacted. */
export type D1MfaMaterial = Readonly<{
  tenantId: string; userId: string; bindingId: string
  riskClass: 'SENSITIVE' | 'OPERATIONAL'; enabledMethods: readonly D1EnabledMethod[]
  recipient: string | null; expiresAt: string
}>
export type D1AssignedEnrollment = Readonly<{ methodId: string; initialVersion: '1'; expiresAt: string }>
export type BrokerArgs = {
  mailMaterial: [preauth: string | null, purpose: 'LOGIN' | 'STEP_UP' | 'ENROLLMENT', grant: string | null, resource: string | null]
  beginEmail: [preauth: string | null, method: string, recipientVersion: string, correlation: string]
  issueEmailEnrollment: [preauth: string | null, method: string, methodVersion: string, recipientVersion: string, challenge: string, outbox: string, digest: Buffer, ciphertext: Buffer, keyVersion: string, expires: string, correlation: string]
  issueEmail: [preauth: string | null, method: string, methodVersion: string, recipientVersion: string, challenge: string, outbox: string, digest: Buffer, ciphertext: Buffer, keyVersion: string, expires: string, grant: string | null, resource: string | null, correlation: string]
  consumeEmail: [preauth: string | null, challenge: string, digest: Buffer, methodVersion: string, recipientVersion: string, correlation: string]
  mfaMaterial: [preauth: string | null, purpose: MfaPurpose, grant: string | null, resource: string | null]
  boundChallenge: [preauth: string | null, kind: 'TOTP' | 'EMAIL_OTP', method: string, expectedVersion: string,
    proof: Buffer | null, encryptedPayload: Buffer | null, payloadKey: string | null, grant: string | null, resource: string | null, correlation: string]
  enrollAssigned: [preauth: string | null, tenant: string, user: string, method: string, initialVersion: '1',
    ciphertext: Buffer, keyVersion: string, algorithm: 'SHA1' | 'SHA256' | 'SHA512', correlation: string]
  credentialLocked: [normalizedEmail: string]
  rehashCas: [principal: string, version: string, expected: string, replacement: string]
  preauthVerified: [principal: string, tenant: string | null, version: string, expected: string, cookie: Buffer, csrf: Buffer]
  binding: [cookie: string, csrf: string, mode: 'ACTIVE' | 'PREAUTH' | 'BOOTSTRAP']
  authorization: [preauth: string | null, rule: string, resource: string | null]
  totpMaterial: [preauth: string | null, ceremony: string, purpose: 'LOGIN' | 'STEP_UP' | 'ENROLLMENT']
  consumeTotp: [preauth: string | null, ceremony: string, purpose: 'LOGIN' | 'STEP_UP', version: string, expected: number | null, counter: number | null, correlation: string]
  consumeEnrollment: [preauth: string | null, ceremony: string, version: string, expected: number | null, counter: number, recovery: Buffer[], correlation: string]
  enrollExplicit: [preauth: string | null, ciphertext: Buffer, keyVersion: string, algorithm: 'SHA1' | 'SHA256' | 'SHA512', correlation: string]
  otpMaterial: [preauth: string | null, ceremony: string]
  consumeOtp: [preauth: string | null, ceremony: string, digest: Buffer | null, correlation: string]
  reserveOwned: [preauth: string | null, operation: string, key: Buffer, request: Buffer, oneTime: boolean]
  discardOwned: [preauth: string | null, operation: string, key: Buffer, request: Buffer]
  completeOwned: [preauth: string | null, operation: string, key: Buffer, request: Buffer, safeJson: string | null]
  verifiedTenant: []
  beginContext: [token: string]; policy: []; bootstrap: [digest: Buffer, csrf: Buffer]
  csrf: [cookie: string, csrf: string, mode: 'BOOTSTRAP' | 'PREAUTH' | 'ACTIVE']
  loginMaterial: [normalizedEmail: string]
  newPreauth: [principal: string, tenant: string | null, cookieDigest: Buffer, csrfDigest: Buffer]
  preauthSummary: [cookie: string]; activeSummary: []; identity: []
  memberships: [preauth: string | null]
  sessions: [limit: number, beforeTime: string | null, beforeId: string | null]
  revokeSession: [target: string, correlation: string]; revokeOtherSessions: [correlation: string]; touch: []
  selectTenant: [preauth: string, target: string, correlation: string]
  beginSwitch: [newCookie: string, csrf: Buffer, target: string, correlation: string]
  issueChallenge: [preauth: string | null, kind: 'EMAIL_OTP' | 'TOTP', method: string | null,
    proof: Buffer | null, encryptedPayload: Buffer | null, payloadKey: string | null, grant: string | null, resource: string | null]
  challengeMaterial: [preauth: string | null, challenge: string]
  enrollmentMaterial: [preauth: string | null, enrollment: string]
  verifyChallenge: [preauth: string | null, challenge: string, otpDigest: Buffer | null, verifiedCounter: number | null, correlation: string]
  beginEnrollment: [preauth: string | null, ciphertext: Buffer, keyVersion: string, correlation: string]
  confirmEnrollment: [preauth: string | null, enrollment: string, verifiedCounter: number, recovery: Buffer[], correlation: string]
  issueSession: [preauth: string, tokenDigest: Buffer, csrfDigest: Buffer, absoluteSeconds: number, idleSeconds: number,
    device: string, browser: string, correlation: string]
  reserveActive: [operation: string, key: Buffer, request: Buffer, oneTime: boolean]
  completeActive: [operation: string, key: Buffer, safeJson: string]
  reserveCeremony: [preauth: string, operation: string, key: Buffer, request: Buffer, oneTime: boolean]
  completeCeremony: [preauth: string, operation: string, key: Buffer, safeJson: string]
  rateAttempt: [key: Buffer, dimension: 'USER' | 'IP' | 'DEVICE', purpose: 'LOGIN' | 'OTP_ISSUE' | 'OTP_VERIFY', limit: number]
  securityEvent: [code: 'LOGIN_DENIED' | 'RATE_LIMITED' | 'MFA_DENIED' | 'CSRF_DENIED' | 'DEPENDENCY_FAILURE',
    principal: Buffer | null, network: Buffer | null, device: Buffer | null, correlation: string]
}
type Row = Record<string, unknown>
type Result<K extends keyof BrokerArgs> = K extends 'mfaMaterial' ? D1MfaMaterial :
  K extends 'enrollAssigned' ? D1AssignedEnrollment : typeof statements[K]['kind'] extends 'rows' ? Row[] :
  typeof statements[K]['kind'] extends 'void' ? void :
  typeof statements[K]['kind'] extends 'boolean' ? boolean :
  typeof statements[K]['kind'] extends 'count' ? number :
  typeof statements[K]['kind'] extends 'uuid' ? string : unknown
export interface V4Broker {
  call<K extends keyof BrokerArgs>(operation: K, args: BrokerArgs[K]): Promise<Result<K>>
}
const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
function safeError(error: unknown): AuthError {
  // Match only stable, known broker messages; never surface server diagnostics or SQL.
  if (object(error)) {
    const codes: Record<string, [number, string]> = {
      RATE_LIMITED: [429, 'RATE_LIMITED'],
      AUTH_INVALID: [401, 'AUTH_INVALID'], CREDENTIAL_CHANGED: [401, 'AUTH_INVALID'],
      RESERVATION_NOT_OWNED: [409, 'IDEMPOTENCY_CONFLICT'],
      INVALID_SESSION: [401, 'AUTH_INVALID'], INVALID_CEREMONY: [401, 'AUTH_INVALID'],
      ACCESS_DENIED: [403, 'POLICY_DENIED'], STEP_UP_REQUIRED: [403, 'STEP_UP_REQUIRED'],
      RESOURCE_NOT_FOUND: [404, 'NOT_FOUND'], IDEMPOTENCY_MISMATCH: [409, 'IDEMPOTENCY_MISMATCH'],
      IDEMPOTENCY_KEY_EXPIRED: [409, 'IDEMPOTENCY_EXPIRED'], RESULT_NOT_REPLAYABLE: [409, 'RESULT_NOT_REPLAYABLE'],
    }
    const match = typeof error.message === 'string' ? codes[error.message] : undefined
    if (match && typeof error.code === 'string' && ['42501', 'P0001', 'P0002'].includes(error.code)) return new AuthError(...match)
  }
  return unavailable()
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isSafeInteger(Date.parse(v))
const generation = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && (v.length < 19 || v <= '9223372036854775807')
function keys(value: Row, names: string[]) {
  return Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value, k))
}
function d1Material(value: unknown, args: BrokerArgs['mfaMaterial']): D1MfaMaterial {
  if (!object(value) || !keys(value, ['tenantId', 'userId', 'bindingId', 'riskClass', 'enabledMethods', 'recipient', 'expiresAt']) ||
      !uuid(value.tenantId) || !uuid(value.userId) || !uuid(value.bindingId) ||
      (value.riskClass !== 'SENSITIVE' && value.riskClass !== 'OPERATIONAL') || !timestamp(value.expiresAt) ||
      !Array.isArray(value.enabledMethods)) throw unavailable()
  const methods: D1EnabledMethod[] = value.enabledMethods.map(m => {
    if (!object(m) || !keys(m, ['id', 'kind', 'version']) || !uuid(m.id) ||
        (m.kind !== 'TOTP' && m.kind !== 'EMAIL_OTP') || !generation(m.version)) throw unavailable()
    return Object.freeze({ id: m.id, kind: m.kind, version: m.version })
  })
  if (new Set(methods.map(m => m.id.toLowerCase())).size !== methods.length ||
      !(value.recipient === null || (typeof value.recipient === 'string' && value.recipient.length > 0 &&
        value.recipient.length <= 254 && !/[\r\n\0]/.test(value.recipient))) ||
      (['ENROLLMENT', 'ISSUE_SESSION'].includes(args[1]) && value.recipient !== null)) throw unavailable()
  const result = { tenantId: value.tenantId, userId: value.userId, bindingId: value.bindingId,
    riskClass: value.riskClass as D1MfaMaterial['riskClass'], enabledMethods: Object.freeze(methods), expiresAt: value.expiresAt }
  Object.defineProperty(result, 'recipient', { value: value.recipient, enumerable: false })
  Object.defineProperty(result, 'toJSON', { value: () => '[REDACTED_D1_MATERIAL]' })
  Object.defineProperty(result, inspect.custom, { value: () => '[REDACTED_D1_MATERIAL]' })
  return Object.freeze(result) as D1MfaMaterial
}
function decode<K extends keyof BrokerArgs>(operation: K, result: unknown, args: BrokerArgs[K]): Result<K> {
  if (!object(result) || !Array.isArray(result.rows) || !result.rows.every(object)) throw unavailable()
  const { kind } = statements[operation], rows = result.rows as Row[]
  if (kind === 'rows') return rows as Result<K>
  if (rows.length !== 1 || !Object.hasOwn(rows[0], 'value')) throw unavailable()
  const value = rows[0].value
  if (operation === 'mailMaterial') {
    if (!object(value)) throw unavailable()
    const material = { ...value }
    Object.defineProperty(material, 'recipient', { value: value.recipient, enumerable: false })
    Object.defineProperty(material, 'toJSON', { value: () => '[REDACTED_MAIL_MATERIAL]' })
    Object.defineProperty(material, inspect.custom, { value: () => '[REDACTED_MAIL_MATERIAL]' })
    return Object.freeze(material) as Result<K>
  }
  if (operation === 'mfaMaterial') return d1Material(value, args as BrokerArgs['mfaMaterial']) as Result<K>
  if (operation === 'enrollAssigned') {
    if (!object(value) || !keys(value, ['methodId', 'initialVersion', 'expiresAt']) || !uuid(value.methodId) ||
        value.methodId !== (args as BrokerArgs['enrollAssigned'])[3] || value.initialVersion !== '1' || !timestamp(value.expiresAt)) throw unavailable()
    return Object.freeze({ methodId: value.methodId, initialVersion: '1', expiresAt: value.expiresAt }) as Result<K>
  }
  if (kind === 'void') return undefined as Result<K>
  if (kind === 'boolean' && typeof value !== 'boolean') throw unavailable()
  if (kind === 'count' && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) throw unavailable()
  if (kind === 'uuid' && (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))) throw unavailable()
  return value as Result<K>
}
/** Scoped unit of work, sharing the same runner as the existing private HTTP driver.
 * Escaped repositories and concurrent/unawaited calls cannot commit or use a released client.
 * A SQL error poisons the unit even if a caller catches it (no false successful COMMIT). */
export function createV4IdentityRepository(pool: IdentityPool) {
  const runner = createPgIdentityUnitOfWork(pool)
  return Object.freeze({
    transaction<T>(work: (broker: V4Broker) => Promise<T>): Promise<T> {
      return runner.run(async (connection: IdentityConnection) => {
        let open = true, failed = false
        let pending: Promise<unknown> | undefined
        const broker: V4Broker = Object.freeze({
          async call<K extends keyof BrokerArgs>(operation: K, args: BrokerArgs[K]): Promise<Result<K>> {
            if (!open || failed || pending || !Object.hasOwn(statements, operation) ||
                !Array.isArray(args) || args.length !== statements[operation].arity) {
              failed = true; throw unavailable()
            }
            // Snapshot buffers/arrays before handing them to pg; never retain caller-owned secrets.
            const copy = (v: unknown): unknown => Buffer.isBuffer(v) ? Buffer.from(v) : Array.isArray(v) ? v.map(copy) : v
            const values = args.map(copy)
            const query = Promise.resolve().then(() => connection.query(statements[operation].sql, values))
            pending = query
            try { return decode(operation, await query, values as unknown as BrokerArgs[K]) }
            catch (error) { failed = true; throw safeError(error) }
            finally { pending = undefined }
          },
        })
        try {
          const result = await work(broker)
          if (pending || failed) { failed = true; throw unavailable() }
          return result
        } finally {
          open = false
          // Drain a mistakenly unawaited operation before the runner issues ROLLBACK.
          if (pending) await Promise.allSettled([pending])
        }
      })
    },
  })
}
