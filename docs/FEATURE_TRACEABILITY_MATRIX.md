# CLEANOPS 360 — FEATURE_TRACEABILITY_MATRIX

**Estado:** matriz de diseño previa a código; comandos/ubicaciones son **nombres lógicos propuestos**, NO endpoints implementados. Fecha: 2026-10-09.

**Regla:** Cada fila se expandirá en la fase correspondiente a `UI Surface → UI Action → Permission → Command/API → Validation → State Transition → Persistence → Side Effects → Event/Consumer → Notification → Audit → Success/Empty/Error/Loading → Retry → Unit/Integration/E2E/Manual`. El campo pendiente **no se considera cobertura verificada**. Cualquier endpoint sin consumidor autorizado y sin finalidad interna explícita es defecto; cualquier control UI sin backend real es defecto bloqueante.

| Feature | Fase | Acción UI | Command/API lógico (NO implementado) | Estado / persistencia | REQ fuente | Pruebas verticales mínimas | Estado |
|---|---:|---|---|---|---|---|---|
| AUTH-LOGIN | 1 | Login → MFA → sesión | `auth.login + auth.mfa.verify` | users/sessions/mfa_challenges | REQ-AUTH-001, REQ-AUTH-002 | E2E válido, OTP caduco, role risk, revocación | DESIGN_ONLY |
| AUTH-PERM | 2 | Manage Access → guardar | `authorization.change` | roles / overrides / audit_logs | REQ-AUTHZ-007 | denegación explícita; cross-tenant; caducidad | DESIGN_ONLY |
| CRM-CONTACT | 3 | Contacto → Do not contact | `contact.markSuppressed` | contacts/suppression_list | REQ-COM-005 | API bloquea campañas incluso AUTO | DESIGN_ONLY |
| OPP-MANUAL | 4 | Crear Opportunity; sugerir/aprobar | `opportunity.create/approve` | opportunities/history | REQ-OPP-001, REQ-OPP-003 | E2E sin Candidate | DESIGN_ONLY |
| RAD-PROMOTE | 5 | Candidate → Promote to Opportunity | `candidate.promote` | project_candidates/opportunities/link/audit | REQ-RAD-003, REQ-RAD-004, REQ-RAD-005 | permisos; dedup; navegación; no autopromoción | DESIGN_ONLY |
| RAD-RUN | 5 | Radar Runs → Run now | `radar.run` | raw_findings/project_candidates/automation_runs | REQ-RAD-020, REQ-RAD-030 | conector real; errores/reintento/SSRF | DESIGN_ONLY |
| SCORE | 6 | Recalculate → motivos | `score.recalculate` | candidate/source evidence | REQ-SCR-003, REQ-SCR-004 | score+reasons; procedencia | DESIGN_ONLY |
| EMAIL | 7 | Inbox → enviar/recibir | `email.send/sync` | emails/email_threads | REQ-EML-001, REQ-EML-020 | SMTP/IMAP real; bloqueo suprimidos | DESIGN_ONLY |
| FOLLOWUP | 8 | Programar/pausar follow-up | `followup.schedule/cancel` | automation_rules/runs,emails | REQ-FUP-002, REQ-EML-021 | respuesta cancela; compliance | DESIGN_ONLY |
| VISIT | 9 | Agendar/registrar visita | `visit.create/update` | site_visits/documents | REQ-VIS-001 | móvil; persistencia de adjuntos | DESIGN_ONLY |
| OFFER-ACCEPT | 10 | Offer → Accept | `offer.accept` | offers/opportunity status/audit | REQ-OFF-004, REQ-WE-001 | Won automático inmediato + auditoría | DESIGN_ONLY |
| WE-CREATE | 11 | Opportunity Won → Crear WorkEngagement | `workEngagement.createFromWon` | work_engagements/opportunity status | REQ-WE-002, REQ-TRC-WE-001 | PENDING hasta click autorizado, CREATED solo tras éxito, no dup | DESIGN_ONLY |
| PLAN | 12 | Calendar → publicar propuesta | `planning.publish` | schedule_versions/assignments | REQ-PLN-002, REQ-SCH-003 | locking concurrencia, aprobación humana | DESIGN_ONLY |
| MY-DAY | 12 | My Day → Confirmar | `notification.acknowledge` | notification_acknowledgements | REQ-CAL-004 | SENT → DELIVERED → READ → ACKNOWLEDGED | DESIGN_ONLY |
| PROJECT | 13 | Obra → avance por fase y planos | `project.updateProgress` | projects/phases/units/plan_versions | REQ-PHS-002, REQ-PLAN-004 | plan versionado; sin reemplazo | DESIGN_ONLY |
| RECURRING | 14 | Renew / Renegotiate / Terminate / Postpone | `recurring.transition` | contracts/recurring_services/audit | REQ-REC-020 | auto renew solo cláusula; renegociación humana | DESIGN_ONLY |
| INSTRUCTION | 15 | Client Instruction → enviar | `instruction.apply` | client_instructions/assignments/tasks | REQ-CLI-002 | efecto operacional visible y revisión | DESIGN_ONLY |
| HOURS | 16 | Timesheet offline → sincronizar | `timesheet.sync` | timesheets/work_logs/conflicts | REQ-OFFLINE-001, REQ-HRS-002 | reautenticación; no overwrite | DESIGN_ONLY |
| RAPPORT | 17 | Rapport → aprobar/rechazar parcial | `rapport.review` | rapports/rapport_lines | REQ-RPT-002 | horas disputadas separadas | DESIGN_ONLY |
| INVOICE | 18 | Factura → generar borrador → emitir → enviar | `invoice.draft/issue/send` | invoices/invoice_lines/payments | REQ-FIN-020 | no duplicado; emisión autorizada y envío separado | DESIGN_ONLY |
| CLOSE | 19 | Closeout → Crear referencia/No ahora | `closeout.complete` | projects/history | REQ-CLOSE-001, REQ-CLOSE-002 | sin publicación automática | DESIGN_ONLY |
| SECURITY | 20 | Security Center → eventos; Restore evidence | `security.review/restore.test` | security_events/backup evidence | REQ-SEC-030, REQ-AUD-001, REQ-OPS-001, REQ-INF-003 | prueba restore real, objetivo vs evidencia | DESIGN_ONLY |

