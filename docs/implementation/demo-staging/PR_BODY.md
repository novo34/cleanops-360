El dashboard público `/demo` recupera la base v0 validada (`91dcb92`): mapa local interactivo, filtros/selección sincronizados con la agenda, fichas existentes y temas navy/jade claro/oscuro con preferencia persistente. La integración parte de `staging` en `646c9af`; no incorpora el entorno de preview ni código B1 de otras ramas.

## Alcance

- `.gitignore`
- `app/demo/[[...section]]/page.tsx`
- `app/demo/demo.css`
- `app/demo/layout.tsx`
- `app/demo/themes.css`
- `components/demo/operations-map.tsx`
- `components/demo/workspace.tsx`
- `e2e/demo-security-boundary.spec.ts`
- `e2e/demo-v0-map.spec.ts`
- `e2e/demo-workspace.spec.ts`
- `eslint.config.mjs`
- `lib/demo/map-model.ts`
- `lib/demo/theme.ts`
- `package-lock.json`
- `package.json`
- `playwright.demo-v0.config.ts`
- `public/demo-fonts/NOTICE.md`
- `public/demo-fonts/dmsans-OFL.txt`
- `public/demo-fonts/dmsans.woff2`
- `public/demo-fonts/manrope-OFL.txt`
- `public/demo-fonts/manrope.woff2`
- `public/demo-map/MAPLIBRE-LICENSE.txt`
- `public/demo-map/NOTICE.md`
- `public/demo-map/icon.svg`
- `public/demo-map/maplibre-gl-shared.mjs`
- `public/demo-map/maplibre-gl-worker.mjs`
- `public/demo-map/region.geojson`
- `scripts/audit-demo-v0.py`
- `tests/demo-map.test.ts`

También se incorpora el dossier y sus evidencias en `docs/implementation/demo-staging/`.

## Validación local

- Lint/typecheck/build PASS; warning B1 preexistente en auth-panel.tsx:66.
- 3 tests unitarios del mapa PASS; 238 tests B1 offline PASS, sin DB/SQL/OpenBao.
- 36 tests Chromium PASS: demo, teclado, responsive/táctil, mapas/filtros/fichas/temas, CSP y rutas privadas.
- Axe: cinco rutas × dos temas, cero infracciones detectadas; revisión manual completa de accesibilidad pendiente.
- npm audit: cero vulnerabilidades notificadas. Worker verificado contra el paquete instalado.
- Semgrep completo FAIL: 17 hallazgos idénticos al staging base, cero añadidos. Warning de parser sobre vendor minificado. No se modificaron reglas/workflows ni archivos B1 para ocultar resultados.

## Aislamiento

Byte-identidad de lib/b1, rutas privadas, proxy/CSP, DB, deploy, workflows, variables y contratos frente al HEAD de staging. closedBackend continúa conectado y AUTH-GATE-05 abierto. Datos sintéticos y almacenamiento limitado a cleanops.demo.theme; cero nuevas sesiones/cookies de autenticación.

## Estado y riesgos

ESTE CUERPO ESTÁ PREPARADO LOCALMENTE; EL PR TODAVÍA NO SE HA CREADO. Abrirlo activaría Quality y npm run db:migrate, prohibido bajo la autorización actual. CI remoto no ejecutado. Resolver autorización específica de SQL efímero de CI y revisión de hallazgos preexistentes con el responsable B1/seguridad antes de considerar checks verdes. No activar auto-merge.

Las modificaciones técnicas de integración eliminan HTML injection e imports dinámicos señalados por la regla local; la referencia de componente cliente se suministra solo al dashboard. No cambia la dirección visual.

## Reversión

Tras una integración autorizada, preparar un PR de revert específico sobre staging actualizado: git revert -m 1 <merge-sha> (merge commit), o git revert <squash-sha> (squash). Revisar que no afecte a cambios independientes B1. Sin reset/force-push ni rollback SQL. No ejecutar ahora.

El merge queda pendiente de autorización final y activará el AutoDeploy existente. Después habrá que verificar despliegue y HTTPS /demo; merge o CI por sí solos no prueban despliegue ni aceptación del propietario.
