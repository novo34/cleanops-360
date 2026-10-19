# Auditoría UI/UX observada

Fecha 2026-10-19 UTC. Staging público sintético, sin autenticación, en Chromium real. Cinco rutas × 1440×1000 / 834×1112 / 390×844. No es auditoría completa de todos los módulos ni aceptación WCAG/B1. Los scripts no cambiaron la aplicación.

## Evidencia

[Mediciones DOM](evidence/demo-measurements.json), [axe e interacciones](evidence/interaction-a11y.json), [snapshot MCP](evidence/mcp-smoke.json). Capturas antes: [dashboard escritorio](evidence/before-dashboard-desktop.png), [dashboard móvil](evidence/before-dashboard-mobile.png), [planning tablet](evidence/before-planning-tablet.png), [directorio](evidence/before-empresas-desktop.png), [equipo móvil](evidence/before-empleados-mobile.png). Las otras diez capturas de rutas iniciales están en evidence/. Además se capturaron [diálogo](evidence/company-dialog-desktop.png), [vacío](evidence/empty-search-desktop.png) y [navegación móvil](evidence/mobile-navigation-after-escape.png).

15 navegaciones: HTTP 200; cero errores pageerror observados; ningún overflow del documento en los tres tamaños; cookiesCount 0. El guard bloquea rutas ajenas a demo/static, de modo que esto verifica comportamiento bajo el guard, no un análisis irrestricto de todas las peticiones de staging. Los datos visibles coinciden con `lib/demo/model.ts` de la base inspeccionada; no se ha acreditado el SHA desplegado mediante endpoint de versión protegido.

## Inventario verificado

| Superficie | Estado real observado | Fuente y límite |
|---|---|---|
| Dashboard `/demo` | Demostrativo interactivo | 3 servicios lunes, KPIs, avisos, equipo y resumen comercial/financiero ficticios; abre fichas |
| Empresas `/demo/empresas` | Demostrativo interactivo | 3 registros, búsqueda/filtro, ficha modal, vacío y reset |
| Clientes `/demo/clientes` | Demostrativo interactivo | 2 clientes del MISMO dataset; no otro CRM implementado |
| Empleados `/demo/empleados` | Demostrativo interactivo | 6 personas, búsqueda, estados/competencias y fichas |
| Planning `/demo/planning` | Demostrativo; publicación deshabilitada | 7 propuestas semanales sintéticas, cobertura/solapamiento de fixture; no validación laboral real |
| Sidebar/topbar | Implementadas en demo | Rutas, cambio Léman/Alpes, ayuda, navegación móvil; no selector tenant autenticado |
| Formularios | Búsquedas/selects demo implementados | No CRUD de negocio en demo; no confundir filtros con formularios integrados |
| Modales | Fichas de solo lectura | Diálogo nativo, Enter/Escape/retorno de foco comprobados en empresa |
| Tablas de negocio masivas | No observadas | Empresas es lista de botones, empleados tarjetas; no tabla paginada/sort/selección acreditada |
| Gráficos | No observados como visualización analítica interactiva | Cifras/resumen financiero demostrativos; no motor analítico probado |
| Loading/error/toasts | No recorridos de servidor acreditados en demo | Datos locales inmediatos; falta de loading no se registra como regresión funcional |
| Login/MFA/Manage Access/System Status | Código presente, integración parcial/gated | `components/auth-panel.tsx`, `manage-access-panel.tsx`, `admin-system-status.tsx`, rutas app/login, mfa, me y API. No navegados ni rediseñados; no se certifica funcionamiento real |
| Radar, Inbox, ofertas, facturas, rapports y otros | Documentados; sin pantallas observadas en este alcance | Documentación no acredita implementación. No se crean incidencias por no existir en demo |

## Hallazgos priorizados

Complejidad S ≈ 0,5–1 día, M ≈ 1–3 días, L ≈ 3–5+ días de trabajo/revisión, estimaciones orientativas que incluyen pruebas y no comprometen B1. Impacto se refiere a experiencia demo y patrón futuro.

