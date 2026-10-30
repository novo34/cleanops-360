# B1 — Registro operativo de continuidad (30-10-2026)

> Estado: **COMPOSICIÓN WEB IMPLEMENTADA — CONFIGURACIÓN PRIVADA Y ACTIVACIÓN PENDIENTES; NO CERRAR B1**.
> Estado vigente y procedimiento manual: apartado «Cierre de implementación en repositorio» al final. Los registros anteriores se conservan como historia.
> Registro de resultados comunicados desde el VPS en la sesión del 30-10-2026. No equivale a un nuevo ensayo ni autoriza cambios de infraestructura.

## Fuentes de verdad y reglas de continuidad

- Repositorio: `novo34/cleanops-360`; checkout activo del VPS `d3ea84b` (`staging`); candidato examinado `2b60fcd` de `prep/installation-catalog-20261030`.
- El estado vivo de Docker/VPS tiene precedencia sobre propuestas históricas de `OPENBAO-STAGING-01.md`. Se documentan las operaciones ejecutadas separadamente de los planes anteriores.
- **No repetir** instalaciones, aprovisionamiento de claves, SQL14, prueba aislada del Agent, inspección de roles o examen de los mismos contratos sin evidencia nueva de cambio.
- **No usar** claves/credenciales de pruebas como valores de instalación, credencial bootstrap como contraseña web, certificados `health-client` o `identity-verifier` como identidad web sin revisión.
- **No hacer** merge a `staging`, despliegue de Dokploy o `docker compose up` general; el Compose operativo contiene ajustes locales PG/TLS, redes y Dokploy que deben preservarse.

## Comprobado en VPS — evidencia de la sesión

| Elemento | Estado / observación |
|---|---|
| PostgreSQL | `cleanops360-f4fxmd-postgres-1` activo, salud `healthy`, SQL14 y TLS/HBA existentes |
| Roles | `cleanops_staging_identity_login`: LOGIN, sin SUPERUSER ni CREATEROLE, miembro de `cleanops_identity_service` NOLOGIN; credencial `SCRAM-SHA-256` en `pg_authid` (sin exponer hash) |
| OpenBao servidor | `cleanops360-f4fxmd-openbao-1` activo, salud `healthy` |
| Cinco claves | Reportadas como aprovisionadas en la sesión anterior del 30-10-2026: `audit-hmac`, `cursor-hmac`, `otp-hmac`, `recovery-hmac`, `totp-aead`, KVv2 `b1-keys`, versiones iniciales 1; **no recrear ni rotar**. Para auditoría formal, enlazar acta de los comandos previos, no volver a ejecutarlos |
| Agent OpenBao | `cleanops360-f4fxmd-openbao-agent-1` activo, creado mediante `docker run`, **todavía fuera de gestión Compose/Dokploy** |
| Token Agent | Archivo emitido en `/run/cleanops-agent/token`, modo `0600`, UID:GID `999:999`; acceso mediante volumen nombrado `cleanops360-f4fxmd_identity_agent_sink` verificado desde un consumidor separado sin exponer token |
| Volumen sink | Driver local con `tmpfs`, `nodev,nosuid,noexec,size=1m,mode=0700,uid=999,gid=999` |
| Web actual | `cleanops360-f4fxmd-web-1` activo, sin volúmenes privados, imagen anterior; **backend B1 no activado** |
| Configuración web | `reviewedB1Installation()` del candidato B1 devuelve `undefined`: cierre intencional `fail-closed` |
| Git VPS | `deploy/staging/compose.yaml` modificado localmente y `deploy/openbao/` no rastreado; proteger antes de cualquier checkout/deploy |

## Integración del código: CONFIRMADA, sin necesidad de rehacerla

