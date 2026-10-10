# CLEANOPS 360 — TECHNICAL SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Restricciones técnicas ratificadas
VPS único en Suiza, Docker, PostgreSQL, Redis + BullMQ, archivos en volúmenes persistentes y backups separados en Suiza. No usar n8n ni implementar criptografía propia.


## Capas

Frontend TypeScript con vistas móviles/desktop; API modular y servicios de dominio; persistencia PostgreSQL con tenant_id; workers BullMQ con retries limitados, deduplicación, correlación, observabilidad y cuarentena.


## Transacciones

Los comandos críticos usan idempotency key, transacción atómica, versionado optimista y auditoría. Eventos de dominio usan outbox o mecanismo equivalente con entrega al menos una vez y consumidores idempotentes; elección final documentada antes de implementar.


## Archivos

Ruta privada por tenant, cifrado cuando aplique, validación MIME/magic bytes, escaneo, límites 20/50/100 MB iniciales sujetos a máximo global; descargas autorizadas y auditables. Almacenamiento abstraído para migración futura.


## Aislamiento

Autorización denegación por defecto; explicit deny domina cualquier grant; sesiones con identificador opaco en cookie segura, según AUTHENTICATION_SPEC; JWT no forma parte del contrato de sesión aprobado; DB y Redis sin exposición pública.


## Calidad

Cada vertical slice incluye UI/UX, API real, permiso, persistencia, auditoría, tests, E2E y aceptación humana, sin endpoints huérfanos; pruebas de compatibilidad, seguridad, rendimiento y migración según riesgo.

