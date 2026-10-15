# CLEANOPS 360 — API SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Convenciones — contratos propuestos, no endpoints implementados
HTTP JSON/HTTPS; `tenant_id` derivado de contexto autenticado, nunca fiable desde payload cliente. OpenAPI formal por slice antes de codificar.


## Identidad

`POST /auth/login`, `POST /auth/mfa/verify`, `GET /sessions`, `DELETE /sessions/{id}`: límites, rate limiting, CSRF/cookies y códigos normalizados; rutas sujetas a revisión OpenAPI por fase.


## Comercial

`GET /project-candidates`, `POST /project-candidates/{id}/promote`, `POST /opportunities`, `POST /offers/{id}/accept`, `POST /opportunities/{id}/work-engagement`: version preconditions, idempotency-key, RBAC y auditoría.


## Operaciones

`POST /planning/proposals`, `POST /planning/publish`, `POST /client-instructions`, `POST /offline/sync`: control `If-Match` o versión equivalente; errores conflict 409 y validación 422.


## Finanzas y cumplimiento

`POST /invoices/drafts`, `POST /invoices/{id}/issue`, `POST /invoices/{id}/send`, `POST /compliance/check`, `POST /compliance/proposals/{id}/approve`: políticas por tenant y audit.


## Contrato mínimo

Definir request/response/errores/side effects/eventos/permisos/tenant/rate-limits, paginación, retry y pruebas E2E; no declarar ruta productiva hasta su implementación.



## Conciliación de operaciones comerciales y operativas (diseño propuesto)

El inventario completo por UI, comando, entidad, permiso y prueba se mantiene en `CROSS_DOMAIN_CONTRACT_MATRIX.md`. La matriz es el contrato de trabajo anterior a OpenAPI. No sustituye especificaciones HTTP completas ni autoriza nuevos permisos.

