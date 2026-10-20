# Autorización y aislamiento de CI previo al PR

Revisión: 2026-10-20. El propietario autoriza PostgreSQL/migraciones **exclusivamente** en GitHub Actions efímero para este PR. La autorización NO incluye staging, VPS, OpenBao, merge ni despliegue.

## Destino comprobado

- `.github/workflows/quality.yml`: runner GitHub-hosted `ubuntu-latest`, sin `environment`, sin self-hosted runner, reusable workflow, túnel, SSH o conexión Dokploy. Servicio de job `postgres:16-alpine`, puerto efímero 5433→5432 en el runner.
- `DATABASE_URL` y `CLEANOPS_TEST_DATABASE_URL` son literales de job completos, host `127.0.0.1`, puerto 5433, base `cleanops_test`, usuario/password sintéticos del mismo servicio. No usan `${{ vars.* }}`, `${{ secrets.* }}`, inputs, cabeceras o salidas de otros jobs para el destino.
- El paso `Migrate isolated PostgreSQL` no redefine env. Ningún paso del workflow escribe una dirección DB alternativa en GITHUB_ENV. Las variables de organización y secretos no se incorporan automáticamente al entorno del proceso; no hay referencia a credenciales de staging/Hostinger.
- Única referencia a `secrets` del workflow: `secrets.GITHUB_TOKEN`, limitada al paso Gitleaks, con permisos contents/pull-requests read. No hay secretos DB/VPS ni credenciales de infraestructura.
- Solo `.env.example` está versionado; el migrador se ejecuta mediante Node normal, sin dotenv/--env-file ni archivos de entorno externos. El PR no modifica workflows, migrador ni SQL. Actions externas fijadas a SHA; dependencias fijadas por package-lock. Esta revisión prueba el destino configurado, no sustituye la confianza de cadena de suministro de acciones/dependencias.
- `scripts/migrate-postgres.mjs` construye el Pool desde esa DATABASE_URL completa. `scripts/trusted-migrations.mjs` permite un único SQL, abierto sin seguir symlinks y comprobado por hash: `0001_system_status.sql`, SHA256 `a9392c9c0632117b6fe7e924cf9c7d3fc1bfe348bb1adb6460bdcaf9a907f357`.
- Se leyó ese SQL: tablas/índices locales y registro de migración; no dblink, FDW, túneles, funciones de conexión, extensiones o comandos de acceso externo.
- Los demás workflows de PR no cumplen sus filtros para esta rama/diff (prefijo B1, PR histórico concreto o paths de infraestructura). Ningún workflow/servicio se modifica para eludir controles.

**Conclusión:** la configuración revisada dirige las migraciones únicamente al PostgreSQL efímero de este job. Se puede abrir el PR bajo la autorización recibida. No se ejecuta PostgreSQL localmente ni contra staging.

## Semgrep y estados de pruebas

Revisión independiente de cada uno de los 17 hallazgos: [SEMGREP_STAGING_17.md](../../reviews/SEMGREP_STAGING_17.md). Falsos positivos de vulnerabilidad contextual; la regla sigue marcándolos ERROR y se mantiene intacta. Por ello es esperable que Quality falle antes de llegar al paso de migración. Un paso omitido por fallo anterior no equivale a migración ni pruebas PostgreSQL PASS.

La autorización supersede exclusivamente el bloqueo de apertura descrito en INTEGRATION.md, PR_BODY.md y evidence/ci-blocker.json, que conservan el estado histórico anterior. La decisión de merge y cualquier AutoDeploy continúan sin autorización. CI remoto y número de PR se informarán desde los resultados reales de GitHub, no como inferencia a partir de pruebas locales.
