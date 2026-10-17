# Incremento UI/API/PG — estado de ejecución

- Base: 318a77f4fc67623810e6fdfa080bb2fe0da0ecae; primer commit fda096b762b4bd1e35c951e9aae545bbf1f39e61.
- UI: reintentos idempotentes de mutaciones, limpieza de ceremonia y campos de sesión reales.
- Pruebas nuevas unitarias: 3 PASS (node --experimental-strip-types --test --test-isolation=none tests/b1/ui-request-keys.test.ts).
- Sintaxis: py_compile de los dos módulos Python modificados, node --check del proxy TLS y Node strip-types --check del backend de prueba: PASS.
- Pruebas estáticas locales: 17 PASS / 3 SKIP (pglast no instalado). No se atribuye nueva aceptación SQL ni se repiten las 294 comprobaciones PostgreSQL/HTTP aprobadas.
- Regresión Chromium de pérdida de respuesta logout y E2E real UI/API/PG: preparados, NO EJECUTADOS.
- CI nuevo: la API actions/runs?head_sha=fda096b762b4bd1e35c951e9aae545bbf1f39e61 devuelve workflow_runs vacío. Check de Vercel no se considera prueba B1. No se ha solicitado despliegue.
- Instalación local bloqueada: npm ci falla connect EPERM hacia el proxy 172.31.0.157:8080; el intento de permiso de red quedó interrumpido sin resultado. No hay dependencias locales para lint/typecheck/Vitest/build/Chromium.
- El conector disponible permite leer logs y reintentar jobs anteriores, pero no ofrece workflow_dispatch ni ejecución de un nuevo workflow para este HEAD. No reejecutar un run antiguo para atribuir su resultado al código nuevo.
- No se han creado contenedores para este incremento: E2E pendiente de runner. El harness prepara eliminación por label propia y comprobación de recursos preexistentes.
- SQL/ACL/canónicos sin cambios; closedBackend, EMAIL/enrolamiento dependiente y AUTH-GATE-05 permanecen cerrados/OPEN según corresponda.

Siguiente acción técnica: ejecutar el workflow B1 real browser PostgreSQL isolated para el HEAD publicado en un runner autorizado; comprobar primero lint/typecheck/build y después el test real con scripts/pg-b1-browser.py. No declarar PASS hasta recibir el reporte depurado y limpieza PASS. Las decisiones humanas concretas independientes están en E1-DECISIONS.md.
