# CleanOps B1 — ficha verificable para aceptación de shadow + ForwardAuth (04/11/2026)

**Estado: EVIDENCIA TÉCNICA RECOPILADA; SIN APROBACIÓN INDEPENDIENTE; SIN AUTORIZACIÓN DE CORTE.**
Esta ficha se refiere exclusivamente al candidato B1 aislado en el VPS y a la configuración ForwardAuth de la rama de preparación. No constituye por sí sola el valor de autoridad de `ingress.evidenceReference`, y no debe copiarse automáticamente al manifiesto.

## Identidad fija

- Repositorio: `novo34/cleanops-360`. Rama: `prep/b1-final-closure-20261102`; PR #33 DRAFT, sin merge.
- Fuente del candidato: `cc51574ad85485728d877efbbb69bcb345469596`. Imagen local: `sha256:1db5df548b85f451f5eeec41959671aa1b983bffa687dae722c94571d5c20016`.
- Imagen del servicio web original preservada: `sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290`.
- Manifest privado `/run/cleanops-b1-private/installation.json` v2, custodia root:999 0440. `ingress.evidenceReference` aún vacío.
- Proxy Traefik 3.7.17 actualizado y verificado anteriormente; la actualización y cinco HTTPS smoke PASS no se repiten.

## Hechos operativos reportados por el propietario (04/11/2026)

| Requisito | Evidencia | Conclusión limitada |
|---|---|---|
| Certificado Traefik | `TRAEFIK_CLAVE_CERTIFICADO=PASS`, `TRAEFIK_CLAVE_PROTEGIDA=PASS`, `TRAEFIK_CLIENTE_CA_B1=PASS`; PIN previo PASS | Identidad mTLS cliente compatible |
| Listener B1 | SAN DNS `cleanops-b1-ingress`, CA y clave del servidor previamente PASS | Material criptográfico preparado, no indica listener en ejecución |
| Red privada | `BINDING_CIDR=PASS`, red de web `dokploy-network` única | Referencia de red en host, no readiness del proceso shadow |
| Servicio viejo | `cleanops360-f4fxmd-15-websecure@docker` confirmado, puerto 3000 | NO debe ser el backend de rutas B1 |
| Dispositivo | `CREDENCIAL_B1=NO_ACTIVA`, `OPERADOR_B1=CONFIGURADO` | Faltan emisión y canal seguro de entrega |
| Firma operadora | `CLAVE_OPERADOR=PASS`, `ED25519=PASS`, `CLAVE_ORIGINAL=CONSERVADA`, `COPIA_OPERADOR=PROTEGIDA` | Emisor puede prepararse, sin emisión realizada |
| Shadow Docker | `B1_SOMBRA=PREPARADA_SIN_ARRANCAR`, `WEB_ACTUAL=INTACTA`, `TRAEFIK=INTACTO`, `SQL_OPENBAO=INTACTOS` | Contenedor creado y detenido; rollback con `scripts/b1-stage-shadow.py rollback-stage` antes de arrancar |
| Delta ForwardAuth | `B1_FORWARD_AUTH=DELTA_PREPARADO_NO_ACTIVO`, `BACKEND_B1=SOMBRA_SEPARADA` | Archivo privado `/root/b1-shadow-stage/b1-forwardauth.pending` generado; NO instalado |
| TLS proxy | `TRAEFIK_B1_TLS=PREPARADO`, `COPIAS_TLS=3_ROOT_ONLY`, `ORIGINALES_TLS=INTACTOS`, `FORWARDAUTH=NO_ACTIVADO`, `WEB_B1=NO_ARRANCADA` | Tres archivos de TLS copiados bajo el bind del proxy; no cambia rutas |

Referencia de rutas candidatas: `deploy/staging/traefik/b1-forward-auth.delta.example.yaml` tras commit `c63cd244a231e165871933c9e2fa004feb3592d0` usa **exclusivamente** `cleanops-b1-shadow` como servicio File-provider para rutas B1, con URL privada `http://cleanops-b1-ingress:3000`. El servicio original continúa en sus routers.

Código de preparación publicado: `scripts/b1-stage-shadow.py`, `scripts/b1-prepare-forwardauth-shadow.py` y `scripts/b1-stage-traefik-client-tls.py`; no reejecutar las operaciones PASS. Leer el relevo `B1-TRAEFIK-DOKPLOY-HANDOFF-20261104.md` para la procedencia y cronología.

## Puertas no satisfechas: no simular PASS

1. **Referencia de evidencia para listener**: revisión real, atribuible y exacta de las redes, TLS y conducta de ForwardAuth; el campo `ingress.evidenceReference` debe apuntar al registro auténtico aprobado. Esta ficha documenta preparación, no sustituye dictamen.
2. **Primera credencial**: solicitud `device.issue` con `authorizationReference` auténtica, usuario operador ya configurado y entrega de cookie `Secure; HttpOnly; SameSite=Strict; Path=/` por canal seguro. No generar antes de un cutover coordinado.
3. **Arranque y pruebas**: arrancar shadow solo con el manifiesto aprobado, observar readiness del listener y `/login` de Next; negativa mTLS, rutas/headers spoofed, POST/body, replay, logout/TOTP/sesiones y drenaje; rollback si falla.
4. **Cambio público**: instalar YAML dinámica de forma atómica **después** de B1-ready y credential delivery, preservar el antiguo router y retirar el nuevo primero en rollback. No tocar PostgreSQL/OpenBao ni recrear infraestructura.
5. **Aceptación**: revisión independiente del código/infra y aprobación expresa del propietario para staging, con procedimiento de recuperación detallado. `AUTH-GATE-05 OPEN` hasta resultados reales.

## Registro de aprobaciones (pendiente)

- Reviewer independiente, identidad/fecha, commit y alcance: **SIN APROBAR**.
- Product Owner, referencia y alcance del corte: **SIN APROBAR**.
- `ingress.evidenceReference` en manifest: **VACÍO**, no generar texto ficticio.
- Estado de tráfico real B1: **NO ACTIVO**.

**Límite:** esta evidencia es compilación documental de resultados de terminal compartidos por el propietario y de blobs Git; no incluye secretos, tokens, certificados PEM ni inspección directa de runtime de los servicios.

## Actualización 04/11 — revisión de correcciones, sin despliegue

**Último resultado del propietario:** `TRAEFIK_B1_TLS=PREPARADO`, `COPIAS_TLS=3_ROOT_ONLY`, `ORIGINALES_TLS=INTACTOS`, `FORWARDAUTH=NO_ACTIVADO`, `WEB_B1=NO_ARRANCADA`. PASS de copia en el bind ya montado del proxy; no ejecutar otra vez el instalador.

**Correcciones GitHub del PR #33 tras review:**
- El runbook histórico de Traefik se rotuló como ejecutado y se retiró una secuencia de recuperación manual peligrosa que podía detener el contenedor original; commit `f0ff4f90cdb8662afa26f30ffb7631551cb76034`.
- El switch de Traefik (que YA SE EJECUTÓ) ahora exige `smoke.tsv` antes del stop, procesa la última fila sin salto final y rechaza matrices sin rutas; commit `4ecca123df2d279b66572bd14c0ee1d35241c9aa`. Esto es mantenimiento de script para futuros usos, **no** autoriza ni requiere volver a ejecutar el switch.
- El parser de log aislado ahora reconoce `ERR/FTL/PNC/WRN` y secuencias ANSI de Traefik 3.7.17; commits `0ebfed58044875d91aa2fb90c3e6e7fd8a6702f3`, `5dff5784e877541f529f64b04e44accbe3837a5c`.
- Se corrigieron dos aserciones de pruebas estáticas que nunca verificaban lo que afirmaban; commits `160c507d29290f4c2e681c170ef7847cfa95bd8a`, `fbff368e2adb7ed1186cb8e1e0ad3df12fb2844e`.
- Se corrigió la limpieza de `STATE` y Compose en fallos parciales de creación futura de shadow, commit `438971df6cad7ee748d90a50e8636782327820f1`. **No recrear shadow actual**.
- Se exige presencia de los tres archivos TLS *en el bind real de Traefik*, no solo en fuente original, antes de renderizar en futuras instalaciones, commit `76d28a5974ac0a09b0f177cc5d893ce864b61481`. En este VPS ya se prepararon TLS después del render y su fase reportó PASS; no repetir ninguna de ellas por este cambio de orden futuro.
- Se establece `restart=unless-stopped` del shadow **únicamente durante un cutover aprobado y después de readiness, antes de activar el router**; retirar router antes de apagar shadow y entonces poner restart=no, commit `afe3c84f4a0006f03fef070e0b96e8f85060c627`. No se cambia la política del shadow mientras está detenido.

**Verificación independiente:** CodeRabbit ha reportado problemas concretos, pero las correcciones aún necesitan revisión del SHA final y aceptación humana de `AUTH-GATE-05`. Ninguna operación de runtime se ha realizado en estos cambios. Los hechos del VPS previos permanecen PASS. `ingress.evidenceReference` continúa pendiente y no se debe rellenar sin referencia auténtica revisada. 

## Arranque aislado planificado (sin tráfico público)

Se ha publicado `scripts/b1-boot-shadow-private.py` (commit `201fe9f400641bf42bc70851a804ec8d85ad365f`), **todavía sin ejecución confirmada en VPS**. Su fin es permitir **exclusivamente** el arranque privado del shadow `cleanops360-b1-shadow-cc51574a` con comprobación de socket mTLS y Next local, mientras el router público continúa INACTIVO. Verifica que manifest, shadow y web son los mismos que los recibos anteriores, guarda un respaldo root-only y modifica solo el campo `ingress.evidenceReference` con un enlace inmutable a la evidencia técnica real en esta rama. Esa referencia **no representa ni implica revisión independiente/autoridad para el corte**, y no permite declarar `AUTH-GATE-05 CLOSED`. Ante fallo el procedimiento detiene solo el shadow por ID y restaura el manifest exacto, sin tocar servicios originales.

La solicitud repetida del propietario en el chat de continuar/cerrar B1 autoriza impulsar las operaciones preparatorias de staging, pero **NO** se convierte artificialmente en dictamen de seguridad independiente o permiso automático de exposición pública. La activación de rutas y emisión de credencial siguen pendientes de los consentimientos y verificaciones reales. Un PASS del arranque privado es evidencia adicional para completar el gate, no su sustituto. No volver a crear shadow, certificados ni SQL.

## Corrección puntual del primer intento de boot privado

Salida reportada por propietario VPS el 04/11/2026: `B1_BOOT_STOP=La red del shadow no coincide con su binding y alias`. El control se ejecutaba **antes** de la rama que modifica manifiesto y arranca Docker; por lo tanto, este intento no escribió el manifiesto, no generó respaldo de boot y no arrancó B1. El script anterior confundía endpoint creado en estado `created` con IPv4 efectivamente asignada después del `start`; el `stage` ya había verificado en su momento la presencia de `dokploy-network` y del alias. Commit `667bf38564d63b2966f7739c6fe88acd6b2bf19a`: verifica presencia de red en `created`, inicia el shadow y comprueba IP real, pertenencia al CIDR, alias, identidad inmutable de contenedor y readiness de Next/listener **después** del arranque. El script se detiene y restaura el manifiesto si falla. La corrección no toca el web viejo, Traefik ni los certificados. Pendiente de resultado de ejecución; **no marcar boot privado PASS anticipadamente**.

## Ejecución confirmada: shadow B1 arrancado en privado

**Fuente 04/11/2026: salida literal del propietario en `srv1155120`.** Resultado: `B1_SHADOW=ARRANCADO_PRIVADO`, `B1_INGRESS_SOCKET=PASS`, `B1_NEXT_HTTP=PASS`, `REFERENCIA_EVIDENCIA=TECNICA_REAL_NO_APROBACION`, `FORWARDAUTH=NO_ACTIVADO`, `WEB_ANTERIOR=INTACTA`, `AUTH_GATE_05=OPEN`. Este resultado ejecuta el boot privado de `scripts/b1-boot-shadow-private.py` (commit `667bf38564d63b2966f7739c6fe88acd6b2bf19a`, fetch a commit de documentación `39b996d58765b4fe5541d26833af181df680794c`). Queda demostrado: shadow running con socket TCP del listener y `GET /login` de Next respondiendo localmente, sin ruta pública B1; queda pendiente validación mTLS extremo a extremo desde la red/identidad de Traefik, emisión/entrega segura del primer device, activación/reversión del router y aceptación funcional de `/auth/login`, TOTP y sesiones.

