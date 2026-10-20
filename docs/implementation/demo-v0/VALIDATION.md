> Registro histórico de 827f751. Estado actualizado: [CLOSURE.md](CLOSURE.md).

# Validación del incremento v0 / mapa / temas

Fecha: 2026-10-20. Base: `646c9af496b2497a542ab58d96ae1e7b17b1ee81`. Rama `feat/demo-v0-map-themes`. Los hashes de los archivos probados están en [tested-source-sha256.json](evidence/tested-source-sha256.json), junto al BUILD_ID en [boundary-and-validation.json](evidence/boundary-and-validation.json).

## Resultado ejecutado

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `npm run lint` | Exit 0, 0 errores; 1 warning preexistente en auth-panel:66 (endCeremony). No se modifica B1 para silenciarlo | [lint.txt](evidence/lint.txt) |
| `npm run typecheck` | Exit 0 | [typecheck.txt](evidence/typecheck.txt) |
| `npm run build` | Exit 0, build Next 16.4 real con rutas actuales | [build.txt](evidence/build.txt) |
| `npx --no-install vitest run tests/demo-map.test.ts` | 2/2 PASS: identidad de servicios, incidencias, separación de escenarios y coordenadas ficticias | [unit.txt](evidence/unit.txt) |
| `CLEANOPS_DEMO_URL=http://127.0.0.1:3108 npx --no-install playwright test --config playwright.demo-v0.config.ts` | 18/18 PASS, 0 skipped, 0 flaky. Incluye los 9 casos demo existentes y 9 nuevos casos de mapa/temas/fallback | [browser.txt](evidence/browser.txt), [reporte original JSON](evidence/browser-results.json) |
| axe 4.11.0 + Chromium | Cinco rutas × ambos temas = 10 checks sin violaciones detectadas bajo tags WCAG 2 A/AA, 2.1 A/AA y 2.2 AA. `incomplete` retenidos para revisión manual | [accessibility.json](evidence/accessibility.json) |
| npm audit | Cero advisories conocidos en el lock final | [npm-audit.json](evidence/npm-audit.json) |
| Seguridad/aislamiento | Sin diff en B1, proxy, CSP, auth routes, CI, deploy ni AGENTS raíz; checkout original limpio y rama de preparación intacta | [boundary-and-validation.json](evidence/boundary-and-validation.json) |
| Assets locales | Worker/módulo MapLibre coinciden byte a byte con paquete fijado; SHA-256, tamaños, fuentes y licencias preservados | [assets.json](evidence/assets.json), `public/demo-map/NOTICE.md`, `public/demo-fonts/NOTICE.md` |

No se ejecutaron PostgreSQL, migraciones, seeds, tests B1, OpenBao ni servicios de infraestructura. Instalación npm con `--ignore-scripts`; no se ejecutó prepare/codegen del proveedor ni lifecycle de dependencias existentes. Los paquetes previos del baseline no cambian de versión; se añade MapLibre y su árbol de dependencias. Se recuperó el motor original con versión segura; no se incorporó un framework frontend.

## Lo probado en navegador

- Mapa WebGL visible y marcadores reales DOM en la cartografía local; headers conservan `connect-src 'self'` y nonces.
- Lunes 3 servicios; semana 7; filtro de revisión 3 en Léman. En Alpes se conserva la identidad de empresas y solo 1 servicio requiere revisión.
- Seleccionar marcador con Enter mantiene el foco y aria-pressed, muestra panel y abre ficha real de demo. Escape devuelve foco al disparador de la ficha.
- Acercar, alejar y recentrar; navegación existente, búsquedas, filtros, vacíos, escenarios, Planning con publicación deshabilitada y 404 para rutas no implementadas.
- Modo oscuro/claro a 1440×1000, 834×1112 y 390×844. Regresión adicional existente a 390/768/1440. Sin overflow del documento en esos recorridos.
- Misma estructura en ambos temas; preferencia en memoria compartida entre rutas, sin cookies ni storage local/session.
- En el recorrido de mapa normal: cero errores de consola/pageerror, cero peticiones a APIs privadas y cero peticiones a origen externo.
- Fallback sin WebGL: mensaje explícito, controles de zoom deshabilitados y selección/ficha mediante la lista conservadas. El fallo gráfico inducido solo afecta al contexto de prueba, no a B1.

