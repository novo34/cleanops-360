# OPENBAO-STAGING-01 — scope CLI y OpenBao 2.7.2, 28/10/2026

Corrección sobre 716ada676ea35f7aef0a555e1761cdce518a1cff en PR #27.
Evidencia histórica de gates/consumidores: versión de este informe en ese SHA.
Sin cambios en main/staging/CRM, TLS privado/config preparada, límites, redes,
health ni volúmenes. CPU/build siguen BLOCKED; RESOURCE_RECORD no se rellena con
estimaciones. Sin build, instalación, SQL, secretos, init/unseal o despliegue.

## QG-0 / reutilización

Se extiende el argparse existente antes de leer el registro: el scope selectivo
es exclusivamente evaluación. Rechazo de --compose-out, --inputs, --out y
--include-ingress, solos/parciales/combinados, antes de I/O. Artefactos generales
requieren full-stack predeterminado; el manifiesto de workloads recibe ese gate.
Se añaden tres regresiones CLI y una del pin al harness existente, sin nuevo
runner. Dockerfile: un solo ADD cambia versión y checksum. Pruebas históricas
2.7.1/SQL/ejecución aislada no se reescriben como si fueran pruebas 2.7.2.
Riesgos tratados: scope insuficiente acreditando artefactos amplios, confundir
hash con autenticidad y firma válida con ausencia de vulnerabilidades.

## PASS: pruebas offline

14/14 pruebas del harness en 0.033s, subprocess.run bloqueado durante la suite.
Nuevas pruebas:
- test_cli_selective_rejects_all_artifact_options_before_io (6 combinaciones;
  record inexistente y read_text prohibido, sin render ni archivos creados).
- test_cli_default_full_stack_labels_workload_and_compose_artifacts (main/argparse,
  generación temporal no secreta de workloads y Compose simulado; manifiesto usa
  full-stack, 2000 millicpus y 4608 MiB).
- test_cli_selective_evaluation_only_retains_blocked_result_without_writes.
- test_staging_image_pins_authenticated_272_without_changing_boundary.

Se repitieron las 10 regresiones anteriores de capacidad/include/mantenimiento.
Adicionalmente, 6 invocaciones CLI reales de Python -B verificaron exit2 y mensaje
SELECTIVE_CAPACITY_EVALUATION_ONLY con record inexistente para cada combinación;
ningún archivo creado y ningún proceso Docker/SQL/build ejecutado.
Sintaxis Python mediante compile(): PASS.

```python
import importlib.util, unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('suite', 'tests/static/test_staging_synthetic.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
names = [n for n in dir(m.Synthetic) if n.startswith('test_') and any(v in n for v in
 ['cli_', 'staging_image_pins', 'selective_capacity', 'canonical_include',
  'maintenance_', 'hostinger_non_swiss', 'unknown_low_stale', 'non_synthetic_data',
  'network_scope', 'backup_is_blocked'])]
with patch('subprocess.run', side_effect=AssertionError('External processes forbidden')):
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(m.Synthetic(n) for n in names))
assert result.wasSuccessful()
```

## PASS: firma y checksum independientes

Descargas HTTPS públicas por proxy existente con permiso de red de ejecución.
No se ha eludido proxy/TLS. Tarball únicamente descargado para SHA256, nunca
extraído ni ejecutado. GnuPG 2.4.7; keyring temporal solo público, sin claves
privadas generadas/importadas ni cambios de ownertrust. Clave desde dominio web
oficial, fingerprint contrastado con documentación HTTPS del mismo sitio, ambos
separados del asset release:
- https://openbao.org/docs/install/#gpg
- https://openbao.org/assets/openbao-gpg-pub-20240618.asc
- https://github.com/openbao/openbao/releases/tag/v2.7.2

Primary fingerprint: 66D15FDD87287219C8E15478D200CD702853E6D0.
Subkey: E617DCD4065C2AFC0B2CF7A7BA8BC08C0F691F94.
Firma de checksums.txt: exit0, GOODSIG y
VALIDSIG E617DCD4065C2AFC0B2CF7A7BA8BC08C0F691F94 2026-10-26 1793044033 0 4 0 1 10 00 66D15FDD87287219C8E15478D200CD702853E6D0.
Copia del manifiesto con bytes añadidos: exit1, BADSIG. TRUST_UNDEFINED documentado:
no Web of Trust local ni comprobación humana fuera de banda; confianza basada en
fingerprint publicado por el sitio oficial HTTPS. La clave web y la del release
coinciden byte a byte. Una entrada única del manifiesto firmado coincide con el
hash proporcionado, pin Dockerfile y SHA256 del tarball realmente descargado:
582b1f3c2fdc5afd443b2d57a225ef654de75adea609fdb66731fd582a9cbc96.
Comandos públicos de reproducción en OPENBAO-STAGING-01.md.

## Advisories comprobados

