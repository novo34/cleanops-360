# CleanOps 360 — Conciliación transversal de cuatro dominios

**Estado: CONTRATOS PROPUESTOS / NO ENDPOINTS IMPLEMENTADOS.** Se conserva la jerarquía SRS > diseño derivado. Este registro enlaza UI, comando, datos, autorización y aceptación. Las rutas nuevas y permisos especializados no quedan aprobados automáticamente por aparecer aquí.

## Matriz contractual
| ID | Dominio | Acción UI | Operación HTTP/lógica propuesta | Entidad primaria | Permiso especializado propuesto | Caso | Estado de evidencia |
|---|---|---|---|---|---|---|---|
| `COM-01` | Correo | Settings > Cuentas: Configurar cuenta SMTP/IMAP | `POST /mail/accounts` | `email_accounts` | `mail.accounts.manage` | `EML-E2E-01` | Caso en spec |
| `COM-02` | Correo | Settings > Cuentas > Probar: Probar conexión | `POST /mail/accounts/{id}/test` | `email_accounts` | `mail.accounts.manage` | `EML-E2E-01` | Caso en spec |
| `COM-03` | Correo | Inbox > Redactar: Crear borrador | `POST /mail/drafts` | `emails, email_threads` | `mail.drafts.create` | `EML-E2E-03` | Caso en spec |
| `COM-04` | Correo | Inbox > Aprobaciones: Aprobar primer contacto | `POST /mail/drafts/{id}/approve` | `emails, audit_logs` | `mail.outbound.approve` | `EML-E2E-03` | Caso en spec |
| `COM-05` | Correo | Inbox > Enviar: Solicitar envío | `POST /mail/drafts/{id}/send` | `emails, automation_runs` | `mail.outbound.send` | `EML-E2E-03` | Caso en spec |
| `COM-06` | Correo | Inbox > Sincronizar: Sincronizar inbox | `POST /mail/accounts/{id}/sync` | `emails, email_threads` | `mail.accounts.sync` | `EML-E2E-04` | Caso en spec |
| `COM-07` | Correo | Contacto > No contactar: Suprimir contacto | `POST /contacts/{id}/suppression` | `contact_compliance, suppression_list` | `contacts.suppress` | `EML-E2E-02` | Caso en spec |
| `COM-08` | Correo | Inbox > Hilo: Cancelar seguimiento por respuesta | `INTERNAL inbound-message-consumed` | `emails, tasks` | `mail.followups.cancel` | `EML-E2E-04` | Caso en spec |
| `OFF-01` | Ofertas | Opportunity > Ofertas: Crear oferta borrador | `POST /offers` | `offers, offer_versions` | `offers.create` | `OFF-E2E-01` | Caso en spec |
| `OFF-02` | Ofertas | Oferta > Editar y versionar: Crear revisión | `POST /offers/{id}/versions` | `offers, offer_versions` | `offers.edit` | `OFF-E2E-01` | Caso en spec |
| `OFF-03` | Ofertas | Oferta > Counter / Maintain: Negociar | `POST /offers/{id}/negotiations` | `offers, offer_versions` | `offers.negotiate` | `OFF-E2E-05` | Caso en spec |
| `OFF-04` | Ofertas | Oferta > Accept: Aceptar versión | `POST /offers/{id}/accept` | `offers, offer_versions, opportunities, audit_logs` | `offers.accept` | `OFF-E2E-02` | Caso en spec |
| `OFF-05` | Ofertas | Opportunity > Ficha: Consultar estado Won | `GET /opportunities/{id}/commercial-status` | `opportunities, work_engagements` | `opportunities.view` | `OFF-E2E-03` | Caso en spec |
| `OFF-06` | Ofertas | Opportunity Won > Crear WE: Crear WorkEngagement | `POST /opportunities/{id}/work-engagement` | `work_engagements, opportunities` | `work_engagements.create_from_won` | `OFF-E2E-04` | Caso en spec |
| `OPS-01` | Obras | Operaciones > Obra: Abrir ficha obra | `GET /projects/{id}` | `projects, project_phases` | `projects.view` | `OPS-E2E-01` | Caso OPS-E2E en spec; no ejecutado |
| `OPS-02` | Obras | Obra > Avance: Registrar progreso | `POST /projects/{id}/progress` | `progress_logs, projects` | `projects.progress.edit` | `OPS-E2E-02` | Caso OPS-E2E en spec; no ejecutado |
| `OPS-03` | Obras | Visita > Fotos: Subir fotos visita | `POST /site-visits/{id}/attachments` | `documents, site_visits` | `site_visits.attachments.create` | `OPS-E2E-03` | Caso OPS-E2E en spec; no ejecutado |
| `OPS-04` | Obras | Obra > Instrucciones: Registrar instrucción cliente | `POST /projects/{id}/client-instructions` | `client_instructions, assignments` | `client_instructions.create` | `OPS-E2E-04` | Caso OPS-E2E en spec; no ejecutado |
| `OPS-05` | Obras | Obra > Cierre: Solicitar cierre | `POST /projects/{id}/close-request` | `projects, audit_logs` | `projects.close.request` | `OPS-E2E-05` | Caso OPS-E2E en spec; no ejecutado |
| `REC-01` | Recurrentes | Cliente > Servicios: Crear servicio recurrente | `POST /recurring-services` | `recurring_services, work_engagements` | `recurring_services.create` | `REC-E2E-01` | Caso en spec |
| `REC-02` | Recurrentes | Servicio > Frecuencia: Definir calendario | `PUT /recurring-services/{id}/schedule` | `recurring_services, schedule_versions` | `recurring_services.schedule.edit` | `REC-E2E-02` | Caso en spec |
| `REC-03` | Recurrentes | Contrato > Renovación: Proponer renovación | `POST /contracts/{id}/renewal-proposals` | `contracts, audit_logs` | `contracts.renew.propose` | `REC-E2E-03` | Caso en spec |
| `REC-04` | Recurrentes | Contrato > Renew: Ejecutar renovación autorizada | `POST /contracts/{id}/renew` | `contracts, audit_logs` | `contracts.renew.execute` | `REC-E2E-04` | Caso en spec |
| `REC-05` | Recurrentes | Servicio > Facturación: Emitir factura autorizada | `POST /invoices/{id}/issue` | `invoices, invoice_lines` | `invoices.issue` | `REC-E2E-05` | Caso en spec |

