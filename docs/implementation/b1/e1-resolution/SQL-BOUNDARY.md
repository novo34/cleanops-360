# Frontera de instalación tras E1 — no reabrir decisiones aprobadas

Arquitectura aprobada en la adenda canónica E1. Este archivo identifica cambios
que el SQL05 exacto autorizado todavía NO contiene; no autoriza instalarlos.
No se modifica generador/SQL/ACL para obtener un PASS parcial.

## Permite ejecutar ya, SIN SQL nuevo

- auth_api.begin_totp_enrollment_assigned(text,uuid,uuid,uuid,bigint,bytea,text,text,uuid).
- auth_api.totp_material_locked(text,uuid,text) y consume_enrollment_cas(text,uuid,bigint,bigint,bigint,bytea[],uuid).
- issue_active_session(...), reservas owned y auditoría existentes en una conexión/tx.
- Enrolamiento PREAUTH, primer código, activación CAS, lote HMAC de recovery codes,
  presentación única y cookies tras COMMIT. Claves solo efímeras en el ensayo aislado.

## D4: contrato persistente mínimo pendiente de SQL/ACL exactos

Defectos contractuales demostrables en SQL05:
1. No existe entidad/columna que acredite verificación y generación de destinatario.
   trusted_mfa_material devuelve dirección, no prueba de buzón. EMAIL ACTIVE no basta.
2. auth_api.claim_mail(bytea) devuelve tenant_id/id/ciphertext/key_version, pero no
   representa revalidación de destinatario/método por generación antes del envío.
3. auth_api.finish_mail(uuid,uuid,bytea,boolean) solo distingue delivered true/false;
   UNKNOWN se trataría como PENDING y permitiría reenvío ciego. No existe QUARANTINED.
4. finish_mail avanza available_at también en terminales y puede violar expires_at>available_at.

Especificación del reemplazo REVIEW ONLY (no funciones instaladas):
- Resolución de destinatario verificado ligada a tenant/user/method/method_version y
  recipient_version, con origen de verificación versionado y revocación.
- claim_mail_v2(bytea,uuid) → TABLE(tenant_id uuid,outbox_id uuid,challenge_id uuid,
  user_id uuid,method_id uuid,method_version bigint,recipient_version bigint,
  payload_ciphertext bytea,key_version text,expires_at timestamptz,attempts integer).
- revalidate_mail_claim(uuid,uuid,bytea,uuid) → boolean: mismo lease/owner, expiración,
  empresa/usuario vigentes, método ACTIVE y versiones exactas, destinatario verificado,
  reto ISSUED no agotado. False impide envío, sin revelar dirección ni OTP.
- finish_mail_outcome_cas(uuid,uuid,bytea,text,uuid) → boolean: ACCEPTED/TRANSIENT/
  PERMANENT/UNKNOWN; UNKNOWN→QUARANTINED sin reclaim/retry; transient solo si
  now+retry<expires y dentro del presupuesto. Terminales no desplazan available_at.
- EXECUTE solo cleanops_mail_worker; PUBLIC revocado; sin tablas, memberships,
  BYPASSRLS ni nuevas facultades del runtime. Revocar legacy finish_mail/claim_mail
  al instalar el reemplazo conjunto. SECDEF owner broker, search_path pg_catalog.
- Orden compartido emisor/worker: política → organización/principal/usuario → método
  → destinatario verificado → reto → outbox. Relectura bajo locks, idempotencia owned,
  auditoría y completion en la misma tx; SMTP fuera de tx, CAS de lease posterior.
- Cifrado concreto implementado en mail-envelope.ts, pero sin llamarlo autorización:
  AAD mail separado incluye tenant/user/method/version/destinatario-generation/
  outbox/challenge/key-version. El worker no puede usar una generación obsoleta.

La especificación debe materializarse como UNA versión consolidada completa con
DDL/RLS/funciones/ACL/diff y hashes antes de solicitar autorización de instalación.
No se solicita aprobación de instalación de firmas sin cuerpos ni se declara EMAIL integrado.
La fuente operativa de verificación de buzón continúa por identificar, según E1.

## Recuperación/reset/trusted device/AUTHZ

consume_recovery_internal(text,bytea,uuid) NO tiene grant de caller por diseño,
y solo consume el digest: no cambia PREAUTH a VERIFIED ni crea protocolo de recovery.
No se concede EXECUTE ni se llama como superusuario desde un flujo funcional.
Los 14 HTTP actuales no incluyen recovery/reset/trusted-device/admin-RBAC.

C-SCOPE aprobado obliga a implementar todos esos contratos en B1. La próxima versión
consolidada debe contener protocolo de recuperación con estado restringido de re-enrolado,
consumo CAS, revocación de sesiones/métodos/confianza previa, nueva emisión de códigos,
reset administrativo con permiso privilegiado+step-up+motivo+prueba de identidad y
DENY prevalente, asignaciones/grants empresariales y evidencias. Nunca convertir un
recovery code en un grant general ni asignar privilegios administrativos a B1-SELF.
Primero fijar permisos y firmas conforme RBAC_PERMISSIONS/SRS; después aprobar SQL/ACL
exactos antes de ejecutar. Recuperación de pérdida total requiere operador/procedimiento
real de comprobación de identidad, no una respuesta correcta inventada por el cliente.

El lote recovery HMAC y su presentación única sí se completan junto al enrolamiento
actual. No confundir esa entrega con recuperación/reset/trusted-device ya implementados.

## Rotación de PREAUTH al elegir empresa

El switch desde ACTIVE tiene primitives existentes. El caso PREAUTH necesita rotar
cookie/CSRF preservando la versión de contraseña verificada y revalidando membresía,
empresa, método/política y estado, con consumo de binding anterior e idempotencia en
la misma transacción. La versión05 no aporta esa primitiva de rotación segura.
No se reutiliza el cookie viejo ni se fabrica una nueva prueba de contraseña en TS.
Debe incluirse en la misma revisión consolidada, sin instalar parches intermedios.
