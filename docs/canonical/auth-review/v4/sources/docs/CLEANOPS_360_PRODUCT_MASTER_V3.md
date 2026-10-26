# CLEANOPS 360 — PRODUCT MASTER V3

## Documento maestro unificado para PRD, Specs, Arquitectura, Seguridad y Roadmap

**Versión:** 3.0 — consolidación normativa 2026-10-09  
**Estado:** Fuente de verdad principal antes de implementación, armonizada con SRS V1.1  
**Objetivo:** servir como documento maestro único para que Codex genere PRD, especificaciones funcionales y técnicas, arquitectura, modelo de datos, APIs, seguridad, automatizaciones, roadmap y plan de implementación por fases verticales verificables.

---

# 0. REGLA PRINCIPAL PARA CODEX

Este documento sustituye a versiones anteriores del Product Master y a addendums previos; esta consolidación incorpora las 26 decisiones aprobadas el 2026-10-09.

Codex deberá tratar este archivo como **fuente maestra de alcance funcional y técnico**. Para requisitos normativos y condiciones de aceptación prevalece `CLEANOPS_360_SRS_V1_1.md` cuando detalle o corrija un flujo; ante un conflicto no resuelto, deberá registrarse `DECISION_REQUIRED` antes de implementar.

Antes de escribir código deberá generar, como mínimo:

1. `PRD.md`
2. `FUNCTIONAL_SPEC.md`
3. `TECHNICAL_SPEC.md`
4. `ARCHITECTURE.md`
5. `DATA_MODEL.md`
6. `RBAC_PERMISSIONS.md`
7. `PLANNING_ENGINE_SPEC.md`
8. `CALENDAR_AND_SCHEDULING_SPEC.md`
9. `API_SPEC.md`
10. `EVENTS_AND_AUTOMATIONS.md`
11. `AI_AGENTS_SPEC.md`
12. `EMAIL_AND_COMMUNICATIONS_SPEC.md`
13. `OFFERS_AND_NEGOTIATION_SPEC.md`
14. `PROJECT_OPERATIONS_SPEC.md`
15. `RECURRING_SERVICES_SPEC.md`
16. `PLANS_AND_DOCUMENTS_SPEC.md`
17. `TIMESHEETS_AND_RAPPORTS_SPEC.md`
18. `FINANCE_SPEC.md`
19. `COMPLIANCE_RULES_SPEC.md`
20. `UX_UI_SPEC.md`
21. `RESPONSIVE_AND_OFFLINE_SPEC.md`
22. `SECURITY_AND_AUDIT_SPEC.md`
23. `SECURITY_ARCHITECTURE.md`
24. `THREAT_MODEL.md`
25. `FEATURE_TRACEABILITY_MATRIX.md`
26. `ENTITY_UI_COVERAGE.md`
27. `TESTING_STRATEGY.md`
28. `ROADMAP.md`
29. `SPRINT_PLAN.md`
30. `RISKS_AND_OPEN_QUESTIONS.md`
31. `ACCEPTANCE_CRITERIA.md`
32. `MANUAL_TEST_CHECKLISTS.md`

Codex no debe comenzar implementación antes de detectar contradicciones, listar decisiones pendientes, construir dependency graph, validar permisos, tenant isolation, seguridad y trazabilidad end-to-end.

Cuando exista una ambigüedad:
- no inventar una regla de negocio;
- crear `DECISION_REQUIRED`;
- proponer opciones;
- explicar impacto;
- priorizar la solución más simple compatible con el producto completo.

---

# 1. VISIÓN DEL PRODUCTO

CleanOps 360 será una plataforma integral para empresas de limpieza y facility services.

Debe controlar el ciclo completo:

**oportunidad → contacto → visita → oferta → negociación → adjudicación → planificación → ejecución → horas → rapports → facturación → cobro → cierre → relación comercial futura**

Será una plataforma operativa y comercial unificada.

---

# 2. PRINCIPIO CENTRAL DE ARQUITECTURA

El sistema se construye alrededor de una entidad común:

# `WorkEngagement`

Tipos iniciales:

```text
PROJECT
RECURRING_SERVICE
ONE_OFF_SERVICE
MAINTENANCE_CONTRACT
```

Todos comparten, cuando aplique:
- cliente;
- ubicación;
- contactos;
- responsables;
- planificación;
- empleados;
- horarios;
- instrucciones;
- documentos;
- accesos;
- timesheets;
- rapports;
- facturación;
- notificaciones;
- comentarios;
- auditoría.

Cada tipo añade su lógica específica.

---

# 3. TIPOS DE WORK ENGAGEMENT

## 3.1 PROJECT
Obra nueva, reforma, limpieza de construcción o proyecto con fases y fecha final.

Campos específicos:
- start_date;
- end_date;
- cleaning_phases;
- progress;
- plans;
- client_instruction_log;
- reference_hours;
- completion;
- acceptance;
- closeout.

## 3.2 RECURRING_SERVICE
Unterhaltsreinigung, oficina, escuela, supermercado, Hauswartung, Hygiene-Service.

Campos:
- recurrence_rule;
- service_calendar;
- service_frequency;
- service_window;
- renewal_cycle;
- contract_status;
- pause_resume;
- termination_terms;
- recurring_tasks;
- billing_frequency (nombre canónico; `billing_cycle` es alias histórico, no campo paralelo).

## 3.3 ONE_OFF_SERVICE
Limpieza puntual, mudanza, intervención especial, limpieza urgente.

Campos:
- scheduled_date;
- estimated_duration;
- completion_status;
- fixed_scope.

## 3.4 MAINTENANCE_CONTRACT
Contratos continuos con:
- periodos;
- SLA;
- revisiones;
- renovación;
- cancelación;
- múltiples ubicaciones;
- tareas recurrentes.

---

# 4. CLOSED_DECISION — MOTOR OPERATIVO ÚNICO

No se crearán motores separados de planificación para obras, mantenimiento, recurrentes y puntuales.

Todos alimentan el mismo Planning Engine.

Ejemplo:

```text
06:00–08:00  Oficina recurrente
09:00–16:00  Proyecto de obra
17:00–19:00  Limpieza puntual
```

---

# 5. PRINCIPIOS DE PRODUCTO

- La complejidad vive en backend.
- UI limpia, rápida, amigable, responsive y consistente.
- Mobile first para empleado, responsable, visitador y supervisor.
- Desktop first para administración, comercial, planner, finanzas y dirección.
- IA asistiva, no decisora en precio, contratos, salario, sanciones o decisiones sensibles.
- Configuración por empresa/tenant.

---

# 6. CORE SELF-CONTAINED

## CLOSED_DECISION

CleanOps debe funcionar como producto autónomo.

Toda lógica central vive dentro del sistema:
- Radar Engine;
- Scheduler;
- Background Workers;
- Queue Processing;
- Email Engine;
- Notification Engine;
- Automation Engine;
- AI Orchestration;
- Planning Engine;
- File Processing;
- Security Engine.

La arquitectura aprobada para MVP usa un VPS suizo con Docker, PostgreSQL, Redis + BullMQ y archivos privados en volúmenes persistentes. No se incluye object storage externo ni proxy CDN internacional por defecto. SMTP/IMAP por tenant y proveedores de IA podrán ser externos solo bajo las garantías de tratamiento y residencia autorizadas; toda operación principal ocurre en CleanOps.