Notas oficiales 2.7.2 y fichas de los cuatro GHSA corregidos consultadas. Catálogo
https://api.github.com/repos/openbao/openbao/security-advisories?per_page=100
leído con curl: 51 entradas, sin Link de paginación; distinto del intento previo
con endpoint bloqueado del conector. Aplicabilidad detallada en el procedimiento:
GHSA-736f-82w7-hj22 relevante al futuro AppRole (mTLS listener no es auth/cert);
GHSA-q824-44ff-f5j5 OIDC provider, GHSA-h76r-48x5-36hg SSH y
GHSA-5pmx-2p74-x478 Transit, funcionalidades fuera de este alcance. Los cuatro
fijan 2.7.2 como parche en la rama 2.7.x. Plugins LDAP/RADIUS tienen versiones
propias corregidas, no inferir cobertura de plugins externos por el binario.
No se declara ausencia de vulnerabilidades: revalidar advisories/revocaciones al
aplicar; dependencias, base Node/OS mutable e imagen final siguen sin auditar.

## FAIL / BLOCKED / SKIP

- Gate CPU/build: BLOCKED, datos pendientes intactos. Sin aprobación de instalación.
- Diagnóstico de transporte inicial: curl en sandbox sin permiso de red no pudo
  alcanzar proxy; resuelto con network enabled manteniendo proxy/TLS. El conector
  no pudo servir assets release; descarga HTTPS directa soportada sí funcionó.
- gpgv no disponible; no se instaló. Verificación equivalente realizada con gpg
  --no-autostart y keyring público; exit0 y negativo exit1 comprobados.
- Ninguna regresión final FAIL. Suite completa, build, prueba runtime 2.7.2,
  consumo/limitación real del builder, SQL, custodia, backend y revisión independiente
  final: SKIP. Los PASS de firma/hash no cubren estos requisitos.

## SHA256 de evidencia pública descargada

d839d376448eceef3ccb5cdd44c4a0749a92a6e4aa2fdaf47255cfa949dfb77e  checksums.txt

9307adebc1d5df49bd5c72a59950aa7993dae0450aa837747dae3075f92a34ea  checksums.txt.gpgsig

1862a196422947124282e026ea4e09d6f7c5d383b628d90c17906936e6e5a8e0  site-key.asc

582b1f3c2fdc5afd443b2d57a225ef654de75adea609fdb66731fd582a9cbc96  openbao_2.7.2_linux_amd64.tar.gz

09495987babd01eeec46ad7c49d671c0dae9a6fd54ec51ccc94fbe0e9b260e2d  install.html

2d61efc1cf7b7f8725d65efe2ee9de30229cf272de3d24a53cfb287909dd2947  advisories.json

## SHA256 de archivos propuestos (este informe se excluye)

2092afd6649e2d451a29518767dd13c9a9cbfa05c04cfb5a78fe4409117ae0c7  scripts/prepare-staging-synthetic.py

d9a590a5c16247a4f59b1c6c839e7e33af2a7a867b37088d6dc6b1d454d8f661  tests/static/test_staging_synthetic.py

c8a67f3170d6f96517d15b760c6cf96ae9aeec424ce0af504cb037eb57d4756b  deploy/staging/openbao/Dockerfile

d651913b7f60f4609b9d48120b700f0a15b22e1c3e6ad6277cb23efcb73405fd  deploy/staging/README.md

69ad788cb5dbc1cfff9b3fc50ca3620a34616e155860777a80199bd32c071ca3  deploy/staging/openbao/OPENBAO-STAGING-01.md


## Reconciliación posterior: falso positivo Gitleaks acotado

Quality del candidato ce7c81151af0314e6d30a8d1da55ebd612c25981 falló en Secret scanning, run https://github.com/novo34/cleanops-360/actions/runs/40704565314 . Audit, Semgrep real y fixtures pasaron; las fases posteriores a Gitleaks quedaron SKIP. Engineering-policy, preparación y regresión de origen pasaron por separado. No se presenta Quality como PASS.

QG-0: inspeccionados el log, el hallazgo histórico de la línea 66, la documentación oficial de firma, .gitleaksignore y el comando del workflow. Se reutiliza .gitleaksignore, que ya contiene un registro exacto de checksum público. No se añade config, runner, regla desactivada, exclusión de ruta ni patrón global. Los dos archivos propuestos son ese registro y esta evidencia; Dockerfile, healthcheck, Compose, inputs y datos permanecen intactos.

Clasificación revisada: la línea histórica contiene la huella pública de la subclave GPG de OpenBao, no material privado ni una credencial. Coincide con la documentación oficial https://openbao.org/docs/install/#gpg y con la firma del manifiesto verificada anteriormente. No es la CA TLS privada de este staging. El detector generic-api-key interpreta el texto Subkey como etiqueta de una posible clave, pero aquí el valor es una identidad pública.

