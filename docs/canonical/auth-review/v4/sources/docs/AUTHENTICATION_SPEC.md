# CleanOps 360 — AUTHENTICATION_SPEC

**Estado:** especificación documental derivada; sin implementación. **Fecha:** 2026-10-09.  
**Fuente normativa:** Product Master V3, SRS V1.1, `ARCHITECTURE.md`, `DATA_MODEL.md`. Ante discrepancia prevalece el requisito SRS aplicable; no modifica las 26 decisiones aprobadas.

## 1. Propósito y alcance
Definir contratos funcionales y de seguridad para autenticación propia mediante librerías maduras, MFA por riesgo, sesiones, gestión de dispositivos y autorización multi-tenant. Incluye UI, backend/API, auditoría, errores, recuperación y pruebas. No crea proveedor externo de identidad ni implementa algoritmos criptográficos ad hoc.

## 2. Requisitos normativos vinculados
`REQ-AUTH-001`–`004`, `REQ-AUTH-010`–`017`, `REQ-AUTH-020`–`022`, `REQ-AUTH-030`–`034`, `REQ-AUTH-040`–`047`, `REQ-AUTHZ-001`–`007`, `REQ-TEN-001`–`004`, `REQ-SEC-020`–`021` y políticas de auditoría, sesión, rate limiting, step-up y seguridad del SRS. Estos IDs **referencian** requisitos existentes; no se redefinen.

## 3. Decisiones vinculantes
- Login email + contraseña, almacenamiento de hash robusto mediante biblioteca consolidada y parámetros actualizables.
- OTP por email **5 minutos** de validez, un solo uso; hash de código, reenvío invalida anterior, límites por usuario/IP/dispositivo, cooldown y mensajes no enumerativos.
- TOTP compatible con aplicaciones estándar; secreto cifrado en reposo, activación validada con primer código, códigos de recuperación mostrados una vez, almacenados como hash y consumidos atómicamente.
- MFA obligatorio para administradores, comerciales, planificación, responsables y finanzas; configurable por tenant para empleados operativos. MFA reforzado en operaciones sensibles, aunque la sesión se haya abierto sin MFA.
- Remember device: hasta **30 días**, revocable y sin ampliar la vida de la sesión. Tiempo sin actividad: **30 min** para funciones administrativas/riesgo alto y **8 h** para empleados operativos.
- Caducidad **absoluta** de sesión obligatoria, independiente de inactividad y dispositivo confiable. **Duración numérica pendiente de selección y pruebas técnicas antes de entregar Auth**; ningún documento puede interpretar 30 días como duración de sesión.
- Precedencia: aislamiento tenant y restricciones superiores; `explicit deny` sobre todo grant; ausencia de autorización implica denegación. Backend y API validan siempre.

## 4. Identidades, estados y invariantes
`User` pertenece a tenant; `AuthIdentity` vincula credenciales a usuario; `Session` posee id opaco, tenant_id, user_id, created_at, last_activity_at, absolute_expires_at, revoked_at y nivel/frescura MFA; `MfaMethod`, `MfaChallenge`, `RecoveryCode`, `TrustedDevice`, `AuditEvent` y `AccessGrant` son entidades lógicas. Nombres/campos son **diseño propuesto**, no DDL validado.

Estados de challenge: `ISSUED → VERIFIED | EXPIRED | REVOKED | EXHAUSTED`. Nunca aceptar un challenge dos veces; invalidación/transición atómica. Sesiones: `PENDING_MFA → ACTIVE → EXPIRED | REVOKED`; no conceder permisos operativos en `PENDING_MFA`. Cambios de contraseña/reinicio MFA revocan confianza previa y sesiones según política de seguridad de la operación.

## 5. Flujos verificables
### 5.1 Login
1. UI envía email y contraseña por TLS, con CSRF cuando aplique; servidor responde sin revelar existencia de usuario.
2. Servidor comprueba limitadores, estado de cuenta, contraseña y política de riesgo del rol **del lado servidor**.
3. Si requiere MFA y no existe dispositivo confiable vigente, genera challenge OTP email o solicita TOTP. La UI ofrece cambio al método previamente habilitado.
4. OTP/TOTP válido habilita sesión, registra auditoría y emite cookie segura `HttpOnly`, `Secure`, `SameSite` apropiado, rotación contra fixation. Los tokens no se escriben en JS ni logs.
5. Si MFA no es necesario según política tenant/rol, habilita sesión restringida a sus permisos, manteniendo step-up para acciones sensibles.

### 5.2 OTP, TOTP, recuperación
- `Request/re-send email OTP`: reemplaza código anterior; encola correo de forma idempotente, aplica rate limit y cooldown. Error de entrega no activa sesión.
- `Verify OTP`: comparar de forma segura con hash; transacción única para marcar consumido y emitir sesión. Al caducar: error claro y solicitar otro código.
- `Enroll TOTP`: secreto protegido, QR temporal, no activar antes de prueba. `Recovery codes`: mostrar una vez; regenerarlos invalida anteriores; consumición atómica.
- `Reset MFA` administrativo: permiso privilegiado + step-up, motivo, comprobación de identidad por procedimiento autorizado y auditoría; no mostrar secretos.

