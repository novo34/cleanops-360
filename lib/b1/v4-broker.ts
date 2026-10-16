import { AuthError } from './service.ts'
import { createPgIdentityUnitOfWork, type IdentityConnection, type IdentityPool } from './pg-identity-driver.ts'

/** Internal identity-service calls only. No public RPC, SQL interpolation, tables or role changes.
 * Signatures are copied from canonical V4; values are always separate pg parameters. */
const statements = {
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
export type BrokerArgs = {
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
type Result<K extends keyof BrokerArgs> = typeof statements[K]['kind'] extends 'rows' ? Row[] :
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
function decode<K extends keyof BrokerArgs>(operation: K, result: unknown): Result<K> {
  if (!object(result) || !Array.isArray(result.rows) || !result.rows.every(object)) throw unavailable()
  const { kind } = statements[operation], rows = result.rows as Row[]
  if (kind === 'rows') return rows as Result<K>
  if (rows.length !== 1 || !Object.hasOwn(rows[0], 'value')) throw unavailable()
  const value = rows[0].value
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
            try { return decode(operation, await query) }
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