- `COM-01` — `POST /mail/accounts` — Configurar cuenta SMTP/IMAP. Entidades `email_accounts`; permiso `mail.accounts.manage`; prueba `EML-E2E-01`. Precondición: credenciales cifradas; no devolver secretos.
- `COM-02` — `POST /mail/accounts/{id}/test` — Probar conexión. Entidades `email_accounts`; permiso `mail.accounts.manage`; prueba `EML-E2E-01`. Precondición: SMTP e IMAP comprobados separadamente; no activar sin éxito.
- `COM-03` — `POST /mail/drafts` — Crear borrador. Entidades `emails, email_threads`; permiso `mail.drafts.create`; prueba `EML-E2E-03`. Precondición: sin envío automático al crear.
- `COM-04` — `POST /mail/drafts/{id}/approve` — Aprobar primer contacto. Entidades `emails, audit_logs`; permiso `mail.outbound.approve`; prueba `EML-E2E-03`. Precondición: supresión prevalece; revalidar al enviar.
- `COM-05` — `POST /mail/drafts/{id}/send` — Solicitar envío. Entidades `emails, automation_runs`; permiso `mail.outbound.send`; prueba `EML-E2E-03`. Precondición: idempotency key, límites, rechazo por DO_NOT_CONTACT.
- `COM-06` — `POST /mail/accounts/{id}/sync` — Sincronizar inbox. Entidades `emails, email_threads`; permiso `mail.accounts.sync`; prueba `EML-E2E-04`. Precondición: deduplicar por cuenta e identificador proveedor.
- `COM-07` — `POST /contacts/{id}/suppression` — Suprimir contacto. Entidades `contact_compliance, suppression_list`; permiso `contacts.suppress`; prueba `EML-E2E-02`. Precondición: bloqueo en API y worker; auditoría.
- `COM-08` — `INTERNAL inbound-message-consumed` — Cancelar seguimiento por respuesta. Entidades `emails, tasks`; permiso `mail.followups.cancel`; prueba `EML-E2E-04`. Precondición: cancelar follow-up, nunca Opportunity.
- `OFF-01` — `POST /offers` — Crear oferta borrador. Entidades `offers, offer_versions`; permiso `offers.create`; prueba `OFF-E2E-01`. Precondición: versión inicial trazable.
- `OFF-02` — `POST /offers/{id}/versions` — Crear revisión. Entidades `offers, offer_versions`; permiso `offers.edit`; prueba `OFF-E2E-01`. Precondición: expected_version; no sobrescribir versión emitida.
- `OFF-03` — `POST /offers/{id}/negotiations` — Negociar. Entidades `offers, offer_versions`; permiso `offers.negotiate`; prueba `OFF-E2E-05`. Precondición: acción humana; conflicto de versión.
- `OFF-04` — `POST /offers/{id}/accept` — Aceptar versión. Entidades `offers, offer_versions, opportunities, audit_logs`; permiso `offers.accept`; prueba `OFF-E2E-02`. Precondición: atómico: Accepted + Won + WE=PENDING.
- `OFF-05` — `GET /opportunities/{id}/commercial-status` — Consultar estado Won. Entidades `opportunities, work_engagements`; permiso `opportunities.view`; prueba `OFF-E2E-03`. Precondición: PENDING creación WE != estado contrato.
- `OFF-06` — `POST /opportunities/{id}/work-engagement` — Crear WorkEngagement. Entidades `work_engagements, opportunities`; permiso `work_engagements.create_from_won`; prueba `OFF-E2E-04`. Precondición: acción humana; idempotencia; CREATED al persistir.
- `OPS-01` — `GET /projects/{id}` — Abrir ficha obra. Entidades `projects, project_phases`; permiso `projects.view`; prueba `OPS-E2E-01`. Precondición: tenant y scope proyecto.
- `OPS-02` — `POST /projects/{id}/progress` — Registrar progreso. Entidades `progress_logs, projects`; permiso `projects.progress.edit`; prueba `OPS-E2E-02`. Precondición: estado compatible y versión.
- `OPS-03` — `POST /site-visits/{id}/attachments` — Subir fotos visita. Entidades `documents, site_visits`; permiso `site_visits.attachments.create`; prueba `OPS-E2E-03`. Precondición: MIME, tamaño, scanner, permiso; antes de fase 9.
- `OPS-04` — `POST /projects/{id}/client-instructions` — Registrar instrucción cliente. Entidades `client_instructions, assignments`; permiso `client_instructions.create`; prueba `OPS-E2E-04`. Precondición: efecto operativo visible Planning.
- `OPS-05` — `POST /projects/{id}/close-request` — Solicitar cierre. Entidades `projects, audit_logs`; permiso `projects.close.request`; prueba `OPS-E2E-05`. Precondición: evidencia y checks previos; no falso cerrado.
- `REC-01` — `POST /recurring-services` — Crear servicio recurrente. Entidades `recurring_services, work_engagements`; permiso `recurring_services.create`; prueba `REC-E2E-01`. Precondición: vinculación WE y contrato.
- `REC-02` — `PUT /recurring-services/{id}/schedule` — Definir calendario. Entidades `recurring_services, schedule_versions`; permiso `recurring_services.schedule.edit`; prueba `REC-E2E-02`. Precondición: versionado, G-CMP y Planning.
- `REC-03` — `POST /contracts/{id}/renewal-proposals` — Proponer renovación. Entidades `contracts, audit_logs`; permiso `contracts.renew.propose`; prueba `REC-E2E-03`. Precondición: IA solo propuesta, revisión humana.
- `REC-04` — `POST /contracts/{id}/renew` — Ejecutar renovación autorizada. Entidades `contracts, audit_logs`; permiso `contracts.renew.execute`; prueba `REC-E2E-04`. Precondición: auto solo si cláusula expresa; economía humana.
- `REC-05` — `POST /invoices/{id}/issue` — Emitir factura autorizada. Entidades `invoices, invoice_lines`; permiso `invoices.issue`; prueba `REC-E2E-05`. Precondición: separar draft/issue/send y prevenir duplicado.


## Contrato transversal HTTP — reglas de diseño obligatorias