- `lib/b1/openbao-keys.ts`: `createAgentSinkToken` verifica origen `tmpfs`, permisos y propietario del token; `createOpenBaoKeys` utiliza `X-Vault-Token`.
- `lib/b1/private-runtime.ts`: `createAgentSinkToken(c.sink)` alimenta `createOpenBaoKeys({ ...c.bao, allowed, token })`.
- `instrumentation.ts`: selecciona el backend en arranque Node solo si `reviewedB1Installation()` devuelve especificación revisada.
- `installation-bootstrap.ts`: exige fuentes privadas para contraseña PG de **servicio**, PG CA, OpenBao CA/cert/key; `installation-catalog.ts` exige catálogo exacto de las cinco referencias.
- `password-admission.ts`: exige corpus SHA-256 verificado y política real; `private-runtime.ts` exige normalización de email, `dummyPasswordHash`, transporte server-side y etiquetas de sesión de origen confiable; **no copiar fixtures**.

## Pendientes del registro inicial (histórico; sustituidos por la continuación final)

1. **Custodia de configuración web:** registrar sin secretos los nombres y referencias reales de `tenantId`, key IDs y versiones de las cinco claves existentes, origen HTTPS, PG DB/host/puerto y cuentas aprobadas. No confundir el catálogo de claves con material secreto.
2. **Credenciales/identidad específicas web:** provisionar por procedimiento aprobado el archivo PG del LOGIN dedicado, CA privada con modo admitido y certificado mTLS propio de web para OpenBao si no existe, con UID/GID/mode exactos. No reutilizar bootstrap o certificados de health/Agent.
3. **Composición server-side revisada:** corpus de contraseñas y checksum, hash dummy autorizado, reglas de normalización, contexto `transport()` confiable, `sessionLabels()`, TTL y límites TOTP. Conectar `reviewedB1Installation()` sin flags HTTP/ENV que activen por accidente.
4. **Docker/operación:** reconciliar `deploy/staging/compose.yaml` y Agent existente fuera de Compose; no ejecutar dos Agents sobre mismo sink. Montar fuentes privadas RO y sink RO en web. Resolver preservación de redes/labels Dokploy y evitar reiniciar PG/Bao.
5. **Validación previa a despliegue:** test unit/integración, typecheck, build y revisión de secreto/compose; nueva imagen web fuera de servicio vivo.
6. **Activación controlada:** solo con aprobación específica del owner, despliegue aislado web, health, login real y TOTP, errores cerrados y rollback documentado; primer actor requiere autorización separada y no se crea implícitamente.
7. **Cierre documental B1:** actualizar el registro con SHA, hashes aprobados, resultados de pruebas, montajes observados y decisión del owner. Hasta entonces el estado es **PENDIENTE**.

## Salvaguardas

No volcar `staging.env`, `installation.json` completo, HCL privado, valores de token ni certificados/claves a respuestas, Git, logs o CI. Si falta un dato operativo, identificar el dato exacto, no sustituirlo por uno sintético. Las comprobaciones de infraestructura ya marcadas PASS no se repiten sin cambio de bytes/estado.

## Avance de implementación posterior al registro

- Commit `e71fd8e8b904fe1bb653f34d98f3ee8f2b16d9e8`: añadido `scripts/check-b1-web-readiness.py`, chequeo **solo de metadatos** de Docker, salud PG/OpenBao, sink tmpfs y montajes Agent/web; no lee tokens, archivos privados ni SQL, no altera servicios.
- El script **no se ha ejecutado sobre VPS** y su aprobación no activa B1. El check de directorio de secretos usa un objetivo previsto `/run/cleanops-b1-private`, aún sujeto a reconciliación con el Compose definitivo. La web actual no cuenta con montajes; un `BLOCKED` en esta etapa es esperado.
- Próximo paso de implementación: especificación de instalación revisada con fuentes privadas concretas, adaptadores server-side no sintéticos y montaje seguro en imagen web; tras pruebas, aprobación separada de despliegue web y de primer actor.

## Continuación del 30-10-2026 — chequeos en repositorio