Único registro propuesto, sin modificar el anterior:
4a12e31744ce89487f0cba1b4ab50188e4abd0b7:deploy/staging/openbao/OPENBAO-STAGING-01-CHECKS.md:generic-api-key:66

Verificación independiente fuera del VPS con Gitleaks 8.24.3, la misma versión que CI. Tarball oficial linux_x64 SHA256 9991e0b2903da4c8f6122b5c3186448b927a5da4deef1fe45271c3793f4ee29c, contrastado con checksums del release oficial. Mismo rango histórico y flags que CI: --no-merges --first-parent c2911e0c7db7e5bead68fb7ea54456f3283c80ab^..ce7c81151af0314e6d30a8d1da55ebd612c25981; redacción de valores activa.

PASS de reproducción: registro anterior devuelve exit2 y exactamente ese hallazgo; registro propuesto devuelve exit0 y cero hallazgos. PASS de frontera: escaneo separado con el mismo registro propuesto sigue devolviendo exit2 y dos hallazgos, uno para la misma huella pública en otro archivo y otro para un token ficticio. Ninguna credencial real se generó ni utilizó. No se repiten pruebas de producto ni build por este cambio de clasificación.

Alcance y aprobación: propuesta pendiente del propietario; no se ha movido la rama del PR con esta excepción. Su alcance se agota en ese commit/archivo/regla/línea inmutables; cualquier otro hallazgo requiere revisión propia. Retirar el registro si desaparece ese hallazgo del historial sometido al control y deja de ser necesario para revalidaciones históricas. No altera la entrada histórica ya aprobada ni sustituye controles de secretos, firma, capacidad o autorización.

.gitleaksignore SHA256 5d4c69614b5a3e238e1c7e8a3787bbd821c27c4db89dbfde6676f1d5604127ea.

## Corrección posterior a la integración: consumidor de preflight

PR 27 integrado bajo autorización en staging 7c6059a5390d0f28ca6dc1a3d11dd540720f151d. Quality del head 044e1bca había terminado en SUCCESS. El push activó Staging packaging preflight, consumidor no cubierto por aquella CI de PR: https://github.com/novo34/cleanops-360/actions/runs/40710584771 . FAIL real en Validate syntax and isolation por CLEANOPS_BAO_PRIVATE_IPV4 ausente. El build web de ese job quedó SKIP; no fue un despliegue. Este consumidor debió incluirse antes en la revisión de integración.

QG-0: inventariados workflow staging-preflight, staging-b1-integration, b1-staging-synthetic, staging-compose-check, prepare-staging-synthetic, staging-maintenance y el consumidor protegido staging-sql14. Solo el fixture del preflight de push carecía de los inputs requeridos en su ruta de ejecución comprobada. Los consumidores nativos protegidos siguen requiriendo sus propios inputs/autorizaciones; no se acredita su operación ni se modifican sus guards.

Se extiende el paso existente de fixtures, sin otro script o runner: directorio temporal privado, contraseña ficticia, server.json vacío y directorio TLS vacío, más las cuatro variables Bao necesarias para cargar el include. Las direcciones 10.249.88.0/24 y 10.249.88.2 reutilizan los fixtures del harness, no representan una red observada o autorizada del VPS. Sin certificados, claves reales, perfiles activos ni arranque de servicios. El build del job sigue apuntando solo a web. La limpieza existente elimina exclusivamente el directorio generado, con rechazo de rutas fuera de su padre/prefijo y de symlinks.

QG-1/QG-2: causa localizada en un consumidor del Compose canónico. Se conservan triggers, permisos, runner, timeout, config -q, comprobador estático y build web. Tres archivos propuestos: workflow existente, harness existente y este informe. No cambia runtime, Dockerfile, healthcheck, TLS ni datos; la imagen OpenBao ya construida mantiene su procedencia original. No se altera main/staging durante la preparación del candidato.

PASS local: 41 pruebas de policy, guard Semgrep y staging, con 8 invocaciones Compose 2.40.3 exclusivamente config y 3 ejecuciones del fixture Bash en directorios temporales. La nueva regresión ejecuta el bloque real del workflow: config completa valida y solo incluye web/postgres con perfil apagado; quitar individualmente cualquiera de las cuatro variables falla; una ruta de limpieza con traversal se rechaza y conserva el archivo ajeno. La prueba falla con el workflow anterior por ausencia del input Bao y pasa con la corrección. No se ejecutó Docker daemon, build, SQL ni servicios en esta verificación. No son pruebas nativas del servidor ni aceptación de capacidad.

CI real y revisión independiente del nuevo candidato: pendientes. Publicar un PR nuevo activaría Quality con PostgreSQL en Actions y requiere autorización específica; no se abre ni se integra con esta preparación. El candidato tampoco autoriza despliegue, build del VPS, SQL, ceremonia, custodia o activación del backend.

