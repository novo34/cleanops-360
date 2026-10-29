export type MigrationProfile = "foundation" | "b1"
export type TrustedArtifact = { id: string; file: string; sha256: string; sourceFile: string; sql: string }
export type TrustedMigration = TrustedArtifact & { profile: MigrationProfile }
export function loadTrustedMigrations(directory?: URL, profile?: MigrationProfile): Promise<TrustedMigration[]>
export function loadTrustedB1Baseline(): Promise<TrustedArtifact>
