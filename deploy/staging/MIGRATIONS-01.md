# MIGRATIONS-01 — preparación antes de primera instalación

Base oficial verificada: staging 6d89888804ffa4e2ba7635878c88eaf7f3b9c997.
Rama nueva prep/migrations-01; no modifica prep/staging-runtime-custody-01 en
4d5563899bc327f3c272ef13625ebffc3cc96b46. No SQL, PostgreSQL, servicios, DB CI,
merge, despliegue ni operaciones VPS ejecutados. Backend sigue cerrado.

## Estado observado y procedencia

El propietario informa el 28/10/2026: PostgreSQL16, cleanops_staging,
Compose cleanops360-f4fxmd, sin roles/objetos B1/CRM, sin esquemas adicionales,
relaciones/rutinas public, roles cleanops adicionales ni extensiones adicionales;
public._migrations ausente. Son inspecciones de solo lectura comunicadas, no
lecturas ejecutadas aquí. Registro separado migrationsObserved en RESOURCE_RECORD;
no se fabrica hora exacta ni se activa ninguna autorización. Ausencia observada
no reserva el estado: el instalador lo vuelve a comprobar al aplicar autorizado.
Web, PG y Bao se conservan. No se reinstala nada para hacer coincidir este informe.

## QG-0 antes de implementación / inventario y decisión

Objetivo: completar el mecanismo canónico de primera instalación e incrementales
con historial verificable, sin convertir SQL14 en migración automática. Leídos
AGENTS.md y ENGINEERING_QUALITY_POLICY, manifiesto/runner, SQL0001 y SQL14,
instalador staging, RESOURCE_RECORD, tests/trusted-migrations, tests/system-status,
static/test_staging_synthetic, script nativo test-staging-postgres, package.json,
workflows Quality/b1-staging-synthetic/staging-preflight y llamadas db:migrate.

Ruta: npm db:migrate → trusted-migrations (allowlist/hash) → migrate-postgres
→ una conexión/transacción/bloqueo → historial+SQL revisado. B1 explícito:
staging-sql14.py (autorización/ownership/fresh PG16) → el MISMO migrate-postgres
en modo formatter OFFLINE → psql en el PG existente y su mismo historial.
No nuevo runner, journal paralelo, seed ni motor de permisos. No se modifican
las migraciones históricas, grants/roles de aplicación, R4, CRM o AUD-031.

Se descarta: reejecutar todos los SQL; descubrir archivos para autorizar ejecución;
añadir SQL14 a db:migrate; adoptar un id histórico sin checksum; insertar baseline
por separado después de SQL; quitar BEGIN/COMMIT del archivo firmado; inventar
que el hash prueba qué objetos ya instaló un tercero. Se extienden puntos canónicos.

Diff mínimo (once archivos):

- scripts/trusted-migrations.mjs y .d.mts: mismos bytes SQL/hash/no-follow; descriptors
  id/profile/sha/sourceFile; baseline B1 explícita separada. La declaración existente
  también es consumidor y se actualiza con el contrato nuevo.
- scripts/migrate-postgres.mjs: estado/plan, bloqueo, protocolo del historial,
  pendiente/aplicada y formatter B1. Nuevo migrate-postgres.d.mts: solo tipos para
  consumidores TS/tests con allowJs=false; no otra implementación. Dueño ingeniería.
- scripts/staging-sql14.py: identidad canónica, base, frescura y envelope del runner
  existente; conserva hash y autorizaciones. scripts/test-staging-postgres.py solo
  alinea su etiqueta simulada con el registro canónico; el nativo NO se ejecuta.
- tests/trusted-migrations.test.ts y tests/static/test_staging_synthetic.py: se
  extienden harness existentes, sin nuevos runners ni mocks productivos.
- deploy/staging/RESOURCE_RECORD.json: databaseName y observación atribuida,
  sin permisos de aplicación concedidos. README y este procedimiento/evidencia.
  Este documento es nuevo, dueño mantenedor, consumidor revisión/operador; no runtime.

Riesgos: compatibilidad del INSERT histórico, estados ambiguos de COMMIT, permisos
DDL de la conexión, objetos manuales previos, bloqueo solo cooperativo y fuentes
locales Git. Los checks de simulación no equivalen a atomicidad PG16 acreditada.

## Contrato y perfiles

