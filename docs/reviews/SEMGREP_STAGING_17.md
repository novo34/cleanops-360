# Revisión independiente de 17 hallazgos Semgrep preexistentes

Fecha: 2026-10-20. Base: staging `646c9af496b2497a542ab58d96ae1e7b17b1ee81`. Integración: `c639403eeb195cc5cd0f96893d8503f2aa4ae4f7`.

Alcance: revisión estática de los 17 resultados de Semgrep 1.177.0, reglas locales sin modificar. No ejecuta los harnesses de PostgreSQL/OpenBao ni activa B1. Los 10 archivos afectados son byte a byte iguales a staging; comparación y localizaciones originales en `../implementation/demo-staging/evidence/semgrep-comparison.json`.

## Dictamen

**17 falsos positivos de vulnerabilidad en su contexto actual; ninguna vulnerabilidad explotable demostrada entre estos 17.** Esto no certifica todo B1. Las reglas los clasifican ERROR y el job continúa bloqueado: el análisis humano no altera su resultado ni concede una excepción automática.

| # | Archivo:línea | Regla / clasificación de riesgo | Evidencia del flujo |
|---|---|---|---|
| 1 | e2e/b1-real-postgres.spec.ts:116 | Import / informativo, FP | Especificador literal `otpauth`; los datos del QR no se usan para resolver el módulo. |
| 2 | e2e/b1-real-postgres.spec.ts:250 | Import / informativo, FP | Mismo literal `otpauth`; URI.parse actúa después de importar. |
| 3 | e2e/b1-recovery-postgres.spec.ts:39 | Import / informativo, FP | Literal `otpauth`; material del servidor solo alimenta el parser del autenticador. |
| 4 | e2e/b1-recovery-postgres.spec.ts:121 | Import / informativo, FP | Literal `otpauth`; ningún identificador de módulo controlado por respuesta HTTP. |
| 5 | e2e/b1-recovery-postgres.spec.ts:142 | Import / informativo, FP | Literal `otpauth`, también en contexto de prueba negativa. |
| 6 | e2e/b1-recovery-postgres.spec.ts:187 | Import / informativo, FP | Literal `otpauth`, independiente de entradas de recuperación. |
| 7 | lib/b1/approved-backend.ts:605 | Import / informativo, FP | Literal `otpauth`; binding/autorización no cambian el especificador. No es carga de código recibido del usuario. |
| 8 | lib/b1/password.ts:29 | Import / informativo, FP | Literal `argon2`; el password es argumento de hash, no ruta de módulo. |
| 9 | lib/b1/password.ts:66 | Import / informativo, FP | Literal `argon2`; encoded/password son datos de verificación, no código/import. |
| 10 | lib/b1/totp.ts:61 | Import / informativo, FP | Literal `otpauth`; secreto descifrado se entrega posteriormente a Secret/TOTP, no al cargador. |
| 11 | scripts/openbao-isolated-worker.mjs:26 | Import / informativo en harness confiable, FP contextual | Especificador variable, pero su único productor de repositorio es scripts/test-b1-openbao-integration.py:49: literal `./openbao-b1-integration.ts`, serializado por stdin a docker exec en contenedor de prueba propiedad del harness. No es endpoint HTTP ni dato de usuario. No ejecutar con stdin no confiable. |
| 12 | scripts/pg05-browser-backend.ts:108 | Import / informativo, FP | Literal `node:crypto`, módulo integrado en Node; ninguna dependencia de la entrada IPC. |
| 13 | scripts/openbao-b1-integration.ts:79 | Credencial / informativo, fixture sintética | Contraseña explícitamente sintética, usada para generar hashes de la prueba. Dominio fixture.invalid, PG por Unix socket en core; el ejecutor copia el módulo dentro del contenedor. No es secreto desplegado ni valor recuperado de infraestructura. |
| 14 | scripts/pg05-browser-backend.ts:33 | Credencial / informativo, fixture sintética | Passphrase fija de prueba; scripts/b1-real-browser-server.mjs:20–36 exige ID de contenedor, etiqueta de propiedad, NetworkMode=none, ausencia de puertos y mounts de host antes de ejecutar el backend. No se importa desde rutas de aplicación. |
| 15 | scripts/pg05-http-real.ts:19 | Credencial / informativo, fixture sintética | Mismo valor de fixture. scripts/pg-http-integration.py copia y ejecuta este runner dentro del contenedor PG propio, con conexión Unix socket y hostname fixture.invalid. No hay credencial de servicio externo. |
| 16 | e2e/b1-reset-postgres.spec.ts:95 | SSRF / informativo, FP | fetch se ejecuta en page.evaluate del navegador. Primer argumento constante `/auth/password/reset/authorize`; receipt solo va en JSON del body. No hay URL controlada por la entrada ni petición desde un servidor. |
| 17 | e2e/b1-reset-postgres.spec.ts:116 | SSRF / informativo, FP | Misma ruta relativa fija; foreign.targetUser/ticket solo en body. Es prueba negativa de aislamiento tenant (espera 403). No controla hostname/esquema/puerto. |

