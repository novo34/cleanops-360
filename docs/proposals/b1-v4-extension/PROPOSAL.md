# B1 — propuesta de ampliación interna V4 (REVIEW ONLY)

Estado: **PROPOSED_REQUIRES_OWNER_APPROVAL**. Base: e6f7d1d9490684d38982959696d73b6c38215af6.
AUTH-GATE-05 **OPEN**; runtime **closedBackend**. La implementación NO se declara desbloqueada.
Los canónicos de docs/canonical/auth-review/v4/ se preservan; esta carpeta es una propuesta derivada, no V5 ni una aprobación.

## 1. Credenciales: lock → verificación → CAS → preauth

Firma propuesta `credential_material_locked(normalized_email text)` devuelve principal_id, password_hash y credential_version, exclusivamente al issuer privado. Descubre el principal, bloquea principal y credencial y vuelve a comprobar ACTIVE. Argon2id se ejecuta fuera de PostgreSQL, manteniendo conexión/transacción/locks. Cuenta ausente conserva hash ficticio y rate limits del servicio; SQL no inventa identidad.

`rehash_credential_cas(p uuid, expected_version bigint, expected_hash text, replacement_hash text)` compara versión Y hash bajo esos mismos locks. Solo actualiza coste/formato de la misma contraseña, no cambia la generación lógica ni revoca sesiones. Un cambio real de contraseña debe incrementar credential_version mediante su futuro flujo separado; no puede reutilizar esta primitiva como reset. Reemplazo/hash nunca llegan a HTTP/logs.

`new_preauth_verified(p uuid, t uuid, expected_version bigint, expected_hash text, cookie_hash bytea, csrf_hash bytea)` comprueba de nuevo la generación y hash que el issuer verificó (o el reemplazo CAS confirmado), principal/empresa/pertenencia vigentes y digests de 32 bytes; después reutiliza new_preauth de V4. No acepta password_verified del navegador. La credencial del issuer sigue siendo raíz de confianza, como en V4; SQL no puede demostrar una prueba Argon2id externa.

Compatible: algoritmo, perfil de ensayo, tablas y estado de preauth. Requiere aprobación: nuevas firmas, locks de principal durante hashing, UPDATE limitado para broker y sustitución de permisos a entry points inseguros. Benchmark de duración/memoria/contención pendiente.

## 2. TOTP: material completo y consumo CAS

Añadir a mfa_methods una versión monotónica y un algoritmo explícito, sin deducir algoritmo de ciphertext ni del key_version de cifrado. Filas antiguas sin algoritmo quedan no verificables hasta reconciliación autorizada. El trigger versiona cambios de estado/material/algoritmo; consumir contador no cambia versión. No se permite retroceder contador; un secreto nuevo usa método nuevo. No hay contador por propósito.

`totp_material_locked(raw_preauth text, ceremony uuid, purpose text)` devuelve tenant/user/method, propósito y ceremonia exactos, versión, contador previo, expiración efectiva, algoritmo, ciphertext/key_version y contexto de grant/recurso/sesión. LOGIN/STEP_UP usan un challenge; ENROLLMENT usa el método PENDING de esa ceremonia. Se bloquean contexto/método/challenge, se comprueban pertenencia, versión de credencial, estado, TTL, attempts y regla/recurso. Es material solo del proceso privado; jamás respuesta HTTP.

`consume_totp_cas(raw_preauth text, ceremony uuid, purpose text, expected_method_version bigint, expected_counter bigint, validated_counter bigint, corr uuid)` exige el contexto bloqueado, igualdad null-safe del contador previo, versión exacta, crecimiento estricto y ventana V4 respecto a clock_timestamp. Solo el verificador maduro proporciona validated_counter. Reutiliza verify_challenge después de estos predicados, en la misma transacción. La nueva begin_totp_enrollment_explicit(raw_preauth text, ciphertext bytea, key_version text, algorithm text, corr uuid) reutiliza la emisión V4 pero exige algoritmo explícito. Para enrolamiento, firma consume_enrollment_cas equivalente añade recovery_digests bytea[] y reutiliza confirm_totp_enrollment. Un código inválido no se convierte en un contador; la ruta de fallo conserva intentos.

