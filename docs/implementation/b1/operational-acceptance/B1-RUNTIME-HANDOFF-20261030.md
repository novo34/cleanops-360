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
retirar overlay/imagen web; conservar el Agent existente activo sin cambios. Riesgos
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

### Procedimiento operativo consolidado — SOLO WEB, NO EJECUTADO

Este es el UNICO procedimiento vigente de activacion. Sustituye el traspaso
anterior del Agent a Compose: el propietario exige reutilizar el Agent existente.
No se detiene, renombra, adopta, reinstala ni sustituye ese contenedor. No se
activa identity-agent ni se agrega un segundo servicio Agent al Compose vivo.
La gestion Compose del Agent queda fuera de esta activacion, sujeta a otra decision.
El overlay web declara directamente su red y sink como external: funciona aunque
el Compose vivo no contenga la definicion canonica del Agent. No crea volumen/red.

**A. Decisiones previas (sin comandos de activacion).**

- Revision independiente del runtime, del pin propuesto y de los tres imports
  indicados en el apartado Quality. Aprobar el cambio exacto y resolver TODOS los
  hallazgos con el procedimiento canonico antes de exigir Quality completo PASS.
  El parche PENDING no es una aprobacion ni debe aplicarse por esta instruccion.
- Aprobar un manifiesto privado completo segun ReviewedInstallationManifest:
  tenant y cinco key IDs/versiones/keyVersion desde la evidencia existente,
  PG/origen web/listener/Bao y presupuestos exactos. No rehacer SQL14 ni claves.
- Aportar el corpus versionado/checksum, dummy PHC y politica de limites; aprobar
  la normalizacion del provisionador y el origen verificable de dimensiones de
  ingreso. Instalar integration.mjs revisado con hash y acta, nunca constantes
  o headers arbitrarios como autoridad. No hay estos valores acreditados en Git.
- Autorizar expresamente el uso por Next de una identidad TLS existente, su
  certificado PEM exacto y copia de clave privada. El permiso de Agent no basta;
  sin ese permiso no copiar su clave. No se emiten CA/certificados ni credenciales.
- Aprobar SHA e imagen web con digest, ventana, actor de prueba y rollback. Una
  ceremonia de primer actor, si hiciera falta, requiere aprobacion independiente;
  el despliegue no crea usuarios. No merge a staging ni activacion automatica.

**B. Preparacion privada y revision efectiva, a cargo del propietario.**

Con Autodeploy OFF, conservar Compose operativo, .env y ficheros locales no
rastreados en backup privado; registrar imagen y montajes web previos y el estado
actual del Agent/PG/Bao. No volcar inspect/env/HCL a Git o al chat. Obtener el
candidato en checkout/worktree separado, sin sobrescribir el arbol operativo.
Preparar el paquete root:999/0750 y archivos root:999/0440 fuera del checkout,
como se detalla arriba. Reutilizar copias del password de servicio y CA existentes;
conservar originales y no usar bootstrap. TLS web solo despues de la aprobacion.
La imagen revisada ya debe estar disponible localmente; no build/pull en ventana.

Mantener el Compose operativo como primer archivo; anadir UNICAMENTE
compose.b1-web.yaml del candidato. El overlay agrega imagen web fijada,
core=0, paquete RO y sink RO, conservando las redes/labels Dokploy heredadas.
CLEANOPS_COMPOSE_PROJECT debe ser cleanops360-f4fxmd; CLEANOPS_AGENT_NETWORK es
el nombre de red Bao realmente observado; CLEANOPS_B1_PRIVATE_DIR y
CLEANOPS_STAGING_WEB_IMAGE son los valores aprobados, no secretos ni defaults.
El sink external es cleanops360-f4fxmd_identity_agent_sink, ya verificado tmpfs.
No agregar compose.agent.yaml si el Compose vivo no lo incluye. Si ya lo incluye,
conservarlo con perfil inactivo: el comando selectivo tampoco inicia ese servicio.
No usar --profile identity-agent ni cambiar COMPOSE_PROFILES para esta activacion.

El propietario fija ENV_FILE, LIVE_COMPOSE y CANDIDATE a sus rutas aprobadas.
Guardar privadamente config efectiva antes/despues y compararla: PG/Bao/Agent
identicos, ningun servicio nuevo, ningun puerto publicado, redes/labels previas
web conservadas, exactamente los montajes RO y la imagen web previstos. Los
external deben apuntar a recursos existentes; rechazar diferencias ajenas a web.

**C. Ejecucion manual aprobada (una actualizacion selectiva).**

```bash
B1_COMPOSE=(docker compose --env-file "$ENV_FILE" -p cleanops360-f4fxmd
  -f "$LIVE_COMPOSE" -f "$CANDIDATE/deploy/staging/compose.b1-web.yaml")
"${B1_COMPOSE[@]}" config --quiet
# SOLO tras aprobar el diff efectivo y drenar/cerrar temporalmente el ingreso B1:
"${B1_COMPOSE[@]}" up -d --no-deps --no-build --pull never web
```

