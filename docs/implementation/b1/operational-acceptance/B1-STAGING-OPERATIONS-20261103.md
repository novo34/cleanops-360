# B1 — Registro operativo incremental de staging — 2026-11-03

**Estado documental:** evidencias de terminal aportadas por el propietario el 03/11/2026; recopilación documental, no nueva verificación SSH ni dictamen independiente.  
**Proyecto:** `novo34/cleanops-360`. **Entorno:** VPS staging `srv1155120`, Dokploy `cleanops360-f4fxmd`.  
**Referencia de código del operador ejecutado:** `cc51574ad85485728d877efbbb69bcb345469596`, correspondiente al PR [#33](https://github.com/novo34/cleanops-360/pull/33). **PR #34:** [promoción de migraciones](https://github.com/novo34/cleanops-360/pull/34), head consultado `c6a199491a9ec9fad440dcfce9f26dad15b2cc48`. Ambos PR seguían abiertos, no fusionados, al realizar esta auditoría.  
**Regla de custodia:** este archivo no incluye contraseñas, token OpenBao, claves TOTP, QR, capacidades, recuperación ni contenido de manifiestos privados. El identificador/correo del administrador permanece en su solicitud privada, no se publica aquí.

## 1. Resumen verificable y límites

| Componente / operación | Estado | Evidencia / precisión |
| --- | --- | --- |
| SQL14 en staging | PASS reportado previamente | Instalación inicial e historial/checksum comunicados por propietario; no repetir. |
| SQL0002 y SQL0003 en PostgreSQL staging | **INSTALADOS — PASS reportado** | Salida previa del runner oficial: `B1_SQL0002_0003_APPLIED`, `B1_MIGRATIONS_COMPLETE_PASS`, `B1_INCREMENTAL_INSTALLATION_FINISHED`. No equivale a merge de PR #34. |
| PostgreSQL login del operador privado y del primer actor | **EXISTENTES — PASS reportado** | Credenciales privadas ya creadas, no volver a crear roles ni contraseñas. Prueba de conectividad del login del primer actor: `POSTGRES_LOGIN=PASS`. |
| OpenBao 2.7.2, Agent y lectura de token | **PASS en canal privado temporal** | Agent running; token en sink de Agent con metadatos `999:999:0600`, directorio `999:999:0700`; lector oficial `B1_OFFICIAL_TOKEN_READER_PASS`. No constituye aprobación general de custodia de web. |
| Generaciones 1 y 2 del primer actor | **ABORTED, conservadas como historial** | Caducidad durante confirmación / fallos de prueba, cierres oficiales y recibos sellados. No reintentar ni regenerar esas operaciones. |
| Generación 3: `first-actor.prepare` | **PASS** | Solicitud/recibo de preparación sellados en directorio privado. |
| Generación 3: `first-actor.confirm` | **PASS** | Aegis TOTP SHA-256: `B1_OPERATOR_RECEIPT_SEALED`, `ESTADO_CONFIRMACION=CONFIRMED`. |
| Generación 3: `first-actor.commit` | **PASS** | `B1_OPERATOR_RECEIPT_SEALED`, `FIRST_ACTOR=COMMITTED`, `RECIBO=COMMITTED`, `B1_FIRST_ADMINISTRATOR_COMMITTED_PASS`. |
| Administrador inicial persistido | **COMMITTED — PASS** | Estado confirmado mediante consulta en PostgreSQL en terminal del propietario; **no repetir alta**. |
| Login real de navegador, cookie, sesiones, logout, MFA, recuperación | **PENDIENTE** | No hay prueba operativa sobre la web staging que acredite estos flujos. |
| ForwardAuth/mTLS Traefik en servicio y despliegue de web B1 | **NO ACREDITADO / PENDIENTE** | La web actual y la imagen del operador pueden diferir; no afirmar activación por el éxito del contenedor temporal. |
| PR006 / PR007 / AUTH-GATE-05 | **OPEN** | Sin aceptación manual integral ni cierre independiente firmado; no declarar COMPLETE de B1. |
| Producción, SMTP, otros proyectos | **NO INTERVENIDOS / NO AUTORIZADOS** | Ninguna evidencia del alta implica despliegue en producción. |

**Evidencia más fuerte del hito:** salida del propietario: `ESTADO_CONFIRMACION=CONFIRMED`, seguida de `FIRST_ACTOR=COMMITTED`, `RECIBO=COMMITTED`, `B1_FIRST_ADMINISTRATOR_COMMITTED_PASS`. El resultado confirma el primer administrador en la base de datos; **no** demuestra que la interfaz actual permita iniciar sesión.

## 2. Cronología resumida para evitar repeticiones

1. **Base previa:** SQL14 y su journal ya estaban instalados. En esta sesión se confirmaron además SQL0002/0003 aplicadas mediante runner oficial a `cleanops_staging`. No volver a instalar ni ejecutar SQL manual.
2. **Primer actor técnico:** se crearon previamente los dos login PostgreSQL separados, uno del canal de ingreso y otro exclusivo del primer actor. La primera solicitud privada con contraseña elegida por el propietario se guardó con permisos estrictos. No repetir creación ni volver a solicitar la contraseña para documentar.
3. **Problema de runtime:** la imagen web existente no llevaba todos los imports del checkout B1. El operador privado utilizó el archivado del SHA `cc51574...` montado en contenedor temporal, **sin reconstruir ni desplegar la web**.
4. **Problema de sink:** el Agent tenía un `tmpfs` propio sobre `/run/cleanops-agent`, distinto de la visión del volumen en un contenedor nuevo. Montar el volumen o usar `--volumes-from` no proporcionaba el token activo. Se transfirió desde el Agent mediante `docker exec ... cat` y la entrada estándar hacia un `tmpfs` efímero del contenedor temporal, sin salida visible del token. Antes de ejecutar el operador se validaron permisos/propietario y el lector oficial.
5. **Capacidades efímeras:** el contenedor temporal utilizó `--cap-drop ALL` y únicamente `--cap-add CHOWN` y `--cap-add DAC_READ_SEARCH` para configurar y leer el sink efímero. Se aplicó `chmod` antes de `chown` para evitar `EPERM`. No cambiar permisos de los archivos originales del Agent.
6. **Primer prepare PASS:** `B1_OFFICIAL_TOKEN_READER_PASS`, `B1_OPERATOR_RECEIPT_SEALED`, `FIRST_ACTOR=PREPARED`, `EXIT_CODE=0`. La posterior confirmación venció dentro del plazo de 10 minutos; SQL pasó a `EXPIRED`. Se cerró oficialmente: `FIRST_ACTOR=ABORTED`, `B1_EXPIRED_GENERATION_CLOSED_PASS`.
7. **Generación 2:** nuevo `operationId`, mismos datos/contraseña privados, nueva clave y nuevo recibo; la verificación con autenticador anterior falló y se contabilizaron intentos, después venció el plazo. Cierre oficial de generación 2: `B1_GENERATION_2_ABORT_PASS`, `ABORTED`. No repetir ni eliminar evidencia.
8. **Compatibilidad de MFA:** el código de B1 fija `approvedTotpEnrollmentPolicy.algorithm='SHA256'`; la preparación genera URI `otpauth` que incluye algoritmo. La opción de entrada manual en Google Authenticator no demostró interoperabilidad. Se utilizó **Aegis** con SHA-256 configurable, sin modificar la política de seguridad B1. **No se aplicó** ningún cambio SHA-1 ni parche para Google Authenticator; es una tarea futura de compatibilidad, no condición del PASS de Aegis.
9. **Generación 3:** se generó un tercer `operationId` y se reutilizó la contraseña original. Un error de entrada de terminal (`EOFError`) y la comparación sensible a mayúsculas de `GUARDADOS` no llamaron al operador y no consumieron otro TOTP. Finalmente se usó `/dev/tty`, Aegis TOTP SHA-256 y se obtuvo **`CONFIRMED`** y después **`COMMITTED`** con recibos sellados. No volver a ejecutar prepare/confirm/commit.

**Advertencia sobre la expiración:** el SQL de `db/migrations/0002_first_actor.review.sql` concede 10 minutos desde `first_actor_begin` y registra intentos denegados. Una ceremonia anterior caducada no autoriza recrear la misma operación. La recuperación documentada requirió `first-actor.abort` y nuevo `operationId`; en la generación 3 el commit terminó correctamente.

## 3. Mapa de ubicación y procedencia — sin contenido de secretos

| Elemento | Ubicación / responsable | Restricción |
| --- | --- | --- |
| Código B1, migraciones y CLI | Git `novo34/cleanops-360`; SHA exacto anterior | El repo público/compartido contiene **solo código y documentación sin secretos**. |
| Checkout operativo Dokploy | `/etc/dokploy/compose/cleanops360-f4fxmd/code` | Puede estar en SHA distinto del operador. No asumir imagen desplegada por tener checkout. |
| Instalación privada v2 | `/run/cleanops-b1-private/installation.json` | Privada, permisos controlados; no subir ni imprimir. En el último inventario solo `ingress.evidenceReference` permanecía nulo; no inventar su valor. |
| Solicitud original / credencial PG del primer actor | `/run/cleanops-b1-first-actor/` | Acceso root. Solicitud y password privados; conservar, no duplicar. |
| Resultados de generación 3 | `/run/cleanops-b1-first-actor/generation-3/{prepare,confirm,commit}/` | Recibos originales sellados; contienen capacidades y materiales de recuperación en fase de preparación. No publicar, no sobrescribir. |
| Agent y sink en ejecución | Contenedor `cleanops360-f4fxmd-openbao-agent-1`, `/run/cleanops-agent` | Token es secreto. No copiar a disco persistente ni registrar contenido. |
| Docker PG staging | `cleanops360-f4fxmd-postgres-1`, red `cleanops360_staging_private` | Consultar metadatos mínimos; no ejecutar migraciones sin revisión. |
| Red de custodia | `cleanops360_staging_custody` | El contenedor temporal se conectó explícitamente; no prueba conectividad de la web definitiva. |
| Auditoría y eventos PostgreSQL | `identity_provision.first_actor`, `identity_provision.events`, `identity_provision.first_actor_history` | Evidencia durable de estados; no consultar ni exponer payloads sensibles. |
| Evidencias GitHub de preparación | PR #33, PR #34 y registros históricos relacionados | No confundir checks de CI con prueba de integración real en VPS. |

**Persistencia:** los archivos bajo `/run` son temporales y pueden desaparecer al reiniciar el host. Hay que definir **un procedimiento de custodia y recuperación** que preserve los recibos exigidos, con acceso restringido y sin subirlos al repositorio. Esto **no** autoriza una copia improvisada de secretos.

## 4. Inventario documental: qué queda histórico y qué se actualiza aquí

- `B1-VPS-EVIDENCE-REGISTER-20261031.md`: fuente central histórica del inventario. Sus observaciones fechadas son válidas **para sus fechas**, pero frases como «SQL0003 no instalado» quedaron superadas por los PASS de 03/11/2026. **Este anexo prevalece para operaciones del 03/11, sin borrar la historia.**
- `B1-CLOSURE-EXECUTION-20261031.md`: runbook original previo a la instalación. No se reutilizan pasos de despliegue ni SQL que ya fueron completados; se actualiza su interpretación con el anexo.
- `B1-OPERATOR-CHANNEL-CONTRACT-20261102.md`: describe el contrato de diseño previo; la presente evidencia confirma los login del operador y primer actor y la ceremonia del primer actor, **no confirma enrolamiento de dispositivos ni ForwardAuth en servicio**.
- `SEQUENTIAL_STATUS.json` y `SEQUENTIAL_EXECUTION.md`: siguen representando el gate global y evidencias históricas; **no cambiar contadores de requisitos ni AUTH-GATE-05 a COMPLETE por el COMMITTED**.
- PR #33 y #34: siguen en revisión, no fusionados. La instalación operativa reportada es un hecho distinto de la integración Git y deberá reconciliarse al actualizar el runbook de despliegue. Los textos de los PR contienen descripciones históricas de “no aplicado”; consultar este anexo para el estado real posterior.

## 5. Pendientes reales, sin reabrir PASS

1. **Prioridad:** probar login real del administrador en staging con la web efectivamente desplegada, verificar contraseña + Aegis SHA-256, sesión durable, cookies, logout y denegaciones. Registrar hora, SHA real, imagen, ruta y resultado, sin cookies ni códigos.
2. **Reconciliar despliegue:** determinar qué SHA/imagen y Compose están realmente en ejecución; preparar el delta mínimo de web/montajes y Traefik/ForwardAuth mTLS, con rollback y revisión independiente. **No asumir que el canal B1 del contenedor temporal está conectado a la web.**
3. **Custodia y resiliencia:** auditar almacenamiento/retención de recibos privados y prueba de recuperación, plan antes de reiniciar, borrar o rotar; cerrar referencias `ingress.evidenceReference` solo con prueba auténtica.
4. **Aceptación funcional PR006/PR007:** browser, MFA, replay, sesiones, revocación, fail-closed, TLS, topología, operadores, correo y revisión independiente; dejar AUTH-GATE-05 abierto hasta aprobación formal.
5. **Compatibilidad Google Authenticator:** investigar un diseño seguro y ensayos independientes del soporte SHA-256; **no degradar SHA-256 unilateralmente** ni invalidar la cuenta Aegis comprometida.
6. **Trazabilidad Git:** vincular esta actualización documental con PR #33/#34 sin merge automático, y revisar los cierres pendientes; no declarar aceptación basándose solo en estas notas.

## 6. Reglas operativas para el siguiente ejecutor

- **No repetir:** SQL14, SQL0002/0003, creación de roles/login, generación de contraseñas, preparación del primer actor ni generación 3 `confirm/commit`. El estado actual documentado es **`COMMITTED`**.
- Comprobar el estado con una consulta breve **solo si un nuevo paso depende de él**; no ejecutar escrituras de identidad como “prueba”.
- No escribir ninguna credencial, `request.json`, `result.json`, token, URI `otpauth`, QR, clave ni código de recuperación en GitHub, PRs, logs o chats.
- Mantener `main` y `staging` intactos; no activar Traefik, ForwardAuth ni desplegar la imagen desde una rama documental.
- Estado formal: **primer actor COMMITTED**, **B1/AUTH-GATE-05 OPEN**; toda aceptación adicional exige evidencias operativas nuevas.


## 7. Inventario web efectivo posterior al COMMITTED — propietario, 03/11/2026

**Fuente:** ejecución SSH de solo lectura aportada por el propietario sobre `cleanops360-f4fxmd-web-1`; los resultados se refieren al contenedor ejecutándose, **no** al árbol Git ni al contenedor operador B1.

| Verificación | Resultado observado |
| --- | --- |
| Estado web | `running`, Docker health `healthy` |
| Imagen en ejecución | `sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290` |
| Usuario del proceso configurado | `cleanops` |
| Montajes Docker | **NINGUNO** |
| Redes | `cleanops360-f4fxmd_default`, `cleanops360_staging_private`, `dokploy-network` |
| `/app/lib/b1/first-actor.ts` | **AUSENTE** |
| `/app/lib/b1/private-runtime.ts` | **AUSENTE** |
| `/run/cleanops-b1-private/installation.json` | **AUSENTE** |
| `/run/cleanops-agent/token` | **AUSENTE** |
| HTTP interno `http://127.0.0.1:3000/login` | **200** (página disponible, **no** autentificación comprobada) |

**Conclusión:** la web que responde en staging es una imagen antigua sin archivos privados ni montajes B1. El primer administrador está **COMMITTED en PostgreSQL**, pero el login B1 de la web en ejecución **no está integrado ni probado**. No marcar AUTH-GATE-05 como PASS.

**Próximo paso sin cambios:** capturar por metadatos la fuente/identidad del Compose operativo Dokploy, labels/router Traefik y configuración de la imagen web; comparar con `deploy/staging/compose.yaml`, `compose.b1-web.yaml` y el SHA revisado. Preparar delta mínimo reversible con tratamiento específico del Agent `tmpfs` y sus controles de token. No modificar web, Traefik, redes, SQL, OpenBao ni imágenes antes de reconciliar, revisar y autorizar la intervención.


## 8. Procedencia efectiva del despliegue web y routers — propietario, 03/11/2026

**Fuente:** segunda inspección Docker/Git de solo lectura aportada por el propietario. Complementa, **no reemplaza**, el inventario de la sección 7.

| Atributo | Valor observado |
| --- | --- |
| Compose project | `cleanops360-f4fxmd` |
| Compose service | `web` |
| Compose efectivo señalado por Docker | `/etc/dokploy/compose/cleanops360-f4fxmd/code/deploy/staging/compose.yaml` |
| Directorio de trabajo Compose | `/etc/dokploy/compose/cleanops360-f4fxmd/code/deploy/staging` |
| SHA de checkout Dokploy local | `d3ea84b38fd1574db1610f03b59c8c4a5050ac72` |
| Imagen web efectiva | `sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290` |
| Imagen construida | `2026-10-20T14:29:38.383721771Z` |
| Tag local | `cleanops360-f4fxmd-web:latest` |
| Routers existentes | `cleanops360-f4fxmd-15-web`, `cleanops360-f4fxmd-15-websecure` |
| Servicios Traefik existentes | `cleanops360-f4fxmd-15-web`, `cleanops360-f4fxmd-15-websecure` |
| Label de red Docker Traefik | `traefik.docker.network` presente |
| TLS de router seguro | `tls.certresolver` presente; **valor no inspeccionado** |
| Middleware router HTTP | `middlewares` presente; **valor no inspeccionado** |

**Separación crítica:** la etiqueta de Docker prueba qué ruta de Compose fue utilizada, pero **no prueba que el contenido actual de ese archivo sea idéntico al que originó el contenedor**. El checkout `d3ea84b...` y la imagen de octubre no incluyen el módulo B1 revisado `cc51574...`; no aplicar `git pull` ni `docker compose up` para “sincronizar” sin reconciliación y rollback.

**Siguiente evidencia faltante:** hash y estructura sanitizada del Compose operativo, rutas y middleware efectivos (sin datos privados), contraste contra el overlay `deploy/staging/compose.b1-web.yaml` y topología/identidad runtime. El estado de Traefik ForwardAuth/mTLS sigue no comprobado y la validación del agente no debe darse por resuelta por el operador temporal.

**Acción permitida aquí:** solo lectura y documentación. No recreación, merge, despliegue, ni modificación de redes o certificados.


## 9. Integridad de Compose, etiquetas Traefik e identidad efectiva — propietario, 03/11/2026

Inspección posterior de **solo lectura**. Resultados aportados por el propietario, sin intervención del agente documental sobre el VPS.

| Atributo | Resultado |
| --- | --- |
| SHA-256 Compose operativo | `03e2033c7c456b6eded20d68e8babe7af20596b14617f0a86d34997aa407578c` |
| Ruta | `/etc/dokploy/compose/cleanops360-f4fxmd/code/deploy/staging/compose.yaml` |
| Tamaño/permisos/propietario | `4020` bytes, `0644`, `root:root` |
| `traefik.docker.network` | `dokploy-network` |
| Router HTTP `cleanops360-f4fxmd-15-web` | `web`, middleware `redirect-to-https@file`, servicio `cleanops360-f4fxmd-15-web` |
| Router HTTPS `cleanops360-f4fxmd-15-websecure` | `websecure`, servicio `cleanops360-f4fxmd-15-websecure`, resolver `letsencrypt` |
| Reglas de ambos routers | Presentes y de hash idéntico: `4e4556685ce29d2dfa8985e5bb3e525d9bb75ffd14aca90d35b7a4e3f6ebfca1` (contenido privado de dominio no revelado) |
| Identidad efectiva del proceso web | `uid=999(cleanops) gid=999(cleanops) groups=999(cleanops)` |
| Git checkout local | `git status --porcelain`: vacío, árbol limpio |

**Implicaciones:** preservar routers actuales, HTTPS y middleware redirect, redes y web existente. UID/GID coincide con contrato de B1 pero **no prueba** que el token OpenBao sea accesible por el contenedor web: actualmente carece de montajes y el Agent usa un `tmpfs` propio. Hace falta diseño de custodia revisado, no un montaje improvisado del volumen.

**Pendiente previo al cambio:** contrastar contenido efectivo del Compose existente con el árbol versionado de `d3ea84b...`, metadatos de montajes y topología del Agent; producir un delta reversible exacto y autorización específica. Ningún cambio operativo autorizado por esta documentación.
