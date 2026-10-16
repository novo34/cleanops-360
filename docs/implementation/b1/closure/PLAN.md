# B1 — plan vinculante de completitud, decisiones y autorizaciones

Estado: B1 OPEN, AUTH-GATE-05 OPEN, closedBackend. Base a8ccc63fcceb7438d25f5ac2b35592b83b4a4338.
El propietario acepta únicamente el incremento frontend en su alcance simulado y prohíbe
trasladar trabajo/deuda B1 para cerrar la fase. Este documento registra esa instrucción;
no aprueba SQL, grants, despliegues, merge, claves, proveedor ni autenticación real.

## 1. Matriz y autoridad

[MATRIX.md](MATRIX.md) y [requirements.json](requirements.json) conservan por separado
implementación, integración real, pruebas y aceptación: 44 REQ SRS referenciados por
AUTHENTICATION_SPEC, 14 operaciones HTTP efectivas, 26 casos V4 y controles de operación.
No se usa una media/porcentaje para ocultar una obligación abierta. El inventario operativo
de infraestructura cubre los activos de Auth, sin atribuir cumplimiento a otros dominios.

Fuentes primarias: SRS REQ-AUTH/ AUTHZ/ TEN/ SEC-020/021/ AUD-001/ PR-006/007,
Product Master §§73–79, 98, 122–128, roadmap fase 1, DELIVERY_PLAYBOOK y gates Auth.
V4 HTTP/IMPLEMENTATION_SLICE/POSTGRESQL_RLS/test-cases y adenda H1-H3 concretan el slice.
B1-X y D1 se aprobaron para código/pruebas sin DB; sus archivos históricos siguen intactos.
Los APPROVED_FUNCTIONAL_NOT_ACTIVE B1-SELF-01..08 no requieren reaprobar semántica,
pero tampoco autorizan instalar bindings operativos ni administración ajena.

### Conflictos que requieren resolución explícita antes de contratar lo afectado

- **C-SCOPE:** IMPLEMENTATION_SLICE excluye reset ajeno, pérdida total y administración;
  SECURITY_VALUES marca trusted_device como DEFERRED B1. SRS AUTH-034/046, gates Auth-03
  y roadmap fase 1 (UI recovery/reset) exigen esas capacidades Auth. AUTHENTICATION_SPEC
  también referencia AUTHZ-001..007, pero roadmap fase 2 sitúa Manage Access allí y V4
  solo permite ocho reglas propias. No se puede afirmar simultáneamente que están
  satisfechas y que esas APIs no existen.
  **Recomendación para aprobación:** publicar un addendum B1 de completitud que incorpore
  reset/recuperación, trusted device y los requisitos AUTHZ trazados, incluido Manage Access,
  con contratos/grants administrativos separados. Esto es una propuesta explícita de
  conciliación del límite fase 1/fase 2, no una modificación silenciosa del roadmap.
  La nueva instrucción impide usar el aplazamiento histórico como justificación de cierre.
  Hasta resolverlo, esas filas permanecen bloqueantes; no se propone eliminarlas.
- **C-LOGIN:** SRS AUTH-002 admite política MFA configurable para empleados operativos;
  V4 conserva MFA obligatorio para todos y service.ts y frontend rechazan ACTIVE en login.
  **Recomendación:** addendum mínimo que permita ACTIVE de login únicamente bajo política
  OPERATIONAL explícita del tenant, derivada y revalidada en servidor, nunca para sensibles,
  dispositivo no verificado o acción sensible. Mantener step-up obligatorio y permisos
  reevaluados. Requiere revisar juntos SQL emisor, HTTP y UI; no quitar guardas ahora.
  No se ofrece un bypass temporal ni se considera el modo opcional ya implementado.

Resolver estos conflictos no es reabrir las 26 decisiones de producto: aplica la jerarquía
normativa y solicita aprobación de cambios concretos de contrato/alcance allí donde chocan.
No iniciar CRUD administrativo por el nombre de rol ni heredar poderes B1-SELF.

## 2. Decisiones D1–D4: alternativas y recomendación

