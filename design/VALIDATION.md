# Evidencias ejecutadas y límites

Fecha 2026-10-19. Ver base y aislamiento en README.md. No se ejecutó rediseño, migración, seed, creación de usuario, merge ni despliegue.

| Comprobación | Resultado observado | Evidencia |
|---|---|---|
| Git inicial/remoto/worktree | Original limpio en work; staging 646c9af; rama diseño creada desde ese SHA sin cambiar checkout original | README + comprobación final git-boundary.json |
| Investigación oficial | Cuatro clones separados, SHA y fecha fijados; licencias revisadas; sin scripts remotos vía shell | upstream-pins.json, COMPATIBILITY.md |
| npm MCP | 0.0.83 y dependencias exactas; install con ignore-scripts; cero advisories conocidos | tooling/mcp/package-lock.json, evidence/mcp-npm-audit.json |
| MCP real | initialize, tools/list (25), navegación, snapshot, consola 0 errores y cierre | evidence/mcp-smoke.json; script check_mcp.py |
| Descubrimiento Codex | PENDIENTE; arranque app-server falla al crear installation_id bajo home gestionado de solo lectura. Config de proyecto requiere confianza del cliente | evidence/codex-skills.json; no se declara integración de catálogo completada |
| Demo real | 15 respuestas 200, 15 capturas, sin overflow ni pageerror en los tamaños medidos | evidence/demo-measurements.json + before-*.png |
| Interacciones | Búsqueda, resultado único, abrir con Enter, Escape y foco, vacío/reset comprobados. Navegación móvil no cierra con Escape | evidence/interaction-a11y.json + tres capturas de estados |
| Accesibilidad automática | axe-core 4.11.0, 15 combinaciones ruta/tamaño; 140 nodos señalados en total (incluye repeticiones entre tamaños), categoría color-contrast. No se declara WCAG PASS | evidence/interaction-a11y.json; incomplete retenidos |
| Privacidad de demo | 0 cookies y storage local/session vacío al final; ninguna petición bloqueada en recorrido de interacción observado | mismo JSON; no es auditoría de todos los endpoints |
| Estudios estáticos | 3 HTML independientes, 9 capturas desktop/tablet/móvil; sin overflow y un h1 en cada estudio/tamaño | evidence/study-validation.json + studies/*.png |
| Referencias | Lectura web primaria de Carbon/Linear/Grafana; Chromium para Swisscom SDX y Vitsœ. Captura inicial Linear incompleta, SBB 403 | evidence/reference-browser.json, reference-access.json |
| Verificación estática | Compilación sintáctica de Python, node --check en guard MCP, TOML/JSON parseables, enlaces locales y límites del diff | evidence/static-validation.json |

Fallos iniciales conservados en este relato: proxy inaccesible antes de habilitación de red; fetch sin ref origin/staging; Chromium ERR_CERT_AUTHORITY_INVALID antes de confianza SPKI acotada; MCP sin XDG_CACHE_HOME intentó escribir cache fuera del runtime; primer init-page CommonJS no exponía default esperado; captura file:// bloqueada por política y sustituida por set_content de HTML propio; syntax error temporal de guard Python corregido antes de validación final. Ninguno se presenta como prueba exitosa; el smoke final y la validación final corresponden al código corregido.

No se ejecutaron lint/typecheck/build ni suites completas del producto: no se cambia aplicación, TS/TSX, paquetes principales ni configuración de CI. Se evitó levantar servicios B1 o Next y competir por recursos. Node verifica el único módulo JS nuevo; las dependencias de herramientas están fuera de las del producto. Los tests Playwright Test existentes se leyeron, no se reportan como ejecutados.

Revisión humana pendiente: dirección artística, lector de pantalla, zoom/reflow y tacto físico; control de contraste completo y estados dinámicos; Firefox/WebKit; rendimiento a gran escala. Los estudios estáticos no validan funcionalidad ni sustituyen pruebas del futuro piloto.

Publicación: solo refs/heads/chore/codex-design-system. No PR automático: quality.yml abre PostgreSQL y ejecuta pipeline general ante cualquier PR; mantener esta preparación como rama para revisión evita lanzar trabajo de DB ajeno al alcance. No se modifica ese workflow. La apertura de PR con su CI se revisará cuando proceda, sin aceptar fases por ese hecho.

La comprobación de whitespace de archivos propios pasa. Algunas referencias originales de Impeccable conservan whitespace del upstream (extract/harden/optimize); se excluyeron únicamente esas referencias de este check para preservar el material íntegro, no se afirma PASS del check global sin esa exclusión. El manifiesto fija los bytes vendorizados. Se revisó el índice: no incluye runtime, perfiles, cookies, .env ni pycache.
