export function completeB1Installation(input: { packageDir: string; apply?: boolean; backupDir?: string; now?: () => Date }): Promise<{
  applied: boolean; backup?: string
  filled: { path: string; value: unknown; basis: string }[]
  pendingValues: string[]; differsFromContract: string[]; invalid: string[]
  files: { label: string; path: string | null; status: string }[]; ready: boolean
}>
