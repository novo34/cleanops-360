'use client'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { operations, valid } from '../lib/b1/contracts'
import { contactRoles, type Contact, type ContactFields, type CrmCompany, type CrmPage, type CompanyFields } from '../lib/crm/model'
import { CompanyRow } from './company-row'

const messages: Record<number, string> = { 401: 'Inicia sesión para consultar el directorio.', 403: 'CRM no está habilitado o no tienes permiso para esta acción.', 404: 'La ficha no está disponible.', 409: 'Conflicto: recarga la ficha antes de editar. El cambio no se ha confirmado.', 422: 'Revisa los campos del formulario.', 429: 'Espera antes de volver a intentarlo.', 503: 'El servicio no está disponible. Puedes volver a intentarlo.' }
class CrmError extends Error { constructor(readonly status: number) { super(messages[status] ?? 'No se pudo completar la operación.') } }
async function request<T>(operation: string, query: Record<string, string> = {}, body?: object, key?: string, signal?: AbortSignal): Promise<T> {
  const op = operations.find(o => o.operationId === operation)!
  const csrf = document.cookie.split('; ').find(c => c.startsWith('__Host-cleanops_csrf='))?.split('=')[1]
  const response = await fetch(op.path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''), {
    method: op.method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '', 'Idempotency-Key': key! } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new CrmError(response.status)
  if (!response.headers.get('content-type')?.startsWith('application/json')) throw new CrmError(503)
  const result: unknown = await response.json()
  if (!valid(op.responses['200'].content['application/json'].schema, result)) throw new CrmError(503)
  return (result as { data: T }).data
}
export function CrmWorkspace({ clientsOnly }: { clientsOnly: boolean }) {
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [after, setAfter] = useState<string | null>(null)
  const [page, setPage] = useState<CrmPage | null>(null), [detail, setDetail] = useState<CrmCompany | null>(null)
  const [busy, setBusy] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0), [editor, setEditor] = useState<'company' | 'contact' | null>(null), [contact, setContact] = useState<Contact | null>(null)
  const pending = useRef<{ bytes: string; key: string } | null>(null)
  const detailRequest = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return
      setBusy(true); setError(''); setPage(null)
      return request<CrmPage>('listCrmCompanies', { search: query, ...(clientsOnly ? { clients_only: 'true' } : {}), ...(after ? { after } : {}) }, undefined, undefined, controller.signal)
    })
      .then(value => { if (!controller.signal.aborted && value) setPage(value) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : messages[503]) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [query, clientsOnly, after, revision])
  useEffect(() => () => detailRequest.current?.abort(), [])
  async function open(id: string) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller
    setBusy(true); setDetail(null); setEditor(null); setError('')
    try { const value = await request<CrmCompany>('getCrmCompany', { company_id: id }, undefined, undefined, controller.signal); if (!controller.signal.aborted) { setDetail(value); heading.current?.focus() } }
    catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : messages[503]) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function save(fields: CompanyFields | ContactFields, reason: string) {
    if (saving) return
    const body = editor === 'company' ? detail ? { operation: 'EDIT_COMPANY', company_id: detail.id, expected_version: detail.version, reason, company: fields } : { operation: 'CREATE_COMPANY', company: fields }
      : { operation: contact ? 'EDIT_CONTACT' : 'CREATE_CONTACT', company_id: detail!.id, expected_version: detail!.version, reason, ...(contact ? { contact_id: contact.id } : {}), contact: fields }
    const op = operations.find(o => o.operationId === 'changeCrmRecord')!
    if (!valid(op.requestBody!.content['application/json'].schema, body)) { setError(messages[422]); return }
    const bytes = JSON.stringify(body)
    if (pending.current?.bytes !== bytes) pending.current = { bytes, key: crypto.randomUUID() }
    setSaving(true); setError(''); setNotice('')
    try {
      const result = await request<{ id: string }>('changeCrmRecord', {}, body, pending.current.key)
      pending.current = null; setEditor(null); setNotice('Cambio confirmado por el servidor.'); setRevision(n => n + 1); await open(result.id)
    } catch (failure) { setError(failure instanceof CrmError ? failure.message : 'No se pudo confirmar el resultado. Reintenta el mismo formulario para conservar la clave de la operación.') }
    finally { setSaving(false) }
  }
  return <div className="demo-workspace crm-workspace"><a className="demo-skip" href="#crm-main">Saltar al contenido</a><nav aria-label="Navegación CRM"><Link href="/crm/empresas" aria-current={!clientsOnly ? 'page' : undefined}>Empresas</Link><Link href="/crm/clientes" aria-current={clientsOnly ? 'page' : undefined}>Clientes</Link><Link href="/login">Acceso</Link></nav>
    <main id="crm-main" className="demo-main"><div className="demo-page-heading"><div><span className="demo-eyebrow">CLEANOPS 360</span><h1 ref={heading} tabIndex={-1}>{clientsOnly ? 'Clientes' : 'Empresas'}</h1><p>Cada relación, en su contexto.</p></div><button className="demo-button demo-primary" disabled={busy || !page || saving} onClick={() => { setDetail(null); setEditor('company'); setError('') }}>Nueva empresa</button></div>
      {busy && <p role="status">Cargando directorio…</p>}{error && <p role="alert" className="crm-message">{error}</p>}{notice && <p role="status">{notice}</p>}
      {!editor && <form role="search" onSubmit={event => { event.preventDefault(); setQuery(search); setAfter(null); setDetail(null); setRevision(n => n + 1) }}><label>Buscar empresa o contacto<input type="search" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></label><button className="demo-button" disabled={saving}>Buscar</button></form>}
      {!busy && !page && !editor && <button className="demo-button" onClick={() => setRevision(n => n + 1)}>Reintentar consulta</button>}
      {editor ? <RecordForm key={editor + (contact?.id ?? '') + (detail?.id ?? '')} kind={editor} company={detail} contact={contact} saving={saving} onSave={save} onCancel={() => { if (!saving) { setEditor(null); setError('') } }} /> : detail ? <section className="demo-card"><div className="demo-directory-heading"><h2>{detail.name}</h2><button className="demo-button" onClick={() => setDetail(null)}>Volver al directorio</button></div><p>{detail.city} · {detail.sector} · {detail.relation}</p><div className="crm-actions"><button className="demo-button" disabled={!detail.can_edit} onClick={() => setEditor('company')}>Editar empresa</button><button className="demo-button" disabled={!detail.can_edit} onClick={() => { setContact(null); setEditor('contact') }}>Añadir contacto</button><button className="demo-button" onClick={() => void open(detail.id)}>Recargar ficha</button></div><h3>Contactos</h3>{detail.contacts.length === 0 && <p>No hay contactos. Añade el primero.</p>}{detail.contacts.map(item => <article key={item.id}><h4>{item.name}</h4><p>{item.email} · {item.roles.join(', ')}</p><p>{item.do_not_contact ? 'No contactar · ' + item.do_not_contact_at : 'Sin marca No contactar. La base registrada no autoriza envíos.'}</p><dl><dt>Procedencia</dt><dd>{item.data_source}</dd><dt>Fuente</dt><dd>{item.source_url ?? 'No registrada'}</dd><dt>Primera observación</dt><dd>{item.first_seen_at}</dd><dt>Última verificación</dt><dd>{item.last_verified_at ?? 'Pendiente'}</dd><dt>Base de comunicación registrada</dt><dd>{item.communication_basis ?? 'No registrada'}</dd><dt>Solicitud de privacidad</dt><dd>{item.privacy_request_status ?? 'No registrada'}</dd><dt>Revisión de retención</dt><dd>{item.retention_review_at ?? 'Pendiente'}</dd></dl><button className="demo-button" disabled={!detail.can_edit} onClick={() => { setContact(item); setEditor('contact') }}>Editar contacto {item.name}</button></article>)}</section> : !busy && page && <section className="demo-card demo-directory"><div className="demo-directory-heading"><h2>Directorio de empresas</h2></div>{page.items.length ? <div className="demo-company-list">{page.items.map(item => <CompanyRow key={item.id} {...item} contact={item.contacts.map(c => c.name).join(', ') || 'Sin contactos'} role={item.contacts.length + ' contactos'} onOpen={() => void open(item.id)} />)}</div> : <p role="status">No hay empresas que coincidan con esta búsqueda.</p>}{page.next_after && <button className="demo-button" onClick={() => setAfter(page.next_after)}>Siguiente página</button>}{after && <button className="demo-button" onClick={() => setAfter(null)}>Primera página</button>}</section>}
    </main></div>
}
function RecordForm({ kind, company, contact, saving, onSave, onCancel }: { kind: 'company' | 'contact'; company: CrmCompany | null; contact: Contact | null; saving: boolean; onSave: (fields: CompanyFields | ContactFields, reason: string) => Promise<void>; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    const text = (name: string) => String(data.get(name) ?? '').trim()
    const timestamp = (name: string) => text(name) ? new Date(text(name) + ':00Z').toISOString() : null
    const fields = kind === 'company' ? { name: text('name'), city: text('city'), sector: text('sector'), relation: text('relation') as CompanyFields['relation'] } : {
      name: text('name'), email: text('email'), roles: data.getAll('roles').map(String), data_source: text('data_source'), source_url: text('source_url') || null,
      first_seen_at: timestamp('first_seen_at')!, last_verified_at: timestamp('last_verified_at'), communication_basis: text('communication_basis') || null,
      do_not_contact: data.has('do_not_contact'), privacy_request_status: text('privacy_request_status') || null, retention_review_at: timestamp('retention_review_at'),
    }
    void onSave(fields, text('reason'))
  }
  const dateValue = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : ''
  return <form className="demo-card" onSubmit={submit}><h2>{kind === 'company' ? company ? 'Editar empresa' : 'Nueva empresa' : contact ? 'Editar contacto' : 'Nuevo contacto'}</h2><fieldset disabled={saving}><legend>Datos de {kind === 'company' ? 'empresa' : 'contacto'}</legend><label>Nombre<input name="name" required maxLength={160} defaultValue={kind === 'company' ? company?.name : contact?.name} /></label>{kind === 'company' ? <><label>Ciudad<input name="city" required maxLength={120} defaultValue={company?.city} /></label><label>Sector<input name="sector" required maxLength={120} defaultValue={company?.sector} /></label><label>Relación<select name="relation" defaultValue={company?.relation ?? 'Prospecto'}><option>Prospecto</option><option>Cliente</option></select></label></> : <><label>Email<input type="email" name="email" required maxLength={254} defaultValue={contact?.email} /></label><fieldset><legend>Roles del contacto (selecciona al menos uno)</legend>{contactRoles.map(role => <label key={role}><input type="checkbox" name="roles" value={role} defaultChecked={contact?.roles.includes(role)} />{role}</label>)}</fieldset><label>Procedencia<input name="data_source" required maxLength={200} defaultValue={contact?.data_source} /></label><label>URL de fuente (HTTPS)<input type="url" name="source_url" maxLength={2048} pattern="https://.*" defaultValue={contact?.source_url ?? ''} /></label><label>Primera observación (UTC)<input type="datetime-local" name="first_seen_at" required defaultValue={dateValue(contact?.first_seen_at)} /></label><label>Última verificación (UTC)<input type="datetime-local" name="last_verified_at" defaultValue={dateValue(contact?.last_verified_at)} /></label><label>Base de comunicación registrada<input name="communication_basis" maxLength={500} defaultValue={contact?.communication_basis ?? ''} /></label><label><input type="checkbox" name="do_not_contact" defaultChecked={contact?.do_not_contact} />No contactar</label><label>Estado de solicitud de privacidad registrado<input name="privacy_request_status" maxLength={120} defaultValue={contact?.privacy_request_status ?? ''} /></label><label>Revisión de retención (UTC)<input type="datetime-local" name="retention_review_at" defaultValue={dateValue(contact?.retention_review_at)} /></label></>}{company && <label>Motivo del cambio<input name="reason" required maxLength={500} /></label>}</fieldset><div className="crm-actions"><button className="demo-button demo-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button><button type="button" className="demo-button" disabled={saving} onClick={onCancel}>Cancelar</button></div></form>
}