**IMPORTANTE:** la presencia de una referencia de evidencia técnica en `ingress.evidenceReference` ahora permite que el bootstrap del candidato pase la validación estructural; no convierte esa referencia automáticamente en una aprobación independiente ni en `AUTH-GATE-05 CLOSED`. No volver a ejecutar boot: el script es de un único uso y existe recibo protegido. Antes de exponer la ruta pública, exigir comprobación real del handshake cliente mTLS, fallos sin credencial y consentimiento/registro del corte; nunca enviar el valor del cookie o una clave por chat, GitHub o logs.

## Gate mTLS live y operador de primera credencial

**04/11/2026, salida del propietario VPS:** `B1_MTLS_CLIENTE=PASS`, `B1_SIN_CREDENCIAL=DENEGADO_403`, `B1_SIN_CERTIFICADO=RECHAZADO`, `TRAEFIK_PUBLICO=INTACTO`. Demuestra handshake HTTPS con certificado cliente aprobado desde el namespace de Traefik al listener B1 y rechazo de autenticación sin cookie. No se modificaron servicios. **No repetir esta prueba sin un cambio de topología/TLS**.

**Operador PostgreSQL existente**: el propietario recuperó mediante consulta read-only un único LOGIN miembro de `cleanops_ingress_operator` (identificador concreto conservado únicamente en el canal privado de operación, no como credencial en Git). El primer intento de consulta con `-U postgres` falló porque no existe ese rol; se corrigió utilizando `POSTGRES_USER` real del contenedor. Sin nuevas migraciones ni roles. Queda preparado el siguiente evento distinto: ejecutar `scripts/b1-private-operator.mjs` desde el candidato Node 24 en un contenedor efímero root, con `/run/cleanops-b1-operator` bind RW root-only y el Compose shadow existente, `request.json` exclusivo con `operation=device.issue` y referencia a instrucción del propietario (solo metadata de auditoría, NO aprobación independiente), emitiendo una sola credencial y escribiendo `result.json` 0600 sin imprimir la cookie. En caso de resultado incierto, no repetir porque el SQL pudo confirmar; inspeccionar recibo protegido/auditoría.

**Recepción segura pendiente de coordinar**: no introducir el valor de `cookieValue` en chat/Git/logs; solo entregarlo al navegador del propietario por un canal autenticado y cifrado y establecer `__Host-cleanops_b1_ingress_device` con `Secure; HttpOnly; SameSite=Strict; Path=/` en el host HTTPS real. Hasta completar esa entrega, no activar el router público ni declarar las pruebas login/TOTP/sesiones. `AUTH-GATE-05 OPEN`, independencia pendiente.

## Operador B1: primer recibo sellado (sin revelar cookie)

**Salida aportada por el propietario, 04/11/2026:** `B1_SOLICITUD=PREPARADA`, contenedor efímero de ejecución creado, `B1_OPERATOR_RECEIPT_SEALED`. El CLI privado `scripts/b1-private-operator.mjs` terminó y ha comunicado que escribió `result.json` con custodia exclusiva; **no se ha compartido contenido ni valor de la cookie**. La salida copiada no contiene el control exterior `B1_CREDENCIAL=EMITIDA_Y_PROTEGIDA`, por lo que esta evidencia **no acredita todavía** la lectura/verificación final del `state=ENROLLED` y vencimiento. Siguiente acción: inspección SOLO LECTURA en `/run/cleanops-b1-operator/result.json`, mostrando únicamente estado, custodia y vigencia redondeada; nunca el bearer. No volver a ejecutar `device.issue`: un reintento podría duplicar transacciones SQL/auditoría o devolver error de recibo existente.

**No se ha activado ForwardAuth ni enviado la credencial al navegador.** El router público original permanece como estaba según último PASS, y `AUTH-GATE-05 OPEN`. La entrega segura al propietario y cutover reversible continúan pendientes.

## Primera credencial verificada y pendiente de entregar en Chrome

**04/11/2026, salida del propietario:** `B1_CREDENCIAL=EMITIDA_Y_PROTEGIDA`, `B1_CREDENCIAL_MINUTOS_RESTANTES=57`, `B1_COOKIE=NO_EXPUESTA`, `B1_OPERADOR=PASS`. Lectura exclusiva de `/run/cleanops-b1-operator/result.json`: custodia root:root 0600, estado `ENROLLED`, nombre `__Host-cleanops_b1_ingress_device`, atributos `Secure; HttpOnly; SameSite=Strict; Path=/`, identificador de la credencial coincidente con el recibo y `exp` futuro. **La vigencia de 57 min corresponde solo al instante de ejecución; no inferir duración restante actual**. No reemitir, reintentar ni imprimir bearer, identificador o contraseña. SQL de enrolamiento duradero ya realizado por CLI privado existente.

Siguiente fase: en el equipo local del propietario, transferir exclusivamente el valor al portapapeles mediante SSH seguro sin guardarlo en historial/archivos; crear cookie host-only en DevTools de Chrome para `https://cleanops.nuvurent.com`, marcando Secure, HttpOnly, SameSite Strict y Path=/; vaciar portapapeles inmediatamente. **Esto no activa rutas públicas**; el cutover debe aplicar solo el nuevo YAML dinámico B1 con rollback y test de 403 sin cookie y servicio con cookie. `AUTH-GATE-05 OPEN` hasta pruebas funcionales y dictamen independiente.

## Procedimiento único de cutover dinámico preparado

**04/11/2026.** Se incorpora `scripts/b1-cutover-forwardauth.py` (commit `cdbc0c909fdcc7d001031367b301ccb52bf57a8f`), con `activate` y `rollback` explícitos. **No hay salida del propietario que pruebe ejecución de ninguno.** Sólo debe invocarse `activate` después de transferir la cookie preexistente al navegador del propietario de forma segura desde `result.json` (no reemitir, no mostrar ni versionar token), con atributos `__Host-`, Secure, HttpOnly, SameSite Strict y Path /. En `activate`: verifica recibos/identidades, credencial vigente por al menos cinco minutos y los 3 archivos TLS privados; aplica `restart=unless-stopped` al SHADOW (no al web antiguo); instala únicamente `cleanops-b1-guarded.yaml` mediante enlace atómico sin sobrescribir; espera router B1 habilitado en API local del Traefik, 403 sin cookie en `/auth/login` y 200 sostenido en `/login`. Ante fallo retira solo el archivo propio, espera retirada efectiva de router antes de restituir la política; si no puede retirar el router, deja SHADOW supervisado y marca intervención humana, no interrumpe la web anterior. `rollback` manual retira el router sólo si el SHA coincide, espera que desaparezca del API y restituye política `restart=no` sin destruir credenciales ni auditoría. `AUTH-GATE-05` permanece `OPEN` hasta pruebas con la cookie en Chrome, funciones login/TOTP/sesiones/replay y aceptación independiente. No se ha fusionado el PR #33.

## Cookie en Chrome — entrega informada por el propietario

**04/11/2026, salida del propietario de Windows:** se ejecutó el cliente OpenSSH en su ruta absoluta con retorno sin errores; pasó el patrón `b1-device-v1` y se recibió `B1_COOKIE_COPIADA_SIN_MOSTRAR`. Después, el propietario confirmó `listo` tras las instrucciones de configurar cookie `__Host-cleanops_b1_ingress_device` en Chrome. **Es evidencia de instalación informada, no verificación de envío por navegador**; no registrar bearer ni su ID. La vigencia de emisión era de 57 minutos en la comprobación anterior, por tanto **antes de activar router** evaluar nuevamente el `exp` original con reloj del VPS: si vence en menos de 5 minutos, NO activar, no emitir un segundo dispositivo a ciegas; planificar revocación y reemplazo autorizado. También comprobar de forma exclusiva que el mecanismo de lectura del estado de router Traefik usado por el cutover está disponible; no reensayar mTLS ni el boot, ya PASS. `AUTH-GATE-05 OPEN`.

## ForwardAuth B1 activo: PASS y corrección necesaria para el formulario de login

**04/11/2026, resultado comunicado por el propietario del VPS:** `B1_ROUTER_PUBLICO=ACTIVO`, `B1_SIN_COOKIE=DENEGADO_403`, `WEB_ORIGINAL_LOGIN=HTTP_200`, `B1_SHADOW=RUNNING_SUPERVISADO`, `AUTH_GATE_05=OPEN_PENDIENTE_PRUEBAS_FUNCIONALES`. No repetir cutover, certificados, SQL, mTLS ni boot. El router B1 ya está instalado como `cleanops-b1-guarded.yaml`, y la cookie B1 fue instalada en Chrome según propietario, sin verificarse aún mediante una solicitud positiva real desde navegador.

**Bloqueo funcional encontrado por inspección exacta de bytes**: la web antigua `d3ea84b38fd1574db1610f03b59c8c4a5050ac72` sirve `/login`, y en `lib/b1/runtime.ts` sólo usa `closedBackend`; su `proxy.ts` no emite las cookies bootstrap `__Host-cleanops_preauth` / `__Host-cleanops_csrf` al no poder completar `backend.bootstrap()`. El router B1 activo protege `/auth/*`, `/mfa/*` y `/me/*`, **pero no** `/login`. Por ello, el HTTP 200 de la UI antigua no demuestra funcionalidad de login ni CSRF. No probar contraseñas/TOTP hasta corregir ese enrutamiento.

**Corrección mínima sin tocar la web antigua**: `scripts/b1-device-ui-router.py`, commit `98bbd14840671951b4373d381fd2ed1cb68eead0`, prepara dos routers adicionales por file-provider, ambos limitados a las solicitudes que lleven el *nombre* de la cookie B1: `/login` hacia shadow **con ForwardAuth y mTLS existentes** y `/_next/static/` hacia los assets del shadow. Usuarios sin cookie continúan viendo `/login` antiguo. La coincidencia del nombre de cookie por sí sola nunca otorga acceso a login: el middleware valida credencial durable/certificado antes de permitir HTML. `activate` sólo instala un archivo nuevo sin sobrescribir; verifica routers API y HTTP 200 antiguo; `rollback` retira exclusivamente ese archivo si sus bytes originales siguen intactos. **Corrección versionada, no ejecutada aún en VPS**. Tras aplicarla, verificar que /login desde Chrome protegido obtiene las cookies bootstrap, y luego login/TOTP/sesiones de extremo a extremo; sólo con evidencia y aceptación independiente se podrá declarar `AUTH-GATE-05=CLOSED`.

## 05/11/2026 — intento de UI device detenido por caducidad de cookie

Propietario reporta `B1_UI_STOP=Credencial caducada o menos de 5 minutos` al ejecutar `scripts/b1-device-ui-router.py activate`. El guard `still_valid()` se ejecuta antes de crear `cleanops-b1-device-ui.yaml`; por tanto **este intento no instaló nuevos routers UI ni cambió el fallback /login**. El router B1 principal `cleanops-b1-guarded.yaml` continúa con el último estado PASS reportado; debe comprobarse solo si se observa deriva. No ejecutar de nuevo `activate` hasta obtener una credencial nueva vigente. El primer recibo de `/run/cleanops-b1-operator/result.json` conserva la credencial expirada; el programa operador utiliza `O_EXCL` y no puede ejecutarse de nuevo sin archivar bajo root-only `request.json` y `result.json`. La expiración criptográfica garantiza rechazo del bearer anterior; no duplicar migraciones, roles, llaves ni shadow. Proceder a sustitución de una sola credencial mediante el CLI original `device.issue`, archivando primero ambos recibos protegidos, revisando el límite `maximumDeviceLifetimeMs`, sin imprimir tokens, y entregar la nueva cookie al Chrome ya configurado. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — router device-only UI activado: PASS

Operador del VPS reportó en una ejecución única de `scripts/b1-device-ui-router.py activate`: `B1_UI_LOGIN_DEVICE=ROUTER_ACTIVO`, `B1_UI_ASSETS_DEVICE=ROUTER_ACTIVO`, `WEB_ORIGINAL_SIN_COOKIE=HTTP_200` y `AUTH_GATE_05=OPEN_PENDIENTE_FUNCIONAL`. La primera ejecución se detuvo antes de instalar archivos por caducidad de dispositivo; después se emitió un nuevo recibo con `B1_OPERATOR_RECEIPT_SEALED` y el propietario informó que instaló la cookie de reemplazo en Chrome. La duración exacta y estado de la nueva credencial, y su envío positivo desde Chrome, todavía no están confirmados por una prueba de navegación. **No marcar login, MFA, sesiones, ni aceptación independiente como PASS aún**. Siguiente verificación manual: Chrome mismo perfil `/login` con device cookie (sin divulgar valor), presencia de `__Host-cleanops_preauth` y `__Host-cleanops_csrf` en Application/Cookies y carga funcional; sólo entonces continuar con cuenta sintética de pruebas autorizada. Mantener web original y B1 principal sin cambios. No ejecutar de nuevo `activate`.

