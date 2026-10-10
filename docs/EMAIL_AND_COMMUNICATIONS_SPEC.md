# CleanOps 360 — Comunicaciones e inbox integrado

**Estado:** diseño funcional ampliado; requisitos fuente `REQ-EML-001…007`, `REQ-EML-020/021`, `REQ-FUP-001…003`, `REQ-COM-001…005`. Ninguna función está implementada.

## Actores y superficies UI

- Responsable comercial y agentes autorizados: Inbox → bandejas/cuentas, hilo, búsqueda, respuestas, adjuntos, etiquetas, relación con contacto, empresa, Opportunity o WorkEngagement.
- Administrador: Settings → Cuentas de correo, prueba de conexión, límites de envío, estado de sincronización, políticas de aprobación y pausas.
- Responsable de compliance: Contacto, hilo y Settings → Compliance permiten marcar `DO_NOT_CONTACT`, consultar motivos y evidencia de supresión sin exponerla indebidamente.
- El hilo muestra respuesta recibida, borradores IA claramente etiquetados, aprobaciones requeridas, follow-ups pendientes/cancelados y errores de entrega.

## Datos persistentes y relaciones

`MailboxAccount(tenant_id, protocol, auth_method, secret_reference, sync_cursor, status, policy_version)`, `EmailMessage(mailbox_id, direction, provider_message_id, thread_id, headers_sanitized, body_reference, received_at, delivery_status)`, `EmailThread(linked_contact_id, linked_opportunity_id, linked_work_engagement_id)`, `FollowUp(due_at, status, cancellation_reason, thread_id)`, `SuppressionEntry(contact_id, channel, reason)` y `OutboundApproval(message_id, reviewer_id, decision)` son **estructuras conceptuales propuestas**. Compatibilizar denominaciones con `DATA_MODEL.md` antes de crear migraciones; no duplicar las entidades existentes.

## Flujo de configuración

1. La persona autorizada configura SMTP/IMAP y método permitido por el proveedor. Los secretos se reciben exclusivamente en backend sobre TLS, se almacenan cifrados y nunca regresan a UI.
2. `TestConnection` comprueba conexión saliente y entrante por separado, guardando un resultado sin credenciales. Fallo de una prueba no activa la cuenta como operativa.
3. La sincronización IMAP incremental conserva cursor y deduplica por identificador estable por cuenta; mensajes reencontrados tras reconexión no generan hilos duplicados.
4. Los adjuntos se validan por MIME efectivo, tamaño y antivirus/cuarentena; una pieza no validada nunca se sirve como descarga segura.

## Flujo de salida y consentimiento

1. Crear borrador y seleccionar cuenta, destinatarios, relación y plantilla.
2. Evaluar `DO_NOT_CONTACT`, suppression list, base de contacto, política de primer contacto, modo `MANUAL/APPROVAL/AUTO`, límites progresivos, rebotes y disponibilidad del proveedor. **Una prohibición prevalece sobre modo AUTO.**
3. Si necesita aprobación, la UI muestra `Pendiente de aprobación` y explica qué política la exige; ni worker ni usuario sin permiso pueden saltársela.
4. Tras aprobación vigente, crear intención de envío idempotente, encolar en BullMQ y conservar resultado `QUEUED/SENT/FAILED/BOUNCED` (nombres de estado propuestos), reintentos controlados y registro de motivo. Un timeout SMTP incierto se reconcilia antes de reintentar para evitar duplicados.
5. Un cambio de política o `DO_NOT_CONTACT` posterior y previo al envío obliga a reevaluar la prohibición, incluso si se aprobó el borrador.

## Entrada, IA y follow-ups

- Los mensajes entrantes se tratan como datos no confiables; IA solo redacta, resume, traduce o clasifica dentro de política de privacidad del tenant, nunca acepta ofertas ni cláusulas de manera autónoma.
- Una respuesta entrante que cumpla el criterio del hilo **cancela los follow-ups aplicables**, no la Opportunity. El cierre de Opportunity solo sucede por transición comercial independiente y autorizada (`REQ-FUP-002`).
- Supresión, contacto incorrecto, Opportunity cerrada o pausa administrativa cancelan follow-ups según contexto. Guardar causalidad; la cancelación repetida es idempotente.
- `Run now` ejecuta comprobación autorizada, auditada y sujeta a límites; no fuerza envío prohibido.

## Rechazos específicos

`MAIL_POLICY_DENIED`, `MAIL_ACCOUNT_UNVERIFIED`, `MAIL_RATE_LIMIT`, `MAIL_APPROVAL_REQUIRED`, `MAIL_DUPLICATE_UNCERTAIN`, `MAIL_ATTACHMENT_QUARANTINED`, `MAIL_PROVIDER_UNAVAILABLE`, `MAIL_TENANT_MISMATCH`. Cada uno mantiene borrador y estado recuperable donde proceda.

## Casos de aceptación por slice (diseño; no ejecutados)

| Caso | Acción desde UI | Evidencia backend/persistencia | Resultado |
|---|---|---|---|
| EML-E2E-01 | Conectar cuenta, probar IMAP/SMTP | conexión TLS, cursor, auditoría sin secreto | cuenta operativa solo tras pruebas correctas |
| EML-E2E-02 | Marcar no-contact desde hilo | suppression entry; envío bloqueado por backend/worker | ningún mensaje posterior |
| EML-E2E-03 | Aprobar primer contacto permitido | aprobación, intención idempotente, evento | un solo envío y trazabilidad |
| EML-E2E-04 | Recibir respuesta con follow-up programado | mensaje deduplicado y follow-up cancelado | Opportunity conserva su estado |
| EML-E2E-05 | Reintentar tras timeout ambiguo | reconciliación por clave proveedor/idempotencia | no hay envío duplicado |
| EML-E2E-06 | Usuario de otro tenant accede al hilo | rechazo autorización y registro seguro | cero contenido filtrado |

## Gate de aceptación

Probar con servidor SMTP/IMAP de integración controlada y navegador real. Presentar captura de hilo y estado, trazas sin secretos, consultas DB, prueba de bloqueo por suppression, cron de worker y pruebas de error. No sustituirlo por mocks durante aceptación.

## Semántica transversal obligatoria

- `tenant_id` se aplica a lecturas, mutaciones, búsquedas, archivos y eventos; un identificador válido de otro tenant debe devolver respuesta indistinguible de recurso no accesible, sin revelar información.
- Cada mutación exige permisos efectivos en backend, idempotencia cuando pueda reintentarse y control de versiones para evitar sobrescrituras concurrentes.
- Los identificadores de comandos y rutas HTTP que se describen son **contratos lógicos propuestos**, no rutas técnicas ya aprobadas. Deben fijarse en `API_SPEC.md` antes de la slice correspondiente.
- La UI debe utilizar API y persistencia reales. Si una acción visible no está operativa, no podrá declararse aceptada. Cada cambio relevante produce auditoría sin secretos ni contenido confidencial innecesario.
- Los errores se representan como códigos de dominio estables, con mensaje localizado, `correlation_id` y tratamiento accesible en UI. Nunca se interpretará la falta de conexión como operación confirmada.
