# CLEANOPS 360 — ACCEPTANCE CRITERIA

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Gate universal por funcionalidad
No aceptar botón sin backend real ni endpoint sin usuario o consumidor interno justificado. No aceptar backend aislado de UI.


## Capacidad

La acción UI ejecuta API/comando real, cambia estado de dominio autorizado y muestra resultado persisted; empty/loading/error/success y retry incluidos.


## Protección

RBAC/tenant, audit, validación y seguridad E2E; caso negativo y conflicto verificables.


## Evidencia

Unit+integration+E2E pasan; review independiente sin findings bloqueantes; staging deploy; Product Owner prueba y marca ACCEPTED.


## Dependencia

No avanzar a fase dependiente si no ACCEPTED salvo permiso excepcional explícito y auditado del Product Owner.