SHA256 de los archivos actualizados (informe excluido):
73a5565d12d1e9b60abb88d305d93acad4a05a60140a2c8c32847b36f46ec478  .github/workflows/staging-preflight.yml
d9a590a5c16247a4f59b1c6c839e7e33af2a7a867b37088d6dc6b1d454d8f661  tests/static/test_staging_synthetic.py

## RUNTIME-CUSTODY-01 — preparación sobre staging 6d89888

Fuente base oficial 6d89888804ffa4e2ba7635878c88eaf7f3b9c997; main leído
4f19c36f8eda2c846c6e3c7164814f26841b3bce; R4 9a4c8b90a159f2853f040dc5597042c17408da00;
CRM conservado 09c578137860cfc3726e67a21304a228c0657061. QG-0, inputs/decisiones,
ruta bootstrap y auth, política operativa/admin y futuras autorizaciones A-D
en la sección nueva del procedimiento OPENBAO-STAGING-01.md. Los bloques previos
son evidencia histórica de instalación/preparación, no operaciones a repetir.

Estado comunicado por el propietario: web/PG/Bao healthy sin reinicios, Bao2.7.2
inicializado y desellado, staging 1-de-1, auditoría privada correlacionada y token
HMAC con rechazo sin token; backend cerrado, Autodeploy OFF. No se inspeccionó
VPS ni auditoría real aquí. No basta para afirmar custodia integral/R4/CRM completos.

Inventario del diff: ocho blobs canónicos de main (cuatro módulos de lease/PG y
sus cuatro suites), dos documentos existentes actualizados y un archivo nuevo
runtime-catalog.review.sql. Deadline módulo/test son nuevos en staging pero ya
canónicos en main. Cero nuevos runners ni motor de permisos, setter de runtime,
cliente AppRole duplicado o tabla SQL. No se toca Dockerfile, Compose, TLS,
private-adapter, runtime/proxy, service/backend/contracts/broker, R4/CRM/historia.

PASS ejecutados localmente:

- npm ci --ignore-scripts --audit=false --fund=false, lock existente: 570 paquetes;
  únicamente dependencias de desarrollo en este workspace, ningún lifecycle script,
  ningún servicio/build ni clave real. Lock y package.json sin cambios.
- 26/26 Node tests de custody-composition, custody-deadline, openbao-keys y
  pg-identity-driver, 764ms. Mock HTTPS/provider y pool en memoria, sin PG/Bao.
- 28/28 Node tests de private-adapter/service/v4-broker, 477ms, fronteras
  HTTP/transacción en memoria. Sin sockets/consultas reales a PostgreSQL.
- 16/16 tests estáticos de guard/contexto Semgrep, 105ms. Manifiesto histórico
  y findings no se modifican. Esto NO es un scan Semgrep nuevo.
- 2/2 tests estáticos custody_harness_wiring, 1ms: runtime permanece cerrado y
  no importa harness; el consumidor sintético usa la composición privada.
- ESLint de los ocho archivos canónicos: exit0; tsc --noEmit --incremental false
  sobre proyecto: exit0. Sin next build ni generación de tipos/build.
- Igualdad de los ocho blobs importados con main comprobada byte por byte.
  Trece rutas protegidas del runtime/despliegue/config iguales a 6d89888.
- Archivo catálogo: inspección léxica de solo lectura, sin DDL/DML fuera de
  literales ni SELECT sobre filas app/identity_private/auth_api; sin pg_authid.
  Se propone BEGIN READ ONLY y límites locales; NO se ejecutó/parseó en PG.

Comandos reproducibles offline tras disponer de dependencias del lock:

```sh
node --experimental-strip-types --test --test-isolation=none tests/b1/pg-identity-driver.test.ts tests/b1/openbao-keys.test.ts tests/b1/custody-deadline.test.ts tests/b1/custody-composition.test.ts
node --experimental-strip-types --test --test-isolation=none tests/b1/private-adapter.test.ts tests/b1/service.test.ts tests/b1/v4-broker.test.ts
python -B -m unittest discover -s tests/static -p test_semgrep_reviewed.py -v
python -B -m unittest discover -s tests/static -p test_b1_custody_harness_wiring.py -v
npx --no-install eslint lib/b1/custody-composition.ts lib/b1/custody-deadline.ts lib/b1/openbao-keys.ts lib/b1/pg-identity-driver.ts tests/b1/custody-composition.test.ts tests/b1/custody-deadline.test.ts tests/b1/openbao-keys.test.ts tests/b1/pg-identity-driver.test.ts
npx --no-install tsc --noEmit --incremental false
```

