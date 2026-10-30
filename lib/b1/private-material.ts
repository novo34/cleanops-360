/** Explicit private-file sources for the B1 staging runtime.
 * Pure construction: no HTTP activation, env lookup or access to OpenBao.
 */
import type { PrivateRuntimeConfiguration } from './private-runtime.ts'
import { readTrustedPrivateFile, type PrivateFileSource } from './private-file.ts'

type PgPassword = PrivateRuntimeConfiguration['postgres']['password']
type PgCa = PrivateRuntimeConfiguration['postgres']['ca']
type BaoTls = Pick<PrivateRuntimeConfiguration['bao'], 'ca' | 'cert' | 'key'>

const unavailable = () => new Error('PRIVATE_MATERIAL_UNAVAILABLE')

/** Reads a bounded credential at each connection attempt, never at module import. */
export function createPrivatePgPassword(source: PrivateFileSource): PgPassword {
  return async () => {
    const bytes = await readTrustedPrivateFile(source)
    try {
      if (bytes.length < 1 || bytes.length > 4096) throw unavailable()
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (!text || /[\r\n\0]/.test(text)) throw unavailable()
      return text
    } catch { throw unavailable() }
    finally { bytes.fill(0) }
  }
}

/** Bootstrap-only TLS loading. Caller owns and must clear the returned buffers. */
export async function loadPrivateTls(
  sources: Readonly<{ postgresCa: PrivateFileSource; baoCa: PrivateFileSource; baoCert: PrivateFileSource; baoKey: PrivateFileSource }>,
): Promise<Readonly<{ postgresCa: PgCa; bao: BaoTls }>> {
  const loaded: Buffer[] = []
  try {
    for (const source of [sources.postgresCa, sources.baoCa, sources.baoCert, sources.baoKey]) {
      loaded.push(await readTrustedPrivateFile(source))
    }
    const [postgresCa, ca, cert, key] = loaded
    if (![postgresCa, ca, cert, key].every(buffer => buffer.length > 0)) throw unavailable()
    return { postgresCa, bao: { ca, cert, key } }
  } catch {
    for (const value of loaded) value.fill(0)
    throw unavailable()
  }
}