Compatible: OTPAuth, ventana/dígitos/período V4 y contador global por método. Requiere aprobación: columnas/trigger, nuevas firmas CAS y revisión de verify_challenge para registrar versión de política en la evidencia y comprobar autorización antes de mutaciones.

## 3. Binding, reglas, step-up y reservas

`resolve_binding(raw_cookie text, raw_csrf text, mode text)` devuelve el Binding completo: kind/id, csrfDigest, expiresAt mínimo absoluto/idle, tenant/user/session cuando existen y estado de preauth. BOOTSTRAP no obtiene tenant ficticio; SELECTION no obtiene sujeto empresarial; VERIFIED/CONSUMED no son un estado de acceso HTTP. Contexto de sesión viene de begin_verified_context, no de GUC ni de selectores cliente. Para PREAUTH se revalida además origen de switch y membresía de destino si ya está elegida.

`binding_authorization(raw_preauth text, rule_key text, resource uuid)` devuelve allowed y step_up; usa las ocho reglas B1-SELF existentes, DENY y falta de ALLOW deniegan. No introduce un motor RBAC general, nuevos roles ni permisos por nombres de rol. PREAUTH solo obtiene reglas de ceremonia/selección apropiadas; ninguna regla de negocio. En SELECTION, B1-SELF-07 autoriza exclusivamente llamar a memberships (que filtra principal y regla por cada empresa, incluso resultado vacío); B1-SELF-08 exige pertenencia y regla del destino. No se fabrica un tenant para esta etapa. STEP_UP conserva sesión/tenant/recurso/expiración y debe coincidir con la versión de policy_versions vigente. Evidencia antigua sin versión no vale.

Reservas nuevas añaden propietario backend_pid/xid8. `reserve_owned(raw_preauth text, operation_name text, key_hash bytea, request_hash bytea, one_time boolean)` inserta o bloquea el scope V4, devuelve un envelope inequívoco pending/replay con hash/TTL/one_time y no guarda cuerpos secretos. PENDING huérfano de otra transacción da 409, no se roba. `discard_owned(raw_preauth text, operation_name text, key_hash bytea, request_hash bytea)` elimina SOLO PENDING de esa conexión/xid/scope/hash; COMPLETED, TTL vencido, otra empresa o dueño no se borran. `complete_owned(raw_preauth text, operation_name text, key_hash bytea, request_hash bytea, safe_response jsonb)` exige el mismo dueño; después de revocar la sesión actual solo puede completar esa reserva ya autorizada, no autorizar un efecto nuevo. One-time guarda marcador sin plaintext.

Compatible: mismas reglas, scopes, TTL y semántica de no replay de secretos. Requiere aprobación: Binding interno adicional, evidencia versionada, propiedad de reserva y permisos de función. Callers antiguos de reserve/complete deben retirarse: se dejan wrappers de reserva solo para dependencias SQL, sin EXECUTE de llamador. Las reservas V4 antiguas quedan sin propietario y no son reclamables; su reconciliación/expiración requiere un plan separado, nunca borrado automático.

## Orden, errores y adopción

Principal → credencial → sesiones del sujeto → preauth → organización/usuario → policy_versions FOR SHARE del conjunto origen/destino → reserva idempotente cuando aplique → método → challenge. La sesión actual puede estar bloqueada antes de que V4 ordene los targets UUID: la serialización previa por principal evita que dos flujos del mismo sujeto adquieran esas sesiones en sentido inverso. Todo revocador/reset futuro debe adquirir primero ese principal. Una reserva ya bloqueada se completa/descarta después del efecto sin adquirir una reserva nueva. El principal serializa ceremonias del mismo principal. Discovery sin lock no autoriza nada: tras adquirir locks se releen filas. Los efectos V4 se invocan solo después de este protocolo. El adaptador debe conocer el recurso destino al autorizar para bloquear las policy_versions relevantes en orden; si inicia una ceremonia sin idempotencia, omite esa fase en lugar de reservar después del factor. Los helpers context/checked_preauth se sustituyen EN EL PARCHE PROPUESTO para conservar el protocolo también en llamadas V4 reutilizadas. Escritores futuros de credenciales, membresía y política deben respetar este orden; un writer incompatible bloquea la aprobación.

