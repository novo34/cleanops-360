# B1 — avance de integración de configuración privada (2026-10-30)

Estado: **PREPARACIÓN EN RAMA; NO INTEGRADO NI DESPLEGADO**.

Rama: `prep/installation-catalog-20261030`. Base de autenticación: `579423e898c10bbd4f945420092f2e2398566cdf`.

## Material preparado
- `installation-catalog.ts`: referencias fijas de cinco claves KV-v2; sin secretos.
- `installation-config.ts`: valida entradas y catálogo. El alcance explícito actual es staging; **no sustituye el mismo contrato canónico de aplicación entre entornos**.
- `private-file.ts` / `private-material.ts`: lectura de archivos privados; fallan cerrados.
- `installation-bootstrap.ts`: reúne inputs y archivos. No selecciona backend, no abre conexiones ni habilita HTTP.
- Pruebas B1 de esos módulos: creadas; **sin evidencia de ejecución de la suite del repositorio para esta rama**.

## Pendientes para aceptar y desplegar
1. Ejecutar `npm run typecheck` y pruebas B1 focalizadas en un checkout real; corregir fallos.
2. Reconciliar implementación staging con la exigencia de un mismo contrato de instalación staging/producción, sin variables ni vías de activación improvisadas.
3. Revisar montajes privados y permisos de la web en el Compose operativo de Dokploy, preservando los bytes locales de PostgreSQL/TLS/HBA.
4. Resolver la composición HTTP autorizada; `runtimeHandler()` permanece en `closedBackend`.
5. Aceptar Agent (auto-auth cert, sink, renovación y revocación), construir la imagen web acreditada.
6. Ejecutar FIRST-ACTOR solo tras aprobación separada y después probar login → TOTP → sesión en staging.

No marcar producción aprobada, login operativo o despliegue completado. Los resultados finales deben incorporarse al procedimiento canónico `OPENBAO-STAGING-01.md`, Product Master, SRS y TODO conforme a sus fuentes existentes, con commits, checks y evidencia sin secretos.
