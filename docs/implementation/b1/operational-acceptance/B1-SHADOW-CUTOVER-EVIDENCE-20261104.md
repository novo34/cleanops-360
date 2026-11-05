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