READ COMMITTED, una conexión hasta COMMIT, sin retries automáticos. Reloj de pared tras waits y antes de efectos: no confiar en statement_timestamp antiguo para aceptar un TTL cruzado. SQLSTATE/errores se mapean a los códigos genéricos del manifiesto. CAS fallido no emite sesión; infraestructura/deadlock/timeout aborta y descarta conexión. Fallos de factor que actualizan attempts se confirman como resultado false, no se revierten por lanzar error HTTP. Auditoría de éxito y efecto se confirman juntos; sin tokens/digests/ciphertext en metadata.

El parche separado contiene una excepción incondicional al inicio dentro de BEGIN y ROLLBACK final: no es migración ni instalador. Permisos descritos en el parche son propuesta, no concesiones ejecutadas. No se modifica require_enabled, no se inserta configuración, ni se activa ninguna ruta.

## Aprobaciones mínimas del propietario

1. **B1-X-CREDENTIAL**: firmas versionadas, CAS de rehash sin cambio de generación y coste del lock durante Argon2id.
2. **B1-X-TOTP**: versión/algoritmo explícitos del método, metadata privada y CAS; reconciliación fail-closed de filas antiguas.
3. **B1-X-BINDING**: helpers internos, evidencia ligada a versión de política y reservas con propietario transaccional, con retiro de permisos antiguos.

Aprobar estos contratos no autoriza ejecutar SQL, migraciones, grants, fixtures, conexión del runtime, cierre del gate, merge ni despliegue. Después se requieren implementación contra las firmas aprobadas, compilación y ensayos PostgreSQL/RLS/concurrencia autorizados por separado.

## Alcance exacto del parche y compatibilidad de privilegios

review-only.sql contiene cuerpos propuestos completos, no implementaciones instaladas. Añade versión/algoritmo de método, versión de política de evidencia y dueño backend/xid de reserva; sustituye únicamente context, checked_preauth, guard, verify_challenge y los dos wrappers reserve dentro del overlay. Los originales siguen byte a byte intactos. La excepción inicial aborta todo el BEGIN aun si el cliente continúa leyendo; ROLLBACK cierra el artefacto.

Las firmas de lectura/efecto V4 se reutilizan internamente. Las antiguas entradas de issuer sin CAS dejan de estar concedidas al identity_service; las nuevas email_otp_material(text,uuid) y consume_email_otp(text,uuid,bytea,uuid) conservan EMAIL_OTP sin permitir pasar un contador TOTP a verify_challenge. NULL digest sigue siendo fallo contable, no factor válido.  solo las funciones nuevas pueden atestar TOTP o emitir preauth por esa identidad. El parche propone EXECUTE sobre las funciones propias ya existentes para identity_service: hace posible un Backend privado de una conexión, sin cambiar a un pool runtime a mitad del request. No concede acceso directo a tablas a runtime/identity_service; el único privilegio nuevo de tabla es UPDATE de dos columnas de credentials para el broker NOLOGIN. Esto forma parte de B1-X-BINDING/CREDENTIAL y está PENDIENTE, no aplicado.

La política sigue siendo el subconjunto B1 de ocho reglas, no un RBAC general. Política nueva o denegación explícita invalida evidencia anterior por policy_version; los futuros escritores de reglas deben cambiar esa versión bajo lock exclusivo. La decisión de algoritmo y reconciliación de métodos antiguos es B1-X-TOTP: no hay backfill implícito.

Los cambios requieren adaptar también las llamadas actuales de private-otp/v4-broker después de aprobación: no se conectan ahora ni se presume que funcionen contra las nuevas ACL. El patch no es una migración compatible para un staging existente sin análisis de datos/privilegios y autorización de ejecución.

## Límites de comprobación

Pruebas estáticas inspeccionan firmas, guards, ownership/ACL propuestas, preservación canónica y predicados críticos. Un modelo de contrato cubre carreras de generación, replay global y propiedad de reserva; no ejecuta SQL ni demuestra locks, sintaxis PL/pgSQL, triggers, privilegios o RLS. Compilar y ensayar SQL en PostgreSQL objetivo requiere autorización separada. La propuesta permanece pendiente de aprobación incluso con CI verde.

Parámetros SQL (hashes/digests/ciphertext/cookies) tampoco pueden registrarse en logs del driver, trazas ni diagnósticos PostgreSQL: la configuración de observabilidad deberá revisarse antes de cualquier ensayo o activación. Ninguna prueba estática certifica esa configuración externa.
