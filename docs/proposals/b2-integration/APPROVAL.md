# Solicitud independiente — composición SQL14+SQL1+SQL2+SQL3

PENDIENTE DE AUTORIZACIÓN ESPECÍFICA. No ejecutada. No autoriza invitaciones.
El commit inmutable de revisión se indicará en el PR junto a estos hashes.
No se interpreta ninguna aprobación individual previa como aprobación conjunta.

## Artefactos exactos

Todos los bytes se fijan en AUTHORIZATION.review.json, actualmente ownerApproved=false.
El gate exige además coincidencia git show del commit aprobado para cada archivo.

| Archivo | SHA-256 |
|---|---|
| `scripts/b2-directory-postgres.py` | `d968c9621cbd6327d9ce473b434b9bceebb58669c9cb4c60f79306f37027e00b` |
| `docs/proposals/b2-integration/combined-tests.review.py` | `710038fe021b2863338230c09d868712ef06a0864b2dc17058da624d176b58f3` |
| `docs/proposals/b2-integration/workflow.review.yml` | `bc2f34f905d57e26b7d7d3a1e56e16e7655eb4b748c222e5275f055ca9257fce` |
| `scripts/pg-test-01.py` | `15ccd429880bf512f9ec570790df3eb0d00831f1ca1167ee393c7f0d093b5e7e` |
| `scripts/pg-http-integration.py` | `4e77ef4f077f285970ffd9cd40c446def06c1573983ec000ad90c8eed30b788a` |
| `scripts/pg11-rbac-matrix.py` | `f9627f2628da3c1ebf4dfff0653480c0a9115426ce13038887790c4c966d838f` |
| `scripts/b2-browser-backend.ts` | `2e7b8b538d357bf6ec1bc27f99bacf7b15286e6ce5b4de1a92844d444c43c272` |
| `scripts/b2-real-browser-server.mjs` | `c6a937aaa805a2978d27e403acbb9f63261511dc1258e36016ffd74486bb5944` |
| `playwright.b2-access-postgres.config.ts` | `83237058780991aad9c93f2b094c9f504e1d6116d1766b8840559c1d24c440bf` |
| `playwright.b2-users-postgres.config.ts` | `5b7259656591d0a4e9a4ae47dde3ba1dc7a939c9d58a0a637337f4ae0df18798` |
| `e2e/b2-access-postgres.spec.ts` | `6f5a93e3c855a96a41cc0f71c84b59ab08ed5fe94ec839fd1f373d9c6979fc54` |
| `e2e/b2-users-postgres.spec.ts` | `c0f6642dbe2047f00ce7259b8df29a9d1f165392dbdfa1b957caf459b815a664` |
| `docs/RBAC_PERMISSIONS.md` | `f56577c90fd5b6fedde417bf24556367b7369931cf2be38b720aeb3435ecf0b3` |
| `docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql` | `965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa` |
| `docs/proposals/b2-users/001-directory.review.sql` | `8a380379b392536bb986136c997833c57ca4e482de3c418b389b898245e8e31f` |
| `docs/proposals/b2-users/directory-tests.review.py` | `b5d669aad3c61935b89d90fad8ad845cd1fc048125d866d37563ac40123a78fe` |
| `docs/proposals/b2-access/002-effective-access.review.sql` | `d11842d50959ea6e2e90afe8d90d7c327bcbc8ca45685e893c436baae3549efe` |
| `docs/proposals/b2-access/access-tests.r2.review.py` | `72ed26f1e515ef5e7126271a91e9cdfb38575826e861a04b2196ea6e0e7e2550` |
| `docs/proposals/b2-users/003-user-changes.review.sql` | `77c3d298602d1e2a273db104b5ee28d7d4db2c8824558c9b7d1775440bf8df4b` |
| `docs/proposals/b2-users/user-change-tests.r2.review.py` | `1a66ccf3610b01bf840ad1f8a9e01c6917c7fe55ed72123b574008442168e6b2` |

## Diferencias y dependencias

SQL14, SQL1, SQL2, SQL3, ambos fixtures R2, matriz B1 y los E2E originales
permanecen byte por byte como en las aprobaciones anteriores. No se modifica
SQL, función, ACL, grant, RLS ni expectativa de esos artefactos.

Nuevo: combined-tests.review.py encadena access R2 y users R2 en ese orden,
sin restaurar datos ni reiniciar el clúster. Añade fixtures sintéticos y assertions
entre bloques. El runner existente admite combined solo tras una autorización
independiente; tres pruebas adicionales sin BD verifican el bloqueo. El workflow
propuesto está en docs, fuera de .github/workflows: no se ejecuta automáticamente.