## 05/11/2026 — HTTP 500 al navegar con cookie B1 en Brave

Tras la activación con `B1_UI_LOGIN_DEVICE=ROUTER_ACTIVO`, el propietario informó que Brave mostraba `HTTP ERROR 500` al visitar `https://cleanops.nuvurent.com/login` con la cookie B1. **No es PASS de ingreso ni bootstrap**. No están confirmadas las cookies preauth/CSRF, ni se ingresó contraseña/MFA. Se ha indicado **solo** `python3 /root/b1-shadow-stage/device-ui-router.py rollback` para retirar los dos routers de UI por dispositivo y recuperar /login original, conservando el router B1 principal, la credencial, los procesos y PostgreSQL. La salida y éxito del rollback aún no están confirmados. Antes de cualquier intento de reactivación: consultar estados/errores de routers de Traefik y fallos pertinentes del backend privado **sin incluir cookies, headers ni secretos**, distinguir fallo de proxy (configuración/middleware) versus runtime shadow, revisar y probar el delta aislado con validación HTTP positiva antes de nueva ejecución. No volver a aplicar a ciegas los scripts ni emitir otro dispositivo. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — rollback de UI confirmado

El propietario ejecutó una sola vez `python3 /root/b1-shadow-stage/device-ui-router.py rollback`, con salida exacta: `B1_UI_DEVICE=RETIRADO`, `WEB_ORIGINAL_LOGIN=HTTP_200`, `B1_MAIN_ROUTER=INTACTO`. **Rollback PASS; no repetir**. El HTTP 500 del navegador queda como incidencia abierta de UI device-only; no es autorización para volver a activar sin diagnóstico. PostgreSQL, credencial y principal B1 no se modificaron por ese rollback según alcance del script. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — estado de proveedor Traefik después del rollback

Comprobación de **solo lectura** enviada por el propietario, con API local Traefik: `cleanops360-b1-guarded@file=enabled`; `cleanops360-b1-device-login@file=AUSENTE`; `cleanops360-b1-device-assets@file=AUSENTE`; `cleanops-b1-forward-auth@file=PRESENTE`; `cleanops-b1-strip-assertion@file=PRESENTE`; `B1_SERVICIO=PRESENTE`. Conclusión: retirada de UI confirmada y principal sigue presente, sin evidencia aún de **admisión positiva del nuevo bearer** ni de origen exacto del 500. Próxima prueba mínima: una sola solicitud GET `/auth/me` pasando bearer root-only al `curl` por stdin (nunca argv ni stdout), comparando 401/403/503, sin modificar routers y sin probar contraseñas. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — GET /auth/me con nuevo bearer devuelve HTTP 503

Desde el VPS, el propietario hizo una única solicitud HTTPS a `/auth/me` a través del router principal B1, alimentando `curl --config -` por stdin con la cookie custodiada en `/run/cleanops-b1-operator/result.json`, sin imprimir ni enviar su valor. Salida exacta: `B1_AUTH_ME_HTTP=503` y `B1_COOKIE=NO_EXPUESTA`. Este **503 no permite aún afirmar que el ForwardAuth autorizó correctamente**: puede ser una respuesta JSON del runtime cerrado/fallo de contexto o un error HTTP del proxy/transporte. Debe clasificarse la respuesta con una solicitud única que proyecte solo `http_code`, `Content-Type` y campo `error.code` validado, nunca cuerpo ni headers/cookies íntegros, y después consultar únicamente indicadores de logs seguros si procede. No repetir emisión, cutover, mTLS, SQL, certificados, ni reenviar tokens a chat/Git. Sigue pendiente login, MFA y sesiones; `AUTH-GATE-05 OPEN`.

## 05/11/2026 — checkpoint de continuidad verificado: error JSON 503

**Nueva salida literal del propietario (VPS, después de rollback UI):**

```text
B1_HTTP=503
B1_CONTENT_TYPE=application/json; charset=utf-8
B1_ERROR_CODE=AUTH_DEPENDENCY_UNAVAILABLE
B1_SECRETOS=NO_EXPUESTOS
```

**Interpretación acotada:** `GET /auth/me` con la credencial root-only del operador llegó a un componente capaz de devolver el error JSON `AUTH_DEPENDENCY_UNAVAILABLE`, compatible con `handleAuth` del candidato B1; no hay evidencia suficiente para afirmar que el ForwardAuth, el resolvedor de assertions, las credenciales durables o el pool PostgreSQL estén operativos para solicitudes reales. **No hubo un login exitoso; MFA y sesiones no se han probado en navegador.** No se ha demostrado la causa del `503`, por tanto no etiquetar como fallo PostgreSQL/OpenBao sin trazas.

**Estado de operaciones en el VPS confirmado, conservar sin cambios:**
- Traefik 3.7.17; router B1 `cleanops360-b1-guarded@file` = `enabled`; middlewares ForwardAuth y strip assertion = `PRESENTE`; servicio `cleanops-b1-shadow@file` = `PRESENTE`.
- Los routers por dispositivo `cleanops360-b1-device-login@file` y `cleanops360-b1-device-assets@file` están `AUSENTE` después de rollback PASS del error HTTP 500 observado en Brave.
- La web original `/login` devolvió HTTP 200 después de rollback. El shadow B1 está iniciado y supervisado según el último corte PASS; **no reiniciar**.
- Se emitió una credencial de sustitución con el operador existente (`B1_OPERATOR_RECEIPT_SEALED`), el propietario notificó su instalación manual en Brave; **no pegar bearer, IDs, cuerpo HTTP ni cookies en conversaciones o Git**. El reloj podría haber consumido su TTL; NO emitir otra de forma automática.
- La primera credencial fue archivada al emitir la segunda; no reejecutar SQL/migraciones, signer, provisionamiento, operador ni generación de dispositivo. PR #33 continúa DRAFT, no merge; `AUTH-GATE-05 OPEN`.

**Próximo paso técnico recomendado (solo lectura y evidencias protegidas):** determinar en la configuración de Traefik y el runtime qué componente generó la respuesta JSON `503`, revisando código del repositorio en SHA fijo `cc51574ad85485728d877efbbb69bcb345469596` y comparando los headers de respuesta no secretos con la firma de `lib/b1/runtime.ts` / `lib/b1/service.ts`. Si requieren logs, extraer solo indicadores categóricos y conteos seguros (no `docker logs` completos, ni requests, headers, bearer, contraseñas, SQL, ni certificados). El error `AUTH_DEPENDENCY_UNAVAILABLE` puede provenir del runtime B1 aun si la cookie pasa ForwardAuth; falta confirmar mediante evidencia. Corregir causa raíz con cambios revisados antes de **nueva activación** de UI. La ruta `/login` del B1 debe pasar bootstrap real de preauth + CSRF; `/auth/login`, TOTP, sesiones, replay y aceptación independiente siguen pendientes.

**Instrucciones de relevo para el próximo chat/agente:** leer esta ficha y `B1-TRAEFIK-DOKPLOY-HANDOFF-20261104.md` en la rama `prep/b1-final-closure-20261102`, consultar SHA de HEAD antes de escribir. No repetir los PASS ya auditados (24 test trusted-migrations, SQL0002/0003, operador, mTLS, Traefik, shadow, router principal, rollback UI). Aceptar solo evidencias nuevas y distinguir hechos ejecutados de hipótesis. No tocar `staging`/`main` ni producción y no declarar B1 cerrado.

## 05/11/2026 — clasificación de la respuesta 503 y salud del shadow

**Salidas literales del propietario, posterior al checkpoint de continuidad:**

```text
B1_ORIGEN=BACKEND_O_DEPENDENCIA
B1_SECRETOS=NO_EXPUESTOS
B1_CONTENEDOR=running
B1_REINICIOS=0
B1_INSTALACION_FALLIDA=NO_DETECTADO
B1_ARRANQUE_DUPLICADO=NO_DETECTADO
B1_CONFIGURACION_INVALIDA=NO_DETECTADO
B1_CIERRE_INCOMPLETO=NO_DETECTADO
B1_CONEXION_RECHAZADA=NO_DETECTADO
B1_LOGS_SENSIBLES=NO_EXPUESTOS
```

Interpretación del código en SHA fijo `cc51574ad85485728d877efbbb69bcb345469596`: el mensaje JSON `No se pudo completar la solicitud.` procede de `createAuthHandler.failure()` en `lib/b1/service.ts`, a diferencia del mensaje `Autenticación no disponible.` que genera el `catch` externo de `handleAuth` en `lib/b1/runtime.ts`. Sin embargo, ese mensaje **no distingue** un `closedBackend` silencioso de un fallo de custodia OpenBao/PG en `createCustodiedBackend`: ambas vías pueden devolver 503 con el mismo código/mensaje. La ausencia de marcadores de arranque en últimos 300 logs tampoco demuestra que `reviewedB1Installation()` instalara el runtime, porque esta función devuelve `undefined` silenciosamente en configuración ausente/inválida. El contenedor no tiene reinicios. Próximo diagnóstico de **solo lectura**: una única petición local sin cookie ni aserción directamente a Next del shadow (`docker exec ... node -e fetch('http://127.0.0.1:3000/auth/me')`), mostrar solo status y clase de mensaje; con `state.activeRequestScope` instalado es esperable respuesta genérica `Autenticación no disponible.`; con backend cerrado o ámbito ausente podría aparecer mensaje del handler o rechazo de origen. Este resultado no autoriza salto del ForwardAuth ni cuenta como prueba positiva de seguridad.

No modificar rutas, no reiniciar, no renovar credenciales automáticamente y no cerrar `AUTH-GATE-05`.

## 05/11/2026 — solicitud local sin aserción y posible incompatibilidad de sink

El propietario ejecutó **una sola vez** un GET directo a `http://127.0.0.1:3000/auth/me` desde dentro del shadow, sin cookie ni aserción. Resultado: `B1_LOCAL_HTTP=503`, `B1_LOCAL_ESTADO=CONTEXTO_PROTEGIDO_ACTIVO`, `B1_SECRETOS=NO_EXPUESTOS`. Esta respuesta es compatible con denegación en el request scope; junto con la respuesta externa de `BACKEND_O_DEPENDENCIA`, se debe investigar backend privado sin repetir forwardauth/credenciales.

**Hipótesis de defecto de integración con evidencia de código:** `lib/b1/openbao-keys.ts`, función `createAgentSinkToken`, exige estrictamente que el directorio del sink sea `TMPFS_MAGIC=0x01021994` mediante `fs.statfs` (además de UID/GID/modos) antes de leer el token; por otro lado, el script realmente ejecutado `scripts/b1-stage-shadow.py` monta el sink en `/run/cleanops-agent` como `type: volume` externo (`cleanops360-f4fxmd_identity_agent_sink`), **no como tmpfs del propio contenedor**. Un volumen Docker local normal no es tmpfs y haría que cada carga de claves OpenBao falle con `AUTH_DEPENDENCY_UNAVAILABLE`. NO dar por demostrada la hipótesis sin comprobar el tipo real de filesystem dentro del contenedor; los volúmenes pueden tener opciones especiales. Próxima comprobación read-only, sin leer token: `docker exec cleanops360-b1-shadow-cc51574a node -e` + `fs.statfsSync('/run/cleanops-agent').type === 0x01021994`; imprimir solamente `TMPFS` / `NO_TMPFS`. Si se confirma discrepancia, planificar corrección de la topología de custodia/sink mediante un delta de código o montaje revisado, con pruebas de aislamiento y sin modificar el servicio Agent existente, ni copiar bearer ni token en logs. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — shadow rechazó ausencia de aserción; sink confirmado tmpfs

Nuevo resultado directo del propietario:

```text
B1_LOCAL_HTTP=503
B1_LOCAL_ESTADO=CONTEXTO_PROTEGIDO_ACTIVO
B1_SECRETOS=NO_EXPUESTOS
B1_SINK_FILESYSTEM=TMPFS_CORRECTO
B1_TOKEN=NO_LEIDO
B1_CAMBIOS=NINGUNO
```

Esto **refuta para este contenedor** la hipótesis previa de que `/run/cleanops-agent` no era tmpfs. No modificar mount ni volumen por esa hipótesis. El chequeo sin aserción es compatible con la protección de contexto instalada; no es test de salud de la operación custodiada.

La captura de Brave del propietario enseña `/login` **del router de la web antigua** después del rollback UI; no confirma que B1 funcione, ni que `/auth/me` ya no responda 503. En Brave, la cookie `__Host-cleanops_b1_ingress_device` permanece con `Secure`, `HttpOnly`, `SameSite=Strict` y `Path=/`; no copiar a Git/chat el valor.