FAIL/diagnóstico conservado: primera ejecución sin node_modules falló al resolver
otpauth; instalación local con scripts desactivados y repetición de esa suite dio
26/26 PASS. Comprobación léxica inicial demasiado simple detectaba UPDATE dentro
del literal de has_table_privilege; se corrigió la comprobación para separar
literales/comentarios, sin cambiar consulta ni ejecutar SQL. git diff --check
señala una línea vacía final en pg-identity-driver.ts y su test, ambas ya exactas
en main; se conservan los blobs canónicos, no se oculta como PASS global.

BLOCKED: conectar runtime real hasta catálogo/identidad/keys/ingress y renovación
del token provider aprobados, más verificación de bootstrap/renovación de sesión.
No se introduce un encendido incompleto en nombre de este objetivo. El diff de
conexión posterior se delimita por archivo en el procedimiento y requerirá los
inputs reales. R4/AUD-031 solo es previo si la provisión requiere invitación; no
se importa ni degrada su firma. CRM tiene SQL/ACL/guard de módulo pendientes.

SKIP: consulta runtime-catalog.review.sql, parser PostgreSQL real (pglast no
disponible), funciones/roles/datos desplegados, Bao APIs/capabilities, credenciales
operativas, revocación root, build/deploy, aplicación de SQL14 u otro SQL, TLS real,
recuperación, E2E login/TOTP/CRM, CI remota y revisión independiente del nuevo SHA.
No se abre PR que dispare Quality/PG ni se reutiliza autorización de CI de PR28
para este incremento nuevo. Rama revisable sin modificar main/staging/R4/CRM.

### SHA256 de RUNTIME-CUSTODY-01

5002de44512401ac5c052d3ef0f495781309317d59426d7f0201cd1af95761f2  lib/b1/custody-composition.ts

b9314a806e6c52088bd86871ea6b53e0b2f6f4f477f184877f0cb2268d8f795a  lib/b1/custody-deadline.ts

265611c3d706f7c8406faa08d9660074621871cb014502493ba34b77d051c13f  lib/b1/openbao-keys.ts

6f5ec3ccc65a9a20796615824e8e8f920849eef54e3e10ba6cae0923a482c3e0  lib/b1/pg-identity-driver.ts

34cef8de0b8cbee97b781a2d22d739e0d056b408430b59f0a38fd160a95c9bc4  tests/b1/custody-composition.test.ts

5b5592b003422422c83cd130ce7032fe06ca712fddd382b8fcba4ca87e4e26f0  tests/b1/custody-deadline.test.ts

488084cc5cc989dfc15d3e4cab23f150fc721f3085858cdabdb2ba28fda085d7  tests/b1/openbao-keys.test.ts

368ad6f4ef0585f11df356726a55673b5726593c2e439dbf213dc4ab02145e87  tests/b1/pg-identity-driver.test.ts

200a10a086bcf100f3c3dedb5b37aa80c079709d9f23a88f20c710545bd6775c  deploy/staging/openbao/runtime-catalog.review.sql

0c9bff92bb252b7b9358d07574e79bc358fabb5c5f1f7cdaa869d3fcc7638e04  deploy/staging/openbao/OPENBAO-STAGING-01.md

Los hashes anteriores del informe se conservan como historia del SHA entonces revisado; este bloque identifica los bytes de la preparación actual. El informe se excluye a sí mismo.
# Continuación local sobre 198b4e4 — 28/10/2026

QG-3: candidato original 4d5563899bc327f3c272ef13625ebffc3cc96b46 reconciliado
con staging 198b4e41d89c373c7aebda23ee20700643ce339c. Sin merge remoto, push,
PR, SQL, Bao, Docker, generación de credenciales ni activación. La entrega queda
como delta local sobre staging; no hay commit de merge en la rama entregada.
El alcance y decisiones pendientes están en el apartado de continuación del
procedimiento OPENBAO-STAGING-01.md. No se han modificado runtime.ts, SQL14,
migraciones, R4, CRM, AUD-031, Compose ni workflows.

Validación auténtica local con Node v24.19.0:

- PASS: `node --experimental-strip-types --test --test-isolation=none tests/b1/openbao-keys.test.ts tests/b1/custody-deadline.test.ts tests/b1/custody-composition.test.ts tests/b1/pg-identity-driver.test.ts`: 27/27, cero omitidos.
- PASS: `npm run typecheck`.
- PASS: `npx eslint lib/b1/openbao-keys.ts tests/b1/openbao-keys.test.ts`.
- PASS: `git diff --check`.
- PASS tras corrección de comentario lint: suite openbao-keys 7/7.
- Primer intento: 18 PASS y una suite sin cargar por dependencia otpauth ausente.
  Resuelto con `npm ci --ignore-scripts --audit=false --fund=false`, usando lock
  existente, sin modificarlo ni ejecutar lifecycle scripts. La ejecución 27/27
  posterior es la evidencia completa. Lint señaló un bloque vacío del test nuevo;
  corregido con comentario que explica el bloqueo intencional del event loop.