## Capturas del resultado local

| Vista | Oscuro | Claro |
|---|---|---|
| Escritorio | [Ver](evidence/dashboard-dark-desktop.png) | [Ver](evidence/dashboard-light-desktop.png) |
| Tablet | [Ver](evidence/dashboard-dark-tablet.png) | [Ver](evidence/dashboard-light-tablet.png) |
| Móvil | [Ver](evidence/dashboard-dark-mobile.png) | [Ver](evidence/dashboard-light-mobile.png) |

[Selección de servicio y panel](evidence/map-selected-dark.png). Todas muestran fixtures ficticios; no personas/clientes reales. Se inspeccionaron visualmente capturas de ambos temas y responsive. No son imágenes generadas ni screenshots de staging después de un despliegue.

## Rendimiento y coste

MapLibre se importa dinámicamente en el componente de dashboard. [resources.json](evidence/resources.json) registra recursos observados en contextos nuevos de `/demo` y `/demo/empresas`, distinguiendo decodedBytes y transferBytes. El directorio no inicia worker ni descarga GeoJSON del mapa. Las fuentes variables locales suman aproximadamente 62KB y el GeoJSON 54,5KB. El worker requiere aproximadamente 507KB sin compresión: es un coste real del motor cartográfico recuperado, no se presenta como coste cero ni como mejora de Core Web Vitals. El despliegue no se ha modificado para ajustar compresión/cache.

## Fallos y correcciones antes del resultado final

La versión histórica 5.13.0 dio un advisory crítico y fue sustituida por 6.15.0 antes de publicar. La primera integración usó el nombre de distribución CSP anterior a la versión 6; se adaptó a ESM y assets del mismo paquete. Se corrigieron formato de fuentes y dimensiones CSS del canvas tras inspección real. Los tipos del fixture `reducedMotion` y del mock de canvas se corrigieron antes de build final. El primer lint detectó código minificado vendorizado: se excluyeron exclusivamente los dos módulos inmutables del proveedor, manteniendo reglas para todo código propio. Sus hashes se validan contra el paquete.

Una ejecución intermedia pasó 16 casos y falló uno por el favicon ausente, no por una llamada privada: [resumen FAIL retenido](evidence/browser-initial-summary.json). Se añadió icono de demo a sus metadatos y la ejecución final pasó los 18 casos (incluyendo el nuevo fallback). No se relabelan ejecuciones fallidas como PASS. Las primeras pruebas durante recarga del servidor no son la evidencia final; el reporte final corresponde al build y hashes indicados.

## Límites de la evidencia

Se usa Chromium Linux con WebGL por software (SwiftShader) en el entorno, no una GPU o dispositivo físico. No se ejecutaron Firefox/WebKit, lector de pantalla, gestos táctiles físicos, batería, redes lentas ni pruebas de miles de servicios. Axe sin violaciones no certifica WCAG 2.2 AA completo. No se aceptan módulos reales ni B1 por estas pruebas. No hay routing, GPS, geocodificación o cartografía callejera; las ubicaciones siguen siendo ficticias. El tema no persiste al recargar y no cambia pantallas B1. La demostración permanece solo en rama, sin despliegue ni merge.

## Reproducción

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm run build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3108
# En otra terminal, sin iniciar B1/DB:
CLEANOPS_DEMO_URL=http://127.0.0.1:3108 npx --no-install playwright test --config playwright.demo-v0.config.ts
npx --no-install vitest run tests/demo-map.test.ts
# Opcional, con Playwright Python y fuente axe revisada disponibles:
python scripts/audit-demo-v0.py --axe /ruta/a/axe.min.js --url http://127.0.0.1:3108
```

La configuración acepta CLEANOPS_CHROMIUM_PATH; en este entorno usa `/usr/bin/chromium`. No se fuerza descarga de navegadores ni se abre servidor público. No se creó PR automático porque quality.yml ante PR inicia PostgreSQL y el pipeline general; se entrega la rama publicada para revisión sin activar trabajo DB ajeno al alcance. No se modifica CI para evitar sus gates.
