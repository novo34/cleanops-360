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

## Presupuestos — pruebas diseñadas, NOT_RUN

Fuente: SRS §13.1 REQ-CALC-001…022; casos CALC-01…21 definidos en OFFERS_AND_NEGOTIATION_SPEC.md. Ninguna casilla marcada por revisión documental.

- [ ] Configurar tenant A/B, fuentes/vigencias y catálogo; datos incompletos impiden solo acciones afectadas, no se activan referencias como ley.
- [ ] Visita → Raumbuch con once factores, partes/direcciones y accesos privados → cálculo recurrente/puntual/cristales y líneas mixtas.
- [ ] Ver coste vs venta, horas-persona vs duración, rendimiento propio/factores una sola vez, contribución vs beneficio y descuento/cargos visibles.
- [ ] Probar anual bisiesto, cambio horario, recargos por franja/vigencia, cierres cliente y cuota nivelada vs visitas; no publicar turnos.
- [ ] Probar vehículo/km/combustible/ida-vuelta/personas/reparto y comprobar doble coste rechazado.
- [ ] Nueva versión y conflicto concurrente; perfil actualizado no altera snapshot ni PDF histórico.
- [ ] PDF DE/FR/IT con ocho componentes, AGB/anexos/envío/validez y aceptación; sin coste interno ni códigos de acceso.
- [ ] Motivo pérdida/mercado orientativo; garantía/reajuste/adenda definidos; ejecución real de CALC-19/20 pendiente de módulos correspondientes.
- [ ] Con fases 16–18 aceptadas: tiempos reales comparables, rentabilidad provisional/final y propuesta de rendimiento con aprobación, sin borrar baseline.

Registrar por caso SHA, tenant/rol, inputs, cálculo esperado/obtenido, persistencia, auditoría y captura; PASS/FAIL/NOT_RUN separados. La matriz del original señala correcciones, no acredita funcionamiento.