No up general, down, --remove-orphans, restart Agent, borrado de volumen ni
comando sobre PG/Bao/cleanops-dcc-*. El Agent existente sigue siendo el unico
escritor; Next solo lee su token. No es necesario adoptar el Agent para leerlo.
Persistir posteriormente en Dokploy el equivalente revisado de este overlay
antes de cualquier futuro despliegue; hacerlo es operacion del propietario,
no una accion remota de Codex ni permiso de deploy automatico. Si la interfaz
solo admite un Compose Path, preparar una copia reconciliada del vivo con estos
cambios web/refs external, conservando sus includes y comparar el render antes
de seleccionarla. No sustituirlo por el Compose del repositorio.

**D. Verificacion y apertura del ingreso.**

Conservar SHA/digest, mounts/UID/GID y red efectivos. El checker metadata-only
existente se justifica ahora porque cambiaron los mounts web; no repite la
instalacion ni las comprobaciones PG/Bao ya acreditadas. Health web 200 no prueba
B1: comprobar con actor aprobado login, seleccion TOTP cuando corresponda,
verificacion, consulta/revocacion de sesion y errores sin cookie. Registrar
PASS/FAIL reales sin secretos. Los fallos PG/Bao/token se cubren primero por
fixtures ya ensayados; un ensayo operativo necesita ventana propia, sin parar
PG/Bao compartidos, rotar claves ni modificar bindings. Cualquier fallo debe
cerrar admision; no hay retry SQL, fallback ni credencial bootstrap.

**E. Rollback exclusivamente web.**

Cerrar ingreso y drenar la web nueva. Recuperar la imagen web anterior y los
ficheros/config/montajes previos conservados en B; ejecutar la seleccion previa
con --no-deps --no-build --pull never web. Retirar el overlay de la seleccion
persistente, conservando evidencia privada. Si antes estaba closedBackend,
volver a ese estado. Agent, token administrado, SQL14, PG/Bao, claves, certificados,
redes y volumen no requieren ningun rollback ni recreacion porque no se tocaron.

### Dependencias que todavía no acredita el repositorio

| Falta exacta | Por qué / acción mínima | Aprobación humana |
|---|---|---|
| Tenant, cinco key IDs/versiones y keyVersion TOTP del catálogo aprobado; DB/listener/orígenes y presupuestos | Completar la plantilla desde acta y configuración privada existente; no recrear recursos | Custodio/owner aprueba valores y manifiesto |
| Corpus operativo + checksum/versión, dummy PHC y límites lifetime/TOTP | Aportar snapshot/hash y parámetros canónicos; no copiar fixtures ni crear credenciales | Owner de política/instalación |
| Regla de email del provisionador y fuente verificable del contexto de ingreso | Revisar y aportar integration.mjs con el contrato anterior, pin/acta; el resolver debe autenticar datos antes de devolverlos | Sí; la evidencia no permite inventar esa confianza |
| Alcance de uso web del certificado/clave existente | Autorizar explícitamente la identidad elegida y su pin PEM; preparar solo copias RO | Sí; el permiso para Agent no autoriza Next |
| Reconciliación de archivos vivos y montaje/imagen exclusivamente web | Propietario aplica fases A–E con comparación efectiva y ventana, sin tocar Agent | Ejecución manual fuera de Codex |
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
implementados y pruebas funcionales locales de este cambio completadas.
Quality y el gate documental del PR siguen pendientes: no hay TECH-READY/ACCEPTED. El paquete no
está listo para ACTIVACIÓN hasta acreditar los valores/módulo privado y el permiso
PKI. La instalación/despliegue selectivos y login/MFA en VPS permanecen pendientes.


### Commits y archivos de este cierre

- Base remota comprobada al inicio y antes de publicar:
  `prep/installation-catalog-20261030=629b204526b349a80e3b860f694c1453ae4306f6`;
  `staging=d3ea84b38fd1574db1610f03b59c8c4a5050ac72`. No se modificó staging.
- Implementación y pruebas: `71a95ce083aaa22e9953aa90eb2fa608605693bb`,
  https://github.com/novo34/cleanops-360/commit/71a95ce083aaa22e9953aa90eb2fa608605693bb
- Este traspaso se registra en el commit documental siguiente. No se abre PR,
  se fusiona ni se despliega. El evento push activa B1 preparation validation (contents:read, npm/typecheck/tests).
  La rama ya era origen del PR draft 31, creado antes de este trabajo: el push
  tambien sincronizo automaticamente sus checks pull_request/pull_request_target.
  No se creo otro PR ni se ejecuto un workflow de despliegue. Los resultados
  observados y los gates pendientes figuran debajo.

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


### CI observado tras publicar 43875e50ec1d48ff75631bddfc203ece74fdbbf4

| Check | Resultado observado | Evidencia |
|---|---|---|
| B1 preparation validation (push) | **PASS** | https://github.com/novo34/cleanops-360/actions/runs/41130665812 |
| B1 proxy origin regression | **PASS** | https://github.com/novo34/cleanops-360/actions/runs/41130673057 |
| B1 synthetic staging preparation / preparation | **PASS**; first-actor-native **SKIP** | https://github.com/novo34/cleanops-360/actions/runs/41130672850 |
| Quality | **FAIL** antes de completar Semgrep: dos errores de test al cargar el registro, runtime distinto del pin aprobado | https://github.com/novo34/cleanops-360/actions/runs/41130672917 |
| engineering-policy | **FAIL**: cuerpo del PR 31 existente sin las secciones/respuestas/casillas del dialecto exigido | https://github.com/novo34/cleanops-360/actions/runs/41130670335 |
| Workflows nativos condicionados a autorizaciones históricas | **SKIP**, no se contabilizan como PASS | runs del mismo SHA |