- `dbac3a9438a5de3e80735ea515352fe0d0ab6de3`: corrección del chequeo metadata-only; elimina la ruta privada `/run/cleanops-b1-private` asumida sin aprobación. El chequeo ahora verifica exclusivamente el montaje real `/run/cleanops-agent` y sus propiedades, sin fingir validar certificados o contraseñas web.
- `2ca663b07b8d47941137d02042e29406617847d9`: cuatro pruebas offline en `tests/static/test_b1_web_readiness.py`: caso válido de metadatos, web sin sink, Agent sin permisos de escritura y opciones tmpfs inseguras.
- **Pruebas añadidas, todavía NO EJECUTADAS:** `python3 -m unittest discover -s tests/static -p test_b1_web_readiness.py -v`. No marcar PASS hasta obtener la salida.
- **Limitación deliberada:** incluso si el script pasa, no acredita credenciales web, catálogo KV real, configuración completa ni login/TOTP. El `FAIL` por ausencia del montaje web es esperado en la web operativa actual.
- **Bloqueo para implementación final:** referencias aprobadas y fuentes privadas exactas web (PG login secret, CA PG, CA/cert/key mTLS web, corpus y dummy hash), además de procedencia confiable para `transport()` y `sessionLabels()`. Hasta resolverlo, `reviewedB1Installation()` conserva `return undefined`; no inventar datos ni activar silenciosamente.

## Cierre de implementación en repositorio — continuación 30-10-2026

Este apartado sustituye la lista de trabajo pendiente de los registros anteriores.
**No se ha accedido al VPS, desplegado, creado infraestructura, ejecutado SQL,
creado actores, rotado claves ni cambiado staging/main.** Los PASS del VPS
comunicados por el propietario se conservan con esa atribución. SQL14, LOGIN de
identidad, cinco claves y Agent ya existen: no se vuelven a instalar.

### QG-0 / decisión y alcance

Ruta única: register Node → reviewedB1Installation → lector privado estricto →
assembleInstallationPrivateInputs → startTrustedB1Server → installTrustedRuntime
→ proxy/rutas B1 → custody Agent/Bao → pool de identidad existente.
Inventario reutilizado: installation-{bootstrap,config,catalog}, private-file,
private-material, password-admission, ceremony-preparation, pg-identity-driver,
openbao-keys, private-runtime, runtime/server-startup y sus tests; Compose Agent
canónico y checker metadata-only existentes. No otro backend, cliente Bao,
provisionador, SQL, runner de despliegue, dependencia npm ni política de email.

Se añade installation-context.ts para UNA responsabilidad que faltaba: aislar
metadatos confiables por petición entre callbacks síncronos existentes; sus
consumidores son la composición privada y handleAuth. La integración de sitio
es código privado revisado, con SHA-256 aprobado, no una nueva implementación de
identidad. Se añaden tests del cargador/contexto y del merge efectivo de Compose;
la plantilla JSON es el input revisable del cargador, deliberadamente incompleto.
El overlay web añade solo los montajes/red privada y core=0. El volumen Agent
existente pasa a external: Compose no lo crea, relabela ni borra. Reversión:
retirar overlay/imagen y recuperar el único Agent anterior detenido. Riesgos
cubiertos: cruce entre peticiones, bundle aislado de Next, datos privados,
configuración incompleta y duplicación del escritor del sink. No se amplían
permisos SQL, tenant, roles, bootstrap ni autoridad del primer actor.

### Implementado

- Cargador en ruta fija `/run/cleanops-b1-private/installation.json`:
  root:999, 0440, máximo 65536 bytes, sin selección por HTTP/ENV. La ausencia o
  invalidez conserva B1 cerrado. La aplicación puede seguir sirviendo la UI.
- Catálogo de cinco referencias exactas, PG `cleanops_staging_identity_login` /
  `cleanops_identity_service`, staging y mount `b1-keys`, sin valores productivos
  de sustitución. TLS/contraseña reutilizan PrivateFileSource y el pool existentes.
- Corpus local con versión y SHA-256 de bytes verificados; formato canónico de
  hashes SHA-256 de contraseña, uno por línea LF, sin duplicados. Límite actual
  del lector: 65536 bytes, máximo aprobado entre 65 y 65536. No se ha elegido un
  corpus operativo. Límites de contraseña obtenidos de numeric(password_min/max).
- Hash dummy privado validado con validateDummyPasswordHash, sin generarlo aquí.
  lifetimeMs obligatorio 1..30000; máximo TOTP con validateTotpMethodLimit;
  presupuestos PG/Bao/sink siguen sus validadores canónicos, sin defaults nuevos.
