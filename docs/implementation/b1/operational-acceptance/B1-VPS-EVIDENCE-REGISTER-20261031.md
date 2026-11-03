# Registro único de evidencias VPS y B1 — 31/10/2026 (anexo GitHub 02/11/2026)

**Propósito:** evitar pedir otra vez comprobaciones ya realizadas. Fuente de verdad de qué está probado, cuándo, sobre qué entorno y qué NO demuestra. No repetir una prueba PASS mientras no cambien sus bytes, configuración, credenciales, dependencias o topología relevantes. Ningún hallazgo de inventario sustituye la aceptación funcional.

## Evidencia capturada directamente en VPS (SSH solo lectura)

**INV-01, 2026-10-31 20:45:06 UTC** — informe aportado por el propietario `cleanops-b1-informe.txt` (162 líneas). Herramienta: auditoría Bash/SSH de solo lectura, sin contenido de secretos, logs ni variables de entorno.

| Comprobación | Resultado observado |
|---|---|
| Servidor / kernel | `srv1155120`, Linux 6.8.0-147-generic |
| Disco | 96 GiB, 19 GiB utilizados, 78 GiB libres (19%) |
| Docker / containerd | systemd active; Docker cliente/servidor 29.2.1 |
| Docker Swarm | active, control=true |
| Servicio systemd Traefik | inactive **NO es fallo**: Traefik está desplegado como contenedor |
| `dokploy-traefik` | running, traefik:v3.6.7, puertos 80/443 TCP y 443 UDP publicados |
| `dokploy` | healthy, versión 0.30.10, puerto 3000 publicado |
| `cleanops360-f4fxmd-web-1` | running, healthy; puerto interno 3000; **sin montajes Docker** |
| `cleanops360-f4fxmd-postgres-1` | running, healthy, postgres:16-bookworm, 5432 interno; certificados TLS, CA, HBA y password bootstrap montados |
| `cleanops360-f4fxmd-openbao-1` | running, healthy; config, datos, auditoría y TLS montados |
| `cleanops360-f4fxmd-openbao-agent-1` | running, sin healthcheck Docker; sink en `/run/cleanops-agent`, config y TLS montados |
| Redes | `cleanops360-f4fxmd_default`, `cleanops360_staging_custody`, `cleanops360_staging_private`, `dokploy-network` existentes |
| Volúmenes | `cleanops360-f4fxmd_identity_agent_sink`, `cleanops360_staging_baodata`, `cleanops360_staging_baoaudit`, `cleanops360_staging_pgdata` existentes |
| Puertos escucha | 22, 80, 443, 3000, Swarm 2377 y 7946; Redis 6379 en loopback |

**INV-02, 2026-10-31 20:48:53 UTC** — segundo informe del propietario `cleanops-b1-informe(1).txt` (28 líneas), auditoría focalizada SSH solo lectura.

| Comprobación | Resultado observado |
|---|---|
| Web image | `sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290`; imagen creada `2026-10-20T14:30:31Z`; user=`cleanops`; restart=`unless-stopped` |
| Redes web | `cleanops360-f4fxmd_default`, `cleanops360_staging_private`, `dokploy-network` |
| Agent | volumen `cleanops360-f4fxmd_identity_agent_sink` montado en `/run/cleanops-agent` |
| Directorio privado host | `/run/cleanops-b1-private` **absent** al momento del inventario; NO prueba ausencia en todas las demás rutas |
| Compose efectivo en host | `/etc/dokploy/compose/cleanops360-f4fxmd/code/deploy/staging/compose.yaml` existe, root:root, modo 0644; **contenido/hash aún no inspeccionado** |
| Traefik | `dokploy-traefik` running, v3.6.7 |

**Hallazgo conjunto probado:** la web no tiene montajes Docker y no recibe el sink del Agent mediante dicho montaje. La presencia del paquete privado B1 dentro de la imagen no fue inspeccionada: no inferir su ausencia sin revisar imagen y arranque. No crear un segundo Agent ni sustituir Compose.

## Evidencia anterior documentada (NO repetir por rutina)

Las siguientes son evidencias registradas por propietario/historial, no reejecutadas ni medidas en estas dos auditorías SSH. Conservar la precisión del alcance:

- SQL14: propietario informó `Instalación inicial SQL14: PASS` y `Historial b1_sql14 y checksum/procedencia: PASS`. No reejecutar SQL14 ni recrear esquema sin comprobar metadatos previos.
- Ensayo sintético `AUD-031`: ejecución FIXED1 intento 1 aprobada manualmente por el propietario; resultado posterior `PASS` comunicado. No fue instalación SQL ni despliegue.
- B1 en rama de preparación: TypeScript PASS, ESLint PASS, `tests/b1/private-runtime.test.ts` 6/6 PASS; `tests/b1/ingress-private-v2.test.ts` 2/2 PASS según propietario.
- PostgreSQL 16 **desechable**, propuesta SQL de ingreso: ACL 10/10 PASS. **NO equivale a SQL aplicado ni probado en PG real de staging**.
- Issuer / ForwardAuth / mTLS: pruebas focalizadas PASS informadas, **NO equivalen a aceptación en Traefik real**.
- Inventario operacional anterior: PG/TLS, OpenBao 2.7.2 mTLS, Agent comprobados en trabajos previos. La auditoría SSH nueva confirma presencia/health/montajes, pero no lee secretos ni demuestra handshakes TLS ni transacciones.
- Preparación GitHub: `prep/staging-runtime-custody-01` SHA `19fa374314965729c627a83a7ecef739b27968e8` y `prep/runtime-agent-saved-20261030` SHA `34a425e0129236d79de5f213e8fda47257a6298b` publicados sin PR ni workflows activados, según historial. No confundir con un despliegue.
- R3 previamente fusionado en main, según historial del proyecto; no volver a ejecutar su cierre por iniciar B1.

