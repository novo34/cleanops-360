# B1: candidato auditado y ejecución verificable pendiente

Estado: **BLOCKED**. Base preservada: `a71c43164c07c240400425abbc3898155a83822e` (7 archivos, 650 líneas). Este documento consolida la propuesta y el procedimiento; no hay otro runbook ni autorización implícita. No acredita login/TOTP, infraestructura observada ni compatibilidad de identidades reales.

## Preparación de contrato desde 89c3c4a — sin activación

QG-0: inventario dirigido de `installation-config.ts`, `installation-bootstrap.ts`,
`installation-context.ts`, `server-startup.ts`, `runtime.ts`, `instrumentation.ts`,
`ingress-forward-auth.ts`, `ingress-assertion.ts`, `integration-candidate.ts`,
`compose.ingress.yaml`, tests de configuración/ingreso y esquema SQL14.
Se extiende el contrato de preparación existente; no se reemplaza el handler,
backend, sesiones, bootstrap ni propietario del lifecycle. Las reservas de
ceremonias requieren su contexto B1 y `app.trusted_devices` requiere una sesión:
no son un repositorio acreditado para nonces de ingreso ni credenciales prelogin.
No se añaden tablas, migraciones, archivos de estado ni servicios paralelos.

Diff mínimo: `installation-config.ts` declara binding IP explícito sin wildcard,
puerto, paths exactos, scope HTTPS, confianza mTLS/cabeceras reconstruidas/aserción
firmada, dependencias y readiness/cierre. `prepareB1IngressListenerPlan` valida y
copia configuración sin IO; SIEMPRE devuelve `activation: blocked` y pendientes.
No se añade el plan al objeto aceptado por el loader/bootstrap vigente: hacerlo
cambiaría la frontera privada revisada. Solo lo consume la preparación aislada y
su prueba dirigida nueva, necesaria para validar rechazos y ausencia de efectos.
El test de configuración existente cubre compatibilidad; no se repiten suites
de protocolo, SQL ni runtime intactos. Riesgos: una interfaz no demuestra
atomicidad, autorización, persistencia ni aislamiento; las referencias de
evidencia tampoco son atestaciones. No se abre ningún socket ni se selecciona
un backend. AUTH-GATE-05 permanece abierto.

El repositorio replay exige claim linealizable en todos los consumidores y
reinicios, retención hasta exp y rechazo ante incertidumbre/capacidad/fallo, sin
fallback local. El repositorio de credenciales exige lectura autoritativa en
emisión y aceptación, enrolamiento con autorización independiente, revocación
terminal por revisión y recuperación atómica revocar/crear con ID nuevo.
Son contratos de adaptadores por implementar y comprobar, NO garantías del
verificador candidato actual. No se conectan ni se modifica su Map/protocolo.
Readiness y cierre son callbacks del propietario existente; no otro coordinador.
La implementación futura debe verificar tiempo máximo de drenado y cierre
idempotente, además del orden descrito por el contrato.

Decisiones humanas previas a esa conexión: repositorio existente autorizado y
su scope/retención, semántica y canal de autorización/recuperación de perfiles,
parámetros de rollout y binding/red/rutas, evidencia de saneamiento Traefik y
propósito TLS. Presentar antes de aplicar cualquier diff del verificador,
protocolo firmado, loader/pins o persistencia/ACL revisados. Este contrato no
aprueba esas decisiones, material criptográfico ni recibos de correo futuros.

QG-3 local de esta preparación: cinco casos dirigidos PASS (tres nuevos y dos
de configuración existente); tras ampliar el rechazo de bindings wildcard IPv6,
los tres casos afectados PASS. TypeScript `--noEmit --incremental false`, ESLint
de los dos archivos TS y diff whitespace PASS. No se ejecutan suites completas,
SQL ni pruebas operativas. Las dependencias se restauraron desde lockfile con
scripts de instalación deshabilitados; los primeros intentos fallaron por caché
ausente/red restringida y ruta de caché no escribible, resueltos con acceso de
red permitido y caché temporal. No son fallos de B1. No se cambia el lockfile.

## Auditoría de los siete archivos

