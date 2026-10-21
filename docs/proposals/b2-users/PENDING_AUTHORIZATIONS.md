# Autorizaciones individuales y resultados

Estado actualizado2026-10-21: SQL2 y SQL3 AUTORIZADOS INDIVIDUALMENTE por las dos
respuestas expresas a sus respectivas solicitudes. La primera ejecución R1 fue
FAIL y se conserva en first-authorized-execution.json. Los dos fixtures R2 de
147dac36 también están autorizados individualmente, con sus hashes exactos y
SQL originales intactos; SQL2-R2 PASS (166/166) y SQL3-R2 PASS (44/44),
ejecución Actions39548304721. Evidencia: ../../implementation/b2/r2-authorized-execution.json.
Registros verificables: `../../implementation/b2/access-authorization.json` y
`../../implementation/b2/users-authorization.json`. La autorización f5cf6aa sigue
limitada a SQL1. La respuesta SQL3 omite caracteres del SHA escrito; el registro
conserva el commit completo y los dos hashes inequívocos de la solicitud respondida.
Antes de ejecutar cualquiera: comprobar hashes exactos, autorización de SQL14 y
SQL1, runner GitHub-hosted, inventario previo, contenedor propio PostgreSQL16 sin
red/puertos/mounts persistentes y ausencia de bindings/credenciales externos.
Si falla una comprobación no se instala ningún paquete. Solo datos sintéticos;
limpieza e inventario posterior obligatorios. Sin Hostinger, Suiza, B1 real,
staging/main ni merges. Autorizar uno no autoriza el otro.

## SQL2 — Manage Access

Commit de revisión: `9f4eb74af74d4b5c2420d2ff1c602e79c41cc6b5`.

| Artefacto | SHA-256 |
|---|---|
| `docs/proposals/b2-access/002-effective-access.review.sql` | `d11842d50959ea6e2e90afe8d90d7c327bcbc8ca45685e893c436baae3549efe` |
| `docs/proposals/b2-access/access-tests.review.py` | `a5fe0da1cc46276992c3e9d53671cd2597ff349dfa776b6c4f06b393171c5a42` |

Operaciones: crear función privada `identity_private.evaluate_user_access(uuid,text,text,uuid)`
con el cuerpo mecánicamente extraído del evaluador SQL14; reemplazar
`auth_api.effective_access(text,text,uuid)` por delegación a ese único cuerpo;
crear `auth_api.user_effective_access(uuid,text,text,uuid)` y
`auth_api.assignable_role_catalogue(uuid,uuid)`. Establecer propietario broker,
revocar ejecución pública/runtime/mail y ejecutar las dos funciones nuevas solo
desde `cleanops_identity_service`. El helper privado tampoco permite EXECUTE al
identity service. No tablas, roles, grants de negocio ni segundo motor RBAC.

Base: SQL14+SQL1 autorizados. Pruebas nativas y Chromium: actor distinto del sujeto,
scope y tenant, sobredelegación denegada, catálogo/asignación auditada, override
DENY persistido desde UI, futura vigencia, expiración, revocación, sujeto inactivo,
ACL privada y matriz B1 original íntegra, blob `45c144c9640388b22cf9a62dab96f30bd329fd86`.
Detalle completo: `../b2-access/APPROVAL.md`. SQL3 no es dependencia de esta prueba.

## SQL3 — edición/estado de pertenencia

Commit corregido de revisión: `d16f79f3f8748e08ee6a5354c6c9b6668da60666`.
El candidato anterior de a0be110 no está vigente y no se ejecutó.

| Artefacto | SHA-256 |
|---|---|
| `003-user-changes.review.sql` | `77c3d298602d1e2a273db104b5ee28d7d4db2c8824558c9b7d1775440bf8df4b` |
| `user-change-tests.review.py` | `dcf477a07b324b7ea2aa5d68cf4356a195116a4322e1bd0b088fb5da1fcc234c` |

Operaciones: añadir `app.users.profile_version bigint NOT NULL DEFAULT1 CHECK>0`;
crear trigger `user_profile_version` y función privada
`identity_private.bump_user_profile_version()`; crear helper privado
`identity_private.user_profile_version(app.users)`; reemplazar
`auth_api.administration_user(uuid)` para incluir versión/capacidad de edición;
crear `auth_api.change_user_owned(jsonb,bytea,bytea,uuid)`. Propietario broker,
helpers sin EXECUTE público/runtime/identity/mail; función de cambio con EXECUTE
solo identity service; `GRANT UPDATE(display_name,state)` solo al broker existente.
No UPDATE directo de tablas para identity service, usuarios/sesiones duplicados
ni cambios de credenciales compartidas.

Base: SQL14+SQL1 autorizados. Pruebas nativas y Chromium: permisos, MFA, ownership,
CAS y dos conexiones concurrentes, rollback, auditoría actor/motivo/before/after,
edición desde UI, desactivación/reactivación, revocación de sesiones/confianza/
preauth/challenges solo del tenant, otra pertenencia intacta, no resurrección de
sesiones, versión monotónica y self-disable con journal sin respuesta almacenada.
Detalle completo: `USER_CHANGES_APPROVAL.md`. SQL2 no es dependencia de esta prueba.

Ambos candidatos pasaron gramática y ejecución nativa PG16 con persistencia, ACL
y Chromium reales en sus R2 autorizados. Las ejecuciones autorizadas usan
dos jobs y contenedores separados; ninguno instala el otro paquete.

Pendiente real: aprobar INVITATION_CONTRACT.review.md antes de implementar altas
por invitación. No se ha solicitado ni ejecutado instalación conjunta SQL2+SQL3;
los PASS separados no acreditan esa composición ni B2-TECH-READY.