## Estado de GitHub y decisiones de B1

### Anexo GitHub — 02/11/2026 (no sustituye los inventarios VPS del 31/10)

- Rama histórica: `prep/b1-persistence-recovered-20261031`. Candidato del PR #33 verificado: `prep/b1-final-closure-20261102`, commit `b81a602eec93fc7fac755d0b8a7bf0c3fe311039`, base `staging` `d3ea84b38fd1574db1610f03b59c8c4a5050ac72`. Los datos operativos INV-01/INV-02 conservan su fecha 31/10; las siguientes referencias de código son del candidato GitHub, no pruebas de despliegue.
- Web overlay existente: `deploy/staging/compose.b1-web.yaml`; NO aplicarlo sin reconciliar con Compose efectivo de Dokploy.
- Inicio del runtime: `instrumentation.ts` llama `startTrustedB1Server(installation)`, que arranca el listener mTLS a partir del bloque `ingress` del manifiesto v2.
- Listener: `lib/b1/ingress-listener.ts` se arranca y se cierra desde `startTrustedB1Server`; no desplegado (faltan certificados reales, pin del proxy y ForwardAuth de Traefik).
- `lib/b1/reviewed-site-installation.ts`: cambio `df3733e99ba115098d12fa1aaa4c6b1e13ab48dd` exige manifiesto v2 y binder persistente; no certificado con suite nueva.
- Actualización del 02/11/2026: SQL `db/migrations/0003_ingress_persistence.review.sql` (propuesta `proposed:true` en el manifiesto de migraciones, hash fijado, NO ejecutable ni instalado; S-1/S-2/S-3 resueltos en local el 02/11/2026, ver B1-INGRESS-SQL-HARDENING-20261102.md) permanece propuesta, no afirmar instalado. 02/11/2026: añade rol operador NOLOGIN, auditoría y referencia de autorización (D1); nuevo sha256 `40c9a316a2f5d6d6317198eb178dc9244547524fd4c222efd886c4121090f4ca`; las pruebas PG16 desechables previas del archivo anterior ya no equivalen a este hash (reejecutadas, ver B1-INGRESS-SQL-HARDENING).
- `AUTH-GATE-05`: **OPEN** hasta recepción de aprobación y aceptación funcional de staging.

## Regla anti-repetición para cualquier nuevo chat o agente

1. **Leer este registro primero** y el registro consolidado `B1-CLOSURE-EXECUTION-20261031.md`.
2. No pedir nuevamente inventario general, validación de existencia de PG/OpenBao/Agent/volúmenes, SQL14, AUD-031 ni repetir tests PASS con código idéntico.
3. Solo volver a verificar el atributo concreto que pudiera haber cambiado; explicar causa y alcance. Para una **activación**, son verificaciones nuevas: contenido/hash Compose, configuración de ForwardAuth, permisos reales privados/SQL de ingreso, paquete privado, mTLS real, operaciones login/TOTP/sesiones y rollback.
4. No inferir configuración instalada por código en GitHub; no declarar PASS operativo por un test sintético.
5. Nunca mostrar, subir a GitHub o registrar secretos, claves privadas, tokens ni contenido personal.
6. No cambiar VPS, SQL, certs, staging ni main sin autorización explícita específica. Conservar servicios y datos existentes.


## Actualización operativa posterior — 03/11/2026

**Consultar primero el [registro incremental de staging del 03/11/2026](./B1-STAGING-OPERATIONS-20261103.md).** Los datos del inventario de 31/10 y el anexo del 02/11 representan el estado de aquellos días; no eliminarlos ni tratarlos como estado actual si existe una evidencia posterior.

- **SQL14, SQL0002 y SQL0003:** instalaciones en staging reportadas PASS por el propietario. SQL0002/0003 mediante runner oficial, con `B1_SQL0002_0003_APPLIED`, `B1_MIGRATIONS_COMPLETE_PASS`; **no repetir SQL**, no equiparar con merge de PR #34.
- **Primer administrador B1:** generación 3 `PREPARED` → `CONFIRMED` (Aegis SHA-256) → **`COMMITTED`**, con `B1_FIRST_ADMINISTRATOR_COMMITTED_PASS` y recibo privado sellado; generaciones 1/2 terminadas por `ABORTED` y conservadas como historial. **No repetir prepare, confirm ni commit**.
- **No cerrados por ese PASS:** login real web, despliegue Next/B1, Traefik ForwardAuth/mTLS, aceptación independiente PR006/PR007 y **AUTH-GATE-05 OPEN**.
- **Custodia:** recibos y material de recuperación siguen en rutas privadas `/run`, no en GitHub. No publicar secretos ni hacer copias improvisadas.

La evidencia procede de salidas de terminal del propietario, no de una nueva lectura independiente del VPS por este anexo.
