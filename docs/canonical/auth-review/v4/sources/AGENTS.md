# AGENTS.md — CleanOps 360

## Alcance
Este repositorio es **solo** CleanOps 360. No tocar la web corporativa Espacore ni otros proyectos.

## Autoridad documental
- `docs/CLEANOPS_360_PRODUCT_MASTER_V3.md` y `docs/CLEANOPS_360_SRS_V1_1.md`: normativa de producto.
- `docs/ROADMAP.md`: orden y dependencias.
- `docs/DELIVERY_PLAYBOOK.md`: método de ejecución y aceptación.
- `docs/IMPLEMENTATION_GATES.md`: precondiciones y bloqueos.
- Leer las especificaciones pertinentes a la tarea, no toda la biblioteca en cada turno.
- No inventar ni modificar decisiones normativas sin aprobación expresa.

## Proceso obligatorio
1. Planificar la **siguiente funcionalidad autorizada**, con requisitos y gates identificados.
2. Implementar **vertical slice completo**: UX/UI, frontend, backend, datos, autorización, auditoría y pruebas.
3. Probar rutas reales; no aceptar interfaces simuladas ni APIs sin consumidor o finalidad interna justificada.
4. Abrir PR acotado con alcance, requisitos cubiertos y evidencia de pruebas.
5. Someter el PR a Codex; resolver hallazgos críticos/altos y revalidar hasta quedar sin bloqueantes.
6. Solicitar aprobación del propietario antes de aceptar la fase o pasar a la siguiente.

## Seguridad y arquitectura
Respetar aislamiento multi-tenant; DENY explícito prevalece; secretos fuera de Git; residencia de datos en Suiza; decisiones aprobadas de PostgreSQL, Redis/BullMQ, Docker, archivos privados y backups. No desplegar datos reales sin gates de seguridad y privacidad satisfechos.

## Primer encargo
Leer documentación de Fase 0 y presentar únicamente su plan verificable. No escribir código hasta recibir autorización.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

