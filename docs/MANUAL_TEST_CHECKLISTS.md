# CLEANOPS 360 — MANUAL TEST CHECKLISTS

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Plantilla obligatoria por vertical slice
Ejecución manual en STAGING; pruebas no hechas = `NOT_RUN`, nunca OK.


## Preparación

Identificar versión, entorno, usuario de prueba, tenant A/B, permiso/rol, seed data y requisito.


## Happy path

Abrir pantalla, realizar acción, comprobar estado visible, refrescar, comprobar persistencia, verificar auditoría y side effects reales.


## Negativos

Denegar rol, cross-tenant, entrada maliciosa, duplicar click, desconectar red, sesión expirada, recurso inexistente, conflicto de versiones, worker offline y reintento.


## Cierre

Adjuntar capturas/logs/test report; registrar BLOCKED/CHANGES_REQUESTED/ACCEPTED, fecha y aprobación explícita de Product Owner.

