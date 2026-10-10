# CleanOps 360 — Política de documentación y control de cambios

## Qué documento responde a qué pregunta

| Pregunta | Documento principal | Límite |
|---|---|---|
| ¿Qué producto construiremos? | Product Master V3, PRD | PRD resume, no sustituye Master |
| ¿Qué comportamiento es obligatorio? | SRS V1.1 | Única fuente de IDs REQ; no copiar normas a specs para crear nuevos originales |
| ¿En qué secuencia y con qué gates? | ROADMAP, DEPENDENCY_GRAPH, IMPLEMENTATION_GATES | No interpretar número de fase como autorización para ignorar dependencias |
| ¿Qué flujo debe experimentar cada usuario? | Specs de módulo + UX_UI_SPEC | Especificaciones funcionales, no diseño final de componentes |
| ¿Cómo se desarrollará y aprobará cada entrega? | DELIVERY_PLAYBOOK, PHASE_ACCEPTANCE_TEMPLATE | No sustituir pruebas ejecutadas |
| ¿Qué implementación concreta se elige? | API_SPEC, DATA_MODEL, TECHNICAL_SPEC, ARCHITECTURE | Propuestas hasta que se aprueben por slice; evitar sobreespecificación anticipada |
| ¿Cómo comprobamos cobertura? | REQUIREMENTS_COVERAGE, TEST_CASE_REGISTER | Un ID presente NO equivale a prueba ejecutada ni contenido completo |

## Regla de actualización

1. Editar la norma en su documento propietario, no en cinco réplicas.
2. Revisar impacto en el SRS, Roadmap y specs afectados; actualizar referencias y matriz, sin duplicar párrafos obligatorios.
3. Distinguir `APPROVED`, `PROPOSED`, `DECISION_REQUIRED` y `VERIFICATION_PENDING`.
4. Preservar historial de decisiones; un parámetro técnico abierto no reabre las 26 decisiones aprobadas.
5. Antes de declarar entrega documental cerrada: comprobar integridad de ZIP, inventario, unicidad de requisitos, referencias, dependencias, coherencia semántica y auditoría manual representativa de cada módulo. Una comprobación mecánica no demuestra completitud.

## Estado de este paquete

**GUÍA DE EJECUCIÓN REORGANIZADA — NO APROBACIÓN GLOBAL DE IMPLEMENTACIÓN.** Se reorganiza cómo usar los documentos; la auditoría semántica exhaustiva de todas las specs y las autorizaciones granulares no se presumen completadas.