El guard exige B1_RUNTIME_BLOB=b08b01fe13de2376d56af7958489d9b1f9de9da0;
el runtime implementado tiene blob f0e91a5ec8a799692947000bff10a7743322015b.
El FAIL es el comportamiento intencional del gate ante codigo cambiado, no prueba
por si solo de un defecto de ejecucion. No se actualizo ese pin ni el ledger de
excepciones para maquillar el resultado. Hace falta revision independiente del
runtime y de la carga de codigo privado, y autorizacion de la migracion exacta
del contexto de revision; luego ejecutar el scanner completo sin suprimir nuevos
hallazgos. Las importaciones nuevas conservan comentarios de procedencia pero
NINGUNA directiva nosemgrep: el runner canonico ya deshabilita esas directivas.
No se declara Semgrep PASS ni Quality completo por haber pasado Gitleaks.

Se ha preparado FUERA del repositorio `/tmp/b1-pr31-body-proposed.md`, sin publicar
ni cambiar el PR. El checker exacto de la base staging d3ea84b, extraido con git
show y ejecutado con un evento local que contiene ese cuerpo, devuelve
**ENGINEERING_POLICY_GATE PASS (document structure only; review required)**.
El propietario puede aplicar esa ficha al PR EXISTENTE; no abre otro y no concede
merge, revision de seguridad o despliegue. El resultado local no convierte el
check remoto actual en PASS ni autoriza actualizar el cuerpo sin su decision.

Estas dos dependencias de gobernanza se añaden a las de instalacion privada/PKI:
no se altera un control aprobado para cerrar B1 ni se da por superada la revision
independiente. Los comentarios/documentacion posteriores no cambian el runtime
ni los resultados funcionales; el commit final los conserva como evidencia del
SHA ensayado, sin atribuir a un run resultados que todavia no haya producido.


## Continuacion autorizada desde 7cabce3 — cierre de repositorio

Alcance QG-0 de este incremento: resolver el formato del PR existente, preparar
la revision exacta del pin sin autoaprobarla y hacer autosuficiente el overlay
para reutilizar Agent ya en ejecucion. Se reutilizan el guard, ledger, plantilla
PR, lector privado, overlay y harness Compose existentes. No se cambia ningun
contrato de runtime ni se repiten los 284 tests o el build ya validos. Unico
archivo nuevo: B1-RUNTIME-PIN-PENDING.patch, artefacto NO ejecutado, dueno del
control de seguridad, consumidor el revisor independiente; se retira/aplica solo
tras dictamen y autorizacion exactos. No es otro checker ni otra fuente runtime.

### engineering-policy resuelto

Se actualizo el cuerpo de PR 31 con la plantilla canonica, conservando titulo,
base staging, condicion draft y alcance. Se conserva INTEGRO su cuerpo anterior
en un apartado de historico citado: enlaces de evidencia, decisiones y advertencias
originales siguen accesibles. No se publico comentario ni se abrio otro PR.
El validador exacto de staging d3ea84b dio PASS local y el check remoto dio
**PASS**: https://github.com/novo34/cleanops-360/actions/runs/41132240829 .
Este PASS documental no aprueba codigo, excepciones, merge ni activacion.

### Quality: diagnostico completo y propuesta pendiente de aprobacion

El ultimo pin activo viene de 2b60fcde4355d6668dff1296af829ba9feb86518, que
fijo b08b01fe13de2376d56af7958489d9b1f9de9da0. El cambio funcional autorizado
71a95ce083aaa22e9953aa90eb2fa608605693bb produce el blob
f0e91a5ec8a799692947000bff10a7743322015b. El guard compara bytes exactos como
limite de una revision independiente anterior; no evalua legitimidad de nuevos
bytes ni se actualiza automaticamente porque los tests pasen.

Legitimidad documentada por el AUTOR, sin sustituir revision independiente:
la modificacion recibe un scope exclusivamente del startup revisado, comparte
backend entre bundles Node, mantiene denegacion de doble instalacion y cierre,
y contabiliza peticiones activas para drain. No acepta backend por HTTP/ENV,
credenciales bootstrap ni datos empresariales nuevos. La regresion previa carga
dos copias independientes y verifica instalacion unica, estado compartido y drain;
forma parte de los 284 PASS ya conservados. Runtime sigue byte a byte igual a 7cab.

B1-RUNTIME-PIN-PENDING.patch contiene el DIFF EXACTO de una linea para el pin.
`git apply --check` da PASS, pero NO se aplico. El checker activo, manifest historico,
reglas, severidad, paths y supresiones permanecen intactos. Para aplicarlo hacen
falta dictamen independiente y autorizacion sobre esos bytes; despues se publica
el cambio normal en esta rama, sin force push. No existe excepcion automatica por
tratarse de B1, ni se agrega nosemgrep o una exclusion para que pase.