**Siguiente lectura acotada:** comprobar dentro del *shadow* (no del agent aparte) que el UID/GID/modos y tamaño del directorio/file token en `/run/cleanops-agent` coinciden con `manifest.sink`. Utilizar solo `fs.statSync` y `fs.statfsSync`, nunca `readFile` del token y nunca imprimir sus atributos completos, credenciales o manifiesto. En caso de pasar, investigar la disponibilidad operacional de la lectura OpenBao y pool PG de modo mínimo, sin cambiar servicios ni probar de nuevo los PASS de instalación. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — sink metadata PASS, aislar lectura de claves OpenBao

Resultado confirmado por el propietario en el mismo contenedor shadow:
```text
B1_IDENTIDAD=PASS
B1_DIRECTORIO_SINK=PASS
B1_ARCHIVO_TOKEN=PASS
B1_CONTENIDO_TOKEN=NO_LEIDO
```
El tipo de filesystem también había sido `TMPFS_CORRECTO`. Por tanto, las hipótesis de tipo de montaje y metadatos (UID/GID, modos, tamaño del token, enlace único) quedan descartadas para este shadow; no cambiar el volumen ni OpenBao por ellas.

El código SHA `cc51574a...` demuestra que `withB1Custody` carga cinco claves versionadas secuencialmente (`audit-hmac`, `otp-hmac`, `recovery-hmac`, `cursor-hmac`, `totp-aead`) **antes** de abrir PostgreSQL. `createOpenBaoKeys` no devuelve el error de proveedor ni los detalles HTTP, sino un 503 genérico. La próxima comprobación debe hacer únicamente GET de los cinco paths del catálogo, con mTLS y token del sink en memoria, sin imprimir token, bytes, URIs, IDs de claves, cuerpos ni cabeceras; proyectar cantidad PASS, categoría de primer fallo y cero cambios. Si OpenBao pasa completo, priorizar conexión o transacción PG del runtime. No repetir configuración de TLS/SQL ni cambiar el router. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — SQLSTATE 42501 en security_policy

El propietario informó que cinco lecturas de claves OpenBao terminaron PASS desde shadow y que la conexión PostgreSQL, rol contractual, existencia y EXECUTE de `auth_api.security_policy()` fueron PASS. Una ejecución de esta función dentro de una transacción de solo lectura devolvió `B1_POLITICA=ERROR_CONSULTA`, `B1_SQLSTATE=42501` (privilegio insuficiente). No imprimir mensajes SQL íntegros ni modificar roles. El permiso EXECUTE sobre una función es distinto del USAGE sobre el esquema y de los privilegios usados por su implementación. Próxima verificación read-only: inspeccionar en `pg_catalog` USAGE sobre `auth_api` del rol real de servicio, SECURITY DEFINER de la función y el propietario, sin volver a llamar a la función; contrastar contrato de permisos versionado antes de cualquier corrección. Web original intacta; UI B1 retirada; `AUTH-GATE-05 OPEN`.

## 05/11/2026 — posible 42501 deliberado por AUTH_GATE_05

Última lectura de metadatos PostgreSQL, sin mutaciones, proporcionada por el propietario:

```text
B1_PG_SCHEMA_USAGE=PASS
B1_PG_FUNCTION_EXECUTE=PASS
B1_PG_SECURITY_DEFINER=SI
B1_PG_OWNER_SCHEMA_USAGE=PASS
B1_CAMBIOS=NINGUNO
```

**Nuevo hallazgo de código, no modificar privilegios:** en `docs/canonical/auth-review/v4/b1-review-only.sql`, y en `docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql`, `auth_api.security_policy()` invoca `identity_private.require_enabled()`. Esta última eleva deliberadamente `RAISE EXCEPTION 'AUTH_GATE_05' USING ERRCODE='42501'` cuando no existe fila `identity_private.configuration` singleton con `deployment_enabled = true` (valor inicial por defecto `false`). Es por tanto una **explicación muy probable y específica** para el `SQLSTATE 42501` visto desde shadow, no necesariamente falta de GRANT. Para atribuirlo al SQL *real* del VPS falta verificar el mensaje exacto del error devuelto por la función en una sola consulta de clasificación redacted (booleano literal `AUTH_GATE_05`, no imprimir otras excepciones). Si coincide, el 503 B1 es un fail-closed por gate intencional; no habilitar el flag ni hacer GRANT ni alterar funciones/migraciones hasta aprobación independiente y revisión de los requisitos de AUTH-GATE-05. El PASS de usuario/función NO autoriza el cambio. La UI antigua continúa intacta, el router principal B1 activo y la UI B1 por dispositivo retirada. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — AUTH_GATE_05 confirmado como bloqueo operativo

El propietario confirmó que `SELECT auth_api.security_policy()`, ejecutado con el mismo usuario de servicio del shadow y una transacción de lectura con rollback, produjo exactamente el mensaje `AUTH_GATE_05` y SQLSTATE `42501`:

```text
B1_GATE=AUTH_GATE_05_CONFIRMADO
B1_CAMBIOS=NINGUNO
B1_SECRETOS=NO_EXPUESTOS
```

La fuente canónica `docs/canonical/auth-review/v4/b1-review-only.sql` y el SQL consolidado rev14 contienen `auth_api.security_policy()` → `identity_private.require_enabled()` → excepción intencional `AUTH_GATE_05`, SQLSTATE `42501`, cuando no existe configuración singleton habilitada. Es consistente con el `503 AUTH_DEPENDENCY_UNAVAILABLE` del backend en shadow y explica el error de policy sin necesidad de GRANT adicional. No es un fallo del token/PG-TLS ni de su esquema o EXECUTE; anteriores verificaciones OpenBao 5/5 y PG conexión/rol/EXECUTE PASS permanecen válidas. **No demostrar que todos los flujos funcionarán al abrir el gate**; quedan pendientes UI de B1, login, CSRF, TOTP, sesiones y aceptación independiente.

**Decisión operativa:** no establecer `deployment_enabled=true` por SQL manual en `cleanops_staging`, no alterar `require_enabled()`, no introducir un bypass ni redeplegar web original. El flag es una compuerta compartida, no un switch per-request por cookie. La autorización previa de pruebas/documentación no equivale a aprobación de apertura de este gate en la DB compartida; `AUTH-GATE-05 OPEN`. Deben definirse primero el aislamiento del ensayo o perímetro aprobado para staging, identidad de usuario de prueba, snapshot y rollback de configuración, plan de inspección/aceptación y revisión independiente del diff/manifest y evidencias. No repetir pruebas ya PASS. PR #33 comprobado: `open`, `draft`, `merged=false`, destino `staging`. La web original funciona y los routers UI adicionales permanecen retirados por el rollback previo.

## 05/11/2026 — guard SQL abierto y GET /auth/me devuelve 401 AUTH_INVALID

El propietario autorizó y ejecutó `scripts/b1-gate-trial-20261105.py activate` importado del commit `1986c001a8da75142c8c6aff309f2aebaf181c2a` tras comprobar SHA256. Evidencia de ejecución: `B1_ROLLBACK=RECIBO_PRIVADO_PREPARADO`; `B1_GATE_SQL=HABILITADO_VERIFICADO`; política JSON de 60 claves coincidió con perfil B1. El recibo privado de reversión permanece en `/root/b1-gate-trial-20261105.receipt.json`. No repetir `activate`.

A continuación, nueva petición HTTPS única a `/auth/me` desde el VPS con el dispositivo existente root-only vía `curl --config -`, sin exponer bearer:

```text
B1_HTTP=401
B1_ERROR=AUTH_INVALID
B1_CAMBIOS=NINGUNO
B1_SECRETOS=NO_EXPUESTOS
```

Esta es una respuesta de autenticación válida para una petición sin sesión de usuario; sustituye al previo `503 AUTH_DEPENDENCY_UNAVAILABLE` y evidencia que el backend B1 procesa la solicitud a través de la ruta de dispositivo. No equivale a login ni a sesión ACTIVE. El router B1 principal ya está instalado; los routers UI de dispositivo **siguen retirados** tras el HTTP 500 anterior. No reactivarlos a ciegas.

**Próximo paso único:** una solicitud local GET `http://127.0.0.1:3000/login` desde dentro del shadow y proyección de **solo status HTTP, HTML y nombres de cookie** `__Host-cleanops_preauth`, `__Host-cleanops_csrf`, sin valores. Este GET puede crear un registro PREAUTH efímero bajo el perfil del ensayo; no es una consulta SQL read-only. No cargar la interfaz pública ni manipular el router. Si ambas cookies están presentes y la página responde 200, preparar una activación UI device-only con autoverificación de GET autenticado y rollback si no responde 200. Si falta alguna cookie, diagnosticar *solo* el bootstrap de proxy/Next antes de activar UI. La web anterior se conserva. `AUTH-GATE-05` aceptación sigue OPEN.

## 05/11/2026 — bootstrap /login B1 local: 200 HTML, PREAUTH y CSRF PASS

El propietario realizó un único GET desde el contenedor `cleanops360-b1-shadow-cc51574a` directamente a `http://127.0.0.1:3000/login` con Node `fetch`. Solo proyectó estado, tipo de contenido y presencia de **nombres de cookies**, sin exponer valores. Resultado:

```text
B1_SECRETOS=NO_EXPUESTOS
B1_LOGIN_HTTP=200
B1_LOGIN_HTML=SI
B1_PREAUTH=PASS
B1_CSRF=PASS
```

El bootstrap B1 del shadow responde y entrega las dos cookies requeridas después de habilitar temporalmente la configuración SQL (hash de perfil 60/60 PASS). Este GET pudo crear una preautorización efímera de ensayo. **No acredita todavía que la ruta pública /login device-only funcione**; el ensayo anterior produjo HTTP 500 y el rollback de ambos routers se comprobó. Siguiente operación, separada del guard SQL ya activado: ejecutar el script de router UI existente `/root/b1-shadow-stage/device-ui-router.py activate` bajo comprobación de vigencia de credencial y comprobar `GET https://cleanops.nuvurent.com/login` con el bearer privado por stdin a curl. Éxito solo con `HTTP 200`, HTML y cookies `__Host-cleanops_preauth`/`__Host-cleanops_csrf` en la respuesta. Si falla, invocar **inmediatamente** `device-ui-router.py rollback` para retirar los dos routers con validación de hash y confirmar original /login=200, sin detener shadow, tocar PostgreSQL ni destruir el recibo. Mantener separado el ensayo de usuario sintético y MFA. La duración de la credencial existente debe verificarse antes de la operación; si falta menos de 5 minutos, detener sin activar ni reemitir credencial automáticamente. No repetir pruebas anteriores, no declarar cierre de `AUTH-GATE-05` todavía.

## 05/11/2026 — router UI device-only activo; HTTPS 200 + bootstrap PASS

El propietario ejecutó el procedimiento de activación de UI del dispositivo con validación HTTP y reversión en caso de fallo. Salida exacta:

```text
B1_UI_HTTP=200
B1_UI_BOOTSTRAP=PASS
B1_UI_PUBLICA=PASS
B1_SECRETOS=NO_EXPUESTOS
```

Esto acredita que el router de `/login` del dispositivo respondió HTTPS 200, HTML y cookies `__Host-cleanops_preauth` y `__Host-cleanops_csrf`; el router de assets se instaló con el script existente `device-ui-router.py activate`, pero **la carga visual completa de assets en navegador aún no está validada**. El intento anterior de HTTP 500 no se reproduce en esta petición y no se ejecutó el rollback porque todas las verificaciones pasaron. El backend `/auth/me` sin sesión ya respondió 401 `AUTH_INVALID` con cookie durable B1; el guard SQL está habilitado temporalmente bajo autorización y cuenta con recibo de reversión.

**Siguiente paso no redundante:** en el **mismo perfil de Brave/Chrome** que tiene instalada la cookie de dispositivo, abrir `https://cleanops.nuvurent.com/login`, confirmar que aparece la interfaz B1 (no la web original), sin copiar ningún valor de cookie ni introducir todavía contraseña real. Validar que los assets cargan y que aparecen los nombres `__Host-cleanops_preauth` y `__Host-cleanops_csrf` en almacenamiento del sitio. Si vuelve a aparecer 500, usar el rollback UI ya conocido y detener; no reactivar a ciegas. Si el navegador muestra la web antigua pese al PASS por curl, inspeccionar solo presencia/caducidad del nombre de cookie de dispositivo y la pestaña Network, sin divulgar valores. Después usar **solo** usuario sintético que esté realmente provisionado; el estado histórico del primer actor fue ABSENT y no puede asumirse que ya exista. Preparar ceremonia de primer usuario autorizada si falta, sin fabricar cuenta/contraseña ni compartir TOTP/semillas. Completar MFA/sesiones, pruebas negativas y aceptación independiente. `AUTH-GATE-05 OPEN`, PR #33 draft.

