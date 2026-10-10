# CleanOps 360 — OFFLINE_SYNC_SPEC

**Estado:** especificación documental derivada; no implementada. **Fecha:** 2026-10-09.  
**Fuentes:** Product Master V3, SRS V1.1 (`REQ-OFFLINE-001`, `REQ-SCH-003`, `REQ-CAL-*`, `REQ-CLI-002`, `REQ-TEN-*`), `ARCHITECTURE.md`, `DATA_MODEL.md`.

## 1. Objetivo y alcance
Permitir trabajo móvil offline de empleados y responsables con PWA e IndexedDB, persistencia local de operaciones pendientes, sincronización incremental y detección explícita de conflictos. La conectividad **no** confiere permiso permanente. Definir comportamiento por entidad y reglas de resolución. Ninguna actualización crítica se sobrescribe silenciosamente.

## 2. Decisiones vinculantes
Modo offline-first aprobado: IndexedDB, cola local persistente, `mutation_id` idempotente, versiones, sincronización incremental; fusionar automáticamente solo cambios demostrablemente compatibles; revisión humana para conflictos importantes. Si la sesión venció, conservar pendientes cifrados/protegidos localmente y reautenticar antes del envío. Toda escritura debe validarse contra la autorización vigente del servidor. No se aprobó colaboración CRDT general ni sincronización automática de permisos.

## 3. Conjunto mínimo cacheado
`assignment`, address, team, authorized instructions, cached plan versions, work log, timesheet draft, incident draft, pending photos. Limitar al empleado/tenant, recursos asignados, vigencia y mínima cantidad necesaria. Documentos sensibles no se almacenan indiscriminadamente; clasificación de datos y políticas tenant prevalecen. `IndexedDB` es cache de trabajo, no fuente autoritativa.

## 4. Modelo lógico de sincronización (propuesta de diseño)
`LocalSnapshot(resource_type, resource_id, tenant_id, server_version, last_sync_at)`; `PendingMutation(mutation_id, actor_id, tenant_id, entity, entity_id/local_id, base_version, op, payload, created_at, dependency_ids, status, retry_count)`; `SyncCursor(tenant_id, device_id, scope, cursor)`; `SyncConflict(conflict_id, mutation_id, reason, remote_version, local_version, status, resolution_actor)`; `PendingAttachment(local_attachment_id, checksum, upload_state, parent_mutation_id)`. Son contratos lógicos, no tablas finales.

Invariantes: `mutation_id` único por actor/dispositivo, procesamiento idempotente, tenant explícito y verificado, no reutilizar cursor entre cuentas, no aceptar escrituras offline de objetos sobre los que se perdió permiso, no eliminar una operación pendiente sin confirmación persistida del servidor. Cada cambio puede depender de un padre (incidencia antes que fotos) y debe manejar órdenes parciales.

## 5. Protocolo
1. Al iniciar sesión autorizada, descargar únicamente asignaciones y recursos permitidos, junto con `server_version` y cursor incremental.
2. Offline: registrar cambios como eventos locales durables; UI indica `pendiente de sincronizar` y cantidad de pendientes, incluso tras reiniciar app. Proteger caché contra exposición en dispositivo compartido con controles de sesión y borrado seguro conforme capacidades del navegador.
3. Reconexión: validar sesión, MFA cuando aplique, tenant, permisos y estado de entidad. Si venció, `AUTH_REQUIRED` sin borrar cola.
4. Enviar mutaciones por lote acotado con idempotency key, base_version y precondiciones. El servidor valida payload/permiso/reglas y responde por operación: `APPLIED`, `ALREADY_APPLIED`, `CONFLICT`, `REJECTED`, `RETRYABLE`.
5. Confirmar localmente solo `APPLIED/ALREADY_APPLIED` con commit duradero; actualizar cursor y recuperar deltas/snapshots del servidor; reconciliar IDs temporales de forma determinista.
6. Para `CONFLICT`, congelar la mutación afectada, conservar ambas versiones, presentar diferencias y asignar resolución humana al rol adecuado. Operaciones independientes pueden seguir.
7. Para `REJECTED` por revocación de acceso: nunca forzar escritura; presentar motivo seguro y permitir exportación/recuperación controlada únicamente si la política lo autoriza.

