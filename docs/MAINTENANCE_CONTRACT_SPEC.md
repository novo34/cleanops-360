# Contrato de mantenimiento — MAINTENANCE_CONTRACT

**Estado:** especificación ampliada; no implementada. **Fuentes:** `REQ-PR-002/003`, `REQ-SVC-002`, `REQ-REC-020/030/031`, `REQ-FIN-020/031/032`; decisión 26. **Gate:** G-SVC-MAINT.

## Flujo y pantallas

`Registrar contrato y cláusulas → validar vigencia/alcance/periodicidad → crear WorkEngagement MAINTENANCE_CONTRACT autorizado → generar propuestas en Planning Engine común → publicación humana → ejecutar intervenciones periódicas → rapports/facturación según contrato → alertas de vencimiento → decisión de renovación/terminación auditada`

| Pantalla | Responsabilidad | Estados UX |
|---|---|---|
| Contratos → Mantenimiento | Listado, filtros, alta y ficha | loading/empty/error/acceso denegado |
| Ficha → Cláusulas y versiones | Periodicidad, SLA si pactado, facturación, inicio/fin, preaviso y autorización expresa | faltantes, conflicto de versión, histórico |
| Ficha → Intervenciones | Lista futura, asignación y cumplimiento | sin propuestas, pendiente de publicar, rechazo normativo |
| Ficha → Renovación | Renew / Renegotiate / Terminate / Postpone decision | renovación elegible, requiere humano, rechazada |
| Finanzas | Borradores, emisión, envío, historial de cobros | duplicado, fallo de emisión, cuota pendiente |

## Datos, términos y vigencia

Contrato comercial y `WorkEngagement` son objetos diferentes: el primero almacena condiciones vinculantes; el segundo organiza prestación. Guardar vigencias y versiones sin sobrescribir cláusulas previas; usar `billing_frequency` como campo canónico, `payment_terms`, `billing_method`, `hourly_rate`, `fixed_price`, `currency`, impuestos donde corresponda. Un `kind` genérico no sustituye el tipo explícito `work_engagements.type`.

No inventar un SLA si el contrato carece de él. Un cambio de periodicidad o tarifa requiere control contractual y efectos explícitos sobre turnos/borradores, sin modificar turnos publicados automáticamente.

## Estados y transiciones

Conservar el catálogo normativo de recurrentes `DRAFT`, `ACTIVE`, `PAUSED`, `RENEWAL_DUE`, `RENEWED`, `TERMINATION_PENDING`, `TERMINATED` (`REQ-REC-030`), aplicándolo al ciclo recurrente pertinente; **no confundir** con `work_engagement_creation_status=PENDING`. La política de correspondencia precisa entre estado del contrato, servicio recurrente y WE es un contrato de dominio por validar, no un alias implícito.

| Acción | Condición obligatoria | Efecto visible y persistente | Si falla |
|---|---|---|---|
| Crear | Tenant, alcance, cláusulas y permiso | Contrato/WE vinculados conforme al flujo autorizado | Validación/permiso, sin artefactos huérfanos |
| Proponer recurrencia | Periodicidad y vigencia; G-EMP/G-CMP | Intervenciones propuestas en motor único | Rechazo explicado, no publicación implícita |
| Publicar turnos | Confirmación de Planner, elegibilidad | Versión publicada y auditada | 403 / 409 sin sobrescritura |
| Renew | Verificar cláusula de renovación y permisos | Nueva vigencia/versiones e historial | Sin cláusula no auto-renovar |
| Renegotiate | Aprobación humana obligatoria ante cambio sensible | Propuesta y aprobación separadas | Nunca activar por IA sola |
| Terminate | Permiso y condiciones contractuales | Avisos/plan futuro según efectos revisados | Bloqueo de cancelación no autorizada |
| Postpone decision | Usuario autorizado y fecha de revisión | Tarea/alerta futura, historial | No altera contrato por sí solo |

**Automatización:** alertas y propuestas por IA son permitidas. Renovación automática solo si el contrato la autoriza de manera expresa. No se autorizan modificaciones económicas autónomas por IA. Las tareas y notificaciones deben resistir reintentos sin duplicar acuerdos, facturas ni turnos.

## Contratos lógicos propuestos (no URLs definitivas)

`maintenance.create`, `maintenance.updateTerms`, `maintenance.proposeSchedule`, `maintenance.publishSchedule`, `maintenance.requestRenewal`, `maintenance.approveRenegotiation`, `maintenance.terminate`, `maintenance.postponeDecision`, `maintenance.getHistory`. Todos con contexto tenant, policy efectiva, expected_version para mutaciones, auditoría y respuestas de error estructuradas.

## Escenarios de aceptación

| ID | Caso | Oráculo |
|---|---|---|
| `TC-MNT-01` | Alta desde interfaz y primera planificación | Persistencia + recurrencia + turnos publicados solo por humano |
| `TC-MNT-02` | Vence sin autorización de autorenovación | Alertas, acción manual disponible; vigencia no cambia sola |
| `TC-MNT-03` | Vence con cláusula expresa y reglas elegibles | Renovación controlada una sola vez, auditable |
| `TC-MNT-04` | IA propone subir tarifa | Estado propuesta; no altera contrato, invoices ni calendario |
| `TC-MNT-05` | Cambio de periodicidad durante turnos publicados | Revisión humana, versions intactas, sin sobrescritura |
| `TC-MNT-06` | Postpone decision | Nueva tarea/vencimiento revisable, sin extender contrato tácitamente |
| `TC-MNT-07` | Reintentar renovación y factura | Una renovación y una factura por clave de negocio |
| `TC-MNT-08` | Actor no autorizado u otro tenant | Denegación API, UI y auditoría sin fuga |

## Parámetros contractuales pendientes

Tipos de preaviso, posibles prórrogas, reglas de terminación y aprobación de cláusulas deben reflejar el contrato concreto y verificarse jurídicamente antes de activar el flujo. No convertir ejemplos en reglas legales suizas.

## Contrato transversal obligatorio

- **Aislamiento:** todas las lecturas, escrituras, listados, exports, jobs y archivos se filtran por tenant en servidor, sin confiar en IDs o flags del cliente (`REQ-AUTHZ-002/006/007`).
- **Autorización:** la acción exacta `view/create/edit/approve/delete/export/manage_permissions` debe resolverse por política efectiva, `explicit DENY` prevalece; los nombres de roles no otorgan privilegios implícitos. La matriz precisa de concesiones requiere aprobación del Product Owner.
- **Concurrencia:** mutaciones con versión esperada; ante versión obsoleta devolver conflicto y ofrecer comparación/recarga, nunca sobrescribir trabajo publicado ni aprobación previa.
- **Integración:** UI consume API y persistencia reales en staging; cargas, vacíos, validación, denegaciones y fallos están representados. Eventos y jobs idempotentes, con correlación y auditoría de acciones sensibles.
- **Privacidad:** ocultar datos personales y económicos a quien no tenga alcance; archivos sujetos a cuarentena y políticas suizas aprobadas; auditoría sin copiar secretos.
- **Modo de especificación:** rutas/identificadores API señalados como *propuestos* no son decisiones de producto. Cualquier regla no documentada en Master/SRS queda explícitamente por aprobar.
