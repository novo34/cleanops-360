# CLEANOPS 360 — ROADMAP maestro canónico

**Fecha:** 2026-10-09 | **Estado:** planificación documental, SIN ejecución | **Fuentes:** Product Master V3, SRS V1.1, ARCHITECTURE.md, DATA_MODEL.md y 26 decisiones aprobadas.

## Invariante obligatorio de desarrollo vertical

**PROHIBIDO** implementar toda la base de datos o todo el backend para conectar el frontend al final. Cada fase entregará una capacidad completa: requisito → diseño UI/UX → datos mínimos → servicio/API real → permisos → frontend conectado → estados loading/empty/error → auditoría → pruebas integradas/E2E → staging → prueba manual del Product Owner → `ACCEPTED`. Se puede introducir infraestructura interna compartida necesaria para una fase, pero debe tener consumidor, responsable, prueba y justificación; no se admiten endpoints huérfanos ni tablas sin ownership.

**Gates por fase:** D0 alcance+dependencias; D1 UX con journeys y estados; D2 contrato API/dominio; D3 integración UI-backend; D4 seguridad y pruebas; D5 staging y prueba exploratoria; D6 aceptación explícita. Un fallo impide pasar a `ACCEPTED` o avanzar con fases dependientes sin autorización excepcional del Product Owner, documentada.

Los diseños de pantalla y nombres de comandos de los documentos derivados son **propuestas de implementación**, no evidencia de UI existente. Los endpoints concretos se definen en API_SPEC y se verifican durante implementación.

**Instrucciones operativas:** `DELIVERY_PLAYBOOK.md`. Ningún nombre de endpoint, DTO ni diseño de tabla derivado constituye por sí mismo una decisión aprobada.

## Fases 0–20

### Fase 0 — Foundation

**Resultado de negocio:** Entorno staging, CI/CD, versión, feature flags, observabilidad y recuperación preparada.

**UI/UX que se prueba:** Administration/System Status: versión, entorno, health y estado de jobs.

**Backend/API y efecto verificable:** health/config/version; auditoría de despliegue.

**Entidades clave:** `organizations, feature_flags, audit_logs, security_events`.

**Requisitos de origen:** REQ-PR-006, REQ-PR-007, REQ-INF-001, REQ-INF-003.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 1 — Authentication + MFA

**Resultado de negocio:** Acceso protegido y ciclo de sesión completo.

**UI/UX que se prueba:** Login, OTP, TOTP, recovery, sesiones, reset y errores.

**Backend/API y efecto verificable:** auth/session/MFA con revocación real.

**Entidades clave:** `users,auth_identities,sessions,mfa_methods,mfa_challenges,recovery_codes`.

**Requisitos de origen:** REQ-AUTH-001, REQ-AUTH-002, REQ-SEC-020, REQ-SEC-021.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 2 — Users + Roles + Permissions

**Resultado de negocio:** Acceso autorizado por tenant, rol y recurso.

**UI/UX que se prueba:** Administración → usuarios → gestionar acceso.

**Backend/API y efecto verificable:** política denegación explícita, permisos efectivos y auditoría.

**Entidades clave:** `roles,permissions,user_permission_overrides,temporary_permissions`.

**Requisitos de origen:** REQ-AUTHZ-001, REQ-AUTHZ-007.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 3 — Companies + Contacts

**Resultado de negocio:** CRM utilizable con prevención de contacto no autorizado.

**UI/UX que se prueba:** Listado/ficha compañía y contacto; No contactar.

**Backend/API y efecto verificable:** CRUD, búsqueda, supresión y auditoría.

**Entidades clave:** `companies,contacts,contact_compliance,suppression_list`.

**Requisitos de origen:** REQ-CRM-001, REQ-COM-005.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 4 — Manual Opportunities + Pipeline

**Resultado de negocio:** Oportunidad manual y sugerencias verificables.

**UI/UX que se prueba:** Crear, sugerir, aprobar, pipeline e historial.

**Backend/API y efecto verificable:** transiciones con autorización y persistencia.

**Entidades clave:** `opportunities,opportunity_sources,tasks`.

**Requisitos de origen:** REQ-OPP-001, REQ-OPP-005.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 5 — Radar

**Resultado de negocio:** Detección y revisión de candidatos.