---

# 7. NO N8N

## CLOSED_DECISION

No usar n8n en ninguna parte de la arquitectura, workflows, automatizaciones, emails, radar, IA o planificación.

---

# 8. NO DEPENDENCIA DE “INTEGRACIONES FUTURAS”

Las funciones esenciales deben funcionar dentro del producto cuando su fase sea entregada:
- calendario propio;
- planning propio;
- permisos propios;
- ofertas propias;
- rapports propios;
- email operativo propio;
- radar propio;
- automatizaciones propias.

---

# 9. ORIGEN DE OPORTUNIDADES

## 9.1 Radar automático
SIMAP, webs GU/TU, Baumanagement, promotores, arquitectos, municipios, cantones, portales, APIs, feeds, fuentes sectoriales y email.

## 9.2 Creación manual
Por llamada de Bauleiter, obra vista por un usuario, correo, recomendación, contacto o descubrimiento directo.

## 9.3 Suggestion Flow
Permiso:
```text
opportunities.suggest
```
Un empleado puede sugerir oportunidad con comentario, ubicación, foto o contacto. Un usuario con:
```text
opportunities.approve
```
decide si se convierte en Opportunity.

## 9.4 Importación
CSV, Excel, API, email o formulario.

---

# 10. PROJECT CANDIDATE VS OPPORTUNITY

## CLOSED_DECISION

`ProjectCandidate` = hallazgo bruto.

```text
Radar/Connector
→ RawFinding
→ ProjectCandidate
→ Review/Enrichment
→ Promote
→ Opportunity
```

`Opportunity` = oportunidad comercial gestionable.

Puede crearse desde ProjectCandidate o directamente de forma manual.

---

# 11. SOURCE CONNECTORS

Abstracción:
```text
SourceConnector
```

Tipos:
```text
WEB
API
RSS
EMAIL
MANUAL
IMPORT
PORTAL
```

Produce `RawFinding`.

---

# 12. SOURCE OF TRUTH POR DATO

Datos críticos guardan:
```text
value
source_type
source_reference
confidence
verified_at
verified_by
```

Precedencia inicial:
```text
manual_verified
>
trusted_structured_source
>
public_web_source
>
ai_inference
```

Una actualización automática no sobrescribe silenciosamente un dato confirmado manualmente.

---

# 13. DEDUPLICACIÓN

Comparar nombre, dirección, localidad, empresa, Bauherr, GU/TU, fechas, coordenadas y similitud semántica.

Debe permitir merge manual e historial de merge.

---

# 14. ENRIQUECIMIENTO

Investigar Bauherr, GU, TU, Baumanagement, arquitecto, Projektleiter, Bauleiter, Einkauf, Vergabe, email, teléfono, fechas, tamaño, presupuesto, estado, ubicación y fuentes.

Estados:
```text
CONFIRMED
PROBABLE
INFERRED
UNKNOWN
```

---

# 15. SCORING

Ayuda a priorizar, no decide solo.

Cada score incluye:
```text
score
reasons[]
```

---

# 16. PIPELINE COMERCIAL

Estados base:

1. Discovered
2. Researching
3. Qualified
4. Pending Approval
5. Approved
6. Contact Prepared
7. Contacted
8. Waiting Reply
9. Follow-up
10. Replied
11. Interested
12. Documentation Requested
13. Visit Requested
14. Visit Scheduled
15. Visited
16. Preparing Offer
17. Offer Sent
18. Negotiation
19. Won
20. Lost
21. Awarded to Third Party
22. Future Follow-up

---

# 17. EMPRESAS Y CONTACTOS

Company puede tener múltiples proyectos, oportunidades, contactos y contratos.

Contact puede ser Bauleiter, Projektleiter, Facility Manager, Objektleiter, Einkauf, Baumanagement, administración o dirección.

---

# 18. CONTACT COMPLIANCE

Campos:
```text
data_source
source_url
first_seen_at
last_verified_at
communication_basis
do_not_contact
do_not_contact_at
privacy_request_status
retention_review_at
```

Estados:
```text
UNKNOWN
DIRECT_RELATION
EXISTING_CUSTOMER
INBOUND_CONTACT
PUBLIC_TENDER_CONTACT
MANUAL_REVIEW_REQUIRED
DO_NOT_CONTACT
```

Primer contacto frío no validado: `APPROVAL`.

---

# 19. SUPPRESSION LIST

Lista global por tenant.

UI obligatoria:
- Contact → Do not contact
- Email thread → Mark as do not contact
- Settings → Compliance → Suppression List

---

# 20. EMAIL INTEGRADO

Inbox, enviar, recibir, responder, reenviar, adjuntos, thread, búsqueda, etiquetas, IA y asociación con empresa/contacto/oportunidad/proyecto.

---

# 21. EMAIL AUTOMATION MODES

```text
AUTO
APPROVAL
MANUAL
```

Ejemplo:
```text
Discovery = AUTO
Enrichment = AUTO
ProjectCandidate → Opportunity = APPROVAL (promoción humana explícita; excepciones futuras solo mediante regla aprobada)
Manual Opportunity Creation = MANUAL (usuario autorizado)
Opportunity Suggestion → Approval = APPROVAL
Initial Cold Email = APPROVAL cuando no existe policy/contact basis validada; AUTO solo dentro de políticas verificadas
Follow-up = configurable
Price Negotiation = MANUAL
```

---

# 22. EMAIL AI

Puede redactar, traducir, resumir y clasificar. No compromete precio ni acepta condiciones sensibles.

---

# 23. PROMPT INJECTION PROTECTION

Emails entrantes son contenido no confiable. Agentes IA con scope limitado, logs y approval para acciones sensibles.

---

# 24. FOLLOW-UP

Configurable y cancelado cuando haya respuesta, no-contact, oportunidad cerrada, contacto incorrecto o pausa manual.

---

# 25. VISITAS

`SiteVisit` con opportunity/project, fecha, hora, dirección, usuario asignado, contacto, notas, planos, adjuntos y estado.

---

# 26. VISIT APP

Notas, voz, fotos, vídeo, documentos, planos, edificios, plantas, viviendas, garajes y zonas comunes. Formularios cortos.

---

# 27. PLANOS

Formatos iniciales: PDF, JPG, PNG.

Versionado:
- name;
- code;
- revision;
- uploaded_at;
- uploaded_by;
- current_version;
- historical_versions.

Nunca sobrescribir silenciosamente.

---

# 28. DATA CLASSIFICATION

```text
PUBLIC
INTERNAL
CONFIDENTIAL
HIGHLY_CONFIDENTIAL
```

---

# 29. AI DATA POLICY

Por tenant:
```text
allow_ai_email_processing
allow_ai_documents
allow_ai_plans
allow_ai_financial_data
allow_ai_employee_data
```

---

# 30. OFFER BUILDER

Tipos:
```text
HOURLY
FIXED_PRICE
DOCUMENT_BASED
FREE_FORM
RECURRING_SUBSCRIPTION
```

---

# 31. RECURRING OFFERS

Frecuencia, tarifa, duración, renovación, cancelación, ubicación, alcance recurrente y facturación periódica.

