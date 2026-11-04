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