**UI/UX que se prueba:** Radar Runs, ficha ProjectCandidate, Promote.

**Backend/API y efecto verificable:** SourceConnector → RawFinding → dedup → Candidate y promoción explícita.

**Entidades clave:** `source_connectors,raw_findings,project_candidates,project_sources`.

**Requisitos de origen:** REQ-RAD-003, REQ-RAD-004, REQ-RAD-030.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 6 — Enrichment + Scoring

**Resultado de negocio:** Enriquecimiento con procedencia y puntuación explicable.

**UI/UX que se prueba:** Ficha candidato/origen, Recalculate, razones.

**Backend/API y efecto verificable:** fuentes/confidence, score, dedup y protección manual_verified.

**Entidades clave:** `project_sources,opportunity_sources,ai_runs`.

**Requisitos de origen:** REQ-SCR-001, REQ-RAD-006.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 7 — Inbox + Email

**Resultado de negocio:** Recepción y envío desde UI conectada a SMTP/IMAP.

**UI/UX que se prueba:** Inbox, hilo, respuesta, adjuntos, marcar No contactar.

**Backend/API y efecto verificable:** conectores, threading, suppression y estados de entrega.

**Entidades clave:** `email_accounts,email_threads,emails`.

**Requisitos de origen:** REQ-EML-001, REQ-EML-020.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 8 — AI Email + Follow-up

**Resultado de negocio:** Borradores y seguimientos controlados.

**UI/UX que se prueba:** Redactar, aprobar, programar, pausar y Run now.

**Backend/API y efecto verificable:** proveedor IA, políticas tenant, límites, tareas y cancelación.

**Entidades clave:** `ai_runs,ai_outputs,automation_rules,automation_runs`.

**Requisitos de origen:** REQ-EML-021, REQ-FUP-002, REQ-AI-020.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 9 — Visits

**Resultado de negocio:** Visitas comerciales registradas en móvil.

**UI/UX que se prueba:** Agendar visita, registrar notas, fotos y planos.

**Backend/API y efecto verificable:** site visits, documentos, asociación a oportunidades.

**Entidades clave:** `site_visits,appointments,documents`.

**Requisitos de origen:** REQ-VIS-001, REQ-VIS-003.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 10 — Offers + Negotiation

**Resultado de negocio:** Presupuestos rentables reproducibles, ofertas versionadas y negociación humana.

**UI/UX que se prueba:** Configuración tenant, catálogo/rendimientos, Raumbuch, editor y desglose, variantes, umbrales, PDF, versiones y Accept/Counter/Maintain.

**Backend/API y efecto verificable:** versions/approval, precios seguros y aceptaciones auditadas.

**Entidades clave:** `offers,offer_versions,tenders,tender_positions`.

**Requisitos de origen:** REQ-OFF-001, REQ-OFF-005, REQ-DOC-020, REQ-CALC-001…010/012. Cierre presupuestario requiere CALC-01…08/10 según OFFERS_AND_NEGOTIATION_SPEC.md y COST-GATE-01. No autoriza iniciar esta fase ahora.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 11 — WorkEngagement Core

**Resultado de negocio:** Transición comercial-operativa obligatoria.

**UI/UX que se prueba:** Opportunity Won → Crear WorkEngagement.

**Backend/API y efecto verificable:** Won → PENDING → acción humana → CREATED, reintentos idempotentes.

**Entidades clave:** `work_engagements,contracts,projects`.

**Requisitos de origen:** REQ-WE-001, REQ-WE-002, REQ-TRC-WE-001.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 12 — Planning Engine + Calendar + My Day

**Resultado de negocio:** Planificación común con publicación humana.

**UI/UX que se prueba:** Calendario, asignar, confirmar en My Day.

**Backend/API y efecto verificable:** propuestas, conflictos, publicación versionada y acknowledgement.

**Entidades clave:** `assignments,shifts,schedule_versions,notification_acknowledgements`.

**Requisitos de origen:** REQ-PLN-001, REQ-CAL-004, REQ-SCH-003.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 13 — Projects + Phases + Plans

**Resultado de negocio:** Gestión de obra, fases y revisiones.

**UI/UX que se prueba:** Vista obra edificio/planta/unidad, fases y planos.

**Backend/API y efecto verificable:** avance por unidad, fases configurables, planes versionados.

