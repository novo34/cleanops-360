# Dashboard v0 → staging: integración selectiva

**Preparado y probado localmente. NO apto todavía para merge: PR/CI bloqueados.**

- Base verificada: `staging` en `646c9af496b2497a542ab58d96ae1e7b17b1ee81`.
- Fuente validada: `feat/demo-v0-map-themes` en `91dcb92a954c851ca36eaa2796d90d381e308381`.
- Rama: `integrate/demo-v0-map-staging`; worktree independiente `/workspace/cleanops-demo-integration`.
- Ancestro común = HEAD de staging. Diseño contiene dos commits posteriores; no hay divergencia ni conflictos. No se hizo merge/cherry-pick completo: se restauró una lista explícita de archivos desde la fuente.
- Se conservan v0 navy/jade, estructura, módulos, fixtures sintéticos, mapa, filtros/selección, agenda/fichas, temas y preferencia local. Única dependencia runtime añadida: MapLibre 6.15.0 y transitivas; ninguna versión existente cambiada y ningún paquete existente eliminado.

## Alcance y exclusiones

Inventario exacto, archivos excluidos, comparación y hashes: `evidence/selection.json` y `dependency-delta.json`.

Incluidos: archivos demo de app/components/lib, estilos/tokens, cartografía/worker/fonts/licencias locales, MapLibre/lockfile, regresiones Playwright/unitarias y auditoría axe. Configuración ESLint solo ignora los dos archivos vendorizados; `.gitignore` añade el archivo generado de Next.

**Excluidos:** todo `deploy/demo-preview/`, smoke/scripts/tests de preview, documentos y evidencias históricas de preview y de diseño. No hay nuevos entornos, imágenes, Dockerfiles ni configuración de infraestructura en esta integración. Tampoco se incorporan las skills de `chore/codex-design-system`.

## Correcciones técnicas de integración

1. El script del tema se renderiza como contenido literal con el nonce existente, sin `dangerouslySetInnerHTML`, prohibido por la regla local de seguridad. Se prueba su ejecución antes de hidratar bloqueando chunks JS.
2. Se sustituyen tres imports dinámicos de la demo señalados por Semgrep por imports estáticos conocidos. La página de servidor pasa la referencia del componente cliente únicamente al dashboard; los demás módulos reciben `null`. MapLibre se inicializa exclusivamente en efecto de navegador y sus datos/worker siguen locales. No se cambia la regla de seguridad ni B1.
3. El test táctil componía mal la URL cuando se usaba una URL base distinta: ahora construye `/demo` mediante `new URL`. Fallo inicial preservado y corregido.
4. Se amplía la suite de integración con CSP existente y prueba de preferencia demo → login → rutas privadas. Solo se adaptan las rutas de salida de evidencias a este dossier.

## Validación local

Los resultados finales exactos están en los logs/JSON de `evidence/`. Build de producción servido solo en `127.0.0.1:3117`, sin base de datos y sin configurar autenticación real.

- Lint y typecheck: PASS; warning preexistente `components/auth-panel.tsx:66`, no modificado.
- Build: PASS.
- Modelo de mapa: 3 PASS.
- B1 offline existente: 238 PASS, cero skip/fail, con `DATABASE_URL` y `CLEANOPS_TEST_DATABASE_URL` vacías. No se arrancó PG/OpenBao ni se ejecutaron SQL/migraciones.
- Playwright: **36/36 PASS**, suite completa demo + CSP + frontera privada. Ver resultado final en `browser.txt` y `browser-results.json`; incluye teclado/foco, cámara, filtros/reset/vacío, agenda, fichas, temas/sistema/recarga, fallback WebGL y táctil.
- Escritorio 1440×1000; tablet 834×1112; móvil 390×844; horizontal 844×390; navegación de cinco rutas también en 390/768/1440. Capturas reales incluidas.
- Axe: cinco rutas × dos temas, cero infracciones detectadas y cero errores JS/consola; resultados `incomplete` requieren revisión manual. No equivale a certificación WCAG completa ni a dispositivos físicos/lectores de pantalla.
- Privadas: `/auth/me`, `/me/sessions`, `/auth/tenants` devuelven 503 sin emitir cookies; endpoints administrativos permanecen 401/AUTH_GATE_05, incluso con cabeceras sintéticas falsificadas. El login no obtiene una sesión por guardar la preferencia visual.
- Npm audit y verificación de worker contra paquete instalado en JSON correspondientes. Licencias originales conservadas byte a byte, incluido whitespace de upstream; diff check se ejecuta excluyendo únicamente esos dos textos de licencia.

## Seguridad/B1

`lib/b1/**`, rutas auth/me/mfa/login, `proxy.ts`, cabeceras de seguridad, root layout, contratos, modelo demo, DB, deploy, workflows, variables de entorno y gates permanecen idénticos al HEAD actual de staging. `runtimeHandler` sigue usando `closedBackend`; `AUTH-GATE-05` sigue ABIERTO. No se introducen usuarios, credenciales reales, PII ni secretos. La única persistencia nueva es `cleanops.demo.theme`.

## Bloqueos reales de PR/CI

**No se ha abierto PR**, ni siquiera borrador: el evento `pull_request` activaría `.github/workflows/quality.yml`, que para esta rama inicia PostgreSQL de CI y ejecuta `npm run db:migrate`. Aunque sea efímero y no staging, la autorización vigente prohíbe migraciones y exige detenerse antes de activar esos workflows. Tampoco se renombra la rama como B1 para eludir controles ni se modifican workflows.

Se ejecutó localmente Semgrep **1.177.0**, misma versión y ocho reglas que CI, instalado en un venv separado con wheels exclusivamente. Resultado completo: **FAIL, 17 hallazgos preexistentes**. Se reprodujeron exactamente los mismos 17 en un snapshot Git aislado del staging base, sin hallazgos añadidos tras corregir la demo. Los archivos afectados de B1/tests/harnesses son byte a byte iguales. No se califican automáticamente como falsos positivos ni se modifican fuera de alcance. Además el parser avisa sobre sintaxis del worker minificado vendorizado, cuyos bytes coinciden con el paquete fijado. Evidencia: `semgrep-comparison.json`.

Por tanto, CI remoto está **NO EJECUTADO**, no PASS, y el PR no es apto para fusionarse. Requiere resolver la autorización de SQL exclusivo de CI y que el responsable de B1/seguridad revise los hallazgos existentes. El cuerpo del PR está preparado en `PR_BODY.md`; no hay revisión de Codex sobre un PR inexistente.

## Reversión y siguiente paso

Tras desbloquear PR/CI, verificar de nuevo HEAD de staging, crear PR a staging, resolver checks obligatorios y revisión. Solo entonces solicitar autorización final de merge/AutoDeploy. No se ha solicitado ni ejecutado ese merge.

Si posteriormente se integra mediante merge commit, preparar un PR de reversión con `git revert -m 1 <merge-sha-aprobado>` sobre staging actualizado; si squash, `git revert <squash-sha>`. Inspeccionar el diff de reversión para conservar cambios independientes de B1; no hacer reset/force-push ni ejecutar rollback SQL. Ninguna reversión se ejecuta ahora.

Después del merge autorizado, verificar AutoDeploy y HTTPS real `/demo`, rutas privadas y versión desplegada. No hay validación online del nuevo dashboard ni aceptación funcional del propietario todavía.
