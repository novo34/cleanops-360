"use client"

import useSWR from "swr"
import { AlertTriangle, Database, Gauge, LockKeyhole, RefreshCw, ServerCog } from "lucide-react"

type StatusResponse = { error?: string; code?: string; api?: string; database?: { status: string }; jobs?: { status: string } }

const fetcher = async (url: string): Promise<StatusResponse> => {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" })
  const body = await response.json()
  if (!response.ok) return body
  return body
}

export default function AdminSystemStatus() {
  const { data, error, isLoading, mutate } = useSWR("/api/system-status/health", fetcher, { revalidateOnFocus: false })
  const blocked = data?.code === "AUTH_GATE_05"

  return <main className="admin-status-page">
    <header className="admin-status-header"><div><span className="admin-eyebrow">Administration / System status</span><h1>System status</h1><p>Operational visibility for the current CleanOps 360 environment.</p></div><button className="admin-refresh" onClick={() => mutate()} disabled={isLoading}><RefreshCw />{isLoading ? "Checking" : "Refresh"}</button></header>
    {blocked ? <section className="admin-gate" role="alert"><div className="admin-gate-icon"><LockKeyhole /></div><div><span className="admin-eyebrow">Access controlled</span><h2>Administrative access is not available yet.</h2><p>AUTH-GATE-05 remains open. This screen will not expose health, configuration, audit logs or deployment details until the approved identity and tenant authorization contract is implemented.</p><code>AUTH-GATE-05 · fail-closed</code></div></section> : error ? <section className="admin-error" role="alert"><AlertTriangle /><div><h2>System status unavailable</h2><p>The status endpoint could not be reached. No service state is being inferred.</p></div></section> : <section className="admin-status-grid" aria-label="System services"><StatusCard icon={<Gauge />} title="API" value={data?.api ?? "Loading"} loading={isLoading} /><StatusCard icon={<Database />} title="PostgreSQL" value={data?.database?.status ?? "Loading"} loading={isLoading} /><StatusCard icon={<ServerCog />} title="Background jobs" value={data?.jobs?.status ?? "Loading"} loading={isLoading} /></section>}
    <footer className="admin-status-footer"><span>CleanOps 360</span><span>Data source: PostgreSQL</span><span>Environment: server-provided</span></footer>
  </main>
}

function StatusCard({ icon, title, value, loading }: { icon: React.ReactNode; title: string; value: string; loading: boolean }) {
  return <article className="admin-status-card"><span className="admin-card-icon">{icon}</span><div><span>{title}</span><strong>{loading ? "Checking" : value}</strong></div></article>
}