## 6. Matriz de conflictos por dominio
| Entidad/operación | Admisión offline | Concurrencia y reconciliación | Regla |
|---|---|---|---|
| Consulta de turnos, dirección, equipo, instrucciones | lectura cache autorizada | refrescar al conectar; advertir posible obsolescencia | servidor es fuente final |
| Crear borrador de `WorkLog` | sí | idempotente, múltiples borradores distinguibles; si misma entrada duplicada, revisar | no sumar horas dos veces |
| Crear borrador de `Timesheet` | sí | versión/identidad de periodo; si ya aprobado o cerrado, conflicto humano | jamás sobreescribir aprobado |
| Registrar incidente nuevo | sí | create idempotente y anexos con dependencias | no duplicar incidente por retry |
| Fotografías pendientes | sí, sujetas a cuota | checksum/dedup por adjunto, subida resumible cuando se diseñe | no marcar completado antes de persistir |
| Modificar planificación publicada | **no publicar offline** | modificación en servidor con versión; colisión → planner | publicación humana obligatoria |
| Confirmar recepción `My Day` | cola offline posible como intención | idempotencia, validar versión y destinatario en servidor | no confirmar turno reemplazado sin revisión |
| `ClientInstruction` | borrador/registro sujeto a autorización | versión y revisión de efectos; no aplicar cambios operativos sin reglas/permiso online | impacto definido `REQ-CLI-002` |
| Permisos, usuarios, precio, ofertas aceptadas, facturas/pagos | no mutaciones offline en MVP | requieren acción online autorizada, MFA si sensible | nunca reconciliación automática |
| Edición de datos compartidos de proyecto/contacto | por defecto online | optimistic locking, rechazo de versión obsoleta | no last-write-wins |

## 7. Estados de UI y recuperación
Global: `OFFLINE`, `SYNCING`, `UP_TO_DATE`, `AUTH_REQUIRED`, `PARTIAL_FAILURE`, `CONFLICTS_PENDING`. Operación: `QUEUED`, `SENDING`, `APPLIED`, `CONFLICT`, `REJECTED`, `RETRYABLE`. UI móvil incluye cola visible y opción `Reintentar` con control de duplicados, comparador local/remoto, responsable resolutor e historial. Si un recurso cambió de ámbito, mostrar error sin revelar su nueva información.

## 8. Datos, seguridad y retención local
Almacenamiento por tenant y usuario, protección de cache en reposo cuando técnicamente viable, limpieza al cerrar sesión según política sin borrar borradores no entregados sin advertencia y tratamiento seguro; dispositivos compartidos implican riesgo de acceso local. Prohibir que el service worker cachee tokens/secretos en URLs o respuestas públicas. No afirmar cifrado resistente frente a control total del dispositivo sin diseño y validación específicos. Aplicar políticas de clasificación, mínimos de datos y cuotas del dispositivo.

## 9. Resiliencia, orden y eficiencia
Reintentos exponenciales con jitter y límite; fallos permanentes apartados y visibles. Los timestamps locales se consideran indicativos y no orden legal de aceptación. Usar reloj/versión del servidor y operaciones transaccionales. Limitar tamaño de lotes y fotos por cuota; sincronizar contenido crítico antes de transferencias pesadas con política justificada. No reproducir infinitamente un comando rechazado. Cambiar de tenant/usuario obliga a purgar o aislar completamente el caché previo.

## 10. Pruebas y aceptación
- Unitarias: estados, dependencias, idempotencia, cambios de IDs temporales, deltas, clasificación de conflictos.
- Integración: pérdida de red antes/después de commit servidor; retry duplicado; revocación de permiso; sincronización incremental por cursor; dos dispositivos; token vencido.
- E2E móvil: captura offline → reinicio → reconexión → sincronización, fotos parciales, visibilidad de conflictos, suspensión de sesiones.
- Adversariales: usuario distinto en dispositivo compartido, bypass tenant, mutación vieja a planificación publicada, timesheet ya aprobado, colisiones de `mutation_id`.
- Criterio de rechazo: pérdida silenciosa de cambios, duplicación de horas, sobrescritura de aprobado/publicado o sincronización sin autorización vigente.

## 11. Puertas pendientes de diseño
`OFF-GATE-01` tabla exacta de operaciones offline por rol; `OFF-GATE-02` tamaños/cache TTL y borrado ante pérdida/robo; `OFF-GATE-03` contratos de API de cursor/versionado y migración IndexedDB; `OFF-GATE-04` resolución humana con UI y permisos; `OFF-GATE-05` retención y protección de fotos locales; `OFF-GATE-06` validación navegador/PWA de modo offline real. No asumir que estas decisiones técnicas ya están aprobadas.