La allowlist explícita continúa en trusted-migrations.mjs. Todos sus archivos se
verifican por SHA256 antes de crear el Pool o conectar; no se autoriza por glob.
O_RDONLY/O_NOFOLLOW/O_NONBLOCK y archivo regular se conservan. El perfil por defecto
foundation solo contiene 0001_system_status; b1 no tiene incrementales aprobadas
hoy y declara SQL14 únicamente como baseline inicial. Una futura incremental B1
requiere entrada explícita profile=b1, hash y revisión, no otra implementación.
Sus colisiones/precondiciones deben diseñarse para fallar, no adoptar tablas.

Se separan deliberadamente los historiales por perfil en el mismo registro:
un historial B1 no puede ejecutarse como foundation ni mezclarse automáticamente.
No ejecutar npm run db:migrate por defecto contra este staging destinado a B1.
0001 crea organizaciones/flags public, un dominio distinto de app.organizations;
instalarla primero haría fallar la condición vacía de SQL14. Se conserva para los
consumidores Quality/foundation existentes; no se usa como paso previo B1.

public._migrations registra id, checksum, profile, source_file, source_commit,
runner_sha256, approval_reference, applied_by y applied_at. La procedencia liga
el hash SQL al archivo del commit local real mediante git show HEAD:path antes
de conectar; el hash del runner incluye ambos .mjs ejecutados. La fecha/actor
son clock_timestamp()/CURRENT_USER del servidor. No son firma del operador ni
prueba criptográfica contra un DBA que pueda alterar el historial. Para B1 se
conserva la referencia de aprobación expresa del registro privado. Foundation
permite MIGRATION_APPROVAL_REFERENCE; su default local-cli describe el origen de
ejecución, no sustituye una autorización humana.

Se rechazan ID desconocido/duplicado, perfil/fichero distinto, checksum cambiado,
metadatos incompletos, esquema incompatible/legacy y secuencia no prefija. Un
registro compatible pero vacío también falla: el mecanismo nunca lo deja vacío
tras COMMIT. No hay upgrade automático de la tabla antigua de dos columnas, ni
opción stamp/record-only/adopt para objetos encontrados. Cualquier discrepancia
requiere investigación/reconciliación y autorización aparte; nunca DROP/reset.

Compatibilidad indispensable de 0001 sin cambiar sus bytes: intenta INSERT solo
con id y ON CONFLICT. La comprobación NOT NULL ocurre antes del conflicto. Por
ello los seis campos nuevos de metadatos son nullable SOLO durante la transacción
inicial; antes de COMMIT se sellan NOT NULL. El runner PREINSERTA
la fila completa antes de SQL0001 en la misma transacción. El intento histórico
id-only puede alcanzar ON CONFLICT y no reemplaza metadatos. Ninguna fila incompleta
se considera aplicada: validateHistory rechaza null/checksum/procedencia faltante
y un esquema committed sin NOT NULL. El sellado no adopta ni actualiza un registro
legacy: solo afecta a la tabla recién creada por esta misma transacción.
No hay defaults que inventen el hash/commit de una ejecución. Applied_by/at sí tienen
sus defaults del servidor. Este detalle debe validarse también con PG16 real.

## Plan, concurrencia y fallos

--offline-plan verifica archivos sin PG/DSN; estado UNKNOWN_NOT_CONNECTED, nunca
lo presenta como aplicado/pendiente observado. --plan abre una transacción REPEATABLE
READ READ ONLY: solo catálogos y filas del historial, no crea la tabla ausente,
no cambia esquema ni aplica SQL de artefactos. Puede rechazar objetos sin registro
como incompatibles. El resultado muestra pending, baseline y history con hashes,
fecha/actor/procedencia; no imprime DSN/passwords ni errores crudos de PG.

Aplicación: BEGIN → SET LOCAL search_path fijo → pg_try_advisory_xact_lock
(1869764913,1) → validar historial/estado inicial → cambios y filas → COMMIT.
Un segundo runner/instalador en esta base recibe MIGRATION_BUSY, no espera ni
reintenta. No es un bloqueo de cualquier DBA ni de otras bases; se exige ventana
sin DDL ajeno. Si no existe historial, o hay objetos no registrados, no se ejecuta
IF NOT EXISTS como adopción. La frescura incluye esquemas, relaciones/rutinas
public y extensiones adicionales; B1 añade roles cleanops fuera de bootstrap.