- Integración privada `.mjs` root:999/0440, hash SHA-256 y referencia de aprobación
  obligatorios. Se ejecutan los mismos bytes verificados mediante import nativo
  Node (data URL), no se reabre una ruta después del hash. Es código de confianza
  con privilegios del proceso web: su revisión incluye imports, efectos y logs.
  Los imports relativos no están soportados; usar built-ins o imports absolutos
  previamente revisados. Nunca distribuir código remitido por un navegador.
- Contexto AsyncLocalStorage, copia/validación de buffers de 32 bytes y etiquetas
  canónicas por petición, limpieza al terminar y rechazo fuera de contexto, incluso para tareas asíncronas
  desprendidas de una petición ya terminada.
  El resolver recibe un clone del Request; no consume el body del handler.
- Se retira el sondeo de transport/sessionLabels durante startup: todavía no hay
  petición entonces. Se conserva la validación al resolver cada petición y en el
  consumo. No se rellena con dimensiones de tests ni etiquetas constantes.
- Slot privado único por proceso Node mediante Symbol.for: los bundles separados
  de instrumentation/proxy/rutas comparten backend, contexto y contador de
  peticiones. Se rechaza instalarlo dos veces; el cierre espera handleAuth activo.
- Autorización mTLS web explícita: scope `nextjs-identity-verifier`, referencia
  de aprobación y SHA-256 de los bytes PEM del certificado. El bootstrap comprueba
  nuevamente ese pin antes de instalar el runtime. No se monta automáticamente
  la clave del Agent ni se crean certificados/CA.
- Fallos de startup: mensaje fijo `B1_INSTALLATION_UNAVAILABLE`, sin error original,
  token, configuración ni claves; el runtime conserva el cierre. El corpus leído
  se limpia después del startup; TLS conserva el ciclo de vida canónico.

### Paquete privado que debe aprobar el propietario

Partir de `deploy/staging/b1-installation.example.json` FUERA de Git. Los null
son dependencias pendientes, no valores de instalación. La plantilla debe fallar.
El tipo fuente completo es ReviewedInstallationManifest, en
lib/b1/reviewed-site-installation.ts. Los números de modo JSON están en decimal:
288=0440, 384=0600, 448=0700. No usar cadenas octales.

1. Completar origin HTTPS, internalOrigins exactos del listener Next observado,
   DB/host/port y límites del pool, origen/timeout Bao, timeout sink y límites
   lifetime/TOTP. No deducirlos de headers ni copiar límites de fixtures.
2. Copiar tenantId, keyId/version de las cinco referencias y keyVersion lógico
   TOTP de la evidencia/catálogo aprobado. No consultar ni reprovisionar claves
   para rellenar la plantilla; no hay fallback a latest.
3. Aportar corpus aprobado, versión/checksum, hash dummy canónico y límite del
   corpus. No exportar contraseñas para construir el corpus ni generar un dummy
   con una contraseña de usuario. La política de actualización sigue al custodio.
4. Aportar `integration.mjs` revisado que exporte:
   `normalizeEmail(email: string): string` con LA MISMA regla del provisionador;
   `resolveRequestContext(request: Request): Promise<{network: Buffer,
   device: Buffer, labels: {device: string, browser: string}}>`.
   Los buffers deben ser dimensiones keyed del ingreso confiable (32 bytes).
   Este módulo debe autenticar su procedencia y validar los datos de petición
   antes de devolverlos. No basta leer X-Forwarded-For, User-Agent, un ID del body
   o cookies sin verificar. Etiquetas solo desde ese contexto validado. No hay
   protocolo de attestación ni clave de ingreso acreditados en la evidencia
   recibida: NO instalar un resolver de ejemplo o que devuelva constantes.
   El mecanismo y la conexión a handleAuth ya están implementados; falta aprobar
   la fuente concreta y su integración de sitio, no otro backend.