| ID / prioridad | Problema y evidencia verificable | Mejora propuesta | Complejidad / impacto |
|---|---|---|---|
| UI-01 / P1 | Contraste insuficiente medido por axe en las 15 combinaciones ruta/tamaño. Descripción de página `#6b796d` sobre `#f5f6f1`: 4,22:1; hora secundaria `#6c7c6b` sobre blanco: 4,43:1; nombre de empresa en planning ≈4,12–4,16:1 en superficies tintadas. [JSON](evidence/interaction-a11y.json) incluye selectores y failureSummary | Corregir tokens semánticos texto/superficie con ≥4,5:1 para texto normal; revisar cada combinación y estados. No basta oscurecer un único --muted: hay overrides de colores | S–M / alto; patrón compartido necesita alcance aprobado |
| UI-02 / P2 | Dashboard móvil: tipografía secundaria 9–11px; por ejemplo nombre/rol de equipo y horarios. Captura y DOM en before-dashboard-mobile + measurements | Texto operativo 14px base, metadatos normalmente ≥12px; no usar 9px para datos decisivos. WCAG no establece un mínimo universal de px: este es hallazgo de usabilidad, no fallo normativo deducido por tamaño | S / alto para móvil |
| UI-03 / P2 | En 390×844 los avisos de cobertura están después de cuatro tarjetas KPI y de toda la agenda; el panel queda por debajo del primer viewport. [Captura](evidence/before-dashboard-mobile.png) | Resumen de excepciones al principio y advertencias textuales junto al servicio; conservar detalle y no esconder el resto | M / alto para coordinación |
| UI-04 / P2 | A 834px Planning pasa de semana horizontal a dos columnas y viernes a ancho completo; móvil apila cinco días. Dificulta comparación entre días, sin overflow. [Tablet](evidence/before-planning-tablet.png) | Más adelante, vista lista/día explícita y navegación de días; evitar llamar a la rejilla apilada una comparación semanal equivalente. No implementar nuevo motor | M–L / alto para planning, fuera del piloto |
| UI-05 / P2 | Desktop 1440×1000: equipo y finanzas aparecen casi enteros bajo el primer viewport, mientras sidebar dedica gran altura al bloque promocional. [Desktop](evidence/before-dashboard-desktop.png) | Densidad selectiva: resumen tipográfico, agenda y excepciones primero; retirar peso promocional de un producto Operate solo cuando se apruebe el shell | M / medio-alto |
| UI-06 / P3 | Enlaces Ver semana/Ver equipo miden ~18px de alto, frente a botones principales grandes. Se debe analizar espaciado/excepciones de WCAG 2.5.8, no declarar automáticamente incumplimiento | Objetivo táctil de 44px donde sea viable, mínimo 24px o excepciones justificadas; no tratar skip-link oculto 1×1 como defecto, porque se muestra al foco | S / medio |
| UI-07 / P3 | El menú móvil sigue abierto al pulsar Escape (`mobileMenuEscapeCloses: false`). Es navegación expandida no modal; no se prueba incumplimiento WCAG por eso solo | Hacer cierre Escape y foco al disparador si se aprueba patrón; decidir explícitamente si panel no modal o drawer modal antes de imponer focus trap | S / medio |
| UI-08 / P2 | `components/demo/workspace.tsx` reúne shell, cinco vistas, filtros, fichas y métricas; CSS demo ~28KB con tokens y múltiples overrides. Riesgo de estilos cruzados por edición global | Aislar primer cambio a DashboardOverview y clase específica; extraer solo cuando esté justificado. No reescribir cinco vistas ni introducir framework | M / medio, evita regresión futura |
| UI-09 / P3 | Métricas con 03/04, cuatro cajas iguales y texto promocional compiten con tarea; apreciación visual, no error de cálculo | Números naturales 3/4 y jerarquía de excepciones; aprobado en propuesta estática, aún no en producto | S / medio |

No se detectó un P0 dentro de los recorridos observados; esto no demuestra ausencia de fallos críticos fuera del alcance. No se registran como defectos visuales los módulos sin backend ni la publicación intencionadamente bloqueada de Planning.

## Qué funcionó y qué falta

Se vieron identidad verde consistente, nombres sintéticos explícitos, navegación clara, skip link, foco visible, filtros con nombre accesible, empty state accionable y diálogos nativos. Búsqueda → 1 resultado → Enter → ficha → Escape → foco original y búsqueda vacía → limpiar se ejecutaron realmente. `localStorage`/`sessionStorage` observados vacíos y sin cookies al final del recorrido de interacciones.

Axe 4.11.0 se ejecutó con wcag2a/aa, wcag21a/aa y wcag22aa. Solo detectó la categoría color-contrast en esta muestra; `incomplete` conserva controles que requieren revisión. NO se declara cumplimiento WCAG 2.2 AA. Pendientes: lector de pantalla, zoom/reflow, 320px, espaciado de texto, contraste no textual y foco no oculto en todos los estados, tacto físico, Firefox/Safari y grandes volúmenes de datos. No hay mediciones de Core Web Vitals ni comparación de rendimiento antes/después, porque aún no hay cambio de aplicación.