| Archivo | Necesidad, reutilización y conclusión |
| --- | --- |
| `lib/b1/email-normalization.ts` (65 líneas) | Separa política candidata e informe/recibo. Reutiliza canonical/valid; private-runtime ya comparte el callback entre backend y primer actor. No duplica un provisionador histórico identificado. La política ASCII preserva local-part y baja dominio; NO se presume histórica. Informe compatible no prueba que el snapshot sea completo. |
| `lib/b1/ingress-assertion.ts` (171) | Protocolo nuevo necesario porque no existe productor autenticado acreditado. Reutiliza límites, etiquetas, AuthError y contrato ALS. Firma Ed25519 con separación credencial/contexto, binding de petición, TTL y caché finita. No duplica la autenticación ni su control de sesiones. La caché NO acredita topología ni revocación de dispositivos. |
| `lib/b1/ingress-forward-auth.ts` (62) | Adaptador de TLSSocket autorizado y certificado fijado, cuerpo limitado y rechazo antes de emitir. No es un listener ni prueba saneamiento del proxy real. Rechaza URI con coma por validación conservadora: límite de disponibilidad conocido; decidir compatibilidad con rutas reales antes de ampliar su parser. |
| `lib/b1/integration-candidate.ts` (28) | Factory y renderer para el loader data URL existente; no crea otro runtime. Solo dos exportaciones, configuración pública/recibo en bytes del wrapper. Helpers/imports requieren imagen inmutable revisada: hash del wrapper no cubre imports transitivos. |
| `scripts/check-b1-email-compatibility.mjs` (20 iniciales) | CLI offline necesaria; usa lector privado existente. Defecto corregido: comprobaba ubicación respecto al cwd, no al checkout. Ahora usa raíz del script y UTF-8 estricto. Solo lectura, salida agregada, sin SQL ni mutaciones. |
| `tests/b1/ingress-candidate.test.ts` (255 iniciales) | 12 casos agrupados cubren contratos distintos, integración real local y fallos. Reutiliza consumidor ALS; no sustituye sus nueve pruebas. Hay scaffolding menor prescindible (directorio temporal del test del módulo renderizado), sin efecto de seguridad; no se modifica ni se repite ese test en este encargo. |
| Este documento (49 líneas iniciales largas) | Contenía propuesta, decisiones y evidencia; ahora se consolida aquí con inspección y matriz, sin crear documentación paralela. |

No es justificable afirmar que cada una de las 650 líneas sea estrictamente imprescindible. Los cinco componentes funcionales y sus pruebas sí tienen responsabilidades distintas; no se detecta otro normalizador canónico, emisor o caché de ingreso que puedan sustituirlos. El candidato permanece sin importar desde arranque/rutas activas. No se modifican runtime/loader/instrumentation ni pins, SQL14, OpenBao, Agent, corpus o material instalado.

## Correo: comprobación exclusivamente de lectura

Entrada: snapshot YA existente y autorizado, fuera del checkout, JSON completo `[{"id":"...","emailNormalized":"..."}]`, IDs únicos y valor almacenado exacto. No generar/exportar datos desde PostgreSQL en este procedimiento. Si no existe un snapshot completo autorizado, registrar ese bloqueo; no usar muestras ni ejecutar SQL. El formato de arriba es descripción, no identidades de producción.

El propietario verifica en privado alcance, número de identidades y frescura con el responsable de provisionamiento. Debe incluir todas las identidades a las que aplicaría la política, sin inferir que un cero demuestra instalación vacía. Máximo 65536 bytes: si se excede, detenerse; no dividir el snapshot porque se perderían colisiones entre fragmentos. uid/gid y permisos 0400/0600 reales, sin symlinks. No se cambian permisos ni archivos existentes para lograr un PASS.

Desde una copia revisada del repositorio con Node compatible, ejecutar (variables obtenidas del inventario privado, no valores inventados):

```bash
node --experimental-strip-types scripts/check-b1-email-compatibility.mjs \
  "$B1_SNAPSHOT" "$B1_SNAPSHOT_UID" "$B1_SNAPSHOT_GID" "$B1_SNAPSHOT_MODE"
```

