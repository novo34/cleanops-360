# CleanOps 360 — Manual de ejecución del desarrollo

**Propósito:** indicar al equipo o agente **cómo desarrollar el producto** definido por Product Master V3 y SRS V1.1. No es código ni define por anticipado todos los endpoints o tablas.

**Estado documental:** guía de ejecución propuesta para aceptación del Product Owner. No cambia las 26 decisiones aprobadas.

## 1. Autoridad documental

1. `CLEANOPS_360_PRODUCT_MASTER_V3.md` define producto, alcance y decisiones cerradas; `CLEANOPS_360_SRS_V1_1.md` determina comportamientos exigibles y sus `REQ-*`.
2. `ROADMAP.md` determina orden y dependencias; `DEPENDENCY_GRAPH.md` y `IMPLEMENTATION_GATES.md` impiden activar capacidades sin prerrequisitos.
3. Las especificaciones funcionales del módulo explican jornadas del usuario, reglas, estados y errores. Son referencia de diseño sujeta a validación contra los documentos normativos.
4. `API_SPEC.md`, `TECHNICAL_SPEC.md`, el modelo de datos y las matrices ofrecen **diseños candidatos**; no autorizan rutas, DTO, permisos o componentes por el solo hecho de aparecer escritos.
5. En contradicción: **bloquear la decisión afectada, documentar ubicación de ambas fuentes y solicitar resolución**; nunca elegir por comodidad ni modificar los 26 acuerdos.

## 2. Orden obligatorio por funcionalidad (*vertical slice*)

**Descubrir → diseñar → desarrollar → probar → demostrar → aceptar.** Cada slice debe cerrar una necesidad visible del usuario o un servicio interno estrictamente necesario para otro slice identificado.

1. **Delimitar resultado:** citar REQ exactos, usuario/rol, precondiciones, definición de éxito, exclusiones y dependencias. Registrar la decisión pendiente únicamente si afecta realmente al slice.
2. **Diseñar experiencia:** mapa de navegación, pantallas, formularios, acciones, confirmaciones, empty/loading/error, accesibilidad, responsive y modo offline cuando aplique. Validar el flujo con el PO antes de implementar código costoso.
3. **Diseñar el contrato mínimo:** para las acciones de ese slice, concretar datos, validación, API, estados, autorización y auditoría. Preferir reutilizar entidades y módulos existentes, no inventar capas genéricas.
4. **Construir extremo a extremo:** migración mínima de datos + backend + endpoint/handler + frontend conectado al servidor real; sin crear todo un backend horizontal. Mantener interfaces y API sincronizadas al cambiar un campo.
5. **Probar la realidad:** tests unitarios de reglas, integración de persistencia y permisos, E2E de navegador en staging; incluir un caso exitoso, errores, acceso prohibido, doble envío e impacto en otros módulos. Repetir con roles y tenants distintos si aplica.
6. **Auditar la entrega:** comprobar qué rutas, tablas, botones, jobs y flags se incorporaron; cada uno debe tener consumidor real o justificación de infraestructura, owner y prueba. Retirar código muerto, mocks de aceptación, rutas duplicadas, scripts de prueba accidentales y funcionalidades desconectadas.
7. **Demostrar al PO:** grabar evidencia concreta (capturas o traza, caso ejecutado, datos antes/después, log/auditoría); el PO aprueba o rechaza. No declarar `ACCEPTED` por CI verde únicamente.

## 3. Criterios de bloqueo

Bloquear el slice si: falta un REQ esencial; aparece una contradicción entre fuentes; una regla legal o permiso no validado decide comportamiento sensible; una dependencia no está aceptada; la pantalla carece de integración real; existe persistencia no consumida sin justificación; un fallo de permisos o aislamiento multiempresa; existe un caso E2E crítico fallido; no hay evidencia de ejecución; o se intenta aprobar por anticipado una operación no implementada.

Los parámetros de proveedor (VPS, WAF, residencia, SMTP/IMAP, IA, política de archivos, recuperación) se verifican **antes de usar esa capacidad con datos reales**, según los gates existentes. Los RPO/RTO son objetivos medibles, no promesas implícitas.

## 4. Intervenciones de IA

La IA puede proponer pantallas, soluciones y pruebas, pero **no** cambia reglas GAV/CCT, concede permisos, emite decisiones financieras, renegocia precios ni acepta fases. Las revisiones humanas exigidas por Master/SRS se mantienen.

## 5. Qué debe entregar cada fase

Un único dossier de fase usando `PHASE_ACCEPTANCE_TEMPLATE.md`: alcance REQ→pantallas→acciones→API y entidades→permisos→reglas→pruebas→evidencia→aceptación. Prohibido rellenar un campo con frases tipo «verificar todo»; cada afirmación debe remitir a un artefacto o prueba identificable.

## 6. Ejemplos de dependencias no negociables

- Radar: `ProjectCandidate` no es `Opportunity`; promoción humana hasta nueva regla aprobada.
- Aceptación de oferta: `Offer Accepted` → `Opportunity Won` → `WorkEngagement PENDING`; la creación `CREATED` requiere intervención humana y no prueba firma contractual.
- Planning: no se publica sin capacidades de personal/disponibilidad y reglas laborales aprobadas (`G-EMP`, `G-CMP`).
- Rapport→facturación: no facturar horas disputadas sin habilitación contractual; Pauschal y Regie siguen reglas distintas.
- Offline: los cambios sensibles no se sobrescriben silenciosamente.
- Renovación automática: únicamente cuando la cláusula contractual lo autoriza expresamente.

## 7. Progreso y cierre

Los estados de trabajo son `NOT_STARTED`, `IN_DESIGN`, `IN_DEVELOPMENT`, `IN_VERIFICATION`, `BLOCKED`, `READY_FOR_PO`, `ACCEPTED`. `ACCEPTED` solo tras evidencia ejecutada y validación del PO. Documentos por sí solos tienen estado `DESIGN_ONLY`, nunca `TEST_PASSED`.

