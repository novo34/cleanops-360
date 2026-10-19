# CleanOps 360 — capacidad de diseño

Estado: preparación ejecutada; propuestas `DESIGN_ONLY`; piloto NO aprobado. Fecha: 2026-10-19 UTC.

## Entrega

- [Compatibilidad e instalación](COMPATIBILITY.md): fuentes, licencias, adaptaciones, riesgos y limitaciones.
- [Auditoría real](AUDIT.md): cinco vistas de staging observadas en Chromium, quince capturas, mediciones y axe.
- [Tres direcciones](DIRECTIONS.md): A Registro suizo, B Atelier de operaciones, C Mesa de control.
- [Galería estática](studies/index.html): HTML autónomo y capturas, sin rutas productivas.
- [Sistema propuesto](SYSTEM.md): tokens, componentes y patrones; no aplicado a la aplicación.
- [Piloto y aceptación](PILOT.md): `/demo`, restringido al contenido del dashboard.
- [Proceso permanente](WORKFLOW.md): lectura, cambios progresivos, regresión y aprobación.
- [Validación](VALIDATION.md): pruebas ejecutadas y límites, sin PASS global de WCAG/B1.

## Aislamiento

Original `/workspace/cleanops-360`: rama `work`, HEAD `d522e2edc95ac39af058522fecbcd9fd316667b3`, árbol limpio al inicio. No había worktrees locales B1 ni procesos Next/Node de desarrollo observados. GitHub mostraba las ramas `feat/b1-http-flows`, `feat/b1-auth-rbac-rls`, `feat/b1-auth-proxy-origin` y la PR B1 #7 abierta; no equivale a ausencia de trabajo B1 en otras máquinas.

Worktree de diseño `/workspace/cleanops-design`, rama `chore/codex-design-system`, base real de staging `646c9af496b2497a542ab58d96ae1e7b17b1ee81`. Se comprobó que esta rama de diseño no existía antes de crearla. `git fetch origin staging` descargó FETCH_HEAD sin crear origin/staging por la configuración local; el worktree se creó desde el SHA verificado, sin cambiar la rama original.

Solo se añaden `.agents/skills/`, `.codex/config.toml` y `design/`. No se modifica código de aplicación, AGENTS.md raíz, dependencias del producto ni CI. Los runtimes, cachés y perfiles temporales viven en `design/.runtime/` (ignorado) o `/workspace/design-runtime`; fuentes de investigación externas en `/workspace/design-research`. Ninguna suite intensiva, contenedor, DB, migración o servicio del producto fue iniciado.

`lib/b1/runtime.ts` sigue usando `closedBackend`. `AUTH-GATE-05` sigue abierto. Las pruebas son sobre una demo sintética pública; no prueban autorización, RLS, MFA ni aceptación operativa. Hostinger/Dokploy sigue siendo exclusivamente ensayo sintético, sin asumir residencia suiza.

## Uso

Desde la raíz de ESTE worktree, invocar explícitamente `$cleanops-design`, `$emil-design-eng`, `$cleanops-impeccable` o `$cleanops-taste`. Cada SKILL.md es legible y se ha revisado; el descubrimiento automático del cliente **permanece pendiente**: `codex app-server` intenta escribir `/run/codex-environment/codex-home/installation_id`, de solo lectura. No se cambió configuración global ni se inició una sesión de modelo adicional.

MCP sí está instalado y probado directamente mediante protocolo stdio (`python design/scripts/check_mcp.py`). La configuración Codex de proyecto está preparada; el propio cliente indica que no carga configuración local hasta confiar en el repositorio. Esa confianza se administra fuera de este cambio y no se ha alterado. Por tanto: servidor operativo, incorporación efectiva en el catálogo MCP de esta conversación NO verificada. No se confunde el smoke MCP con una prueba de integración del cliente.

Para restaurar runtimes en otra máquina, revisar primero los locks y las licencias del proveedor; desde la raíz:

```sh
mkdir -p design/.runtime/mcp design/.runtime/a11y
cp design/tooling/mcp/package*.json design/.runtime/mcp/
cp design/tooling/a11y/package*.json design/.runtime/a11y/
npm ci --prefix design/.runtime/mcp --ignore-scripts --cache design/.runtime/npm-cache
npm ci --prefix design/.runtime/a11y --ignore-scripts --cache design/.runtime/npm-cache
python design/scripts/check_mcp.py
python design/scripts/check_codex_skills.py
```

No se descarga un navegador automáticamente. Se requiere Chromium instalado, Node >=18 (ejecutado con 24.19.0), Python 3 y OpenSSL. Los scripts de capturas requieren el Playwright Python preinstalado del entorno; es un cliente de navegador para evidencias, no una segunda incorporación de Playwright Test al producto. El producto ya tiene `@playwright/test` 1.56.1 y `e2e/demo-workspace.spec.ts`; se conserva.

Decisión del propietario: escoger dirección A/B/C y aprobar `/demo` como piloto. Recomendación: A, con avisos visibles antes y reducción de texto diminuto. La navegación global mostrada en los estudios es contexto propuesto; queda fuera del primer piloto.