Se ejecuto Semgrep 1.177.0 con el mismo comando canonico, --error,
--disable-nosem, metricas/version-check desactivados y solo las exclusiones de
fixtures PREEXISTENTES. El motor termino con codigo 1 por 19 hallazgos y el unico
warning upstream de parser ya revisado. Al evaluar en una simulacion temporal
UNICAMENTE el pin propuesto: los 16 hallazgos historicos restantes son reconocidos,
el warning conserva su pin y quedan TRES hallazgos nuevos sin clasificar/aprobar:

| Archivo y linea | Procedencia que debe revisar seguridad |
|---|---|
| instrumentation.ts:6 | Especificador literal de modulo del repositorio, dentro de la rama Node de register |
| instrumentation.ts:8 | Especificador literal del startup existente, sin datos de peticion |
| lib/b1/reviewed-site-installation.ts:44 | Codigo privado ejecutable: bytes de archivo root:999/0440 y checksum aprobados antes de import nativo; alcance/efectos/imports del modulo requieren revision |

Cambiar SOLO el pin NO hace Quality PASS. El revisor debe evaluar tambien esos
sitios con su contexto y decidir la correccion o migracion canonica de entradas
exactas por regla/rango/snippet y hashes de productor. El ledger historico es
inmutable; no se inventa una clasificacion confirmed_false_positive ni se concede
una supresion global. El cargador privado no es codigo enviado por navegador.
Pero su checksum/propietario no sustituyen la aprobacion independiente del patron.

Se ejecutaron las 16 regresiones del guard con el pin candidato solamente en
memoria de un proceso de prueba: **16 PASS**. Esto valida que la propuesta no
relaja las propiedades de integridad del guard; NO es Quality PASS ni cambia el
valor activo. La evaluacion del scan con esa propuesta da **FAIL por los tres
hallazgos anteriores**, rules_disabled=[], inline_suppressions_enabled=false.

Hashes SHA-256 de archivos completos que debe fijar la revision pendiente:
- `lib/b1/runtime.ts`: `30c9d61e09e11bc8e21caf5fec3150dec979ec851a812db384c250cdd123872f`.
- `instrumentation.ts`: `70a511cea1270b21e121c232649193f7cac94ff68665484f8671ee07ad32e7a2`.
- `lib/b1/reviewed-site-installation.ts`: `867ea66ddfe950b83aaccce0e29dd50744cdaaf5edfa354f3545976c80a762c6`.
- `scripts/check-semgrep-reviewed.py`: `d1863a99c8285dd44b5009e7fe1c9f20f5cefc8b5083b67077afd66bda9d049e`.
- `.semgrep/reviewed-findings.json`: `2605f29d3d2bf8d4bd36d7df5d9f7d501a69bb96410404a3ed01c3dc4eb31448`.
- `.semgrep/cleanops-foundation.yml`: `30ed5e227fafb8b53a794ec2ebb808447bee752679779fadf82aaa7a44ecd681`.

### Dependencias privadas: resultado de la revision dirigida

Las fuentes vigentes siguen delegando normalizacion al provisionador y dimensiones
a ingreso confiable (APPROVED_ADAPTER y contrato de first-actor); no hay una regla
concreta ni un emisor/verificador de contexto aprobado que se pueda implementar
por deduccion. El SQL de runtime-catalog es un instrumento de revision de contratos,
no un acta de key IDs operativos. La plantilla de instalacion conserva null donde
faltan esas decisiones; el cargador la rechaza como corresponde. No se eligio una
politica nueva de correo, un corpus arbitrario, un dummy ni una identidad PKI.

Accion minima, por canal privado: el owner/custodio debe aportar el catalogo ya
aprobado y endpoints/presupuestos; indicar regla exacta del provisionador y fuente
verificable del contexto para terminar el modulo de sitio; entregar snapshot de
corpus/version/checksum y PHC dummy; autorizar uso web del certificado existente
y copias RO. Los contratos, chequeos, aislamiento, lectura, pin y wiring ya estan
implementados. No requiere nuevos roles, contrasenas, claves, CA o certificados.

### Pruebas nuevas y reutilizacion de evidencia

- 2/2 tests Compose PASS: overlay sobre canonico y sobre Compose sin servicio
  Agent, recursos externos existentes, sin agregar Agent, PG/Bao iguales,
  montajes RO y labels conservadas; negativo determinista de paquete ausente.
- 16/16 regresiones del guard candidato PASS en simulacion aislada, no cambio activo.
- Cuerpo PR: validador canonico local y engineering-policy remoto PASS.
- Scan Semgrep completo ejecutado: 19 hallazgos, 3 nuevos pendientes; no se informa PASS.
- PASS de B1 preparacion, proxy y preparacion staging reutilizados de 7cab:
  https://github.com/novo34/cleanops-360/actions/runs/41131270143 ,
  https://github.com/novo34/cleanops-360/actions/runs/41131278978 ,
  https://github.com/novo34/cleanops-360/actions/runs/41131278892 .
  Esos runs no se atribuyen a un SHA posterior. Los 284 tests y build no se repiten
  porque no ha cambiado ningun contrato/codigo de aplicacion.
- Quality remoto previo FAIL: https://github.com/novo34/cleanops-360/actions/runs/41131279013 .