No usa conexiones de red/DB, ni escribe informe o snapshot. Salida: versión/hash de política, hash de snapshot canónico, conteos total/inválidos/cambiados/colisiones y estado. Exit 0 compatible, 1 incompatible, 2 entrada/lectura inválida. No imprime IDs, emails, filas ni errores originales. Los hashes son huellas potencialmente correlacionables: conservar informe completo en el canal privado de revisión; para comunicar públicamente, compartir solo versión, conteos y estado. No es una política histórica ni una aprobación automática.

Antes de adoptar: informe completo compatible + confirmación de totalidad/frescura + referencia de aprobación real, y corte de provisionamiento que impida nuevas identidades entre snapshot/adopción. Usar el MISMO callback/versionado en provisionamiento y autenticación; si hay provisionador externo aún no identificado, falta integrarlo/verificarlo. No aplicar trim/lowercase local-part ni migrar identidades para forzar compatibilidad.

## Único procedimiento de inspección VPS — solo el propietario

**Esta fase es observación, no autorización de cambios.** No ejecutar compose up/restart, reload, SQL, escrituras, pruebas contra login ni peticiones con credenciales. No instalar herramientas, activar API/dashboard, leer claves/certificados privados, mostrar env, logs, inspect sin filtrar, compose config ni YAML completo. Si falta permiso/herramienta o la evidencia no existe, marcar UNKNOWN y parar esa comprobación. Requisitos: Docker CLI autorizado, python3; no se usan SSH ni nuevos servicios en este procedimiento.

1. En Dokploy, identificar PRIVADAMENTE los IDs reales del contenedor Traefik y de la web staging. Anotar fecha UTC, revisión/imagen actual y proyecto/entorno. Introducir esos IDs (sin comandos copiados de fuentes externas). El siguiente bloque solo devuelve campos permitidos y agregados; no vuelca argumentos, variables, labels, mounts ni secretos:

```bash
read -r -p 'ID real de Traefik: ' B1_PROXY_ID
read -r -p 'ID real de web staging: ' B1_WEB_ID
python3 - "$B1_PROXY_ID" "$B1_WEB_ID" <<'PY'
import json, re, subprocess, sys

def docker(*args):
    return subprocess.check_output(['docker', *args], stderr=subprocess.DEVNULL, text=True)

def inspect(cid):
    return json.loads(docker('inspect', cid))[0]

try:
    if len(sys.argv) != 3 or any(not re.fullmatch(r'[0-9a-f]{12,64}', x) for x in sys.argv[1:]):
        raise ValueError()
    proxy, web = (inspect(x) for x in sys.argv[1:])
    for name, item in [('proxy', proxy), ('web', web)]:
        print(name, json.dumps({
            'imageId': item['Image'], 'running': item['State']['Running'],
            'networks': sorted(item['NetworkSettings']['Networks']),
            'publishedPorts': sorted(item['NetworkSettings'].get('Ports') or {}),
            'mountCount': len(item.get('Mounts', []))}))
    labels = proxy.get('Config', {}).get('Labels') or {}
    web_labels = web.get('Config', {}).get('Labels') or {}
    print('proxyLabelKeys', json.dumps(sorted(k for k in labels if k.startswith('traefik.'))))
    print('webTraefikLabelKeys', json.dumps(sorted(k for k in web_labels if k.startswith('traefik.'))))
    args = proxy.get('Config', {}).get('Cmd') or []
    print('proxyFlagNames', json.dumps(sorted(a.split('=', 1)[0] for a in args
        if isinstance(a, str) and re.fullmatch(r'--[A-Za-z0-9_.-]+(?:=.*)?', a))))
    project, service = web_labels.get('com.docker.compose.project'), web_labels.get('com.docker.compose.service')
    siblings = None
    if project and service:
        ids = docker('ps', '-q').split()
        siblings = sum(1 for cid in ids if all((inspect(cid).get('Config', {}).get('Labels') or {}).get(k) == v
            for k, v in [('com.docker.compose.project', project), ('com.docker.compose.service', service)]))
    print('runningComposeSiblingsOnThisHost', siblings)
    processes = docker('top', sys.argv[2], '-eo', 'comm').splitlines()[1:]
    print('nodeOrNextNamedProcesses', sum(bool(re.search(r'node|next', p, re.I)) for p in processes))
    sid = web_labels.get('com.docker.swarm.service.id')
    if sid:
        s = json.loads(docker('service', 'inspect', sid))[0]['Spec']
        print('swarm', json.dumps({'replicatedMode': 'Replicated' in s.get('Mode', {}),
            'replicas': s.get('Mode', {}).get('Replicated', {}).get('Replicas'),
            'updateOrder': s.get('UpdateConfig', {}).get('Order'),
            'rollbackOrder': s.get('RollbackConfig', {}).get('Order')}))
    print('inspection', 'READ_ONLY_PARTIAL; manual checks below are mandatory')
except Exception:
    print('inspection', 'UNKNOWN; no raw output or exception disclosed')
    sys.exit(2)
PY
docker exec "$B1_PROXY_ID" traefik version
```