5. Elegir un certificado de identidad YA existente y aprobado para Next.js.
   Para el `identity-verifier` existente se necesita autorización explícita para
   que Next lea una copia de esa clave y asuma esa identidad; registrar alcance,
   riesgo compartido Agent/web, custodia/revocación y fingerprint PEM aprobado.
   Su mera existencia no concede permiso. Si no se autoriza compartirla, el
   custodio debe identificar una identidad web autorizada antes de continuar.
   No usar certificados health/admin ni generar otra CA/certificado por este plan.

El directorio web es una PROPUESTA nueva de montaje, no una observación del VPS:
`${CLEANOPS_B1_PRIVATE_DIR}` absoluto, fuera del checkout, root:999/0750; archivos
root:999/0440. Los nombres de la plantilla son destinos dentro del contenedor.
El propietario prepara copias privadas, conservando los originales, de
`/etc/cleanops360/postgres-tls/identity.password` y
`/etc/cleanops360/postgres-tls/ca/ca.crt`. Nunca de la credencial bootstrap.
El password de aplicación debe ser UTF-8, 1..4096 bytes, sin CR/LF/NUL. Si el
archivo original tiene una única LF terminal de formato, preparar una copia
retirando solo esa LF (o CRLF), sin cambiar la contraseña ni imprimirla; rechazar
otros saltos. No hacer chown/chmod de los recursos PostgreSQL originales.
Copiar CA/cert/key Bao solo tras la autorización del punto 5. No montar todo el
directorio TLS Agent: solo los archivos web aprobados en el paquete RO.
Verificar propietario/modo/tamaño/hash de las copias sin mostrar contenido.

### Reconciliación y despliegue manual (NO EJECUTADOS)

Precondición: paquete y código de integración aprobados; imagen web construida
del commit revisado y fijada por digest; Autodeploy OFF. No cambiar la fuente de
Dokploy a esta rama, no merge ni despliegue general. La aceptación FIRST-ACTOR
histórica no autoriza una ceremonia nueva. No se incluye migración SQL alguna.

**1. Preservar y preparar.** En una ventana del propietario, guardar privadamente
el Compose operativo, .env, ficheros deploy/openbao no rastreados y metadatos de
imagen/nombre/mounts/redes/policy de restart del Agent y web. No adjuntar inspect
completo/env/HCL a Git o al chat. Obtener el candidato en un worktree separado
fijado al SHA revisado; no hacer checkout/reset sobre el árbol operativo sucio.
Preparar el paquete privado y una copia de agent.hcl solo si hay que reconciliar
rutas: conservar auth mount/name, CA/cert/key, dirección y sink existentes.
El Compose canónico monta HCL en `/etc/cleanops-agent/agent.hcl` y TLS en
`/run/cleanops-agent-tls`; los paths referidos en HCL deben resolver con esos
montajes a los archivos existentes. No cambiar identidad/policy/token ni emitir
material. `CLEANOPS_AGENT_IMAGE` debe ser la imagen existente verificada,
CLEANOPS_COMPOSE_PROJECT=cleanops360-f4fxmd, UID/GID=999 y
CLEANOPS_AGENT_NETWORK la red Bao privada OBSERVADA (no inventar su nombre).

**2. Revisar la fusión antes de tocar contenedores.** Mantener como primer `-f`
el Compose operativo ORIGINAL con sus includes, redes, labels y TLS/HBA.
Si ya incluye Agent, actualizar únicamente la definición canónica del sink a
external y conservar su configuración. Si no lo incluye, pasar el archivo
`deploy/openbao/compose.agent.yaml` del candidato como segundo `-f`, UNA vez.
Añadir `deploy/staging/compose.b1-web.yaml` al final. Persistir el equivalente
exacto de esa selección en Dokploy para que un despliegue posterior no lo pierda.
Si Dokploy solo admite un Compose Path, preparar una copia reconciliada del
operativo conservando sus includes (usar paths relativos válidos o absolutos
aprobados), incorporar Agent una vez y los cambios del overlay únicamente en
web; revisar esa copia como config efectiva antes de seleccionarla.

