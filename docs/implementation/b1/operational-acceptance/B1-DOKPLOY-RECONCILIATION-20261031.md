# B1 — Dokploy observed Compose reconciliation (2026-10-31)

**Read-only review; NO deployment authorization.** User-supplied Dokploy General screen and Preview Compose are the observed sources, not proof of the effective runtime/container spec.

## Observed Dokploy

Application `cleanops-staging`, GitHub `cleanops-360`, branch `staging`, Compose path `deploy/staging/compose.yaml`; trigger `On Push`, Autodeploy appears off. Do not assume `On Push` can never cause deployment; do not push changes to staging before exact authorization.

Preview includes `compose.openbao.yaml`; `web` on `private`, `dokploy-network` and `default`; Traefik routers `cleanops360-f4fxmd-15-web` / `cleanops360-f4fxmd-15-websecure`, HTTPS certresolver `letsencrypt`, `redirect-to-https@file`, routing `cleanops.nuvurent.com` to port 3000. The preview contains neither B1 private mounts nor ingress listener wiring nor ForwardAuth B1 routers.

Postgres preview includes existing `pgdata`, pinned image **variable** (not verified digest), TLS cert/key/CA and HBA bind mounts, password secret and startup options. This preview alone does NOT prove files, permissions, running image, TLS connection or SQL/ACL installation.

`compose.openbao.yaml` in GitHub is a **synthetic profile** `synthetic-custody`; inclusion alone does not establish that OpenBao is running, trusted, or available to runtime.

## Verified GitHub deltas

Remote `staging` at `d3ea84b38fd1574db1610f03b59c8c4a5050ac72`; preparation at `816ab8c96c571a3dc720b48683a07a37373ddc00` at time of read. GitHub comparison showed 128 commits ahead and zero behind at that time; no wholesale merge intended.

GitHub `staging` `deploy/staging/compose.yaml` blob `255f21e6974dd33c6fcb39d1e18775ad073049df` does NOT include the Traefik labels, `dokploy-network` and `default` web networks shown in Dokploy Preview Compose.

Preparation branch blob `37a198317a1a66fe00bb17211ced5ce01725b167` adds an Agent include, `web` identity volume and `identity_bao`, and required non-root build args. These are NOT present in the observed Dokploy preview and must NOT replace or remove operative networks and routers.

Separately prepared `deploy/staging/compose.b1-web.yaml` is a review overlay, not a replacement: it specifies a prebuilt image, mounts of private identity package and agent sink, and private network. These resources are NOT observed as running.

## Required reconciliation decision

1. **Freeze reference**: preserve the exact observed Dokploy Compose bytes/config, its source (UI overrides, patched checkout, or other) and fingerprint. Read-only evidence of actual container networks, image digest, mounts and TLS remains unknown.
2. **Web preservation**: keep HTTPS/HTTP routers, working `/login`, static content, `redirect-to-https@file`, `dokploy-network`, `default` and port 3000 until a verified diff proves an alternate minimal form.
3. **No silent Agent duplication**: do not include/create a second agent if pre-existing out-of-Compose runtime Agent is the owner of the sink.
4. **No blind network changes**: reconcile `private`, existing operational Bao/Agent network and availability of a dedicated listener network. Do not publish ingress/mTLS publicly.
5. **Only after approval** propose narrow B1 path matching and middlewares; require pinned peer cert, verified single-hop forwarded-header reconstruction, durable source and runtime startup/close coupling, approved SQL ACL and operator channel. This cannot be represented as just one unreviewed Traefik label.
6. Run `docker compose config` against **the effective preserved Compose plus precise approved additions** with redacted variables, then obtain independent security and owner approval before any mutating action.
7. Capture rollback as exact prior UI config, image digest, Compose checksum, volumes/networks and no-op restoration criteria; never recreate PG/OpenBao.

## Gate

Until effective runtime bytes and approvals are observed, `AUTH-GATE-05` stays OPEN. No changes to staging/main, VPS, Dokploy or SQL are approved by this review. Avoid repeated synthetic code changes or automatic merging of 128 commits.


## Handoff operativo validado — 03/11/2026 (sin activación)