**Estado:** propuesta técnica derivada pendiente de aprobación por slice. Ninguna ruta descrita aquí concede permisos, confirma una transacción o se da por implementada. El contrato OpenAPI definitivo de cada slice debe fijar esquemas completos de campos, límites y serialización antes del desarrollo de esa slice.

- Autenticación web mediante cookie de sesión opaca; no se usa JWT para la sesión de usuario. Las mutaciones protegidas por cookie exigen defensa CSRF. `tenant_id` solo se infiere del contexto autenticado y se comprueba también al resolver IDs relacionados.
- Respuesta satisfactoria: `data` (representación de recurso o resultado), `meta` con `correlation_id` y `resource_version` cuando exista; POST de creación devuelve identificador y representación autoritativa. No se da por realizado un trabajo asíncrono por responder 202: UI muestra pendiente hasta recibir confirmación persistida.
- Errores: `error.code` estable, `error.message` localizado sin secretos, `error.details` seguros, `correlation_id`. Usar 400 para carga malformada, 401 sesión ausente/expirada, 403 falta de grant, 404 recurso invisible/no existente, 409 conflicto de versión o transición y 422 dominio inválido; 429 límites y 503 indisponibilidad con reintento seguro. El servidor no revela existencia cross-tenant.
- Todas las mutaciones sensibles registran actor, recurso, tenant, efecto, momento y correlación, sin credenciales ni contenido privado innecesario; son idempotentes si admiten reintento. `If-Match`/versión esperada en cambios con concurrencia; los workers vuelven a comprobar autorización y supresión cuando corresponda.
- La UI debe manejar carga, vacío, éxito confirmado, error, 401, 403, 409, 422 y 429 sin simular persistencia. Los consumidores internos no son endpoints públicos ni requieren un permiso ficticio independiente del actor/servicio autorizado.

### Inventario con obligaciones por operación

