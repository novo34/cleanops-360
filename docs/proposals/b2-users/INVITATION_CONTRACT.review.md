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
Su TTL y límites se proponen en la tabla siguiente; no hereda las 24 horas del enlace.

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

## Parámetros definitivos propuestos para aprobación

Todos los valores de esta tabla son recomendaciones de producto, no valores
habilitados. La política B1 existente siempre conserva cualquier límite más
estricto. El servidor calcula expiración/ventanas; ninguna fecha viene del cliente.

| Parámetro | Recomendación concreta | Justificación |
|---|---|---|
| Enlace | 24 horas desde emisión; configurable por tenant entre 1 y 24 horas | Permite completar el alta en una jornada; no permite al tenant ampliar el máximo sin nueva revisión |
| Capacidad limitada | 10 minutos absolutos, sin renovación; nunca después del vencimiento del enlace | Acota el proceso interactivo y no convierte el enlace en sesión |
| MFA verificado | Prueba de esta ceremonia, ligada a generación/política y con antigüedad máxima de 5 minutos al consumir | Evita reutilizar MFA antiguo o de otra finalidad; nunca sustituye el login posterior |
| Contraseña/factor | Máximo 5 fallos combinados por ceremonia y destinatario en 15 minutos; pausa de 15 minutos | Limita adivinación sin bloqueo indefinido de la identidad global |
| Verificación de enlace | 10 intentos por identificador en 15 minutos y 30 por origen en 15 minutos | Acota abuso; un secreto inválido no cambia ni revela el estado de una invitación válida |
| Reenvío | Separación mínima de 60 segundos; 3 envíos por hora y 10 por día por tenant/destinatario | Limita correo repetido; cada reenvío invalida atómicamente enlace y capacidades anteriores |
| Cuotas agregadas | 20 envíos/hora por administrador y 100/hora por tenant, además de límites globales B1 | Evita eludir cuotas individuales con muchos destinatarios |
| Revocación | Efectiva en la siguiente validación/transacción; invalida toda capacidad/outbox pendiente de esa generación | No depende de cachés ni de cerrar la pestaña del invitado |
| Recuperación | Enlace vencido/revocado: nueva invitación autorizada; capacidad vencida: reiniciar con enlace aún válido | No recupera secretos ni extiende la vigencia original |

Los fallos de contraseña/factor conservan también límites por principal y origen
B1: una invitación nueva o un reenvío no reinician sus contadores. No se bloquea
el login ordinario de otros tenants por consumir el presupuesto de una invitación.
Un valor de cuota menor configurado por tenant se admite; no se permiten aumentos
por encima de los máximos propuestos sin revisión. Se contabilizan solicitudes
aceptadas aunque el correo no exista o se suprima, con respuesta pública uniforme.

Si la identidad existente perdió contraseña/MFA, la invitación no los resetea:
se utiliza exclusivamente recuperación B1 y sus gates. Mientras ese flujo no esté
disponible/autorizado, la aceptación queda bloqueada con indicación genérica de
recuperación; no existe bypass administrativo. Perder el factor durante una
invitación nueva exige reiniciar su preparación y enrolamiento autorizado.

## Invariantes B1 y pertenencias en otros tenants

Este contrato **preserva las invariantes de B1 por diseño**: no modifica sus
precondiciones ACTIVE, selección de tenant, emisión/rotación de sesión, MFA,
step-up, guardas owned, ACL/RLS, revocación o evaluador RBAC. La implementación
todavía no existe y esta afirmación no es evidencia de validación ejecutada.

Para un principal existente en otro tenant, la resolución de email es interna.
La credencial y sus generaciones siguen siendo globales y no se reemplazan;
pertenencias, factores tenant y sesiones existentes permanecen intactos. No se
copia un rol ni se acepta una cookie/prueba MFA de otro tenant como autorización
del receptor. Se verifica la credencial del mismo principal y una prueba de
factor aplicable al tenant receptor, ligada a esta invitación. Si se necesita
enrolar un método del receptor antes de ACTIVE, su material permanece en la
ceremonia limitada protegida hasta verificar el primer código; la promoción a las
entidades B1 existentes se realiza con el consumo transaccional. No se escribe un
método utilizable por login ni se activa una pertenencia antes de esa prueba.

La política MFA se calcula en servidor según riesgo/tenant y toda asignación
aplicable existente, sin introducir roles por defecto ni permisos en la invitación.
Una elevación posterior de rol continúa protegida por el writer B1 y su step-up;
el login aplica de nuevo la política vigente. Si no se puede determinar la
política o verificar factor/credencial, se deniega; nunca se interpreta como MFA
opcional. El consumo bloquea y revalida versiones del principal, credencial,
destinatario, invitación, tenant y política; un reset/reenvío/revocación concurrente
invalida las pruebas. No se usa `new_preauth_verified` para pendientes ni se
emite un token compatible con `begin_verified_context`.

La capacidad limitada solo permite preparar/probar/aceptar esa invitación:
no permite listar usuarios, consultar permisos, crear recursos, asumir tenant ni
llamar al broker de negocio. No contiene permisos editables por el cliente. Su
validación y la del MFA reutilizan los controles y primitivas B1, con propósito
criptográfico distinto; el adaptador específico requerirá contrato y pruebas
de ausencia de autoridad, no un motor de autenticación paralelo.

## Aprobación solicitada y evidencias antes de implementar

Se solicita aprobación del contrato completo y de la tabla de parámetros, en
especial ceremonia limitada antes de ACTIVE; enlace configurable inicialmente
24h; recuperación sin bypass y payload/worker de invitación separado. Ninguno es un valor
de producto aprobado por este documento. No se solicita permiso para persistencia
o envío real. Tras aprobación, se prepararán artefactos SQL y autorización exacta.

Pruebas previstas: nueva/existente identidad, no reset global, MFA según riesgo,
primer TOTP, política cambiada, checker no disponible, token malformado/expirado/
reutilizado, reenvío/revocación concurrentes, doble consumo, rollback, tenant y
destinatario incorrectos, inactivos administrativos, no enumeración, CSRF,
rate-limit, no secretos en URL/logs, outbox de generación obsoleta, UI accesible y
E2E real con PostgreSQL sintético autorizado. Sin PASS hasta ejecutar cada caso.
