## Cambio y trazabilidad

**REQ / módulo / resultado observable:** STAGING-BASE-RECONCILIATION-01. Preparar un prerrequisito mínimo de gobernanza y dependencias para staging a217cfeda74431b77ffa30d117febb62695c70d0 antes de integrar OpenBao PR 27 en 4a12e31744ce89487f0cba1b4ab50188e4abd0b7. Main de referencia 4f19c36f8eda2c846c6e3c7164814f26841b3bce. Candidato controlado desde staging; ninguna ref protegida modificada.

**Exclusiones y autorizaciones exactas:** Solo preparación, pruebas locales sin servicios, consulta audit del lock y publicación de rama. Sin merge, despliegue, build de app/imagen, instalación de paquetes, scripts lifecycle, SQL, PostgreSQL/OpenBao, secretos o cambios de protecciones. Sin importar R4/CRM ni R3 ni activaciones nativas. PR 27 permanece intacto. TLS/config y capacidad CPU/build no se alteran.

## QG-0

**Archivos, componentes, funciones, contratos, harness y workflows existentes inspeccionados (rutas concretas):** docs/ENGINEERING_QUALITY_POLICY.md, scripts/check-pr-engineering-policy.py, .github/workflows/engineering-policy.yml, `.github/PULL_REQUEST_TEMPLATE.md` en main, package.json, package-lock.json y scripts/check-semgrep-reviewed.py en dad2bcbd1d19cc4868909e1e623fc18884ce8270 y su padre, manifiesto .semgrep/reviewed-findings.json y `tests/static/test_semgrep_reviewed.py` de staging, quality.yml y staging-b1-integration.yml. Linaje del verificador: c7a041f y endurecimientos sucesivos hasta 36bac65beefc099b92c6d61f1da539ac8a445737; este último blob sigue idéntico en main. Workflow canónico procede de 8b4b66649f87c34ac5cb2f05f71ae30931d91fbf y plantilla de 3d400789e6ae174687090a1054eed64ba4765689.

**Alternativas evaluadas (reutilizar / corregir en origen / extender / reemplazar / crear):** Reutilizar exactamente verificador/workflow/plantilla de main y package.json/lock aprobados en dad2bcbd. Extender el guard Semgrep existente con el algoritmo canónico `load_manifest` de dad2bcbd para una transición exacta del contexto de staging. No copiar una segunda implementación del verificador, no elegir head como fuente de confianza ni desactivar checks. Merge de main completo o cherry-pick indiscriminado de a809604 importaría cientos de archivos y contextos B1/B2 posteriores: descartado. Copiar el Semgrep actual de main requiere contextos y P2 posteriores ajenos: descartado. audit fix --force no se usa.

**Justificación del diff mínimo y archivos nuevos (cada uno con dueño, consumidor, prueba y criterio de retirada si temporal):** Diez archivos. Tres rutas de gobernanza ausentes en staging se importan byte por byte de main, mismo nombre canónico y consumidores workflow/autor PR. Se incorpora además la versión exacta de docs/ENGINEERING_QUALITY_POLICY.md de main 4f19c36f8eda2c846c6e3c7164814f26841b3bce, referencia canónica exigida por la plantilla; dueño mantenedor, consumidores plantilla y revisión de ingeniería, permanente. Dos archivos de paquetes byte por byte de dad2bcbd. Se extienden únicamente scripts/check-semgrep-reviewed.py y `tests/static/test_semgrep_reviewed.py.` Test nuevo `tests/static/test_pr_engineering_policy.py` prueba ese único verificador, no crea otro motor. Este informe nuevo es el registro revisable de fuentes, gates y evidencia, dueño propietario/mantenedor, consumidor revisión independiente. Ningún archivo temporal entra en runtime. Todo lo demás se conserva; ninguna eliminación.

