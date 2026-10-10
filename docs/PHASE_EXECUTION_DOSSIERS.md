# CLEANOPS 360 — Dossiers de ejecución por fase

**Estado:** instrucciones de trabajo y aceptación documental. Ningún módulo está construido ni probado.

## Reglas invariantes

1. Usar Product Master V3 y SRS V1.1 como fuentes normativas; conservar sus 26 decisiones aprobadas.
2. En cada fase y funcionalidad: delimitar casos de uso y permisos; diseñar pantallas con loading, empty y error; desarrollar API + persistencia mínima; conectar UI real; demostrar permisos en backend, auditoría, errores y pruebas E2E.
3. No se autoriza avanzar por un backend aislado. Una dependencia técnica sin UI propia solo se acepta si tiene consumidor real, prueba y justificación registrada.
4. El dossier es una instrucción de construcción, no un contrato de endpoints ni una afirmación de que la tecnología ya funciona.
5. Un gate de infraestructura bloquea la operación afectada; su estado abierto no significa que se haya realizado una prueba de producto.
6. No se pueden introducir datos reales o salida externa de emails/IA sin superar los controles correspondientes.

## Catálogo de fases y protocolo

### Fase 00 — Foundation

**Objetivo verificable:** Entorno staging, CI/CD, versión, feature flags, observabilidad y recuperación preparada.

**Interfaz y experiencia a entregar:** Administration/System Status: versión, entorno, health y estado de jobs.

**Comportamiento del sistema:** health/config/version; auditoría de despliegue.

**Datos y entidades a comprobar:** `organizations, feature_flags, audit_logs, security_events`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-PR-006, REQ-PR-007, REQ-INF-001, REQ-INF-003.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 01 — Authentication + MFA

**Objetivo verificable:** Acceso protegido y ciclo de sesión completo.

**Interfaz y experiencia a entregar:** Login, OTP, TOTP, recovery, sesiones, reset y errores.

**Comportamiento del sistema:** auth/session/MFA con revocación real.

**Datos y entidades a comprobar:** `users,auth_identities,sessions,mfa_methods,mfa_challenges,recovery_codes`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-AUTH-001, REQ-AUTH-002, REQ-SEC-020, REQ-SEC-021.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 02 — Users + Roles + Permissions

**Objetivo verificable:** Acceso autorizado por tenant, rol y recurso.

**Interfaz y experiencia a entregar:** Administración → usuarios → gestionar acceso.

**Comportamiento del sistema:** política denegación explícita, permisos efectivos y auditoría.

**Datos y entidades a comprobar:** `roles,permissions,user_permission_overrides,temporary_permissions`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-AUTHZ-001, REQ-AUTHZ-007.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 03 — Companies + Contacts

**Objetivo verificable:** CRM utilizable con prevención de contacto no autorizado.

**Interfaz y experiencia a entregar:** Listado/ficha compañía y contacto; No contactar.

**Comportamiento del sistema:** CRUD, búsqueda, supresión y auditoría.

**Datos y entidades a comprobar:** `companies,contacts,contact_compliance,suppression_list`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-CRM-001, REQ-COM-005.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 04 — Manual Opportunities + Pipeline

**Objetivo verificable:** Oportunidad manual y sugerencias verificables.

**Interfaz y experiencia a entregar:** Crear, sugerir, aprobar, pipeline e historial.

**Comportamiento del sistema:** transiciones con autorización y persistencia.

**Datos y entidades a comprobar:** `opportunities,opportunity_sources,tasks`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-OPP-001, REQ-OPP-005.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 05 — Radar

**Objetivo verificable:** Detección y revisión de candidatos.

**Interfaz y experiencia a entregar:** Radar Runs, ficha ProjectCandidate, Promote.

**Comportamiento del sistema:** SourceConnector → RawFinding → dedup → Candidate y promoción explícita.

**Datos y entidades a comprobar:** `source_connectors,raw_findings,project_candidates,project_sources`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-RAD-003, REQ-RAD-004, REQ-RAD-030.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 06 — Enrichment + Scoring

