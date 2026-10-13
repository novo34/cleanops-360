"use client"

import { useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Gauge,
  Globe2,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react"

type ServiceState = "Operational" | "Degraded" | "Disconnected"

const services: { name: string; detail: string; state: ServiceState; icon: typeof Activity }[] = [
  { name: "API", detail: "Request routing and authentication", state: "Operational", icon: ServerCog },
  { name: "Database", detail: "PostgreSQL primary cluster", state: "Operational", icon: Database },
  { name: "Background jobs", detail: "Queues and scheduled work", state: "Degraded", icon: Activity },
]

const activity = [
  { time: "09:42", actor: "System", action: "Deployment health check completed", tone: "success" },
  { time: "09:18", actor: "M. Keller", action: "Updated organization settings", tone: "neutral" },
  { time: "08:57", actor: "System", action: "Background job latency exceeded threshold", tone: "warning" },
]

function StateBadge({ state }: { state: ServiceState }) {
  const styles = {
    Operational: "status-badge status-badge--good",
    Degraded: "status-badge status-badge--warning",
    Disconnected: "status-badge status-badge--danger",
  }
  return <span className={styles[state]}><span className="status-dot" />{state}</span>
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`app-sidebar ${open ? "app-sidebar--open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="brand-mark">C</div>
          <div className="brand-copy"><strong>CleanOps</strong><span>360</span></div>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><X /></button>
        </div>
        <button className="org-switcher" aria-label="Switch organization">
          <span className="org-avatar">N</span><span className="org-name">Novi Facility Services</span><ChevronDown />
        </button>
        <nav className="sidebar-nav">
          <p className="nav-label">Workspace</p>
          <a href="#overview" className="nav-item"><Gauge />Overview</a>
          <a href="#operations" className="nav-item"><BriefcaseBusiness />Operations</a>
          <a href="#people" className="nav-item"><Users />People</a>
          <a href="#reports" className="nav-item"><Layers3 />Reports</a>
          <p className="nav-label nav-label--spaced">Administration</p>
          <a href="#system-status" className="nav-item nav-item--active"><Activity />System status</a>
          <a href="#settings" className="nav-item"><Settings2 />Settings</a>
        </nav>
        <div className="sidebar-footer">
          <a href="#help" className="nav-item"><LifeBuoy />Help center</a>
          <div className="user-chip"><span className="user-avatar">MK</span><span><strong>Martin Keller</strong><small>Admin</small></span><MoreHorizontal /></div>
        </div>
      </aside>
    </>
  )
}

export default function SystemStatusPrototype() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [noticeVisible, setNoticeVisible] = useState(true)

  return (
    <div className="prototype-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu /></button>
          <div className="breadcrumbs"><span>Administration</span><ChevronRight /><strong>System status</strong></div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setCommandOpen(true)}><Search /><span>Search</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" aria-label="Notifications"><Bell /><span className="notification-dot" /></button>
            <button className="topbar-avatar" aria-label="Open profile">MK</button>
          </div>
        </header>
        <main className="content-area" id="system-status">
          <div className="demo-banner"><Sparkles /><span><strong>Design prototype</strong> · illustrative data only, not connected to production services.</span><button onClick={() => setNoticeVisible(false)} aria-label="Dismiss prototype notice"><X /></button></div>
          {noticeVisible && <div className="sr-only" aria-live="polite">This is a design prototype with illustrative data.</div>}
          <div className="page-heading"><div><p className="eyebrow">Administration <span>/</span> System status</p><h1>System status</h1><p className="page-intro">A clear view of the platform&apos;s current health and recent activity.</p></div><button className="secondary-button"><Clock3 />Last checked <strong>2 min ago</strong><ChevronDown /></button></div>
          <section className="hero-status" aria-labelledby="health-heading">
            <div className="health-summary"><div className="health-icon"><ShieldCheck /></div><div><p className="eyebrow">Overall health</p><h2 id="health-heading">Operational with degraded jobs</h2><p>Core platform services are available. One non-critical area needs attention.</p></div></div>
            <div className="health-meta"><span>Environment <strong>Production</strong></span><span>Version <strong>v0.1.0-foundation</strong></span><span className="health-link"><Globe2 />Zurich region</span></div>
          </section>
          <div className="section-heading"><div><h2>Service health</h2><p>Live service indicators will connect to the health API in the functional slice.</p></div><button className="text-button">View incident history <ArrowUpRight /></button></div>
          <section className="service-grid" aria-label="Service health indicators">
            {services.map(({ name, detail, state, icon: Icon }) => <article className="service-card" key={name}><div className="service-card-top"><div className="service-icon"><Icon /></div><StateBadge state={state} /></div><h3>{name}</h3><p>{detail}</p><div className="service-card-footer"><span>{state === "Degraded" ? "Investigating" : "No known issues"}</span><MoreHorizontal /></div></article>)}
          </section>
          {noticeVisible && <div className="attention-panel"><div className="attention-icon"><AlertTriangle /></div><div><strong>Background jobs are running slower than usual</strong><p>This illustrative state demonstrates how a degraded service is surfaced without blocking the rest of the workspace.</p></div><button className="text-button">Open details <ArrowUpRight /></button></div>}
          <div className="lower-grid">
            <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Security-relevant and operational events.</p></div><button className="icon-button" aria-label="More activity options"><MoreHorizontal /></button></div><div className="activity-list">{activity.map((item) => <div className="activity-row" key={`${item.time}-${item.action}`}><span className={`activity-marker activity-marker--${item.tone}`} /><time>{item.time}</time><div><strong>{item.actor}</strong><p>{item.action}</p></div><ChevronRight /></div>)}</div><button className="panel-link">View audit log <ArrowUpRight /></button></section>
            <section className="panel environment-panel"><div className="panel-heading"><div><h2>Deployment context</h2><p>Read-only release information.</p></div><LockKeyhole /></div><dl className="definition-list"><div><dt>Environment</dt><dd><span className="inline-dot" />Production</dd></div><div><dt>Release channel</dt><dd>Stable</dd></div><div><dt>Last deployment</dt><dd>Today, 08:32</dd></div><div><dt>Region</dt><dd>CH-ZH-1</dd></div></dl><div className="context-note"><CircleHelp /><span>Configuration and feature flags will appear here once their authorization model is approved.</span></div></section>
          </div>
          <footer className="prototype-footer"><span><span className="footer-mark">C</span> CleanOps 360</span><span>Foundation prototype · six-language ready</span><span>v0.1.0-foundation</span></footer>
        </main>
      </div>
      {commandOpen && <div className="command-overlay" role="dialog" aria-modal="true" aria-label="Search workspace"><button className="command-dismiss" aria-label="Close search" onClick={() => setCommandOpen(false)} /><div className="command-dialog"><div className="command-input"><Search /><input placeholder="Search administration..." /><kbd>ESC</kbd></div><div className="command-results"><p>Quick navigation</p><button onClick={() => setCommandOpen(false)}><Activity /><span>System status</span><kbd>↵</kbd></button><button onClick={() => setCommandOpen(false)}><ShieldCheck /><span>Security events</span><kbd>↵</kbd></button><button onClick={() => setCommandOpen(false)}><Settings2 /><span>Organization settings</span><kbd>↵</kbd></button></div></div></div>}
    </div>
  )
}