- NO EJECUTADO: integración PG16/Bao, cancelación nativa, TLS real, AppRole,
  rotación/revocación, R4/invitación/TOTP real, navegador y despliegue.

No se abre PR porque Quality de esta rama iniciaría PostgreSQL y ejecutaría SQL,
fuera del alcance autorizado. No se alteran guards para evitar esa restricción.
La revisión independiente y aceptación del propietario siguen pendientes; estas
pruebas unitarias no acreditan conexión funcional ni custodia operativa completa.

## Corrección KV end tras revisión independiente — 28/10/2026

Referencia revisada: patch af1f15677f3804ee88e854c207b603fd9bab301e021154714e01b66839e179d8.
HEAD local y base exacta conservados: 198b4e41d89c373c7aebda23ee20700643ce339c.
El patch actualizado es el delta completo contra esa base, no solo esta corrección.
Las secciones anteriores son evidencia histórica; sus hashes no identifican los
bytes posteriores a esta corrección. Ningún resultado del VPS se presenta como
comprobación local: SQL14 instalado, fila b1_sql14 y procedencia, Bao desellado y
auditoría verificada siguen siendo hechos comunicados por el propietario.

QG-0: objetivo observable, impedir que una lectura KV completada fuera del plazo
inicie work bajo una lease nueva; mismo módulo B1 y requisitos de custodia.
Inventario: read/end/fail de createOpenBaoKeys, withKeys y limpieza de buffers,
withB1Custody, createCustodyDeadlinePool, unit-of-work PG y cuatro suites originales.
Se corrige el punto canónico en openbao-keys.ts y se extiende su suite existente;
no nuevo cliente, runner, contrato de tenant ni dependencia. Documentación existente
de procedimiento/evidencia actualizada; sin archivos nuevos adicionales en Git.
Riesgo: timer retrasado por el event loop, clave y respuesta privadas retenidas;
la comprobación monotónica previa a resolve usa catch/finally existentes para
borrar clave decodificada, raw y chunks. No cambia acknowledgeCommit ni la entrega
de un resultado cuyo COMMIT ya fue confirmado. Conserva regresión de token tardío.
Plan ejecutado: demostrar fallo antes del fix, cuatro suites originales completas,
typecheck, lint de los ocho módulos/tests del candidato y diff contra HEAD.

### Reproducción auténtica antes del fix

Se añadió únicamente la nueva regresión y se ejecutó contra el código vulnerable:

```sh
node --experimental-strip-types --test --test-isolation=none --test-name-pattern='KV completion after the acquisition deadline' tests/b1/openbao-keys.test.ts
```

FAIL esperado, exit 1: 1 test, 0 PASS, 1 FAIL, cero omitidos;
AssertionError: Missing expected rejection, duración total 203.499058 ms.
Log completo conservado en el paquete descargable: custody-kv-regression-before.log.
No se presenta ese FAIL como ejecución final ni como fallo de infraestructura.

### Validación final ejecutada después del fix

Node v24.19.0; dependencias del lock ya instaladas, sin reinstalar paquetes.
Comandos ejecutados, todos exit 0:

```sh
node --experimental-strip-types --test --test-isolation=none tests/b1/openbao-keys.test.ts tests/b1/custody-deadline.test.ts tests/b1/custody-composition.test.ts tests/b1/pg-identity-driver.test.ts
npm run typecheck
npx --no-install eslint lib/b1/custody-composition.ts lib/b1/custody-deadline.ts lib/b1/openbao-keys.ts lib/b1/pg-identity-driver.ts tests/b1/custody-composition.test.ts tests/b1/custody-deadline.test.ts tests/b1/openbao-keys.test.ts tests/b1/pg-identity-driver.test.ts
git diff HEAD --check
```

PASS: 28/28, cero FAIL/cancelled/skipped/todo, duración total 1270.641213 ms.
Desglose: composición 9, deadline 4, claves Bao 8, driver PG 7.
Los 27 casos previos se revalidaron, incluida regresión del token tardío y recibo
tras COMMIT confirmado tardío; la regresión KV es UN caso nuevo, no otra suite.
El resultado anterior de 27/27 sigue siendo histórico, no se renombra como 28/28.

Nueva regresión:
OpenBao KV completion after the acquisition deadline rejects and wipes received material before work.
Token inmediato del fixture, HTTPS totalmente simulado, timeoutMs=10; tras data
se bloquea el event loop durante al menos 30 ms antes de emitir end, impidiendo
que el timer sea la causa del rechazo. Comprueba AUTH_DEPENDENCY_UNAVAILABLE,
exactamente un request simulado, work no invocado, respuesta agregada no vacía
capturada y borrada, y chunk recibido borrado. La clave decodificada se borra en
el catch canónico; el test observa directamente raw/chunk, no strings internos JS.
No se afirma borrado perfecto de strings/base64 o memoria del recolector de JS.