Cada fila y efecto de las incrementales van en la misma transacción. Un error
revierte DDL, filas e historial; conexión descartada ante incertidumbre. Si COMMIT
se ejecutó pero se perdió su respuesta, no se repite automáticamente: inspeccionar
el historial en otra operación autorizada. Un --apply posterior solo omite lo que
encuentra con checksum/procedencia exactos; no restituye datos ni inventa éxito.

Solo se admiten artefactos transaccionales revisados. No se ha añadido soporte de
CREATE INDEX CONCURRENTLY, VACUUM u operaciones que requieran fuera de transacción.
Tampoco se ejecutan archivos incrementales con sus propios COMMIT no revisados:
la allowlist actual solo incluye el 0001 transaccional sin controles propios.

## Baseline B1 exacta, sin alterar SQL14

SQL14 se mantiene fuera del conjunto automático. Hash inmutable:
965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa.
El instalador existente conserva verify-only por defecto; --apply requiere
syntheticOnly, los tres límites de datos/comunicaciones, deploymentAuthorized,
deploymentApprovalReference y sql14FreshInstallAuthorized. Compara composeProject,
composePath y databaseName con RESOURCE_RECORD canónico; proyecto incorrecto o
labels/servicio/ports discrepantes abortan, sin buscar otros contenedores.
Conexión fija a cleanops_staging, PG16 y cluster vacío comprobados.

El nuevo formatter de migrate-postgres emite un preámbulo: BEGIN, bloqueo común,
revalidación de base/cluster vacío/registro AUSENTE dentro de esa transacción,
creación del journal, inserción b1_sql14 con hash/procedencia y sellado NOT NULL.
Después concatena
el archivo SQL14 completo e intacto, incluidos BEGIN y COMMIT. Psql usa la misma
conexión y ON_ERROR_STOP. Su BEGIN histórico emite un warning, NO abre otra
transacción ni confirma la anterior; su COMMIT final confirma baseline e historial
juntos. No se añade un registro separado después ni se recortan bytes de SQL14.

Semántica contrastada en documentación oficial PostgreSQL16:
https://www.postgresql.org/docs/16/sql-begin.html . Esto respalda el diseño, NO es
prueba ejecutada del envelope. El timestamp B1 es el instante del pre-registro
que solo resulta visible si se confirma toda la baseline; no se presenta como
hora exacta del WAL COMMIT. Si falla psql, vence el timeout del transporte Docker o se pierde la conexión,
no suponer que el servidor ya canceló/retrocedió ni repetir --apply para
forzar un registro: inspeccionar con plan y tratar resultado ambiguo. Si hay
objetos/registro previo, el instalador RECHAZA, incluso una baseline ya registrada.

## Consumidores y CI

npm run db:migrate conserva la llamada y el perfil foundation predeterminados;
Quality instala la misma 0001 sobre su PG efímero. tests/system-status consulta
id/applied_at del registro y permanece compatible con las columnas añadidas.
La extensión de tests/trusted-migrations mantiene las seis pruebas de archivos
(incluidos symlinks/hash/no discovery). El smoke PG existente recibe solo el
cambio de etiqueta de proyecto para no fallar ownership cuando llegue autorización.

No se modifica ningún trigger, guard, permiso ni workflow. No se abre PR: Quality
arrancaría PostgreSQL y esta tarea no lo autoriza. Tampoco push staging: futuros
cambios deploy/staging activan staging-preflight por sus paths y pueden construir
imágenes. Publicación solo en rama nueva; revisión independiente antes de cualquier
integración/autorización de CI. El candidato de custodia queda intacto.

## Operaciones futuras exactas, NO ejecutadas

Primero revisión independiente del SHA y validación PG16 posterior bajo nueva
autorización, reutilizando scripts/test-staging-postgres.py; NO crear otro harness.
La simulación actual no basta para autorizar instalar. Registrar el resultado nativo
con este hash de envelope/runner, incluido warning BEGIN y rollback completo.
Si faltan Node compatible/Git en el host del instalador, detenerse: no se instalan
herramientas aquí ni se improvisa otro runner. El formatter no necesita pg/node_modules.
El estado/plan remoto del runner sí requiere pg del lock y conexión aprobada.

