"use client"

import useSWR from "swr"
import { AlertTriangle, Database, Gauge, LockKeyhole, RefreshCw, ServerCog } from "lucide-react"

type ServiceStatus = "operational" | "degraded" | "disconnected"
type HealthResponse = { api: ServiceStatus; database: { status: ServiceStatus }; jobs: { status: ServiceStatus } }
type StatusResponse = HealthResponse | { code: "AUTH_GATE_05" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isServiceStatus(value: unknown): value is ServiceStatus {
  return value === "operational" || value === "degraded" || value === "disconnected"
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return isRecord(value) && isServiceStatus(value.api)
    && isRecord(value.database) && isServiceStatus(value.database.status)
    && isRecord(value.jobs) && isServiceStatus(value.jobs.status)
}

const fetcher = async (url: string): Promise<StatusResponse> => {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" })
  const body: unknown = await response.json()
  if (!response.ok) {
    if (response.status === 401 && isRecord(body) && body.code === "AUTH_GATE_05") return { code: "AUTH_GATE_05" }
    throw new Error("System status unavailable")
  }
  if (!isHealthResponse(body)) throw new Error("Invalid system status response")
  return body
}

export default function AdminSystemStatus() {
  const { data, error, isLoading, isValidating, mutate } = useSWR("/api/system-status/health", fetcher, { revalidateOnFocus: false })
  const blocked = data && "code" in data
  const health = data && !("code" in data) ? data : undefined
  const checking = isLoading || isValidating

  return <main className="admin-status-page">
    <header className="admin-status-header"><div><span className="admin-eyebrow">Administration / System status</span><h1>System status</h1><p>Operational visibility for the current CleanOps 360 environment.</p></div><button className="admin-refresh" onClick={() => mutate().catch(() => undefined)} disabled={checking}><RefreshCw />{checking ? "Checking" : "Refresh"}</button></header>
    {error ? <section className="admin-error" role="alert"><AlertTriangle /><div><h2>System status unavailable</h2><p>A valid status response could not be obtained. No service state is being inferred.</p></div></section> : blocked ? <section className="admin-gate" role="alert"><div className="admin-gate-icon"><LockKeyhole /></div><div><span className="admin-eyebrow">Access controlled</span><h2>Administrative access is not available yet.</h2><p>AUTH-GATE-05 remains open. This screen will not expose health, configuration, audit logs or deployment details until the approved identity and tenant authorization contract is implemented.</p><code>AUTH-GATE-05 · fail-closed</code></div></section> : <section className="admin-status-grid" aria-label="System services" aria-busy={checking}><StatusCard icon={<Gauge />} title="API" value={health?.api} loading={checking} /><StatusCard icon={<Database />} title="PostgreSQL" value={health?.database.status} loading={checking} /><StatusCard icon={<ServerCog />} title="Background jobs" value={health?.jobs.status} loading={checking} /></section>}
    <footer className="admin-status-footer"><span>CleanOps 360</span><a href="/demo">Explorar demo · Datos ficticios</a></footer>
  </main>
}

function StatusCard({ icon, title, value, loading }: { icon: React.ReactNode; title: string; value?: ServiceStatus; loading: boolean }) {
  const label = value === "disconnected" || !value ? "Unavailable" : value
  return <article className="admin-status-card"><span className="admin-card-icon">{icon}</span><div><span>{title}</span><strong>{loading ? "Checking" : label}</strong></div></article>
}
