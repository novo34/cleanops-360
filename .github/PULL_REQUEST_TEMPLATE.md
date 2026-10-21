## Cambio y trazabilidad

**REQ / módulo / resultado observable:** 
**Exclusiones y autorizaciones exactas:** 

## QG-0 — Inventario obligatorio ANTES de escribir
**Archivos, componentes, funciones, contratos, harness y workflows existentes inspeccionados (rutas concretas):** 
**Alternativas evaluadas (reutilizar / corregir en origen / extender / reemplazar / crear):** 
**Justificación del diff mínimo y archivos nuevos (cada uno con dueño, consumidor, prueba y criterio de retirada si temporal):** 
**Riesgos de seguridad, ACL/RLS, tenant, migraciones, concurrencia y reversión:** 

## QG-1/QG-2 — Implementación
- [ ] No hay implementaciones paralelas, wrappers/guards/runner duplicados, endpoints huérfanos ni mocks productivos.
- [ ] Causa raíz corregida; no nueva variante por fallo previo sin STOP-AND-DESIGN.
- [ ] Consumidores, documentación y tests usan una implementación canónica.
- [ ] Cambios dentro de alcance y autorizaciones; no se han modificado archivos aprobados sin nueva aprobación.

## QG-3 — Evidencia y cierre
- [ ] Inventario de archivos añadidos/modificados/eliminados, sin basura o duplicación.
- [ ] Sintaxis/lint/tests locales antes de CI costosa.
- [ ] Tests reales y PASS/FAIL/SKIP separados con enlaces a logs y commit exacto.
- [ ] Controles de seguridad, multi-tenant, concurrencia e idempotencia probados si afectan al cambio.
- [ ] Sin merge/TECH-READY/ACCEPTED hasta satisfacer gates y revisión del propietario.

**Evidencias (URL/run/SHA):**

**Excepciones explícitas, dueño, aprobación y fecha/condición de eliminación:**

> Política: `docs/ENGINEERING_QUALITY_POLICY.md`. No marcar casillas sin evidencia.
