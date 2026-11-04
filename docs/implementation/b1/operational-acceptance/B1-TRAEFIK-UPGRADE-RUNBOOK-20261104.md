# B1 — Actualización de Traefik standalone bajo Dokploy: runbook (2026-11-04)

**Estado: PREPARADO, NO EJECUTADO. No autoriza ninguna operación sobre el VPS.** Sigue siendo válido el registro operativo de `B1-DOKPLOY-RECONCILIATION-20261031.md` (inventario, gates, `AUTH-GATE-05 OPEN`); aquí solo se añade la decisión de versión y el procedimiento. Activar B1/ForwardAuth es un paso posterior y separado.

## 1. Inventario confirmado por el propietario (no se re-audita)

Dokploy v0.30.10 sobre Swarm; **Traefik es un contenedor standalone** `dokploy-traefik`, imagen `traefik:v3.6.7`, `restart=always`, puertos `80/tcp`, `443/tcp`, `443/udp`, redes `dokploy-network` y `supabase-supabase-2bvnab`, montajes: configuración dinámica (RW), `traefik.yml` (RW) y socket Docker (RO), sin flags explícitos. Dokploy lo crea con `initializeStandaloneTraefik` (código de `v0.30.10`: nombre `dokploy-traefik`, `RestartPolicy always`, tres binds, red `dokploy-network`, sin `Cmd`; si existe lo elimina y recrea). **No se usa `docker service update`**: Traefik no es un servicio Swarm (esa variante es otra función de Dokploy).

## 2. Versión objetivo: **v3.7.17** (imagen por digest, nunca `latest`)

| Hecho | Fuente oficial (leída 2026-11-04) |
|---|---|
| 3.6: soporte activo terminó 07/05/2026, **soporte de seguridad terminó 16/08/2026**; 3.7 (05/05/2026) con ambos vigentes | `docs/content/deprecation/releases.md` del repositorio de Traefik |
| `traefik:v3.6.25` (31/07/2026), el valor por defecto de Dokploy `v0.30.10` (`TRAEFIK_VERSION`), **ya está fuera de soporte de seguridad** y la rama 3.6 no recibirá más correcciones | releases de Traefik; `traefik-setup.ts` de Dokploy |
| GHSA-6384-m2mw-rf54 (ForwardAuth, `X-Forwarded-Prefix`): afecta ≤ 3.6.13; corregido 3.6.14 / 3.7.0-rc.2 | aviso GHSA |
| **GHSA-hrpp-p4fc-wwf8** (ForwardAuth comparte el pool de conexiones con el servidor de auth; alta): afecta 3.0.0–3.7.15; **la rama 3.6 está EOL y no se corrige: mínimo v3.7.16** | aviso GHSA (21/10/2026) |
| GHSA-xv5x-242w-7hf7 (agotamiento de recursos con `Authorization: NTLM/Negotiate`; alta): afecta 3.7.14–3.7.16; **corregido en v3.7.17** (3.6 no afectado) | aviso GHSA (02/11/2026) |
| Última 3.7.x estable: **v3.7.17 (29–30/10/2026)**; no existe 3.7.18; 3.8 solo tiene `rc.1` | tags/releases de Traefik |

Conclusión: la opción «3.6.x» del handoff (p. ej. 3.6.25) **queda descartada**: no tiene soporte de seguridad y no corrige GHSA-hrpp, que afecta precisamente a ForwardAuth. v3.7.17 es la mínima versión soportada con todas las correcciones conocidas. Dokploy v0.30.10 no la declara probada (su valor por defecto es 3.6.25), por lo que la compatibilidad se verifica con el canario y las comprobaciones de este runbook, no se presupone.

