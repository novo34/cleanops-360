# Revocación inequívoca V3

Los siguientes nombres son propuestas consistentes, no permisos activos. Sustituyen los nombres ambiguos V2; no habrá alias compatible que permita interpretar revocación de sesiones propias como administración.

| Capacidad | Recurso / acción | HTTP / operationId | Empresa / sujeto |
|---|---|---|---|
| Listar propias | self_sessions.view | GET /me/sessions — listSelfSessions | Usuario empresarial autenticado, empresa activa |
| Revocar propia individual | self_sessions.revoke_self_session | DELETE /me/sessions/{session_id} — revokeSelfSession | Mismo user_id y tenant_id que sesión verificada |
| Logout | self_sessions.revoke_self_session | POST /auth/logout — logout | Solo current_session, nunca parámetro de usuario |
| Revocar demás propias | self_sessions.revoke_other_own_sessions | POST /me/sessions/revoke-other-own — revokeOtherOwnSessions | Mismo user_id/tenant_id; id distinto de actual |
| Revocar ajenas, diferido | admin_sessions.revoke_user_sessions | POST /admin/users/{user_id}/sessions/revoke — adminRevokeUserSessions | Usuario distinto, misma empresa, mandato administrativo separado |

## Condiciones obligatorias

- La sesión verificada determina actor.user_id, tenant_id y current_session.id. No confiarlos desde body/header/query. El body de revocación masiva propia solo admite motivo; rechaza user_id, principal_id, tenant_id, session_ids y selectors. El endpoint individual admite solo session_id como selector de una sesión cuya propiedad se verifica.
- Masa propia: seleccionar tenant_id=actor.tenant_id AND user_id=actor.user_id AND id<>current_session.id. Misma persona con membresía en otra empresa no entra en ese conjunto: cada empresa es un perímetro independiente. No revocar todas las sesiones globales de principal como efecto oculto.
- El scope vigente es empresa activa + propiedad; ninguna concesión de este recurso alcanza admin_sessions ni obtiene mandato por nombre de rol, incluso Super Admin/Company Admin. Una regla administrativa futura tampoco se deduce de la regla propia.
- Individual ajena/otra empresa/ausente→404 indistinguible, sin mutación ni revelar propietario. Sin sesión válida→401; sin regla positiva/step-up requerido→403 seguro. OTP/enrolamiento no son sesión ACTIVE.
- Revocación masiva exige step-up ligado a B1-SELF-04 y versión de política vigente. Preserva sesión actual. El individual sobre sesión actual/logout revoca en commit y elimina cookie; un fallo DB no simula éxito.
- En revocación de otra propia, el actor autorizado y el target se verifican bajo transacción. Bloquear por orden estable para no crear deadlocks: contexto solo valida inicialmente; servicio sensible bloquea sesiones implicadas por orden determinista de ID y revalida actor y target después del lock. Bulk usa mismo orden; timeout produce fallo seguro/reintento controlado, nunca bypass.
- Revocación efectiva desde commit: siguientes requests con token revocado fallan. Operación ya confirmada no puede deshacerse retroactivamente; carrera y orden de locks se prueban. No caché de ALLOW entre requests que prolongue permisos.
- Reintento idempotente de una sesión propia ya revocada devuelve resultado seguro si propiedad se puede comprobar sin fuga. Logout ya sin sesión puede devolver 401 según contrato; el cliente borra cookie local igualmente. Reintento de bulk no altera current_session ni vuelve a revelar datos. No almacenar secretos para reentregar respuestas.
- Auditoría registra tenant/actor/acción/correlación y objetivo propio o cantidad agregada; jamás token/digest. El mismo commit confirma éxito y evidencia. Error/denegación va a canal restringido separado, sin falsear mutación.

## Pruebas requeridas

REVOKE-OWN-01: A/u1 con tres sesiones: bulk revoca otras dos y preserva actual. REVOKE-OWN-02: A/u2 y B/u1 se mantienen aunque compartan rol o principal. REVOKE-OWN-03: individual ajena/otro tenant/ausente indistinguibles y sin efectos. REVOKE-OWN-04: payload con selectores ajenos rechazado por schema. REVOKE-OWN-05: sin grant/factor/cookie operativa deniega. REVOKE-OWN-06: tras commit token objetivo falla; carreras/reintento y orden de locks no dejan acceso residual ni revocan current. ADMIN-EXCLUDED-01: self grant nunca permite adminRevokeUserSessions y esa ruta no forma parte de B1. Todas las pruebas de producto siguen pendientes de implementación y ejecución aislada autorizadas.