| EMPLOYEE-MANAGE | G-EMP previo 12 | Empleado → perfil, habilidades, ausencias y disponibilidad | `employee.save/availability.record` | employees/availability/absences/teams | REQ-EMP-001, REQ-EMP-002 | roles, permisos, persistencia, disponibilidad real en motor, denegación | DESIGN_ONLY |
| COMPLIANCE-GATE | G-CMP previo 12 | Normativa → propuesta → revisar → aprobar | `compliance.propose/approve` | compliance_rules/rule_sets/versions | REQ-CMP-001, REQ-CMP-030 | vigencia, fuente, aprobación humana, Planning bloqueado sin regla aplicable | DESIGN_ONLY |
| ONE-OFF | G-SVC-ONE | Servicio puntual → planificar → ejecutar → facturar → cerrar | `workEngagement.createOneOff` | work_engagements/one_off_services/assignments/invoices | REQ-SVC-001, REQ-PR-002, REQ-PR-003 | flujo completo desde UI; motor único; permisos | DESIGN_ONLY |
| MAINTENANCE | G-SVC-MAINT | Contrato mantenimiento → ciclo → revisión | `maintenance.create/review` | work_engagements/contracts/recurring_services | REQ-SVC-002, REQ-PR-002, REQ-REC-031 | contrato y autorizaciones, motor común, renovación sin auto no autorizada | DESIGN_ONLY |
| DASHBOARD | transversal | Dashboard → consultar paneles de hoy, comercial y finanzas | `dashboard.read` | lecturas de proyecciones autorizadas | REQ-DASH-001 | tenant isolation, filtros, datos frescos y estados vacíos | DESIGN_ONLY |