Este anexo actualiza las observaciones de 31/10 y **no** sustituye el registro histórico. Fuente: comandos de solo lectura y pruebas aisladas ejecutados por el propietario en `srv1155120` y comunicados en la sesión del 03/11; no es revisión de un auditor independiente.

### Estado verificado sin repetir operaciones

- Web activa: `cleanops360-f4fxmd-web-1` `running/healthy`; imagen `sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290`; Docker Compose file `/etc/dokploy/compose/cleanops360-f4fxmd/code/deploy/staging/compose.yaml`; Git `d3ea84b38fd1574db1610f03b59c8c4a5050ac72`; Compose sha256 `03e2033c7c456b6eded20d68e8babe7af20596b14617f0a86d34997aa407578c` idéntico a Git HEAD. No montajes B1 ni código B1 en la imagen actual.
- Routers a preservar: `cleanops360-f4fxmd-15-web` (entrypoint `web`, middleware `redirect-to-https@file`) y `cleanops360-f4fxmd-15-websecure` (`websecure`, certresolver `letsencrypt`); red `dokploy-network`. SHA256 de sus reglas idénticas: `4e4556685ce29d2dfa8985e5bb3e525d9bb75ffd14aca90d35b7a4e3f6ebfca1`. Ruta `/login` HTTP 200.
- Primer administrador: `B1_FIRST_ADMINISTRATOR_COMMITTED_PASS`, con Aegis SHA-256; migraciones SQL0002/0003 instaladas según recibos oficiales. **No reejecutar ni resetear**.
- Imagen candidata construida con SHA `cc51574ad85485728d877efbbb69bcb345469596`: `cleanops360-b1-candidate:cc51574a`, `B1_ISOLATED_IMAGE_BUILD_PASS`, `B1_IMAGE_INSPECTION_PASS`. Montajes privados read-only en contenedor UID/GID 999:999: `B1_PRIVATE_MOUNTS_PASS`; cargador oficial `reviewedB1Installation()`: `B1_PRIVATE_LOADER_PASS`. No inicia el servidor ni prueba credenciales.
- OpenBao Agent existente: `cleanops360-f4fxmd-openbao-agent-1` UID 999, red `cleanops360_staging_custody`; volumen `cleanops360-f4fxmd_identity_agent_sink`, token modo 0600 en dir 0700, legible desde un segundo contenedor no-root con volumen de solo lectura: `TOKEN_COMPARTIDO=ACCESIBLE`. No duplicar Agent ni copiar token.
- Traefik: `dokploy-traefik` `traefik:v3.6.7` `running`; redes `dokploy-network`, `supabase-supabase-2bvnab`. Providers file/docker/swarm referenciados, directorio dinámico montado. Búsqueda en cinco archivos dinámicos: no identificó ForwardAuth, serversTransport, clientCertificates ni rootCAs; no demuestra ausencia universal.

### Corrección de auditoría criptográfica (revisión directa del contrato)

El manifiesto contiene `ingress.proxyCertificateSha256` con **95 caracteres hexadecimales separados por dos puntos**. Un preflight improvisado lo marcó `REVISAR` por exigir minúsculas sin separadores. **ESE PREFLIGHT ERA INCORRECTO PARA EL CÓDIGO REVISADO**: en `lib/b1/installation-config.ts`, `prepareB1IngressListenerPlan()` exige el patrón `/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/`. Por tanto, **NO NORMALIZAR NI CAMBIAR el pin de 95 caracteres**. El formato es compatible con el contrato; resta verificar la correspondencia real con el **certificado cliente mTLS de Traefik**, nunca con el certificado público Let's Encrypt. No mostrar claves ni huellas en logs/PR.

`ingress.evidenceReference` sigue pendiente: no inventar valor ni forzar un START. `tlsAuthorizationReference` presente no equivale a aceptación independiente documentada.

### Diseño de entrega versionada (sin configuración lateral permanente)