| Decisión | Aprobado / existente | Alternativas concretas | Recomendación / evidencia exigida para cerrarla |
|---|---|---|---|
| D1-CONTRACT-ACL | Código y pruebas sin DB, SQL blob 6454a7551e61e5857ef39090b24b93fcbdb03bb1 y matrix 50590047d35467b2473945731384ae3da5729f28 | Ensayar el paquete exacto en PostgreSQL aislado; o rediseñar la frontera de locks/privilegios antes de instalarlo | Ensayar el paquete exacto: evita cambiar contratos ya integrados. Aprobación pendiente SOLO de ejecución/ACL reales, no repetir aprobación TS. Compilación, SET ROLE, catálogo, RLS, locks y carreras deben pasar. Column UPDATE permite UPDATE real, no solo locks: aceptar ese alcance residual o pedir rediseño. D1 no cierra por documentación. |
| D2-ENVELOPE-KEYS | Envelope v2 AES-256-GCM, helpers y pruebas; no custodia | OpenBao autoalojado en infraestructura suiza; HashiCorp Vault autoalojado en infraestructura suiza; KMS gestionado por un proveedor REAL identificado por el propietario con evidencia equivalente | OpenBao separado lógicamente del verificador/worker sobre la topología aprobada, respaldado en ubicación suiza independiente; software real, no servicio contratado supuesto. Nombrar custodio y host/región/backup/soporte reales antes de usarlo. Claves por tenant+propósito, IDs inmutables, acceso por workload, doble control de recuperación. Deben pasar resolver, rotación CAS, restore y falta/compromiso de claves. |
| D3-TOTP-POLICY | OTPAuth, vectores y candidato SHA256/32 bytes/issuer; no apps reales | SHA256 + 32 bytes CSPRNG + issuer CleanOps 360; o política explícita SHA1 compatible con apps requeridas y secreto dimensionado conforme RFC6238 | Preferir candidato SHA256/32 bytes/issuer CleanOps 360, condicionado a probar las apps/versiones que se anuncien como soportadas. Si una app obligatoria falla, decidir la política ANTES de habilitar enrolamiento, sin downgrade automático. Periodo30/dígitos6/ventana±1 conservan estado de ensayo V4, no se promueven silenciosamente a producción. |
| D4-EMAIL-DELIVERY | Solo plan de retry/dedup aislado; EMAIL cerrado | Postfix autoalojado en VPS suizo autorizado con relay/recepción y reputación verificados; o SMTP transaccional real del tenant/proveedor identificado y autorizado | Usar la cuenta SMTP transaccional REAL autorizada por tenant si ya existe y cumple residencia/seguridad; si no existe, provisionar Postfix suizo y demostrar entregabilidad. No inventar host/cuenta/remitente/proveedor. Ensayar primero contra Mailpit local y después entrega a buzones controlados del proveedor real autorizado. Aprobación del proveedor/ruta de datos, no de una marca ficticia. |

### D1 — delta exacto sujeto a autorización de instalación

Firmas del paquete fijado en APPROVAL.md, sin cambiarlas:
- auth_api.trusted_mfa_material(text,text,text,uuid) → jsonb
- auth_api.issue_bound_challenge(text,text,uuid,bigint,bytea,bytea,text,text,uuid,uuid) → uuid
- auth_api.begin_totp_enrollment_assigned(text,uuid,uuid,uuid,bigint,bytea,text,text,uuid) → jsonb
- auth_api.totp_material_locked(text,uuid,text) → jsonb (reemplazo)
- auth_api.consume_email_otp(text,uuid,bytea,uuid) → boolean (reemplazo)

Owner cleanops_auth_broker NOLOGIN/NOBYPASSRLS; EXECUTE privado a identity_service;
PUBLIC revocado, search_path=pg_catalog y nombres calificados. method_version nullable
positivo en mfa_challenges, sin backfill permisivo; NULL antiguo rechaza.
Extra ACL broker: UPDATE(id) principals/organizations/users y UPDATE(tenant_id)
policy_versions. Revocar llamadas legacy issue_challenge/begin_totp_enrollment_explicit
y los bypass B1-X según paquete. Ningún acceso de tablas al runtime/identity/mail worker,
ni membership del broker/DDL owner, ni nuevos grants administrativos por estos permisos.
Alternativa de rediseño exige otro parche y revisión: no retirar locks para ahorrar ACL.