Guardar en privado `docker compose ... config --format json` antes/después.
Comparar: PG y Bao idénticos; ninguna publicación de puertos; web conserva sus
redes/labels Dokploy y añade identity_bao + sink RO + paquete RO; Agent es el único
RW; volumen existente `cleanops360-f4fxmd_identity_agent_sink` external, mismo
nombre/opciones reales. El overlay no concede permisos de archivos. Fijar CLEANOPS_STAGING_WEB_IMAGE al digest candidato ya disponible localmente; el
overlay selecciona solo esa imagen web con pull_policy=never. Conservar
la imagen web anterior, conservando la referencia anterior para volver.
No ejecutar si la configuración efectiva modifica otros servicios o duplica Agent.

Con variables de shell locales ya revisadas, la única invocación seleccionada es:

```bash
# Valores que el propietario fija a sus rutas existentes/aprobadas; no secretos.
# ENV_FILE: .env operativo; LIVE_COMPOSE: Compose operativo conservado.
# CANDIDATE: worktree candidato; AGENT_FILE_ARGS: array vacío si ya está incluido,
# o (-f "$CANDIDATE/deploy/openbao/compose.agent.yaml") si falta.
B1_COMPOSE=(docker compose --env-file "$ENV_FILE" -p cleanops360-f4fxmd
  -f "$LIVE_COMPOSE" "${AGENT_FILE_ARGS[@]}"
  -f "$CANDIDATE/deploy/staging/compose.b1-web.yaml" --profile identity-agent)
"${B1_COMPOSE[@]}" config --quiet
```

La configuración seleccionada debe apuntar a la imagen web ya revisada y al
paquete privado; no ejecutar build durante la ventana. No usar `up` sin servicios,
`down`, `down -v`, `--remove-orphans` o `--force-recreate` del stack.

**3. Traspasar el Agent con un único escritor.** Docker no permite adoptar un
contenedor añadiendo las labels Compose después de crearlo. Hay que sustituir
SOLO el Agent, conservando el anterior detenido para rollback. Cerrar el ingreso
de login durante la ventana y drenar peticiones. Si la web anterior ya usa el
sink, detener SOLO web antes del traspaso. No tocar PG/Bao ni cleanops-dcc-*.
Verificar que el nombre de reserva siguiente está libre; no sobrescribirlo.

```bash
# Ejecuta el propietario, únicamente tras revisar los pasos 1–2.
docker update --restart=no cleanops360-f4fxmd-openbao-agent-1
docker stop cleanops360-f4fxmd-openbao-agent-1
docker rename cleanops360-f4fxmd-openbao-agent-1 cleanops360-f4fxmd-openbao-agent-before-b1
"${B1_COMPOSE[@]}" up -d --no-deps --no-build --pull never openbao-agent
# Esperar token nuevo, metadatos 0700/0600 y UID:GID 999:999 y Agent running;
# no imprimir token ni interpretar mtime como vigencia.
"${B1_COMPOSE[@]}" up -d --no-deps --no-build --pull never web
```

El nuevo Agent usa el volumen EXISTENTE y limpia el token viejo al arrancar.
Durante la transición el anterior tiene restart=no y permanece detenido: no
hay dos procesos escribiendo en el sink. No borrar el contenedor de reserva ni
el volumen antes de aceptar el resultado. PG/Bao no son dependencias a recrear:
`--no-deps` y la lista explícita de servicios son obligatorios.

**4. Comprobar y abrir ingreso.** Registrar SHA/digest efectivo, montajes RO,
UID/GID, redes/labels conservadas y metadatos del nuevo Agent. Ejecutar el checker
metadata-only existente solo ahora, porque cambiaron los montajes; no repetir
SQL14, creación de claves, roles ni pruebas del Agent ya acreditadas. Health web
200 no prueba B1. En una sesión aprobada comprobar login → selección TOTP si
corresponde → verificación → sesión/consulta/revocación, sin exponer cookies o
secretos; casos inválidos sin sesión. Para fallos usar primero fixtures/harness
local; no detener PG/Bao compartidos. Un ensayo operativo posterior necesita
ventana propia: revocación/expiración de token y denegación de Bao/PG deben dar
503 sin cookie/efectos nuevos, sin retry SQL ni fallback. No mutar claves o
bindings compartidos para probar. Registrar PASS/FAIL con evidencia real y
separarlo de los ensayos locales. Si falta primer actor, ceremonia existente con
aprobación independiente antes de probar credenciales; no crear usuarios al arrancar.