## 05/11/2026 — regresión de aceptación en Brave pese a curl PASS

El propietario remitió **dos capturas del navegador** después del último PASS de curl en la ruta UI device-only:

- En `https://cleanops.nuvurent.com/login`, Brave presenta **HTTP ERROR 500**.
- En `https://cleanops.nuvurent.com/login?utm_source=chatgpt.com`, se representa un formulario titulado «CleanOps 360 · Acceso» con campos Email/Contraseña, botones Continuar/Restablecer y enlace Reiniciar acceso, **sin estilos visibles**.

La prueba automatizada anterior (`B1_UI_PUBLICA=PASS`) confirmó exclusivamente **una petición curl con la cookie del recibo privado**, HTTPS 200 HTML y cabeceras Set-Cookie PREAUTH/CSRF. **No puede extrapolarse a la navegación real ni autoriza cerrar AUTH-GATE-05.** El query `utm_source` no cambia el pathname que hace match con la regla `Path("/login")`: no atribuir el efecto a la query sin evidencia. El router UI selecciona rutas por presencia del *nombre* de cookie B1, pero el ForwardAuth verifica su valor actual, unicidad, estado durable y assertion. Diferencias de cookies de navegador, duplicación, caducidad, respuesta SSR o enroutamiento de assets son hipótesis a aislar, no conclusiones. La presencia de un formulario sin estilos tampoco demuestra que todo el JS/CSS sea del shadow (la web anterior comparte el dominio y rutas `/_next/`).

**Acción inmediata recomendada:** el propietario debe ejecutar una sola vez `python3 /root/b1-shadow-stage/device-ui-router.py rollback`, ya auditado, para restituir rutas públicas anteriores. **Este nuevo rollback aún no está confirmado por salida**. No repetir activate, no exponer credenciales de dispositivo, cookies ni valores de headers, ni introducir contraseñas reales. Mantener por ahora el gate SQL abierto **solo bajo ventana de ensayo autorizada**; si se suspende el ensayo, cerrar gate SQL con el rollback separado `python3 /root/b1-gate-trial-20261105.py rollback`. Después del rollback UI, investigar el defecto exacto de navegación con evidencia redacted: comprobar por tipo/número, no valor, las cookies del navegador bajo el origen, vencimiento de dispositivo, y en DevTools Network solo status/URL/tipo de recurso (sin encabezados) de `/login` y `/_next/static/`. Corregir causalidad real en branch + pruebas focalizadas antes de reinstalar el UI router. No reabrir PG/OpenBao/TLS/SQL0003 ya PASS.

## 05/11/2026 — segundo rollback UI confirmado y divergencia SameSite Strict

El propietario ejecutó de nuevo el rollback del router device-only tras observar HTTP 500 en Brave, resultado exacto:

```text
B1_UI_DEVICE=RETIRADO
WEB_ORIGINAL_LOGIN=HTTP_200
B1_MAIN_ROUTER=INTACTO
```

**Rollback UI PASS**. El guard SQL activado temporalmente para ensayo **sigue abierto**, separado del router UI; reversión independiente disponible en `/root/b1-gate-trial-20261105.py rollback`. No volver a ejecutar `device-ui-router.py activate` sin corregir causa raíz.

### Revisión puntual del enrutamiento

`scripts/b1-device-ui-router.py` contiene una regla `Path("/login") && HeaderRegexp("Cookie", "...__Host-cleanops_b1_ingress_device=")` y otra para `/_next/static/`, ambas con la misma condición de cookie. La cookie B1 real es `SameSite=Strict`. Una navegación cruzando desde ChatGPT puede **no enviar la cookie del dispositivo**, mostrando el login anterior, mientras una navegación directa al dominio la envía y selecciona B1. Por tanto el parámetro `?utm_source=chatgpt.com` no es la causa demostrada de la diferencia; su presencia puede correlacionar con el origen externo de la navegación. Esto aclara las dos capturas pero **no resuelve el HTTP 500**, cuya causa permanece sin verificar. Además, el formulario sin estilizar en la captura no acredita por sí mismo ausencia de CSS: `components/auth-panel.tsx` implementa HTML sencillo y parte del estilo es inline; la mezcla de dos builds Next en el mismo host podría producir errores de assets/RSC, pero no está confirmada.

**Siguiente diagnóstico acotado y read-only**: obtener del contenedor shadow solo clasificación agregada de eventos de error retrospectivos de los últimos 120 minutos (`docker logs --since 2h` capturados localmente y no impresos completos), sin cuerpo de logs, IDs, cookies, cabeceras ni valores de error dinámicos. Si no aparecen indicadores útiles, la próxima aceptación requiere observar DevTools Network (solo URL, método, status y recurso) en un nuevo ensayo explícitamente autorizado, antes de aplicar un cambio de código. No repetir Docker/PostgreSQL/TLS/Bao ni reemitir cookies. `AUTH-GATE-05` sigue OPEN.

## 05/11/2026 — guard SQL revertido; aislamiento estático B1 propuesto en código

El propietario ejecutó `python3 /root/b1-gate-trial-20261105.py rollback`, seguido de una búsqueda agregada de eventos en `docker logs --since 3h --tail 2000 cleanops360-b1-shadow-cc51574a`; proporcionó:

```text
B1_GATE_SQL=ROLLBACK_PASS
B1_LOG_ERRORES_NEXT=0
B1_LOG_RENDERIZADO_RSC=0
B1_LOG_RECURSOS_JS_CSS=0
B1_LOG_AUTENTICACION=0
B1_LOG_HTTP_500=0
B1_LOG=SOLO_CONTEOS
B1_SECRETOS=NO_EXPUESTOS
```

**Estado seguro actual:** `deployment_enabled=false` conforme al recibo de rollback; UI device-only retirada previamente (`B1_UI_DEVICE=RETIRADO`, `WEB_ORIGINAL_LOGIN=HTTP_200`, `B1_MAIN_ROUTER=INTACTO`). Sin reinicio, destrucción ni nueva migración. Los 0 eventos del filtro sobre **logs del shadow** no desmienten los HTTP 500 observados en Brave; el error puede estar en otro componente o no contener ninguno de esos patrones. No rehacer OpenBao, PG, certificados ni TLS.

**Defecto real de diseño identificado por fuente:** la web original y B1 son **dos compilaciones diferentes de Next.js 16** en el mismo hostname. El router anterior `scripts/b1-device-ui-router.py` desviaba **todas** las solicitudes `/_next/static/` hacia el shadow solo si estaba presente el *nombre* de la cookie B1. La cookie usa `SameSite=Strict`: una navegación inicial desde ChatGPT puede omitir el token, servir HTML del web original y después servir sus assets desde shadow cuando el contexto se vuelve same-site; esas compilaciones no comparten los mismos hashes JS/CSS. Este error de multiplexación es suficiente para causar recursos incorrectos/ausentes y un formulario sin estilos. **No demuestra por sí solo la causa del HTTP 500 de la navegación B1**; puede existir otra incompatibilidad de RSC/cabeceras/browser que requiere una prueba focalizada.

**Corrección preparada solo en la rama, sin despliegue:**
- `next.config.ts`: incorpora prefijo de assets de compilación `CLEANOPS_B1_ASSET_PREFIX=/b1-static` únicamente cuando la compilación candidata opte explícitamente; con el valor por defecto, los assets de la web anterior no cambian. No selecciona runtime ni habilita auth.
- `deploy/staging/Dockerfile`: transmite el argumento de compilación `CLEANOPS_B1_ASSET_PREFIX` al paso `npm run build`, sin modificar la imagen final existente.
- `deploy/staging/traefik/b1-device-ui-assets-v2.review.yaml`: alternativa **REVIEW ONLY** que conserva el router /login con ForwardAuth y enruta solo `/b1-static/_next/static/` al candidato; deja `/_next/static/` exclusivamente a la web anterior. No modifica el servicio existente ni instala un router.

**Próximos criterios verificables antes de otro intento público:** (1) revisar bytes y amenazas de la propuesta y comprobar que no dispara despliegues automáticos; (2) compilar un candidato B1 en aislamiento usando flag explícito y sin cambiar imagen, contenedor o checkout actual; (3) demostrar que referencias CSS/JS generadas por B1 apuntan a `/b1-static/_next/static/`, que esas URLs responden 200 con CSS/JS correctos, y que `/_next/static/` original mantiene 200; (4) revisar UI login con dispositivo y RSC/headers en navegador bajo una activación con rollback; (5) solo entonces reabrir con autorización el guard SQL temporal y probar flujo de usuario sintético, MFA y sesiones. No ejecutar el antiguo `device-ui-router.py activate` sin modificar su regla de assets, no asumir que separar assets corrige 500, no cerrar `AUTH-GATE-05` ni fusionar PR #33.

**Comprobación de GitHub:** PR #33 sigue `open`/`draft`/`merged=false`; commit cabeza de la preparación `65bb021036cd886b26318603731e61d21fc0473b` registraba cero ejecuciones GitHub Actions asociadas en consulta de primer resultado. No se ha ejecutado ensayo nuevo ni cambio en VPS durante este análisis.

## 05/11/2026 — v2 assets candidate: StripPrefix y smoke aislado preparados

**Confirmación externa actualizada:** la documentación Next.js 16 `assetPrefix` indica que cambia las referencias de JavaScript/CSS en `/_next/static`, pero no hace que Next sirva automáticamente archivos por un subdirectorio arbitrario; Traefik StripPrefix retira un prefijo antes de pasar la ruta al upstream. La versión previa `b1-device-ui-assets-v2.review.yaml` omitía el StripPrefix y podría devolver 404, por lo que **NO debe usarse**. Se ha corregido en commit `296d4ef2063e3c39eeffa0c4d14fd3deb92922d7`: define `cleanops-b1-asset-strip-prefix` con `prefixes: [/b1-static]`, y lo aplica solo a `/b1-static/_next/static/`. Los assets anteriores `/_next/static/` permanecen en la web antigua. `/login` conserva estrictamente ambos middlewares `cleanops-b1-strip-assertion@file` y `cleanops-b1-forward-auth@file`; no se relaja la seguridad. Una validación local con PyYAML confirmó sintaxis, presencia del ForwardAuth y StripPrefix (**3 controles PASS**); esto no sustituye una validación real de Traefik o Next.

Para evitar múltiples operaciones manuales y proteger el VPS, se añadió en commit `f7127ddc6e9d871622327adcf0d28c46daf8df21` el **script de compilación + smoke aislados** `scripts/b1-ui-assets-build-smoke-20261105.py`. El código fuente está fijado a `296d4ef2063e3c39eeffa0c4d14fd3deb92922d7`, y etiqueta una imagen distinta `cleanops360-b1-assets-candidate:296d4ef2`. Obtiene el código con `git archive` del commit exacto sin cambiar el checkout, exige recursos disponibles y preserva snapshot de ID/imagen/estado de los tres contenedores existentes. Construye localmente, sin secrets en build args, y ejecuta una prueba HTTP de `/login` y CSS/JS en un contenedor efímero `--network none --read-only --cap-drop ALL` de memoria/CPU limitadas, sin port binding. No configura Traefik, no crea PG/rol, no abre el guard SQL y no redepliega la web anterior. Su ejecución **NO HA OCURRIDO**; depende de la acción del propietario en el VPS. Con un resultado PASS de compilación y asset smoke, el paso posterior será revisión y prueba de rutas públicas con rollback, incluida diagnosis del HTTP 500 en el navegador real. El éxito de compilación no cierra `AUTH-GATE-05`.

Estado a esta hora: UI router retirado PASS, web original HTTP200, SQL guard revertido PASS, OpenBao/PG/TLS anteriores PASS, PR #33 draft. No hacer tests repetidos de infraestructura.

**Adenda build control:** el script `scripts/b1-ui-assets-build-smoke-20261105.py` se endureció en commit `0269390e0064a981d3995ec96944ee4287612d29` para exigir los **4608 MiB de MemAvailable** indicados en `deploy/staging/README.md`, y al menos 8 GiB libres antes de construir en el VPS compartido. Su ejecución todavía no está confirmada. Si bloquea por recursos, no saltar el guard; usar un builder externo autorizado o revisar recursos antes de volver a ejecutar. Imagen candidata única, web actual intacta. 

## 05/11/2026 — candidate image build PASS, asset smoke FAIL after HTML

