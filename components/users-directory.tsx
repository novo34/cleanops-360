'use client'
import { useEffect, useRef, useState } from 'react'
import { operations, valid } from '@/lib/b1/contracts'

type User = { id: string; display_name: string; state: 'ACTIVE'|'DISABLED'; risk_class: 'SENSITIVE'|'OPERATIONAL'; created_at: string }
type Page = { items: User[]; next_after: string|null }
type Detail = { user: User; organization: { id: string; name: string } }
const messages: Record<number,string> = {401:'Tu sesión ha caducado. Vuelve a iniciar sesión.',403:'No tienes permiso para consultar estos usuarios.',404:'El usuario no está disponible o no tienes acceso a su ficha.',429:'Se ha alcanzado el límite de consultas. Inténtalo de nuevo más tarde.',503:'El directorio no está disponible. Puedes volver a intentarlo.'}
class DirectoryReadError extends Error {}
async function read<T>(operation: string, query: Record<string,string>, signal: AbortSignal): Promise<T> {
 const op = operations.find(item => item.operationId === operation)!
 const response = await fetch(op.path+'?'+new URLSearchParams(query), {credentials:'same-origin',cache:'no-store',redirect:'error',signal})
 if (!response.ok) throw new DirectoryReadError(messages[response.status] ?? 'No se pudo completar la consulta.')
 if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new DirectoryReadError('La respuesta del directorio no es válida.')
 const result: unknown = await response.json().catch(()=>{throw new DirectoryReadError('La respuesta del directorio no es válida.')})
 if (!valid(op.responses['200'].content['application/json'].schema,result)) throw new DirectoryReadError('La respuesta del directorio no es válida.')
 return (result as {data:T}).data
}
const date = (value: string) => new Date(value).toLocaleDateString('es-CH')
export function UsersDirectory({onManageAccess}: {onManageAccess:(target:string)=>Promise<void>}) {
 const [filters,setFilters]=useState({search:'',state:''}),[cursors,setCursors]=useState<string[]>([]),[revision,setRevision]=useState(0)
 const [page,setPage]=useState<Page|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('')
 const [detail,setDetail]=useState<Detail|null>(null),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState('')
 const detailController=useRef<AbortController|null>(null),dialog=useRef<HTMLDialogElement>(null),returnFocus=useRef<HTMLElement|null>(null)
 const after=cursors.at(-1)
 useEffect(()=>{
  const controller=new AbortController()
  const query={...(filters.search?{search:filters.search}:{}),...(filters.state?{state:filters.state}:{}),...(after?{after}:{})}
  void (async()=>{
   setBusy(true);setError('');setPage(null)
   try{const result=await read<Page>('listAdministrationUsers',query,controller.signal);if(!controller.signal.aborted)setPage(result)}
   catch(failure){if(!controller.signal.aborted)setError(failure instanceof DirectoryReadError?failure.message:'No se pudo cargar el directorio.')}
   finally{if(!controller.signal.aborted)setBusy(false)}
  })()
  return ()=>controller.abort()
 },[filters,after,revision])
 useEffect(()=>()=>{detailController.current?.abort()},[])
 function close(){detailController.current?.abort();dialog.current?.close();setDetail(null);setDetailError('');setDetailBusy(false);returnFocus.current?.focus()}
 async function open(user:User){
  detailController.current?.abort();const controller=new AbortController();detailController.current=controller
  returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null
  setDetail(null);setDetailError('');setDetailBusy(true);dialog.current?.showModal()
  try{const result=await read<Detail>('getAdministrationUser',{target_user_id:user.id},controller.signal);if(!controller.signal.aborted)setDetail(result)}
  catch(failure){if(!controller.signal.aborted)setDetailError(failure instanceof DirectoryReadError?failure.message:'No se pudo cargar la ficha.')}
  finally{if(!controller.signal.aborted)setDetailBusy(false)}
 }
 return <section className="users-directory" aria-labelledby="users-directory-title" aria-busy={busy}>
  <div className="users-heading"><div><span className="admin-eyebrow">Administración</span><h3 id="users-directory-title">Usuarios de la empresa</h3><p>Consulta las personas y gestiona sus accesos autorizados.</p></div><button type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Actualizar directorio</button></div>
  <form className="users-filters" onSubmit={event=>{event.preventDefault();const fields=new FormData(event.currentTarget);setCursors([]);setFilters({search:String(fields.get('search')??'').trim(),state:String(fields.get('state')??'')})}}>
   <label>Buscar por nombre<input type="search" name="search" maxLength={120} placeholder="Nombre del usuario" /></label><label>Estado<select name="state"><option value="">Todos los estados</option><option value="ACTIVE">Activo</option><option value="DISABLED">Desactivado</option></select></label><button type="submit" disabled={busy}>Buscar usuarios</button>
  </form>
  {busy&&<p role="status">Cargando usuarios…</p>}{error&&<div className="users-notice" role="alert"><p>{error}</p><button type="button" onClick={()=>setRevision(value=>value+1)}>Reintentar consulta</button></div>}
  {!busy&&!error&&page&&<>
   {page.items.length?<div className="users-table-scroll"><table><caption>Usuarios visibles para tu sesión en esta empresa</caption><thead><tr><th scope="col">Persona</th><th scope="col">Estado</th><th scope="col">Alta</th><th scope="col">Acciones</th></tr></thead><tbody>{page.items.map(user=><tr key={user.id}><th scope="row">{user.display_name}</th><td><span className={'users-state '+(user.state==='ACTIVE'?'is-active':'')}>{user.state==='ACTIVE'?'Activo':'Desactivado'}</span></td><td><time dateTime={user.created_at}>{date(user.created_at)}</time></td><td><button type="button" aria-label={'Ver ficha de '+user.display_name} onClick={()=>void open(user)}>Ver ficha</button></td></tr>)}</tbody></table></div>:<div className="users-empty"><h4>Sin usuarios que mostrar</h4><p>Prueba otra búsqueda o consulta tus permisos con la administración.</p></div>}
   <nav className="users-pagination" aria-label="Paginación de usuarios"><button type="button" disabled={!cursors.length} onClick={()=>setCursors(values=>values.slice(0,-1))}>Anterior</button><span role="status">Página {cursors.length+1} · {page.items.length} usuarios</span><button type="button" disabled={!page.next_after} onClick={()=>{if(page.next_after)setCursors(values=>[...values,page.next_after!])}}>Siguiente</button></nav>
  </>}
  <dialog ref={dialog} className="users-detail" aria-labelledby="users-detail-title" onCancel={close}><div className="users-heading"><h3 id="users-detail-title">Ficha de usuario</h3><button type="button" onClick={close}>Cerrar ficha</button></div>
   {detailBusy&&<p role="status">Cargando ficha…</p>}{detailError&&<p role="alert">{detailError}</p>}{detail&&<><h4>{detail.user.display_name}</h4><dl><div><dt>Empresa</dt><dd>{detail.organization.name}</dd></div><div><dt>Estado</dt><dd>{detail.user.state==='ACTIVE'?'Activo':'Desactivado'}</dd></div><div><dt>Alta</dt><dd><time dateTime={detail.user.created_at}>{date(detail.user.created_at)}</time></dd></div></dl><button type="button" onClick={()=>{const target=detail.user.id;close();void onManageAccess(target)}}>Manage Access</button></>}
  </dialog>
 </section>
}