Base: SQL14 autorizado (965dc8...), SQL1 f5cf6aa; SQL2 9f4eb74;
SQL3 corregido d16f79f; fixtures R2 147dac36, autorizados individualmente.
El perfil de sesiones 12h/24h procede del fixture B1 SQL13 ya autorizado.
No se añade ningún perfil de seguridad nuevo.

## Operaciones previstas, en un único PostgreSQL16

1. Verificar autorizaciones previas, bytes históricos y todos los hashes antes de
   importar transporte o tocar Docker/SQL. Exigir repo/rama y runner GitHub-hosted,
   ausencia de bindings/credenciales externos y de bases persistentes.
2. Crear únicamente contenedor propio postgres16 con etiqueta aleatoria: network
   none, sin puertos publicados, sin mounts bind/volume y PGDATA/tmp en tmpfs.
   Verificar metadatos y server_version_num. Transporte por socket Unix local
   dentro del contenedor; navegador/Next/TLS del runner solo hablan al transporte
   privado existente. No PostgreSQL TCP ni conexiones externas del contenedor.
3. Instalar SQL14 y SQL1 exactos, fixtures B1 y perfil aprobado 12h/24h;
   instalar SQL2 y luego SQL3 exactos antes de ejecutar cualquiera de sus R2.
   SQL2 factoriza un único evaluador privado y añade dos lecturas con sus EXECUTE
   identity. SQL3 añade profile_version/check/trigger/helpers, amplía el detalle,
   crea change_user_owned y sus grants originales (EXECUTE identity;
   UPDATE(display_name,state) solo broker). No DDL/ACL adicional a esos paquetes.
4. Ejecutar access R2 intacto: permisos/tenant/delegación, asignación auditada,
   deny desde UI, temporales/expiración/revocación y matriz B1 intacta.
5. Nuevos fixtures: un documento, dos roles, reglas sintéticas ALLOW y pertenencia
   activa del sujeto U. Con actor U, writer B1 change_access_owned y ownership,
   asignar/revocar rol del sujeto V y crear/revocar override; comprobar acceso
   efectivo inmediato y auditoría actor/motivo/before/after para cada operación.
   Estos inserts son solo datos sintéticos del clúster de prueba, no seeds reales.
6. Ejecutar users R2 intacto: permisos, MFA, CAS concurrente, rollback,
   edición, desactivación, revocación tenant y reactivación. En sus límites
   transaccionales verificar además versión+conteo de auditoría sin cambios tras
   rollback; permisos efectivos false mientras U está DISABLED aunque conserve
   reglas/roles activos; permisos proyectados tras reactivar pero token antiguo
   rechazado; foreign subject indistinguible de ausente. Self-disable se mantiene
   al final para no invalidar los actores de pruebas anteriores.
7. Reutilizar los dos E2E Chromium sin cambios, ambos con los cuatro SQL instalados:
   Manage Access → API real → deny persistido → resultado visible; edición/estado
   → API real → PostgreSQL → confirmación y tres auditorías durables. Sin mocks.
8. Guardar report sanitizado conjunto, resultados de ambos E2E y capturas sintéticas.
   Eliminar únicamente contenedor con etiqueta propia verificada y comprobar que
   inventarios previos de contenedores/redes/volúmenes no cambiaron. Cualquier
   FAIL/SKIP impide PASS global; no cambia FAIL R1 ni evidencias separadas R2.

## Cobertura y límites de aceptación

REQ-AUTHZ-001/002: siete acciones y ámbitos, matriz B1 original; 003: overrides;
004: temporales; 005: ruta UI Manage Access; 006: backend/SQL; 007: deny,
revocación y tenant. Edición/estado: CAS, MFA, auditoría, rollback y sesiones.
La composición sigue SKIP_PENDING_OWNER_APPROVAL; preparar/parsear no es ejecutar.
Invitación/alta permanece DESIGN_ONLY hasta aprobar su contrato y SQL específico.
Esto no acredita B2-TECH-READY ni aceptación/staging. Revisión independiente
según AGENTS.md pendiente antes de cierre.

## Autorización solicitada

Autorizar exclusivamente esta composición y los nuevos fixtures del commit que
figura en la solicitud del PR, con los hashes anteriores, en GitHub Actions
PostgreSQL16 efímero, sin red y con datos sintéticos. Tras aprobación se registrará
ownerApproved=true/referenceCommit y se instalará el workflow revisado, sin alterar
los artefactos fijados. No incluye invitaciones, bases persistentes, B1 real,
closedBackend, AUTH-GATE-05, Hostinger/Suiza, staging/main, despliegues ni merges.