El propietario ejecutó el script `scripts/b1-ui-assets-build-smoke-20261105.py` del commit `0269390e0064a981d3995ec96944ee4287612d29`, verificó el blob Git, y confirmó la imagen Docker `cleanops360-b1-assets-candidate:296d4ef2` con ID `sha256:da7e2fc8369763d51002acdd4b00eb7788ecc603f39275dd36407fe6b6ade332`. Salida final exacta:

```text
B1_BUILD=INICIADO
B1_BUILD=PASS
B1_ASSET_HTML=PASS
B1_ASSET_SMOKE=FAIL
B1_ETAPA=SMOKE
B1_RESULTADO=SMOKE_FALLIDO
B1_DESPLIEGUE=NINGUNO
B1_ROUTERS=NO_MODIFICADOS
B1_SECRETOS=NO_IMPRESOS
```

**Interpretación estricta:** la compilación de imagen y GET HTML local pasan; la prueba de recursos se detiene antes de registrar `B1_ASSET_CSS=PASS`. El script atrapa excepciones sin distinguir si faltan referencias `/b1-static/_next/static/*.css`/`*.js` en HTML o si la primera petición CSS devolvió estado/MIME incorrecto. No atribuir aún causa. La imagen existe, **NO RECONSTRUIR** ni activar routers. El `next.config.ts` usa variable `CLEANOPS_B1_ASSET_PREFIX` al compilar, pero la etapa runtime de `deploy/staging/Dockerfile` no la declara: **hipótesis a verificar** si Next evalúa el assetPrefix distinto en build y start. Próxima prueba aislada de solo imagen, sin usar el VPS público, imprime exclusivamente prefix en config, conteos de referencias CSS/JS y estado/MIME de un recurso local de cada tipo; no imprime HTML, rutas ni cabeceras completas. Web original 200, SQL gate y UI B1 cerrados.

## 05/11/2026 — inspección del candidato sin rebuild: prefix build PASS, runtime ausente

Inspección estrictamente aislada de imagen ya compilada `cleanops360-b1-assets-candidate:296d4ef2`, con `docker run --rm -i --pull=never --network none --read-only`, sin acceso a servicios ni configuraciones del VPS. El propietario proporcionó:

```text
B1_BUILD_PREFIX=PASS
B1_RUNTIME_PREFIX=AUSENTE
B1_HTML=PASS
B1_REFS_PREFIJO=2
B1_REFS_SIN_PREFIJO=10
B1_CSS=REFERENCIA_AUSENTE
B1_JS_HTTP=200
B1_JS_TIPO=PASS
B1_CAMBIOS_SERVICIOS=NINGUNO
B1_SECRETOS=NO_EXPUESTOS
```

**Interpretación:** El artefacto `.next/required-server-files.json` conserva el assetPrefix de compilación; la etapa final del Dockerfile no contiene `CLEANOPS_B1_ASSET_PREFIX` en el entorno, tal como revela `B1_RUNTIME_PREFIX=AUSENTE`. El HTML del servidor presenta referencias mezcladas y la primera búsqueda de CSS *prefijado* falló. No se ha confirmado ausencia del CSS en el artefacto ni identificado el estado de referencias CSS no prefijadas. Las referencias CSS/JS se deben clasificar por extensión y prefijo en una única petición local, **sin imprimir rutas completas, tokens, cookies, HTML ni cabeceras**, y comprobar con `-e CLEANOPS_B1_ASSET_PREFIX=/b1-static` en el contenedor aislado **sin reconstruir imagen**. Si con el flag de ejecución las referencias CSS/JS quedan coherentemente prefijadas y archivos pasan 200 MIME, corregir Dockerfile y script para incluir variable no secreta de runtime y recompilar una sola vez en un tag nuevo. Si no, investigar la serialización Next de scripts y el routing de build; no atribuir el problema de manera definitiva a la variable todavía. Guard SQL cerrado, UI routers retirados, web antigua intacta. `AUTH-GATE-05` sigue OPEN.

## 05/11/2026 — asset prefix runtime PASS, reutilizar imagen sin rebuild

El propietario realizó el segundo test `docker run` sobre **la misma imagen ya construida**, con `-e CLEANOPS_B1_ASSET_PREFIX=/b1-static`, sin red externa, sin puertos ni volúmenes de servicios. Resultado literal:

```text
B1_HTML=PASS
B1_CSS_PREFIX=1
B1_CSS_LEGACY=0
B1_CSS_HTTP=200
B1_CSS_MIME=PASS
B1_JS_PREFIX=9
B1_JS_LEGACY=0
B1_JS_HTTP=200
B1_JS_MIME=PASS
B1_CSS_ARCHIVOS=4
B1_DESPLIEGUE=NINGUNO
B1_SECRETOS=NO_EXPUESTOS
```

Esto **cierra exclusivamente el fallo del smoke de assets**: la variable no secreta `CLEANOPS_B1_ASSET_PREFIX=/b1-static` debe estar presente *también en el proceso Next de ejecución*. El prefijo ya fue compilado en la imagen `cleanops360-b1-assets-candidate:296d4ef2` (ID `sha256:da7e2fc8369763d51002acdd4b00eb7788ecc603f39275dd36407fe6b6ade332`). Con la variable de runtime, HTML hace referencia a un CSS y 9 JS exclusivamente namespaced; recursos reales responden 200 MIME. **NO se requiere reconstruir la imagen para este candidato**, solo aplicar variable runtime en un contenedor nuevo. El HTTP 500 de Brave sigue sin causa confirmada y requiere ensayo real de interfaz.

Se ha versionado un procedimiento de staging en `scripts/b1-assets-canary-20261105.py` (commit `a6a31e528438fc61e4ed24b42b3cc0d53c4c5de7`), que **NO se ha ejecutado todavía**. Crea un segundo contenedor privado `cleanops360-b1-assets-shadow-296d4ef2` con la imagen exacta ya compilada, copia únicamente variables públicas de origen del shadow B1 actual, añade `CLEANOPS_B1_ASSET_PREFIX=/b1-static`, conserva UID/GID 999:999, red/límites/montajes read-only y no comparte alias `cleanops-b1-ingress`. Rechaza recursos insuficientes o estados distintos. No modifica el shadow original, routers de Traefik, SQL guard ni el web anterior; su smoke GET /login y /_next/static interno no crea credenciales. Dispone de `rollback` que valida propietario Docker y rechaza retirar un canary ya usado por un router. No usar `docker network connect` ni gestionar certificados manualmente.

**Secuencia pendiente:** validar Python del script y stage canary en el VPS, comprobar salida de smoke y salud original; solo después preparar/autorizar *nuevo* router que dirija `/login` y `/b1-static/_next/static/` **al canary nuevo** (no al antiguo `cleanops-b1-shadow@file` del archivo review), con ForwardAuth obligatorio en login y stripPrefix solo para assets. El plan de public cutover debe tener rollback y pruebas HTTP/browser; evitar usar directamente YAML de review anterior cuyo backend apunta al contenedor antiguo. El gate SQL está cerrado y no se debe reabrir solo para comprobar assets. No declarar AUTH-GATE-05 cerrado.

**Adenda — target correcto del router v2:** en commit `b0b98bc80880f2d8933cd49132b845679a161ada` se corrigió el borrador `deploy/staging/traefik/b1-device-ui-assets-v2.review.yaml` para que **ambos routers** (login y assets) apunten al servicio nuevo `cleanops-b1-assets-shadow@file` con URL `http://cleanops-b1-assets:3000`. No instalar este archivo hasta confirmar el nuevo canary y revisión del rollback; no tocar el router principal B1. La cookie SameSite=Strict y el origen de navegación externa aún pueden provocar comportamiento de dos webs; se exige prueba de navegador real. El PR #33 sigue draft y sin merge; HEAD consultado tenía cero workflow runs PR. No se ejecutó el stage canary todavía.

## 05/11/2026 — canary aislado PASS; cutover UI v2 con rollback preparado

El propietario ejecutó en el VPS `/root/b1-assets-canary-20261105.py stage` con bytes de Git previamente comprobados. Salida literal:

```text
B1_CANARY_HTML=PASS
B1_CANARY_CSS=PASS
B1_CANARY_JS=PASS
B1_CANARY_REF_MIX=ZERO
B1_CANARY=PREPARADO_PRIVADO_SIN_ROUTER
B1_ORIGINALES=INTACTOS
B1_ROUTERS=NO_MODIFICADOS
B1_SQL_GATE=NO_MODIFICADO
B1_SECRETOS=NO_IMPRESOS
```

**Cierra preparación de canary**, no la aceptación de navegador. La imagen `cleanops360-b1-assets-candidate:296d4ef2` (ID previamente verificado `sha256:da7e2fc8369763d51002acdd4b00eb7788ecc603f39275dd36407fe6b6ade332`) ya está arrancada con `CLEANOPS_B1_ASSET_PREFIX=/b1-static`. La infraestructura existente no ha sufrido modificaciones según el script. El guard SQL sigue `deployment_enabled=false` tras rollback.

Se preparó el **script de cutover UI protegido v2**, `scripts/b1-ui-v2-guarded-cutover-20261105.py` (última revisión commit `7e22e453dabab152de03a7e37e7a2e440dc2ee0f`, NO ejecutado): exige el canary esperado, verifica archivo YAML Git inmutable `b0b98bc80880f2d8933cd49132b845679a161ada` y blob `b7410ec217ff309f045a060e5612f0496264faca`, la presencia de la ruta B1 principal, la ausencia de routers UI anteriores y una credencial durable no caducada custodiada en el VPS. Instala únicamente `cleanops-b1-device-ui-v2.yaml` mediante hardlink atómico en el provider ya existente; conserva ForwardAuth + stripAssertion de `/login`, aísla recursos `/b1-static/_next/static/` con stripPrefix hacia `cleanops-b1-assets:3000`, sin tocar `/_next/static` original. Tras instalar comprueba: /login sin dispositivo HTML 200 de web original; /login con dispositivo HTTP 200 y HTML del candidato con únicamente recursos prefijados; GET de CSS y JS públicos 200 + MIME correcto; estado canary running. Si cualquier paso falla retira exactamente el nuevo YAML y comprueba la restitución del login original; incluye acción `rollback` explícita. No modifica SQL/OpenBao, no recrea web, no redepliega shadow previo ni publica tokens.

**Limitación explícita:** con guard SQL cerrado, el smoke HTTP del login puede pasar 200 sin emitir PREAUTH/CSRF; esto **NO valida el login funcional**, solo el routing y los assets. El siguiente paso tras activar el nuevo UI es comprobar navegador **navegando directamente dentro del mismo origen** para que la cookie SameSite=Strict sea enviada; no hacer clic desde otra web para usar la primera carga como prueba de dispositivo. Si aparece HTTP 500, retirar router v2 inmediatamente y clasificar respuesta/logs exactos redacted; no confundir 200 curl con éxito de navegador. Solo si UI de navegador se verifica, reabrir gate SQL mediante procedimiento separado autorizado, validar bootstrap real y primera cuenta sintética/TOTP/sesiones. No declarar AUTH-GATE-05 cerrado por este cutover.

## 05/11/2026 — UI v2 detenido antes de activar por token expirado

El propietario ejecutó el script `scripts/b1-ui-v2-guarded-cutover-20261105.py activate` previamente verificado por blob Git. **Salida real de la ejecución:**

```text
B1_UI_V2_STOP=DEVICE_CADUCADO
B1_SQL_GATE=NO_MODIFICADO
B1_ORIGINALES=NO_MODIFICADOS_POR_SCRIPT
B1_SECRETOS=NO_IMPRESOS
```

**Interpretación:** el guard de vigencia de la cookie privada se ejecuta **antes** de crear `cleanops-b1-device-ui-v2.yaml`. Este intento no instaló ningún router. El canary `cleanops360-b1-assets-shadow-296d4ef2` **ya pasó** HTML/CSS/JS/REF_MIX=ZERO; no hay motivo de recompilar, recrear canary, volver a probar PG/OpenBao/TLS o relajar el guard de expiración. Estado conocido: B1 UI v2 NO ACTIVADA; SQL deployment gate sigue revertido. Falta obtener una credencial B1 nueva y entregarla al mismo perfil del navegador; el problema original HTTP 500 no queda validado aún.

