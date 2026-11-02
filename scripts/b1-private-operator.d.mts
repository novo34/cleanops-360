export declare function runPrivateOperator(directory: string): Promise<string>
export declare function dispatchPrivateOperator(
  request: { operation: 'device.issue'; device: string; browser: string; lifetimeMs: number; reference: string; authorizationReference: string },
  installation: unknown, prepared: unknown, operatorPool: unknown, operatorSigningKey: unknown, makeRuntime?: unknown,
): Promise<{ state: 'ENROLLED'; id: string; cookieName: string; cookieValue: string; cookieAttributes: string }>
export declare function dispatchPrivateOperator(
  request: { operation: 'device.revoke'; id: string; revision: string; authorizationReference: string },
  installation: unknown, prepared: unknown, operatorPool: unknown, operatorSigningKey: unknown, makeRuntime?: unknown,
): Promise<{ state: 'REVOKED' }>
