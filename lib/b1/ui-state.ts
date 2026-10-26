export type AuthState = { state: 'ACTIVE'; session_id: string; tenant_id: string; absolute_expires_at: string }
  | { state: 'PENDING_MFA'; challenge_id: string; allowed_methods: string[]; expires_at: string }
  | { state: 'ENROLLMENT_REQUIRED'; allowed_methods: string[]; expires_at: string }
  | { state: 'TENANT_SELECTION_REQUIRED'; expires_at: string }
export type ViewState = { auth: AuthState | null; tenants: unknown[]; sessions: unknown[]; enrollment: unknown | null; codes: string[] }
export const emptyView: ViewState = { auth: null, tenants: [], sessions: [], enrollment: null, codes: [] }
export function receiveAuth(previous: ViewState, auth: AuthState): ViewState {
  // Pending destination never renders source-company records. Restoring source requires a fresh API read.
  const retain = auth.state === 'ACTIVE' && previous.auth?.state === 'ACTIVE' && auth.tenant_id === previous.auth.tenant_id
  return { ...emptyView, auth, tenants: retain ? previous.tenants : [], sessions: retain ? previous.sessions : [] }
}
