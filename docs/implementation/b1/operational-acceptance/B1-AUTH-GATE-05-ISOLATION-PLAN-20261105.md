# B1 — plan de aislamiento y habilitación de ensayo tras diagnóstico AUTH_GATE_05

**Fecha:** 2026-11-05 · **Estado:** PREPARACIÓN, SIN ACTIVACIÓN · **Entorno objetivo:** ensayo B1, `cleanops.nuvurent.com`, nunca producción.  
**No constituye aprobación de corte, cambio SQL, exposición pública ni cierre del gate.**

## 1. Causa demostrada y controles ya resueltos

El propietario ejecutó una consulta `SELECT auth_api.security_policy()` desde el shadow `cleanops360-b1-shadow-cc51574a` con el usuario de servicio, obteniendo error exacto `AUTH_GATE_05`, SQLSTATE `42501`, sin mutaciones. El SQL de `docs/canonical/auth-review/v4/b1-review-only.sql` y `docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql` demuestra que `auth_api.security_policy()` llama a `identity_private.require_enabled()`; este gate exige una fila singleton en `identity_private.configuration` con `deployment_enabled=true` y, de lo contrario, eleva `AUTH_GATE_05` con `42501`. La conclusión está corroborada por el nombre de error real, pero aún debe verificarse el alcance de consumidores de la base antes de modificar el gate.

PASS ya obtenidos; **NO repetir**: shadow running sin reinicios; socket/ingress mTLS y Traefik 3.7.17; rollback de los dos routers UI de dispositivo; original `/login` HTTP 200; ausencia de aserción denegada; sink OpenBao tmpfs + UID/GID/modos; cinco lecturas de claves KV correctas; TLS/usuario y conexión PG, rol contractual, esquema USAGE y función EXECUTE + SECURITY DEFINER. SQL0002/0003 y evidencias de operador, tests aislados y otros antecedentes permanecen en las fichas existentes.

El router B1 principal para `/auth/`, `/mfa/` y `/me/` sigue instalado según último PASS, pero no existe aceptación funcional de login, preauth, CSRF, TOTP, sesiones o replay; `AUTH-GATE-05 OPEN`. La web original usa su backend cerrado y no debe reemplazarse ni redeplegarse.

## 2. Restricción de seguridad derivada del código

El campo `deployment_enabled` en `identity_private.configuration` es un control **por base de datos**, no por navegador, cookie, prefijo de ruta ni usuario. Activarlo en `cleanops_staging` puede abrir operaciones en cualquier consumidor que use esa misma base y el contrato. La aparente ausencia de tráfico ajeno no demuestra aislamiento continuo. Por tanto **prohibido ejecutar** `UPDATE ... SET deployment_enabled=true`, `INSERT` de configuración, `SET ROLE`, `GRANT`, DDL, cambiar `require_enabled()`, o forzar retorno de política en el VPS compartido como atajo.

## 3. Decisión técnica previa

**Camino preferido:** instancia PostgreSQL aislada para B1 de pruebas, no publicada, con roles y SQL autorizados y fixtures sintéticos; manifest B1/credenciales/alcance de red versionados y revisados; separación del runtime B1 respecto de las conexiones y los datos de la web original. El aprovisionamiento y la topología deberán planificarse a partir de inventario, capacidad y procedencia de las migraciones ya auditadas, nunca improvisar una clonación de datos reales. Para OpenBao: cuenta/tenant de pruebas, versiones y permisos de claves explícitos bajo custodia aprobada; no reutilizar ni exportar material secreto sin autorización. Si el objetivo ya usa una base realmente dedicada exclusivamente a B1, evaluar alternativa de activación acotada **solo después de demostrar esa exclusividad con inventario de servicios y permisos, ventana de mantenimiento y rollback**; no presuponerla.

La base PostgreSQL separada no es suficiente si comparte material/confianzas de claves y usuarios sin separación de ámbito. El manifest privado de runtime es un artefacto de autoridad con controles de UID/GID/SHA: nunca modificarlo directamente para cambiar destinatarios o contraseñas.

## 4. Secuencia de trabajo (cada paso tiene autorización y salida propia)