Estado vigente: **BLOCKED**, por aprobacion de seguridad (pin y tres imports) y
por artefactos/decisiones privadas enumerados arriba. engineering-policy ya esta
resuelto. El procedimiento A–E es unico, reutiliza el Agent actual y actualiza
solo web. No se ha ejecutado nada sobre VPS ni se declara login/TOTP operativo.

Gitleaks 8.24.3 sobre los cuatro archivos de este incremento: PASS, cero
hallazgos. git diff --check y git apply --check del parche PENDING: PASS.
El parche no esta aplicado: git diff del checker y del ledger aprobado queda vacio.


## Quality PR 31 — correccion acotada desde 1388553

Unico alcance de este incremento: los tres imports y la revision de runtime/pin.
QG-0: se reutilizan instrumentation.ts, reviewed-site-installation.ts, el guard,
parche PENDING y pruebas existentes. Diff ejecutable minimo: imports estaticos de
los DOS modulos literales del repositorio en instrumentation.ts. No se modifica
el runtime, cargador privado, manifiesto, contratos, reglas o infraestructura.
La unica otra ruta modificada es este registro. Sin archivos nuevos ni deps.

Los dos imports literales no usaban datos HTTP para elegir modulo. Se sustituyen
por imports estaticos conocidos; el grafo es analizable y desaparecen los dos
hallazgos sin excepcion ni bypass. La condicion NEXT_RUNTIME=nodejs sigue
controlando el arranque/lectura privada. Las factories no abren conexiones ni
provisionan al importar. Build Next 16.4.3 confirma la compilacion del grafo actual.
No se agrega soporte Edge nuevo ni se atribuye al test Node una ejecucion Edge.

El tercero es diferente: import nativo de bytes de codigo privado revisados.
Su ruta y checksum proceden del manifiesto root:999/0440 fijo, el lector rechaza
symlinks/metadatos invalidos, el modulo es root:999/0440 y se verifican SHA-256 y
referencia de aprobacion antes de ejecutar EXACTAMENTE los bytes leidos (data
URL, sin reabrir el path). No hay selector HTTP/ENV. Este analisis del autor no
constituye dictamen independiente. Existe ejecucion privilegiada intencional del
modulo de sitio; cambiarla por require/eval/vm/alias o esconderla del scanner no
corrige esa frontera y no se hace. Retirarla o cambiar el formato de integracion
alteraria la arquitectura y el contrato existente, fuera de este arreglo minimo.

### Resultado del scan y conclusion

Semgrep 1.177.0 completo, reglas/exclusiones canonicas, --error y --disable-nosem:
**17 hallazgos** y el warning upstream de parser ya fijado. Simulando solamente
el pin propuesto, el evaluador reconoce 16 resultados historicos y deja UN
hallazgo nuevo en reviewed-site-installation.ts:44. Resultado **FAIL**, ninguna
regla desactivada, ninguna supresion inline. Los dos de instrumentation desaparecen.
Con el cargador privado y la regla import($VALUE) actuales, **Quality no puede
pasar sin una nueva decision de revision individual**, ademas del pin. No se
presenta el pin por si solo como solucion completa.

### UNICA aprobacion pendiente para Quality

El propietario novo34 debe autorizar UN paquete de revision, DESPUES del dictamen
de un revisor de seguridad independiente del autor. El revisor debe comprobar:

1. El diff exacto del runtime implementado (commit 71a95ce) y blob
   f0e91a5ec8a799692947000bff10a7743322015b: slot por proceso, scope solo de
   startup confiable, denegacion de instalacion doble, contador/drain y cierre.
   El contenido no ha cambiado desde los 284 PASS y las pruebas de bundles.
   Revisar/aprobar el B1-RUNTIME-PIN-PENDING.patch existente, comprobado en seco.
2. El UNICO hallazgo residual siguiente y su limite de confianza: manifiesto y
   modulo protegidos, verificacion de bytes, imports/efectos del codigo de sitio,
   autoridad del instalador y ausencia de control del navegador. Emitir dictamen
   individual; solo si es favorable, autorizar su migracion canonica por regla,
   rango, fragmento y contexto fijados, sin excepcion de archivo/regla completa.

No se aplica el pin ni se clasifica este resultado como confirmed_false_positive.
Los campos siguientes son hechos derivados del scan, no una aprobacion:

```json
{
  "status": "PENDING_INDEPENDENT_REVIEW",
  "classification": null,
  "rule": "semgrep.cleanops-code-execution-import",
  "path": "lib/b1/reviewed-site-installation.ts",
  "start": {
    "line": 44,
    "col": 26,
    "offset": 2844
  },
  "end": {
    "line": 44,
    "col": 91,
    "offset": 2909
  },
  "snippet_sha256": "cd1691f3d4074fa53f3fc2124bc332d694e86867630045396a01d5805a9360d1",
  "source_sha256": "867ea66ddfe950b83aaccce0e29dd50744cdaaf5edfa354f3545976c80a762c6",
  "runtime_git_blob": "f0e91a5ec8a799692947000bff10a7743322015b"
}
```

