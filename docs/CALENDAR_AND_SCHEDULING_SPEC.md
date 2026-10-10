# CLEANOPS 360 — CALENDAR AND SCHEDULING SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## UI y estados
Calendar es una vista del Planning Engine y mezcla PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRACT.


## Vistas

Día/semana/mes/empleado/equipo/proyecto/ubicación, con filtros por tenant y permisos.


## My Day

Hora, lugar, equipo, responsable, instrucciones, accesos, transporte y cambios; Confirmar usa el acknowledgement SENT → DELIVERED → READ → ACKNOWLEDGED.


## Publicación

Solo un planner autorizado puede publicar; publicación genera versión y notifica afectados; concurrencia optimista impide sobrescritura concurrente.


## Offline

Cached assignments legibles offline, sin asumir que siguen vigentes; edición permitida por tipo y sincronización tras revalidación de permisos. Horarios publicados no se fusionan automáticamente.