Los logs completos de esta ejecución y checks se entregan como
custody-kv-suites.log, custody-kv-typecheck.log, custody-kv-lint.log y
custody-kv-diff-check.log. Lint y diff exitosos no producen salida; el archivo de
metadatos del paquete registra sus exit codes. Node emitió el aviso no bloqueante
MODULE_TYPELESS_PACKAGE_JSON; no se cambia package.json para silenciarlo.

### QG-3 / alcance y límites

PASS comprobados localmente: regresiones con EventEmitter/HTTPS simulado, buffers,
pool en memoria, protocolo transaccional, typecheck, lint y diff limpio.
NO EJECUTADO: SQL/Bao reales, credenciales reales, TLS/AppRole reales, activación,
build/despliegue, push, PR, merge ni pruebas de navegador. Ninguna evidencia nueva
de cancelación real PostgreSQL, ni de conexión funcional del login al VPS.
runtime.ts, SQL14/migraciones, CRM y AUD-031 permanecen intactos; no cambian gates,
workflows ni autorizaciones. Revisión independiente del nuevo patch pendiente.

SHA256 de los dos archivos de código/test corregidos:

1936c28c24d47527330e4a6dc2cf19618f0a91eab891095de8d00432052fe78c  lib/b1/openbao-keys.ts
8658240e1a97ff87ea9527c231cf674bb49efe22871668e65c2abf1be14dbe7d  tests/b1/openbao-keys.test.ts

El SHA256 del patch completo actualizado se entrega fuera de este documento para
evitar una referencia circular al hash del propio patch que lo incluye.

## Diseño operativo documental posterior a a6d2f45 — 28/10/2026

Alcance autorizado: concretar recomendaciones PG/AppRole/primer actor en los
documentos existentes. No implementación de decisiones normativas nuevas.
HEAD/base: 198b4e41d89c373c7aebda23ee20700643ce339c. Antes de editar se calculó
SHA256 de git diff HEAD --binary y coincidió exactamente con
a6d2f45ac2bd3e83324d4b0a7c5a7a10de5d7bc812104d7c35c67b507442e5c3.
El ZIP conserva esos bytes como reviewed-a6d2f45.patch; el delta documental y el
patch consolidado nuevo se etiquetan aparte. No se atribuye al patch nuevo la
revisión independiente del anterior.

Referencias revalidadas por conector GitHub, solo lectura:

- staging: 198b4e41d89c373c7aebda23ee20700643ce339c.
- prep/staging-runtime-custody-01: 4d5563899bc327f3c272ef13625ebffc3cc96b46.
- codex/r4-aud-031: 9a4c8b90a159f2853f040dc5597042c17408da00.

Se obtuvo el árbol R4 con git fetch origin codex/r4-aud-031 para lectura local,
sin checkout, merge o push. Se inspeccionaron su aceptación TS, SQL4, variantes
SQL5 y manifest AUD031. Se encontró exactamente la firma de cuatro argumentos
en 005-invitation-acceptance.aud031-candidate.review.sql, no en el candidato r3.
SHA256 de ese SQL verificado offline contra el manifest del mismo árbol:
06156e11e460102cae3568b0cf58d53b8b7638293d8b712d11fd86a379e65471.
No se ejecutaron sus tests ni SQL, no se repitió AUD-031.

Inventario/búsqueda documentados en el nuevo apartado del procedimiento: SQL14
roles/ACL/require_enabled/tablas, pg-identity-driver/v4-broker/approved-backend,
renderer y README de Bao, harness sintéticos, runtime/proxy, Product Master/SRS,
AUTHENTICATION_SPEC/DATA_MODEL/ROADMAP/gates, scripts y git log --all por
bootstrap/provision/invitation. No se halló contrato aprobado del primer actor
en esos árboles/historial disponibles; no se extrapola a documentos privados.
No confundir seed data normativo de pruebas con autorización de provisioning.

Diseño entregado: SQL PG-P1 y verificaciones PG-P2 embebidos NO EJECUTADOS;
LOGIN separado/herencia PG16 sin SET ROLE, transporte TLS+SCRAM y control HBA;
policy template BAO-B1 y protocolo de distribuidor cert/supervisor en memoria,
sin otro cliente Bao ni renovación implícita; FIRST-ACTOR-01 propuesto con
singleton, auditoría, status/recibo y recuperación de COMMIT incierto.
R4 no es previo al primer actor recomendado; slice exacto de invitaciones queda
identificado para usuario posterior, sin exigir cerrar todo R4. No hay emisor
autorreferente, INSERT administrativo ni fixtures usados como provisioning.