`traefik version` ejecuta solo la consulta de versión del binario existente. Si el binario no está disponible con ese nombre, no adivinar rutas/comandos: usar imagen/digest y evidencia privada del operador. No compartir IDs, red o topología en canales públicos innecesariamente. El conteo de procesos es orientativo: npm/helpers pueden sumar procesos y no revela quién consume B1. No acredita unicidad por sí solo; el conteo Compose es solo del host y no cubre otros proyectos/hosts ni versiones con labels distintas.

2. Mediante la vista de configuración YA autorizada de Dokploy/Traefik (o revisión privada local del archivo efectivo identificado por el operador), completar esta lista sin copiar su contenido. No habilitar APIs ni extraer archivos/certificados. Si hay API efectiva ya autorizada, usar únicamente su vista de lectura existente; no entregar autenticación ni respuestas crudas. Registrar referencia de la fuente y resultado no secreto:

| Evidencia requerida | Resultado que permite seguir |
| --- | --- |
| Versión SemVer exacta del binario y digest de imagen | Consultar documentación/source de ESA versión. No fijar un mínimo ficticio a partir de documentación latest. |
| Providers efectivos, config estática desde flags/env/file y fichero dinámico/labels realmente seleccionado | Saber qué configuración gana; nombres de flags del bloque anterior no revelan sus valores ni prueban configuración efectiva. |
| ForwardAuth nativo de esa versión | Soporta `address` HTTPS, `tls.ca/cert/key`, validación de servidor sin insecureSkipVerify, `authRequestHeaders`, `authResponseHeaders`, `forwardBody`, `maxBodySize`; verificar límites/timeout disponibles y semántica de `trustForwardHeader` en esa versión. Si falta alguno, candidato no conectable tal cual. |
| EntryPoint HTTPS y cadena real de balanceadores | Origen de IP acreditado, `forwardedHeaders.insecure` deshabilitado, trustedIPs restringidas solo a upstreams reales cuando existan; con conexión directa, no confiar campos del navegador. Revisar también proxyProtocol si existe. |
| Reconstrucción de X-Forwarded-Method/Proto/Host/Uri/For | La combinación entrypoint + ForwardAuth debe reconstruir/sanitizar TODOS, no solo XFF. El candidato exige una IP única: múltiples hops deben rechazarse hasta adaptar un contrato acreditado. |
| Router web, servicio, middleware y orden efectivos | Destino staging real, solo HTTPS; middleware sin eludir por router paralelo, sin cache/retry del token ni cambios posteriores de body/binding. `authResponseHeaders` reemplaza únicamente la aserción candidata. Headers estáticos NO firman. |
| Ruta de red Traefik → web y exposición directa de 3000 | Red existente compartida, acceso privado al futuro endpoint mTLS, ninguna ruta pública a emisión. Revisar publicaciones con host/ACL en privado: la lista de puertos del bloque no prueba reglas de firewall. |
| Identidades TLS existentes y autorización de propósito | Solo referencias y metadatos públicos ya inventariados: CA, fingerprint público, SAN/EKU/validez/identidad autorizada de proxy y servidor. No leer/exportar claves ni copiar identidad de Agent. Si no hay material apto autorizado, marcar bloqueo, no crearlo. |
| Topología y actualización Dokploy | Un consumidor B1 real (proceso/worker/instancia) globalmente; sin PM2/cluster/replicas/rolling/blue-green/rollback con solapamiento. Revisar todos los routers/hosts y política futura, no solo una foto de docker ps. |
| Reloj y reinicios | Evidencia no secreta de sincronización y política sin retroceso, drenado del consumidor anterior y renovación del epoch; no cambiar reloj ni reiniciar para comprobarlo. |

