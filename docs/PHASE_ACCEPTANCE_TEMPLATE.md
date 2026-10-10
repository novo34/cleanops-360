# CleanOps 360 — Plantilla obligatoria de entrega y aceptación de fase

> Copiar esta plantilla **cuando se vaya a ejecutar** una fase/slice; no rellenarla ahora con supuestos. Este documento es una instrucción, no una prueba realizada.

## Identificación

- Fase / slice y objetivo visible:
- Responsable de implementación / verificación / Product Owner:
- REQ-* aplicables, con enlace a SRS:
- Dependencias y gates concretos satisfechos (evidencia):
- Reglas del Product Master aplicables:
- Estado: `NOT_STARTED` / `IN_DESIGN` / `IN_DEVELOPMENT` / `IN_VERIFICATION` / `BLOCKED` / `READY_FOR_PO` / `ACCEPTED`.

## Resultado de negocio y experiencia

- Quién hace qué, cuándo y con qué resultado:
- Pantallas y acciones; estados vacío, carga, error, confirmación y accesibilidad:
- Datos visibles y permisos efectivos por rol/tenant:
- Comportamiento móvil/offline o razón documentada de no aplicar:

## Integración efectiva

| Acción UI o consumidor interno | Regla/REQ | API/comando realmente implementado | Entidad/efecto persistido | Control de autorización | Error y recuperación | Prueba ejecutada |
|---|---|---|---|---|---|---|
| (registrar cada acción; no usar filas genéricas) | | | | | | |

- Eventos, jobs y efectos secundarios, con idempotencia y observabilidad:
- Inventario de rutas/tablas/botones/jobs creados, su consumidor y justificación:
- Limpieza de código temporal, mocks y recursos sin uso:

## Evidencia de calidad

| Caso | Resultado esperado específico | Evidencia real (fecha, entorno, versión) | Estado |
|---|---|---|---|
| Camino positivo | | | NO EJECUTADO |
| Validación/errores | | | NO EJECUTADO |
| Denegación de permisos/tenant | | | NO EJECUTADO |
| Reintentos, duplicidad y conflictos | | | NO EJECUTADO |
| E2E desde navegador hasta datos y auditoría | | | NO EJECUTADO |
| Regresión de módulos conectados | | | NO EJECUTADO |

## Decisión de aceptación

- Bloqueos pendientes con propietario y fecha por hito:
- Desviaciones justificadas y autorización:
- Evidencia de revisión funcional y de seguridad:
- Demostración manual al Product Owner y observaciones:
- **Decisión del Product Owner:** `ACCEPTED` / `REJECTED` / `CHANGES_REQUIRED` (sin marcar de antemano).