### D2 — decisiones operativas que sí debe completar el propietario

- Identidad del custodio/operador, infraestructura suiza principal e independiente,
  ubicación de procesamiento/replicación/backup/soporte y control de wrapping keys.
  Propuesta: data keys por tenant+propósito y separación TOTP AEAD / mail AEAD /
  OTP/recovery HMAC / cursores/rate/audit según propósito, sin fallback global.
- Autorizar identidades y permisos exactos del resolver: verificador TOTP no descifra mail;
  worker no descifra TOTP; navegador/runtime genérico/CI no reciben claves operativas.
- Aprobar lifecycle (write/read, read-only, disabled, retire/destroy), acceso de emergencia,
  retención por categoría y último backup recuperable. No inventar años de retención legal.
- Presupuesto de nonces a partir de carga real: N(N−1)/2^97, contar cifrados descartados,
  alertar antes del límite aprobado. Estimar carga es tarea técnica; aprobar riesgo/capacidad.
- Objetivos YA aprobados RPO≤15 min y RTO≤4 h no se reabren: demostrar restore con reloj.
  Mantener claves antiguas de lectura hasta probar inventario/backups. Nunca rebobinar un
  contador TOTP en vivo; si no se prueba monotonicidad, cerrar acceso y revocar/re-enrolar
  por el procedimiento aprobado. CAS incluye versión+ciphertext+key ID y no pierde contador.
  Rotar wrapping key (mismos bytes/ID data key) no requiere reescribir todos los secretos.

### D3 — decisiones operativas y aceptación de interoperabilidad

Aprobar candidato y label no PII generado en servidor (propuesta aliasTenant/aliasCuenta,
no email ni User-Agent). Fijar apps/plataformas/versiones: Google Authenticator,
Microsoft Authenticator, Aegis y 2FAS ya son candidatos documentados; el propietario
identifica cuáles son obligatorios y dispositivos disponibles. Medir QR/importación manual,
algoritmo interpretado, primer código, drift y varios contadores con códigos de esas apps.
No anunciar compatibilidad por pasar solo vectores OTPAuth ni cambiar algoritmo en verify.
AAD v2 conserva tenant/user/method UUID/generación inicial/algoritmo/key ID inmutables.

### D4 — decisiones operativas y nuevo contrato todavía REVIEW ONLY

Aprobar una de estas fuentes de prueba de destinatario:
1. verificación del buzón por challenge separado, persistida/versionada y revalidada;
2. importación desde una fuente corporativa autoritativa identificada, con prueba y lifecycle.
Recomendación: opción1 para auto-servicio; opción2 solo si existe esa fuente y evidencia.
Un email normalizado o método ACTIVE NO acredita verificación. Diseñar cambio/revocación
de dirección para invalidar challenges/outbox de generaciones viejas.

Preparar el parche mínimo adicional, con firmas/ACL/esquema fijados ANTES de pedir su
instalación: fuente de verificación tenant/principal/método/generación; material y claim
con método+destinatario verificados; revalidación previa al envío; finalización CAS del
lease con resultados accepted/transient/permanent/unknown y persistencia de cuarentena.
No fijar firmas falsas como si D1 ya las aprobara. V4 claim_mail retorna solo cuatro
columnas y finish_mail(boolean) no representa UNKNOWN ni todos los estados terminales.
El check expires_at>available_at puede fallar si finish_mail avanza un terminal tras TTL:
corregir en ese parche y probar, sin modificar el SQL fijado de D1.

