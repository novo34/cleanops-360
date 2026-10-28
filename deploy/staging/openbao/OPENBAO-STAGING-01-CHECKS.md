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
