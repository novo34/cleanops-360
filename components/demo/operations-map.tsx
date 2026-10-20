'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LibreMap, Marker } from 'maplibre-gl'
import { ArrowUpRight, Crosshair, Layers3, MapPin, Minus, Plus, X } from 'lucide-react'
import { days, time, type DemoSnapshot, type Job } from '../../lib/demo/model'
import { operationPoints, type DemoMapFilter, type DemoMapPeriod } from '../../lib/demo/map-model'
import 'maplibre-gl/dist/maplibre-gl.css'

type Props = { snapshot: DemoSnapshot; theme: 'light' | 'dark'; selectedId: string | null; onSelect: (id: string | null) => void; onOpen: (job: Job) => void }
const palettes = {
  dark: { ground: '#0d1725', land: '#152638', swiss: '#203b48', border: '#527080', water: '#102c43' },
  light: { ground: '#e9eff3', land: '#e1e8e8', swiss: '#f5f8f8', border: '#8babae', water: '#bcd7e5' },
}

export default function OperationsMap({ snapshot, theme, selectedId, onSelect, onOpen }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<LibreMap | null>(null)
  const markers = useRef<Marker[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [period, setPeriod] = useState<DemoMapPeriod>('today')
  const [filter, setFilter] = useState<DemoMapFilter>('all')
  const points = operationPoints(snapshot, period, filter)
  const selected = points.find(point => point.job.id === selectedId)
  const fit = () => {
    const visible = operationPoints(snapshot, period, filter)
    if (!map.current || !visible.length) return
    const xs = visible.map(p => p.coordinates[0]), ys = visible.map(p => p.coordinates[1])
    map.current.fitBounds([[Math.min(...xs) - .07, Math.min(...ys) - .05], [Math.max(...xs) + .07, Math.max(...ys) + .05]], { padding: 58, duration: 0, maxZoom: 10 })
  }

  useEffect(() => {
    let disposed = false
    let instance: LibreMap | undefined
    async function initialize() {
      try {
        const libre = await import('maplibre-gl')
        if (disposed || !host.current) return
        libre.setWorkerUrl('/demo-map/maplibre-gl-worker.mjs')
        const color = palettes.dark
        const initializedMap = new libre.Map({
          container: host.current, center: [6.44, 46.36], zoom: 8, minZoom: 6, maxZoom: 12,
          maxBounds: [[5.7, 45.8], [7.4, 47]], attributionControl: false,
          scrollZoom: false, dragRotate: false, pitchWithRotate: false,
          style: { version: 8, sources: { region: { type: 'geojson', data: '/demo-map/region.geojson' } }, layers: [
            { id: 'ground', type: 'background', paint: { 'background-color': color.ground } },
            { id: 'land', type: 'fill', source: 'region', filter: ['==', ['get', 'kind'], 'country'], paint: { 'fill-color': ['case', ['==', ['get', 'name'], 'Switzerland'], color.swiss, color.land] } },
            { id: 'borders', type: 'line', source: 'region', filter: ['==', ['get', 'kind'], 'country'], paint: { 'line-color': color.border, 'line-width': 1, 'line-opacity': .6 } },
            { id: 'lakes', type: 'fill', source: 'region', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'fill-color': color.water } },
          ] },
        })
        instance = initializedMap
        map.current = initializedMap
        initializedMap.on('load', () => { if (!disposed) setReady(true) })
        initializedMap.on('error', () => { if (!disposed) setFailed(true) })
        initializedMap.on('webglcontextlost', () => { if (!disposed) setFailed(true) })
      } catch { if (!disposed) setFailed(true) }
    }
    void initialize()
    return () => { disposed = true; markers.current.forEach(marker => marker.remove()); markers.current = []; instance?.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (!ready || !map.current) return
    const color = palettes[theme]
    map.current.setPaintProperty('ground', 'background-color', color.ground)
    map.current.setPaintProperty('land', 'fill-color', ['case', ['==', ['get', 'name'], 'Switzerland'], color.swiss, color.land])
    map.current.setPaintProperty('borders', 'line-color', color.border)
    map.current.setPaintProperty('lakes', 'fill-color', color.water)
  }, [ready, theme])

  useEffect(() => {
    if (!ready || !map.current) return
    let disposed = false
    markers.current.forEach(marker => marker.remove()); markers.current = []
    void import('maplibre-gl').then(libre => {
      if (disposed || !map.current) return
      const visible = operationPoints(snapshot, period, filter)
      markers.current = visible.map((point, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'demo-map-marker' + (point.issues.length ? ' demo-map-marker-warning' : '')
        button.setAttribute('aria-label', `${point.job.title} · ${point.city} · ${point.issues.join(', ') || 'Sin incidencias en el ejemplo'}`)
        button.setAttribute('aria-pressed', 'false')
        button.dataset.jobId = point.job.id
        const number = document.createElement('span'); number.textContent = String(index + 1)
        const label = document.createElement('small'); label.textContent = point.city
        button.append(number, label)
        button.title = `${point.company} — ${point.job.title}`
        button.addEventListener('click', () => onSelect(point.job.id))
        return new libre.Marker({ element: button, anchor: 'bottom' }).setLngLat(point.coordinates).addTo(map.current!)
      })
      const xs = visible.map(p => p.coordinates[0]), ys = visible.map(p => p.coordinates[1])
      if (visible.length) map.current.fitBounds([[Math.min(...xs) - .07, Math.min(...ys) - .05], [Math.max(...xs) + .07, Math.max(...ys) + .05]], { padding: 58, duration: 0, maxZoom: 10 })
    })
    return () => { disposed = true }
  }, [snapshot.id, period, filter, ready, onSelect, snapshot])


  useEffect(() => {
    host.current?.querySelectorAll<HTMLButtonElement>('.demo-map-marker').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.jobId === selectedId))
    })
  }, [selectedId, ready])

  return <section className="demo-map-panel" aria-labelledby="demo-map-heading">
    <div className="demo-map-heading"><div><span className="demo-eyebrow">TERRITORIO · DATOS FICTICIOS</span><h2 id="demo-map-heading">Mapa de operaciones</h2><p>Los mismos servicios que tu agenda y Planning.</p></div><MapPin aria-hidden="true" /></div>
    <div className="demo-map-toolbar"><label><span>Periodo</span><select aria-label="Periodo del mapa" value={period} onChange={event => { setPeriod(event.target.value as DemoMapPeriod); onSelect(null) }}><option value="today">Lunes 19</option><option value="week">Toda la semana</option></select></label><label><Layers3 aria-hidden="true" /><select aria-label="Filtrar mapa" value={filter} onChange={event => { setFilter(event.target.value as DemoMapFilter); onSelect(null) }}><option value="all">Todos los servicios</option><option value="issues">Requieren revisión</option></select></label></div>
    <div className="demo-map-viewport"><div className="demo-map-engine" ref={host} aria-label="Mapa geográfico de servicios ficticios del arco del Léman" />
      {!ready && !failed && <p className="demo-map-loading" role="status">Cargando cartografía local…</p>}
      {failed && <p className="demo-map-loading" role="status">Cartografía no disponible. Puedes consultar todos los servicios en la lista.</p>}
      <span className="demo-map-region">LAC LÉMAN <small>CH / FR</small></span>
      <div className="demo-map-zoom"><button type="button" disabled={!ready || failed} aria-label="Acercar mapa" onClick={() => map.current?.zoomIn({ duration: 0 })}><Plus aria-hidden="true" /></button><button type="button" disabled={!ready || failed} aria-label="Alejar mapa" onClick={() => map.current?.zoomOut({ duration: 0 })}><Minus aria-hidden="true" /></button><button type="button" disabled={!ready || failed} aria-label="Centrar servicios" onClick={fit}><Crosshair aria-hidden="true" /></button></div>
    </div>
    <div className="demo-map-caption"><span><i className="demo-map-key" />Sin incidencias en el ejemplo</span><span><i className="demo-map-key demo-map-key-warning" />Requiere revisión</span></div>
    <div className="demo-map-services" aria-label="Servicios del mapa">{points.length ? points.map((point, index) => <button type="button" key={point.job.id} aria-pressed={point.job.id === selectedId} onClick={() => onSelect(point.job.id)}><span className={point.issues.length ? 'demo-map-number demo-map-number-warning' : 'demo-map-number'}>{index + 1}</span><span><strong>{point.job.title}</strong><small>{point.city} · {time(point.job.start)} · {point.issues.join(' · ') || 'Sin incidencias en el ejemplo'}</small></span><ArrowUpRight aria-hidden="true" /></button>) : <p role="status">No hay servicios con estos filtros.</p>}</div>
    {selected && <div className="demo-map-detail" role="region" aria-label="Servicio seleccionado"><div><span className="demo-eyebrow">{days[selected.job.day]} · {time(selected.job.start)}–{time(selected.job.end)}</span><h3>{selected.job.title}</h3><p>{selected.company} · {selected.city}</p><p>{selected.job.assigned.length}/{selected.job.required} personas · {selected.issues.join(' · ') || 'Sin incidencias en el ejemplo'}</p></div><button type="button" className="demo-icon-button" aria-label="Cerrar selección del mapa" onClick={() => onSelect(null)}><X aria-hidden="true" /></button><button type="button" className="demo-button demo-primary" onClick={() => onOpen(selected.job)}>Ver ficha del servicio <ArrowUpRight aria-hidden="true" /></button></div>}
    <p className="demo-map-footnote">Ubicaciones ficticias aproximadas · Sin seguimiento de personas. Cartografía generalizada Natural Earth · MapLibre.</p>
  </section>
}
