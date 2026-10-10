# CLEANOPS 360 — TESTING STRATEGY

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Estrategia obligatoria
Cada fase 0–20 entrega funcionalidad UI/UX + API/backend/persistencia reales y pruebas antes de aceptación.


## Pirámide

Unit para reglas y servicios; integración DB/API/worker; contracts para API/events; E2E browser con backend real y permisos; security/migration/load según riesgo.


## Puertas

Lint, typecheck, unit, integration, E2E, security, migration validation, build, staging, product owner manual acceptance. Fase dependiente no avanza sin ACCEPTED.


## Pruebas negativas

Intento no autorizado, cross-tenant, sesión expirada, offline conflicto, doble click, reintento, caída de worker, error externo, ventana vacía y no-contact.


## Artefactos

Test case ID ligado a REQ; URL UI, actor, datos seed, request/response, DB assertion, audit entry, logs, screenshot y estado ACCEPTED o BLOCKED.