**Objetivo verificable:** Enriquecimiento con procedencia y puntuación explicable.

**Interfaz y experiencia a entregar:** Ficha candidato/origen, Recalculate, razones.

**Comportamiento del sistema:** fuentes/confidence, score, dedup y protección manual_verified.

**Datos y entidades a comprobar:** `project_sources,opportunity_sources,ai_runs`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-SCR-001, REQ-RAD-006.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 07 — Inbox + Email

**Objetivo verificable:** Recepción y envío desde UI conectada a SMTP/IMAP.

**Interfaz y experiencia a entregar:** Inbox, hilo, respuesta, adjuntos, marcar No contactar.

**Comportamiento del sistema:** conectores, threading, suppression y estados de entrega.

**Datos y entidades a comprobar:** `email_accounts,email_threads,emails`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-EML-001, REQ-EML-020.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 08 — AI Email + Follow-up

**Objetivo verificable:** Borradores y seguimientos controlados.

**Interfaz y experiencia a entregar:** Redactar, aprobar, programar, pausar y Run now.

**Comportamiento del sistema:** proveedor IA, políticas tenant, límites, tareas y cancelación.

**Datos y entidades a comprobar:** `ai_runs,ai_outputs,automation_rules,automation_runs`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-EML-021, REQ-FUP-002, REQ-AI-020.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 09 — Visits

**Objetivo verificable:** Visitas comerciales registradas en móvil.

**Interfaz y experiencia a entregar:** Agendar visita, registrar notas, fotos y planos.

**Comportamiento del sistema:** site visits, documentos, asociación a oportunidades.

**Datos y entidades a comprobar:** `site_visits,appointments,documents`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-VIS-001, REQ-VIS-003.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 10 — Offers + Negotiation

**Objetivo verificable:** Ofertas versionadas y negociación humana.

**Interfaz y experiencia a entregar:** Editor de oferta, versiones, Accept/Counter/Maintain.

**Comportamiento del sistema:** versions/approval, precios seguros y aceptaciones auditadas.

**Datos y entidades a comprobar:** `offers,offer_versions,tenders,tender_positions`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-OFF-001, REQ-OFF-005, REQ-DOC-020.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 11 — WorkEngagement Core

**Objetivo verificable:** Transición comercial-operativa obligatoria.

**Interfaz y experiencia a entregar:** Opportunity Won → Crear WorkEngagement.

**Comportamiento del sistema:** Won → PENDING → acción humana → CREATED, reintentos idempotentes.

**Datos y entidades a comprobar:** `work_engagements,contracts,projects`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-WE-001, REQ-WE-002, REQ-TRC-WE-001.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 12 — Planning Engine + Calendar + My Day

**Objetivo verificable:** Planificación común con publicación humana.

**Interfaz y experiencia a entregar:** Calendario, asignar, confirmar en My Day.

**Comportamiento del sistema:** propuestas, conflictos, publicación versionada y acknowledgement.

**Datos y entidades a comprobar:** `assignments,shifts,schedule_versions,notification_acknowledgements`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-PLN-001, REQ-CAL-004, REQ-SCH-003.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 13 — Projects + Phases + Plans

**Objetivo verificable:** Gestión de obra, fases y revisiones.

**Interfaz y experiencia a entregar:** Vista obra edificio/planta/unidad, fases y planos.

**Comportamiento del sistema:** avance por unidad, fases configurables, planes versionados.

**Datos y entidades a comprobar:** `projects,project_phases,project_zones,project_units,plans,plan_versions`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-PHS-001, REQ-PLAN-004.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 14 — Recurring Services

**Objetivo verificable:** Servicios recurrentes y renovaciones contractuales.

**Interfaz y experiencia a entregar:** Ficha contrato; Renew/Renegotiate/Terminate/Postpone.

**Comportamiento del sistema:** recurrencia, cláusulas, avisos y autorizaciones.

**Datos y entidades a comprobar:** `recurring_services,maintenance_contracts,contracts`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-REC-020.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 15 — Client Instructions

**Objetivo verificable:** Instrucciones con efecto real en operación.

