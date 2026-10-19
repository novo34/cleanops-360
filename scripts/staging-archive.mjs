// Synthetic backup transport only, not PG/Raft coherence or operational RPO proof.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, readFile, lstat, link, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const magic = Buffer.from('CLEANOPS-STAGING-ARCHIVE-1\n')
async function keyMaterial(path) {
  const stat = await lstat(path)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw Error('KEY_FILE')
  const key = await readFile(path)
  if (key.length !== 32) { key.fill(0); throw Error('KEY_LENGTH') }
  return key
}
export async function archive(mode, input, output, keyPath, scope) {
  if (scope !== 'STAGING_SYNTHETIC' || !['encrypt', 'decrypt'].includes(mode) ||
      new Set([resolve(input), resolve(output), resolve(keyPath)]).size !== 3) throw Error('SCOPE')
  const key = await keyMaterial(keyPath)
  const temporary = output + '.partial-' + randomBytes(12).toString('hex')
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    if (mode === 'encrypt') {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(magic)
      await handle.write(Buffer.concat([magic, iv]))
      await pipeline(createReadStream(input), cipher, createWriteStream('', { fd: handle.fd, autoClose: false, start: magic.length + 12 }))
      await handle.write(cipher.getAuthTag(), 0, 16, (await handle.stat()).size)
    } else {
      const source = await open(input, 'r')
      try {
        const size = (await source.stat()).size
        if (size < magic.length + 28) throw Error('FORMAT')
        const header = Buffer.alloc(magic.length + 12), tag = Buffer.alloc(16)
        await source.read(header, 0, header.length, 0)
        await source.read(tag, 0, 16, size - 16)
        if (!header.subarray(0, magic.length).equals(magic)) throw Error('FORMAT')
        const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(magic.length))
        decipher.setAAD(magic); decipher.setAuthTag(tag)
        // No destination becomes visible until GCM authentication succeeds.
        if (size === header.length + 16) {
          decipher.final()
        } else {
          await pipeline(createReadStream('', { fd: source.fd, autoClose: false, start: header.length, end: size - 17 }),
            decipher, createWriteStream('', { fd: handle.fd, autoClose: false }))
        }
      } finally { await source.close() }
    }
    await handle.sync()
    await handle.close(); handle = undefined
    // Exclusive hardlink commits atomically without overwriting even on a race.
    await link(temporary, output)
  } catch { throw Error('STAGING_ARCHIVE_FAILED') }
  finally {
    key.fill(0)
    if (handle) await handle.close().catch(() => {})
    await unlink(temporary).catch(() => {})
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, input, output, keyPath, scope] = process.argv.slice(2)
  try { await archive(mode, input, output, keyPath, scope); console.log('STAGING_ARCHIVE_OK') }
  catch { console.error('STAGING_ARCHIVE_FAILED'); process.exitCode = 1 }
}
