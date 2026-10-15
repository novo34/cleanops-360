# B1 PostgreSQL/RLS — DDL completo de revisión V4

`b1-review-only.sql` contiene definición fresca completa propuesta: roles técnicos NOLOGIN, tablas, constraints/índices, funciones broker y ceremonias, permisos de funciones, RLS ENABLE/FORCE en todas las tablas app y privadas, políticas, ownership e inmutabilidad tenant. Es REVIEW ONLY, no se ha ejecutado. No seed de configuración, identidades o bindings: deployment_enabled ausente/false deniega; ninguna regla funcional aprobada está activada.

## Fronteras de confianza

Runtime y servicio privado de identidad tienen credenciales de servicio separadas, sin membresía en broker/DDL owner ni acceso directo a tablas. La capa HTTP no puede asumir rol de identidad por datos de request. cleanops_identity_service es el único llamador de login_material/new_preauth y atestación MFA/issuance; comprueba contraseña Argon2id y corpus comprometidas con librerías maduras ANTES de new_preauth, y TOTP RFC con clave descifrada fuera de DB ANTES de pasar validated_counter a funciones SQL. No hay booleano/password_verified del cliente que el DB crea. Compromiso de esa credencial de issuer es compromiso del autenticador, no un riesgo que RLS elimine; aislamiento de procesos, secretos, consultas parametrizadas y revisión de esas llamadas son obligatorios.

Argon2id/TOTP/AEAD/HMAC/CSPRNG no se implementan en SQL artesanalmente. pgcrypto digest se usa para token opaco de alta entropía, no para password; OTP/recovery digests son HMAC32 calculados por servicio con clave fuera de DB. TOTP counters se aceptan solo del verificador aislado, dentro de ventana de reloj y crecimiento atómico. SQL guarda la prueba/contador y evita replay; no pretende verificar una firma TOTP que no recibe. Parámetros/roles de riesgo se cargan solo tras revisión final de tabla única. user.risk_class SENSITIVE/OPERATIONAL se asigna por política revisada, nunca por cuerpo cliente; DB comprueba absoluta/inactividad según esa clase.

## Tablas y propiedad

Empresariales: organizations raíz; users/membresía tenant-owned; policy_versions; self_service_rules; sessions; mfa_methods/challenges/recovery_codes; step_up_evidence; auth_outbox; audit_logs; idempotency_records. PK/FK compuestas incluyen tenant y sujeto donde corresponda. tenant NOT NULL e inmutable; ON DELETE RESTRICT, sin pérdida por SET NULL. No rol de negocio ni administración de grants se instala en B1.

Privadas: configuration/version y deployment_enabled fail-closed; principals/credentials centrales; preauth con versión de credencial y origen de switch; bootstrap CSRF anónimo; security_log minimizado sin empresa inventada; rate_buckets por HMAC de dimensiones; tx_context; ceremonia idempotente. RLS privadas solo concede política interna al broker NOLOGIN, runtime no tiene política ni privilegios. Broker posee funciones, no tablas; no BYPASSRLS. Políticas broker evitan recursión al verificar sesión; no existe SELECT global público. El login_material retorna hash SOLO al verificador privado y jamás a HTTP/log/tracing.

## Contexto y autorización

BEGIN READ COMMITTED→begin_verified_context(token)→tx_context privado (backend_pid,xid8)→guard de regla/step-up/propiedad→efecto+auditoría+idempotencia→COMMIT misma conexión. Se rechaza segundo contexto distinto. GUC cliente no es autoridad. verified_tenant revalida estado de sesión/usuario/empresa, versión credencial y doble caducidad. No contexto operativo de preauth. Cada función own_* filtra sujeto y tenant, no basta RLS de empresa. Sin DML directo runtime; policies runtime son defensa adicional para repositorios que se autoricen después, no concesión SQL actual.

El guard solo usa ocho definiciones funcionales aprobadas y binding activo explícito por empresa; configuración vacía/PROPOSED/REVOKED/no vigente/DENY deniega. No se considera que aprobar 80 proyecciones cree poderes autónomos. DENY relevante y restricciones superiores prevalecen; futuros overrides/roles requieren otro bloque, no están implícitos aquí.

## Funciones y consumidores

| HTTP/consumidor | Primitivas SQL propuestas |
|---|---|
| Página login/POST login | bootstrap_csrf, csrf_valid, login_material, rate_attempt, new_preauth |
| OTP y step-up | issue_challenge, challenge_material, verify_challenge |
| Enrolar/confirmar | begin_totp_enrollment, enrollment_material, confirm_totp_enrollment |
| Activación tras factor | issue_active_session; siempre desde preauth VERIFIED y clase de riesgo válida |
| /auth/me, sesiones/logout | begin_verified_context, current_identity, own_sessions, revoke_own_session, revoke_other_own_sessions, touch_activity |
| Lista/cambio de empresa | memberships, select_tenant, begin_switch, issue_active_session |
| Middleware idempotente | reserve/complete_idempotency o reserve/complete_ceremony |
| Mail worker separado | claim_mail, finish_mail: lease y prueba de posesión de claim |
| Fallos/operación | record_security_event en transacción separada; gc_context solo mantenimiento |

