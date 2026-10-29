import type { MigrationProfile, TrustedArtifact } from "./trusted-migrations.mjs"
export type MigrationSource = { sourceCommit: string; runnerSha256: string; approvalReference: string }
export type MigrationConnection = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  release(discard?: boolean): void
}
export type RunOptions = { connect?: () => Promise<MigrationConnection>; profile?: MigrationProfile; source?: MigrationSource }
export type RunResult = { profile: MigrationProfile; registry: string; applied: string[]; pending: string[]; history?: Record<string, unknown>[]; baseline: { id: string; sha256: string; applied: boolean; automatic: boolean } | null }
export type OfflinePlan = { profile: MigrationProfile; registry: "UNKNOWN_NOT_CONNECTED"; migrations: { id: string; sha256: string }[]; proposed: { id: string; sha256: string; sourceFile: string; executable: false }[]; baseline: { id: string; sha256: string; sourceFile: string; automatic: boolean } | null }
export const migrationLock: string
export const freshB1Predicate: string
export function migrationProvenance(entries: readonly TrustedArtifact[], approval?: string): Promise<MigrationSource>
export function runMigrations(options: RunOptions & { mode: "offline-plan" }): Promise<OfflinePlan>
export function runMigrations(options?: RunOptions & { mode?: "apply" | "plan" }): Promise<RunResult>
export function sql14InstallBatch(record: unknown, source: MigrationSource): Promise<string>
export function main(argv?: string[]): Promise<void>
