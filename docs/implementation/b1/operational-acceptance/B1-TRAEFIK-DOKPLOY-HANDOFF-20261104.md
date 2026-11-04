# B1 — relevo operativo Traefik/Dokploy (04-11-2026)

> Alcance: estado confirmado en la conversación con salidas del VPS y revisiones puntuales de GitHub. Este documento NO autoriza operaciones, no acredita un despliegue y no sustituye las capturas privadas. Mantener PR #33 en borrador hasta las puertas correspondientes.

## Identidad y límites

- Repo: `novo34/cleanops-360`. Rama de preparación: `prep/b1-final-closure-20261102`; PR [#33](https://github.com/novo34/cleanops-360/pull/33) contra `staging`, abierta, draft, no merge. SHA de código previo a este documento: `e7edd1dd77fdcd729f70b314ea9d6fdd1b98f176`.
- VPS administrado por el propietario: `srv1155120`. **El asistente/Claude Code Web no tienen acceso shell al VPS**; el propietario ejecuta comandos explícitos. No solicitar ni subir archivos de inspección privados, secretos, certificados, ACME o logs completos.
- Traefik operativo aún: contenedor independiente `dokploy-traefik`, `traefik:v3.6.7`, `running`, política `restart=always`. La actualización **a 3.7.17 no se ha ejecutado**. La activación B1 sigue bloqueada: `AUTH-GATE-05 OPEN`.
- Dokploy: servicio Swarm `dokploy/dokploy:v0.30.10@sha256:417cb052bed87c95ab43276888329da261f360c043bb81cd4afd7a2df66c4be7`, una réplica, `stop-first` para update y rollback, tarea `Running` hace 12 días al 04-11-2026. `TRAEFIK_VERSION` no definida en entorno del servicio; en código de Dokploy v0.30.10, `packages/server/src/setup/traefik-setup.ts`, default `3.6.25`. **Recrear Traefik desde Dokploy puede volver a 3.6.25**; alinear la variable requiere `docker service update` y posible reinicio/interrupción del panel. La variable NO se ha cambiado.
- Swarm: nodo único `srv1155120`. Redes Traefik: `dokploy-network` overlay swarm attachable, IP fija `10.0.1.11`; `supabase-supabase-2bvnab` bridge, IP dinámica. `docker network inspect --verbose` representa el mismo endpoint en `Containers` y `Services.Tasks`; deduplicación por `EndpointID` completo en código corregido.

## Evidencias y trabajos completados — NO repetir sin cambios de bytes o nueva evidencia

1. PR #33 y módulos previos B1: suites B1, SQL14/SQL0002/SQL0003, AUD-031, comprobaciones anteriores y hallazgos ya cerrados deben tratarse como antecedentes documentados; no volver a abrir PASS sin fallo demostrable. Para historial general consultar runbooks y evidencias del repo, incluyendo `docs/implementation/b1/operational-acceptance/`.
2. Generador `scripts/traefik-standalone-upgrade.py`, simulador y pruebas refinados por commits:
   - `140161bf`: plan offline y canario v3.7.17;
   - `d4b4ef1d`: rollback robusto;
   - `8570a3f0`: IP fija/overlay y recuperación;
   - `61c7e15b`: LogConfig exacto (opciones privadas), sonda y auditoría de docker inspect, 43 tests;
   - `d759b955`: sonda `--network none` sin puertos/IP/aliases, 45 tests;
   - `4448d509`: deduplicación exacta endpoint original `Containers` / `Services.Tasks`, 52 tests;
   - `e7edd1dd77fdcd729f70b314ea9d6fdd1b98f176`: canario acepta proceso vivo hasta timeout 124 y cero errores reales, 60 pruebas del módulo afectado y 6 con binario real Traefik 3.7.17 según reporte Claude. CI en SHA final no acreditado por runs en consulta de PR.
3. Ensayo REAL Docker overlay aislado en VPS: `IP_REASIGNADA_PASS`, `ROLLBACK_IP_PASS`, `ENSAYO_OVERLAY_PASS`. No repetir.
4. Plan actual generado en VPS: `PLAN OK 3.6.7 -> 3.7.17`, validación sintáctica 4 scripts PASS y comparación `BEFORE MATCHES PLAN` PASS.
5. `01-prepare.sh` versión corregida: **`RESULTADO=0`, `BEFORE MATCHES PLAN`, `IMAGE OK`, `PROBE OK`, `CANARY OK` (20 s vivo, cero errores de config, 32 errores esperados Docker/Swarm sin socket), `PREPARE OK`**. Traefik operativo no tocado. Existe sonda detenida `dokploy-traefik-probe-20261104T155308Z`; no eliminar sin comprobar estado. Puede haber sondas detenidas anteriores; no hacer limpieza amplia.
6. Respaldo privado de Traefik `traefik-config.tar`: `sha256sum -c` => `OK`. `prepared.ok` presente. **13 routers** `routers.before.json`. Detalle: `acme-http@internal`, `api@internal`, `dashboard@internal`, CleanOps /dev y root por web/websecure, Dokploy HTTP/HTTPS, Espacore HTTP/HTTPS, JEV HTTP/HTTPS. Baseline en VPS.
7. HTTPS desde localhost preservando SNI y comprobando TLS: cinco solicitudes PASS, `HTTP 200`, `CURL_EXIT=0`: `cleanops.nuvurent.com/login`, `cleanops.nuvurent.com/dev`, `dokploy.nuvurent.com/`, `espacore.nuvurent.com/`, `jev.nuvurent.com/`. Archivo `/root/b1-traefik-upgrade/smoke.tsv` creado con cinco filas y `SMOKE_CONFIGURADO_PASS`, `SERVICIOS_VERIFICABLES: 5`.
8. Especificación Dokploy respaldada con `docker service inspect dokploy > /root/b1-traefik-upgrade/dokploy-service-before.json`; resultado `DOKPLOY_SPEC_GUARDADA_PASS`, ID e índice presentes, permisos `0600`. **Es un snapshot, NO un procedimiento de rollback validado**.
9. Valor digest objetivo consignado en plan: `sha256:68ae5fe5b64ca166704b746a9e8afcd385e36b3f569a5691401bf652d57b3748`. `IMAGE OK` en preparación. Verificar identidad si cambia el objetivo; no repetir pull por rutina.

## Rutas privadas en VPS (NO imprimir archivos completos)

- `/root/b1-traefik-upgrade/input/{container.json,image.json,dokploy-network.json,supabase-supabase-2bvnab.json}` (inspecciones).
- `/root/b1-traefik-upgrade/plan/{spec.json,01-prepare.sh,02-switch.sh,03-verify.sh,rollback.sh,traefik-standalone-upgrade.py}`.
- `/root/b1-traefik-upgrade/{prepared.ok,prepare.exit,prepare.log,canary.log,canary.rc,traefik-config.tar,traefik-config.tar.sha256,routers.before.json,smoke.tsv,dokploy-service-before.json}`.
- Estado de preparación: `/root/b1-traefik-upgrade` con modo `0700`; ficheros sensibles `0600`. No subir a Git.

## Pendientes y próximos pasos — sin inventar PASS

1. **Alineación de Dokploy con Traefik 3.7.17**: definir plan de cambio de `TRAEFIK_VERSION` con respaldo/restauración ejecutable, verificación del estado de réplica y de los cinco HTTPS. `docker service update --env-add TRAEFIK_VERSION=3.7.17 dokploy` **reinicia** tarea única (`stop-first`) y puede afectar panel: no ejecutarlo como comprobación inocua. Confirmar con propietario la ventana y autorización de interrupción.
2. Revisar `02-switch.sh` y `rollback.sh` para verificar estado de preparación, identificación del contenedor, tolerancia de direcciones ocupadas, política Dokploy y requisitos `B1_TRAEFIK_APPROVAL_REF`, `B1_TRAEFIK_VERSION_GUARD_ACK`. Preparar rollback probado a nivel de procedimiento, no ejecutar todavía. Prevenir cambios de configuración en paralelo.
3. Solo tras aprobación explícita de corte y pruebas de recuperación: conmutación Traefik 3.6.7 -> 3.7.17, validación automática de inventario, routers y cinco smoke, observación y revertir si falla. Evitar hacer actualizaciones Dokploy y Traefik simultáneamente.
4. Gate B1 separado: ForwardAuth mTLS e identidad/certificados, pruebas operacionales negativas, revisión independiente SHA específico, `AUTH-GATE-05`. NO activar B1 por el hecho de que Traefik quede actualizado.
5. PR #33 sigue draft y sin merge. No abrir PR duplicado ni tocar `staging`/`main` por accidente.

## Contrato del siguiente chat/operador

- Recuperar primero este documento y el runbook `B1-TRAEFIK-UPGRADE-RUNBOOK-20261104.md` de la rama actual; comparar SHA de la rama y PR #33 antes de actuar.
- Basar hechos del VPS en salidas arriba, no suponer acceso directo. Evitar pruebas cerradas, ciclos de diagnóstico repetidos y nuevas funciones sin defecto. Trabajar en español, comandos breves y seguros.
- Registrar en Git las decisiones/evidencias **sin datos privados** con alcance, SHA, origen y resultados. Los hechos nuevos requieren verificación; documentar FAIL/OPEN explícitamente.
- Si cambia código, ejecutar pruebas del módulo afectado y revisión; no repetir B1 PASS. Para operaciones en VPS, distinguir planificación read-only, reinicio Dokploy y corte Traefik; obtener autorización humana apropiada.

## Anexo — verificación Dokploy del 04-11-2026 (salidas aportadas por propietario)

**Alcance:** comprobaciones de solo lectura realizadas por el propietario en `srv1155120`, sin reinicios ni mutaciones; evidencia de conversación, no logs privados publicados. HEAD documental previo: `644c21bfc3c09178b8716fe802af210aed598da2`. Respaldo privado permanece exclusivamente en `/root/b1-traefik-upgrade/dokploy-service-before.json`.

- `BACKUP_JSON=PASS`; `SERVICE_ID_PRESENTE=True`; `VERSION_INDEX_PRESENTE=True`; `IMAGEN_PRESENTE=True`; `ROLLBACK_SPEC_PRESENTE=True`; `UPDATE_SPEC_PRESENTE=True`; 1 red y 3 montajes en el respaldo. `TRAEFIK_VERSION_BACKUP=NO_DEFINIDA`.
- Servicio actual: `SERVICE_ID_MATCH=True`; `IMAGEN_MATCH=True`; `VERSION_ACTUAL=703`; `VERSION_BACKUP=703`; `UPDATE_ORDER=stop-first`; `ROLLBACK_ORDER=stop-first`; `TRAEFIK_VERSION_ACTUAL=NO_DEFINIDA`; `ROLLBACK_CLI_DISPONIBLE=PASS`. `dokploy` reportó `1/1` réplicas. Hay una tarea histórica fallida de hace dos semanas, no una falla de la tarea vigente.
- **PASS:** integridad estructural del respaldo y coincidencia actual de identidad, imagen, versión de especificación y ausencia de variable. **PENDIENTE:** ejecutar y verificar rollback de la actualización futura. La presencia de `docker service rollback` no demuestra que se haya ejecutado ni que el estado anterior siga disponible después de futuras operaciones.

### Procedimiento acordado para la ventana (NO ejecutado; requiere autorización)

1. Congelar cambios concurrentes del servicio Dokploy. Registrar de forma privada la versión `703` y la especificación ya respaldada; inmediatamente antes de ejecutar, reconfirmar ID, imagen, réplica 1/1 y ausencia de `TRAEFIK_VERSION`. Abortarlo si hubo deriva.
2. **Con autorización específica para reiniciar la única réplica Dokploy**, ejecutar solo `docker service update --env-add TRAEFIK_VERSION=3.7.17 dokploy`. Es `stop-first` y puede interrumpir el panel. No conmutar Traefik en paralelo.
3. Verificar `docker service ps dokploy`, `docker service ls` (1/1), variable `TRAEFIK_VERSION` exacta, imagen y demás especificación esperadas; comprobar HTTPS del panel y las cinco rutas de `smoke.tsv` (baseline previa). No afirmar PASS hasta recibir salida efectiva.
4. Si la actualización del paso 2 falla y **no hubo cambios intermedios en Dokploy**, usar `docker service rollback dokploy` y verificar ID, imagen, configuración sin `TRAEFIK_VERSION`, 1/1 y HTTPS. El rollback es una operación disruptiva y requiere autorización. Como recuperación de contingencia, si no puede garantizarse el historial de Swarm, considerar `docker service update --env-rm TRAEFIK_VERSION dokploy` **solo tras contrastar la especificación completa** con el respaldo; también reinicia tarea. No reconstruir servicio a ciegas ni publicar JSON privado.
5. Mantener `B1_TRAEFIK_VERSION_GUARD_ACK` separado de aprobación de corte. Solo después del PASS Dokploy, bajo **otra aprobación de corte**, ejecutar `02-switch.sh`, `03-verify.sh` y rollback de Traefik conforme al runbook existente. `AUTH-GATE-05` permanece OPEN; no merge de PR #33.

**No se autorizó ni ejecutó** `docker service update`, `docker service rollback`, conmutación Traefik o activación B1. El rollback aquí documentado es un procedimiento condicionado, no un PASS operacional.

## Anexo — alineación efectiva Dokploy 3.7.17 (04-11-2026)

**Origen:** salidas del VPS `srv1155120` aportadas por el propietario; intervención autorizada explícitamente en conversación. Evidencia de alcance operativo, no sustituto de logs privados.

- Preflight: `PREFLIGHT_DOKPLOY=PASS` comparando ID, `Version.Index` y especificación completa con el respaldo existente antes del cambio.
- Operación autorizada ejecutada: `docker service update --detach=false --env-add TRAEFIK_VERSION=3.7.17 dokploy`. Salida: `overall progress: 1 out of 1 tasks`, `1/1: running`, `verify: Service dokploy converged`, `ACTUALIZACION_DOKPLOY_FINALIZADA`.
- Verificación posterior: `dokploy 1/1`; `TRAEFIK_VERSION=3.7.17` presente; `dokploy-traefik` continúa `IMAGE=traefik:v3.6.7 STATE=running`, contenedor ID `ebf3a3813a5bb52d2cbeb232ca4a18cc1bdf91140eead5477ef76e937f479c67`; tarea nueva `Running`, anterior `Shutdown` sin error informado.
- **PASS:** actualización y convergencia de servicio Dokploy, variable configurada y Traefik anterior en ejecución. **PENDIENTE:** smoke HTTPS de cinco rutas tras reinicio; comprobación previa a ventana de que no ha habido deriva y que guard `B1_TRAEFIK_VERSION_GUARD_ACK` es válido. **NO EJECUTADO:** rollback de Dokploy (no fue necesario), `02-switch.sh`, activación B1. `AUTH-GATE-05 OPEN`.
- **Recuperación:** usar rollback de Swarm solo ante fallo y tras confirmar ausencia de actualizaciones concurrentes; el rollback anterior no se ha ejercitado realmente. Mantener capturas privadas exclusivamente en VPS. La actualización de Dokploy no autoriza por sí sola corte Traefik.

## Anexo — smoke HTTPS posterior a actualización Dokploy (04-11-2026)

**Fuente:** salida del VPS aportada por el propietario tras configurar `TRAEFIK_VERSION=3.7.17` en Dokploy. Comprobación de solo lectura sobre `/root/b1-traefik-upgrade/smoke.tsv`, `curl --resolve <host>:443:127.0.0.1`, TLS verificado sin `-k`; el contenedor Traefik aún ejecuta `3.6.7`.

| HTTPS | Resultado |
|---|---|
| `cleanops.nuvurent.com/login` | PASS HTTP 200 |
| `cleanops.nuvurent.com/dev` | PASS HTTP 200 |
| `dokploy.nuvurent.com/` | PASS HTTP 200 |
| `espacore.nuvurent.com/` | PASS HTTP 200 |
| `jev.nuvurent.com/` | PASS HTTP 200 |

**`VERIFICADOS=5 FALLOS=0` — PASS.** Queda cerrada la verificación de disponibilidad HTTPS posterior a alineación Dokploy; no repetir sin cambio de estado. **Pendiente:** corte autorizado de Traefik, `03-verify.sh` tras ese corte, observación, cierre real de `AUTH-GATE-05` y revisión independiente. Esta evidencia no acredita el funcionamiento con Traefik 3.7.17.

## Anexo — preflight posterior a alineación Dokploy (04-11-2026)

**Origen:** salida de la ejecución de solo lectura del propietario en `srv1155120`. Sin conmutación ni prueba repetida. Alcance: existencia de `prepared.ok`, `02-switch.sh`, `03-verify.sh`, `rollback.sh`, `smoke.tsv`, sintaxis `bash -n` de los tres scripts, variable Dokploy y estado de Traefik original.

Resultados comunicados literalmente:
```text
SCRIPTS_Y_PREPARE=PASS
DOKPLOY_ALINEADO=PASS
TRAEFIK_ORIGINAL=PASS
PREFLIGHT_PREVIO_AL_CORTE=PASS
```

**PASS** para esos cuatro controles. **Límite:** esto no es un nuevo ensayo de recuperación ni una comprobación completa de deriva de redes/montajes; el procedimiento `02-switch.sh` debe conservar sus propias condiciones de parada. **OPEN:** conmutación de Traefik, `03-verify.sh` post-corte, observación y `AUTH-GATE-05`. No existe autorización de interrupción de Traefik en esta evidencia.

## Anexo — conmutación real Traefik 3.7.17 (04-11-2026)

**Fuente:** salida de consola suministrada por el propietario del VPS `srv1155120`, tras autorización explícita separada para la conmutación y rollback automático. No se suben artefactos privados. Alcance: reemplazo del contenedor Traefik standalone, no activación B1.

- Ejecución: `B1_TRAEFIK_APPROVAL_REF=owner-chat-20261104-traefik-3717`, `B1_TRAEFIK_VERSION_GUARD_ACK=yes`, `bash /root/b1-traefik-upgrade/plan/02-switch.sh` con estado preparado vigente y Dokploy previamente alineado. Salida `INICIANDO_CONMUTACION_TRAEFIK`.
- Liberación: `IP-CHECK: 10.0.1.11 is free`.
- Integridad: `AFTER PRESERVES PORTS/MOUNTS/NETWORKS/LOG/RESTART; image changed to the approved digest`.
- Comprobación del script: `VERIFY OK (dokploy-traefik)`; `SWITCH OK`; `SWITCH_EXIT=0`; `SWITCH_FINALIZADO`.
- Contenedor nuevo `dokploy-traefik` ID `5da638732423a8e664b8e917006584fe6be1aa2fb8fc58110eab64cd9bd8c5c7`, `IMAGE=traefik:v3.7.17@sha256:68ae5fe5b64ca166704b746a9e8afcd385e36b3f569a5691401bf652d57b3748`, `STATE=running`.
- Original conservado y detenido, sin reinicio automático: `dokploy-traefik-prev-20261104T164250Z`, `restart=no`. **No eliminar durante observación**; no se ha invocado rollback porque la conmutación pasó.

**PASS:** conmutación controlada y verificación integrada del plan (incluye las comprobaciones propias de `03-verify.sh` según el runbook). **PENDIENTE:** observación de disponibilidad/errores posterior al corte, confirmación del resultado agregado de cinco HTTPS en ventana de observación, decisión posterior sobre retención del contenedor previo y aceptación independiente de B1. Los resultados anteriores de `smoke.tsv` validaban Dokploy antes del corte; no sustituirlos por afirmaciones no observadas tras el corte. **OPEN:** `AUTH-GATE-05`; PR #33 permanece draft, no fusionado. No ejecutar nueva conmutación por rutina.

## Anexo — observación inmediata posterior al switch (04-11-2026)

**Fuente:** consola del VPS `srv1155120` comunicada por el propietario; comprobación de solo lectura, posterior a la conmutación real de Traefik standalone (sin rollback). La captura privada y los ficheros operativos permanecen solo en el VPS.

- `ESTADO=running`, `REINICIOS=0`; imagen `traefik:v3.7.17@sha256:68ae5fe5b64ca166704b746a9e8afcd385e36b3f569a5691401bf652d57b3748`.
- `cleanops.nuvurent.com/login`: PASS HTTP 200.
- `cleanops.nuvurent.com/dev`: PASS HTTP 200.
- `dokploy.nuvurent.com/`: PASS HTTP 200.
- `espacore.nuvurent.com/`: PASS HTTP 200.
- `jev.nuvurent.com/`: PASS HTTP 200.
- `HTTPS_VERIFICADOS=5 FALLOS=0`, con `curl --resolve` a loopback y TLS verificado sin `-k`.

**PASS:** salud inmediata del contenedor, cero reinicios al momento de la lectura y smoke HTTPS 5/5 con Traefik 3.7.17. **NO DEMOSTRADO:** salud sostenida durante la ventana de observación, renovación ACME futura y aceptación operacional B1. El contenedor previo `dokploy-traefik-prev-20261104T164250Z` debe permanecer detenido y disponible hasta decisión expresa; no se ha ejecutado rollback.

**Siguiente gate distinto:** `AUTH-GATE-05 OPEN`; recopilar únicamente evidencias pendientes de mTLS/ForwardAuth, custodia, identidad de correo y evaluación independiente por SHA. PR #33 sigue en draft, sin merge; no repetir pruebas marcadas PASS.

## Anexo — matriz de cierre AUTH-GATE-05 (04-11-2026)

**Alcance:** consolidación documental de GitHub tras el `SWITCH_EXIT=0` y smoke 5/5 PASS en Traefik 3.7.17. No se realizó nueva prueba de software ni acceso privado al VPS; no supone revisión independiente. Referencias: `B1-CLOSURE-EXECUTION-20261031.md`, `B1-DOKPLOY-RECONCILIATION-20261031.md`, `B1-VPS-EVIDENCE-REGISTER-20261031.md`, `B1-INGRESS-SQL-HARDENING-20261102.md`, `deploy/staging/openbao/B1-STAGING-INTEGRATION-GATE.md`, overlays ya existentes y PR #33.

### PASS que no deben repetirse sin nueva deriva
- Traefik standalone 3.7.17 por digest objetivo, conmutación y verificación integrada PASS, 0 reinicios y cinco HTTPS 200 tras corte. Infraestructura actualizada, **no ingreso B1 activo**.
- Baseline Dokploy: `TRAEFIK_VERSION=3.7.17`, servicio 1/1, respaldo original y actualización PASS. Script y procedimientos de Traefik ya revisados, no volver a ejecutar canario/sandbox/overlay.
- Evidencia histórica B1: primer administrador `COMMITTED`, imagen candidata aislada, loader del paquete privado y acceso del UID/GID 999 al Agent sink PASS en alcances delimitados. No constituyen prueba de despliegue del listener ni credenciales enroladas.
- En PR #33 se observaron 35 hilos resueltos y 17 revisiones de tipo COMMENTED (CodeRabbit y autor); **no consta APPROVED independiente** en el conjunto consultado.

### Bloqueos de aceptación y mínima evidencia pendiente
1. **Reconciliación de despliegue:** preparar un diff mínimo del Compose efectivo/imagen operativa contra overlay ya existente `deploy/staging/compose.b1-web.yaml`, preservando routers, /login, redes y OpenBao/PG. La web activa anterior no tenía montajes B1. Exigir huella/identidad del Compose actual antes de modificar; no sustituir archivos ni desplegar por merge del PR.
2. **Material mTLS y ForwardAuth reales:** identidad del certificado cliente Traefik, cadena CA, SAN de listener, permisos reales de rutas, pin de manifiesto (formato con dos puntos en mayúsculas), CIDR/alias `cleanops-b1-ingress`, `ingress.evidenceReference` auténtica; validar que plantilla con placeholders no se activa. Traefik actualizado remueve la barrera de versión, **no acredita** estos elementos.
3. **SQL0003/operator:** el registro de handoff 03/11 menciona SQL0002/0003 instaladas según recibos; en cambio `B1-CLOSURE-EXECUTION` y `B1-INGRESS-SQL-HARDENING` mantienen `0003` con `proposed:true`, pendiente de promoción e instalación. **Estado operativo SQL0003 = NO RECONCILIADO**, no marcar PASS ni afirmar ausencia. Resolver solo mediante recibo firmado/checksum/journal y metadata de roles/grants ya existentes (sin ejecutar SQL ni migraciones). No reabrir SQL14 ni primer actor. Operador de enrolamiento: identidad/custodia y autorización independientes, sin acceso del runtime a escrituras de credenciales.
4. **Seguridad y operación:** aprobación independiente de exactos hashes de SQL/Compose/manifest/TLS, procedimiento de recuperación de datos sin DROP destructivo, plan de configuración file-provider atómica y rollback; snapshot de identidad de email autorizado; pruebas negativas reales en ruta pública (headers falsificados/duplicados, cuerpo POST, límites, mTLS, replay/revocation, login/TOTP/sesiones, drenaje `B1_SHUTDOWN_COMPLETE`) **una sola vez, después de configurar y aprobar el entorno**.
5. **Aceptación final:** dictamen de reviewer distinto del autor en SHA preciso; aprobación de Product Owner para cambio de staging, pruebas PR006/PR007 y reconciliación de requisitos. `AUTH-GATE-05 OPEN`, PR #33 draft/no merge.

**Orden de trabajo:** (A) reconciliar evidencia de SQL0003 existente y Compose actual mediante metadata privada redactada, (B) obtener decisiones reales de certificados/custodia y paquete de aprobación independiente, (C) autorización expresa para cambios B1 y ventana separada, (D) desplegar deltas mínimos y ejecutar una sola aceptación operacional, (E) revisión independiente y cierre formal. No crear nuevas ramas, PR, agentes o componentes sin defecto probado.

## Anexo — reconciliación de manifiesto SQL0003 (04-11-2026)

**Fuente inmutable de código consultada:** rama `prep/b1-final-closure-20261102`; `scripts/trusted-migrations.mjs` blob `0d29d45d1cd77200b8ac83afccb550b345b5286f`, `scripts/migrate-postgres.mjs`, `db/migrations/0003_ingress_persistence.review.sql` blob `36171c3e48495c0112fc95ca2ccfffd18a9d768b`, `B1-OPERATOR-CHANNEL-CONTRACT-20261102.md`.

- `0002_first_actor` = `proposed:true` SHA256 `4868b8dcbfa473695179d61c2a451db53e83c0698f04b8409e87e4e12b18b5b6`.
- `0003_ingress_persistence` = `proposed:true` SHA256 `40c9a316a2f5d6d6317198eb178dc9244547524fd4c222efd886c4121090f4ca`.
- `loadTrustedMigrations(..., "b1")` excluye propuestas cuando `proposalsOnly=false`; el runner normal no aplicará estos dos archivos. **Este hecho de código no prueba ausencia o presencia de objetos SQL en la base real**. 0002 y primer administrador tienen antecedentes de COMMITTED: no reejecutar.
- El runner canónico utiliza `public._migrations` y exige para cada fila `id`, `checksum`, `profile`, `source_file`, `source_commit`, `runner_sha256`, `approval_reference`, `applied_by`, `applied_at`. Para SQL0003, primero consultar exclusivamente existencia del journal y fila `0003_ingress_persistence`, junto con existencia (sin contenido) de objetos/roles críticos. **Si no existe una fila, no inferir por sí sola que las tablas no existen; no ejecutar migración hasta reconciliar procedencia y autorización.**
- PENDIENTE — una única evidencia de solo lectura en VPS con nombres/estado de journal y comparativa local, sin revelar tokens, roles login, certificados, secretos ni valores personales. Cualquier ausencia de permisos se marca BLOCKED y se utiliza un canal DBA autorizado, no se improvisan credenciales.

**No se ha ejecutado SQL, no se ha cambiado código ni se declara PASS operativo.** `AUTH-GATE-05 OPEN`.

## Anexo — presencia real de objetos ingress en PostgreSQL (04-11-2026)

**Fuente:** ejecución de solo lectura por el propietario en el contenedor PostgreSQL de `srv1155120`, base `cleanops_staging`. La primera consulta histórica falló porque no existe un rol SQL llamado `postgres`; un intento con SQL pasado a través de comillas de shell falló por quoting. Ningún error alteró el esquema. La consulta final utilizó `POSTGRES_USER`/ `POSTGRES_DB` del contenedor y un heredoc SQL directamente en stdin, con `psql -X -q -A -t -w -v ON_ERROR_STOP=1`.

Resultados exactos:
```text
JOURNAL_PRESENTE=true
INGRESS_CLAIMS=true
INGRESS_CREDENTIALS=true
AUDITORIA_OPERADOR=true
ROL_OPERADOR=true
```

**PASS (presencia):** `public._migrations`, `identity_private.ingress_claims`, `identity_private.ingress_credentials`, `identity_private.ingress_operator_audit`, rol `cleanops_ingress_operator` existen en la base objetivo. **NO ACREDITADO:** fila de journal `0003_ingress_persistence`, checksum y origen aplicados; permisos efectivos, propietario de objetos, autorización independiente, canal de operador y aceptación funcional. La presencia de objetos no justifica una nueva instalación ni implica que sean de la revisión actual. Próximo control único: consultar exclusivamente el estado y comparación del checksum de `0003_ingress_persistence` en el journal, sin mostrar `approval_reference`, `applied_by` ni información personal. Ninguna mutación autorizada ni ejecutada.

## Anexo — verificación journal SQL0003 (04-11-2026)

Fuente: resultado de una consulta PostgreSQL de solo lectura realizada por el propietario: `SQL0003_JOURNAL=MATCH`.

La fila única del journal coincide con el checksum `40c9a316a2f5d6d6317198eb178dc9244547524fd4c222efd886c4121090f4ca`, el perfil `b1` y la ruta SQL0003 versionada. Este PASS no acredita por sí solo permisos efectivos ni revisión independiente. No se realizó ninguna migración. Conservar `AUTH-GATE-05 OPEN` y no reinstalar SQL0003.

## Anexo — metadatos de procedencia SQL0003 (04-11-2026)

Fuente: resultado de lectura PostgreSQL en `cleanops_staging` compartido por el propietario: `SQL0003_PROCEDENCIA=METADATOS_COMPLETOS`.

**PASS limitado:** la fila única de `0003_ingress_persistence` contiene `source_commit` con formato SHA-40, `runner_sha256` con formato SHA-256, `approval_reference` y `applied_by` no vacíos, además de `applied_at` presente. **No demuestra:** correspondencia del commit con los bytes realmente aplicados, autorización independiente válida, ni matriz efectiva de privilegios. No se ejecutó ninguna migración. Continuar con verificación puntual y no mutadora de ACL. `AUTH-GATE-05` permanece OPEN.

## Anexo — ACL de ejecución del operador B1 (04-11-2026)

**Fuente:** salida de consulta read-only en PostgreSQL `cleanops_staging` facilitada por el propietario, comparando `has_function_privilege('cleanops_ingress_operator', p.oid, 'EXECUTE')` con el modelo SQL0003. No se invocaron funciones ni se modificaron datos.

- `ingress_claim=PASS`; `ingress_credential_read=PASS`; `ingress_enroll=PASS`; `ingress_gc=PASS`; `ingress_recover=PASS`; `ingress_revoke=PASS`.
- **PASS limitado:** para cada uno de los seis nombres se encontró una función en `auth_api` y coincidió la capacidad de ejecución esperada: operador solo autorizado en enroll/revoke/recover, denegado en claim/read/gc.
- **Pendiente:** comprobar acceso de runtime y mantenimiento, propietarios/SECURITY DEFINER y acceso directo a las tres tablas, y revisión independiente. El uso de nombres y conteos no sustituye revisión de las firmas ni prueba funcional real. `AUTH-GATE-05 OPEN`. No reinstalar SQL0003.

## Anexo — ACL SQL0003, siete controles PASS

Fuente: comprobación de solo lectura en PostgreSQL, facilitada por el propietario. Funciones: cleanops_auth_maintenance PASS, cleanops_identity_service PASS, cleanops_ingress_operator PASS. Acceso directo a las tres tablas: cleanops_auth_maintenance PASS, cleanops_identity_service PASS, cleanops_ingress_operator PASS, cleanops_runtime PASS. Total 7/7 PASS en controles consultados. No se hicieron cambios ni se reejecutaron migraciones.

Pendiente: propiedad y configuración SECURITY DEFINER de funciones, aprobación independiente, integración B1 y AUTH-GATE-05 OPEN. Estos PASS no garantizan ausencia de privilegios por membresía no revisada.

## SQL0003: verificacion estructural

El propietario informo seis resultados PASS: ingress_claim, ingress_credential_read, ingress_enroll, ingress_gc, ingress_recover e ingress_revoke. La consulta read-only comprobo propietario cleanops_auth_broker, SECURITY DEFINER y search_path pg_catalog. Sin cambios de base de datos. AUTH-GATE-05 permanece abierto hasta aceptacion funcional independiente.

## Anexo — estado real web B1 tras actualización Traefik (04-11-2026)

Fuente: salida read-only del propietario del VPS: `cleanops360-f4fxmd-web-1` sigue `running` con imagen ID `sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290`; red `dokploy-network=PASS`; `/run/cleanops-agent=NO_MONTADO`; `/run/cleanops-b1-private=NO_MONTADO`; consulta por etiqueta `cleanops360-b1-candidate:cc51574a` devuelve `NO_ENCONTRADA`.

Interpretacion: web activa aun sin montajes B1. La etiqueta faltante no acredita perdida de la imagen por ID ni obliga a reconstruirla. El siguiente control unico sera inventario read-only de imagenes Docker por etiqueta/ID y de contenedor candidato, sin construir, etiquetar, desplegar ni tocar datos. SQL0003 mantiene PASS previos; AUTH-GATE-05 OPEN. No se autorizo activacion.

## Inventario Docker del candidato B1

Fuente: inventario Docker de solo lectura enviado por propietario el 04-11-2026. Imagen web operativa sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290. No se identifico etiqueta ni imagen B1 candidata en el inventario filtrado; contenedor web actual saludable y recursos PG/OpenBao/Agent activos. La inspeccion no demuestra ausencia en otros hosts ni en caches de construccion.

Referencia historica de imagen candidata: commit cc51574ad85485728d877efbbb69bcb345469596. Comparacion GitHub actual: rama de preparacion 33 commits posterior, sin divergence; hay cambios en overlay Compose, ejemplo Traefik, pruebas y documentacion, pero no en los archivos de runtime listados. Antes de generar o distribuir una nueva imagen fijar el SHA exacto de candidato y efectuar revision independiente de los deltas posteriores. No reconstruir automaticamente, desplegar ni modificar servidores por esta observacion. AUTH-GATE-05 OPEN.

## BuildKit sin cache disponible

El propietario informo builder default v0.27.1 operativo, cache BuildKit 0 B, checkout de produccion en d3ea84b38fd1574db1610f03b59c8c4a5050ac72 y arbol sin cambios. Imagen candidata B1 no disponible en inventario local. Proxima accion: preparar compilacion aislada desde el SHA revisado sin alterar el checkout. Activacion pendiente; AUTH-GATE-05 OPEN.

## Metadatos del paquete privado B1 comprobados

Resultado del propietario en VPS: directorio privado presente, UID 0, GID 999, modo 750; 20 archivos regulares encontrados a profundidad dos; installation.json UID 0, GID 999, modo 440, tamano 5243 bytes. Commit candidato cc51574ad85485728d877efbbb69bcb345469596 disponible en checkout local. Solo se consultaron metadatos; contenido e integridad del manifiesto, material mTLS y autorizaciones no acreditados por ello. Imagen B1 no encontrada y cache Docker 0 B segun inventarios previos. No repetir generacion de secretos ni pruebas PASS historicas. AUTH-GATE-05 OPEN.

## Imagen B1 recuperada - 04/11/2026

El propietario informo construccion aislada PASS desde commit cc51574ad85485728d877efbbb69bcb345469596. Imagen local cleanops360-b1-candidate:cc51574a con ID sha256:1db5df548b85f451f5eeec41959671aa1b983bffa687dae722c94571d5c20016, usuario 999:999 y etiqueta de revision coincidente. No se modificaron contenedores operativos. La imagen no esta desplegada y falta aceptacion mTLS/ForwardAuth. No repetir build. AUTH-GATE-05 OPEN.

## Inventario de referencias mTLS del manifiesto

Resultado de lectura privada ejecutada por propietario: MANIFIESTO_V2=PASS, REFERENCIA_EVIDENCIA=PENDIENTE, AUTORIZACION_TLS=PASS, PIN_PROXY_FORMATO=PASS, LISTENER_BINDING=PASS, LISTENER_PUERTO=PASS, FUENTE_CLIENTCA=PASS, FUENTE_TLSCERT=PASS, FUENTE_TLSKEY=PASS, FUENTE_SIGNINGKEY=PASS, FUENTE_PSEUDONYMKEY=PASS. Total 10/11. Se consulto presencia y formato, no coincidencia criptografica, certificados, contenido de fuentes ni referencia autorizada. El campo ingress.evidenceReference sigue vacio y requiere evidencia independiente real; no inventar valor, no modificar manifiesto ni activar. AUTH-GATE-05 OPEN.

## Validacion criptografica del listener TLS

El propietario reporto cuatro PASS de una inspeccion OpenSSL read-only del paquete privado: CLIENT_CA_VALIDA, LISTENER_CERT_VIGENTE, LISTENER_SAN_CORRECTO y LISTENER_CLAVE_COINCIDE. Resultado agregado TLS_LISTENER=PASS. La inspeccion comprobo CA:TRUE, vigencia temporal, DNS SAN del alias y coincidencia de claves publicas del certificado y la clave privada. No se expusieron claves ni certificados. Este resultado no acredita la cadena del servidor ante Traefik ni la identidad y el pin del certificado cliente de Traefik. Se mantienen pendientes la configuracion efectiva de ForwardAuth, referencia documental de evidencia y aprobacion independiente. AUTH-GATE-05 OPEN.

## Montajes actuales de Traefik — inspeccion 04/11

El propietario inspecciono el contenedor activo dokploy-traefik: estado running, tres montajes. Destinos: /etc/dokploy/traefik/dynamic (bind RW), /etc/traefik/traefik.yml (bind RW), /var/run/docker.sock (bind RO). No se observo montaje independiente de material cliente mTLS. Esto no demuestra ausencia de certificados dentro del directorio dinamico ni existencia de una configuracion B1. Ninguna alteracion ejecutada. Proximo control: inspeccion limitada a presencia de configuracion B1 en el directorio dinamico sin imprimir datos privados. AUTH-GATE-05 OPEN.

## Ausencia de B1 en el directorio dinamico de Traefik

Comprobacion de solo lectura comunicada por el propietario el 04/11/2026: cuatro configuraciones en directorio dinamico, cero referencias B1, cero referencias ForwardAuth, cero archivos de certificado y cero archivos de clave segun extensiones reconocidas; cero errores de lectura. La busqueda es limitada al directorio montado, no acredita ausencia de identidad cliente mTLS fuera de el. Traefik continua en ejecucion. No se han anadido archivos ni activado rutas. Siguiente gate: determinar si ya existe el certificado cliente del proxy cuyo SHA-256 coincide con el pin del manifiesto, y verificar cadena y permisos. No inventar ni sustituir la aprobacion de ingress.evidenceReference. AUTH-GATE-05 OPEN.

## Certificado cliente del proxy: pin no localizado

El propietario ejecuto un barrido de certificados limitado a los directorios privados de B1 y Traefik: CERTIFICADOS_CANDIDATOS_EXAMINADOS=7; CERTIFICADO_CLIENTE_PIN=NO_LOCALIZADO. Esto no demuestra ausencia global del certificado ni ausencia de un formato de archivo distinto; solo descarta una coincidencia entre los siete examinados. No se generaron certificados ni se modifico el manifiesto. Sigue pendiente identificar la custodia de identidad cliente real, demostrar la coincidencia de pin y CA, y registrar evidencia independiente antes de configurar ForwardAuth. AUTH-GATE-05 OPEN.

## Identidad cliente mTLS no localizada — búsqueda adicional

Fuente: comprobación de solo lectura en VPS comunicada por el propietario: `CERTIFICADOS_ADICIONALES=1`, `COINCIDENCIAS_PIN=0`, `BUSQUEDA_FINALIZADA`. El alcance adicional fue `/root`, `/etc/ssl`, `/etc/dokploy` y `/run`, con exclusiones previamente examinadas y extensiones de certificados habituales; no es demostración de ausencia universal. Sumado a la inspección anterior de siete candidatos, **no se ha identificado certificado cliente del proxy con la huella fijada en el manifiesto**. No reiterar barridos genéricos.

Decisión operativa pendiente: custodio de la CA que firmó `ingress.sources.clientCa`. Si su clave de firma permanece disponible bajo custodia autorizada, preparar una identidad de cliente específica para Traefik, con EKU clientAuth, par certificado-clave verificable, cadena al CA de confianza y actualización del pin bajo revisión independiente. Si esa autoridad no está disponible, la alternativa exige aprobar un CA de cliente nuevo y sustituir de forma coordinada la fuente de confianza del listener y el pin del certificado cliente, con rollback y evidencia. En ambos casos se requiere una `ingress.evidenceReference` **real**, revisión independiente del paquete/Compose/Traefik y autorización explícita antes de escribir material privado o activar la ruta. Prohibido reutilizar certificado público LE, credenciales de OpenBao o modificar manifiesto para forzar PASS. `AUTH-GATE-05 OPEN`.

## CSR cliente Traefik preparada — clave privada preservada

Fuente: terminal de propietario. `CLAVE_CLIENTE=PASS`, `CSR_CLIENTE=PASS`, `CLAVE_CSR_COINCIDEN=PASS`, `IDENTIDAD_PREPARADA=PASS`. Material nuevo limitado a `client.key` y `client.csr` en directorio privado `/root/cleanops-b1-traefik-client`; certificado no firmado ni instalado, no actualizado el pin, sin reiniciar servicios. Esta evidencia no autoriza la activacion. Se reutilizara la CA cifrada de Staging bajo custodia existente, sujeto a verificar que su certificado publico corresponda a `ingress.sources.clientCa` y a que la firma preserve clientAuth. No publicar clave privada ni contraseña. `AUTH-GATE-05 OPEN`.

## Corrección de custodia mTLS B1 — material localizado en historial (04-11-2026)

**Corrección del diagnóstico precedente (prevalece sobre la indicación de emitir una CA o certificado nuevo):** la búsqueda del 04/11 que arrojó `CA_STAGING_B1=NO_COINCIDEN` comparó el `clientCa` propio de B1 con `/etc/cleanops360-staging/openbao/tls/workload-ca.pem`. Son identidades de confianza distintas; no debe emplearse la CA de OpenBao para firmar un certificado presentado al listener B1.

**Evidencia histórica recuperada del propietario, sesión del 03/11/2026:** ya existe material mTLS específico para B1 en `/etc/cleanops360-staging/b1-ingress-pki`: `traefik-client.crt`, `traefik-client.key` y `server-ca.crt`. Se registró `B1_TLS_OWNER_AUTHORIZATION_OK` y `CERTIFICADO_TRAEFIK: PIN_COINCIDE_Y_VIGENTE` al comparar `traefik-client.crt` con `ingress.proxyCertificateSha256`; `server-ca.crt` verificó el certificado del listener con SAN `cleanops-b1-ingress`. Este directorio **NO estaba incluido** en los barridos posteriores de certificados; por tanto los ocho certificados examinados sin coincidencias **no desmienten** la identidad cliente ya preparada. No repetir esas pruebas PASS si los ficheros no cambiaron.

La nueva CSR temporal `/root/cleanops-b1-traefik-client/client.csr` y su clave **NO deben firmarse, instalarse ni sustituir los artefactos existentes** sin evidencia de fallo. No eliminar tampoco esos ficheros sin decisión expresa. El único control criptográfico específico aun sin PASS historico identificado es la correspondencia `traefik-client.key`↔`traefik-client.crt` y la verificación de su cadena frente a `ingress.sources.clientCa`, además del acceso real restringido para Traefik. `ingress.evidenceReference` sigue pendiente y debe tener una referencia auténtica con revisión independiente, no inventarse. Ningún despliegue/activación autorizado por esta corrección. `AUTH-GATE-05 OPEN`.

## Cierre verificado de cadena de confianza del cliente Traefik

**04/11/2026, fuente terminal del propietario:** `TRAEFIK_CLAVE_CERTIFICADO=PASS`, `TRAEFIK_CLAVE_PROTEGIDA=PASS`, `TRAEFIK_CLIENTE_CA_B1=PASS`. Control aplicado al certificado y clave EXISTENTES de `/etc/cleanops360-staging/b1-ingress-pki`, verificando (i) igualdad de claves publicas, (ii) archivo de clave root-only sin permisos de grupo/otros, (iii) verificacion `openssl verify -purpose sslclient` contra la CA de confianza `ingress.sources.clientCa` del manifiesto. El PIN del certificado ya se comparo y verifico en la evidencia historica del 03/11. **Identidad cliente mTLS: preparacion/compatibilidad criptografica cerrada, no repetir.** La nueva CSR del 04/11 no se usa ni se firma. No se publico clave, certificado ni huella.

**Estado pendiente de activacion, NO confundir con fallo de certificados:** el Docker Traefik sigue sin ForwardAuth configurado; el web actual sigue sin mounts B1 y usa imagen anterior. Para que el bootstrap de B1 arranque, `ingress.evidenceReference` debe ser un identificador REAL y autorizado de evidencia de topologia/TLS (hoy vacio), junto con la credencial de dispositivo emitida por un operador independiente, el routing/Compose aprobado y la revision del SHA exacto. `AUTH-GATE-05 OPEN`. No realizar reinicio/despliegue por mera existencia de estos PASS.

## Operador de ingreso configurado; emisión de dispositivo pendiente

Fuente: consulta read-only del propietario el 04/11/2026 en `cleanops_staging`, sin exponer IDs: `CREDENCIAL_B1=NO_ACTIVA` (no hay fila vigente `state=active` en `identity_private.ingress_credentials`); `OPERADOR_B1=CONFIGURADO` (existe al menos un rol LOGIN miembro de `cleanops_ingress_operator`). No implica que el login específico, contraseña u operador autorizado estén listos para ejecutar ni que exista un canal seguro de entrega de cookie.

**Recuperado del código EXISTENTE en el commit de imagen `cc51574a`:** `scripts/b1-private-operator.mjs` y `scripts/b1-private-operator-input.mjs` implementan `device.issue` y `device.revoke`, lectura del manifiesto privado, firma Ed25519, auditoría SQL y `result.json` sellado. No crear un nuevo CLI ni operador ni migraciones. Deben verificarse antes de emitir, mediante metadatos sin secretos: existencia del directorio root-only `/run/cleanops-b1-operator`, disponibilidad separada de `postgres.password` e `ingress-signing.pem` protegidos, ausencia de `result.json` anterior que obligaría recuperación, identidad de operator login y entrega segura por HTTPS de cookie HttpOnly. La emisión tiene caducidad; coordinarla con el cutover autorizado y no hacerla para superar un contador.

**Paralelo:** `ingress.evidenceReference` y aprobación independiente de red/Traefik/Compose siguen pendientes. La credencial activa no sustituye esos gates. `AUTH-GATE-05 OPEN`.

## Inventario de custodias del operador B1

**Resultado del propietario, 04/11/2026, inventario de SOLO LECTURA:** `DIRECTORIO_OPERADOR=PASS` (`/run/cleanops-b1-operator`, root:root 0700), `REQUEST_JSON=PENDIENTE`, `POSTGRES_PASSWORD=PASS` (archivo root:root 0400), `INGRESS-SIGNING_PEM=PENDIENTE`, `RECIBO_ANTERIOR=AUSENTE`. El operador LOGIN de PostgreSQL ya se reportó CONFIGURADO y no hay credencial de dispositivo activa. **No se debe duplicar usuario/SQL/CA/imagen ni expedir una credencial de corta duración antes de disponer del receptor y el cutover autorizados**. Preparar, si hace falta, una copia root-only de la clave Ed25519 ya custodiada en las fuentes del manifiesto, con verificación de identidad pública y sin imprimirla; completar la solicitud `device.issue` solo con la referencia de autorización auténtica para emisión y canal seguro de instalación de cookie. `AUTH-GATE-05 OPEN`.

## Custodia separada del firmante de dispositivo B1 — PASS

**Resultado del propietario, 04/11/2026:** `CLAVE_OPERADOR=PASS`, `ED25519=PASS`, `CLAVE_ORIGINAL=CONSERVADA`, `COPIA_OPERADOR=PROTEGIDA`, `PREPARACION=FINALIZADA`. Se preparó en el directorio privado del operador una copia root:root 0400 de la clave de firma Ed25519 existente, se comprobó la identidad de su clave pública con la original; no se emitió una credencial, no se creó un usuario o CA, no se modificó el manifiesto, PostgreSQL ni el servicio web. **NO repetir este paso** sin cambio o fallo demostrado. `request.json` aún no preparado y `result.json` ausente según último inventario; la emisión se coordina con la activación controlada y el receptor seguro de cookie para evitar caducidad. `ingress.evidenceReference`/ForwardAuth/Compose/revisión independiente siguen pendientes. AUTH-GATE-05 OPEN.
