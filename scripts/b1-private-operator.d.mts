export declare function readOperatorManifestSource(path?: string): Promise<Readonly<{ path: string; uid: 0; gid: number; mode: 0o440; maxBytes: 65536 }>>
export declare function runPrivateOperator(directory: string): Promise<string>
export declare function dispatchPrivateOperator(
  request: { operation: `first-actor.${string}`; [key: string]: unknown },
  prepared: unknown, operatorPool: unknown, makeRuntime?: unknown,
): Promise<{ state: string; generation?: number; abortReason?: string; [key: string]: unknown }>
