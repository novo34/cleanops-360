import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3000"
const response = await fetch(origin)
assert.equal(response.status, 200, "Application must respond with HTTP 200")

const csp = response.headers.get("content-security-policy") || ""
assert.match(csp, /script-src[^;]*'nonce-([^']+)'/, "CSP must contain a script nonce")
assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, "Do not permit inline scripts broadly")
assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/, "Do not permit eval")
const nonce = csp.match(/script-src[^;]*'nonce-([^']+)'/)[1]
const html = await response.text()
assert.match(html, /CleanOps 360/, "Page identity missing")
assert.ok(html.includes(`nonce="${nonce}"`), "Next.js framework scripts must carry CSP nonce")

const second = await fetch(origin)
const csp2 = second.headers.get("content-security-policy") || ""
assert.notEqual(csp, csp2, "CSP nonce must rotate per request")

const chrome = ["google-chrome", "google-chrome-stable", "chromium"].find((cmd) =>
  spawnSync("which", [cmd], { encoding: "utf8" }).status === 0,
)
assert.ok(chrome, "Chrome/Chromium must be installed on CI runner")
const browser = spawnSync(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--virtual-time-budget=4000", "--dump-dom", origin,
], { encoding: "utf8", timeout: 30000, maxBuffer: 5_000_000 })
assert.equal(browser.status, 0, `Headless browser failed: ${browser.stderr}`)
assert.match(browser.stdout, /CleanOps 360/, "Browser did not render page")
assert.doesNotMatch(browser.stderr, /Refused to (execute|load).*Content Security Policy/i,
  "Browser refused scripts due to CSP")
console.log("CSP browser smoke: nonce propagation, rotation and browser render verified")
