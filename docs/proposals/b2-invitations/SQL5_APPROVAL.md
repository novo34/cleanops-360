# SQL5 — aceptación limitada (pendiente de autorización)

Paquete exacto: `sql5-manifest.review.json` identifica SHA-256 de SQL4 intacto,
SQL5, fixtures y runner. El commit publicado que contiene este documento fija sus
bytes. No se ha ejecutado SQL5 ni se ha instalado un adaptador productivo.

Operaciones nuevas: unicidad global del identificador opaco de invitación; dos
columnas de política sin defaults productivos; una tabla privada de capacidades;
cuatro helpers privados y siete funciones `auth_api`. Broker recibe CRUD de la
tabla nueva e INSERT en principales/credenciales/usuarios/recursos existentes.
Solo identity recibe EXECUTE de las siete funciones; PUBLIC/runtime/mail quedan
excluidos. No se reemplazan funciones, precondiciones ni emisores de sesiones B1.

La ceremonia verifica contraseña mediante B1 y TOTP mediante sus primitivas,
mantiene capacidad de 10 minutos y prueba MFA de hasta 5 minutos. Consume y activa
transaccionalmente; no asigna roles/permisos ni emite sesiones. La rama de identidades ya existentes queda bloqueada: su prueba de factores
previos todavía no está implementada. No se sustituye por enrolar un factor nuevo
ni se cambian contraseña, factores o sesiones de otros tenants. Una
pertenencia existente, incluida DISABLED, impide activación mediante invitación.

Ejecución propuesta: `scripts/prepare-b2-composition-approval.py`, seguido del
runner SQL5 revisado, únicamente en GitHub Actions alojado y PG16 efímero sin red,
puertos, volúmenes ni credenciales externas, con limpieza y reporte del harness
aprobado. Dependencias exactas SQL14+SQL1+SQL2+SQL3 y SQL4. La autorización pedida
incluye instalar SQL4 como dependencia en este nuevo contenedor; **no** repetir
su suite histórica de 260 comprobaciones. SQL4 y los paquetes anteriores no cambian.

Los fixtures SQL5 prueban ACL, validación de enlace, ausencia de usuario antes de
MFA, preparación, CSRF, CAS, rollback, activación, idempotencia, tenant y auditoría.
Usan hashes/ciphertext sintéticos: no acreditan criptografía ni E2E. Los tests
unitarios HTTP/servicio son independientes de SQL. El E2E de aceptación con
PostgreSQL real sigue pendiente y necesitará artefactos revisables adicionales.

El alcance funcional validable de este paquete se limita a identidades nuevas.
La aceptación de identidades existentes y los E2E completos permanecen pendientes.

Autorizar este manifiesto permite exclusivamente esa composición y sus fixtures
en PG16 efímero. No autoriza correo real, bases persistentes, B1 real, despliegues,
merges ni cambios de staging/main. El runner falla antes de SQL si falta un
registro explícito de autorización, un hash o la coincidencia con el commit.
