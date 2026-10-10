# CLEANOPS 360 — PLANNING ENGINE SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Motor único
Un Planning Engine sirve a todos los tipos de WorkEngagement. Su salida no se publica sin decisión humana.


## Entradas

WorkEngagement, disponibilidades, skills, descansos, instrucciones, fechas, prioridades, ubicación, transporte, continuidad, límites laborales versionados, absentismo y restricciones.


## Optimización

Propuestas con conflictos explicados, capacidad no cubierta, impacto sobre horas, riesgos y motivos; no modificar turnos publicados en silencio.


## Instrucciones cliente

INCREASE_STAFF crea/actualiza StaffingRequirement; REDUCE_STAFF reduce necesidad; CHANGE_PRIORITY recálculo; REPEAT_CLEANING nueva intervención; NEW_AREA unidad/área; PAUSE/REACTIVATE revisión planificación; CHANGE_DEADLINE alertas; OTHER tarea de revisión.


## Concurrencia

Versión obligatoria en ediciones de turnos y planificación; on conflict rechazar sobrescritura y solicitar merge/revisión. Se exige auditoría de publicaciones y acknowledgements afectados.


## Prueba UI

Desde Calendar proponer → revisar conflictos → publicar con usuario autorizado → ver My Day → Confirmar → comprobar estado ACKNOWLEDGED, sin mocks finales.



## Requisitos de entrada y dependencias de implementación

No se habilita publicación hasta aceptar G-EMP y G-CMP. Cada propuesta consume empleados, disponibilidad, ausencias, equipos, `StaffingRequirement`, reglas GAV/CCT vigentes y WorkEngagement. UI debe mostrar cobertura requerida, incompatibilidades y opciones de resolución; API valida todo nuevamente antes de publicar.

Dos planificadores editando la misma versión requieren control de versión/optimistic locking; en conflicto la segunda operación no sobrescribe la primera y muestra comparación. Historial de `schedule_versions` visible, rollback autorizado/auditado y notificación `ACKNOWLEDGED` verificable desde My Day. Test integrado `TC-X-003` y `TC-X-008`.
