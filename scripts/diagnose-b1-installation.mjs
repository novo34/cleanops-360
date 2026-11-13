// Step-by-step replica of loadReviewedB1Installation that names the FIRST failing step (never contents).
// Runs inside the deployed image with the private package mounted read-only; no network, no secrets printed.
import { createHash } from "node:crypto"
import { numeric } from "../lib/b1/config.ts"
import { readTrustedPrivateFile } from "../lib/b1/private-file.ts"
import { createInstallationContext } from "../lib/b1/installation-context.ts"
import { validateInstallationKeys } from "../lib/b1/installation-catalog.ts"
import { createPasswordAdmission } from "../lib/b1/password-admission.ts"
import { validateDummyPasswordHash } from "../lib/b1/approved-factors.ts"
import { validateTotpMethodLimit } from "../lib/b1/ceremony-preparation.ts"
import { loadReviewedB1Installation } from "../lib/b1/reviewed-site-installation.ts"

const uid = process.getuid(), gid = process.getgid()
console.log(`IDENTITY uid=${uid} gid=${gid}`)
async function step(name, fn) {
  try { const v = await fn(); console.log(`STEP_OK ${name}`); return v }
  catch (e) { console.log(`STEP_FAIL ${name} ${String(e?.message ?? e).replace(/[^A-Za-z0-9_ :.-]/g, "?").slice(0, 80)}`); return undefined }
}
const manifestSource = { path: "/run/cleanops-b1-private/installation.json", uid: 0, gid, mode: 0o440, maxBytes: 65536 }
const raw = await step("manifest-read", () => readTrustedPrivateFile(manifestSource))
let m
if (raw) m = await step("manifest-parse", () => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)))
if (m) {
  const sources = []
  const walk = (v, t) => {
    if (v && typeof v === "object") {
      if (["path", "uid", "gid", "mode", "maxBytes"].every(k => k in v)) sources.push([t, v])
      for (const [k, x] of Object.entries(v)) walk(x, t ? `${t}.${k}` : k)
    }
  }
  walk(m, "")
  for (const [t, s] of sources) await step(`read:${t}`, async () => { (await readTrustedPrivateFile(s)).fill(0) })
  await step("catalog-keys", () => validateInstallationKeys(m.catalog))
  await step("totp-limit", () => validateTotpMethodLimit(m.maxEligibleTotpMethods))
  await step("corpus-admission", async () => {
    const content = await readTrustedPrivateFile(m.corpus.source)
    createPasswordAdmission({ version: m.corpus.version, sha256: m.corpus.sha256, content },
      { minimumCodePoints: numeric("password_min"), maximumCodePoints: numeric("password_max"), maximumCorpusBytes: m.maximumCorpusBytes })
    content.fill(0)
  })
  await step("dummy-hash", async () => validateDummyPasswordHash(new TextDecoder("utf-8", { fatal: true }).decode(await readTrustedPrivateFile(m.dummyPasswordHash))))
  await step("integration", async () => {
    const bytes = await readTrustedPrivateFile(m.integration.source)
    if (createHash("sha256").update(bytes).digest("hex") !== m.integration.sha256) throw new Error("INTEGRATION_SHA_MISMATCH")
    const mod = await import("data:text/javascript;base64," + bytes.toString("base64"))
    if (Object.keys(mod).sort().join(",") !== "bindIngress,normalizeEmail,resolveRequestContext") throw new Error("INTEGRATION_EXPORTS")
    createInstallationContext({ normalizeEmail: mod.normalizeEmail, resolveRequestContext: mod.resolveRequestContext })
  })
}
await step("full-load", async () => { const r = await loadReviewedB1Installation(manifestSource, { uid, gid }); r.inputs.corpus.content.fill(0) })