Tras autorización posterior de integración/instalación del candidato revisado,
conservar Autodeploy OFF, web/PG/Bao y volúmenes. En el checkout gestionado ya
integrado, verificar el SHA aprobado, hashes y Node, sin reset ni reconstrucción:

```sh
cd /etc/dokploy/compose/cleanops360-f4fxmd/code
git rev-parse HEAD
git status --short
node --version
sha256sum db/migrations/0001_system_status.sql docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql
node scripts/migrate-postgres.mjs --offline-plan --profile=b1
python3 scripts/staging-sql14.py --record /private/migrations-01-approved.json
```

Preparar fuera de Git /private/migrations-01-approved.json desde RESOURCE_RECORD
con composeProject=cleanops360-f4fxmd, databaseName=cleanops_staging y composePath
canónico; solo con autorización expresa poner deploymentAuthorized=true,
sql14FreshInstallAuthorized=true y la referencia REAL de aprobación. Ningún permiso
se pone true en el registro de esta rama. No rellenar una referencia de ejemplo
como si fuera una aprobación. Variables de Compose obligatorias del include deben
estar disponibles en el entorno seguro existente; profile apagado no evita parsing.

Con conexión DATABASE_URL ya inyectada por el mecanismo privado aprobado (sin
password en argv/log ni usar este permiso para conectar desde otro entorno):

```sh
# Estas consultas de plan requieren autorización de lectura, no se ejecutaron aquí.
node scripts/migrate-postgres.mjs --plan --profile=b1
# SOLO tras autorización de instalación, PG16 validado y base aún vacía:
python3 scripts/staging-sql14.py --record /private/migrations-01-approved.json --apply
# Verificar registro b1_sql14, hash, applied_by/at, source_file/commit/runner:
node scripts/migrate-postgres.mjs --plan --profile=b1
```

El checkout debe estar limpio y corresponder al commit revisado; comparar también
los hashes de runner/manifiesto con esta entrega antes de aplicar. El hash de
runner_sha256 es SHA256 de la concatenación de migrate-postgres.mjs y
trusted-migrations.mjs en ese orden. Un envelope contiene la aprobación y commit
reales, por lo que su hash debe congelarse para la ejecución autorizada, no copiar
el hash del fixture offline de este informe.

Resultado esperado: baseline.applied=true, checksum exacto e history completo,
pending=[] (no incrementales B1 aprobadas). Volver a ejecutar el instalador debe
rechazar estado ocupado. No invocar npm run db:migrate foundation en esta base,
no añadir SQL14 a su cola ni ejecutar baseline para rellenar un historial perdido.
Si ya hay objetos sin registro, parar y obtener otra revisión/recepción de
procedencia; no hay adopción automática ni comando stamp de este candidato.

Rollback antes de COMMIT es transaccional; después no se ofrece down/SQL inverso,
DROP o Fresh Volumes. Conservar evidencia y estado, mantener backend cerrado y
solicitar recuperación/revisión específica. No tocar web/Bao/volúmenes para ocultar
un fallo. SQL14 crea roles NOLOGIN y contratos: no proporciona identidad operativa,
credenciales, tenants/usuario/MFA, datos de prueba, configuración de custodia ni
conexión de runtime. NO es suficiente para habilitar login y NO instala CRM/R4.

## Evidencia offline y límites

Resultados finales se completan abajo con los hashes de los archivos publicados.

### PASS finales

18/18 Vitest en tests/trusted-migrations.test.ts: seis verificaciones de archivos
y doce casos de protocolo/historial. Se simulan estados/locks/COMMIT en memoria;
ningún statement se envía a un motor. La prueba concurrente superpone dos promesas
con la primera pausada bajo lock; no prueba concurrencia real de PG16.

22/22 unittest static/test_staging_synthetic.py (0.997s), incluidos autorización,
proyecto incorrecto/ownership, fresh/ocupado, contenido exacto y consumidor Compose.
Los tests de Compose solo renderizan config; nunca up/build/exec. 16/16 guard
Semgrep (0.019s), sin cambiar manifiestos/hallazgos históricos. Total 56 PASS offline.