El ledger historico permanece inmutable. No se modifican controles ni se crea
una alternativa al checker. La aprobacion debe identificar ambos objetivos,
SHA de fuente exacta, dictamen y responsable; cualquier cambio de bytes invalida
esa revision. Esta es la unica decision en la que se detiene el objetivo Quality;
no se reabren los demas bloqueos B1 ni se solicita permiso para operaciones VPS.

### Comprobaciones de este incremento

- Tres tests existentes dirigidos de instrumentation/cargador: PASS, 0 SKIP.
- TypeScript: PASS. ESLint de los archivos inspeccionados/modificados: PASS.
- Build Next 16.4.3/Turbopack: PASS.
- Scan Semgrep completo ejecutado: 17 hallazgos, uno pendiente tras simular pin;
  no Quality PASS. Se reutilizan las 16 regresiones de simulacion previas porque
  ni guard, ni parche, ni runtime han cambiado.
- Los 284 tests no se repiten: contratos y pruebas existentes conservados.
- git apply --check del parche PENDING y git diff --check: PASS.

Evidencia local fuera de Git (SHA-256 de bytes reales):
- `/tmp/b1-quality-tests.log`: `9eb6243fc6f6b97dca550d613d5ed274dbcc3e9e8f0af81fcb4cba5a42c8d638`.
- `/tmp/b1-quality-build.log`: `1176eacd888e567d7ff46e0a75acc83c9c5f4e73b0df2643cf6b918a40108bfe`.
- `/tmp/b1-quality-semgrep-raw.json`: `0023c64292c10bf5891002f45db923ca133b2ea65ead7639db7edb2134942f05`.
- `/tmp/b1-quality-candidate-result.json`: `d34bf38a3ba51b23c6b98cd75000719447dbcdf5a8a679f73074ce2379813432`.


## Dictamen Claude aplicado — 31-10-2026, Quality PR 31

El propietario comunico revision independiente y autorizo implementar el pin
f0e91a5ec8a799692947000bff10a7743322015b y el mecanismo de import exacto. Ambos
hashes de archivo/fragmento coincidieron antes de escribir. El parche llamado
B1-RUNTIME-PIN-PENDING.patch ya se APLICO; se conserva su nombre como evidencia
historica, no debe volver a aplicarse al checker actualizado.

Se extiende el checker canonico con reconciliacion estricta B1-PI-01 y categoria
accepted_privileged_dynamic_import, separada de los 16 FP historicos. El ledger,
reglas, archivos privados, runtime y fail-closed permanecen intactos. Son 26
regresiones PASS, guard completo PASS y fixtures de las ocho reglas PASS. El
alcance, autorizacion comunicada, hashes y las comprobaciones de los 22 avisos
Edge estan en docs/reviews/SEMGREP_STAGING_17.md, apartado B1-PI-01. Ningun
contenido futuro de integration.mjs se considera aprobado por esta excepcion.

QG-0/QG-3 de este incremento: reutilizados guard, pin, reconciliaciones y harness
existentes; se modifican unicamente checker, sus tests y estos dos registros.
Sin archivos nuevos, dependencias de aplicacion ni cambios operativos. La salida
conserva todos los resultados crudos, clasificacion separada y falla ante cualquier
desviacion exacta; no hay exclusiones nuevas ni nosemgrep. No se identifica una
autorizacion formal adicional exigida para el cambio que el propietario ordeno.
Las aprobaciones de merge, activacion y cada modulo de sitio siguen separadas.
No se afirma Quality remoto PASS hasta observar el run correspondiente.


## integration.mjs — limite de confianza y propuesta pendiente, 31-10-2026

Este apartado es el estado vigente de la integracion de sitio y sustituye las
listas privadas pendientes anteriores. Base local y remota revalidadas ANTES de
escribir: prep/installation-catalog-20261030=dc3495f097666545cd64dc25df9207789e1d3ee1;
staging=d3ea84b38fd1574db1610f03b59c8c4a5050ac72. Arbol inicialmente limpio.

### Estado operativo comunicado por el propietario — NO REPETIR

SQL14, OpenBao, Agent, cinco claves, catalogo TOTP con keyVersion=totp-v1,
identidad mTLS y archivos privados, dummy Argon2id y manifiesto externo al repo
estan preparados. Corpus instalado: xato-minlen12-20261031, 1008 entradas,
SHA-256 24e7aa5e3c9df388ee36d5c729cffd010158da55c43463547cac140b6f8c1c84;
password_min=12 y password_max=128 aprobados. Ningun servicio reiniciado.
Son hechos comunicados por el propietario, no nuevas verificaciones de Codex.
No se lee/copia el manifiesto del VPS ni se opera sobre esos recursos.
No se vuelven a presentar corpus, PHC, catalogo o PKI preparados como bloqueos.

### Hallazgos de contratos y procedencia (revision dirigida)