Los 11 imports literales fijan el módulo en código/lockfile; se ha distinguido explícitamente el único import variable. Las tres cadenas de prueba no son secretos reales: no deben reutilizarse fuera de estos fixtures. Las dos llamadas fetch no tienen un sink URL contaminado; la regla amplia confunde datos del body con destino de red.

## Revisión/corrección separada propuesta — NO implementada

Si el responsable B1/seguridad exige conformidad sintáctica con las reglas actuales, revisar en un PR independiente: imports estáticos conocidos en los 11 puntos literales; sustituir el selector de módulo del worker por una selección literal cerrada; generar credenciales aleatorias compartidas mediante el IPC de los fixtures y conservar las pruebas negativas de reset con destinos constantes reconocibles por el analizador. Medir inicialización, dependencias nativas y límites del harness antes de cambiar nada. Estas son propuestas, no vulnerabilidades confirmadas ni cambios autorizados a producción/B1.

No se han añadido `nosemgrep`, excludes, cambios de severidad, excepciones ni modificaciones de reglas/workflows. Un futuro ajuste de la regla de SSRF para limitar taint al argumento URL requiere revisión propia; no se realiza aquí. El aviso de parser del worker MapLibre minificado es una limitación adicional del análisis, separada de estos 17 hallazgos; su hash coincide con el paquete fijado 6.15.0.

## Segunda revisión y excepciones específicas — 2026-10-20

Se verificaron nuevamente los 17 sitios, sus datos de entrada y sus ejecutores. Clasificación individual: **17 falsos positivos confirmados; 0 vulnerabilidades reales identificadas; 0 decisiones pendientes para esos 17 casos**. Los ejemplos de import literal se verifican sobre el código exacto; el caso variable se contrasta con el productor stdin fijo; las credenciales se verifican como fixtures y las dos URL de fetch son constantes del navegador. No se ha cambiado código B1.

El propietario autoriza resolver el bloqueo con supresiones específicas. Se aplica `.semgrep/reviewed-findings.json`: exactamente 17 entradas con regla completa, archivo, rango línea/columna, hash del fragmento, clasificación y justificación; hashes completos de los archivos afectados, los productores y límites de confianza, runtime cerrado, lockfile y reglas originales. El registro es la propuesta concreta y aplicada, auditable por entrada.

`scripts/check-semgrep-reviewed.py` ejecuta todas las reglas originales con `--error --disable-nosem`, sin nuevos excludes. Solo acepta el código 1 de Semgrep cuando corresponde a hallazgos; no convierte fallos del motor en PASS. La salida muestra los 17 resultados revisados y cualquier resultado no revisado. Si cambia un contexto, desaparece una coincidencia, aparece otra en la misma línea/archivo, cambia la regla/motor o hay duplicados, falla. No se aceptan comentarios inline de supresión, ni excepciones por archivo/regla completa.

La única limitación de parser ya existente se registra separadamente: warning de sintaxis del worker upstream minificado, con ruta y hash exactos, tipo/nivel/código fijados. Cualquier otro warning/error de parsing falla. No se excluye la carpeta public ni código nuevo.