1. **Fuente de verdad:** rama de preparación Git para código, `deploy/staging/compose.b1-web.yaml` y `deploy/staging/traefik/b1-forward-auth.delta.example.yaml`. Este último es ejemplo **inactivo**, no fichero a copiar tal cual: contiene placeholders de certificado/servicio/puerto. No reemplazar `deploy/staging/compose.yaml` operativo ni integrar en `staging` con autodeploy activo.
2. **Overlay web:** reutilizar imagen candidata inmovilizada **por digest** después de verificarlo, preservar el Compose original/servicio/routers, añadir exclusivamente binds privados read-only y volumen `cleanops360-f4fxmd_identity_agent_sink` read-only, preservar redes web existentes y red de custodia requerida, sin servicio Agent duplicado. Evaluar explícitamente el acceso de la web a OpenBao, CA, PG TLS y los permisos de montaje; `B1_PRIVATE_LOADER_PASS` no prueba el arranque.
3. **ForwardAuth:** usar el provider file realmente habilitado por Traefik con YAML **versionado** y procedimiento de publicación atómico, con pre-validación y rollback. Reutilizar el router HTTPS original para `/login` y estáticos; router de prioridad superior únicamente para rutas B1. Verificar DNS alias de ingress y CIDR de interfaz única en `dokploy-network`; puerto interno sin publicar; certificado cliente Traefik válido y pin idéntico; certificado listener con SAN del alias; `trustForwardHeader: false` y sanitización de assertion con pruebas negativas, sin `insecureSkipVerify`.
4. **Gates antes de activación:** (a) paths reales de CA/certificado/key y permisos en el contenedor Traefik, (b) pin/propósito/SAN/CA comprobados sin exponer bytes, (c) referencia `evidenceReference` de aprobación verificable, (d) configuración Compose efectiva con etiquetas y redes preservadas, (e) revisión independiente del SHA exacto y pruebas de cabeceras/cuerpo/CSRF/sesiones/replay y revocación, (f) respaldo real y rollback, (g) autorización explícita del propietario para la ventana. La existencia de la cuenta inicial COMMITTED **no prueba** credencial de dispositivo de ingreso de Traefik; verificar su enrolamiento por canal autorizado.
5. **Entrega:** solo después de los gates, aplicar mediante procedimiento controlado de Dokploy, preservar `staging` hasta decisión explícita, comprobar `/login`, auth y rutas de rechazo; si hay error, retirar la configuración nueva y restaurar **exactamente** Compose+imagen+routers anteriores. No tocar PG/OpenBao volúmenes, SQL14 ni los usuarios creados.

**Estado actual:** `B1_PRIVATE_LOADER_PASS`, administrador `COMMITTED`, **listener mTLS / ForwardAuth / login web NO VALIDADOS**, `AUTH-GATE-05 OPEN`. No autoriza despliegue.


### Corrección funcional de entrega, 03/11/2026 — sin activación

La plantilla B1 ahora especifica `forwardAuth.preserveRequestMethod: true`. Traefik ForwardAuth reenvía `GET` por defecto cuando la opción es `false`; B1 vincula el método original al contexto firmado. Omitir este ajuste impediría la compatibilidad de operaciones `POST` como el login. Mantener `forwardBody: true` y `maxBodySize: 65536`; el límite del listener y los métodos se verificarán con pruebas positivas y negativas antes de activar. Referencia técnica: documentación de Traefik ForwardAuth v3.

El overlay de web existente `deploy/staging/compose.b1-web.yaml` fija `stop_signal: SIGTERM` y `stop_grace_period: 40s` para dar margen al cierre B1 de hasta 30 s. **No se ha comprobado aún que Next complete el drenaje antes de terminar**: aceptar solo cuando se observe `B1_SHUTDOWN_COMPLETE` en la prueba controlada.

**Estado del cambio Git:** rama `prep/b1-dokploy-traefik-handoff-20261103`; no fusionada y sin despliegue. **No es un Compose autosuficiente**: requiere el Compose operativo de Dokploy, red/alias de ingress aprobados, imagen fijada por digest, rutas y material TLS reales y una aplicación controlada. La plantilla Traefik conserva placeholders intencionales que prohíben activarla accidentalmente. El archivo operativo de staging y el contenedor actual no se modifican.

**Gates pendientes que no se sustituyen por estos commits:** análisis de seguridad de headers y ForwardAuth por reviewer independiente, procedencia del certificado cliente mTLS real del proxy, revisión de CA y SAN, acceso privado de Traefik al material, comparativa de fingerprint, `ingress.evidenceReference` genuina, plan de rollback completo, pruebas controladas y autorización explícita para activar.
