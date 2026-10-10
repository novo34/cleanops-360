# CLEANOPS 360 — ENTITY_UI_COVERAGE

**Estado:** inventario lógico pre-implementación; clasificación y superficies propuestas **para verificación**, NO esquema SQL ni pantallas existentes. Fuente: catálogo Product Master V3 §117 y DATA_MODEL.md. Fecha: 2026-10-09.

No se construirán tablas sin owner, flujo de lectura/escritura y uso comprobable. `SYSTEM_MANAGED` y `AUDIT_ONLY` no requieren CRUD completo, pero sí justificación de servicio, API interna o vista de consulta autorizada. `USER_MANAGED` requiere superficie UI concreta o un proceso autorizado claro. Clasificación sujeta a diseño detallado por entidad.

| Entidad | Ownership propuesto | Tipo de gestión | Superficie / consumidor previsto | Fase inicial | Cobertura actual |
|---|---|---|---|---:|---|
| `organizations` | identidad/autorización | USER_MANAGED | Administración → Empresa → datos y configuración tenant | 0 | DESIGN_ONLY |
| `users` | identidad/autorización | USER_MANAGED | Administración → Usuarios → invitar, editar, desactivar | 1 | DESIGN_ONLY |
| `auth_identities` | identidad/autorización | SYSTEM_MANAGED | Servicio interno, monitorización y consulta autorizada | 1 | DESIGN_ONLY |
| `sessions` | identidad/autorización | SYSTEM_MANAGED + USER_VISIBLE | Seguridad → Sesiones activas: dispositivos, fecha, cierre remoto y revocación (solo las sesiones permitidas al usuario) | 1 | DESIGN_ONLY |
| `mfa_methods` | identidad/autorización | SYSTEM_MANAGED | Servicio interno, monitorización y consulta autorizada | 1 | DESIGN_ONLY |
| `mfa_challenges` | identidad/autorización | SYSTEM_MANAGED | Servicio interno, monitorización y consulta autorizada | 1 | DESIGN_ONLY |
| `recovery_codes` | identidad/autorización | SYSTEM_MANAGED | Servicio interno, monitorización y consulta autorizada | 1 | DESIGN_ONLY |
| `roles` | identidad/autorización | USER_MANAGED | Administración → Roles → permisos base | 2 | DESIGN_ONLY |
| `permissions` | identidad/autorización | USER_MANAGED | Administración → Permisos → catálogo y ámbito | 2 | DESIGN_ONLY |
| `user_permission_overrides` | identidad/autorización | USER_MANAGED | Usuario → Gestionar acceso → excepciones explícitas | 2 | DESIGN_ONLY |
| `temporary_permissions` | identidad/autorización | USER_MANAGED | Usuario → Gestionar acceso → grants con caducidad | 2 | DESIGN_ONLY |
| `companies` | CRM/Radar/Comercial | USER_MANAGED | CRM → Empresas → listado, ficha, editar | 3 | DESIGN_ONLY |
| `contacts` | CRM/Radar/Comercial | USER_MANAGED | CRM → Contactos → ficha, procedencia y preferencias | 3 | DESIGN_ONLY |
| `contact_compliance` | CRM/Radar/Comercial | USER_MANAGED | Contacto → Cumplimiento → base, retención, supresión | 3 | DESIGN_ONLY |
| `suppression_list` | CRM/Radar/Comercial | USER_MANAGED | Configuración → Cumplimiento → no contactar | 3 | DESIGN_ONLY |
| `source_connectors` | CRM/Radar/Comercial | USER_MANAGED | Radar → Fuentes → habilitar, frecuencia, estado | 5 | DESIGN_ONLY |
| `raw_findings` | CRM/Radar/Comercial | INTEGRATION_MANAGED | Pipeline origen con logs y revisión | 5 | DESIGN_ONLY |
| `project_candidates` | CRM/Radar/Comercial | USER_MANAGED | Radar → Candidatos → evidencia y promoción | 5 | DESIGN_ONLY |
| `project_sources` | CRM/Radar/Comercial | INTEGRATION_MANAGED | Pipeline origen con logs y revisión | 5 | DESIGN_ONLY |
| `opportunities` | CRM/Radar/Comercial | USER_MANAGED | CRM → Pipeline → ficha, transición e historial | 4 | DESIGN_ONLY |
| `opportunity_sources` | CRM/Radar/Comercial | INTEGRATION_MANAGED | Pipeline origen con logs y revisión | 4 | DESIGN_ONLY |
| `email_accounts` | CRM/Radar/Comercial | USER_MANAGED | Configuración → Correo → cuentas SMTP/IMAP | 7 | DESIGN_ONLY |
| `email_threads` | CRM/Radar/Comercial | USER_MANAGED | Inbox → Conversaciones → hilo y relaciones | 7 | DESIGN_ONLY |
| `emails` | CRM/Radar/Comercial | USER_MANAGED | Inbox → Mensaje → redactar, revisar, enviar | 7 | DESIGN_ONLY |
| `tasks` | CRM/Radar/Comercial | USER_MANAGED | Mis tareas → bandeja, asignación y vencimiento | 4 | DESIGN_ONLY |
| `appointments` | CRM/Radar/Comercial | USER_MANAGED | Calendario → Citas → crear, reprogramar | 9 | DESIGN_ONLY |
| `site_visits` | CRM/Radar/Comercial | USER_MANAGED | Visitas → Agenda y ficha móvil → registrar visita | 9 | DESIGN_ONLY |
| `offers` | CRM/Radar/Comercial | USER_MANAGED | Ofertas → Editor → versiones, enviar y aceptar | 10 | DESIGN_ONLY |
| `offer_versions` | CRM/Radar/Comercial | USER_MANAGED | Ofertas → Historial → comparar revisiones | 10 | DESIGN_ONLY |
| `tenders` | CRM/Radar/Comercial | USER_MANAGED | Comercial → Licitaciones → expediente y documentos | 10 | DESIGN_ONLY |
| `tender_positions` | CRM/Radar/Comercial | DERIVED | Vista a través de entidad padre; sin CRUD independiente | 10 | DESIGN_ONLY |
| `contracts` | operaciones/planificación | USER_MANAGED | Contratos → Detalle → condiciones, vigencia y firma | 11 | DESIGN_ONLY |
| `work_engagements` | operaciones/planificación | USER_MANAGED | Operaciones → WorkEngagement → estado y acciones | 11 | DESIGN_ONLY |
| `projects` | operaciones/planificación | USER_MANAGED | Obras → Proyecto → fases, progreso y cierre | 11 | DESIGN_ONLY |
| `recurring_services` | operaciones/planificación | USER_MANAGED | Servicios → Recurrentes → calendario y renovaciones | 14 | DESIGN_ONLY |
| `one_off_services` | operaciones/planificación | USER_MANAGED | Operaciones → Servicios puntuales → ficha y ejecución | G-SVC-ONE | DESIGN_ONLY |
| `maintenance_contracts` | operaciones/planificación | USER_MANAGED | Contratos → Mantenimiento → alcance y prórroga | 14 | DESIGN_ONLY |
| `project_phases` | operaciones/planificación | USER_MANAGED | Obras → Fases → configurar orden y progreso | 13 | DESIGN_ONLY |
| `project_zones` | operaciones/planificación | USER_MANAGED | Obras → Zonas → unidades y trabajo pendiente | 13 | DESIGN_ONLY |
| `project_units` | operaciones/planificación | USER_MANAGED | Obras → Unidades → fase, estado y repetición | 13 | DESIGN_ONLY |
| `plans` | operaciones/planificación | USER_MANAGED | Obras → Planos → visor y versiones | 13 | DESIGN_ONLY |
| `plan_versions` | operaciones/planificación | USER_MANAGED | Planos → Historial de versiones → comparar/descargar | 13 | DESIGN_ONLY |
| `documents` | operaciones/planificación | USER_MANAGED | Documentos → Archivos → subida, permisos, revisión | 9 | DESIGN_ONLY |
| `employees` | operaciones/planificación | USER_MANAGED | Personal → Empleados → ficha, estado y asignaciones | G-EMP | DESIGN_ONLY |
| `employee_skills` | operaciones/planificación | USER_MANAGED | Personal → Empleado → competencias verificadas | G-EMP | DESIGN_ONLY |
| `availability` | operaciones/planificación | USER_MANAGED | Personal → Disponibilidad → calendario/solicitudes | G-EMP | DESIGN_ONLY |
| `absences` | operaciones/planificación | USER_MANAGED | Personal → Ausencias → solicitud/revisión | G-EMP | DESIGN_ONLY |
| `assignments` | operaciones/planificación | USER_MANAGED | Planificación → Asignaciones → propuesta/publicar | 12 | DESIGN_ONLY |
| `teams` | operaciones/planificación | USER_MANAGED | Personal → Equipos → integrantes y roles | G-EMP | DESIGN_ONLY |
| `shifts` | operaciones/planificación | USER_MANAGED | Planificación → Turnos → calendario y detalle | 12 | DESIGN_ONLY |
| `schedule_versions` | operaciones/planificación | USER_MANAGED | Planificación → Historial publicado → cambios/diff | 12 | DESIGN_ONLY |
| `transport` | operaciones/planificación | USER_MANAGED | Planificación → Transporte → solicitud/asignación | 12 | DESIGN_ONLY |
| `client_instructions` | operaciones/planificación | USER_MANAGED | Obras → Instrucciones cliente → ejecutar/seguimiento | 15 | DESIGN_ONLY |
| `reference_hours_history` | operaciones/planificación | AUDIT_ONLY | Consulta de auditoría restringida / job verificable | 16 | DESIGN_ONLY |
| `work_logs` | operaciones/planificación | USER_MANAGED | Ejecución → Work Logs → fotos, horas y áreas | 16 | DESIGN_ONLY |
| `timesheets` | finanzas/reglas/plataforma | USER_MANAGED | Horas → Partes → registro, conflicto y aprobación | 16 | DESIGN_ONLY |
| `rapports` | finanzas/reglas/plataforma | USER_MANAGED | Rapports → Periodo → preparar, aprobar/disputar | 17 | DESIGN_ONLY |
| `rapport_lines` | finanzas/reglas/plataforma | DERIVED | Vista a través de entidad padre; sin CRUD independiente | 17 | DESIGN_ONLY |
| `incidents` | finanzas/reglas/plataforma | USER_MANAGED | Operaciones → Incidencias → registro, seguimiento, cierre | 13 | DESIGN_ONLY |
| `progress_logs` | finanzas/reglas/plataforma | SYSTEM_MANAGED | Obra → Progreso → línea temporal autorizada | 13 | DESIGN_ONLY |
| `invoices` | finanzas/reglas/plataforma | USER_MANAGED | Finanzas → Facturas → borrador, emitir y enviar | 18 | DESIGN_ONLY |
| `invoice_lines` | finanzas/reglas/plataforma | DERIVED | Vista a través de entidad padre; sin CRUD independiente | 18 | DESIGN_ONLY |
| `payments` | finanzas/reglas/plataforma | USER_MANAGED | Finanzas → Cobros → registrar y conciliar | 18 | DESIGN_ONLY |
| `compliance_rule_sets` | finanzas/reglas/plataforma | USER_MANAGED | Administración → Normativa → reglas versionadas y vigencia | G-CMP | DESIGN_ONLY |
| `compliance_rules` | finanzas/reglas/plataforma | USER_MANAGED | Administración → Normativa → comparar y aprobar cambios | G-CMP | DESIGN_ONLY |
| `comments` | finanzas/reglas/plataforma | USER_MANAGED | Ficha de entidad → Comentarios e historial autorizado | 19 | DESIGN_ONLY |
| `notifications` | finanzas/reglas/plataforma | SYSTEM_MANAGED | Servicio interno, monitorización y consulta autorizada | 15 | DESIGN_ONLY |
| `notification_acknowledgements` | finanzas/reglas/plataforma | AUDIT_ONLY | Consulta de auditoría restringida / job verificable | 12 | DESIGN_ONLY |
| `automation_rules` | finanzas/reglas/plataforma | USER_MANAGED | Automatizaciones → Reglas → programar/pausar | 8 | DESIGN_ONLY |
| `automation_runs` | finanzas/reglas/plataforma | AUDIT_ONLY | Consulta de auditoría restringida / job verificable | 8 | DESIGN_ONLY |
| `ai_policies` | finanzas/reglas/plataforma | USER_MANAGED | Administración → IA → políticas por tenant y proveedor | 8 | DESIGN_ONLY |
| `ai_runs` | finanzas/reglas/plataforma | AUDIT_ONLY | Consulta de auditoría restringida / job verificable | 6 | DESIGN_ONLY |
| `ai_outputs` | finanzas/reglas/plataforma | AUDIT_ONLY | Consulta de auditoría restringida / job verificable | 8 | DESIGN_ONLY |
| `feature_flags` | finanzas/reglas/plataforma | USER_MANAGED | Administración → Funciones → habilitar por tenant | 0 | DESIGN_ONLY |
| `audit_logs` | finanzas/reglas/plataforma | AUDIT_ONLY | Consulta de auditoría restringida / job verificable | 0 | DESIGN_ONLY |
| `security_events` | finanzas/reglas/plataforma | AUDIT_ONLY | Consulta de auditoría restringida / job verificable | 0 | DESIGN_ONLY |
| `security_incidents` | finanzas/reglas/plataforma | USER_MANAGED | Seguridad → Incidentes → estado y acciones | 20 | DESIGN_ONLY |

