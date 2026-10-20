# Recuperación del dashboard v0 — 2026-10-20

## Autoridad y aislamiento

El propietario ha corregido expresamente la dirección A/B/C y ha autorizado recuperar v0, implementar el mapa y light/dark en una rama nueva. Esta orden habilita solo la evolución frontend de la demo; no acepta módulos de negocio ni levanta la suspensión de entregas backend descrita en docs/implementation/product-demo/DELIVERY.md. REQ-PR-004, UX_UI_SPEC.md y RESPONSIVE_AND_OFFLINE_SPEC.md siguen siendo referencia. B1, closedBackend y AUTH-GATE-05 quedan intactos.

Rama: `feat/demo-v0-map-themes`. Worktree: `/workspace/cleanops-v0-map`. Base segura actual: staging `646c9af496b2497a542ab58d96ae1e7b17b1ee81`. Se preservan `/workspace/cleanops-360` en work/d522e2e y `/workspace/cleanops-design` en chore/codex-design-system/36d3b67. No se cambia rama, índice, caché, proceso, .next ni node_modules de esos worktrees. Se instalan dependencias con ignore-scripts en el worktree nuevo; servidor Next solo sobre loopback, sin Docker, DB, servicios de infraestructura ni despliegue.

## Qué se recuperó realmente

| Fuente encontrada | Evidencia | Decisión |
|---|---|---|
| `b2a3aa0` — v0 | `components/system-status-prototype.tsx` + `app/globals.css` | Origen del prototipo visual, no un módulo real de administración |
| `9f0e7c85913c82b428da70b51d70dd76a95630c7` — v0 | `design: evolve operations command center UI` | Command Center oscuro: sidebar, superficies navy, jade, rail de alertas, jerarquía tipográfica DM Sans/Manrope |
| `246a503802ada6ad0176e4d2d377a5c120a6e02a` — v0 | `design: add real MapLibre command center map` | MapLibre GL 5.13.0, mapa real externo, navegación y marcadores ilustrativos |
| `c053b09964227e56815f9c986f0c1aac835e39bf` — rama `v0/design-system-system-status` | `design: add map layer semantics and selection` | Referencia visual final más completa: capas site/assignment/last-known y panel de selección |
| `38fab2317f8b6e0bc8a8ce609170213dfb54a173` | `chore: remove illustrative command center from admin PR` | Retira componente, estilos y dependencia del PR de administración. Explica por qué el mapa no llegó a la demo actual |
| `feat/administration-system-status` en `6165ac2` | Incluye retirada del prototipo y corrección Tailwind | No es la base visual correcta; tampoco contiene el B1 actual completo |
| `09a1201`, `8026e98` — demo actual | `components/demo/workspace.tsx`, `lib/demo/model.ts`, `app/demo/demo.css` | Se conservan rutas, datos, filtros, escenarios, diálogo y Planning; esta es la base funcional que se evoluciona |
| `36d3b67` — A/B/C | Solo estudios estáticos y tooling | Se descarta como dirección final: son exploraciones nuevas ajenas a la recuperación solicitada. No se copian sus layouts ni se pide elegir una |

Las referencias visuales compartidas anteriormente no aparecen como adjuntos recuperables en este entorno. No se inventa su contenido ni se afirma una aprobación nueva. La evidencia disponible para reconstruir la intención es el historial explícitamente autorado por v0, sus archivos y sus decisiones visibles. Se inspeccionaron ramas, logs, código, documentación y el inventario local disponible; no se afirma haber revisado una captura histórica inexistente.

## Qué estaba pendiente del mapa

El mapa no era una idea sin código: existía en el prototipo v0, pero estaba aislado de los servicios de la demo y se retiró del trabajo de administración. Sus seis marcadores incluían supuestas últimas posiciones de trabajadores, datos y organizaciones distintos del escenario actual, tiles externos y afirmaciones ficticias sobre autenticación/salud. No se restaura ese conjunto como si fuese producción.

El pendiente resuelto ahora es conectar mapa, estados y ficha a los mismos servicios que agenda/Planning; cubrir filtros, selección, teclado, responsive y temas; ejecutar bajo la CSP real sin permitir nuevos dominios, blob workers ni acceso a APIs privadas. No se modifican proxy.ts ni security headers.

