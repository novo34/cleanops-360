# Propuesta única: invitación personal, sin contraseña temporal

Pendiente de aprobación de producto. No implementada. No autoriza SQL, ACL,
envíos de correo, activación B1 ni cambios persistentes.

1. Un administrador con `create/users` en la empresa y step-up MFA vigente invita
   por nombre/email e indica motivo. El tenant procede del contexto del servidor.
   Se reutilizan el principal y la pertenencia existentes cuando corresponda;
   no se duplica identidad ni se cambia la contraseña de una cuenta existente.
   La respuesta no revela si el email ya pertenece a otra empresa.
2. Se envía un enlace personal con secreto aleatorio criptográfico de un solo uso.
   Solo se guarda su digest, vinculado a invitación, destinatario y tenant. Propuesta
   de vigencia para aprobación:24 horas; reenvío invalida el anterior y revocación
   administrativa impide consumirlo. Un GET nunca consume ni activa la invitación.
   El secreto no se conserva en logs, auditoría, analítica o almacenamiento del
   navegador. La pantalla lo retira de la URL y lo presenta por POST protegido.
3. La persona acepta explícitamente. Si es una identidad nueva, establece su
   primera contraseña, con los mismos controles y Argon2id de B1; nunca se envía
   una contraseña por correo ni el administrador puede elegirla/verla. Si la cuenta
   ya existe, debe autenticarse con B1 y probar que es el principal destinatario;
   la invitación no resetea ni sustituye sus credenciales o factores.
4. El consumo y la activación de la pertenencia son atómicos y auditados. El enlace
   no emite una sesión ni concede acceso a datos. Para entrar se sigue el login,
   selección de empresa y MFA de B1; TOTP no se activa hasta el primer código
   verificado y EMAIL OTP conserva su vigencia aprobada de5 minutos. Se exige MFA
   según REQ-AUTH-002 y step-up en acciones sensibles según REQ-AUTH-047. Una
   invitación nunca convierte un estado de preautenticación en sesión autorizada.
5. Roles/reglas usan exclusivamente el RBAC existente y sus límites de delegación;
   no hay rol administrador por defecto ni bypass de deny o tenant. Alta,
   aceptación, reenvío, expiración y revocación dejan trazabilidad sin secretos.
   Mensajes genéricos, límites de envío/intentos existentes y reintentos seguros
   evitan enumeración, abuso y doble consumo. Aceptar dos veces no duplica efectos.

Las pertenencias pendientes se identifican por la invitación, sin añadir un estado
no aprobado al enum de usuarios. Su acceso permanece bloqueado hasta aceptación;
el detalle técnico de activación deberá respetar las precondiciones de B1. La
entrega de correo reutilizará el outbox/worker existente con una plantilla cerrada
que requiere su contrato revisado; no se reutiliza un OTP como contraseña.

Al aprobar esta propuesta se prepararán contratos y pruebas de nueva/existente
identidad, MFA, expiración, revocación, doble consumo, límites y aislamiento. Sus
SQL/fixtures/ACL tendrán una solicitud independiente antes de cualquier ejecución.

## Compatibilidad verificada — 2026-10-21, base B1 569975aa

Product Master V3 §143 decisiones12/13 y SRS V1.1 REQ-AUTH-002/011/021/047
coinciden: MFA según riesgo, EMAIL OTP5 minutos, TOTP solo tras verificar el
primer código y step-up sensible. El token de invitación no es un OTP ni una
sesión; sus24 horas son una propuesta pendiente, no una duración ya aprobada.
No se ha encontrado contradicción normativa con esta separación.

**Incompatibilidad técnica concreta:** `lib/b1/mail-envelope.ts:10–29` admite
solo recipient/code/issuedAt/expiresAt, código numérico, TTL de EMAIL OTP y contexto
de método/desafío MFA. Una URL de invitación de24h y una identidad sin método MFA
no cumplen ese contrato. No se puede enviar mediante el codec/worker OTP sin
cambios. Será necesario aprobar un contrato de plantilla/invitación específico
dentro de la infraestructura existente, manteniendo intactas las restricciones OTP.

**Orden obligatorio:** SQL14 `new_preauth_verified` y `lock_memberships` exigen
credencial y pertenencia ACTIVE; una invitación pendiente no permite iniciar esa
ceremonia. La aceptación inicial debe crear/verificar credencial y activar la
pertenencia atómicamente antes de entrar al login B1 existente, como propone el
paso4. El enlace por sí mismo no puede llamar a la emisión de sesiones.

**Contraseña:** `lib/b1/password.ts:20–33` exige un admission/corpus checker
aprobado y falla cerrado si no está disponible. Reutilizar Argon2id no sustituye
ese control. No se añadirá una política permisiva ni una contraseña administrativa.

Estas restricciones se presentan antes de implementar: no hay endpoints,
plantillas, envíos, DDL o permisos de invitación habilitados.
