import { contract, valid } from '../b1/contracts.ts'
import { AuthError, type Binding, type Effect, type Input } from '../b1/service.ts'
import type { V4Broker } from '../b1/v4-broker.ts'

/** Called only after B1 revalidates the server identity in its transaction.
 * SQL owns the module decision, effective_access, CAS and atomic audit.
 * There is no tenant/actor/grant input and no memory persistence fallback. */
export async function crmRecord(broker: V4Broker, operation: string, input: Input, binding: Binding, correlation: string, owned?: { key: Buffer; request: Buffer }): Promise<Effect | AuthError> {
  if (binding.kind !== 'ACTIVE' || !binding.tenantId || !binding.userId) throw new AuthError(401, 'AUTH_INVALID')
  let data: unknown
  let schema: string
  if (operation === 'listCrmCompanies') {
    data = await broker.call('crmCompanies', [String(input.search ?? ''), input.clients_only === 'true', input.after ? String(input.after) : null])
    schema = 'CRMPageResponse'
  } else if (operation === 'getCrmCompany') {
    data = await broker.call('crmCompany', [String(input.company_id)])
    schema = 'CRMDetailResponse'
  } else if (operation === 'changeCrmRecord') {
    if (!valid(contract.components.schemas.CRMChangeInput, input)) throw new AuthError(422, 'INVALID_INPUT')
    if (!owned || owned.key.length !== 32 || owned.request.length !== 32) throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
    data = await broker.call('crmChange', [JSON.stringify(input), owned.key, owned.request, correlation])
    schema = 'CRMChangeResponse'
    if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
      const error = data as { error: unknown }
      const statuses: Record<string, number> = { CRM_CONFLICT: 409, POLICY_DENIED: 403, NOT_FOUND: 404, INVALID_INPUT: 422, CRM_MODULE_UNAPPROVED: 403 }
      if (Object.keys(data).length !== 1 || typeof error.error !== 'string' || !statuses[error.error]) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
      return new AuthError(statuses[error.error], error.error)
    }
  } else throw new AuthError(404, 'NOT_FOUND')
  if (!valid(contract.components.schemas[schema], { data, meta: { correlation_id: correlation } })) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
  if (operation !== 'listCrmCompanies' && input.company_id && (data as Input).id !== input.company_id) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
  return { data }
}