**Riesgos de seguridad, ACL/RLS, tenant, migraciones, concurrencia y reversión:** El workflow `pull_request_target` mantiene contents read y checkout de refs/heads/base.ref, con persist-credentials false. El verificador usa solo stdlib; plantilla y guía no son dependencias de ejecución. Mantener los guards evita que un head debilite su propio control. El lock sigue siendo integral y los 17 findings históricos y sus `reviewed_commit` no se reatribuyen. La transición exacta del hash no modifica otros contextos ni excluye rutas/reglas. No se toca ACL, datos ni comportamiento de sesiones; por eso no se importan fixes funcionales posteriores ni test:b1:offline agregado luego en main. Reversión futura por revert revisado, sin reset/force-push ni estado de volúmenes afectado.

## QG-1/QG-2

- [x] No hay implementaciones paralelas, wrappers/guards/runner duplicados, endpoints huérfanos ni mocks productivos.
- [x] Causa raíz corregida; no nueva variante por fallo previo sin STOP-AND-DESIGN.
- [x] Consumidores, documentación y tests usan una implementación canónica.
- [x] Cambios dentro de alcance y autorizaciones; no se han modificado archivos aprobados sin nueva aprobación.

## QG-3

- [x] Inventario de archivos añadidos/modificados/eliminados, sin basura o duplicación.
- [x] Sintaxis/lint/tests locales antes de CI costosa.
- [x] Tests reales y PASS/FAIL/SKIP separados con enlaces a logs y commit exacto.
- [x] Controles de seguridad, multi-tenant, concurrencia e idempotencia probados si afectan al cambio.
- [x] Sin merge/TECH-READY/ACCEPTED hasta satisfacer gates y revisión del propietario.

**Evidencias (URL/run/SHA):** Fuentes exactas: https://github.com/novo34/cleanops-360/commit/dad2bcbd1d19cc4868909e1e623fc18884ce8270 y https://github.com/novo34/cleanops-360/commit/36bac65beefc099b92c6d61f1da539ac8a445737 . Base e identidad main comprobadas por git fetch; alcance original de PR 27 https://github.com/novo34/cleanops-360/pull/27 . PASS local: cuatro tests del verificador en 0.013s y dieciséis del guard Semgrep en 0.056s; sintaxis Python por compile. El chequeo completo de whitespace se detalla abajo sin atribuirle un PASS global. Casos positivos/negativos de campos, eventos, evidencia oculta/duplicada y fuente base; tamper de manifest/lock, cambios no aprobados, snippets/contextos y 17 findings exactos. No hay run remoto nuevo. Comandos: python -B -m unittest discover -s tests/static -p `test_pr_engineering_policy.py` -v y python -B -m unittest discover -s tests/static -p `test_semgrep_reviewed.py` -v. Dependencias: package.json y lock iguales a dad2bcbd, Next 16.4.3, Zod 4.6.6 y fast-uri 3.1.9, con familia @next alineada. Aparte de esas versiones, solo se añaden integridades de argon2 0.44.0 y otpauth 9.4.1 ya presentes en el padre a809604; sus versiones y dependencias no cambian. Sin paquetes añadidos/eliminados. npm audit --package-lock-only --ignore-scripts --audit-level=high --json devuelve exit0, cero info/low/moderate/high/critical. Esta consulta usa red del registry; no es prueba offline ni instala paquetes. No npm ci, lifecycle scripts ni audit fix.

**Excepciones explícitas, dueño, aprobación y fecha/condición de eliminación:** Revisión independiente del nuevo SHA y autorización de integración siguen pendientes del propietario. El guard Semgrep adapta solo los pines históricos de staging al algoritmo canónico de main: adaptación nueva sujeta a revisión, no se presenta como aprobación histórica del nuevo contexto ni de otros bytes. No se abre PR ni se edita PR 27 aquí, porque el Quality de staging crea PostgreSQL en `pull_request` Abrir PR dispara Quality con PostgreSQL. El push a staging solo activa staging-b1-integration si también coinciden sus filtros paths; este candidato no modifica ninguna de esas rutas. Publicar rama sin PR deja el candidato revisable sin provocar esos eventos. Es una limitación de ejecución deliberada por autorización, sin modificar ni eludir checks. Abrir PR/integrar requerirá resolver primero la autorización de esos eventos con el propietario; no se cambian triggers ni protecciones en este encargo.