---

# 32. NPK / CRBX

No construir editor NPK completo en MVP.

V1: adjuntar PDF/XLSX/CRBX.  
V2: importar posiciones estructuradas.  
V3: compatibilidad CRBX avanzada si se justifica.

---

# 33. OFFER TEMPLATES

Baureinigung, Bauendreinigung, Fensterreinigung, Spezialreinigung, Stundenbasis, Unterhaltsreinigung, Hauswartung, Hygiene-Service.

---

# 34. OFFER VERSIONING

Nunca sobrescribir. Guardar changed_by, changed_at, reason, customer_request y status.

---

# 35. NEGOCIACIÓN

Mostrar current_price, requested_price, delta e impacto de margen si existe información.

Acciones: Accept, Counter, Maintain. IA redacta; humano decide.

---

# 36. WON OPPORTUNITY

**Decisión cerrada conforme a REQ-WE-001/002/003 del SRS:** `Accept` de oferta provoca inmediatamente `Opportunity = Won` con auditoría. Esta transición **no** crea un `WorkEngagement`. La oportunidad queda en `PENDING`, aparece `Crear WorkEngagement` y únicamente una acción humana autorizada crea la entidad operativa y establece `CREATED`. La creación no equivale a contrato firmado. Las transiciones deben ser trazables end-to-end (REQ-TRC-WE-001).

```text
Offer Accepted
→ Opportunity Won
→ work_engagement_creation_status = PENDING
→ Acción visible «Crear WorkEngagement» (usuario autorizado)
→ WorkEngagement Created; work_engagement_creation_status = CREATED
→ Contract Status independiente (NOT_REQUIRED/PENDING/RECEIVED/SIGNED/ACTIVE/EXPIRED/TERMINATED)
```

---

# 37. CONTRACT STATUS

```text
NOT_REQUIRED
PENDING
RECEIVED
SIGNED
ACTIVE
EXPIRED
TERMINATED
```

---

# 38. PLANNING ENGINE

Gestiona proyectos, recurrentes, puntuales y mantenimiento.

Entradas:
- WorkEngagement;
- schedule;
- empleados;
- disponibilidad;
- skills;
- descansos;
- ubicación;
- transporte;
- continuidad;
- prioridades;
- instrucciones cliente;
- fechas;
- horas;
- restricciones.

Salidas:
- propuestas;
- conflictos;
- huecos;
- alertas;
- replanificación.

Humano confirma.

---

# 39. CALENDAR / SCHEDULE UI

Vistas día, semana, mes, empleado, equipo, proyecto y ubicación.

Debe mezclar obra, recurrente, puntual y mantenimiento.

---

# 40. EMPLOYEE HOME — MY DAY

Mostrar hora, lugar, dirección, trabajo, equipo, responsable, transporte, acceso, instrucciones y cambios recientes.

Acciones:
- confirmar;
- registrar horas;
- informar ausencia;
- solicitar transporte si permitido;
- abrir proyecto;
- ver documentos autorizados.

---

# 41. CRITICAL CHANGE ACKNOWLEDGEMENT

Estados:
```text
SENT
DELIVERED
READ
ACKNOWLEDGED
```

El botón Confirmar de My Day dispara este mismo flujo.

---

# 42. PLANNING VERSIONING

Guardar versión, published_by, published_at, cambios y usuarios afectados.

---

# 43. CONCURRENCIA

Optimistic locking o equivalente en planificación, ofertas, permisos, proyectos, contactos, horas y rapports.

---

# 44. EMPLEADOS

Identity, contact, language, employment_type, availability, skills, driver, vehicle, can_lead, known_projects y status.

---

# 45. COMPLIANCE RULE ENGINE

```text
ComplianceRuleSet
```

Campos:
```text
country
region
collective_agreement
effective_from
effective_to
employee_category
rule_type
rule_value
source
```

---

# 46. CLIENT INSTRUCTION

Entidad interna:
```text
ClientInstruction
```

Puede venir de Bauleiter, Objektleiter, Facility Manager, cliente, GU o administración.

---

# 47. CLIENT INSTRUCTION TYPES

```text
INCREASE_STAFF
REDUCE_STAFF
CHANGE_PRIORITY
REPEAT_CLEANING
NEW_AREA
PAUSE_WORK
REACTIVATE_WORK
CHANGE_DEADLINE
OTHER
```

`INCREASE_STAFF` y `REDUCE_STAFF` deben generar efecto visible en Planning Engine: requirement, staffing need, alerta y/o tarea para planner.

---

# 48. HORAS DE REFERENCIA

`reference_hours_current` no es límite duro ni crea workflow de ampliación.

---

# 49. REFERENCE HOURS HISTORY

Guardar previous_value, new_value, source, changed_at, changed_by y note.

UI:
```text
Proyecto → Horas referencia → Ver historial
```

---

# 50. ALERTAS DE HORAS

Ejemplo configurable:
- 70 % info;
- 85 % warning;
- 95 % high;
- 100 % exceeded.

No bloquear ni solicitar automáticamente horas.

---

# 51. FASES DE LIMPIEZA

Plantilla:
```text
Grobreinigung
Erste Reinigung
Weitere Reinigung
Endreinigung
Nachreinigung
```

Configurable.

---

# 52. ESTRUCTURA SIMPLE DE OBRA

UI sencilla por edificio/planta/unidad. Evitar jerarquías profundas obligatorias.

---

# 53. ESTADO POR FASE

Una unidad puede pasar varias veces por limpieza.

---

# 54. QUICK ACTIONS

+ Foto  
+ Avance  
+ Incidencia  
+ Instrucción cliente  
+ Horas  
+ Personal

---

# 55. TRANSPORTE

Separar asignación y transporte.

---

# 56. LLAVES Y ACCESOS

Key, badge, code, lockbox, opener, access_schedule y responsible_user.

---

# 57. WORK LOG

Team, hours, phase, area, completed_units, comment y photos.

---

# 58. TIMESHEETS

Empleado registra, responsable registra equipo o importación externa.

---

# 59. RAPPORTS

Weekly, biweekly, monthly o custom.

---

# 60. RAPPORT VALIDATION

## CLOSED_DECISION

Validación de rapports definida por contrato; horas aprobadas facturables, horas disputadas separadas; facturación provisional solo con permiso contractual expreso, según `REQ-RPT-002`.

---

# 61. FINANZAS

Separar:
```text
worked_hours
validated_hours
invoiced_hours
paid_hours
```

---

# 62. FACTURACIÓN

Billing frequency, payment terms, billing method, hourly rate, fixed price, currency y VAT.

---

# 63. RECURRING BILLING

Weekly, monthly, quarterly o custom; renovación, pausa, terminación y re-cotización.

---

# 64. CIERRE DE PROYECTO

End date, actual hours, reference hours, billing, payments, duration, incidents, contact y result.

---

# 65. RECURRENT SERVICE LIFECYCLE

```text
DRAFT
ACTIVE
PAUSED
RENEWAL_DUE
RENEWED
TERMINATION_PENDING
TERMINATED
```

UI en `RENEWAL_DUE`:
- Renew
- Renegotiate
- Terminate
- Postpone decision

---