Payload propuesto: versión/dominio, tenant/user/method/challenge/outbox, generación de
destinatario, dirección verificada exacta, OTP, issued/expires y template controlado.
Fijar serialización/límites y AAD de mail (dominio/versión/key ID/tenant/outbox/challenge),
con clave separada. Transacción única reserva owned→locks→challenge/HMAC→outbox
cifrado→auditoría→completion→COMMIT; nunca SMTP dentro de ella.
Worker por broker/lease, SMTP TLS fuera de transacción, comprobaciones de estado/TTL
y generación antes de enviar; consumidor OTP vuelve a revalidar y CAS atómico.
OTP300s está aprobado. Ensayar valores V4 actuales (5 intentos, lease60s, retry60s),
sin llamarlos política productiva aprobada.
Recomendación para SMTP sin conciliación por API: resultado incierto queda en cuarentena
sin reenvío ciego ni reclaim automático; usuario puede emitir un NUEVO challenge sujeto
a cooldown, invalidando el anterior. Retry solo ante fallo transitorio conocido y
now+delay<expiry. Si proveedor admite dedup/consulta, probarlos con el mismo ID lógico.
SMTP no garantiza exactamente una entrega; exigir un solo consumo y no prometer lo otro.
Aprobar esta política, retención/purga de ciphertext terminal y remitente/template
sin información de cuenta en errores. Medir recepción real, spam/bounces/timeout y revocación.

### Otros parámetros de entrega, no nuevas reglas de producto

AUTH-GATE-01/02/04: aprobar para ensayo el resto de security-values.yaml tal como está,
preservando valores ya aprobados y perfil Argon2id64MiB/3/1 autorizado para pruebas.
Después de carga, fijar el perfil operativo exacto/versionado y su mapping de riesgo.
Propuesta restrictiva para revisar: sensibles los roles administrativos/Sales/Planner/
Project Manager/Site Responsible/Finance; Employee operativo bajo política del tenant;
Visitor/Viewer requieren mapping explícito, nunca asumir OPERATIONAL por falta de dato.
Definir carga máxima/latencia de aceptación para dimensionar el VPS: no hay cifra SRS
que permita inventar p95 o número de usuarios como aprobado. Implementador mide y propone
informe; propietario valida capacidad objetivo antes del ensayo de aceptación de carga.
No reaprobar Argon2id, OTP300s, idle1800/28800s, trusted-device≤30d ni RPO/RTO existentes.

AUTH-GATE-03: aprobar protocolo de pérdida total y reset antes de sus endpoints.
Alternativas: validación administrativa auditada con dos responsables independientes;
o procedimiento corporativo presencial/verificado con mandato restringido y registro.
Recomendar separación de solicitante/aprobador y evidencia de identidad, nunca usar solo
email/rol como recuperación universal. Las pruebas y contratos definirán revocación de
sesiones, confianza, factores y códigos antiguos sin abrir acceso provisional.

## 3. Autorizaciones distintas y exactas

Ninguna está concedida por este plan. Aprobar diseño no ejecuta SQL; pasar CI no despliega.

### PG-TEST-01 — próxima autorización de ejecución solicitada

Autorizar SOLO PostgreSQL16 en un proyecto Docker efímero NUEVO de ensayo B1, sin
conectar/limpiar bases o volúmenes existentes, sin puerto público y sin datos personales.
Resolver/pinchar versión/digest oficial en el manifiesto técnico antes de iniciar.
No reutilizar docker-compose.postgres.yml: tiene volumen persistente, puerto publicado
y credencial dev; no es el perímetro de ensayo solicitado.

Alcance SQL preciso, en este orden, únicamente estos blobs:
1. V4 fresh schema: a06dc23cbc889382b30924a1edc4cead66eeb3e0.
2. B1-X-CREDENTIAL/TOTP/BINDING: 1499e90389b6e7c4d94b1dd17ed35cd4b539d436.
3. D1: 6454a7551e61e5857ef39090b24b93fcbdb03bb1;
   ACL/matrix 50590047d35467b2473945731384ae3da5729f28.
