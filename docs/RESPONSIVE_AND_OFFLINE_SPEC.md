# CLEANOPS 360 — RESPONSIVE AND OFFLINE SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Multidispositivo
Idioma inicial DE/ES/EN/IT/PT/SQ, test widths 320,375,430, tablet,1024,1440,1920 y Chrome/Edge/Firefox/Safari.


## PWA

Installability/push/offline parcial; cache cifrado/protegido conforme sensibilidad; invalidación logout y revocación; almacenar solo datos necesarios.


## Conexión

UI muestra online/offline/sync pending/conflict; IndexedDB guarda operaciones idempotentes; reautenticar y comprobar permisos al volver conexión.


## Conflicto

No last-write-wins para horas validadas, permisos, turnos publicados, contratos o facturas; resolución humana/versionada.