# 66. REFERENCIAS COMERCIALES

Al cerrar proyecto:
- Crear referencia comercial
- No ahora

Puede existir draft automático, no publicación externa automática.

---

# 67. ROLES BASE

Super Admin, Company Admin, Sales, Planner, Project Manager, Site Responsible, Visitor, Employee, Finance, Viewer.

---

# 68. PERMISSION MODEL

Acciones:
```text
view
create
edit
approve
delete
export
manage_permissions
```

Ámbitos: tenant, module, work_engagement, project, document, plan, offer, finance, employee_data.

---

# 69. USER PERMISSION OVERRIDES

UI:
```text
Administration
→ Users
→ User Detail
→ Manage Access
```

Mostrar rol base, heredados, overrides, proyectos, temporales y expiración.

---

# 70. TEMPORARY ACCESS

`start_at`, `expires_at`.

Acciones:
- Add Temporary Access
- Revoke
- Extend

---

# 71. PERMISSION PRECEDENCE

## CLOSED_DECISION

`explicit deny` siempre prevalece; las políticas de aislamiento tenant son infranqueables, y los grants de rol/recurso/usuario/temporales solo operan dentro de límites superiores; denegar por defecto y auditar, conforme a `REQ-AUTHZ-007`.

---

# 72. AUDITORÍA

Registrar login, failed login, permission changes, price changes, offer versions, schedule publication, timesheet/rapport changes, document access, bulk export, deletion, AI actions y automation actions.

---

# 73. AUTENTICACIÓN

## CLOSED_DECISION

Soportar:

### Método A — Password + código por email
```text
Email
→ Password
→ credentials valid
→ generate OTP
→ send email
→ user enters code
→ verify
→ create session
```

### Método B — Password + TOTP Authenticator

Compatible con apps estándar TOTP.

---

# 74. EMAIL OTP

Requisitos:
- un solo uso;
- expiración configurable;
- hash en DB;
- invalidar códigos previos al reenviar;
- rate limit por usuario/IP/dispositivo;
- cooldown;
- límite de intentos;
- auditoría;
- mensajes que no revelen existencia de cuenta.

---

# 75. TOTP AUTHENTICATOR

```text
Account
→ Security
→ Enable Authenticator
→ QR
→ Scan
→ First TOTP
→ Verify
→ Enabled
```

Secreto cifrado.

---

# 76. RECOVERY CODES

Códigos de un solo uso, mostrados una vez, guardados como hash. MFA reset auditado.

---

# 77. SESIONES

UI:
```text
Account
→ Security
→ Active Sessions
```

Mostrar dispositivo, navegador, actividad y fecha.

Acciones:
- Revoke session
- Revoke all other sessions

---

# 78. STEP-UP AUTHENTICATION

Para cambiar permisos críticos, datos financieros sensibles o resetear MFA de otro usuario.

---

# 79. REMEMBER DEVICE

Configurable por tenant. No pedir OTP continuamente dentro de una sesión válida.

---

# 80. SECURITY ARCHITECTURE

```text
Internet
↓
CDN / DDoS Protection
↓
WAF
↓
Load Balancer
↓
Application/API
↓
Workers
↓
Database / Storage
```

---

# 81. RATE LIMITING MULTINIVEL

```text
global_limit
tenant_limit
user_limit
ip_limit
endpoint_limit
operation_limit
```

Aplicar a login, password reset, OTP, upload, export, AI, email, radar y reportes.

---

# 82. RESOURCE & COST GUARD

```text
tenant_ai_budget
tenant_email_quota
tenant_storage_quota
tenant_api_quota
tenant_worker_quota
tenant_search_quota
```

Con:
```text
soft_limit
hard_limit
alert_threshold
```

---

# 83. CONCURRENCY LIMITS

Limitar requests, uploads, exports, AI jobs, reports y radar runs concurrentes.

---

# 84. PAYLOAD LIMITS

Definir tamaños máximos de JSON, arrays, query, paginación, uploads, número de archivos, dimensiones, páginas PDF y descompresión de archivos.

---

# 85. FILE SECURITY PIPELINE

```text
Upload
→ Quarantine
→ Validate MIME + Magic Bytes
→ Malware Scan
→ Archive Bomb Check
→ Sanitize if applicable
→ Store
→ Signed Access URL
```

---

# 86. AUTH ABUSE PROTECTION

Brute force, credential stuffing, progressive delays, IP/device throttling, MFA challenge, secure hashing y bloqueo temporal no explotable como DoS contra otro usuario.

---

# 87. SESSION SECURITY

HttpOnly, Secure, SameSite, session rotation, fixation protection, inactivity timeout, absolute timeout, revoke y MFA freshness.

---

# 88. CSRF

Protección explícita si se usa cookie-based auth.

---

# 89. XSS

Output encoding, HTML sanitization, CSP y rendering seguro, especialmente en emails y contenido IA.

---

# 90. SQL/QUERY INJECTION

Prepared queries, ORM seguro, allowlists y tests.

---

# 91. SSRF

Radar/importadores deben bloquear private IPs, metadata endpoints, protocolos inseguros, DNS rebinding y redirects peligrosos.

---

# 92. WEBHOOK SECURITY

Si existen webhooks: signature verification, timestamp, replay protection, idempotency keys y secret rotation.

---

# 93. BUSINESS FLOW ABUSE

Límites para emails/day, exports/hour, downloads/day, invitations/hour, AI/hour, opportunities/hour y radar runs/hour.

---

# 94. EXPORT PROTECTION

Permiso específico, audit log, límites, step-up MFA opcional y alertas.

---

# 95. DATA EXFILTRATION DETECTION

Detectar descargas/exportaciones masivas y accesos anómalos.

---

# 96. INFRASTRUCTURE ISOLATION

Separar public web, API, workers, radar workers, AI workers, file processors, database y storage.

---

# 97. WORKER SANDBOXING

Procesar PDF, imágenes, OCR futuro y CAD futuro en workers aislados.

---

# 98. SECRET MANAGEMENT

Secret manager, scopes, rotation, staging/prod separados, no secrets en logs y secret scanning.

---

# 99. SUPPLY CHAIN SECURITY

Lockfiles, dependency scanning, SBOM, updates automatizadas controladas, SAST, secret scanning, branch protection, code review y CI restrictions.

---

# 100. CI/CD SECURITY GATE

Producción requiere:
```text
lint
typecheck
unit tests
integration tests
security scan
migration validation
build
```

---

# 101. SECURITY CENTER

UI administrativa:

## Overview
Risk level, active sessions, events today, blocked requests.

## Events
Brute force, mass export, suspicious login, blocked API, malware upload.

## Sessions
User, device, last activity, revoke.

## Access Changes
Cambios de permisos.

## Automations
Acciones sensibles.

## Incidents
Open, Investigating, Resolved.

---

# 102. SECURITY EVENTS

```text
LOGIN_BRUTE_FORCE
CREDENTIAL_STUFFING_SUSPECTED
MASS_EXPORT
MASS_DOWNLOAD
PRIVILEGE_CHANGE
MALWARE_UPLOAD
RATE_LIMIT_TRIGGERED
SUSPICIOUS_API_PATTERN
ABNORMAL_AUTOMATION
SSRF_BLOCKED
AI_ABUSE_LIMIT
```

