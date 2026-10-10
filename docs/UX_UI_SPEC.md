# CLEANOPS 360 — UX UI SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## UX contract
UI simple y responsive; complejidad detrás de navegación progresiva. Cada componente visible necesita efecto real verificable o estado claramente no disponible.


## Principios

Desktop admin/comercial/planner; mobile-first empleados/site responsible/visitas; pasos frecuentes ideal ≤3, touch target, contraste y accesibilidad.


## Flujos críticos

Login MFA; ProjectCandidate Promote; Opportunity pipeline; Inbox; Visit; Offer Accept; WorkEngagement Create; Planning Publish; My Day Confirm; Rapport review; Invoice issue; Compliance approve.


## Estados

Cada pantalla define loading, empty, error, success, offline, permisos insuficientes, conflicto 409, retry y evidencia de persistencia; no ocultar errores.


## Puerta UI-backend

No ACCEPTED sin navegador real contra staging/backend real; verificar ruta → permiso → comando → efecto → consulta UI actualizada → audit → tests.