| Fase | Solo acciones autorizables tras revisar | Criterio de salida |
| --- | --- | --- |
| A · Inventario read-only | Identificar servicio PG, consumidores del mismo DB/rol en vivo y por configuración aprobada, conexiones y redes; sin mostrar host/identidades/secretos | Se determina si DB es exclusiva, compartida o `NO_ACREDITADO`; no inferir exclusividad de conexiones instantáneas |
| B · Contrato de ensayo | Especificar PG/roles/fixtures/tenant/baos/ingress/manifest/routers y catálogo, hashes de procedencia, rollback, copia de seguridad y aprobación independiente | Paquete exacto revisable sin tocar VPS |
| C · Preparación aislada | Solo con autorización explícita: aprovisionar almacenes separados, montar candidato aislado sin puertos públicos, validación negativa | Integridad, readiness y no impacto en original |
| D · Apertura limitada | Solo en DB de ensayo acreditada y con aprobación de cambio: habilitar configuración bajo identidad DBA autorizada, snapshot reversible | `security_policy()` coincide con `lib/b1/config.ts`; sin abrir otras DB |
| E · Prueba funcional única | UI B1 separada/corregida, bootstrap preauth/CSRF, password, MFA TOTP, sesiones, revocación, replay y cierres negativos; observación controlada | Test E2E PASS o rollback inmediato |
| F · Aceptación | Reviewer independiente de los bytes reales, Product Owner y evidencia por SHA | Recién entonces evaluar cambio de estado del gate; PR #33 permanece draft hasta autorización separada |

**Reversión:** retirar únicamente routers B1 añadidos, conservar original `/login` y su backend, cerrar `deployment_enabled` únicamente en la DB de ensayo usando un cambio previamente revisado, invalidar credenciales de prueba mediante canal de operador autorizado y detener solo contenedores del ensayo. No borrar bases, volúmenes, claves ni reconstruir PostgreSQL de producción. No usar el rollback de los routers UI ya ejecutado como procedimiento para futuros archivos diferentes.

## 5. Próxima acción concreta, estrictamente read-only

Obtener un inventario **sin imprimir secretos ni nombres de usuarios** de los clientes actualmente conectados a la misma base desde el contenedor shadow, usando una conexión PG independiente y un `SELECT` sobre `pg_stat_activity` que proyecte únicamente conteos por clase (`cleanops-identity-staging`, otras aplicaciones, sin etiqueta). Esta vista muestra conexiones activas al instante; NO prueba que no haya consumidores desconectados ni conexiones de otros días. Complementar posteriormente con Compose/servicios y credenciales montadas por configuración. Si la consulta requiere privilegios no presentes, marcar `NO_ACREDITADO` y usar al DBA autorizado, sin nuevos grants.

No repetir las pruebas PASS, no emitir nueva cookie, no tocar Traefik, SQL ni OpenBao. Registrar únicamente categorías agregadas y el SHA de este plan. 

## 6. Inventario de sesiones PostgreSQL (05/11/2026)

La lectura de `pg_stat_activity` hecha por el propietario con la identidad real del shadow devolvió:

```text
B1_DB_CONEXIONES=0
B1_DB_CONEXIONES_B1=0
B1_DB_SIN_ETIQUETA=0
B1_DB_OTRAS_APLICACIONES=0
B1_DB_VISIBILIDAD=LIMITADA
B1_CAMBIOS=NINGUNO
B1_SECRETOS=NO_EXPUESTOS
```

**Interpretación acotada:** cero otros backends reportados en el instante de muestreo y visibilidad insuficiente para acreditar exclusividad de uso, configuración, conexiones históricas o futuras. Queda `B1_DB_EXCLUSIVIDAD=NO_ACREDITADA`. No promover el gate, ni conceder `pg_read_all_stats`. Próxima lectura: inventariar contenedores Docker (running/stopped) y redes de la base, identificar el contenedor PostgreSQL por el destino/alias del `installation.json`, comparar la red del shadow y la web original, y contar posibles consumidores por nombres de variables (nunca sus valores). Esta evidencia tampoco prueba exclusividad definitiva; contrastar Compose/Dokploy efectivos antes de una decisión operativa. Ninguna configuración ni datos modificados.
