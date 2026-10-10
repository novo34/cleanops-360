# CleanOps 360 — PRD canónico (derivado)

**Estado:** revisión documental; los requisitos obligatorios se mantienen en `CLEANOPS_360_SRS_V1_1.md`, no se redefinen aquí.

## Problema y alcance
Gestión integral, multiempresa y auditable de empresas B2B de limpieza y servicios de mantenimiento en Suiza: prospección → oportunidad → contacto → visita → oferta/negociación → WorkEngagement → planificación → ejecución → horas/rapports → facturas/cobros → cierre/renovación.

## Actores
Administración de plataforma/tenant, comercial, planificación, responsables, operarios, finanzas y usuarios de consulta. Roles y acceso efectivo: `RBAC_PERMISSIONS.md`, `AUTHENTICATION_SPEC.md` y `REQ-AUTHZ-*`.

## Productos y journeys prioritarios
1. Radar identifica `ProjectCandidate` sin promoción automática; aprobación `Promote to Opportunity` con permiso (`REQ-RAD-003..005`).
2. Opportunity manual y pipeline; visita y versiones de oferta; `Accept` provoca `Won`, deja creación de WorkEngagement pendiente hasta intervención humana (`REQ-WE-*`, `REQ-TRC-WE-001`).
3. Cuatro modalidades de `WorkEngagement`: proyecto, recurrente, puntual y contrato de mantenimiento. Todos comparten Planning Engine (`REQ-PR-002..003`; `REQ-SVC-001..002`).
4. Antes de publicar planificación: personal, disponibilidad, ausencias, competencias y cumplimiento GAV/CCT aprobados (`REQ-EMP-*`, `REQ-CMP-030`).
5. My Day, instrucciones de cliente con efecto visible, registro offline, revisión de rapports, facturación contractual, cobros y cierre/renovación.

## Resultados verificables
Cada capacidad se acepta mediante slice UI/UX→API real→DB→autorización→auditoría→pruebas integradas/E2E→staging→validación manual del PO. Se rechazan botones decorativos, APIs sin consumidor y datos simulados en aceptación (`REQ-PR-006..007`).

## Límites y exclusiones
No se implementará software durante esta etapa. No n8n. No publicación automática de referencias comerciales. IA no aprobará precios/contratos/decisiones sensibles. Los proveedores, garantías contractuales y parámetros pendientes se registran como gates, no se presumen resueltos.

## Navegación
Normativa: Master + SRS. Implementación: Roadmap, Functional/API/UX specs, matriz de requisitos, dependencias y criterios de aceptación. Todas las pruebas permanecen `DESIGN_ONLY`.