consume_recovery_internal define consumo atómico sin elevar privilegios y NO tiene grant de llamador B1: no se expone recuperación total no aprobada. No otra API interna sin consumidor justificado.

## Concurrencia, errores y auditoría

Sesiones actor/targets se bloquean en orden estable UUID antes de guard; política se bloquea FOR SHARE mientras cambia efecto. Toda futura modificación de política debe incrementar policy_versions con lock exclusivo en orden uniforme. La revocación solo toca propio/empresa y bulk excluye actual. Revocación efectiva desde commit; no cancela efectos ya confirmados. Timeouts/deadlock hacen rollback completo y reintento acotado, nunca bypass. Alta/confirmación de factor y lote con locks evita doble consumo. Counters/attempts fallidos devuelven false y se CONFIRMAN antes de enviar401: no convertir el false en excepción que revierta el contador. Eventos de fallo se escriben con helper restringido separado, no como éxito de negocio.

PostgreSQL iguala bytea de digest; la comparación de secretos brutos y la verificación criptográfica se realizan en librería madura del servicio, no se afirma resistencia temporal de una comparación SQL como garantía criptográfica. Defensas de no enumeración incluyen trabajo de hash ficticio, mensajes uniformes, limitadores y medición estadística de tiempos.

OTP emisión y outbox se insertan juntos; reenvío revoca challenge anterior. Worker solo claim de desafíos ISSUED, usuario/empresa activos, TTL vigente, SKIP LOCKED y lease; SMTP reintenta con Message-ID/dedup_key estable. No se promete exactamente-una-entrega con SMTP: duplicado de correo no concede segundo consumo. Tras SENT ciphertext se vacía. Expiración/cancelación no abre sesión ni baja factor. Claves AEAD/KMS y rotación fuera del repositorio/DB, ubicación autorizada.

Auditoría éxito append-only por broker sin UPDATE/DELETE permitido, tenant y actor de contexto, metadata fija/count/correlación sin secretos; cambio de empresa audita cada perímetro sin mostrar identidad de otra empresa. Empresas se desactivan, no pierden vínculos. Retención legal por categoría sigue para operación real; B1 solo entorno sintético con política de pruebas aprobada. Logs privados pretenant conservan HMAC/fecha/código, no contraseñas/IP cruda.

## Mantenimiento y límites de ejecución pendiente

tx_context de transacción finalizada se identifica por visibilidad del xid8 más antigüedad propuesta; GC no borra xids activos. La fila no autoriza otro xid/backend aunque permanezca tras commit. Rollback, savepoints, cancelación, xid wrap y pool transaction-mode deben probarse en integración. RLS/funciones se prueban con runtime real, nunca owner. La validación estática no compila PL/pgSQL ni acredita semántica de snapshots/locks.

Configuración, principals/credentials y fixtures se provisionan por harness de despliegue aislado tras autorización, sin bootstrap de administrador de negocio. El SQL incluye GRANT de diseño para roles técnicos pero no los ejecuta ahora, no mapea LOGIN ni instala bindings. No API administrativa ni acceso System Status. Perfil de riesgo, valores y revisión de funciones se aprueban como parte del contrato final, no como reapertura de arquitectura.

## Plan de migración segura posterior

1. Revalidar HEAD; checkout aislado fix/system-status-build-tests, preservar main/Foundation/PR4. Inventariar solo esquema/datos de staging sintético para ownership; backup y restore verificados antes de DDL autorizado.
2. Preparar migración expansiva versionada distinta del fresh schema REVIEW ONLY. Detectar roles/esquemas/extensión existentes, revisar colisiones/ownership; no ejecutar este fresh-schema script sobre base existente ni usar IF NOT EXISTS para ocultar divergencias.
3. organization_id→tenant_id con backfill de propiedad demostrado, sin UUID fijo por defecto; huérfanos en cuarentena de revisión. Constraints/FK NOT VALID→VALIDATE y NOT NULL tras conciliación. Conservar audit/security rows y tenant durante retención.
4. Funciones/roles/privilegios revisados, deployment_enabled false, sin seeds/grants de negocio; ensayo de migración/restore en DB efímera SOLO después de autorización de ejecución.
5. Implementación vertical UI/API/identity/DB/backend+RLS; pruebas unitarias/contrato/concurrencia/tenants/pool y E2E reales. Aprobar mapping de credenciales de servicio y fixtures sintéticos, sin producción. Runtime no recibe DDL ni membership broker.
6. Contrato final y evidencia revisados→decisión separada de habilitar bindings/identidad en staging. System Status permanece cerrado hasta su propio bloque. Rollback cierra acceso y conserva RLS/datos; no desactivar FORCE RLS para restaurar disponibilidad. Merge/aceptación de fase no se desprenden de estos pasos.
