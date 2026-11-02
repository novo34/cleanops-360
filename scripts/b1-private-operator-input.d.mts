export declare function validateRequest(request: unknown): Readonly<{ operation: string; operatorLoginRole: string; version: 1; [key: string]: unknown }>
export declare function publicState(result: unknown): Readonly<{ state: string; generation?: number; abortReason?: string }>
export declare function operatorIngressScope(installation: unknown): Readonly<{ issuer: string; audience: string }>
