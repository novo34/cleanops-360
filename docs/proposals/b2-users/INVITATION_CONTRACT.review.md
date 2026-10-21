# Contrato de invitación — propuesta para aprobación

Estado: DESIGN_ONLY. No endpoints, DDL, correo ni flujo de activación implementados.
La autorización SQL2-R2/SQL3-R2 no autoriza este contrato ni su ejecución.
Este documento precisa y corrige el orden del paso 4 de INVITATION_PROPOSAL.md.

## Compatibilidad y contradicción concreta

Fuentes: Product Master V3 §143 decisiones 12/13; SRS V1.1
REQ-AUTH-001/002/011/021/047, REQ-AUTHZ-001–007 y límites invitations/hour.
Se conserva MFA según riesgo/tenant, OTP de email de 5 minutos, activación TOTP
solo tras verificar el primer código y step-up para acciones sensibles.
Las 24 horas corresponden exclusivamente al enlace propuesto, no a MFA o sesión.

**Orden de activación pendiente de aprobación:** la última instrucción exige MFA
según política antes de activar. SQL14 `new_preauth_verified` y
`identity_private.lock_memberships` exigen pertenencia ACTIVE y credencial.
Por tanto, activar primero y exigir MFA después, como decía el paso 4 anterior,
no satisface esa instrucción. No se puede utilizar directamente la preautenticación
B1 para una pertenencia pendiente ni relajar sus precondiciones.

Propuesta única: una aceptación limitada a la invitación verifica contraseña y
factores aplicables con las primitivas y controles B1 existentes, sin sesión ni
autoridad sobre datos de negocio. Solo después se activa la pertenencia en una
transacción que consume el enlace. El acceso posterior usa el login B1 ordinario.
El contrato de esa capacidad limitada necesita aprobación e implementación
específica; no existe actualmente un adaptador que la autorice para inactivos.
No se creará un segundo evaluador RBAC ni un login alternativo.

`lib/b1/mail-envelope.ts` exige código numérico, TTL OTP y contexto de desafío/
método/destinatario verificado. No admite enlaces de 24h: se propone un nuevo
payload cerrado de invitación en el outbox existente, sin reutilizar ni ampliar
el codec OTP. `lib/b1/password.ts:prepareReplacementHash` requiere admission/
corpus checker aprobado y Argon2id B1; si falta, falla cerrado.

## Contrato funcional propuesto

- Administración → Usuarios → Invitar: nombre, email y motivo; requiere
  `create/users` y step-up vigente en tenant derivado de sesión del servidor.
  Roles posteriores se gestionan por Manage Access y su política de delegación;
  no se conceden roles implícitos ni permisos por el enlace.
- El servidor resuelve identidad y pertenencia existentes. No duplica principal,
  credenciales o membresías; no cambia contraseñas ni factores de una cuenta
  existente. No revela pertenencias en otras empresas.
- Una identidad nueva elige su contraseña. Una existente acredita su contraseña
  y factores del principal destinatario; el enlace no es un reset. Una sesión de
  otra empresa no sustituye esa prueba ni la política MFA del tenant receptor.
- El estado pendiente pertenece a la invitación. No se añade un enum de usuario
  ni se reactiva una pertenencia deshabilitada por un administrador mediante un
  enlace: ese caso permanece bloqueado hasta la gestión de estado autorizada.
- Verificar enlace o contraseña no activa ni consume. Si la política exige MFA,
  se comprueba antes de activar; TOTP requiere primer código válido. Cambio de
  política o destinatario durante el proceso invalida la prueba anterior.
- Consumo, activación autorizada y auditoría son atómicos. No se emiten cookies
  de sesión B1. Después se ofrece entrar por el login existente.
- Reenvío invalida el enlace anterior; revocación y expiración impiden aceptar.
  Revocación posterior a consumo no sustituye el flujo de desactivar usuario.

## Contrato técnico propuesto, todavía no habilitado

Todas las rutas siguientes son borradores. Cuerpos cerrados, límites de entrada,
Origin/CSRF, reserva de operación e idempotencia siguen el patrón owned de B1.
Tenant, actor, permisos y estado se resuelven en servidor/PostgreSQL.

