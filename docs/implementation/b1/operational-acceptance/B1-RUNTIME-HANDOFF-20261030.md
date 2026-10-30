# B1 — Registro operativo de continuidad (30-10-2026)

> Estado: **INTEGRACION WEB PENDIENTE — NO CERRAR B1**.
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

## Pendientes REALES para cerrar B1 (orden y criterio de aceptación)

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