ESLint de los dos .mjs y test TS: exit0. Typecheck proyecto con --noEmit
--incremental false: exit0. node --check de ambos .mjs y compile de Python: PASS.
Los dos CLI --offline-plan foundation/b1 devuelven UNKNOWN_NOT_CONNECTED sin DSN,
Pool ni pg importado. Formatter B1 real probado solo como generación de texto
contra fixture de autorización sintético; output no ejecutado, termina con SQL14
byte por byte y contiene una sola copia. El hash de este fixture no autoriza VPS.

Las migraciones 0001 y SQL14 mantienen sus hashes; runtime/Compose/Dockerfile/health,
package/lock, workflows, R4/AUD-031 y CRM permanecen idénticos a staging. El script
nativo se inspeccionó y alineó su etiqueta; NO se ejecutó. Se reutilizaron solo
dependencias locales ya disponibles, sin npm ci/build en esta rama.

Comandos ejecutados de prueba, SIN DB:

```sh
npx --no-install vitest run tests/trusted-migrations.test.ts
python -B -m unittest discover -s tests/static -p test_staging_synthetic.py -v
python -B -m unittest discover -s tests/static -p test_semgrep_reviewed.py -v
npx --no-install eslint scripts/trusted-migrations.mjs scripts/migrate-postgres.mjs tests/trusted-migrations.test.ts
npx --no-install tsc --noEmit --incremental false
node --check scripts/migrate-postgres.mjs
node --check scripts/trusted-migrations.mjs
node scripts/migrate-postgres.mjs --offline-plan
node scripts/migrate-postgres.mjs --offline-plan --profile=b1
```

### FAIL y SKIP separados

FAIL iniciales conservados: ESLint rechazó un regex de controles y typecheck
detectó el contrato .d.mts antiguo y la nueva API sin declaración. Corregidos en
origen (codepoints sin desactivar regla, declaración existente ampliada y una
declaración de tipos del mismo runner). Revalidación final PASS. Sin fallos finales
en la selección ejecutada. Warnings de Vite/ESM heredados no se silencian ni motivan
un cambio de package.json.

SKIP: todo PostgreSQL/SQL real, baseline/DDL/registro instalado, advisory lock
real/atomicidad ante caída de servidor, schema introspection y tests system-status
con DB, script test-staging-postgres.py, CI remota con DB, actual scan Semgrep,
VPS, credenciales, servicios, despliegue/merge y revisión independiente del SHA final.
La semántica BEGIN anidado tiene respaldo documental pero necesita ensayo PG16
autorizado en el harness existente antes de instalar. No se cierra MIGRATIONS-01
como aceptado/productivo ni SQL14 como login funcional.

### SHA256 actuales

f902b10df4559725946d54c37b3c39992a3b94b9cbb6a211811d01b77e79f7d3  scripts/trusted-migrations.mjs

2a7a4326ae44d71cb9174024a69df49b95a859491ffb0cf590ffdcd88685f37b  scripts/trusted-migrations.d.mts

14b290c467a08e872e28f66a601b125f2e694f1ba839824b1530d2faf3a850bb  scripts/migrate-postgres.mjs

a44e8bbff7869cbdb8f8bbd234d886ab88b9e6675868d2588ee3d8b7b0daaa95  scripts/migrate-postgres.d.mts

1596a45e5458142526e7c6ab20214f266647f5afb0dbdd3116a26e73a91f7709  scripts/staging-sql14.py

d184b2e5eda35ca0be70a8c9413be224b35ed5326c2de23076862ac72b1f2f29  scripts/test-staging-postgres.py

e8ba8434f7775f2b8f10444b2142b4cf3a1deef2860f8a3bf82360482df68034  tests/trusted-migrations.test.ts

94643c9db4340fbcb95fe56ee53bc5fbf01901bf48a96fd7cf0e0d3241bcdf53  tests/static/test_staging_synthetic.py

c933d60121ee8ceb20a45f0c062b0ab7c64c1268866d42051a9edaf1a041213b  deploy/staging/RESOURCE_RECORD.json

41f0faa11d9a609a7e64ce043b293d0c75c93e847ae9e52b0b0c72d08c8f22fd  deploy/staging/README.md

Fixture offline de envelope (NO permiso de aplicar): daf4bfd1ed9c6ed035ec42e62a4cf1a2125251ec97809e7619eaf81ce361614d.
Este procedimiento se excluye de sus propios hashes.
