# Cierre técnico de la demo v0 — 20 octubre 2026

**Implementado y probado localmente. Pendiente de revisión del propietario y publicación online autorizada.**

Rama: `feat/demo-v0-map-themes`, worktree `/workspace/cleanops-v0-map`, base `827f75168434c8d630a5bf81aae7ea36d92c1127`. Se conserva la dirección v0 `c053b09`, navy/jade, navegación, estructura y fuente sintética existentes. Este informe actualiza el estado histórico de VALIDATION.md.

## Defectos y regresiones

| Causa | Corrección | Evidencia final |
|---|---|---|
| Tema solo en memoria; recarga siempre oscura | Única clave no sensible `cleanops.demo.theme`, sin cookies; preferencia del sistema si no hay elección; cambios del sistema, navegación y recarga; fallback si storage está bloqueado | Pruebas de persistencia, sistema y almacenamiento bloqueado |
| Tema inicial dependía de hidratación | Bootstrap local de demo con nonce CSP existente, antes del contenido; variables limitadas al contenedor demo | Test con chunks JS bloqueados verifica tema claro antes de hidratación |
| Filtros borraban selecciones válidas | Mantener selección visible y limpiar la que queda oculta; filtros por cuatro tipos existentes; restablecimiento y estado vacío | Test de combinación, selección y reset; unitarios del modelo |
| Marcadores creados asíncronamente perdían aria-pressed si ya había selección | Inicialización desde referencia actual y actualización posterior; selección elevada sobre marcadores próximos | Tests de sincronización/lista y selección de los siete servicios |
| Agenda podía seleccionar un servicio oculto en mapa | Ajustar contexto del mapa a semana/todos cuando llega esa selección externa | Test agenda → ficha → selección visible |
| Detalle del mapa no cerraba con Escape ni restauraba foco | Escape y botón de cierre devuelven foco al disparador; ficha existente conserva cierre nativo | Tests de teclado y foco |
| Menú móvil no trasladaba ni recuperaba foco | Foco en navegación al abrir y retorno al botón mediante Escape | Test móvil de teclado |

No se introdujeron dependencias. No se modificaron B1, closedBackend, APIs, DB, gates, staging, main, AutoDeploy ni infraestructura. Comparación reproducible en `closure-evidence/isolation.json`.

## Pruebas ejecutadas

- Lint: **PASS**, cero errores; una advertencia preexistente en `components/auth-panel.tsx:66`, no modificada.
- Typecheck y build de producción: **PASS**.
- Modelo del mapa: **3/3 PASS**. Gateway: **2/2 PASS**, incluyendo denegación de destinos absolutos/traversal, rutas privadas, escrituras, cookies y autorización hacia upstream.
- Navegador Chromium real con WebGL software: **25/25 PASS** en suite completa; **1/1 PASS** adicional de emulación táctil y objetivos de controles ≥24 px. Reportes y comandos conservados.
- Cinco rutas demo, fichas, búsquedas, navegación, indicadores, siete servicios, dos escenarios, filtros, vacío, fallback sin WebGL, zoom real y desplazamiento real, selección, cierre y foco.
- Escritorio 1440×1000; tablet 834×1112; móvil 390×844; navegación/cinco rutas sin overflow también a 768 y 1440; horizontal 844×390. Se inspeccionaron capturas de escritorio oscuro y móvil claro con detalle. No equivale a dispositivos físicos.
- Axe 4.11: **10 comprobaciones, cero infracciones detectadas y cero errores JS/consola** (cinco rutas × dos temas). Existen resultados `incomplete` de contraste sobre cartografía y atributos ARIA que requieren revisión manual; ver JSON. Las pruebas de teclado/foco y alternativa textual complementan axe. **No se certifica WCAG 2.2 AA completa**; lectores de pantalla, zoom del SO, alto contraste y gestos en dispositivos físicos quedan pendientes.
- Sin peticiones privadas/externas en el recorrido de mapa probado. Preview autenticada: sin cookies de aplicación, errores JS ni recursos fallidos. `npm audit`: cero vulnerabilidades notificadas; no sustituye un escaneo OS de imágenes.

Los fallos iniciales de tests se conservan en `browser-initial.txt`: selector Planning incorrecto, texto anterior del aviso y aserción de cámara limitada al eje X. Se corrigieron las pruebas; el límite territorial permite desplazamiento vertical en la vista general. El zoom con rueda permanece desactivado para conservar el scroll de página; existen controles de zoom y alternativa textual para todas las operaciones.

## Preview preparada y validada localmente

Archivos y procedimiento: [deploy/demo-preview/README.md](../../../deploy/demo-preview/README.md).

Se construyeron imágenes Node 24.19 con scripts npm desactivados; base fijada al digest resuelto en la construcción. Next arrancó como usuario no root, sin red, solo lectura y memoria limitada; `/demo` devolvió 200. Se probó además el Compose completo con imágenes locales de QA, red interna para app y red de entrada propia para gateway, puerto **solo loopback** y contraseña sintética efímera fuera de Git.

Resultado real del gateway+Next+browser: 401 anónimo, 200 autenticado, 404 en login/API, 405 en POST; tres marcadores, persistencia del tema, navegación a empresas y cero cookies/errores. La prueba detectó y corrigió un listado YAML incorrecto de tmpfs y la necesidad de red de entrada exclusiva del gateway para publicar en loopback. Todos los contenedores/redes de esta prueba se retiran al terminar; el secreto temporal se elimina.

**No existe preview online ni URL publicada.** No hay acceso conectado a Dokploy, VPS o DNS. Sites utiliza otro runtime y requeriría adaptar el servidor Next; no se migra el producto para la preview. El dominio propuesto no está validado/configurado.

Pendiente concreto: operador con acceso revisa capacidad, dominio/TLS y enlace de ingress de Dokploy; propietario autoriza aplicación independiente según README. No debe apuntarse al contenedor Next directamente, copiar variables de staging ni conectarlo a redes de DB. Escaneo de imagen y comprobación externa TLS/401 preceden a la entrega de URL. No se abre PR que dispare el workflow Quality con PostgreSQL/migraciones fuera de este alcance; se publica la rama para revisión.

## Evidencias y reproducción

Capturas reales en `closure-evidence/`: escritorio/tablet/móvil claros y oscuros, mapa seleccionado, filtro semanal, vacío y panel móvil con lista textual. `browser-results.json`, `browser-final.txt`, `touch.txt`, `accessibility.json`, `compose-runtime.json`, logs de construcción y manifest de hashes distinguen los resultados ejecutados.

```sh
npm run lint
npm run typecheck
npm run build
npx --no-install vitest run tests/demo-map.test.ts
node --test tests/demo-preview.test.mjs
npm run start -- -H 127.0.0.1 -p 3107
# En otra terminal, después de arrancar el servidor:
npx --no-install playwright test -c playwright.demo-v0.config.ts
python scripts/audit-demo-v0.py --axe /ruta/revisada/axe.min.js --url http://127.0.0.1:3107
python scripts/check-demo-preview-browser.py
# Para un Compose local ya arrancado con contraseña sintética externa:
python scripts/check-demo-preview-browser.py --url http://127.0.0.1:3187 --password-file /ruta/externa/preview_password
```

**Pendiente de validación del usuario:** uso real de dashboard/mapa, prioridades de ajustes y aprobación posterior de integración. No hay aceptación funcional ni merge implícitos.