**Procedimiento existente identificado:** `scripts/b1-private-operator.mjs` emite `device.issue` mediante el login de operador `cleanops_b1_operator_login` con materiales privados ya custodiados en `/run/cleanops-b1-operator`. Se había emitido una **sustitución anterior** con nuevo `reference`/`authorizationReference`, sin crear otra cuenta ni operador. Para evitar otra duplicación y exponer credenciales, se preparó `scripts/b1-renew-expired-device-ui-v2-20261105.py` en commit `d7ebaf20eb4c7d7315a3359c45be77ee42a59eed` (**no ejecutado**). Precondiciones: recibo realmente expirado; `request.json` y `result.json` actuales con metadatos root-only exactos; operador existente; `lifetimeMs <= 4h`; ausencia de destino de archivo. Archiva ambos en `/run/cleanops-b1-operator/expired-ui-v2-20261105/`, prepara `device.issue` con etiquetas previas y **nuevas referencias de auditoría específicas de esta renovación sintética**, invoca el operador ya validado con Docker Compose en el servicio shadow y verifica solo estado ENROLLED, nombre de cookie y tiempo restante sin imprimir bearer/identificadores. Ante estado ambiguo **no reintentar**: comprobar recibo/auditoría privada primero. El script no cambia usuarios, roles, SQL gate ni rutas. Después se debe entregar el nuevo bearer al navegador sin imprimirlo, sustituyendo la cookie antigua; solo entonces probar cutover v2. La emisión es para el staging autorizado y no representa aprobación independiente de cierre de `AUTH-GATE-05`.

## 05/11/2026 — renovación B1 v2 mediante operador existente PASS

El propietario ejecutó una sola vez `scripts/b1-renew-expired-device-ui-v2-20261105.py` con bytes Git comprobados en el VPS y reportó literalmente:

```text
B1_RECIBO_ANTERIOR=ARCHIVADO_PRIVADO
B1_REEMPLAZO_V2=PREPARADO
B1_OPERATOR_RECEIPT_SEALED
B1_CREDENCIAL_V2=ENROLLED
B1_CREDENCIAL_V2_MINUTOS_RESTANTES=239
B1_USUARIO_Y_ROLES=NO_MODIFICADOS
B1_TRAEFIK=NO_MODIFICADO
B1_GATE_SQL=NO_MODIFICADO
B1_COOKIE=NO_EXPUESTA
```