## Reglas invariantes

1. Una ruta GET no produce mutaciones; toda mutación exige autenticación, contexto tenant, autorización en servidor, auditoría cuando es sensible y versiones/idempotencia cuando proceda.
2. `explicit deny` prevalece; no se conceden permisos por documentar su código. Debe existir política positiva aprobada antes de implementar el endpoint.
3. `offers.accept` realiza atómicamente `Accepted → Opportunity Won → work_engagement_creation_status=PENDING`. `work_engagements.create_from_won` es otra transacción posterior humana que cambia a `CREATED`. Contrato y WE no comparten `PENDING`.
4. Recepción de respuesta cancela únicamente follow-ups aplicables, nunca cierra la oportunidad.
5. Las propuestas de renovación pueden ser automáticas; la renovación ejecutada automáticamente requiere cláusula expresa. Cambio económico y renegociación requieren aprobación humana.
6. UI, API, base de datos, autorización y E2E deben existir y funcionar conjuntamente en staging antes de declarar `ACCEPTED`.

## Contrato mínimo exigible antes de codificar

Por operación: request schema, response schema, fallos 400/401/403/404/409/422/429/503 cuando apliquen, `If-Match`, `Idempotency-Key`, scope, política de audit, evento, estado inicial/final, efecto DB, comportamiento al reintentar, caso positivo y negativo, OpenAPI y prueba browser real. Los campos no inventados aquí quedan pendientes de la especificación del vertical slice.

## Estado de cobertura

- 24 operaciones enlazadas; no representan todas las funcionalidades del SRS.
- Los casos marcados `PROPUESTO` son brechas pendientes, no pruebas disponibles.
- Ninguna prueba de software ejecutada.