---

# 103. INCIDENT RESPONSE

Detection, containment, investigation, notification, recovery y post-mortem.

---

# 104. EXTERNAL SECURITY REVIEW

Antes de producción real: pentest/revisión externa. Después: revisión periódica.

---

# 105. FEATURE FLAGS

```text
radar_enabled
ai_email_enabled
auto_followup_enabled
plans_enabled
finance_enabled
offline_enabled
recurring_services_enabled
advanced_crbx_enabled
```

Features incompletas no aparecen en navegación normal.

---

# 106. DASHBOARD

Limpio.

Hoy: trabajos, empleados, ausencias, alertas.  
Necesita atención: falta personal, conflicto, cambio cliente, horas, accesos.  
Comercial: oportunidades, respuestas, visitas, ofertas.  
Finanzas: trabajado, facturado, pendiente cobro.

---

# 107. MÉTRICAS COMERCIALES

opportunities_found, opportunities_approved, contactable_rate, response_rate, visit_conversion, offer_conversion, win_rate, time_to_contact, time_to_win.

---

# 108. MÉTRICAS OPERATIVAS

hours_vs_progress, planned_vs_actual_staff, repetitions, absences, client_instruction_count, deadline_deviation, reference_hours_deviation, pending_billing.

---

# 109. MULTIIDIOMA

DE, ES, EN, IT, PT, SQ.

---

# 110. OFFLINE

Assignment, address, team, instructions, cached plans, work log, timesheet, incident y pending photos.

---

# 111. PWA

Installable, push y offline parcial.

---

# 112. RESPONSIVE

320, 375, 430, tablet, 1024, 1440, 1920. Chrome, Edge, Firefox, Safari.

---

# 113. UX RULES

- acciones frecuentes ≤ 3 pasos;
- formularios cortos;
- no duplicar datos;
- defaults inteligentes;
- autosave cuando tenga sentido;
- feedback inmediato;
- no depender solo de colores;
- touch targets correctos;
- progressive disclosure;
- complejidad solo cuando sea necesaria.

---

# 114. AI AGENTS

Discovery, Research, Dedup, Scoring, Contact, Sales Writer, Reply Classifier, Next Action, Visit Summary, Planning, Project Risk, Document Extractor.

Cada uno con scope, permissions, inputs, outputs, logs, approval mode y failure handling.

---

# 115. AUTOMATION RULES

Las automatizaciones viven dentro de CleanOps.

---

# 116. ARQUITECTURA TÉCNICA SUGERIDA

Frontend: Next.js / React / TypeScript  
Backend: Modular API propia  
Database: PostgreSQL  
Queue: Redis + BullMQ (workers propios, sin servicio externo de automatización)  
File Storage: volúmenes persistentes privados en VPS suizo (separación por tenant; abstracción migrable)  
Search: PostgreSQL full-text inicial  
Automation: workers propios  
AI: provider abstraction  
**No n8n**

---

# 117. MODELO DE DATOS DE ALTO NIVEL

```text
organizations
users
auth_identities
sessions
mfa_methods
mfa_challenges
recovery_codes
roles
permissions
user_permission_overrides
temporary_permissions
companies
contacts
contact_compliance
suppression_list
source_connectors
raw_findings
project_candidates
project_sources
opportunities
opportunity_sources
email_accounts
email_threads
emails
tasks
appointments
site_visits
offers
offer_versions
tenders
tender_positions
contracts
work_engagements
projects
recurring_services
one_off_services
maintenance_contracts
project_phases
project_zones
project_units
plans
plan_versions
documents
employees
employee_skills
availability
absences
assignments
teams
shifts
schedule_versions
transport
client_instructions
reference_hours_history
work_logs
timesheets
rapports
rapport_lines
incidents
progress_logs
invoices
invoice_lines
payments
compliance_rule_sets
compliance_rules
comments
notifications
notification_acknowledgements
automation_rules
automation_runs
ai_policies
ai_runs
ai_outputs
feature_flags
audit_logs
security_events
security_incidents
```

---

# 118. END-TO-END FEATURE TRACEABILITY

## CLOSED_DECISION

Toda feature debe documentar:
```text
UI Surface
→ UI Action
→ Permission
→ Command/API
→ Validation
→ State Transition
→ Persistence
→ Side Effects
→ Domain Event (if applicable)
→ Consumer(s) (if applicable)
→ Notification (if applicable)
→ Audit Entry
→ Success State
→ Empty State
→ Error State
→ Loading State
→ Retry/Recovery
→ Tests
```

---

# 119. FEATURE TRACEABILITY MATRIX

Crear `FEATURE_TRACEABILITY_MATRIX.md`.

Columnas:
Feature | UI | Permission | API/Command | State Change | Event | Consumers | Notification | Audit | Tests

---

# 120. ENTITY OWNERSHIP AND UI COVERAGE

Clasificar entidades:
```text
USER_MANAGED
SYSTEM_MANAGED
DERIVED
AUDIT_ONLY
INTEGRATION_MANAGED
```

Documentar owner domain, created/read/updated by, retention, UI, API, lifecycle y permissions.

---

# 121. ENTITY UI COVERAGE

Crear `ENTITY_UI_COVERAGE.md`.

No todas las tablas necesitan CRUD completo, pero ninguna puede quedar sin propósito documentado.

---

# 122. GLOBAL DEFINITION OF DONE

Una feature no está terminada porque exista el botón, endpoint o tabla.

Está terminada cuando:
- UI funciona;
- backend funciona;
- permisos funcionan;
- persistencia funciona;
- efectos secundarios funcionan;
- eventos/consumidores funcionan cuando aplican;
- errores están definidos;
- seguridad está aplicada;
- auditoría existe cuando corresponde;
- tests automáticos pasan;
- Codex la prueba;
- Product Owner la prueba en UI;
- Product Owner la acepta.

---

# 123. VERTICAL SLICE DEVELOPMENT

## CLOSED_DECISION

Desarrollo:

```text
Feature
→ DB
→ backend
→ API
→ permissions
→ UI
→ security
→ tests
→ staging
→ Codex test
→ Product Owner manual test
→ ACCEPTED
```

No construir toda DB, luego toda API y al final toda UI.

---

# 124. FASE STATUS

```text
IN_DEVELOPMENT
CODEX_TESTING
READY_FOR_USER_TEST
USER_TESTING
CHANGES_REQUESTED
ACCEPTED
```

---

# 125. ACCEPTANCE GATE

Codex no comienza la siguiente fase dependiente hasta `ACCEPTED`, salvo autorización explícita del Product Owner.

---

# 126. AUTOMATED VERIFICATION GATE

Antes de entregar:
- lint;
- typecheck;
- unit tests;
- integration tests;
- E2E;
- security tests relevantes;
- migration validation;
- build.

---

# 127. MANUAL USER ACCEPTANCE

Cada fase debe incluir `MANUAL_TEST_CHECKLISTS.md` con pasos exactos de prueba en UI.

---

# 128. STAGING FIRST

Entornos:
```text
LOCAL
STAGING
PRODUCTION
```

El Product Owner prueba en STAGING.

---

# 129. RELEASE FLOW