**Interfaz y experiencia a entregar:** Registrar instrucción, impacto y revisión Planner.

**Comportamiento del sistema:** recalcular necesidad; tarea/alerta; sin autopublicar cambios.

**Datos y entidades a comprobar:** `client_instructions,assignments,notifications`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-CLI-002.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 16 — Hours + Work Logs

**Objetivo verificable:** Horas verificables, alertas y operación offline.

**Interfaz y experiencia a entregar:** Registrar horas, log, historial y conflictos offline.

**Comportamiento del sistema:** timesheets, reconciliación y reglas de horas referencia.

**Datos y entidades a comprobar:** `timesheets,work_logs,reference_hours_history`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-HRS-002, REQ-OFFLINE-001.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 17 — Rapports

**Objetivo verificable:** Rapports por periodo y aprobación contractual.

**Interfaz y experiencia a entregar:** Generar, revisar, aprobar/rechazar parcial.

**Comportamiento del sistema:** trabajadas != validadas; flujo aceptación y auditoría.

**Datos y entidades a comprobar:** `rapports,rapport_lines,work_logs`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-RPT-001, REQ-RPT-002.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 18 — Finance

**Objetivo verificable:** Facturación y pagos con controles.

**Interfaz y experiencia a entregar:** Borrador, autorización, emisión, envío, conciliación.

**Comportamiento del sistema:** Regie/Pauschal/recurrente, duplicados, estados auditados.

**Datos y entidades a comprobar:** `invoices,invoice_lines,payments`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-FIN-020.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 19 — Closeout + References

**Objetivo verificable:** Cierre y propuesta de referencias sin publicación automática.

**Interfaz y experiencia a entregar:** Cerrar, revisar métricas, Crear referencia/No ahora.

**Comportamiento del sistema:** closeout, historial, borrador referencia, sin envío automático.

**Datos y entidades a comprobar:** `projects,work_engagements,comments`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-CLOSE-001, REQ-CLOSE-002.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.

### Fase 20 — Production Hardening

**Objetivo verificable:** Verificación integral de capacidad y recuperación.

**Interfaz y experiencia a entregar:** Security Center, auditorías, restore evidence.

**Comportamiento del sistema:** escaneos, RPO/RTO demostrados, aislamiento y runbooks.

**Datos y entidades a comprobar:** `security_events,security_incidents,audit_logs`.

**Normativa relacionada (lista inicial; verificar requisitos transversales):** REQ-SEC-030, REQ-AUD-001, REQ-OPS-001, REQ-INF-003, REQ-PR-007.

**Secuencia de ejecución obligatoria:**

1. Determinar el slice funcional más pequeño que aporte valor observable, su actor, tenant, permisos, dependencias y su ciclo de estados.
2. Diseñar la interacción completa: acceso, formulario, confirmación, estado vacío/cargando, denegación, error de validación, conflicto, recuperación y accesibilidad.
3. Definir el contrato de datos mínimo para este slice y auditar la compatibilidad con el modelo de datos. Nada de persistencia o API huérfana.
4. Implementar conjuntamente frontend, backend, API, control de permisos y persistencia real. Registrar eventos de auditoría donde corresponda.
5. Probar camino satisfactorio, entrada inválida, denegación de permisos, aislamiento cross-tenant, condiciones de carrera, reintento/idempotencia cuando proceda y regresión.
6. Proporcionar evidencia: captura/video del flujo real, identificadores de tests ejecutados, resultados de CI, referencias de cambios, logs depurados y comprobación de datos persistidos.
7. Someter el resultado al gate de fase y aceptación explícita del Product Owner; no aceptar con flujos simulados.

**Bloqueo específico:** verificar `IMPLEMENTATION_GATES.md`, en particular gates de personal/Compliance antes de publicar Planning, archivos antes de visitas con fotografías y seguridad/residencia antes de datos reales.

**Salida para la fase siguiente:** dossier firmado según `PHASE_ACCEPTANCE_TEMPLATE.md`, con desvíos y riesgos remanentes consignados.
