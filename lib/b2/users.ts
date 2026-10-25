import { contract, valid } from '../b1/contracts.ts'
import { AuthError, type Binding, type Effect, type Input } from '../b1/service.ts'
import type { V4Broker } from '../b1/v4-broker.ts'

/** Runs only inside B1's resolved, revalidated identity transaction. The existing
 * SQL effective_access function remains the single authorization evaluator. */
export async function readAdministrationUsers(broker: V4Broker, operation: string, input: Input, binding: Binding, correlation: string): Promise<Effect> {
  if (binding.kind !== 'ACTIVE' || !binding.tenantId || !binding.userId) throw new AuthError(401, 'AUTH_INVALID')
  let data: unknown, schema: string
  if (operation === 'listAdministrationUsers') {
    data = await broker.call('administrationUsers', [String(input.search ?? ''), (input.state ?? null) as 'ACTIVE'|'DISABLED'|null, (input.after ?? null) as string|null, Number(input.limit ?? 25)])
    schema = 'B2UsersResponse'
  } else if (operation === 'getAdministrationUser') {
    data = await broker.call('administrationUser', [String(input.target_user_id)])
    schema = 'B2UserResponse'
  } else throw new AuthError(404, 'NOT_FOUND')
  if (!valid(contract.components.schemas[schema], { data, meta: { correlation_id: correlation } })) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
  // The organization is server-resolved and must agree with the active binding.
  if (operation === 'getAdministrationUser' && (data as {organization:{id:string}}).organization.id !== binding.tenantId) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
  if (operation === 'getAdministrationUser' && (data as {user:{id:string}}).user.id.toLowerCase() !== String(input.target_user_id).toLowerCase()) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
  return { data }
}
