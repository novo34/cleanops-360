/** Ephemeral request identity only. Never persist bodies, factors, cookies or keys. */
export class UiRequestKeys {
  private entries = new Map<string, string>()
  private generation = 0
  clear() { this.generation++; this.entries.clear() }
  async forRequest(operation: string, path: string, body: object | undefined) {
    const generation = this.generation
    const input = new TextEncoder().encode(JSON.stringify([operation, path, body ?? null]))
    const hash = await crypto.subtle.digest('SHA-256', input)
    input.fill(0)
    if (generation !== this.generation) throw new Error('CEREMONY_CLOSED')
    const fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
    let key = this.entries.get(fingerprint)
    if (!key) { key = crypto.randomUUID(); this.entries.set(fingerprint, key) }
    return { key, confirmed: () => { if (this.entries.get(fingerprint) === key) this.entries.delete(fingerprint) } }
  }
}