| Fuente revisada | Hecho verificable y limite |
|---|---|
| installation-context.ts | Valida dos Buffers de 32 bytes, etiquetas y aislamiento ALS; NO autentica al productor. Pasa request.clone() al resolver. Un WeakMap ligado exclusivamente al objeto Request original no se transfiere al clon |
| reviewed-site-installation.ts | Comprueba archivo privado y hash del codigo; eso autentica la instalacion del modulo, NO los datos HTTP que luego consuma. La excepcion Semgrep solo acepta este mecanismo |
| private-runtime.ts / installation-bootstrap.ts / server-startup.ts | Composicion confiable y sources privadas existentes. El contexto se resuelve antes de handleAuth/custodia/SQL. El MISMO normalizeEmail se pasa al backend y a la factory de primer actor |
| app/auth/login/route.ts y demas rutas B1 / runtime.ts | Reciben Request y delegan a handleAuth, con runtime Node. No reciben identidad TLS del peer ni un contexto de ingreso verificado |
| NextRequest instalado 16.4.3 | La API ip/geo se retiro en Next 15; Request/NextRequest y sus cabeceras no prueban peer/socket, cert de cliente ni identidad de dispositivo |
| proxy.ts | Genera nonce CSP y propaga headers. No verifica peer ni firma metadatos. El nonce CSP no acredita IP/dispositivo y no sirve como dimension estable de rate-limit |
| compose.ingress.yaml / compose.yaml / PROXY_ORIGIN_FIX.md | Router HTTPS, redes Dokploy y puerto web interno; no consta emisor/validador de contexto, ForwardAuth autenticado ni politica acreditada de saneamiento/identidad de proxy. No se inspecciona el Compose vivo |
| service.ts | Allowlist de origen/Host y CSRF protegen routing/solicitudes; no autentican X-Forwarded-For, User-Agent o claims de dispositivo. El propio contrato distingue ambas cosas |
| approved-backend.ts | network/device alimentan los buckets IP/DEVICE y eventos de seguridad. Valores aleatorios por peticion, hashes de UA o un bucket constante alterarian la politica; no se usan |
| trusted-device B1 | El token se valida mediante broker en un flujo autorizado; una cookie remitida por si sola no acredita ingreso. No resuelve IP ni cubre de forma independiente el primer login sin sesion |

Las redes privadas y TLS hasta Traefik no demuestran por si solos la procedencia
de cada header que llega a Next. El mTLS ya preparado para Next/OpenBao es otra
relacion de confianza: no se reutiliza como permiso de firma de ingreso ni como
prueba de identidad del navegador. No se afirma que el VPS carezca de controles
externos; se afirma que no hay evidencia/repositorio de este mecanismo.

### Correo: no hay una politica productiva identificada

first-actor.ts exige normalizeEmail(manifest.email)===manifest.email, pero recibe
la funcion como dependencia. 0002_first_actor.review.sql inserta m->>'email' tal
cual en email_normalized. SQL14/auth_api comparan email_normalized=normalized_email;
no hay transformacion canonica trim/lower/Unicode implementada en ese camino.
Los trim().toLowerCase() encontrados en pg05-http-real, pg05-browser-backend y
openbao-b1-integration son fixtures sinteticos, no autoridad sobre las identidades
instaladas. Un ejemplo almacenado en minusculas tampoco prueba una regla general.

El propietario confirmo durante este encargo que no tiene una funcion/version
del provisionador identificada/aprobada ni constancia de un emisor autenticado.
No autoriza elegir unilateralmente otra normalizacion. Ambas dependencias son
reales y no se resuelven con un default de desarrollo.

### Propuesta concreta minima — PARA APROBACION, no configuracion aplicada

Se conserva el camino actual: Traefik/Dokploy -> Next Node -> integration.mjs ->
createInstallationContext/ALS -> backend B1. No se crea otro backend, store de
sesiones, cliente Bao o provisionador.

1. **Una sola politica de correo.** Identificar la funcion/version realmente usada
   en provisionamiento o, si no existe, definir una politica y comprobar antes su
   compatibilidad y posibles colisiones con identidades existentes. El propietario
   aporta una evidencia NO secreta (codigo/version y vectores de entrada/salida
   anonimizados); cualquier comprobacion de datos privados se realiza fuera de
   Codex con autorizacion propia, no ejecutando SQL aqui. Aprobarla explicitamente.
   normalizeEmail(email) exportara esa funcion exacta. El wiring actual ya la
   reutiliza para login y nuevos primeros actores; no requiere otro normalizador.

2. **Productor autenticado en el ingreso existente.** Propuesta recomendada:
   una asercion de contexto por peticion emitida por un componente confiable del
   proxy existente y verificada criptograficamente en integration.mjs. Puede
   viajar por header, pero el HEADER NUNCA es la autoridad: lo es el verificador
   y la identidad aprobada del emisor. No consta que Traefik tenga hoy esa
   capacidad configurada; antes de implementarla deben acreditarse su version y
   el middleware/extension disponible y aprobado. No se asume ni instala un plugin.
   El proxy debe eliminar/reemplazar claims que mande el cliente y no reflejar
   aserciones privadas en respuestas. El saneamiento sin autenticacion no basta.

   El contrato aprobado debe fijar emisor/audiencia/instalacion, identidad y raiz
   de verificacion, algoritmo/formato estandar, binding a metodo/target y datos
   relevantes de la peticion, integridad del cuerpo si corresponde, vigencia,
   proteccion de replay, limites de tamano/tiempo y rotacion/revocacion. No se
   eligen TTLs ni claves en este expediente. Una firma solo acredita al emisor;
   NO convierte claims que este copie de UA/cookies en hechos verificados.

   network/device deben ser pseudonimos keyed estables segun politica de los
   buckets, emitidos tras verificar sus fuentes, NO simples hashes de IP/UA ni
   valores nuevos por peticion. La clave/proposito de pseudonimizacion e identidad
   del emisor requieren aprobacion; no se reutilizan por conveniencia audit-hmac,
   cursor-hmac, otp-hmac, recovery-hmac, totp-aead o certificados de Bao. No se
   genera, nombra como existente ni aprovisiona ningun secreto/identidad nuevo.