Fuentes de capacidades a contrastar con versión exacta: [ForwardAuth](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/forwardauth/), [Headers](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/headers/), [Dokploy dominios](https://docs.dokploy.com/docs/core/domains). Si la versión instalada difiere, latest NO constituye evidencia suficiente. La inspección no prueba experimentalmente saneamiento: ese test con cabeceras hostiles quedará para una reproducción aislada de la versión/config efectiva, antes de aprobar conexión real.

3. Si YA existe snapshot autorizado y copia revisada del comprobador, ejecutar la comprobación de correo indicada arriba. Si no existen, dejar pendiente su obtención por canal autorizado; no subir/instalar código ni exportar DB como parte de esta inspección. Entregar solo resultados agregados, checklist PASS/FAIL/UNKNOWN, versión/digest y referencias de revisión. Cualquier UNKNOWN esencial impide aprobar la integración.

## Conexión mínima con Next.js: qué está resuelto y qué falta

La imagen copia `/app` completo, usa Node 24 y `npm run start` → `next start`. `instrumentation.register()` ya es el hook Node del arranque B1; la documentación instalada de Next 16.4.3 dice que corre una vez POR instancia y termina antes de servir. No demuestra instancia única global. Un Route Handler de Next no entrega aquí el TLSSocket acreditado; poner ForwardAuth en una ruta HTTP normal perdería la autenticación mTLS requerida.

Propuesta mínima tras inspección/aprobación: conservar `next start`, conectar un único servidor HTTPS interno al hook Node existente, dentro del proceso/contenedor web; asignar bind/puerto SOLO tras confirmar red y colisiones, sin publicar puerto host ni nuevo servicio. Reutilizar handler existente y certificados autorizados, sin custom Next server ni segundo framework. Requiere configuración privada revisada del emisor y no solo el manifiesto actual (que describe el consumidor); no reutilizar sus campos Bao para ese propósito. Preparar un diff acotado de schema/bootstrap/instrumentation con guards correspondientes; todavía NO se ha escrito un listener productivo ni inventado su configuración.

Orden de ese futuro código: validar configuración/imagen/credenciales y estado de revocación → crear UNA instancia del verificador/cache por consumidor → preparar runtime B1 existente → iniciar listener mTLS solo en red privada → habilitar readiness cuando ambos estén sanos. Fallo parcial: cerrar listener, runtime y claves en orden inverso, readiness negativa y B1 cerrado; no capturar error dejando una emisión disponible. Shutdown: retirar readiness/emisión, drenar peticiones, cerrar listener/runtime y liberar material. No añadir señales incompatibles con las de Next sin validar el ciclo real. Prever liveness/readiness separadas: el healthcheck actual `/login` no demuestra salud del emisor ni B1.

La parte resoluble sin VPS ya existe: handler inyectable, factory, render de módulo privado, lector estricto y consumidor ALS probados. Esta auditoría corrige el CLI, pero no añade un segundo coordinador de arranque vacío. Faltan configuración efectiva, autorización TLS y contrato de estado; por eso conectar sockets ahora sería inventar un listener. Antes de conexión: reproducir versión/config de proxy localmente, probar saneamiento real y ciclo start/error/drain, revisar bytes/hash de wrapper e imagen/transitivos y aprobación independiente (la excepción Semgrep del loader NO aprueba el contenido nuevo).

## Ciclo de vida mínimo del perfil lógico — especificación pendiente de aprobación

Bearer firmado = posesión de una copia, NO identidad física, hardware, cuenta autenticada ni segundo factor. Etiquetas son descripciones del enrolamiento, no browser/UA acreditados. Prelogin requiere credencial: el enrolamiento inicial/recuperación debe disponer de un canal de operador independiente del login B1, no un bypass público que se autoemita credenciales por cabecera/cookie.

| Transición | Regla mínima y evidencia |
| --- | --- |
| Ausente → emitida/activa | Operador autorizado verifica la solicitud por canal aprobado y registra ID aleatorio, referencia privada de enrolamiento, emisor/audiencia, iat/exp, estado y revisión; entrega HTTPS con cookie Secure/HttpOnly/Path=/, sin Domain, SameSite aprobado. No registrar token/cookie en logs. Sin estado confirmado no entregar. |
| Activa → aceptada | Validar firma, scope, vigencia, estado activo vigente, binding y nonce antes de efectos. Sin credencial/status legible o con snapshot de estado vencido, rechazar. TTL de credencial y frescura de estado son valores a aprobar; contexto nunca supera 30 s ni expiración de credencial. |
| Activa → renovada | Nueva emisión autorizada y nuevo ID; cerrar credencial anterior mediante estado, sin extensión silenciosa ni confiar UA/IP. Si cambia identidad de dispositivo/pseudónimo, documentar el efecto sobre límites de B1; no resetear controles para eludirlos. |
| Activa → revocada | Operador autorizado persiste revocación, estado terminal hasta exp; emisor deja de emitir para ese ID y verificador rechaza también aserciones ya emitidas. No equivale a logout, borrado de cookie ni revocación de sesiones B1. |
| Activa → expirada | Expiración absoluta, sin gracia; rechazar aunque la firma sea válida. Eliminar metadatos solo conforme a retención aprobada y nunca antes de exp + ventana de aserciones. |
| Pérdida/robo → reemplazo | Revocar primero el ID perdido; recuperación por canal independiente de posesión del bearer/UA/IP/email no verificado. Emitir nuevo ID solo tras verificar autorización; no restaurar token ni desrevocar. Si no se puede acreditar recuperación, permanece denegado. |
| Compromiso de emisor | Suspender emisión y rechazar credenciales/aserciones del scope afectado; ejecutar gestión de incidente y material SOLO por procedimiento autorizado. No crear/rotar claves en este encargo. |

**Gap de implementación real:** el candidato actual solo verifica firma/tiempo; NO consulta estado por ID, no implementa recuperación ni revocación individual. Aprobar esta tabla NO elimina ese gap. Recomendación sin nuevos servicios: estado privado duradero, propiedad del operador, en almacenamiento ya existente que esté autorizado para ello, actualización atómica y lectura RO por emisor/verificador con lector privado reutilizado. Evaluar un registro privado acotado antes que añadir DB/Redis: no existe todavía tal registro acreditado. Deben aprobarse formato, writer, frescura y atomicidad; no crear archivo en el mount instalado ahora. Si no admite revocación inmediata, declarar explícitamente la ventana máxima de frescura + aserción (<=30 s), exigir aceptación del riesgo y comprobarla. Si se exige revocación inmediata global, hace falta consulta consistente en cada decisión o garantía equivalente: no prometerla con snapshots. Capacidad del lector 64 KiB también limita ese diseño y debe medirse antes de elegirlo.

## Antirreplay y condición de activación

La caché actual sirve SOLO con una instancia del verificador/Map, un consumidor por proceso y sin otro proceso capaz de aceptar el mismo token. El literal de configuración `single-process-single-consumer` es declaración, NO attestation de topología. Dos factories, workers, contenedores o versiones simultáneas tienen caches distintas y pueden aceptar el mismo nonce. Ni una instancia actual ni Docker replicas=1 prueban ausencia de solapamiento futuro.

Recomendación mínima: acreditar consumidor único y actualización/rollback stop-first con drenado completo; fallar cerrado durante indisponibilidad. Reinicio rechaza iat <= epoch pero necesita garantía de reloj; no cubre rollback del reloj entre procesos. Si operación exige múltiples consumidores o actualización sin corte, este candidato queda BLOQUEADO hasta un claim atómico compartido con TTL/capacidad/errores probados, reutilizando infraestructura solo si realmente existe y está autorizada. No se incorpora Redis ni SQL por suposición. No cambiar la topología real en esta inspección.

Gate: inventario de consumidores + política de rollout/rollback + prueba aislada de concurrencia/replay/reinicio sobre ESA topología. Hoy NO hay esa evidencia del VPS; no autorizar conexión/activación sobre el mero literal del código.

## Matriz final y orden para integración aprobable

| Decisión | Evidencia requerida / disponible | Riesgo | Recomendación | Autorización necesaria |
| --- | --- | --- | --- | --- |
| 1. Política de correo compartida | Código e informe offline disponibles; faltan snapshot completo compatible, frescura y consumidor de provisionamiento acreditado | Cambiar identidad o colisionar cuentas | Mantener política candidata sin activar; revisar agregados privados y adoptar callback único/versionado en ambos flujos | Propietario aprueba versión + hash/snapshot + alcance/corte; no una política histórica inventada |
| 2. Ingreso/Next/TLS | Handler/factory aislados disponibles; faltan checklist de versión/config/red/saneamiento, propósito de certificados y prueba con proxy efectivo | Contexto falsificado, TLS incorrecto, disponibilidad/arranque parcial | ForwardAuth nativo + hook Node existente, sin nuevo servicio; solo tras verificar capacidad y preparar diff real de arranque/readiness/drain | Propietario/operador autorizado aprueban identidad TLS, red/config y propósito del material existente; revisión independiente de diff y pins afectados |
| 3. Dispositivo y estado | Firma/vigencia disponibles; enrolamiento y estado/revocación/recuperación NO implementados | Bearer copiado permanece aceptado; bootstrap circular | Aceptar perfil lógico solo con canal de operador independiente y estado duradero RO/frescura definidos; implementar/testear después del contrato aprobado | Propietario aprueba semántica, roles, TTL/SameSite, registro/retención y ventana de revocación; autorización no sustituye implementación |
| 4. Topología/protocolo/material | Replay local probado; topología global/reloj/rollout y material apto NO acreditados | Doble aceptación entre consumidores; imports o clave inapropiados | Único consumidor demostrado y stop-first; de lo contrario claim compartido antes de seguir. Inventariar claves aptas sin reutilizar custodia/Agent por defecto | Propietario aprueba parámetros, topología/indisponibilidad y uso de material ya autorizado; revisor independiente aprueba wrapper+imagen/transitivos exactos |

Orden cerrado: inspección RO y snapshot autorizado → decisiones 1–4 con evidencia → implementar SOLO gaps aprobados de estado/ciclo de vida y hook/readiness → pruebas aisladas con versión/config real (sin activar ingreso), incluyendo revocación y consumidores reales → revisión de bytes/imports y SHA del integration.mjs con recibo auténtico. Si falta material criptográfico apto o un mecanismo de confianza, detenerse: este encargo prohíbe crear claves/certificados/servicios. La instalación/activación es otro cambio explícitamente autorizado; no se incluye aquí.

## Validación de esta continuación

Se conserva la evidencia del commit base: 21 pruebas PASS, TypeScript/ESLint y guard Semgrep (17 hallazgos reconciliados, cero excepciones nuevas). No se repiten contratos sin cambios, tests mTLS ni las 284 pruebas B1; no se generan claves/certificados siquiera de test en este encargo. Se modifica únicamente CLI, su caso de regresión y este documento: regresión enfocada de CLI PASS (cwd externo, snapshot intacto, salida agregada, modo inválido, checkout, symlink, UTF-8 inválido, exceso de tamaño e incompatibilidad); TypeScript/ESLint afectados y `git diff --check`: PASS. Semgrep solo sobre el CLI modificado: 8 reglas activas, cero hallazgos/supresiones; se reutiliza el guard completo anterior para fuentes intactas. Procedimiento de inspección: sintaxis Python y salida filtrada comprobadas con datos sintéticos/mocks locales, incluidos ID inválido y valor sensible ficticio que no aparece en salida; ningún comando Docker/VPS ejecutado por esas comprobaciones. No build: grafo activo Next idéntico. Warning Node MODULE_TYPELESS_PACKAGE_JSON conocido, no oculto.