**PASS de emisión única:** la nueva cookie está custodiada en `/run/cleanops-b1-operator/result.json` modo root-only sin revelar el bearer; los antiguos `request.json`/`result.json` están archivados bajo `/run/cleanops-b1-operator/expired-ui-v2-20261105`. El tiempo de 239 minutos era el restante **en ese instante**, no una predicción a futuro. No reejecutar renovación ni el operador. El canary privado continúa preparado y funcional según último PASS; UI v2 todavía no instalada porque el anterior `activate` se detuvo previamente en `DEVICE_CADUCADO`; SQL gate cerrado. Próxima operación: copiar solo el token nuevo mediante el procedimiento anterior Windows PowerShell SSH cifrado a clipboard, sustituir en el **mismo perfil Brave** la cookie `__Host-cleanops_b1_ingress_device` (`Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, host-only), vaciar clipboard y confirmar sin mostrar el valor. Solo después activar el script v2 con rollback automático. No repetir build, env, TOTP, SQL, PKI. El HTTP 500 en Brave queda no verificado hasta prueba de navegador.

## 05/11/2026 — router B1 UI v2 ACTIVADO con HTTPS, CSS y JS PASS

**Salida de ejecución real recibida del propietario** en el VPS `srv1155120`, tras la renovación de una única credencial con `B1_CREDENCIAL_V2=ENROLLED` (239 min de vigencia *en el momento de emisión*). Ejecución única de `python3 /root/b1-ui-v2-guarded-cutover-20261105.py activate`, versión verificada en Git (script de commit `7e22e453dabab152de03a7e37e7a2e440dc2ee0f`):

```text
B1_UI_V2_HTTP=200
B1_UI_V2_CSS=PASS
B1_UI_V2_JS=PASS
B1_UI_V2_REF_MIX=ZERO
B1_UI_V2=ACTIVO_DEVICE_ONLY
B1_SQL_GATE=NO_MODIFICADO
B1_ORIGINALES=NO_MODIFICADOS_POR_SCRIPT
B1_SECRETOS=NO_IMPRESOS
```

**Interpretación:** el nuevo router file-provider `cleanops-b1-device-ui-v2.yaml` se instaló, preservando `/login` antiguo sin la cookie B1, enrutando `/login` con cookie B1 y ForwardAuth al canary `cleanops-b1-assets:3000`; `/b1-static/_next/static/` se desenvuelve con StripPrefix y CSS/JS HTTP 200 en las comprobaciones del script. Las versiones Next antiguas ya no comparten la misma ruta de assets para B1. **Esto es PASS de HTTP y recursos del ensayo con curl**, no acredita todavía carga completa ni ausencia del error 500 en Brave, ni PREAUTH/CSRF, login, MFA o sesiones. El guard SQL permanece en su estado cerrado `deployment_enabled=false`, confirmado por rollback anterior; no reejecutar router activate ni regenerar credenciales.

**Siguiente prueba obligatoria en navegador:** el propietario, con la nueva cookie host-only en el mismo perfil de Brave, debe **escribir directamente** `https://cleanops.nuvurent.com/login` para conservar SameSite=Strict (no navegar desde ChatGPT en primera carga), comprobar que la página carga con estilos y sin HTTP 500, y reportar resultado sin exponer cookie/credenciales/respuestas privadas. Si aparece HTTP 500, hacer rollback inmediato **solo del router v2** con `python3 /root/b1-ui-v2-guarded-cutover-20261105.py rollback`, no alterar canary SQL ni main router. Si la interfaz carga, probar por separado el desbloqueo temporal SQL con recibo protegido y aceptación autenticación sintética; no introducir contraseñas mientras el SQL gate sigue cerrado. `AUTH-GATE-05=OPEN` hasta pruebas reales y dictamen independiente.

## 05/11/2026 — rollback UI v2 PASS; captura posterior muestra formulario

El propietario notificó ejecución de `python3 /root/b1-ui-v2-guarded-cutover-20261105.py rollback` con salida:

```text
B1_UI_V2_ROLLBACK=PASS
B1_MAIN_ROUTER=INTACTO
B1_SQL_GATE=NO_MODIFICADO
B1_ORIGINALES=NO_MODIFICADOS_POR_SCRIPT
B1_SECRETOS=NO_IMPRESOS
```

Luego aportó una captura del navegador en `cleanops.nuvurent.com/login` con el formulario básico «CleanOps 360 · Acceso», campos Email/Contraseña, «Continuar», «Restablecer contraseña», «Reiniciar acceso». La captura **no muestra HTTP 500**, pero, al estar tomada después del rollback, no constituye evidencia de que el router UI v2 haya funcionado en Brave. No está confirmado por el usuario el motivo del rollback ni si se observó 500 durante la ventana activa; no inventar esa causa. `app/login/page.tsx` renderiza `AuthPanel`, `components/auth-panel.tsx` tiene `style={{maxWidth:640, margin:'3rem auto', padding:24}}` y `app/globals.css` define una apariencia deliberadamente mínima, sin `font-family` personalizado. Por tanto **el aspecto simple no demuestra ausencia de CSS**. La prioridad siguiente es distinguir si hubo HTTP 500 en el navegador durante v2 activo o si se retiró preventivamente; en caso de error real, obtener nombre de recurso y código de la solicitud fallida desde DevTools/Network sin copiar cookies, cuerpos, cabeceras ni URLs con tokens. No volver a activar a ciegas, no volver a emitir device, no rehacer PostgreSQL/TLS/OpenBao. SQL guard cerrado, canary v2 privado sigue preparado según último PASS, PR #33 draft, `AUTH-GATE-05` OPEN.

## 05/11/2026 — aclaración del propietario: HTTP 500 anterior desapareció tras recargar

El propietario aclaró literalmente que, tras la activación de UI v2, «volvió a aparecer [HTTP 500] pero porque no había actualizado la página, pero actualizándola no salió». **No hay evidencia de HTTP 500 persistente tras recargar**. Tampoco atribuir una causa técnica concluyente a caché sin trazas HTTP; este dato corresponde a una observación del navegador. El propietario había ejecutado previamente `B1_UI_V2_ROLLBACK=PASS` y la captura posterior muestra el formulario con presentación mínima, que es compatible con el CSS y JSX existentes. El script de activación UI v2 sí reportó `B1_UI_V2_HTTP=200`, `B1_UI_V2_CSS=PASS`, `B1_UI_V2_JS=PASS`, `B1_UI_V2_REF_MIX=ZERO`, `B1_UI_V2=ACTIVO_DEVICE_ONLY`. **Estado actual**: routers UI v2 retirados tras rollback, shadow nuevo con prueba privada PASS, guard SQL cerrado. Próxima operación: una única reactivación con script existente `/root/b1-ui-v2-guarded-cutover-20261105.py activate`, sin reemitir dispositivo ni reconstruir; abrir /login directamente en Brave, recargar con Ctrl+Shift+R y comprobar que formulario carga sin 500. No considerar todavía login/TOTP/CSRF/sesiones PASS. Si vuelve el error después de recarga, no repetir; capturar solo código y tipo de solicitud fallida, hacer rollback del v2 y clasificarlo. `AUTH-GATE-05 OPEN`.

## 05/11/2026 — HTTP 500 reproducido en Brave tras reactivar UI v2

El propietario ejecutó **una reactivación única** del script v2 existente tras el rollback anterior, sin nuevos builds ni credenciales; salida:

```text
B1_UI_V2_HTTP=200
B1_UI_V2_CSS=PASS
B1_UI_V2_JS=PASS
B1_UI_V2_REF_MIX=ZERO
B1_UI_V2=ACTIVO_DEVICE_ONLY
B1_SQL_GATE=NO_MODIFICADO
B1_ORIGINALES=NO_MODIFICADOS_POR_SCRIPT
B1_SECRETOS=NO_IMPRESOS
```

**Fallo real:** el propietario volvió a reportar `HTTP ERROR 500` en Brave después de la reactivación. El `GET` equivalente de curl vía script es 200, CSS/JS 200, cero mezclas; **la validación HTTP sintética no reproduce el contexto del navegador**. El usuario ya había aclarado que en un intento anterior el error desapareció al actualizar, pero en este nuevo intento sí hay 500 informado. No declarar bug resuelto, no atribuir a caché ni gate SQL sin evidencia de la solicitud concreta. Se ha indicado **rollback inmediato** `python3 /root/b1-ui-v2-guarded-cutover-20261105.py rollback`; **resultado todavía no recibido**. Hasta recibir el PASS, no asumir retirado el router. Mantener gate SQL cerrado, no emitir nueva credencial, no rehacer mTLS/PG/OpenBao/TLS, no reconstruir ni volver a activar. Diagnóstico siguiente: identificar en DevTools Network la solicitud que devuelve 500 (tipo `document` vs `fetch`/RSC), código y método sin cabeceras ni cookies; y proyectar logs del **nuevo** contenedor `cleanops360-b1-assets-shadow-296d4ef2` en categorías sin exponer datos. No usar logs del shadow anterior como evidencia de error de este canary. `AUTH-GATE-05` OPEN.

## 05/11/2026 — nueva evidencia visual: Chrome muestra login; Brave reportó 500

El propietario aporta captura de **Chrome**, `https://cleanops.nuvurent.com/login`, donde se visualiza el formulario básico «CleanOps 360 · Acceso» (Email, Contraseña, Continuar, Restablecer contraseña, Reiniciar acceso), sin error 500 visible. En DevTools > Application > Cookies se observa **solo la cookie B1 del dispositivo**, con atributos HttpOnly, Secure y SameSite=Strict; la imagen también muestra parte del valor de una cookie (no reproducir ni pegar datos de cookies en mensajes/documentación). **No se observan las cookies `__Host-cleanops_preauth` y `__Host-cleanops_csrf`** en esa lista. El propietario informó HTTP 500 en Brave inmediatamente después del segundo `B1_UI_V2=ACTIVO_DEVICE_ONLY`. La captura Chrome **no prueba por sí sola qué router sirvió HTML**, ni la presencia de bootstrap o autenticación funcional. El SQL gate permanece cerrado según últimos comandos; en ese estado es esperable que no haya bootstrap. No atribuir causa del 500 a Brave sin código de la solicitud exacta y estado de router. Se había solicitado `python3 /root/b1-ui-v2-guarded-cutover-20261105.py rollback` tras el 500, **pero aún no hay salida nueva del propietario confirmando ese rollback**. Siguiente paso seguro: consultar estado v2 mediante API local de Traefik en solo lectura y, si el router sigue activo, obtener la solicitud HTTP 500 concreta desde Network en Brave (solo método, pathname, status, tipo; nunca cabeceras/cookies/query con tokens) y luego retirar si no está ya retirado. No emitir nueva credencial ni repetir comprobaciones de imagen o TLS. El usuario debe ocultar columna Value de las cookies en futuras capturas. `AUTH-GATE-05` permanece OPEN.

## 05/11/2026 — comprobación de solo lectura: los tres routers B1 siguen enabled

El propietario comprobó por la API local Traefik (sin mutación ni revelar secretos) que:

```text
cleanops360-b1-device-login@file=enabled
cleanops360-b1-device-assets@file=enabled
cleanops360-b1-guarded@file=enabled
```

Esta evidencia **actualiza** el estado después del HTTP 500 de Brave: no se confirmó rollback tras aquel error; el router UI v2 estaba **activo** al consultar. En Chrome el propietario ha observado el formulario `/login`; en Brave informó HTTP 500, sin identificación de la solicitud que falla ni prueba de estado tras refresh sin caché. El sistema aún necesita clasificar el 500 en navegador. No reactivar routers ya activos ni ejecutar de nuevo cutover, no reemitir device ni reiniciar imagen; SQL gate sigue cerrado según última prueba. Siguiente paso: en Brave DevTools > Network, desactivar caché, recargar una vez y registrar SOLO status, método, tipo y pathname de peticiones fallidas, nunca header Cookie, bearer, query ni cuerpo. Si persiste 500, clasificar fallo de navegación Next/RSC/document frente a datos backend, con rollback v2 disponible. No cerrar AUTH-GATE-05 y no abrir guard SQL mientras haya error sin clasificar.

## 05/11/2026 — comparación de navegadores no equivalente: Brave en emulación Galaxy A55

El propietario aportó capturas adicionales del navegador en `https://cleanops.nuvurent.com/login`: **Chrome en escritorio** muestra el formulario sin mensaje HTTP 500 y la captura de Network muestra `0/28 solicitudes` por filtros; **Brave** muestra la página de error **HTTP ERROR 500** durante la **emulación móvil Samsung Galaxy A55, viewport 360×800** (indicador explícito `Dimensions: Samsung Galaxy A55 360 × 800` en la parte superior de DevTools). La pestaña Network de Brave muestra `0/4 requests` con filtro visual, por lo que ninguna petición concreta o status 500 en tabla está identificada. El banner de Chrome «Finalizar actualización» en otra captura no es una señal del backend. **No atribuir todavía el 500 a Brave, caché, modo móvil o Next**: son condiciones de prueba diferentes, la simulación puede modificar UA/viewport pero no está demostrado que cause el fallo.

Paso diagnóstico nuevo, sin mutación de VPS: desactivar la emulación móvil en Brave con Ctrl+Shift+M, limpiar filtros de Network, dejar DevTools abierto y forzar una sola recarga Ctrl+Shift+R; registrar si HTTP 500 persiste y, de ser así, el status/tipo del documento `/login` en filtro Doc. No copiar valores de cookies, cabeceras completas, payloads ni URL con tokens. Los tres routers `cleanops360-b1-device-login@file`, `cleanops360-b1-device-assets@file`, `cleanops360-b1-guarded@file` permanecen enabled según última API real. SQL gate permanece cerrado por último rollback; no probar contraseñas/TOTP; B1 AUTH-GATE-05 OPEN. No rehacer build, TLS, OpenBao, PostgreSQL ni credenciales.

## 05/11/2026 — Brave desktop Network: falla solicitud document /login

El propietario aportó captura nueva tras **desactivar la emulación móvil** y recargar Brave con Network abierto, sin filtros. En el panel izquierdo aparece `HTTP ERROR 500` para `cleanops.nuvurent.com/login`; en Network la solicitud `login` está en rojo, con tipo **document**, tamaño 0.0 kB y duración aproximada 40 ms. El campo Status de la captura aparece **truncado** como `(faile...`, por lo que **no puede afirmarse a partir de ese campo** si se obtuvo una respuesta HTTP 500 o un error de red. Tres entradas adicionales son imágenes internas `data:image/png` de la página de error de Chromium y responden 200; no son recursos de CleanOps. Chrome, en cambio, muestra el formulario en el mismo hostname. La emulación móvil no es condición necesaria del problema.

**Diagnóstico pendiente y mínimo (sin mutar el VPS):** en Brave DevTools > Network seleccionar la fila `login`, abrir Headers y leer SOLO la sección **General** (`Request Method`, `Status Code` y, si está presente, código de error `net::ERR_...`), sin enviar capturas que muestren `Request Headers`, `Cookie`, `Set-Cookie`, `Authorization` ni datos de formularios. Si HTTP 500 real, contrastar exclusivamente contadores de errores en **el canary actual** `cleanops360-b1-assets-shadow-296d4ef2` con la petición del navegador, no en el shadow antiguo. Si net error local, revisar Brave Shields/extensiones/proxy/caché solo tras identificarlo. El script curl UI v2 dio HTML 200 y CSS/JS PASS con su propia cabecera y cookie, por lo que no constituye prueba del contexto completo de Brave. Evitar volver a emitir device, reconstruir o rehacer PG/TLS/OpenBao. B1 guard SQL sigue cerrado y AUTH-GATE-05 OPEN.

## 05/11/2026 — Brave confirma GET /login HTTP 500 real en documento

El propietario adjuntó captura DevTools > Network > `login` > Headers > General **con un HTTP 500 confirmado**, en escritorio (sin emulación móvil):

```text
Request URL: https://cleanops.nuvurent.com/login
Request Method: GET
Status Code: 500 Internal Server Error
Remote Address: 72.61.195.72:443
Referrer Policy: strict-origin-when-cross-origin
Console: net::ERR_HTTP_RESPONSE_CODE_FAILURE 500
Response headers (2): contraídas; valores no examinados aún
```

El error se produce sobre la solicitud principal de tipo `document` a `/login`, **antes** de que el navegador cargue archivos estáticos; no es fallo CSS/JS ni causada exclusivamente por viewport/emulación. La captura de Chrome anterior muestra el formulario sin error. Se confirma que el 500 no es solo `net::ERR_CONNECTION_...` o navegador sin respuesta. No copiar el contenido del campo `Cookie` visible bajo Request Headers en la captura, ni incluir bearer, nombres/valores de cookies o demás cabeceras sensibles en Git/diagnósticos.

**Diagnóstico mínimo siguiente:** expandir únicamente `Response headers (2)` en DevTools de Brave, sin expandir/mostrar `Request Headers`. Reportar nombres y solo valores no secretos de cabeceras técnicas (`content-type`, `content-length`, `server`, `date`); omitir por completo `set-cookie`, `location` o cualquier encabezado de autenticación. Dos cabeceras de respuesta pueden caracterizar un error generado en la cadena Traefik/ForwardAuth frente al documento de error Next; no atribuir con certeza sin ver las cabeceras y, si hace falta, conteos de logs **del canary nuevo**. No rehacer builds, credenciales, PG, OpenBao ni TLS. Los routers UI v2 estaban `enabled` según API reciente y SQL gate cerrado; `AUTH-GATE-05 OPEN`.

## 05/11/2026 — HTTP 500 Brave, respuesta vacía de dos cabeceras

El propietario amplió únicamente **Response headers** del `GET /login` HTTP 500 de Brave y confirmó:

```text
content-length: 0
date: Thu, 05 Nov 2026 17:26:22 GMT
```

Esto confirma un HTTP 500 **sin cuerpo** desde la cadena HTTPS, distinto del HTTP 200 HTML obtenido en curl y Chrome. La ausencia de `content-type`, `server` y cuerpo es compatible con un fallo generado por proxy/middleware/transport o respuesta vacía de origen; **NO determina de forma única** si la fuente es Traefik, ForwardAuth o Next. El código `lib/b1/ingress-forward-auth.ts` devuelve únicamente 204 (permitir) o 403 (denegar) desde el handler, por lo que un 500 vacío no es su camino nominal. La cadena de Traefik posee el middleware ForwardAuth en `/login`, mientras que el candidato B1 recibe el enrutamiento HTTP. La siguiente comprobación debe mirar **logs de `dokploy-traefik`, `cleanops360-b1-shadow-cc51574a` (ingress ForwardAuth mTLS) y `cleanops360-b1-assets-shadow-296d4ef2` (Next UI)** para una ventana estrecha alrededor de `2026-11-05T17:26:22Z`, y únicamente proyectar conteos/categorías sin imprimir líneas o secretos. No repetir build, TLS, OpenBao, SQL, ni emitir nuevas cookies. Un resultado de 0 logs no es evidencia de ausencia de error; consultar con una única solicitud posterior con correlación si no hay datos. Guard SQL cerrado y AUTH-GATE-05 OPEN.

## 05/11/2026 — decisión del propietario: aceptar Chrome/Edge y no bloquear por Brave

El propietario remitió la única lectura categorizada de logs para 2026-11-05T17:26:10Z–17:26:40Z: Traefik `LINEAS=2`, `HTTP_500=0`, `ERROR=0`, `FORWARDAUTH=2`, `TRANSPORTE_TLS=0`, `NEXT_RENDER=0`; shadow/ForwardAuth B1 antiguo `LINEAS=0` en todas categorías; canary Next B1 nuevo `LINEAS=0` en todas categorías. `B1_OPERACION=SOLO_LECTURA` y `B1_SECRETOS=NO_IMPRESOS`. **No prueba inexistencia de fallo**; el HTTP 500 real en Brave sigue clasificado como incompatibilidad del escenario de Brave sin causa raíz demostrada.

**Decisión explícita de alcance:** «no me importa si en brave no funciona si sirve en chrome edge me sirve». No gastar más tiempo en Brave en este hito. Se verificó que Chrome muestra formulario HTML `/login` sin 500; **Edge no tiene prueba reportada** y, aun con HTML visible en Chrome, no están verificados PREAUTH/CSRF, login, TOTP o sesiones B1. La compatibilidad con Brave no se declara resuelta; registrar como limitación conocida / posible incidencia futura. El guard SQL `identity_private.configuration.deployment_enabled` permanece cerrado de acuerdo con el último rollback reportado; la UI v2 y router principal B1 estaban `enabled` en la última lectura. `AUTH-GATE-05 OPEN`.

**Próxima etapa:** usar Chrome como navegador principal para las pruebas sintéticas reales; Edge opcional después de instalar la credencial host-only con entrega segura específica al perfil. Nunca interpretar la simple carga del formulario sin cookie durable B1 como prueba del candidato. Reabrir temporalmente SQL requiere **procedimiento de prueba actualizado y reversible** porque `scripts/b1-gate-trial-20261105.py activate` rechaza un recibo existente; no volver a lanzar a ciegas. Mantener aislamiento staging, no usar datos reales, revocar/cerrar gate al terminar y no fusionar el PR #33 sin aceptación independiente. No repetir PG/TLS/OpenBao/compilación ni emitir más credenciales.

## 05/11/2026 — preparación de comprobación solo lectura de cuentas antes de reabrir SQL

**Continuación del ensayo B1 solicitada por el propietario.** La decisión explícita anterior acepta Chrome/Edge como navegadores de prueba y deja Brave fuera del hito sin afirmar que su 500 esté corregido. Los tres routers B1 estaban enabled según la última lectura; el guard SQL fue revertido con `B1_GATE_SQL=ROLLBACK_PASS`, y el script original `scripts/b1-gate-trial-20261105.py` conserva su recibo privado `/root/b1-gate-trial-20261105.receipt.json`. No reutilizar `activate` del ensayo anterior ni borrar sobrescribir el recibo existente. La emisión del dispositivo mediante operador con `ENROLLED` **no es** una identidad de formulario email/password ni constituye prueba de que exista el primer actor sintético.

Se ha versionado `scripts/b1-chrome-account-readiness-20261105.py`, commit `645a157e34b03e663323fde1374edc15003ac65c` (blob `ab10ce2106c03b4c89c9cae10b4fd11a4b504954`), **no ejecutado en el VPS todavía**. Usa una transacción PostgreSQL explícitamente `READ ONLY` sobre `cleanops_staging`, informa solo `B1_GATE_SQL` (cerrado/abierto), números de `app.users` activos y cuentas activas unidas a `identity_private.principals`, `identity_private.credentials` y `app.organizations`, sin leer/mostrar emails, hashes, IDs, tokens o material privado. Aunque exista una cuenta con credencial no acredita que sea sintética ni que esté lista para MFA. Una lectura por superusuario del contenedor PG puede acceder a esas tablas; su único objetivo es verificar si el flujo manual de Chrome tiene una cuenta candidata o necesita ejecutar separadamente la ceremonia `first-actor` ya existente y pendiente, sin duplicar preparaciones. `AUTH-GATE-05` permanece OPEN. Solo tras conocer este resultado se diseñará el nuevo ensayo SQL reversible con recibo distinto y cierre controlado, sin repetir PG/TLS/OpenBao ni build.