```text
feature branch
→ tests
→ merge
→ staging deploy
→ Codex validation
→ Product Owner testing
→ ACCEPTED
→ release
```

---

# 130. BUILD VERSION VISIBLE

Ejemplo:
```text
CleanOps 0.4.3
Build a81cf72
STAGING
```

---

# 131. FEATURE VISIBILITY

`IN_DEVELOPMENT`: no visible para usuario normal.  
`READY_FOR_USER_TEST`: visible en staging/testers.  
`ACCEPTED`: puede activarse normalmente.

---

# 132. MANUAL EXECUTION OF AUTOMATIONS

Toda automatización crítica debe tener acción manual durante desarrollo/administración:

- Radar → Run now
- Scoring → Recalculate
- Email classifier → Process
- Follow-up → Run now
- Planning → Generate proposal
- Notification → Send test

Con logs y resultado.

---

# 133. RADAR TEST UI

`Radar Runs` muestra started_at, ended_at, sources_checked, found, new, duplicates, updated, failed.

Acción: `Run now`.

---

# 134. STAGING DEMO DATA

Cada fase debe incluir seed data útil para probar.

---

# 135. RESET DEMO DATA

Solo dev/staging.

---

# 136. REPORT PROBLEM

En staging:
```text
Report Problem
```

Captura URL, user, browser, viewport, build version y timestamp.

---

# 137. ORDEN DE DESARROLLO POR FASES

## Fase 0 — Foundation
Repo, environments, CI/CD, database baseline, staging, logs, build version, feature flags. Topología aprobada: un VPS suizo Docker, volúmenes privados, Redis/BullMQ, firewall/WAF y diseño de backups externos PITR.

## Fase 1 — Authentication + MFA
Organizations, users, password login, email OTP, TOTP, recovery codes, sessions, logout, revoke, forgot/reset password, auth security, audit.

## Fase 2 — Users + Roles + Permissions
Roles, permissions, overrides, temporary access, Manage Access UI, permission audit.

## Fase 3 — Companies + Contacts
CRUD, search, permissions, compliance basics.

## Fase 4 — Manual Opportunities + Pipeline
Create opportunity, suggestion flow, pipeline, assignment, status changes.

## Fase 5 — Radar
Source connectors, raw findings, candidates, dedup, Radar Runs UI, Run now.

## Fase 6 — Enrichment + Scoring
Research, source confidence, score, reasons, manual recalculate.

## Fase 7 — Inbox + Email
Send, receive, thread, linking, suppression.

## Fase 8 — AI Email + Follow-up
Drafting, classification, approval modes, follow-up.

## Fase 9 — Visits
Schedule, mobile visit, notes, media, plans.

## Fase 10 — Offers + Negotiation
Templates, versions, negotiation, PDF output, document-based offers.

## Fase 11 — WorkEngagement Core
Base entity, contract state, Won → PENDING → acción humana autorizada «Crear WorkEngagement» → CREATED (REQ-WE-001/002/003).

## Fase 12 — Planning Engine + Calendar + My Day
Assignments, calendar, My Day, acknowledgement, schedule versioning.

## Fase 13 — Projects + Phases + Plans
Project, phases, zones, units, plans, plan versioning, progress.

## Fase 14 — Recurring Services
Recurrence, calendar generation, pause, renewal, termination, recurring billing config.

## Fase 15 — Client Instructions
Create instruction, staffing changes, planning impact, alerts.

## Fase 16 — Hours + Work Logs
Timesheets, team hours, reference hours, history, alerts.

## Fase 17 — Rapports
Aggregation, periodic reports, approval, signed uploads.

## Fase 18 — Finance
Invoices, states, payments, worked/validated/invoiced/paid.

## Fase 19 — Closeout + References
Project close, reference, follow-up, recurring renewal actions.

## Fase 20 — Production Hardening
WAF, DDoS, load tests, penetration review, recovery tests, observability, Security Center, production readiness.

**Cada fase: Codex prueba → Product Owner prueba → ACCEPTED.**

---

# 138. SECURITY TESTS POR FASE

Auth: brute force, OTP abuse, session fixation, OTP reuse, expired OTP.  
Permissions: IDOR, cross-tenant, override bypass.  
Radar: SSRF, unsafe redirects, malicious content.  
Uploads: malware, fake MIME, zip bomb, oversized files.  
Email: HTML XSS, prompt injection.  
Exports: permission bypass, mass export limits.

---

# 139. PERFORMANCE TESTS POR FASE

Cada fase con endpoints críticos debe definir latency target, pagination, concurrency check y load test básico.

---

# 140. SECURITY CENTER PERMISSIONS

```text
security.view
security.manage_incidents
security.revoke_sessions
security.view_exports
security.manage_limits
```

---

# 141. CLOSED DECISIONS CONSOLIDADAS

1. Oportunidades pueden venir de radar o manualmente.
2. Usuarios sin CRM completo pueden sugerir oportunidad.
3. ProjectCandidate y Opportunity son entidades diferentes.
4. Manual Opportunity no necesita ProjectCandidate.
5. WorkEngagement es entidad común.
6. Recurrentes existen desde el modelo base.
7. Planning Engine gestiona todos los WorkEngagements.
8. Calendar es vista del Planning Engine.
9. My Day es home principal del empleado.
10. No n8n.
11. Core self-contained.
12. No depender de futuras integraciones para funciones esenciales.
13. Roles son plantillas.
14. Permisos individuales, por recurso y temporales están soportados.
15. Planos y versionado forman parte del proyecto.
16. IA no decide precio.
17. Ofertas tienen versiones.
18. CRBX se soporta por etapas.
19. Offer Accepted cambia inmediatamente Opportunity a Won y deja la creación de WorkEngagement en PENDING; crear WorkEngagement exige acción humana autorizada y no implica contrato firmado.
20. ClientInstruction reemplaza BauleiterRequest rígido.
21. Staffing instructions impactan Planning Engine.
22. Horas referencia solo generan alertas.
23. No existe bolsa financiera obligatoria de extras.
24. Una unidad puede pasar múltiples fases.
25. Fases configurables.
26. UI de obra sencilla.
27. Work logs y rapport frequency son distintos.
28. Worked/Validated/Invoiced/Paid separados.
29. Cumplimiento laboral con Rule Engine.
30. Suppression list obligatoria.
31. Source/confidence por dato importante.
32. Feature flags por tenant.
33. Data classification y AI data policy.
34. Security aplica vía API, no solo UI.
35. Schedule changes pueden requerir acknowledgement.
36. Auth soporta email OTP o TOTP.
37. Auth es primera feature completa.
38. Desarrollo por vertical slices.
39. Cada slice se despliega a staging.
40. Codex prueba primero.
41. Product Owner prueba después desde UI.
42. No se avanza sin ACCEPTED.
43. Toda feature requiere trazabilidad end-to-end.
44. Toda entidad requiere ownership/UI coverage.
45. Security tests por fase.
46. Rate limits, quotas y abuse protection obligatorios.
47. Security Center forma parte del producto.
48. Build version visible en staging.
49. Automations críticas tienen Run now.
50. Features incompletas no aparecen en navegación normal.

---

# 142. CRITERIOS GLOBALES DE ACEPTACIÓN

No considerar listo si:

