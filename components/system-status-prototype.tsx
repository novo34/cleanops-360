"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Command,
  Gauge,
  Layers3,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  Navigation,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react"

type IconType = typeof Activity

type Kpi = [string, string, string, string, IconType]
type ActivityItem = [string, string, string, string, IconType]

const kpis: Kpi[] = [
  ["Active sites", "24", "+3 today", "jade", Building2],
  ["On shift", "86", "92% coverage", "blue", Users],
  ["Open incidents", "07", "2 critical", "red", AlertTriangle],
  ["Uncovered shifts", "03", "Needs attention", "amber", Clock3],
  ["Completed today", "148", "+12.4% vs avg", "jade", ShieldCheck],
]
const activity: ActivityItem[] = [
  ["10:42", "Shift check-in", "Team Atlas checked in at Bahnhofstrasse 21", "jade", Users],
  ["10:35", "Incident reported", "Water leak reported · Site 04, Zürich West", "red", AlertTriangle],
  ["10:18", "Job completed", "Deep clean completed · Helvetia Campus", "blue", ShieldCheck],
  ["09:54", "Route updated", "Crew 07 reassigned to Basel Messe", "amber", Navigation],
]
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`ops-sidebar ${open ? "ops-sidebar--open" : ""}`}>
      <div className="ops-brand"><span className="ops-logo">C</span><span><strong>CleanOps</strong><small>360 / COMMAND</small></span><button className="sidebar-close" aria-label="Close navigation" onClick={onClose}><X /></button></div>
      <button className="ops-org"><span className="ops-org-mark">N</span><span><small>Organization</small><strong>Novi Facility Services</strong></span><ChevronDown /></button>
      <div className="live-pill"><span /><span>Operations live</span><time>10:48 CET</time></div>
      <nav className="ops-nav" aria-label="Primary navigation">
        <p>Workspace</p><a className="ops-nav-active" href="#command"><Gauge />Command center</a><a href="#sites"><Building2 />Sites <em>24</em></a><a href="#people"><Users />People <em>86</em></a><a href="#routes"><Navigation />Routes</a>
        <p>Control plane</p><a href="#incidents"><AlertTriangle />Incidents <em className="nav-alert">7</em></a><a href="#reports"><Layers3 />Reports</a><a href="#system"><ServerCog />System status</a>
      </nav>
      <div className="ops-sidebar-bottom"><a href="#help"><LifeBuoy />Help center</a><a href="#settings"><Settings2 />Settings</a><div className="ops-user"><span>MK</span><div><strong>Martin Keller</strong><small>Workspace admin</small></div><MoreHorizontal /></div></div>
    </aside>
  </>
}

type MarkerKind = "site" | "assignment" | "last-known"
type MockMarker = { city: string; label: string; coordinates: [number, number]; tone: string; kind: MarkerKind; age?: string }

const mockSites: MockMarker[] = [
  { city: "Zürich", label: "Fixed site · 14 active", coordinates: [8.5417, 47.3769], tone: "jade", kind: "site" },
  { city: "Bern", label: "Assigned · Team Atlas", coordinates: [7.4474, 46.9480], tone: "blue", kind: "assignment" },
  { city: "Basel", label: "Fixed site · at risk", coordinates: [7.5886, 47.5596], tone: "amber", kind: "site" },
  { city: "Lugano", label: "Last known · 18 min ago", coordinates: [8.9511, 46.0037], tone: "red", kind: "last-known", age: "18 min ago" },
  { city: "Lausanne", label: "Assigned · Crew 07", coordinates: [6.6323, 46.5197], tone: "jade", kind: "assignment" },
  { city: "Genève", label: "Last known · 7 min ago", coordinates: [6.1432, 46.2044], tone: "blue", kind: "last-known", age: "7 min ago" },
]

const markerFilters: Array<{ label: string; value: "all" | MarkerKind }> = [
  { label: "All layers", value: "all" },
  { label: "Fixed sites", value: "site" },
  { label: "Assignments", value: "assignment" },
  { label: "Last known", value: "last-known" },
]