## Base conservada y evolución

Se recuperan navy `#09111d`/`#101b2a`, jade `#43d1a5`, datos con ámbar y azul semánticos, sidebar compacta, barras y paneles del lenguaje v0, iconos Lucide y las familias originales DM Sans/Manrope (woff2 locales con OFL). Se conserva la identificación CleanOps 360/C° que ya utiliza la demo; no se sustituye la marca por el monograma alternativo del prototipo ni se inventan nuevos módulos.

Se conservan las cinco rutas existentes, los escenarios Léman/Alpes, el formulario de filtros y todos los accesos a ficha. La agenda sigue accesible; sus avisos y el mapa usan jobIssues del mismo modelo. El mapa se coloca en la zona principal del dashboard junto a la revisión de servicios. La navegación mantiene URLs reales, sin enlaces ficticios a incidentes, rutas o system health. No se añade ninguna afirmación de backend operativo.

## Implementación del mapa

`components/demo/operations-map.tsx`: componente cliente cargado dinámicamente solo en dashboard; MapLibre importado aparte. Pan, zoom, recentrado, periodo lunes/semana, filtro de incidencias, marcadores numerados, título al hover/foco, selección y ficha nativa existente. Alternativa textual seleccionable debajo del mapa y fallback explícito si falta WebGL/cartografía. Al cambiar escenario se reinicia el contexto del mapa para no mezclar empresas ni ubicaciones. Seleccionar no reconstruye marcadores ni pierde el foco. Tema modifica paint properties sin reiniciar mapa/cámara.

`lib/demo/map-model.ts`: proyección de los Job existentes a ubicaciones deliberadamente ficticias alrededor de la ciudad de la empresa. No hay endpoint, seed, migración, geocoding, ruta real ni posición personal. El dataset no se usa para permisos. Dos estados: requiere revisión según jobIssues o sin incidencias detectadas en el ejemplo; no equivale a aprobación laboral.

Cartografía local Natural Earth: países vecinos y Suiza + Lac Léman; GeoJSON reducido de 54,5KB y datos públicos. Es mapa geográfico generalizado, no callejero ni navegación. Se sirven worker ESM y fuentes desde el propio origen; no peticiones a tiles/CDN en runtime. Esto permite conservar connect-src 'self', nonces y el resto de B1.

La versión 5.13.0 heredada de v0 fue rechazada durante la revisión por GHSA-jrc7-96c5-q579 (XSS en sanitización). Se restauró la misma biblioteca en **6.15.0**, con instalación sin lifecycle scripts y worker/local assets de esa versión. npm audit final: cero advisories conocidos. Marcadores construidos con createElement/textContent, sin insertar contenido con innerHTML. El proveedor es una dependencia de WebGL con coste real: se aísla en un chunk dinámico; no se carga en directorios como requisito del componente de mapa.

## Light/dark

`app/demo/themes.css`: tokens semánticos de superficie, texto, borde, foco, jade/acción, aviso, información y contraste de acción. `app/demo/demo.css` conserva selectores y disposición existentes, sustituyendo colores literales por tokens; no hay estilos globales fuera de `.demo-*`. Mismos componentes y contenido en ambos modos. El estado del tema está en DemoScenarioProvider: cambia con botón accesible y se conserva al navegar entre rutas demo. Modo inicial oscuro como v0; al recargar vuelve a oscuro. No cookies, localStorage ni preferencias autenticadas. La persistencia y el seguimiento automático de preferencias OS quedan fuera de este incremento.

## Límites explícitos

- Demo sintética UI IMPLEMENTED; no módulo operativo ni aceptación B1. Planning sigue sin publicar.
- Coordenadas ficticias de servicios/obras, no GPS ni seguimiento de personas. Sin direcciones de clientes reales.
- Cartografía regional generalizada, sin calles, routing, tráfico, búsqueda geográfica ni cobertura mundial.
- La lista mantiene acceso si WebGL falla; no se afirma equivalencia de toda la interacción espacial con lectores de pantalla.
- Light/dark preparados para cinco vistas demo; no se aplica tema a login/MFA/administración.
- Capturas y pruebas contra build local de esta rama; staging publicado permanece sin modificar.