**Entidades clave:** `projects,project_phases,project_zones,project_units,plans,plan_versions`.

**Requisitos de origen:** REQ-PHS-001, REQ-PLAN-004.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 14 — Recurring Services

**Resultado de negocio:** Servicios recurrentes y renovaciones contractuales.

**UI/UX que se prueba:** Ficha contrato; Renew/Renegotiate/Terminate/Postpone.

**Backend/API y efecto verificable:** recurrencia, cláusulas, avisos y autorizaciones.

**Entidades clave:** `recurring_services,maintenance_contracts,contracts`.

**Requisitos de origen:** REQ-REC-020.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 15 — Client Instructions

**Resultado de negocio:** Instrucciones con efecto real en operación.

**UI/UX que se prueba:** Registrar instrucción, impacto y revisión Planner.

**Backend/API y efecto verificable:** recalcular necesidad; tarea/alerta; sin autopublicar cambios.

**Entidades clave:** `client_instructions,assignments,notifications`.

**Requisitos de origen:** REQ-CLI-002.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 16 — Hours + Work Logs

**Resultado de negocio:** Horas verificables, alertas y operación offline.

**UI/UX que se prueba:** Registrar horas, log, historial y conflictos offline.

**Backend/API y efecto verificable:** timesheets, reconciliación y reglas de horas referencia.

**Entidades clave:** `timesheets,work_logs,reference_hours_history`.

**Requisitos de origen:** REQ-HRS-002, REQ-OFFLINE-001.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 17 — Rapports

**Resultado de negocio:** Rapports por periodo y aprobación contractual.

**UI/UX que se prueba:** Generar, revisar, aprobar/rechazar parcial.

**Backend/API y efecto verificable:** trabajadas != validadas; flujo aceptación y auditoría.

**Entidades clave:** `rapports,rapport_lines,work_logs`.

**Requisitos de origen:** REQ-RPT-001, REQ-RPT-002.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 18 — Finance

**Resultado de negocio:** Facturación y pagos con controles.

**UI/UX que se prueba:** Borrador, autorización, emisión, envío, conciliación.

**Backend/API y efecto verificable:** Regie/Pauschal/recurrente, duplicados, estados auditados.

**Entidades clave:** `invoices,invoice_lines,payments`.

**Requisitos de origen:** REQ-FIN-020.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 19 — Closeout + References

**Resultado de negocio:** Cierre y propuesta de referencias sin publicación automática.

**UI/UX que se prueba:** Cerrar, revisar métricas, Crear referencia/No ahora.

**Backend/API y efecto verificable:** closeout, historial, borrador referencia, sin envío automático.

**Entidades clave:** `projects,work_engagements,comments`.

**Requisitos de origen:** REQ-CLOSE-001, REQ-CLOSE-002.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

### Fase 20 — Production Hardening

**Resultado de negocio:** Verificación integral de capacidad y recuperación.

**UI/UX que se prueba:** Security Center, auditorías, restore evidence.

**Backend/API y efecto verificable:** escaneos, RPO/RTO demostrados, aislamiento y runbooks.

**Entidades clave:** `security_events,security_incidents,audit_logs`.

**Requisitos de origen:** REQ-SEC-030, REQ-AUD-001, REQ-OPS-001, REQ-INF-003, REQ-PR-007.

**Cierre de la fase:** aplicar `DELIVERY_PLAYBOOK.md` y `PHASE_ACCEPTANCE_TEMPLATE.md`, con pruebas reales UI→API→persistencia, permisos, errores y auditoría. La fase se acepta solo con evidencia.

## Evidencia mínima por fase

- UX: journey, mockup/pantallas y responsividad, vacíos, carga, errores y accesibilidad.
- Backend: contratos, entradas/salidas, validación, permisos, transacción, idempotencia, side effects, logs, errores.
- E2E: acción UI → API → DB → proyección UI, evidencia automatizada + ejercicio manual del Product Owner.
- Cobertura: actualizar simultáneamente FEATURE_TRACEABILITY_MATRIX y ENTITY_UI_COVERAGE con rutas/commands reales al implementar.
- Código: tests verdes, build, seguridad, migraciones reversibles, evitar endpoints sin clientes y eliminar prototipos/mocks muertos.
- Estado: `IN_DEVELOPMENT → CODEX_TESTING → READY_FOR_USER_TEST → USER_TESTING → ACCEPTED`; en caso de defecto `CHANGES_REQUESTED`.