## Cómo corregir el verificador en la BASE

El fallo observado es real: a217cfe no contiene scripts/check-pr-engineering-policy.py. El workflow confiable de main hace checkout explícito de la base del PR; agregar el script solo al head de 27 no cambia ese checkout y el fallo continúa. El candidato se publica para revisión, no corrige todavía staging en remoto. Tras revisión y autorización específica de integración y de la CI que se dispararía, incorporar PRIMERO estos bytes canónicos a staging en un commit separado mediante el flujo protegido autorizado; no usar bypass, head, otro repo ni checkout main como sustituto del control de base. Comprobar el nuevo SHA de staging y la presencia/hash del script EN ESA BASE. Solo después actualizar de manera controlada PR 27 con esa base y su ficha válida, revisar el diff resultante y considerar la revalidación remota que esté autorizada. Actualizar o editar PR 27 también puede disparar CI; no hacerlo aquí. No afirmar que todos los checks pasarán: el body actual de 27 puede necesitar adaptación a la plantilla, y los checks que requieren PostgreSQL siguen sin autorización de reejecución. Si el propio PR prerrequisito queda bloqueado por la base incompleta, documentar y resolver el bootstrap con el propietario bajo protecciones, nunca autoaprobarlo ni inventar una excepción. Este informe no autoriza tal transición.

## Dependencia Semgrep y estado de pruebas

El lock aprobado dad2bcbd tiene SHA256 2a85d62c159729c24878c4e97fb5e7d36f358abc6019225cd3c66c32863f4765. El manifiesto de staging aún fija 938130ec03da009b7f492ce3e7edf42c488bb59925bf8e14de376110e8b85f2e. Cambiar solo las dependencias rompería el guard. Se reutiliza load_manifest de dad2bcbd, restringido al manifiesto de staging inmutable y al par exacto old/new. No se importa la familia de manifests R2 ni reconcile_p2_context de main ni los archivos de runtime que pediría. El scanner de staging sigue cubriendo todo el repositorio con los mismos excludes de fixtures deliberados, error habilitado, mismas reglas y --disable-nosem; evaluate conserva todos los checks. El manifiesto histórico queda idéntico y el ajuste del contexto es solo en memoria, con recibo de reconciliación. Esta extensión mínima está propuesta para revisión, no atribuida a una aprobación antigua.

FAIL observado: los checks remotos previos de PR 27 reportados por el propietario (verificador ausente y audit); no se relanzan. Al reproducir offline el hash antiguo del manifiesto contra el lock nuevo, su discrepancia es confirmada; la regresión del guard verifica el rechazo y la transición acotada.

Una primera validación de este informe falló al incluir rutas con guiones bajos fuera de inline code, que el dialecto canónico rechaza. Se corrigió el formato del informe, sin cambiar ni debilitar el verificador; su CLI final se vuelve a comprobar.

SKIP: npm ci, lint/typecheck con dependencias instaladas, build web/imagen, ejecución real de Semgrep 1.177.0 (no instalado), CI remota, PostgreSQL/SQL, contenedores, pruebas de integración/nativas, custodia y despliegue. Los 20 PASS unitarios no equivalen a un nuevo scan SAST ni a quality remoto completo. Audit cero describe el catálogo consultado, no una garantía futura.

## Hashes de archivos propuestos

docs/ENGINEERING_QUALITY_POLICY.md SHA256 c28b59a8b1f4f1b5225c8aab525e4a9571151e5354bbba6f9a3ad8f11eb8baee.

.github/PULL_REQUEST_TEMPLATE.md SHA256 0304f09e840bea3ec23d325a01f34de95e05eb540ef0587703e8638f7acacd02.

.github/workflows/engineering-policy.yml SHA256 b68a91cfe35373186dd50000859b16159f0e44b178b8863f4ea1be8fe8118eee.

