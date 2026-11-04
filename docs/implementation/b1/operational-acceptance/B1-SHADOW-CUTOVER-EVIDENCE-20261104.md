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
