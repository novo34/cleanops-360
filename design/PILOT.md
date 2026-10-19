# Piloto recomendado — pendiente de aprobación

Pantalla existente: **`/demo` (Dashboard)**. Dirección recomendada **A — Registro suizo**. Estado `READY_FOR_PO` para decisión de diseño, no aceptación funcional. Fuente base `646c9af496b2497a542ab58d96ae1e7b17b1ee81`; confirmar de nuevo HEAD antes de implementar.

## Por qué esta pantalla

Datos locales sintéticos; no solicita auth ni APIs privadas; permite probar jerarquía, ritmo, filas de agenda, avisos y responsive sin nuevos contratos. No se elige login ni pantalla B1. Planning implica comparación temporal y mayor riesgo: no es el primer piloto.

Estado antes: [desktop](evidence/before-dashboard-desktop.png), [tablet](evidence/before-dashboard-tablet.png), [móvil](evidence/before-dashboard-mobile.png). Evidencias medibles en AUDIT.md: contraste, texto pequeño y prioridades móviles. Propuesta visual: [A HTML](studies/a-ledger.html), [desktop](studies/a-ledger-desktop.png), [móvil](studies/a-ledger-mobile.png). La ilustración del shell y la redacción editorial de los estudios NO autorizan cambios de navegación ni de copy funcional por sí solas.

## Alcance que se solicita aprobar

Solo contenido de dashboard: composición de métricas, agenda de lunes, avisos, equipo y resumen comercial. Conservar shell, rutas, nombres funcionales y datos; no integrar todavía top-nav alternativa del estudio. Aumentar legibilidad y colocar resumen de excepciones antes de agenda en móvil sin alterar orden de foco; advertencia junto al servicio. CSS acotado al dashboard y cambio mínimo de presentación. Ningún cambio en modelos, jobIssues, permisos o backend.

Dependencias inspeccionadas: `app/demo/[[...section]]/page.tsx` → `DemoWorkspace` y `DemoScenarioProvider` → `lib/demo/model.ts`; CSS `app/demo/demo.css`; `next/link`; lucide-react; diálogo nativo, estados query/filter/help/mobileNav/detail. `lib/b1/runtime.ts` sigue conectado a closedBackend y no entra en este recorrido.

Pruebas existentes leídas: `e2e/demo-workspace.spec.ts` cubre navegación, búsqueda, escenarios, teclado, fichas y límite frente a APIs/cookies/storage. `playwright.config.ts` tiene Chromium/Firefox/WebKit. Esas suites NO se ejecutaron en este encargo; sí se ejecutaron los scripts específicos de evidencia, axe e interacción. Antes de implementar, verificar sus expectativas y ejecutar solo tests demo con recursos propios.

## Aceptación verificable del futuro piloto

1. Mismos escenarios y datos: lunes 3 servicios, 4 disponibles, 2 ausencias/formación, 3 servicios que requieren revisión en Léman. Cambiar a Alpes actualiza contenido sin mezcla; recargar restablece escenario como hoy.
2. Abrir ficha desde agenda/aviso/equipo, cerrar por Escape/botón y devolver foco. Mantener todos los links/rutas y accesibilidad del diálogo. Sin nuevas llamadas privadas, cookies ni storage persistente de demo.
3. 1440×1000, 834×1112 y 390×844 sin overflow del documento; ampliar 320/375/430/1024/1920 y zoom. Datos decisivos y resumen de riesgo visibles pronto, sin ocultar servicios para maquillar una captura.
4. Contraste normal ≥4,5:1 y grande ≥3:1 en parejas efectivamente usadas; axe sin nuevos critical/serious, hallazgos previos del dashboard corregidos o limitación explícita aprobada. Teclado, lector de pantalla, foco no oculto, target y texto ampliado con revisión manual. No declaración global AA por automatización.
5. Ninguna regresión en empresas/clientes/empleados/planning por estilos compartidos; comparar capturas mismas rutas/datos/anchos y ejecutar tests demo. B1 no se ejecuta ni modifica para facilitarlo.
6. Sin dependencia visual nueva. Medir delta del bundle y comportamiento de carga si llega a cambiar JS; sin animaciones que retrasen trabajo. Reduced motion verificado, sin secuencias decorativas.
7. Evidencia antes/después, comandos/resultados y defectos preexistentes separados. Diff de aplicación limitado al piloto, con pruebas y estilos acotados; revisión del propietario antes de cualquier integración.

## Riesgos y salida

CSS compartido y componente monolítico: limitar selectores y revisar cinco vistas tras el cambio. Contraste de shell queda fuera del alcance inicial si precisa tocar otras rutas; proponer corrección independiente, no ocultar hallazgos. Estado de staging puede evolucionar con B1: volver a inspeccionar antes de programar sin rebase/merge automático. Ningún resultado del piloto acepta B1 ni cierra AUTH-GATE-05.

Esfuerzo A orientativo 1–3 días más revisión del propietario. No comenzar otro módulo hasta completar este. Publicación futura solo en rama diseño; no integración con staging, AutoDeploy ni despliegue.

**Decisión necesaria: aprobar A, B o C y confirmar `/demo` con este alcance. Todavía no hay aprobación ni rediseño implementado.**
