# CLEANOPS 360 — COMPLIANCE RULES SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Marco jurídico configurable
ComplianceRuleSet con país/cantón/GAV/CCT, categoría empleado, vigencia, source, tipo y valor. Reglas no hard-coded.


## Vigilancia

Worker programado y botón UI Buscar cambios; ingesta de fuentes verificables suizas, dedup y comprobación de vigencia; la IA compara y propone, no legisla.


## Revisión

Proposal con diff, cita, source URL, confianza, impacto en planificación y empleados, fecha efectiva; solo aprobador autorizado aplica cambios, con versión, historial y auditoría.


## Tenant override

Condiciones específicas configurables dentro de límites legales verificados; incongruencias y fuentes no verificadas bloquean activación.


## Pruebas

Fuente cambia pero es rumor → no aplicar; aprobación explícita y replanificación pendiente → generar alertas, nunca publicar horarios nuevos automáticamente.



## Núcleo obligatorio anterior a Planning

G-CMP se acepta antes de fase 12: interfaz para consultar versión vigente, fuentes GAV/CCT, fecha de efecto, diferencias propuestas y aprobación humana. API autoriza `propose`, `review`, `approve`, `activate` separadamente; guarda actor, instante, referencia de fuente y versión inmutable. Propuesta por IA nunca activa reglas.

Sin regla laboral aplicable y aprobada, publicar planificación dependiente se bloquea con mensaje contextual; cambios posteriores invalidan propuestas afectadas para revisión humana. Los conectores y la supervisión normativa avanzada pueden ampliarse en fase 15 pero no sustituyen este núcleo. Pruebas de rechazo de versión no aprobada, tenant cruzado, concurrencia, cambios efectivos y aviso a planificador (`TC-X-003`).
