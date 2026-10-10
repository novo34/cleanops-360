# CLEANOPS 360 — TIMESHEETS AND RAPPORTS SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Diferencias obligatorias
WorkLog diario, Timesheet, Rapport y frecuencia de Rapport son conceptos distintos. Horas trabajadas, validadas, facturadas y cobradas permanecen separadas.


## Captura

Empleado o responsable registra horas/tareas, fotos y fases; offline con operation-id y controles de conflicto/reautenticación.


## Rapports

Weekly/biweekly/monthly/custom; revisión cliente configurable por contrato; rechazo parcial conserva horas disputadas y comentarios.


## Facturación

Solo horas facturables según política/contrato se trasladan a borradores; provisional únicamente autorizado contractualmente.


## Pruebas

100 horas trabajadas, 85 aprobadas, 15 discutidas; comprobar que no se borran las trabajadas, no se emite indebidamente ni duplica factura.