Paths and hashes in requirements.json. Autoriza instalación/compilación DDL, roles técnicos,
GRANT/REVOKE exactos de esos paquetes, y fixtures SINTÉTICOS para pruebas positivas:
A/B, A/u1 A/u2 B/u1, membresías/credenciales/métodos/sesiones y ocho B1-SELF aprobadas.
Configuración enabled solo dentro de esa DB efímera para probar positivos, no flag ni
activación del runtime de aplicación. Credenciales LOGIN efímeras separadas para setup,
runtime, identity, mail y mantenimiento; ninguna se imprime o persiste en Git.
No asignar poderes administrativos de producto a fixtures por nombre de rol.

Autoriza SET ROLE controlado en harness para negativos, catálogo/ACL/RLS de las21 tablas,
transacciones reales de dos o más conexiones, locks/concurrencia/cancelación/rollback/
COMMIT fallido, backup y restore del conjunto sintético a OTRA DB efímera, y limpieza
exclusiva del proyecto creado. Bootstrap privilegiado solo en setup aislado, nunca en
las conexiones bajo prueba. No SMTP externo, endpoints públicos, staging compartido,
producción, migración de datos existentes, nuevos grants fuera de los blobs, ni merge.
Un fallo SQL devuelve evidencia exacta; corregir parche en PR y solicitar aprobación
del nuevo delta antes de instalarlo, no reintentar/reconstruir permisos a ciegas.

### Aprobaciones posteriores identificadas, sin aplazar trabajo de B1

- **CONTRACT-02:** propietario aprueba addenda C-SCOPE/C-LOGIN/D4 y sus firmas/esquemas/ACL
  exactos cuando estén preparados. SQL sigue REVIEW ONLY hasta esa firma.
- **PG-TEST-02:** autorizar instalación del delta aprobado y harness de migración expansiva
  sobre copia sintética del esquema existente, backfill/huérfanos/FK/restore; NO ejecutar
  fresh schema sobre DB existente. La autorización PG-TEST-01 no cubre este cambio.
- **INFRA-TEST-01:** custodio/infra seleccionados; provisión de OpenBao/Vault/Redis/BullMQ,
  SMTP de ensayo y recuperación suiza, aislamiento/secretos/red/certificados. Preparar
  configuración sin secretos primero; el despliegue necesita aprobación separada.
- **MAIL-TEST-01:** remitente/cuenta real y buzones controlados identificados, cuotas y
  residencia verificadas; autorizar envíos de ensayo limitados y accesos correspondientes.
- **STAGING-B1-01:** después de ACL/RLS/crypto/secretos/antiabuso PASS, autorizar despliegue
  del SHA exacto y composición privada en staging aislado para E2E de rutas reales, sin
  route.fulfill ni factores prefabricados. Rutas y frontend existentes, no UI paralela.
  No setter/flag público que active Auth. Producción sigue closedBackend; revisar composición
  de staging como artefacto de despliegue autorizado y mantener AUTH-GATE-05 OPEN.
- **CLOSE-B1:** después de TODA evidencia, solicitar cierre formal AUTH-GATE-05/B1 y
  aceptación PO; producción/release/merge siguen autorizaciones independientes. Ningún
  documento cambia automáticamente OPEN. B1 no se cierra con funcionalidades pendientes.

## 4. Ejecución finita por dependencias y PASS/FAIL