## Puertas de decisiones técnicas previas a fase

Auth: fijar timeout absoluto y pruebas de sesiones antes de aceptar F1. Infraestructura: verificar proveedor y rutas de datos suizas; validar backup/PITR sin afirmar cumplimiento hasta pruebas. Offline: política por entidad antes de aceptación de F12/F16 y cualquier feature offline. Email: proveedor real SMTP/IMAP y condiciones de contacto antes de F7/F8. Finanzas: reglas por contrato e impuestos aplicables antes de F18. Cumplimiento: convenio/fuentes oficiales verificadas antes de habilitar reglas. Estos son gates de diseño/implementación, NO reversión de las 26 decisiones aprobadas.


## Gates obligatorios de dependencias transversales (no renumeran las fases)

| Gate | Antes de | Slice entregable y comprobación | IDs |
|---|---|---|---|
| G-EMP | Fase 12 Planning | Alta/edición de empleado, habilidades, disponibilidad, ausencias, equipos; UI + API + permisos + DB + E2E | REQ-EMP-001, REQ-EMP-002 |
| G-CMP | Fase 12 Planning y cualquier publicación | Consola de reglas GAV/CCT, versiones, vigencia, propuesta, aprobación humana; prueba de bloqueo de planificación no conforme | REQ-CMP-001, REQ-CMP-030 |
| G-SVC-ONE | Fases 13–18 | Servicio puntual desde contrato/orden hasta planificación, ejecución, cierre y facturación; trazabilidad de WorkEngagement | REQ-SVC-001, REQ-PR-002, REQ-PR-003 |
| G-SVC-MAINT | Fases 14–18 | Contrato mantenimiento, recurrencia, revisión, prórroga/terminación y facturación contractual | REQ-SVC-002, REQ-REC-030, REQ-REC-031 |
| G-CLOSE | Fase 19 | Cierre y borrador de referencia sin autopublicación | REQ-CLOSE-001, REQ-CLOSE-002 |
| G-SEC | Fase 20 | Security Center real, auditoría, restore demostrado y denegaciones multi-tenant | REQ-SEC-030, REQ-AUD-001, REQ-OPS-001 |

**Restricción de precedencia:** que una fase figure numerada como 12 no autoriza planificar antes de que G-EMP y G-CMP estén `ACCEPTED`; un fallo del gate bloquea la publicación. Las fases y gates se ejecutan por dependencias, no por número. La aceptación exige vertical slice UI–API–DB–permisos–seguridad–E2E–PO; las pruebas documentales no se confunden con ejecución.


## Resolución de fases cruzadas (regla de dependencia)

- `REQ-CMP-001/020/030`: núcleo operativo del motor, aprobación humana y comprobación de reglas quedan en **G-CMP antes de fase 12**; fase 15 añade capacidades avanzadas, nunca retrasa el mínimo obligatorio.
- `REQ-FILE-020`: validación segura y almacenamiento de fotografías operativos **antes de fase 9 Visitas**; fase 13 extiende a planos y documentación técnica.
- `REQ-SVC-001`: G-SVC-ONE se acepta **antes de activar** servicios puntuales; su entrega se integra entre fases 13–18 según dependencias, sin un corte arbitrario de numeración.
- `REQ-SVC-002`: G-SVC-MAINT se acepta **antes de activar** mantenimiento; la ejecución de renovaciones y cobro debe demostrar el flujo contractual completo.

## Dependencias presupuestarias — 2026-10-26

Fase 9 aporta medición progresiva reutilizable por Raumbuch; fase 10 completa cálculo estimado sin crear otro CRM ni planificador. Las reglas laborales/fiscales necesarias para emitir una oferta se verifican antes de usar sus perfiles; no diferir este control a G-CMP de Planning ni adelantar toda la fase de personal. COST-GATE-01 se registra en IMPLEMENTATION_GATES.md.

REQ-CALC-011 y CALC-09: se integran secuencialmente con horas reales (fase 16), validación contractual (17) y costes/ingresos (18). Cada fase acepta solo su capacidad disponible, muestra datos ausentes/provisionales y preserva baseline; cierre completo de rentabilidad real en fase 18 con evidencia conjunta. No abrir varios módulos para completar esta ampliación documental.