function MapPanel() {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<Array<{ marker: maplibregl.Marker; element: HTMLButtonElement; data: MockMarker }>>([])
  const [filter, setFilter] = useState<"all" | MarkerKind>("all")
  const [selected, setSelected] = useState<MockMarker | null>(null)

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return
    const map = new maplibregl.Map({
      container: mapElement.current, center: [8.18, 46.82], zoom: 7.2, minZoom: 5.7, maxZoom: 12, attributionControl: false,
      style: "https://demotiles.maplibre.org/style.json",
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    markerRefs.current = mockSites.map((site) => {
      const el = document.createElement("button")
      el.className = `maplibre-marker maplibre-marker--${site.tone} maplibre-marker--${site.kind}`
      el.type = "button"
      el.setAttribute("aria-label", `${site.city}, ${site.label}`)
      el.innerHTML = `<span></span><strong>${site.city}</strong><small>${site.label}</small>`
      el.addEventListener("click", () => setSelected(site))
      return { marker: new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(site.coordinates).addTo(map), element: el, data: site }
    })
    mapInstance.current = map
    return () => { map.remove(); mapInstance.current = null; markerRefs.current = [] }
  }, [])

  useEffect(() => { markerRefs.current.forEach(({ element, data }) => { element.hidden = filter !== "all" && data.kind !== filter }) }, [filter])

  return <section className="map-panel" aria-labelledby="map-heading">
    <div className="map-panel-head"><div><span className="section-kicker"><span className="pulse-dot" />Live operations · demo</span><h2 id="map-heading">Switzerland command map</h2><p>Real map tiles · illustrative locations only</p></div><div className="map-controls"><label className="map-filter"><Layers3 /><select aria-label="Filter map layers" value={filter} onChange={(event) => setFilter(event.target.value as "all" | MarkerKind)}>{markerFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown /></label><button aria-label="Center map" onClick={() => mapInstance.current?.flyTo({ center: [8.18, 46.82], zoom: 7.2 })}><Navigation /></button></div></div>
    <div className="map-canvas map-canvas--real"><div ref={mapElement} className="maplibre-container" /><div className="map-overlay-title">{markerFilters.find((item) => item.value === filter)?.label}</div><div className="map-legend"><span><i className="legend-dot legend-dot--jade" />Fixed site</span><span><i className="legend-dot legend-dot--blue" />Assignment</span><span><i className="legend-dot legend-dot--amber" />Last known</span></div><div className="map-demo-note">Demo data · last-known positions are authorized and time-stamped</div>{selected && <div className="map-selection"><button aria-label="Close selected marker" onClick={() => setSelected(null)}><X /></button><span className={`selection-dot selection-dot--${selected.tone}`} /><div><strong>{selected.city}</strong><p>{selected.kind === "site" ? "Fixed worksite" : selected.kind === "assignment" ? "Worker assignment" : "Authorized last-known position"}</p><small>{selected.label}{selected.age ? ` · reported ${selected.age}` : ""}</small></div></div>}</div>
  </section>
}

export default function SystemStatusPrototype() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  return <div className="command-center">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="ops-main">
      <header className="ops-topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu /></button><div className="ops-crumb"><span>Operations</span><ChevronRight /><strong>Command center</strong></div><div className="ops-top-actions"><button className="ops-search" onClick={() => setCommandOpen(true)}><Search /><span>Search sites, people, incidents...</span><kbd>⌘ K</kbd></button><button className="icon-action" aria-label="Notifications"><Bell /><i /></button><button className="emergency"><Zap />Emergency mode</button><button className="profile-button">MK</button></div></header>
      <main className="ops-content" id="command">
        <div className="prototype-ribbon"><Sparkles /><span><strong>Design prototype</strong> · illustrative operations data</span><span className="ribbon-context">Production / CH-ZH-1</span></div>
        <div className="ops-heading"><div><span className="section-kicker">Tuesday, 13 October 2026 · 10:48 CET</span><h1>Good morning, Martin.</h1><p>Here&apos;s what needs your attention across Switzerland today.</p></div><button className="date-button"><Clock3 />Today <ChevronDown /></button></div>
        <section className="kpi-row" aria-label="Operational key performance indicators">{kpis.map(([label, value, detail, tone, Icon]) => { const MetricIcon = Icon as typeof Activity; return <article className={`kpi-card kpi-card--${tone}`} key={label}><div className="kpi-icon"><MetricIcon /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><ArrowUpRight className="kpi-arrow" /></article>})}</section>
        <div className="ops-layout"><MapPanel /><aside className="right-rail"><section className="rail-panel"><div className="rail-heading"><div><span className="section-kicker section-kicker--red"><span className="pulse-dot" />Needs attention</span><h2>Critical alerts</h2></div><button className="plain-button">View all <ArrowUpRight /></button></div><div className="alert-item alert-item--critical"><span className="alert-symbol"><AlertTriangle /></span><div><strong>Water leak reported</strong><p>Site 04 · Zürich West</p><time>12 min ago</time></div><ChevronRight /></div><div className="alert-item alert-item--warning"><span className="alert-symbol"><Clock3 /></span><div><strong>Shift uncovered</strong><p>Helvetia Campus · 14:00</p><time>28 min ago</time></div><ChevronRight /></div><div className="alert-item alert-item--info"><span className="alert-symbol"><Wifi /></span><div><strong>Device disconnected</strong><p>Tracker 07 · Crew Atlas</p><time>41 min ago</time></div><ChevronRight /></div></section><section className="rail-panel system-health"><div className="rail-heading"><div><span className="section-kicker section-kicker--jade"><span className="pulse-dot" />Platform</span><h2>System health</h2></div><span className="health-score">98.7%</span></div><div className="health-line"><span>API &amp; authentication</span><strong>Operational</strong><i className="health-bar"><b style={{ width: "98%" }} /></i></div><div className="health-line"><span>PostgreSQL cluster</span><strong>Operational</strong><i className="health-bar"><b style={{ width: "100%" }} /></i></div><div className="health-line"><span>Background jobs</span><strong className="text-amber">Degraded</strong><i className="health-bar"><b className="bar-amber" style={{ width: "74%" }} /></i></div><div className="jobs-note"><Activity /><span>3 jobs retrying · <strong>View queue</strong></span></div></section></aside></div>
        <div className="bottom-grid"><section className="rail-panel activity-feed"><div className="rail-heading"><div><span className="section-kicker">Live feed</span><h2>Recent activity</h2></div><span className="feed-live"><span />Live</span></div>{activity.map(([time, title, detail, tone, Icon]) => { const ActivityIcon = Icon as typeof Activity; return <div className="feed-row" key={time}><time>{time}</time><span className={`feed-icon feed-icon--${tone}`}><ActivityIcon /></span><div><strong>{title}</strong><p>{detail}</p></div></div>})}</section><section className="rail-panel next-assignments"><div className="rail-heading"><div><span className="section-kicker">Next up</span><h2>Upcoming assignments</h2></div><button className="plain-button">See schedule <ArrowUpRight /></button></div><div className="assignment-row"><span className="assignment-time">11:30</span><div className="assignment-avatar">AT</div><div><strong>Team Atlas</strong><p>Helvetia Campus · Zürich</p></div><span className="assignment-status">On route</span></div><div className="assignment-row"><span className="assignment-time">12:00</span><div className="assignment-avatar assignment-avatar--blue">C7</div><div><strong>Crew 07</strong><p>Basel Messe · Basel</p></div><span className="assignment-status assignment-status--blue">Scheduled</span></div><div className="assignment-row"><span className="assignment-time">13:15</span><div className="assignment-avatar assignment-avatar--amber">NL</div><div><strong>Northline</strong><p>Site 12 · Bern</p></div><span className="assignment-status assignment-status--amber">At risk</span></div></section><section className="rail-panel job-health"><div className="rail-heading"><div><span className="section-kicker">Workload</span><h2>Background jobs</h2></div><MoreHorizontal /></div><div className="job-visual"><div className="job-ring"><strong>74%</strong><small>healthy</small></div><div className="job-list"><span><i className="legend-dot legend-dot--jade" />Completed <b>184</b></span><span><i className="legend-dot legend-dot--amber" />Retrying <b>03</b></span><span><i className="legend-dot legend-dot--red" />Failed <b>01</b></span></div></div></section></div>
        <footer className="ops-footer"><span><span className="footer-brand">C</span> CleanOps 360</span><span>Prototype · command center foundation</span><span>System status <i className="footer-online" />Operational</span></footer>
      </main>
    </div>
    {commandOpen && <div className="command-overlay" role="dialog" aria-modal="true" aria-label="Global search"><button className="command-dismiss" aria-label="Close search" onClick={() => setCommandOpen(false)} /><div className="command-dialog"><div className="command-input"><Command /><input aria-label="Search sites, people, incidents" placeholder="Search sites, people, incidents..." /><kbd>ESC</kbd></div><div className="command-results"><p>Quick navigation</p><button onClick={() => setCommandOpen(false)}><Gauge /><span>Command center</span><kbd>↵</kbd></button><button onClick={() => setCommandOpen(false)}><AlertTriangle /><span>Critical incidents</span><kbd>↵</kbd></button><button onClick={() => setCommandOpen(false)}><Building2 /><span>All sites</span><kbd>↵</kbd></button></div></div></div>}
  </div>
}