| Hito | Depende de / trabajo | PASS objetivo; cualquier incumplimiento = FAIL y B1 sigue OPEN |
|---|---|---|
| E0 Trazabilidad | Ahora: registrar aceptación parcial de frontend, matriz, hashes, conflictos y decisiones | 44 REQ,14 ops,26 casos completos; fuentes verificadas; ninguna fila de integración real dada por probada |
| E1 Contratos y decisiones | Resolver C-SCOPE/C-LOGIN, D2/D3/D4 y gates01–04; preparar addenda/ACL/SQL/harness/config sin ejecutarlos | Decisiones firmadas, contratos exactos y perfil de prueba/carga con valores explícitos; ningún permiso inferido |
| E2 Base PostgreSQL | PG-TEST-01; puede avanzar en paralelo con decisiones no dependientes | Los tres paquetes compilan y ACL/RLS/ownership/search_path/grants reales coinciden; positivos sintéticos y negativos21 tablas; sin bypass legacy |
| E3 Persistencia completa | E1/E2, CONTRACT-02 y PG-TEST-02; migración expansiva y parches aprobados | Locks ordenados principal→credential→sessions→preauth→memberships/org→policy→owned reservation→method→challenge; CAS y revalidaciones, migración/backfill/FK/restore pasan sin pérdida ni fuga |
| E4 Vertical TOTP | E1/E3,D2/D3: resolver real, UUID/AAD antes de cifrar, enroll/QR/PREAUTH confirm/session/recovery y UI existente | App real genera código válido; no método/sesión antes de primer factor/COMMIT; CAS global contra replay/carreras; códigos una vez y hashes; rotación/clave antigua/restore pasan |
| E5 Vertical EMAIL | E1/E3,D2/D4: material confiable, outbox/worker/broker/SMTP y UI | Destinatario verificado/versión actual; TTL300s; reenvío invalida; máximo un consumo concurrente; expirado/revocado/nuevo email no envía/consume; incertidumbre no se reenvía ciegamente; ciphertext/logs seguros |
| E6 Ciclo Auth íntegro | E3/E4/E5, addenda de completitud: sesiones, MFA por riesgo/tenant, confianza, reset/recuperación, acceso/grants y cambio empresa | Cada REQ de matriz tiene implementación+API/UI o consumidor interno justificado y pruebas; no herencia de permiso por factor/rol; sesiones muestran las cuatro propiedades; revocaciones/restablecimiento no dejan credenciales antiguas activas |
| E7 Resiliencia y operación | E4–E6, INFRA-TEST/MAIL-TEST; carga, claves, errores, pools, colas y pérdida de VPS | RPO≤15min/RTO≤4h medidos en activos Auth; claves/counters/auditoría coherentes; no rewind ni replay de mails/sesiones; capacidad aprobada y parámetros medidos; cero secreto canario en sinks |
| E8 Staging y revisión | E0–E7 PASS, STAGING-B1-01 | E2E con HTTP/DB/SMTP reales para todos los caminos, dos tenants y10 roles según política aprobada; sin mocks de aceptación; CI exacto completo y revisión independiente sin defectos pendientes |
| E9 Aceptación completa | E8 y evidencia de cada fila; PO prueba checklist y decide | Todas I/R/P/A satisfechas, decisiones implementadas y probadas, cero deuda/función B1 pendiente; firma explícita de cierre AUTH-GATE-05 y B1 |

E2 puede verificar la base sin esperar el proveedor EMAIL; eso no es cierre parcial.
No existe hito que permita ACCEPTED con D1/D2/D3/D4 o requisito obligatorio pendiente.
Fallo: identificar caso/SHA/error, corregir causa y reejecutar el grupo afectado y regresión;
si afecta contrato aprobado, solicitar delta. No bucles de intentos sin nueva hipótesis.

## 5. Plan de pruebas exhaustivo ligado a fuentes

- **Funcional:** las14 operaciones y las que aprueben addenda; LOGIN→PREAUTH/selección
  empresa→selección método→factor→ACTIVE; ENROLLMENT_REQUIRED→QR→primer código→recovery;
  step-up, switch origen/destino, listados paginados, individuales/bulk/logout.
  Perfiles sensibles/operativos y MFA configurable según C-LOGIN resuelto.
- **Seguridad:** todos los26 casos V4; REVOKE por escenarios, no por sufijo ambiguo;
  no-grant/deny/temporal/revocado en10 roles; escalación SECURITY DEFINER, owner/no-owner,
  PUBLIC/default ACL/SET ROLE/DDL/TRUNCATE/tables; tokens ausentes/revocados/GUC falsa;
  CSRF/fixation/XSS/inyección/IDOR, mensajes/tiempos no enumerativos y abuso por dimensiones.