## Gate por entidad en cada fase

Completar owner domain concreto, acciones `created/read/updated by`, permisos, lifecycle, retención, superficie UI real (o consumidor interno con razón técnica), comando/API, estados, flujo de datos y pruebas. **No aceptar una entidad sin propósito documentado**, ni interfaces aparentes que consuman mocks en staging. `POR_ASIGNAR` señala planificación pendiente, no autorización de crear tablas.

## Integridad con matriz de trazabilidad

- Las entidades gestionadas desde UI deben estar asociadas a una acción de `FEATURE_TRACEABILITY_MATRIX.md`, salvo que pertenezcan a funciones posteriores explícitamente programadas.
- Las entidades internas justificadas deben enlazarse al evento, job o consulta que las usa; si no hay consumidor, posponer su creación.
- `RawFinding` ≠ `ProjectCandidate` ≠ `Opportunity`; `Opportunity Won` ≠ `WorkEngagement Created`.
- `worked_hours`, `validated_hours`, `invoiced_hours`, `paid_hours` no se fusionan ni se sobrescriben.
- No afirmar que las superficies o entidades existan: toda esta matriz es especificación documental.

| `StaffingRequirement` | planificación/operaciones | USER_VISIBLE | Planificación → Requisitos de dotación: alta, edición, competencias, cobertura y cambios por turno/proyecto | G-EMP / 12 | DESIGN_ONLY |