- existe botón sin backend;
- existe endpoint sin propósito documentado;
- existe tabla sin owner/lifecycle/UI decision;
- falta permiso para una acción;
- falta error/loading/empty state;
- falta audit cuando corresponde;
- falta test de seguridad;
- falta test E2E;
- una feature no puede probarse desde UI;
- Codex no puede demostrar tests;
- Product Owner no la ha aceptado;
- una fase dependiente empezó sin aceptación;
- se usa n8n;
- función central depende de herramienta externa no integrada;
- MFA no funciona;
- OTP puede reutilizarse o spamearse;
- hay bypass de permisos;
- tenant A puede acceder tenant B;
- radar puede hacer SSRF;
- uploads no se escanean;
- exportaciones masivas no tienen controles;
- rate limiting es insuficiente;
- IA puede disparar acciones sensibles sin approval;
- una feature inacabada aparece en navegación normal.

---

# 143. REGISTRO DE DECISIONES APROBADAS (2026-10-09)

1. Auth propia con librerías consolidadas, sin criptografía casera.
2. SMTP + IMAP por empresa, extensible a autenticación exigida por proveedores.
3. VPS propio y Docker.
4. Infraestructura y almacenamiento primario en Suiza; tratamiento internacional protegido según política.
5. Archivos en volúmenes persistentes privados en VPS.
6. Redis + BullMQ para colas y workers.
7. Offline-first IndexedDB, sync incremental, control de versiones y conflictos importantes revisados por humanos.
8. Proveedor suizo con protección DDoS, firewall y WAF propio.
9. Backup diario + WAL PostgreSQL PITR, archivos y copias independientes en Suiza.
10. Un VPS suizo para componentes de aplicación, datos, Redis y archivos.
11. Denegación explícita prevalece; deny-by-default e aislamiento tenant.
12. MFA por riesgo de rol; empleados operativos configurables; step-up sensible.
13. OTP por email de 5 minutos.
14. Dispositivo de confianza 30 días, revocable, no equivale a sesión.
15. Inactividad de 30 minutos para administración/comercial/finanzas y 8 horas operativos, caducidad absoluta separada.
16. Retención por tenant/categoría dentro del derecho suizo, supresión/anonimización/legal hold y auditoría.
17. Límites iniciales por tenant: fotos 20 MB, documentos 50 MB, técnicos 100 MB, con máximos globales.
18. RPO objetivo 15 min / RTO objetivo 4 h sujeto a restauraciones probadas, no SLA.
19. Límites escalonados por empresa/cuenta, rebotes, reputación, pausas; cumplimiento comercial obligatorio.
20. Radar frecuencia por fuente, `Run now`, respeto a restricciones de fuentes.
21. IA multi-proveedor por coste/calidad/tarea/privacidad; no enviar datos protegidos fuera de Suiza sin autorización y garantías verificadas.
22. Validación de rapports por contrato, facturar aprobado, disputar por separado; provisional solo con permiso contractual.
23. Facturación por contrato: Regie horas facturables, Pauschal hitos, recurrente periodicidad; borrador automatizable, emisión autorizada y envío separado.
24. Documentos PDF/Excel asistidos por IA con validación humana; CRBX estructurado posterior con parser validado.
25. Normativa base versionada con ajustes por tenant; vigilancia automática + manual asistida por IA; fuentes, impacto y aprobación humana para aplicar cambios.
26. Renovación contractual configurable, avisos e IA asistiva; autorrenovación solo por cláusula contractual expresa; cambios económicos humanos.

### Parámetros de implementación todavía por concretar (no reabren las 26 decisiones)

- Nombre del proveedor VPS suizo y evidencia contractual de residencia, DDoS y límites de recursos.
- Duración numérica del timeout **absoluto** de sesión (distinto del timeout por inactividad y de 30 días trusted device).
- Límites máximos globales de archivos, capacidad/cuotas por tenant y tamaños de archivo de respaldo.
- Políticas exactas de conservación por categoría y verificación jurídica del GAV/CCT y otras normas.
- Umbrales concretos por cuenta para warm-up, rebotes, reputación y horarios comerciales.
- Intervalos recomendados por conector Radar ajustados a sus términos reales.
- Lista de proveedores/modelos IA aprobados con garantías verificadas y decisiones de transferencia.
- Política de discrepancias entre eventos respaldados y archivos en restauración puntual.
- Detalle de calendario de pruebas de restauración, método de alertas y control de secretos.
Estos son parámetros verificables de implementación o selección de proveedor, **no decisiones de producto aún abiertas**. Deben cerrarse antes de activar la feature afectada en producción; nunca se rellenarán con hechos inventados.

---

## 143.1. CONTRATO NORMATIVO DE IMPLEMENTACIÓN

Las 26 decisiones anteriores se expresan en requisitos verificables en `CLEANOPS_360_SRS_V1_1.md` (REQ-INF/JOB/EML/RAD/AI/DAT/FILE/FIN/DOC/CMP/REC/SEC). Todas son obligatorias. Ninguna tarea podrá declarar como completadas funciones no probadas desde UI, backend y API.

### Requisitos aprobados adicionales (nuevos IDs; no renumeran los existentes)

**REQ-INF-001.** La primera topología de producción deberá desplegar frontend, API, PostgreSQL, Redis, BullMQ workers y archivos en **un VPS alojado en Suiza**, con Docker, redes privadas y volúmenes persistentes. No se expondrán PostgreSQL o Redis a internet. Separación de servicios lógica y de permisos; preparar extracción futura a otros servidores, pero no declararla implantada.

**REQ-INF-002.** El proveedor de infraestructura suizo deberá ofrecer mitigación DDoS; se desplegarán firewall y WAF propios con reglas probadas. No se supondrá un proveedor CDN internacional.

**REQ-INF-003.** Backups completos diarios y WAL archivado de forma continua para recuperación PostgreSQL PITR, además de copia independiente y cifrada de archivos, configuraciones y secretos recuperables, en ubicación suiza separada del VPS principal. Pruebas de restauración end-to-end deberán medir RPO ≤ 15 minutos y RTO ≤ 4 horas; si fallan, bloquear la afirmación de cumplimiento y elevar plan correctivo. Un solo VPS no implica alta disponibilidad.

**REQ-INF-004.** El almacenamiento local deberá aislar tenants en autorización y rutas internas, aplicar cuotas y permisos, validar MIME y magic bytes, inspeccionar malware y descompresión maliciosa, y permitir migración futura sin modificar el dominio.

**REQ-JOB-001.** Redis + BullMQ ejecutará trabajos programados con deduplicación/idempotencia, concurrencia limitada, retry acotado, dead-letter o cuarentena de fallos, logs, métricas y `Run now` cuando proceda.

**REQ-EML-020.** Cada tenant podrá configurar SMTP+IMAP con secretos protegidos, conexión TLS y compatibilidad con los mecanismos de autenticación que efectivamente permita su proveedor. Enviar y recibir deberán soportar vinculación a thread/empresa/contacto/oportunidad. No exponer contraseñas en navegador ni logs.

**REQ-EML-021.** Los envíos comerciales tendrán límites progresivos por tenant y cuenta, no superiores a cuotas del proveedor ni límites globales; gestionar reputación, rebotes, pausas y `DO_NOT_CONTACT`. Los controles de compliance prevalecen sobre el modo `AUTO`.