## Requisito especial: conversión comercial → operación

1. Oferta `Accept`: acción autorizada, cambio **inmediato** de `Opportunity` a `Won`, historial y auditoría.
2. En `Won`: `work_engagement_creation_status=PENDING`, acción visible `Crear WorkEngagement`; no creación automática.
3. Al pulsar `Crear`: verificar permiso, validar datos y deduplicación, comando idempotente y transacción; si éxito crear la entidad relacionada, marcar `CREATED`, auditar y navegar al detalle; si falla conservar `PENDING`, informar error y permitir retry seguro. No presumir contrato firmado.
4. Tests unitarios, integración, E2E desde UI, y prueba manual de Product Owner obligatorios.

## Checklist obligatorio por fila para la fase implementada

- [ ] Identificador de REQ sin pérdida; owner y rol con permiso exacto.
- [ ] Ruta UI real y diseño responsive con estados empty/loading/error/success.
- [ ] API real documentada y usada por UI o consumidor interno justificado.
- [ ] Estado y mutación transaccional verificables en DB; efectos y auditoría.
- [ ] Prueba de denegación por tenant/rol, validación, retry e idempotencia.
- [ ] Tests unitarios, integración y E2E reales (mocks solo para pruebas unitarias controladas).
- [ ] Staging con versión + evidencia de test manual y aceptación explícita.

**Cobertura actual:** rutas/contratos reales, IDs técnicos de eventos, permisos exactos, errores, métricas, test IDs y estados finales quedan `NOT_IMPLEMENTED` para rellenar durante cada vertical slice. La matriz no declara capacidad implementada.


### Alcance E2E obligatorio para `WE-CREATE` / `REQ-TRC-WE-001`

El test de trazabilidad deberá iniciar en la aceptación de una oferta por usuario autorizado, comprobar `Opportunity.Won` inmediato y auditado, `work_engagement_creation_status=PENDING` con botón de creación visible, probar prohibición de creación automática, ejecutar el botón como usuario autorizado, validar deduplicación/idempotencia, almacenar `WorkEngagement`, cambiar a `CREATED`, registrar auditoría y navegar a la ficha. Debe probar también fallo transaccional que mantiene `PENDING`, reintento seguro y ausencia de presunción de contrato firmado. Evidencia E2E UI + API + DB y prueba manual.

## Presupuestos — extensión de diseño 2026-10-26

Nombres lógicos propuestos; sin endpoints implementados. Aplican columnas extendidas y gates de la matriz principal.

| Feature | Fase | Acción UI | REQ | Persistencia / consumidor | Pruebas diseñadas | Estado |
|---|---|---|---|---|---|---|
| CALC-CONFIG | 10 | Configurar/revisar perfil, catálogo y vigencia | REQ-CALC-001/002/003/010 | Perfil tenant versionado; motor de ofertas | CALC-01/07/08 | DESIGN_ONLY |
| CALC-QUOTE | 10 | Raumbuch → calcular → comparar variante | REQ-CALC-004/005/006/007/012 | OfferVersion y snapshot | CALC-02/03/04/05/10 | DESIGN_ONLY |
| CALC-ISSUE | 10 | Aprobar excepción, emitir PDF y aceptar versión | REQ-CALC-008/009/010 | Versionado, documentos, auditoría existentes | CALC-06/07/10 | DESIGN_ONLY |
| CALC-ACTUAL | 16–18 | Comparar estimado/real; revisar rendimiento propuesto | REQ-CALC-011 | Snapshot aceptado y fuentes operativas existentes | CALC-09 | DESIGN_ONLY; depende de módulos reales |

Backend verifica permisos de configuración, costes, margen y excepción por separado. UI no basta para denegar; aislamiento incluye exportación y consultas. Completar contratos efectivos y evidencia al implementar, no declarar cobertura por estas filas.