### 5.3 Sesiones y dispositivo confiable
- `Account → Security → Active Sessions`: dispositivo/navegador aproximados, creación, última actividad y revocación individual o de demás sesiones.
- Refrescar última actividad bajo política explícita que evite escribir en DB cada request y **sin** extender caducidad absoluta.
- Dispositivo confiable asociado de modo seguro a usuario y tenant, expiración máxima 30 días, revocación individual y masiva. Si cambia contraseña, se resetea MFA o hay señal de riesgo: revocar confianza.
- Ante sesión expirada: bloquear mutaciones online; en cliente offline conservar datos pendientes y solicitar nueva autenticación y autorización antes de sincronizar.

### 5.4 Autorización
Evaluación para `actor, tenant, action, resource, time`: 1) validar sesión/MFA/tenant; 2) aplicar restricciones superiores y `explicit deny`; 3) evaluar rol y grants individuales, temporales y por recurso dentro de su ámbito; 4) denegar por defecto; 5) auditar acciones privilegiadas y cambios de reglas. Los permisos temporales vencidos jamás se aplican. Tests IDOR/cross-tenant y denegación explícita tienen prioridad.

## 6. Contratos API funcionales (rutas ilustrativas, no API definitiva)
| Acción UI | Comando lógico | Precondición y resultado | Auditoría |
|---|---|---|---|
| Iniciar sesión | `auth.login` | Credenciales → MFA pendiente o sesión activa | login success/failure controlado |
| Solicitar OTP | `auth.otp.issue` | Cooldown y límites → challenge nuevo | emisión sin registrar OTP |
| Verificar MFA | `auth.mfa.verify` | challenge activo → activo o error acotado | MFA outcome |
| Activar TOTP | `auth.totp.enroll/confirm` | sesión autenticada + step-up → método activo | cambio MFA |
| Recuperar acceso | `auth.recovery.consume` | código válido → rotación/instrucción segura | recovery |
| Revocar sesión | `auth.session.revoke` | permiso/propiedad comprobada → revocada | revoke |
| Modificar permisos | `access.grant/deny/revoke` | autorización + step-up + versión → cambio auditable | before/after sin secretos |

Todos los comandos deben tener validación input, respuesta de error estructurada, control de idempotencia donde corresponda, aislamiento tenant y protección contra abuso.

## 7. Seguridad y amenazas
Brute force, credential stuffing, OTP spraying, enumeración, replay, fijación/robo de sesión, CSRF, XSS, TOTP phishing, abuso de recovery codes, IDOR, bypass de rol y tenant. Controles: límites por dimensiones, hash adaptativo, cifrado secretos, auditoría, protección cookies, expiración doble, revocación, MFA step-up, pruebas adversariales y llaves gestionadas fuera del repositorio. `Remember device` no debe habilitar bypass de MFA ante escalada de riesgo.

## 8. UI, recuperación y accesibilidad
Estados `loading`, `success`, `error`, `empty`, `rate-limited`, `expired`, `retryable`; mensajes que no enumeran cuentas, accesibles teclado/lector pantalla. Explicar al usuario cómo recuperar MFA sin comprometer verificación de identidad. Si correo OTP falla, ofrecer reintento sujeto a límites y método alternativo habilitado. No hacer fallback silencioso a un factor inferior en operaciones sensibles.

## 9. Pruebas y aceptación
- Unitarias: clasificación por rol, resolución de grants/denies, expiraciones, codificación de estados, one-time OTP/recovery.
- Integración: login → challenge → sesión; reenvío invalida; concurrencia en OTP; revocación inmediata; acceso cross-tenant denegado.
- E2E: MFA por perfil sensible/operativo, manage access, step-up, dispositivos confiables, logout/revocación, caducidad e interfaz de recuperación.
- Seguridad: replay, session fixation, CSRF, rate limit, IDOR, elevación de privilegios, MFA reset abusivo y registro sin secretos.
- Evidencia: test reports, captura UI, logs auditados y matriz de trazabilidad por cada flujo.

## 10. Puertas documentales pendientes (no nuevas decisiones aprobadas)
`AUTH-GATE-01` elegir duración absoluta y verificar configuración por roles; `AUTH-GATE-02` parámetros de hash, limitadores/cooldowns/intentos conforme amenaza y carga; `AUTH-GATE-03` protocolo de recuperación de cuenta y pérdida total de MFA; `AUTH-GATE-04` inventario concreto de roles y matriz de riesgo/step-up; `AUTH-GATE-05` esquema y endpoints definitivos. **No comenzar la fase de autenticación en producción sin resolver estas puertas.**

