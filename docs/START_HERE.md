# CLEANOPS 360 — Instrucción maestra para desarrollar

## Propósito
Implementar el sistema independiente CleanOps 360 **por funcionalidades completas**, nunca creando todo el backend y dejando el frontend para el final.

## Jerarquía inalterable
1. Product Master V3 y SRS V1.1 (reglas normativas y 26 decisiones aprobadas).
2. `DECISION_REGISTER.md`: distingue decisiones firmes y asuntos abiertos.
3. `ROADMAP.md`, `DEPENDENCY_GRAPH.md`, `IMPLEMENTATION_GATES.md`: orden y dependencias.
4. Especificaciones funcionales por módulo, arquitectura y diseño de datos: interpretación derivada; las propuestas no modifican normas.
5. `PHASE_EXECUTION_DOSSIERS.md` y `DELIVERY_PLAYBOOK.md`: instrucciones ejecutables de cada fase.
6. `PHASE_ACCEPTANCE_TEMPLATE.md`: evidencia de pruebas reales y aceptación.

## Orden de trabajo de cada fase
**Antes de escribir código**: identificar obligaciones aplicables y las decisiones de ese slice; revisar estados, reglas legales, grupos de usuarios y datos; bloquear las contradicciones sin resolver. **Durante el desarrollo**: crear UI/UX, frontend, API, backend, permisos y persistencia juntos. **Después**: ejecutar pruebas automáticas y manuales en entorno aislado, demostrar un ciclo completo real y solicitar aprobación humana.

## Condiciones no negociables
- Cross-tenant siempre denegado; explicit deny prevalece; seguridad también en backend.
- Nada de activar decisiones económicas o normativas sensibles sin aprobación prevista.
- `ProjectCandidate` no equivale a `Opportunity`; promoción humana hasta que exista una regla aprobada.
- `Offer Accepted` marca `Opportunity Won` y deja WorkEngagement `PENDING`; creación humana cambia a `CREATED`; no implica contrato firmado.
- Redis + BullMQ, único VPS suizo, volúmenes privados y backups suizos; RPO/RTO son objetivos por probar.
- No ocultar requisitos incompletos bajo conteos de IDs. Rechazar pruebas genéricas como evidencia de aceptación.

## Primer alcance autorizable
**Fase 0 — Foundation:** preparar entornos de prueba sin datos reales, pipelines, seguridad base, observabilidad y primer slice de estado del sistema con UI y backend reales. Para Fase 1 en adelante, cerrar los gates y permisos del slice correspondiente antes de aceptarlo.

## Plantilla de orden futura al equipo
> Ejecuta la siguiente funcionalidad no aceptada de la fase actual siguiendo `PHASE_EXECUTION_DOSSIERS.md`, `DELIVERY_PLAYBOOK.md`, `IMPLEMENTATION_GATES.md` y sus REQ del SRS. Entrega UI/UX, frontend, backend, persistencia, permisos y pruebas funcionales integradas. No marques COMPLETED sin evidencia y aprobación; documenta y eleva toda decisión no aprobada.

## Especificación transversal: idiomas gestionados desde UI

Antes de implementar textos visibles, administración, notificaciones o documentos, consultar `I18N_LANGUAGE_MANAGEMENT_SPEC.md`. Product Master V3 §109 y SRS V1.1 §29 ya exigen DE/ES/EN/IT/PT/SQ. Además, el Product Owner requiere administración de idiomas desde la UI con plantillas JSON descargables/importables, editor, borradores, versiones, publicación, permisos, auditoría y pruebas. El detalle derivado no sustituye normas originales; resolver sus `DECISION_REQUIRED` en D0/D2. Preparar i18n desde Foundation sin anticipar tablas/endpoints sin consumidor.
