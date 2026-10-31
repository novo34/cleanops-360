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


## B1-PI-01 — dictamen independiente comunicado por el propietario, 31-10-2026

Esta entrada NO modifica el manifiesto historico ni reclasifica sus falsos positivos.
El propietario aporta el dictamen de Claude sobre HEAD
6a558c39e7abf6f3884243ed4eb6367d8fa9b80b y ordena aplicar exactamente el pin y
la aceptacion individual del mecanismo. No se atribuye al autor de este cambio
una revision independiente propia ni se inventa otra acta/autoridad formal.
El procedimiento vigente no exige una segunda autorizacion formal para esta
implementacion expresamente solicitada. No se autoriza merge, despliegue, primer
actor ni contenido futuro de integration.mjs.

- Runtime auditado y comprobado sin cambios: blob Git
  f0e91a5ec8a799692947000bff10a7743322015b. Se aplica el parche de pin existente.
- Regla original semgrep.cleanops-code-execution-import; archivo
  lib/b1/reviewed-site-installation.ts, linea 44, columnas 26–91.
- SHA-256 del fragmento: cd1691f3d4074fa53f3fc2124bc332d694e86867630045396a01d5805a9360d1.
- SHA-256 del archivo: 867ea66ddfe950b83aaccce0e29dd50744cdaaf5edfa354f3545976c80a762c6.
- Clasificacion: **accepted_privileged_dynamic_import**, nunca confirmed_false_positive.
  Es ejecucion privilegiada deliberada, no una declaracion de ausencia de riesgo.

La reconciliacion canonica agrega B1-PI-01 SOLO en memoria tras verificar el
ledger historico fijado, los hashes existentes, el archivo y los productores
privados del HEAD auditado. evaluate exige igualdad de la entrada completa,
regla/rango/ID/clasificacion, fragmento y contexto de archivo. Un cambio de bytes,
posicion, regla, archivo, productor, entrada duplicada o coincidencia desaparecida
hace fallar el guard. No permite actualizar el checksum de un manifest para
blanquear otro codigo, ni reutilizar la categoria en otro hallazgo.

La salida conserva 16 reviewed_false_positives historicos activos y publica el
riesgo aceptado en accepted_privileged_findings, con scope
loader_mechanism_only_not_future_integration_content. Los bytes, efectos e imports
de cada integration.mjs instalado siguen sujetos a revision y al manifiesto
privado aprobado, permisos y SHA-256 del cargador; esta entrada no los aprueba.
La validacion de archivos privados y el comportamiento fail-closed no cambian.

### Verificacion local de la aplicacion del dictamen

- Guard completo Semgrep 1.177.0: **PASS**, 17 resultados visibles (16 FP historicos
  y 1 import privilegiado aceptado), cero no revisados; warning upstream conocido
  conservado y verificado. rules_disabled=[], inline_suppressions_enabled=false.
- Regresiones del guard: **26 PASS**, incluidos otro hallazgo no exceptuado,
  caducidad por linea/columna/hash/archivo/regla/productores, falsificacion de
  contexto, duplicados y prohibicion de reclasificar el riesgo como falso positivo.
- Fixtures de seguridad: las OCHO reglas originales detectan el fixture inseguro;
  fixture seguro con cero hallazgos. No se cambia el ruleset ni sus exclusiones.
- SHA-256 del ledger historico inalterado:
  2605f29d3d2bf8d4bd36d7df5d9f7d501a69bb96410404a3ed01c3dc4eb31448.
- SHA-256 del ruleset inalterado:
  30ed5e227fafb8b53a794ec2ebb808447bee752679779fadf82aaa7a44ecd681.

### Los 22 avisos Edge del dictamen y el runtime real

Se conservan como observacion atribuida a Claude los **22 avisos Edge** comunicados
por el propietario; no se dispone de su texto individual en este encargo y no se
inventa una lista. En esta ejecucion se repitio npm run build -- --webpack para
verificar especificamente esa observacion: Next 16.4.3 compilo con exito y el log
completo stdout/stderr contiene **0 avisos Edge reproducidos**. No hay filtros de
warnings, no se cambia configuracion ni se ocultan esos avisos reportados.

La conclusion de NO BLOQUEANTE se limita a la ejecucion actual NODE de las rutas:
las rutas B1 declaran runtime=nodejs o usan el predeterminado Node de Next; el
manifest compilado asigna /_middleware a nodejs y middleware-manifest no contiene
funciones Edge. Se ejecuto el servidor Next construido y el harness existente
scripts/test-b1-proxy-origin.mjs: **PASS, 31 operaciones en dos transportes**,
mas negativos de origen, headers, CSRF y rutas. /login responde 200 y las rutas
B1 alcanzan su cierre canonico 503, sin cookie indebida ni error de API Node en
Edge. El servidor local se detuvo al finalizar. Esto no demuestra compatibilidad
Edge del backend, ni login/MFA en staging; no se pretende ninguna de las dos cosas.

Las pruebas TS/build se justifican aqui por la verificacion expresa de esos
avisos y de las rutas reales. No se modifica aplicacion ni contratos y no se
repiten localmente los 284 tests B1. Quality remoto ejecutara su workflow normal
sin omitir o reducir pasos.

Evidencia local conservada fuera de Git (logs completos, sin material VPS):
- `/tmp/b1-claude-semgrep-reviewed.json` — SHA-256 `bea80838b2c4791496c6d05204a7fe26ecd1817a4f676707b2fbcb3c9f6e571f`.
- `/tmp/b1-claude-webpack.log` — SHA-256 `d83a385204c88c982958e6611def446e4735821685886eb2fc7929c9ffefec79`.
- `/tmp/b1-claude-route-smoke.log` — SHA-256 `b8c3757ed2278fb24b049ce578684ec2c53eadb7acd8a2c8448d5f13fab94d77`.