**REQ-RAD-030.** Frecuencia de Radar por fuente configurable, con intervalo recomendado y control de restricciones legales/técnicas de la fuente; ofrecer `Run now` autorizado, auditoría, métricas y deduplicación. Descubrir un candidato no autoriza contacto automático.

**REQ-AI-020.** La capa multi-proveedor seleccionará proveedor/modelo por tarea, presupuesto, calidad y clasificación de datos; deberá comprobar autorización tenant, residencia/ubicación de procesamiento y garantías contractuales, bloquear la transferencia de datos protegidos fuera de Suiza en ausencia de aprobación y garantías verificadas, y auditar decisión/ruta de datos.

**REQ-DAT-020.** La retención se definirá por categoría y tenant con mínimos y obligaciones legales aplicables, bloqueo legal, anonimización/eliminación, pruebas y auditoría; no se fijarán periodos no verificados para categorías específicas.

**REQ-FILE-020.** Valores iniciales de subida: foto 20 MB, documento 50 MB, plano/archivo técnico 100 MB por archivo; cada tenant podrá configurar valores sujetos a límites globales seguros y cuotas; cualquier cambio debe validarse en API.

**REQ-FIN-020.** Los contratos definirán modalidad de facturación: Regie por horas facturables y validación exigida, Pauschal por hitos/plazos pactados y recurrente según periodicidad. El sistema podrá crear borradores automáticos; emitir factura requiere política autorizada explícita y controles de permisos/duplicados/auditoría. El envío al cliente es una acción o automatización independiente, igualmente autorizada.

**REQ-DOC-020.** MVP admite adjuntar PDF, XLSX y CRBX y extraer cuando sea viable información de PDF/Excel mediante IA con revisión humana obligatoria antes de incorporarla a una oferta; CRBX estructurado se posterga a fase validada sin editor NPK completo en MVP.

**REQ-CMP-020.** Motor de reglas versionadas para legislación y GAV/CCT aplicables con ajustes tenant permitidos. Una tarea programada y botón `Buscar cambios` consultarán fuentes verificables; la IA generará diferencias, citas, vigencia e impacto en planificación/empleados. Ningún cambio de regla activa será aplicado sin revisión y aprobación humanas auditadas.

**REQ-REC-020.** Las renovaciones usarán cláusulas contractuales y plazos de preaviso, alertas y asistencia IA; renovar automáticamente solo si el contrato vigente contiene habilitación expresa; renegociar, alterar importes o condiciones sensibles requiere aprobación humana. Mantener `Renew`, `Renegotiate`, `Terminate`, `Postpone decision` y registrar decisiones.

**REQ-SEC-020.** El MVP empleará librerías maduras para hash, autenticación y TOTP, sin implementar criptografía propia. El registro, sesión y credenciales se verificarán con pruebas de seguridad.

**REQ-SEC-021.** La caducidad absoluta de sesión tendrá un valor definido y probado antes de la entrega de Auth; no debe inferirse de los 30 días de dispositivo confiable ni de los timeouts de inactividad. El rol y su riesgo determinan MFA y tiempo inactivo, no permisos heredados ad hoc.

### Matriz de escenarios críticos de aceptación

| Escenario | Resultado obligatorio |
|---|---|
| OTP expirado > 5 min / reenvío | Rechazo; previo invalidado; rate limit |
| Empleado offline, sesión vencida | Cambios locales preservados, autenticación y permisos revalidados antes del sync |
| Dos usuarios editan planificación publicada | Conflicto/locking y revisión; nunca pérdida silenciosa |
| VPS perdido | Restore de DB+archivos y pruebas medibles RPO/RTO; evidencias, no SLA implícito |
| IA intenta mandar dato protegido a proveedor no autorizado | Bloqueo y auditoría |
| Contacto suprimido o cold email sin base validada | Envío bloqueado/pedido de aprobación; `AUTO` no lo supera |
| Rapport con 85 h validadas de 100 h trabajadas | 100 trabajadas permanecen, 85 validables para facturar según contrato, 15 disputadas |
| Oferta `Accept` | Opportunity `Won` inmediato; WE `PENDING` hasta acción humana |
| Modificación normativa sugerida por IA | No cambia regla activa sin revisión humana |
| Renovación sin cláusula de autorrenovación | Alerta/propuesta; nunca renovación automática |


# 144. INSTRUCCIÓN FINAL PARA CODEX

Antes de escribir código:

1. generar todos los documentos de §0;
2. listar `DECISION_REQUIRED`;
3. construir dependency graph;
4. crear `FEATURE_TRACEABILITY_MATRIX.md`;
5. crear `ENTITY_UI_COVERAGE.md`;
6. crear `THREAT_MODEL.md`;
7. crear `SECURITY_ARCHITECTURE.md`;
8. definir Fase 0;
9. definir Fase 1 Authentication;
10. generar manual test checklist;
11. implementar solo la fase autorizada;
12. ejecutar automated gate;
13. desplegar a staging;
14. marcar `READY_FOR_USER_TEST`;
15. esperar aceptación del Product Owner antes de la fase siguiente.

Principio final:

> CleanOps debe crecer por fases funcionales completas, no por módulos aislados.
> Cada función debe poder verse, probarse y verificarse desde la UI.
> La arquitectura puede ser sofisticada.
> La experiencia del usuario debe seguir siendo simple.
> La seguridad debe estar diseñada desde el inicio, no añadida al final.

## Nota de consolidación normativa (2026-10-09)

Se han integrado 26 decisiones aprobadas; los requisitos del SRS prevalecen en criterio verificable. Los parámetros de implementación no resueltos están listados expresamente sin reabrir decisiones de producto. No es una certificación legal, de seguridad o de implantación.

## 145. Corrección de dependencias y especificaciones derivadas — 2026-10-09

La numeración 0–20 del roadmap original se conserva como **identificación histórica de etapas**, no como permiso de ejecutar fases en orden incorrecto. El roadmap documental vigente establece gates previos a Planning: perfiles de empleados, disponibilidad/equipos y motor de reglas laborales activo con aprobación humana. `ONE_OFF_SERVICE` y `MAINTENANCE_CONTRACT` tienen slices funcionales propios dentro de las fases operativas, con trazabilidad en SRS. Los requisitos normativos se definen **una sola vez** en el SRS; las decisiones históricas del §141 y las 26 decisiones aprobadas del §143 son categorías distintas, no decisiones adicionales que deban reaprobarse.

El nombre canónico del checklist es `MANUAL_TEST_CHECKLISTS.md`; los archivos obligatorios de derivación son `PRD.md`, `DECISION_REGISTER.md`, `DEPENDENCY_GRAPH.md` y el resto listado en `README.md`. El estado `work_engagement_creation_status=PENDING` y el estado de contrato `PENDING` son campos de máquinas de estados distintas; jamás deben mezclarse.



### Entidad operativa complementaria — `StaffingRequirement`

El requisito de dotación enlaza necesidades de personal por servicio/franja con Planning Engine; su detalle normativo se define en SRS §19 y DATA_MODEL, no crea un segundo planificador.

# FIN