14 pruebas de regresión del guard verifican nuevas coincidencias, modificación de código/contextos, reglas distintas, excepciones caducadas/duplicadas, scanner incompleto/versionado y parser desconocido. Las pruebas positivas/negativas de las ocho reglas existentes siguen ejecutándose sin estas excepciones, para comprobar que conservan detección.

### Gitleaks posterior a la resolución de Semgrep

Quality #286 pasó Semgrep/fixtures y detectó `generic-api-key` en `.semgrep/reviewed-findings.json:12`, commit `04b8925cff9333e7f02116618e0df3deb322d598`. El supuesto secreto es `396436d97d91c13dd832945a966bd035f1e270284dea1ca949e705d841ff1007`, checksum SHA-256 del archivo fuente `lib/b1/password.ts`, verificado mediante sha256sum, no password, token ni hash de contraseña de un usuario. Clasificación: falso positivo confirmado, informativo.

`.gitleaksignore` contiene exclusivamente la huella completa `commit:archivo:regla:línea` de ese objeto Git inmutable. No hay allowlist por regex, regla o archivo; cualquier coincidencia de otro commit/código nuevo permanece activa. Se mantiene el escaneo del historial completo del PR y no se reescriben commits para borrar el resultado.

### Alcance explícito de navegador en Quality

La ejecución #287 pasó Semgrep, Gitleaks, SBOM, lint/typecheck, migración, tests PostgreSQL y build. Se canceló su colección genérica de 591 tests: el paso denominado CSP smoke invocaba Playwright sin selección y mezclaba 20 suites de entornos distintos. Precondición reproducida sin activar backend: startRealBrowserServer('existing') con B1_BROWSER_FIXTURE ausente devuelve OWNED_CONTAINER_REQUIRED antes de Docker/SQL. No se instala un backend B1 para hacerla pasar.

Se corrige la invocación del paso CSP a `playwright test e2e/csp.spec.ts`, conservando Chromium/Firefox/WebKit, y se añade un paso explícito con la suite demo ya validada (36 tests Chromium, con WebGL/fallback/teclado/responsive). Se añaden también los 238 tests B1 offline con ambas variables DB vacías. No se borran ni alteran los tests B1; sus suites PG/TLS permanecen en las configuraciones y workflows específicos existentes y sujetos a sus autorizaciones. `system-status-states.spec.ts` corresponde a estados administrativos positivos no disponibles mientras AUTH-GATE-05 está abierto; los controles del gate, CSP y endpoints 401 permanecen cubiertos por csp.spec.ts. `staging/boundary.spec.ts` exige autorización online independiente y no se ejecuta contra servicios externos desde esta CI.

Esta delimitación no equivale a aceptación de B1, de sus fixtures de TLS ni de sus suites PG no ejecutadas. La ejecución anterior cancelada no se informa como PASS. No se modifica el runtime, los contratos ni la seguridad de la aplicación.

Quality #288 confirmó otro defecto del runner: usaba Node 22, que rechaza `--test-isolation=none` del comando B1 offline existente. Se alinea únicamente el runner Quality con Node 24, ya utilizado por los workflows B1 y el runtime Docker del proyecto. No se cambia ni elimina el flag, no se relajan tests y no se modifica código B1. La ejecución fallida no se presenta como validación de esos tests.


## B1 production-only reuse, 2026-10-20

PR #11 scans all lib/b1 and the connected auth/manage-access panels, with all eight original rules and inline suppressions disabled. Its first raw scan found exactly FP-09..FP-12 above. The four entries are copied unchanged, including rule/path/range/snippet hashes. No other original exception is applied to this scope. The guard evaluator is unchanged; changed/new/stale/duplicate findings and scanner/parser errors still fail. The existing 14 adversarial guard tests are retained, with the registry inventory assertion updated to this four-entry scope.

The full production files and scanner rules match staging a217cfeda byte for byte. B1's overall lock file differs, so its actual SHA256 is pinned separately; argon2 0.44.0, otpauth 9.4.1 and every transitive package/version/integrity/dependency entry were compared and are identical. Runtime and lock contexts remain guarded. Only scanner targets and this scoped registry differ from the staging guard. The failed raw scan remains FAIL in Actions39478620423; the guarded follow-up is a separate execution, not a relabeling.