| ID | Operación propuesta | Condición de entrada y seguridad | Salida confirmada | Casos de rechazo prioritarios | Prueba |
|---|---|---|---|---|---|
| `COM-01` | `POST /mail/accounts` | Contexto tenant y permiso efectivo `mail.accounts.manage`; datos validados y versión si aplica | Estado persistido de `email_accounts` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `EML-E2E-01` |
| `COM-02` | `POST /mail/accounts/{id}/test` | Contexto tenant y permiso efectivo `mail.accounts.manage`; datos validados y versión si aplica | Estado persistido de `email_accounts` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `EML-E2E-01` |
| `COM-03` | `POST /mail/drafts` | Contexto tenant y permiso efectivo `mail.drafts.create`; datos validados y versión si aplica | Estado persistido de `emails, email_threads` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `EML-E2E-03` |
| `COM-04` | `POST /mail/drafts/{id}/approve` | Contexto tenant y permiso efectivo `mail.outbound.approve`; datos validados y versión si aplica | Estado persistido de `emails, audit_logs` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `EML-E2E-03` |
| `COM-05` | `POST /mail/drafts/{id}/send` | Contexto tenant y permiso efectivo `mail.outbound.send`; datos validados y versión si aplica | Estado persistido de `emails, automation_runs` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `EML-E2E-03` |
| `COM-06` | `POST /mail/accounts/{id}/sync` | Contexto tenant y permiso efectivo `mail.accounts.sync`; datos validados y versión si aplica | Estado persistido de `emails, email_threads` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `EML-E2E-04` |
| `COM-07` | `POST /contacts/{id}/suppression` | Contexto tenant y permiso efectivo `contacts.suppress`; datos validados y versión si aplica | Estado persistido de `contact_compliance, suppression_list` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `EML-E2E-02` |
| `COM-08` | `INTERNAL inbound-message-consumed` | Mensaje entrante deduplicado y seguimiento todavía activo; proceso autorizado | Follow-up cancelado una vez, Opportunity sin cambio | Duplicado, hilo ajeno, seguimiento ya cerrado | `EML-E2E-04` |
| `OFF-01` | `POST /offers` | Contexto tenant y permiso efectivo `offers.create`; datos validados y versión si aplica | Estado persistido de `offers, offer_versions` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `OFF-E2E-01` |
| `OFF-02` | `POST /offers/{id}/versions` | Contexto tenant y permiso efectivo `offers.edit`; datos validados y versión si aplica | Estado persistido de `offers, offer_versions` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `OFF-E2E-01` |
| `OFF-03` | `POST /offers/{id}/negotiations` | Contexto tenant y permiso efectivo `offers.negotiate`; datos validados y versión si aplica | Estado persistido de `offers, offer_versions` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `OFF-E2E-05` |
| `OFF-04` | `POST /offers/{id}/accept` | Oferta vigente y versión aceptable, actor autorizado y precondición de versión | Oferta Accepted, Opportunity Won y estado WE PENDING en transacción atómica | Versión obsoleta, ya aceptada, cross-tenant, conflicto | `OFF-E2E-02` |
| `OFF-05` | `GET /opportunities/{id}/commercial-status` | Contexto tenant y permiso efectivo `opportunities.view`; datos validados y versión si aplica | Estado persistido de `opportunities, work_engagements` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `OFF-E2E-03` |
| `OFF-06` | `POST /opportunities/{id}/work-engagement` | Opportunity Won, WE PENDING, acción humana permitida | Único WE persistido y creation_status CREATED | Duplicado, pendiente inválido, intento automático no autorizado | `OFF-E2E-04` |
| `OPS-01` | `GET /projects/{id}` | Contexto tenant y permiso efectivo `projects.view`; datos validados y versión si aplica | Estado persistido de `projects, project_phases` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `OPS-E2E-01` |
| `OPS-02` | `POST /projects/{id}/progress` | Contexto tenant y permiso efectivo `projects.progress.edit`; datos validados y versión si aplica | Estado persistido de `progress_logs, projects` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `OPS-E2E-02` |
| `OPS-03` | `POST /site-visits/{id}/attachments` | Visita accesible, MIME real, cuota, límite y escaneo | Referencia privada de adjunto aprobado | Archivo nocivo/excesivo, offline no confirmado, cross-tenant | `OPS-E2E-03` |
| `OPS-04` | `POST /projects/{id}/client-instructions` | Proyecto accesible, instrucción accionable, regla de aplicación | Instrucción y efecto vinculado visible en Planning | No se pudo generar efecto, conflicto, falta permiso | `OPS-E2E-04` |
| `OPS-05` | `POST /projects/{id}/close-request` | Contexto tenant y permiso efectivo `projects.close.request`; datos validados y versión si aplica | Estado persistido de `projects, audit_logs` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `OPS-E2E-05` |
| `REC-01` | `POST /recurring-services` | Contexto tenant y permiso efectivo `recurring_services.create`; datos validados y versión si aplica | Estado persistido de `recurring_services, work_engagements` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `REC-E2E-01` |
| `REC-02` | `PUT /recurring-services/{id}/schedule` | Contexto tenant y permiso efectivo `recurring_services.schedule.edit`; datos validados y versión si aplica | Estado persistido de `recurring_services, schedule_versions` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `REC-E2E-02` |
| `REC-03` | `POST /contracts/{id}/renewal-proposals` | Contexto tenant y permiso efectivo `contracts.renew.propose`; datos validados y versión si aplica | Estado persistido de `contracts, audit_logs` o resultado de consulta sin mutación | 401/403/404/409/422; reintento controlado | `REC-E2E-03` |
| `REC-04` | `POST /contracts/{id}/renew` | Cláusula explícita para auto, sin cambio económico no aprobado | Contrato renovado con versión y auditoría | Cláusula ausente, renegociación no aprobada, duplicado | `REC-E2E-04` |
| `REC-05` | `POST /invoices/{id}/issue` | Factura borrador elegible aprobada; check duplicados | Factura emitida registrada, envío independiente | Horas disputadas, duplicado, falta aprobación | `REC-E2E-05` |

> **Límite de esta especificación:** los campos de negocio exactos (DTO) no se inventan aquí. Cada slice requiere schema OpenAPI tipado, ejemplos de request/response, errores por campo, pagination y tests de contrato comprobados antes de ser aprobado como implementable.