Validación de ESTE encargo: solo inspección/diff/hash y comprobación de paquete.
No se reejecutaron suites de código, typecheck o lint: no hay cambios ejecutables.
La evidencia anterior 28/28/typecheck/lint pertenece a la corrección KV ya
registrada. El propietario comunica revisión independiente del hash a6d2f45 y
20/20 (19 originales más regresión KV independiente); no se afirma haber ejecutado
esas 20 pruebas aquí ni se suman a las 28 como si fueran 48 pruebas distintas.
Estado VPS (SQL14/fila b1_sql14/Bao/auditoría) sigue comunicado, no inspeccionado.

Controles offline de entrega: git diff HEAD --check; igualdad de todos los blobs
no documentales del delta con la reconstrucción del patch revisado; SHA256 del
SQL5 AUD031 obtenido por git show; ambos únicos documentos modificados desde
ese patch; integridad ZIP, hashes, presencia de patch original y docs completos.
Resultados y lista exacta de entradas en DELIVERY-METADATA.json/SHA256SUMS.txt
del ZIP. SQL-PG y HCL son propuestas textuales, no sintaxis nativa acreditada.

Sin SQL/Bao reales, credenciales generadas, provisión, activación, build/deploy,
push, PR, merge o cambios a Compose efectivo/Autodeploy. Runtime cerrado;
CRM y AUD-031 intactos. Aprobar diseño no autoriza las escrituras futuras O4–O8;
PG-P1/PG-P2, ACL cert y FIRST-ACTOR necesitan revisión y permisos específicos.

## Incremento canónico entre entornos — 29/10/2026

Solo cuatro archivos cambian desde el diseño anterior: pg-identity-driver.ts,
su test y estos dos documentos existentes. Runtime no consume aún el factory.
QG-0/alternativas y puntos de extensión en el apartado final del procedimiento.
No ZIP nuevo ni documentos históricos repetidos como evidencia nueva.

GitHub revalidado mediante fetch_commit, solo lectura: staging
198b4e41d89c373c7aebda23ee20700643ce339c, candidato remoto
4d5563899bc327f3c272ef13625ebffc3cc96b46, codex/r4-aud-031
9a4c8b90a159f2853f040dc5597042c17408da00. HEAD local sigue en staging;
no se presenta este delta local como cambio publicado en esas referencias.

Fuentes oficiales leídas mediante fetch_file de openbao/openbao, tag v2.7.2:
website/content/docs/agent-and-proxy/autoauth/index.mdx,
autoauth/methods/cert.mdx, autoauth/methods/approle.mdx,
autoauth/sinks/file.mdx y agent/index.mdx. Acreditan documentalmente auto-auth,
renew/reauth, cert reload, archivos/unwrap de AppRole y sink de token; NO son
ejecuciones de Agent/Bao ni prueban configuración instalada. Intentos de lectura
de código cert en dos rutas supuestas y API cert en otra ruta devolvieron 404;
no se citan como fuentes ni se infiere que falte el método documentado.

Recomendación vigente pendiente: Agent cert por workload con sink tmpfs, sin
distribuidor/supervisor propio. Requiere aprobar método, canal de certificados,
permiso explícito renew-self, sink/loader y pruebas de lifecycle. No se instala
policy ni se presupone que Agent resuelva distribución de SecretID/certificados.
FIRST-ACTOR genérico sigue siendo propuesta normativa, no código de provisión.

Validación local nueva, Node v24.19.0; ninguna conexión PG ni credencial obtenida:

```sh
node --experimental-strip-types --test --test-isolation=none tests/b1/pg-identity-driver.test.ts
npm run typecheck
npx --no-install eslint lib/b1/pg-identity-driver.ts tests/b1/pg-identity-driver.test.ts
git diff HEAD --check
```

PASS: 8/8 en la suite modificada (7 casos previos más 1 de configuración), cero
FAIL/skipped, ejecución final de la suite 139.736399 ms. Verifica construcción
sin sockets/password, mismo factory en staging/production, TLS verificado/CA
copiada/opciones explícitas y rechazo de endpoint/rol/CA/límites/DSN inválidos.
Typecheck, lint y diff: exit 0. Aviso MODULE_TYPELESS_PACKAGE_JSON no bloqueante.
Se ejecutó la suite al añadir el factory y se revalidó tras endurecer CA y
verificación del nombre TLS; no se suman esas ejecuciones como pruebas distintas.
No se reejecutaron suites Bao/deadline/composición, AUD-031 ni pruebas históricas.
Sus PASS anteriores permanecen atribuidos a sus entregas; no se afirma que los
28/28 completos se hayan ejecutado con este factory nuevo.

Sin SQL/Bao reales, generación/provisión de credenciales, activación, VPS, build,
deploy, push, PR o merge. No cambios a SQL14, Compose efectivo, Autodeploy, CRM,
AUD-031, openbao-keys/deadline ni renderer/policies. Falta aceptación PG16 real
de ACL/herencia/SET/HBA/TLS; Agent 2.7.2 real con sink/renew/reauth/revocación y
rotación PKI; FIRST-ACTOR único con entregas/recuperación; integración web futura.