- **Transacción/concurrencia:** dos conexiones y barreras reproducibles; password rehash
  vs cambio credencial, emisión PREAUTH ligada a versión verificada; método revoke/rekey
  vs desafío/consume; mismo contador global o OTP en paralelo: exactamente un ganador;
  owned reserve duplicada/hash distinto/rollback/discard ajeno; fallo audit/COMMIT sin
  cookie/resultado sensible; intento fallido confirmado sin rollback del presupuesto.
- **Tenants/contexto:** A/u1, A/u2, B/u1 y sus relaciones cruzadas; filtro/FK/joins/listas/
  funciones/cursor/keys/outbox; pool A→B tras commit/rollback/timeout/cancel/savepoint/crash;
  GC no elimina xid activo; no ALLOW cacheado tras cambio de política o revocación.
- **EMAIL:** métodos/destinatarios no verificados/revocados/generación cambiada; dos workers,
  claim/lease CAS, crash antes/después del send, timeout tras aceptación, expiración durante
  espera/envío, transitorio/permanente/UNKNOWN y reconciliación; nunca segundo consumo ni
  fallo CHECK al cerrar terminal; SMTP real y caja controlada, no solo transporte fake.
- **Claves/TOTP/recuperación:** vectores y apps/versiones reales; tamper/tag/AAD/tenant/
  algoritmo/UUID/version, key missing/catalog down/rotación old+new/compromiso; nonce budget;
  CAS no pierde contador; primera activación y recovery regenerado invalidan anterior;
  restore de backup antiguo no revive sesión/confianza/OTP/counter consumido.
- **Fallos/recuperación:** kill conexión antes/durante COMMIT, falta PostgreSQL/Redis/
  worker/SMTP/secret manager/corpus/reloj; recurso agotado y NAT/dispositivo reiniciado;
  PITR+claves+configuración y rollback de migración sin desactivar FORCE RLS o borrar auditoría.
- **UI/E2E/regresión:** conservar46 Chromium de selector y suites B1/Vitest; añadir QR/recovery,
  EMAIL y funciones antes ausentes con teclado/lector/móvil/loading/expired/429/doble submit/
  abort/late JSON/retry idempotente; navegador→rutas reales→persistencia/eventos post-COMMIT;
  verificar que fixtures no sustituyen consumidores reales en E2E-01.
- **CI exacto y operación:** lint/typecheck/build, estáticos de contrato, unitarias,
  PG compile/RLS/ACL/concurrencia/migración/restore, E2E, dependencias y secret scanning.
  Tests obligatorios omitidos o no ejecutados equivalen a pendiente, no PASS.
  Configuración/env/credencial de producción prohibidos en CI; artefactos redactados.

## 6. Evidencia y condición de B1 100% TERMINADO

Preparar dossier siguiendo PHASE_ACCEPTANCE_TEMPLATE: cada fila REQ→pantalla/acción→
API/función→entidad/efecto→grant/predicados→test→SHA/entorno/resultado→aceptación.
Adjuntar hashes de SQL/imagen/migración/perfil/ACL real; roles/owners/RLS de21 tablas y
deltas; reportes de concurrencia/rollback/auditoría; apps/versiones/códigos reales;
envío/recepción y worker logs redactados; métricas carga y restore; inventario/lifecycle
de claves sin bytes; checklist manual por rol/tenant y firma del propietario.
No marcar evidencia futura como ejecutada ni copia documental como servicio operativo.

**100% TERMINADO exige conjuntamente**: todas las filas obligatorias con I/R/P/A completas,
todos los casos PASS y sin skips obligatorios, D1–D4 operativos probados, conflictos de
alcance resueltos con contratos aprobados y satisfechos, integración real en staging,
cero defecto/deuda B1 abierto, revisión independiente y PO ACCEPTED; después decisión
formal registrada sobre AUTH-GATE-05 y B1. No cierre condicionado a terminar EMAIL,
claves, enrolamiento, recovery, RLS o infraestructura posteriormente.
La publicación en producción es un acto de release separado, no una funcionalidad B1
pendiente ni un permiso implícito por aprobar documentos/pruebas. Hasta autorización
expresa permanecen closedBackend en producción, sin despliegue ni merge.