3. **Definir dispositivo y etiquetas sin fabricar identidad.** La fuente debe
   funcionar tambien para el primer POST /auth/login, sin sesion. Si se elige un
   identificador de perfil anonimo emitido por servidor y transportado en cookie,
   solo se usa despues de validar su autenticidad, vigencia y vinculacion; es una
   propuesta pendiente, no la cookie trusted-device existente ni un dispositivo
   fisico atestado. Deben aprobarse alta, renovacion/borrado, privacidad y efecto
   de reemision sobre rate-limit. device/browser deben describir hechos que el
   productor pueda acreditar; firmar User-Agent no acredita navegador/hardware.
   Si se requieren nombres reales verificados, hace falta su fuente de registro
   o atestacion. No se introducen etiquetas constantes de fixture ni fallback
   "unknown"; un significado informativo de "no atestado" tambien exige aprobar
   esa semantica, no se adopta por defecto.

4. **Modulo privado reutilizando los contratos.** Exportaciones exactas:
   normalizeEmail(email) y async resolveRequestContext(request). Este ultimo
   verificara primero la asercion/identidad, binding, vigencia y replay con un
   presupuesto acotado; despues devolvera network/device como Buffers de 32
   bytes y etiquetas canonicamente validadas, copiadas desde esos datos verificados.
   Debe manejar el clon sin consumir el body del handler ni confiar solo en
   Content-Length; reutilizar limites canonicos y rechazar antes de efectos.
   Ausencia/error => rechazo, nunca contexto por defecto. ALS existente conserva
   aislamiento y limpieza. El material publico/config del verificador se incorpora
   al paquete privado RO y se fija en la revision del modulo; no hay nuevos campos
   de manifiesto o API adoptados sin aprobar su necesidad.

5. **Revision y entrega, sin instalacion.** Con los puntos 1–3 acreditados, preparar
   el modulo real, sus pruebas de autenticacion/replay y SHA-256 de bytes exactos.
   No registrarlo como aprobado ni copiarlo al VPS en este encargo. Hasta entonces
   NO se genera integration.mjs, ni un hash de un modulo ficticio. Esto aplica
   el caso 10 solicitado por el propietario y mantiene fail-closed.

Archivos de una implementacion FUTURA, solo tras esas decisiones:

- integration.mjs del paquete privado: nueva implementacion real de las dos
  exportaciones; verificador y normalizacion aprobados, sin secretos en Git.
- Configuracion del router/middleware existente (representacion revisable en
  deploy/staging/compose.ingress.yaml si procede): emision/saneamiento y control
  del hop confiable. No se modifica ahora ni se aplica en Dokploy/VPS.
- Tests de integration.mjs para el mecanismo elegido; se reutilizan los tests
  del consumidor y del proxy. Un mecanismo basado en firma usa el Request clonado
  ya disponible y no necesita redisenar los contratos TS existentes.

### Cambios y pruebas de este encargo

QG-0: se reutilizan installation-context y sus tests, primer actor, SQL14,
service/proxy y registros existentes; el diff se limita al test de contexto y
este apartado del handoff. No hay codigo productivo ni modulos de ejemplo nuevos.
Los fixtures modelan un canal SOLO del servidor con AsyncLocalStorage; no son un
emisor, no inventan una atestacion ni prueban autenticacion de infraestructura.
Sus buffers/etiquetas sinteticos existen solo en tests y nunca se exportan a
produccion. Las pruebas demuestran el contrato consumidor condicionado a un
resolver que autentique su entrada, no certifican un resolver aun inexistente.

Resultado real: **9/9 tests de installation-context PASS**, cero FAIL/SKIP;
TypeScript y ESLint del test PASS. Incluyen concurrencia con dos peticiones y
una tercera sin contexto, cabeceras/cookies/body suplantados, tipos/longitudes
invalidos, limites de etiquetas, copia frente a mutacion, limpieza tras errores,
tareas tardias y delegacion sin imponer politica de correo. El primer typecheck
senalo una inferencia union del objeto Headers de fixture; se corrigio con el
Record<string,string> correspondiente, sin relajar codigo productivo.
No se repite build ni suite B1 completa: no cambia codigo/contrato productivo.
No se ejecutan operaciones ya completadas ni pruebas sobre VPS.

Estado: **BLOCKED para preparar/aprobar un modulo productivo**, por falta de
politica de normalizacion acreditada y de productor/contrato autenticado de
contexto (incluidas semanticas de dispositivo/etiquetas). No hay un SHA de modulo
instalable que presentar aun. El siguiente paso minimo es aprobar esos dos
contratos con evidencia; despues puede implementarse el modulo y calcular su
hash sin tocar PostgreSQL/OpenBao/Agent ni activar B1.