**5. Rollback.** Cerrar ingreso; detener SOLO web nueva y Agent Compose. Verificar
que el Agent nuevo está detenido antes de retirar SOLO ese contenedor (sin -v).
Renombrar `...-openbao-agent-before-b1` a su nombre original, restaurar su policy
de restart OBSERVADA y arrancarlo con su HCL/TLS previos; limpiar el token anterior
mediante el mismo procedimiento de arranque aprobado, sin editarlo a mano ni
aceptarlo por mtime. Restaurar imagen/config/montajes web anteriores y levantar
SOLO web con `--no-deps --no-build --pull never`; si la anterior era cerrada,
volver a ese estado. Retirar la selección overlay de Dokploy, conservando las
copias/evidencia privadas. No borrar volúmenes, rollback SQL, claves ni datos.

### Dependencias que todavía no acredita el repositorio

| Falta exacta | Por qué / acción mínima | Aprobación humana |
|---|---|---|
| Tenant, cinco key IDs/versiones y keyVersion TOTP del catálogo aprobado; DB/listener/orígenes y presupuestos | Completar la plantilla desde acta y configuración privada existente; no recrear recursos | Custodio/owner aprueba valores y manifiesto |
| Corpus operativo + checksum/versión, dummy PHC y límites lifetime/TOTP | Aportar snapshot/hash y parámetros canónicos; no copiar fixtures ni crear credenciales | Owner de política/instalación |
| Regla de email del provisionador y fuente verificable del contexto de ingreso | Revisar y aportar integration.mjs con el contrato anterior, pin/acta; el resolver debe autenticar datos antes de devolverlos | Sí; la evidencia no permite inventar esa confianza |
| Alcance de uso web del certificado/clave existente | Autorizar explícitamente la identidad elegida y su pin PEM; preparar solo copias RO | Sí; el permiso para Agent no autoriza Next |
| Reconciliación de archivos vivos, montaje y sustitución Agent/web | Propietario aplica pasos 1–5 con comparación efectiva y ventana | Ejecución manual fuera de Codex |
| Login/MFA en staging | Probar con actor autorizado y registrar evidencia; ceremonia separada si procede | Sí para ceremonia/ensayo operativo |

B1 no se declara operativo ni cerrado con estas dependencias pendientes. La
implementación de los mecanismos y los ensayos del repositorio no acreditan
la procedencia real del contexto, la autorización PKI ni una sesión de staging.


### Pruebas ejecutadas y límites de evidencia (QG-3)

| Comando / evidencia local | Resultado final real |
|---|---|
| `npm run test:b1` (Node 24.19.0) | **PASS 284/284**, 0 FAIL, 0 SKIP. Incluye catálogo/archivos privados, Agent sink, client Bao, runtime, first actor, TOTP y errores; transportes externos simulados |
| `npm run typecheck` | **PASS** |
| `npx eslint` sobre los 11 archivos TypeScript modificados/nuevos | **PASS** |
| `npm run build`, Next 16.4.3 / Turbopack | **PASS**, compilación, TypeScript y 36 páginas generadas |
| `python3 -B -m unittest discover -s tests/static -p test_b1_web_compose.py -v` | **PASS 2/2**; `docker compose config --format json` real v2.40.3, con/sin Agent previo y overlays; sin operaciones de daemon |
| `python3 -B -m unittest discover -s tests/static -p test_staging_synthetic.py -k test_push_preflight -v` | **PASS 1/1**, fixture real del workflow existente tras declarar sink externo |
| Next construido, servidor local 127.0.0.1:3118 sin montaje privado | **PASS** `/login` 200, `/auth/me` 503, sin Set-Cookie y Cache-Control no-store; proceso local terminado al finalizar |
| Gitleaks 8.24.3 `dir` sobre copia de los 18 archivos cambiados/nuevos | **PASS**, 0 hallazgos; binario contrastado con checksum de la release. No se escaneó el VPS ni se afirma un escaneo completo del historial |
| `git diff --check` | **PASS** |

