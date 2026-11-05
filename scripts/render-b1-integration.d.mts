import type { PrivateFileSource } from "../lib/b1/private-file.ts"
export function renderB1Integration(input: {
  packageDir: string; manifestSource: PrivateFileSource; report: PrivateFileSource; approval: PrivateFileSource; factoryUrl?: string
}): Promise<{ path: string; sha256: string; bytes: number; manifestMatches: boolean }>
