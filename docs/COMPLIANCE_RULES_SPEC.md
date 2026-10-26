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

## Consumidor presupuesto — REQ-CALC-002/014/017/021

Antes de emitir con parámetros normativos reales, el cálculo debe resolver regla por lugar de trabajo, sector/categoría, supuesto laboral, fecha/franja y vigencia. No elegir convenio solo por idioma del PDF o domicilio social; mantener ámbito/jurisdicción y fuente aprobada. Romandía, Ticino y NAV doméstico son ámbitos distintos a verificar antes de habilitar sus perfiles; no heredar Deutschschweiz silenciosamente.

Modelar importe/%/base, reparto patronal/empleado, umbrales/techos, tiempo compensatorio, reglas de acumulación/excepción, fechas y aprobación. Cambios multianuales segmentan estimación y generan propuestas de impacto, nunca cambian precios/contratos automáticamente. Un override no elimina mínimos obligatorios ni convierte una tasa orientativa en ley. Parámetros por póliza/caja/plan requieren fuente de la empresa. El cálculo no sustituye liquidación de nómina ni revisión jurídica del ámbito.

Contraste selectivo 2026-10-26 contra GAV Deutschschweiz 2026–2029 art.12.5 y art.6.5: NBU no es coste empresarial universal y los recargos dependen del supuesto; trazabilidad y correcciones en OFFERS_AND_NEGOTIATION_SPEC.md. No se activan tasas por esta anotación. El subconjunto necesario para cotización se valida antes de fase 10; G-CMP de publicación operativa mantiene su alcance y aceptación propios.