El cargador positivo usa archivos locales y simula SOLO uid/gid del módulo privado
porque el worker no es root. Las pruebas de concurrencia usan dos contextos reales
AsyncLocalStorage y dos evaluaciones independientes del runtime en un proceso
hijo, no dos referencias al mismo módulo cacheado. Se verifican instalación única,
compartición del handler, rechazo durante cierre y drain de la petición retenida;
el scope de ese test es sintético y no acredita una sesión de usuario.

Los fallos de fixtures durante el desarrollo se corrigieron antes del resultado
final: await del cargador ahora asíncrono, umask/Stats del test de archivos,
aislamiento del test de cierre y la normalización JSON de Compose (omite false
/ceros). No se relajó PrivateFileSource ni el runtime para conseguir PASS.
La suite con socket local y el build necesitaron red del entorno habilitada;
el primer intento bajo la restricción inicial no se cuenta como PASS.

No se repitieron las cuatro pruebas previas de test_b1_web_readiness.py ni el
checker en VPS: sus archivos no cambiaron. No se ejecutó una integración nativa
nueva con PostgreSQL/OpenBao ni un ensayo login/MFA de staging. El smoke HTTP
construido acredita únicamente el cierre sin montaje. FIRST-ACTOR no fue ejecutado.
El próximo ensayo operativo sigue los pasos manuales anteriores y registra su
propia evidencia, sin heredar los PASS de fixtures.

Logs locales de esta ejecución (no contienen material del VPS; fuera de Git):
- `/tmp/b1-tests.log` — SHA-256 `21098c1980c446ed79e88c74dfa6e2e8e2a1bc07a23b80cad29f64381d2ba9e4`.
- `/tmp/b1-build.log` — SHA-256 `b8bebfc5feed323a90d2831e47f78157cdf4eb9d03e4bffa4353688a2b9ff94c`.
- `/tmp/b1-production-smoke.log` — SHA-256 `85aa270da893163f33e9ce2254e3f3828f7935af5b8bfe60067dcb452c8f2443`.
- `/tmp/b1-gitleaks-report.json` — SHA-256 `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`.

Estado de cierre: mecanismos de composición/aislamiento/arranque y reconciliación
implementados y pruebas disponibles de este cambio completadas. El paquete no
está listo para ACTIVACIÓN hasta acreditar los valores/módulo privado y el permiso
PKI. La instalación/despliegue selectivos y login/MFA en VPS permanecen pendientes.


### Commits y archivos de este cierre

- Base remota comprobada al inicio y antes de publicar:
  `prep/installation-catalog-20261030=629b204526b349a80e3b860f694c1453ae4306f6`;
  `staging=d3ea84b38fd1574db1610f03b59c8c4a5050ac72`. No se modificó staging.
- Implementación y pruebas: `71a95ce083aaa22e9953aa90eb2fa608605693bb`,
  https://github.com/novo34/cleanops-360/commit/71a95ce083aaa22e9953aa90eb2fa608605693bb
- Este traspaso se registra en el commit documental siguiente. No se abre PR,
  se fusiona ni se despliega. La rama de preparación solo activa el workflow
  B1 preparation validation (contents:read, npm/typecheck/tests), no despliegue.
  Ningún resultado futuro de CI se presenta aquí como ya ejecutado.

Lista exacta (17 archivos de implementación/pruebas y este registro):

```text
deploy/openbao/compose.agent.yaml
deploy/staging/.env.example
deploy/staging/b1-installation.example.json
deploy/staging/compose.b1-web.yaml
docs/implementation/b1/operational-acceptance/B1-RUNTIME-HANDOFF-20261030.md
instrumentation.ts
lib/b1/installation-bootstrap.ts
lib/b1/installation-context.ts
lib/b1/private-runtime.ts
lib/b1/reviewed-site-installation.ts
lib/b1/runtime.ts
lib/b1/server-startup.ts
tests/b1/instrumentation-closed.test.ts
tests/b1/installation-context.test.ts
tests/b1/private-runtime.test.ts
tests/b1/reviewed-site-installation.test.ts
tests/static/test_b1_web_compose.py
tests/static/test_staging_synthetic.py
```