### Evidencia en entorno aislado (binarios oficiales verificados por SHA-256, solo 127.0.0.1)
`python3 -I scripts/traefik-sandbox-check.py --traefik BIN` con la plantilla real `b1-forward-auth.delta.example.yaml`:
- **v3.7.17: PASS** — `X-Forwarded-Method` único con el método original; `X-Forwarded-Prefix`, `X-Real-Ip` y `Forwarded` falsificados no llegan al servidor de auth ni al backend; `X-Forwarded-For/Host/Uri` reconstruidos una vez; aserción falsificada del cliente descartada (el backend solo recibe la del emisor); **el cuerpo exacto llega al servidor de auth**; denegación bloquea el backend; cuerpo > 65536 rechazado (401); ruta pública no consulta el auth; sin errores ni avisos de deprecación en el arranque.
- **v3.6.7 (la actual): FALLA** — con `forwardBody: true` el servidor de auth recibe el cuerpo **vacío** (con o sin `preserveRequestMethod`), por lo que la aserción vinculada al cuerpo de B1 no podría validarse en ningún POST. La plantilla no es utilizable sin actualizar.
- Limitaciones: sin mTLS ni Docker/Swarm providers ni ACME; las cabeceras **duplicadas** (p. ej. `X-CSRF-Token` ×2) llegan al auth como dos valores y el adaptador B1 las rechaza (`headersDistinct`): sigue siendo obligatorio el test negativo con el proxy real.

## 3. Qué se conserva exactamente y cómo se comprueba

El generador `scripts/traefik-standalone-upgrade.py` (offline, no ejecuta Docker) lee el `docker inspect` capturado y **se niega a generar nada** si algo difiere del inventario (puertos y bindings, tres montajes con su RW/RO, redes, alias, IP estática, `Cmd`/`Entrypoint`, variables de entorno o etiquetas extra —solo nombres, nunca valores—, HostConfig no estándar, tag distinto de 3.6.7, destino fuera de 3.7.x ≥ 3.7.17 o sin digest). El contenedor nuevo se crea con exactamente esa especificación; solo cambia la imagen. `--mount` (no `-v`) impide crear rutas inexistentes.

## 4. Requisitos humanos previos (bloquean la ejecución real)
1. **Digest `sha256` del índice de `traefik:v3.7.17`**, leído por el propietario del registro oficial y anotado con fecha; no se infiere (esta sesión no puede consultar el registro).
2. **Capturas read-only** del VPS, guardadas en un directorio privado `0700`: `docker inspect dokploy-traefik`, `docker image inspect <imagen actual>` y `docker network inspect` de las dos redes. Contienen valores de entorno: no se pegan en chats ni en Git.
3. **Autorización escrita y ventana**: la conmutación corta 80/443 (segundos a pocos minutos) para todos los servicios, incluido Supabase. Referencia de aprobación → `B1_TRAEFIK_APPROVAL_REF`.
4. **Alinear Dokploy**: con `TRAEFIK_VERSION` por defecto 3.6.25, cualquier acción del panel que recree Traefik (cambio de puertos, «reload», etc.) **revertiría a 3.6.25** (EOL). Antes de conmutar, el propietario debe fijar `TRAEFIK_VERSION=3.7.17` en el entorno del servicio `dokploy` o comprometerse a no usar esas acciones; se confirma con `B1_TRAEFIK_VERSION_GUARD_ACK=yes`. (Es un cambio sobre el servicio Dokploy, no sobre Traefik, y es decisión del propietario.)
5. **`smoke.tsv`** (`host<TAB>ruta<TAB>estado esperado`) con las URLs de **todos** los servicios servidos (CleanOps `/login`, Supabase y otros).
6. **Contradicción a resolver**: el inventario dice socket Docker RO; el código de Dokploy lo monta sin `:ro`. El plan **se niega** si `docker inspect` muestra RW; el propietario debe confirmar el estado real.
7. **Revisión de directivas de 3.7** en la configuración dinámica real (lectura): `basicAuth` con `users` vacío (3.7.3), `stripPrefix*` (devuelve 400 si la normalización difiere), uso de `CONNECT` o `Upgrade: h2c` (3.7.13/15), matcher `Host(\`*\`)`, cabeceras con guion bajo (`aliasHeadersStrategy`), más de 500 valores de cabecera (431). El canario solo comprueba que la configuración **se carga**, no el comportamiento.
8. Docker Engine con API ≥ 1.40 (el script lo comprueba y se niega).
9. Revisión independiente y autorización explícita antes de la ventana. **No cierra `AUTH-GATE-05`.**