| Operación propuesta | Entrada mínima | Resultado permitido |
|---|---|---|
| POST `/auth/users/invitations` | nombre, email, motivo, clave idempotencia | 202 genérico; identificador opaco solo dentro del tenant autorizado |
| POST `/auth/users/invitations/resend` | identificador, versión, motivo | 202; nueva generación, anterior inválida |
| POST `/auth/users/invitations/revoke` | identificador, versión, motivo | confirmación genérica tras commit |
| GET `/invitation` | fragmento con identificador opaco y secreto | pantalla sin consumo ni autoridad |
| POST `/auth/invitations/prepare` | identificador, secreto, prueba de contraseña | capacidad de aceptación limitada, nunca sesión B1 |
| POST `/auth/invitations/factor` | capacidad limitada, prueba del factor | prueba ligada a invitación/generaciones, sin acceso de negocio |
| POST `/auth/invitations/accept` | capacidad, clave idempotencia | confirmación de consumo tras commit; enlace al login |

Propuesta criptográfica: secreto CSPRNG de 32 bytes codificado base64url;
identificador aleatorio independiente; verificador SHA-256 con separación de
dominio y binding de identificador/tenant/destinatario/generación. Comparación
constante. Nunca se almacena el token de aceptación en claro. Solo el worker
recibe el enlace mediante payload cifrado, de propósito separado, con AAD ligada
a tenant/invitación/destinatario/generación/outbox y validación al enviar. Ese
cifrado transitorio no es un verificador alternativo; se elimina al terminar el
envío o invalidar la generación. No se registra en auditoría, logs o analítica.

El secreto viaja en fragmento, se retira de la URL antes de interacción y queda
solo en memoria durante preparación. Página sin recursos/analítica de terceros,
sin referrer, respuestas no-store. GET/prefetch/escáner de correo no consume.
Capacidad de aceptación mediante cookie protegida, opaca y de propósito distinto
a B1; ligada a invitación/principal/tenant/generación/CSRF/versión de política.
Su TTL y límites son parámetros pendientes; no hereda las 24 horas del enlace.

Modelo mínimo futuro: invitación vinculada a tenant y principal/pertenencia
resueltos, destinatario normalizado protegido, verificador, generación, versión,
issued/start/expires/consumed/revoked timestamps y actor/motivo. Se referencia la
identidad B1, su outbox, factores y auditoría existentes. No tablas duplicadas de
usuarios, roles, permisos, sesiones ni credenciales. SQL/ACL se revisarán y
autorizarán individualmente antes de ejecutarse, incluso en CI efímero.

Preparación/consumo bloquearán principal e invitación en orden compatible con B1,
releerán tiempo del servidor, estado, generación, política, credenciales y
factores. Un único ganador ante aceptación/reenvío/revocación concurrentes.
Rollback no deja activación parcial; un reintento de operación ya completada no
crea otra pertenencia ni repite efectos. No se almacena respuesta con secretos.

Errores públicos uniformes para enlace inexistente, expirado, revocado, consumido
o destinatario no válido; detalle solo en auditoría protegida. Límites de envío,
verificación y concurrencia por tenant/actor/destinatario/origen usan los controles
B1; números concretos requieren aprobación. Respuesta administrativa no confirma
existencia global del email. Denegación por defecto, sin bypass por etiqueta rol.

Auditoría: solicitar, emitir/reemitir, revocar, expirar, preparar, fallo de prueba,
consumir y activar con actor/tenant/op correlacionados, fecha, motivo y versiones;
sin token, contraseña, OTP, cookie ni hash de contraseña. Lectura solo por permiso
de auditoría aplicable; no se crea un visor general fuera del alcance aprobado.

## Aprobaciones y evidencias antes de implementar

Se solicita aprobación del contrato completo, en especial: ceremonia limitada
antes de ACTIVE; enlace configurable con propuesta inicial 24h; TTL de capacidad
y cuotas concretas; payload/worker de invitación separado. Ninguno es un valor
de producto aprobado por este documento. No se solicita permiso para persistencia
o envío real. Tras aprobación, se prepararán artefactos SQL y autorización exacta.

Pruebas previstas: nueva/existente identidad, no reset global, MFA según riesgo,
primer TOTP, política cambiada, checker no disponible, token malformado/expirado/
reutilizado, reenvío/revocación concurrentes, doble consumo, rollback, tenant y
destinatario incorrectos, inactivos administrativos, no enumeración, CSRF,
rate-limit, no secretos en URL/logs, outbox de generación obsoleta, UI accesible y
E2E real con PostgreSQL sintético autorizado. Sin PASS hasta ejecutar cada caso.