scripts/check-pr-engineering-policy.py SHA256 894a75104652bd22f4843eddc056148d4a3a02c8b1642a21444f607d757f4c97.

package.json SHA256 108ffb7a43c3ae3a38077d481f2eea80b8f2a6e649c54de8689afbaaed5c948f.

package-lock.json SHA256 2a85d62c159729c24878c4e97fb5e7d36f358abc6019225cd3c66c32863f4765.

scripts/check-semgrep-reviewed.py SHA256 1e98714b6814544b0c71445ff1965578bbbd6d920957520a060be67c8617dd07.

tests/static/test_semgrep_reviewed.py SHA256 050236064bae3723feedba162d8d6b5b3fe401bfecd7cf467faa4e5ed07f861d.

tests/static/test_pr_engineering_policy.py SHA256 1f43bdd07ad2955bce36dece7feab551dac30d0c6ccc26c7f2b4ffbfbb8fed35.

Auditoría de lock en consulta local: SHA256 fe58cd1b8860fa6fc2965feeff9dd802b22871d7a1e2e75f5771c6583244743a. Este informe se excluye de sus propios hashes.

## Compatibilidad estática con PR 27

Se aplicó la propuesta como parche local a un worktree separado y detached de 4a12e31744ce89487f0cba1b4ab50188e4abd0b7, sin merge ni cambios de refs remotas. git apply --check pasó y los conjuntos de archivos cambiados son disjuntos. Sobre esa combinación local pasaron 4 pruebas de policy en 0.015s, 16 de Semgrep en 0.057s y las 14 de OpenBao en 0.046s, estas últimas con subprocess.run bloqueado. Dockerfile, healthcheck, Compose base y overlay, server-inputs y RESOURCE_RECORD comparados byte por byte contra PR 27: intactos. Estos 34 PASS no ejecutan imágenes, PostgreSQL ni servicios y no acreditan integración en staging. La modificación final posterior de esta propuesta solo añade evidencia al informe.

El chequeo inicial sin stage no veía las rutas nuevas. git diff --cached --check detecta seis espacios finales en .github/PULL_REQUEST_TEMPLATE.md, idénticos al blob de main. FAIL de formato heredado registrado; se conserva el blob canónico sin reescribirlo. El resto del candidato se conserva; la incorporación documental posterior se verifica por identidad de bytes y referencias, sin atribuir un nuevo PASS global de whitespace. No hay reglas/checks de seguridad desactivados; no se relanza CI para resolver formato ni se cambia el parser.

## Actualización documental sobre f8c8af5

Se incorpora docs/ENGINEERING_QUALITY_POLICY.md exactamente desde main 4f19c36f8eda2c846c6e3c7164814f26841b3bce; referencia docs/ENGINEERING_QUALITY_POLICY.md de la plantilla comprobada. Inventario total: diez archivos frente a staging; esta actualización solo modifica la política y este informe. Los blobs canónicos de verificador, workflow y plantilla, incluidos sus seis espacios finales heredados, se conservan idénticos.

Triggers precisos: abrir PR dispara Quality con PostgreSQL. staging-b1-integration requiere push a staging Y coincidencia de paths: lib/b1/**, tests/b1/**, scripts/openbao-b1-integration.ts, tests/static/test_b1_openbao_integration.py, tests/static/test_b1_custody_harness_wiring.py o su propio workflow. Ninguno de los diez archivos del candidato coincide con esos filtros. No se ha modificado ningún trigger.

PASS documental: igualdad byte por byte con la política de main y las referencias de plantilla; igualdad de los otros blobs canónicos con f8c8af5 y main; inventario de cambios comprobado contra filtros paths. SKIP deliberado: repetición de las 34 pruebas y build, porque esta actualización solo cambia documentación. Sin PR, CI, SQL, merge, despliegue ni cambios de main/staging/PR 27. Los resultados de pruebas anteriores permanecen históricos y no se vuelven a atribuir a una nueva ejecución.