## 5. Procedimiento (generar → revisar → ejecutar)
```bash
# En una copia de trabajo (nunca en el VPS con secretos); las capturas son privadas.
python3 -I scripts/traefik-standalone-upgrade.py plan \
  --container capturas/container.json --image capturas/image.json \
  --network capturas/dokploy-network.json capturas/supabase-supabase-2bvnab.json \
  --target-version 3.7.17 --target-digest sha256:<DIGEST_ANOTADO> --out plan/
# Revisar plan/spec.json y plan/*.sh; copiarlos con scripts/traefik-standalone-upgrade.py al VPS.
export B1_TRAEFIK_STATE_DIR=/root/b1-traefik-upgrade   # absoluto, 0700, fuera del repositorio
bash plan/01-prepare.sh     # SIN cambios: verifica deriva, API, respaldo privado, pull, canario aislado
# Solo con aprobación y dentro de la ventana:
B1_TRAEFIK_APPROVAL_REF=<ref> B1_TRAEFIK_VERSION_GUARD_ACK=yes bash plan/02-switch.sh
bash plan/03-verify.sh      # solo lectura; repetible
```
- `01-prepare.sh`: compara la identidad (Id/imagen) con el plan, comprueba API Docker, respaldo `tar` privado (`0600`) de `traefik.yml` y del directorio dinámico —incluye `acme.json`, nunca se imprime ni se copia—, línea base de routers desde la API loopback, `docker pull` por digest, **canario** (`--network none`, solo lectura, sin socket, sin puertos) que carga la configuración real con el binario nuevo; los errores de proveedores Docker/Swarm/ACME esperables sin red se toleran, cualquier error de configuración aborta.
- `02-switch.sh`: `docker stop -t 30` → `restart=no` → renombra el antiguo a `dokploy-traefik-prev-<UTC>` (se conserva parado) → `docker create` con la especificación idéntica (red primaria `dokploy-network`) → `docker network connect supabase-supabase-2bvnab` **antes** de arrancar → `start` → espera estabilidad (5 comprobaciones sin reinicios) → `03-verify.sh`. Cualquier fallo dispara **rollback automático**.
- `03-verify.sh`: `docker inspect` del nuevo contenedor frente al plan (mismos puertos, montajes con su RW/RO, redes, `restart=always`, imagen = digest aprobado), **mismos routers** (nombre, regla, entrypoints, servicio, middlewares, TLS, prioridad) y todas las URLs de `smoke.tsv`.

## 6. Observación y rollback
- Observar al menos el tiempo acordado (renovación ACME, Supabase, CleanOps, métricas de errores 5xx). El contenedor `dokploy-traefik-prev-*` **no se elimina** sin decisión expresa posterior; ocupa solo espacio y no arranca solo.
- **Rollback** (`bash plan/rollback.sh`, automático ante fallo): detiene el candidato y lo renombra `-failed-<UTC>` (se conserva para análisis, `restart=no`), devuelve el nombre original al contenedor previo (mismo Id e imagen `sha256:…`), `restart=always`, lo arranca y lo verifica con el modo `before`. **No reescribe la configuración** (Dokploy puede haber escrito cambios válidos); solo comprueba la integridad del respaldo e informa. Restaurar archivos desde el `tar` es una decisión manual.
- Si los scripts no pudieran ejecutarse: `docker stop dokploy-traefik; docker rename dokploy-traefik dokploy-traefik-failed; docker rename dokploy-traefik-prev-<UTC> dokploy-traefik; docker update --restart=always dokploy-traefik; docker start dokploy-traefik`.
- Criterio de aborto antes de conmutar: cualquier `REFUSED`, canario con errores, drift de Id, smoke sin definir.

## 7. Pruebas realizadas (aisladas; sin VPS, secretos ni Docker real)
- `tests/static/test_traefik_standalone_upgrade.py` (12 pruebas, `docker` simulado en `tests/static/shim_docker.py`): generación de scripts revisables sin `service update`/`rm`/`prune`/`-v`; **rechazo** ante cualquier deriva del inventario, variables extra (solo nombres), destino 3.6.x/3.8/`latest`/sin digest; `prepare` sin mutaciones y respaldo privado; `switch` exige aprobación, confirmación de alineación con Dokploy y `prepare`; conmutación exitosa que conserva puertos/montajes/redes/restart y deja el previo parado; **rollback automático** tanto si el candidato no arranca como si cambian los routers.
- `scripts/traefik-sandbox-check.py` + `tests/static/test_traefik_sandbox.py` (con `TRAEFIK_BIN_TARGET`): invariantes de ForwardAuth con Traefik v3.7.17 real (resultados en §2).
- **No probado** (requiere el VPS): carga de la configuración real, compatibilidad con los providers Docker/Swarm de Dokploy y Supabase, ACME real, mTLS con el certificado cliente real.