The SQL14/OpenBao/dashboard jobs are single-source experiments pinned to ec5bc165; their successful individual jobs and artifacts remain the execution evidence. Follow-up security-only commits do not rerun them. The production-security job checks the complete production/frontend/SQL/browser/harness scope byte-for-byte against that source before accepting retained evidence. Any difference fails and requires a new affected experiment; a SKIP is never counted as a new PASS.


## Full B1 history Gitleaks follow-up (after merge99b874bb)

The PR #7 scan covers B1 history beyond the narrower PR #11 diff. Actions39485356802/job118844236551 is retained as FAIL, not relabelled. Three additional exact historical findings were inspected at their original commits:

| Introducing commit / source | Classification and evidence |
|---|---|
| e6f7d1d9490684d38982959696d73b6c38215af6, tests/b1/private-operations.test.ts:15 | Constant request idempotency identifier in a local IdentityConnection mock. It is neither a session/cookie nor a service credential; no real endpoint/identity or secret provider consumes it. |
| a4fe5df2fef91c6551d6011dd5dc036514db120f, docs/proposals/b1-ceremony-material/APPROVAL.md:146 | English design-decision prose describing future email controls. No literal credential or cryptographic bytes occur on that line. |
| 71e5521a228f5ae03961bde16d3b3346610089ab, tests/b1/approved-backend.test.ts:93 | Fixed idempotency header for a synthetic request explicitly expected to fail403 in a mocked private backend; not an authentication key. |

Only commit:path:rule:line fingerprints are added to .gitleaksignore. No path/rule/content regex exemption or scanner change. New code, values or rewritten history cannot inherit those fingerprints. Merge commits retain the exact introducing history; a future squash/rebase needs its own scan and review before that separately authorized integration.

The earlier one-shot experiment paragraph records the initial ec5bc165 follow-up. Final P1 custody/SQL integration is executed at df6a52b0, with all reports and source guards in PROXY_DEADLINE_EXECUTION.json; the unchanged dashboard remains pinned to its initial successful source.


### Corrected history coverage

The phrase full-history above described the PR #7 action's broader range compared with PR #11, but was too broad: inspection of pinned gitleaks-action/src/gitleaks.js shows an unpaginated GitHub PR commits request and a first-parent range limited to30 returned commits. Logs39485356802 and39486006161 each explicitly scanned30 commits. They do not prove full-history coverage.

The existing action remains mandatory. B1 now also executes pinned Gitleaks8.24.3 explicitly over all history reachable from HEAD, rejects a shallow checkout, runs even if the paginated action fails, and preserves only finding metadata (no Secret/Match/Entropy/raw source) in a sanitized artifact. Scanner errors/incomplete reports remain FAIL. This strengthens coverage rather than changing detection rules.

Actions39486006161 retained FAIL for a Git-blob checksum assertion at introducing commit442f06d791e7955bf3a3e4a9713bbe23c4facbee, tests/b1/totp-selection-contract.test.ts:47. The fixture compares the committed canonical OpenAPI/HTTP-contract assets to expected Git blob IDs; neither value is an authentication credential. Only that immutable fingerprint is excepted, and the full scan must still report all other findings.


### First actual complete reachable-history scan

Actions39486601226/job118848514239 scanned303 reachable commits at branch source1e0b6519 and retained FAIL with nine additional findings. Every original commit/file/line was inspected individually. Six findings are source-integrity digests (codeSha256, provenance, a verified Git blob and original V4 artifact-manifest entries); two are prose or synthetic delivery callback control flow with no literal secret; one is a fixed unit-test idempotency identifier. The canonical manifest's prior38/38 integrity validation remains the proof of those original asset digests, not a credential inventory. No canonical asset or product code is changed. The exact nine fingerprints and classifications, together with the failed sanitized scan, are preserved in PROXY_DEADLINE_EXECUTION.json. Only those immutable fingerprints are excepted; a new value/commit/path/rule/line, any scanner error or incomplete report still fails.
