/** Trusted startup file reader. Never accepts HTTP paths or environment switches.
 * Strict private files are provisioned outside the checkout and mounted read-only.
 */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute } from 'node:path'

const invalid = () => new Error('PRIVATE_FILE_UNAVAILABLE')
export type PrivateFileSource = Readonly<{
  path: string
  uid: number
  gid: number
  mode: 0o400 | 0o440 | 0o600 | 0o640
  maxBytes: number
}>

/** Open without following the leaf symlink; read once and verify stable metadata. */
export async function readTrustedPrivateFile(source: PrivateFileSource): Promise<Buffer> {
  if (!source || typeof source.path !== 'string' ||
      !isAbsolute(source.path) || source.path.includes('\0') ||
      source.path.split('/').slice(1).some(part => !part || part === '.' || part === '..') ||
      !Number.isSafeInteger(source.uid) || source.uid < 0 ||
      !Number.isSafeInteger(source.gid) || source.gid < 0 ||
      ![0o400, 0o440, 0o600, 0o640].includes(source.mode) ||
      !Number.isSafeInteger(source.maxBytes) || source.maxBytes < 1 || source.maxBytes > 65536) throw invalid()
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  let data: Buffer | undefined
  try {
    // Reject symlinks in every ancestor, including attacker-controlled bind parents.
    const parts = source.path.split('/').slice(1)
    let directory = await fs.open('/', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    const directories = [directory]
    try {
      for (const part of parts.slice(0, -1)) {
        directory = await fs.open('/proc/self/fd/' + directory.fd + '/' + part,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
        directories.push(directory)
      }
      handle = await fs.open('/proc/self/fd/' + directory.fd + '/' + parts.at(-1),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    } finally {
      await Promise.allSettled(directories.map(d => d.close()))
    }
    const before = await handle.stat()
    if (!before.isFile() || before.nlink !== 1 || before.uid !== source.uid ||
        before.gid !== source.gid || (before.mode & 0o7777) !== source.mode ||
        before.size < 1 || before.size > source.maxBytes) throw invalid()
    data = Buffer.alloc(before.size)
    let read = 0
    while (read < data.length) {
      const result = await handle.read(data, read, data.length - read, read)
      if (!result.bytesRead) throw invalid()
      read += result.bytesRead
    }
    const after = await handle.stat()
    if (before.size !== after.size || before.ino !== after.ino ||
        before.dev !== after.dev || before.mtimeMs !== after.mtimeMs ||
        before.mode !== after.mode || before.uid !== after.uid || before.gid !== after.gid) throw invalid()
    const output = data
    data = undefined
    return output
  } catch {
    throw invalid()
  } finally {
    data?.fill(0)
    if (handle) await handle.close().catch(() => {})
  }
}
