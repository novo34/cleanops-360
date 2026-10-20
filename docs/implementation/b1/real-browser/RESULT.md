# Incremento UI/API/PG — ejecución real PASS

Fuente final ejecutada: b4b770beeac800e9825406480ffa1b320d2c2794. Primera fuente básica c34783024fac52da1582eb75c6494e518fd31339. Commit previo fda096b762b4bd1e35c951e9aae545bbf1f39e61; base318a77f4fc67623810e6fdfa080bb2fe0da0ecae.

## UI y evidencia real

[Actions39070380055](https://github.com/novo34/cleanops-360/actions/runs/39070380055), job117506569818 SUCCESS. EXECUTION_REPORT.json conserva proveniencia exacta, hashes y resultados individuales.
- **11 checks PASS /0FAIL/0BLOCKED/0SKIP**, incluyendo **un** recorrido Chromium real, no once recorridos. Fases nominales depuradas en el reporte; no se registran factores ni errores sin redactar.
- Instalación desde cero del SQL05 exacto aprobado, cuatro blobs históricos e integridad/diff/ACL PASS.
- Browser real sin page.route/cookies inyectadas: login password → PENDING_MFA (sin panel ACTIVE) → TOTP real → ACTIVE → identidad → sesiones con metadatos/fechas → paginación por cursor real de52 sesiones → revocación individual → recarga de51 activas → step-up → revocación de las demás → logout → 401.
- Estado de sesión y contador TOTP confirmados con consultas de inspección de fixture; al finalizar, las sesiones de ese usuario están REVOKED. Consultas funcionales usan identity_service, no superusuario. Admin únicamente prepara fixtures e inspecciona aserciones.
- Datos sintéticos; Argon2id64MiB/3/p1 y envelopev2/TOTP con claves efímeras. No constituye custodia D2, enrolamiento D3 ni interoperabilidad de apps externas.
- Docker PG16 networknone/sin puertos ni volúmenes compartidos; TLS de UI solo loopback en runner. Recursos propios eliminados; inventarios preexistentes idénticos. Imagen oficial por digest registrada.
- La aplicación y proxy de producción siguen usando closedBackend. La composición privada existe solo en scripts de prueba.
- Las 294 comprobaciones PG/HTTP previas siguen aprobadas y NO se repitieron; no se incrementa su contador con estos checks.

## Correcciones independientes y pruebas

- UI reutilizada, sin interfaz paralela: muestra dispositivo/navegador, creación, última actividad y caducidad absoluta; recorre el cursor firmado sin sustituir páginas por mocks ni introducir límites arbitrarios de producción. Conserva la página ante error de red, elimina duplicados entre páginas y limpia cursores al revocar/cambiar empresa/cerrar.
- Reintentos de mutaciones tras fallo de red conservan Idempotency-Key. Confirmación/cancelación limpian identidad local; cambio de cuerpo/destino produce otra. Solo digests/UUID efímeros en memoria, sin persistir factores/cookies/cuerpos/logs.
- Cancelación durante hashing no puede reservar una identidad de la ceremonia siguiente.
- Tres unitarias nuevas PASS localmente. Sintaxis Python y Node PASS. Una regresión HTTP Chromium añadida para logout con respuesta perdida. Primera CI sin DB39069778104: lint/typecheck/B1/Vitest/build PASS, Chromium55PASS/1FAIL porque el nuevo fixture omitía revoked_count requerido por Result. El validador detectó correctamente la inconsistencia. Se corrige únicamente el fixture a {state:REVOKED,revoked_count:1}, sin cambiar contrato ni UI. Corrección validada: CI39070126069 SUCCESS (57Chromium PASS) y CI final39070380061 SUCCESS: lint, typecheck, 166B1 PASS, Vitest13PASS/3SKIP de DB separada, build y57Chromium PASS. No se sustituye CI sin DB por el E2E real ni viceversa.

## Bloqueos y estado

El retraso inicial de creación de runs quedó resuelto: este HEAD tiene ejecución real SUCCESS. npm local falló EPERM en proxy; no impidió la ejecución autorizada en runner y no es bloqueo vigente para este resultado.

MATRIX.md /REQUIREMENTS.json trazan individualmente44 obligaciones, con evidencia parcial nueva para9 referencias. **0/44 aceptadas completas**: no se promueven requisitos de extremo a extremo por un recorrido parcial ni se atribuye aceptación PO.

Pendientes reales: D2 custodia/infraestructura e identidades; D3 perfil y apps obligatorias; D4 verificación de destinatario/outbox/entrega; C-SCOPE contratos de recuperación/reset/trusted device/AUTHZ; C-LOGIN conciliación de política operativa con V4. Alternativas, riesgos y recomendación en E1-DECISIONS.md. EMAIL, enrolamiento dependiente y recuperación total no se declaran implementados. B1/AUTH-GATE-05 OPEN; no otro módulo.

Siguiente acción: aprobar D2/D3 con custodio/infraestructura y apps reales para completar el enrolamiento público; en paralelo decidir los addenda C-SCOPE/C-LOGIN y D4. Cualquier SQL/ACL nuevo requiere aprobación exacta antes de instalar. No se solicita repetir aprobación de CONSOLIDATED05.

## Historial y límite de la evidencia

BASIC_EXECUTION_REPORT.json conserva el primer recorrido real PASS (39069778121). ATTEMPT_EXPANDED_1.json conserva el timeout de la ampliación (39070126044, fuente6e80792), con instalación y limpieza PASS. La repetición instrumentada39070380055 completa todas las fases con PASS sin modificar SQL/ACL ni relajar controles o tiempos del test. El timeout anterior no quedó localizado en el reporte inicial y no se declara causa corregida: incidencia de estabilidad no reproducida en la última ejecución, conservada para seguimiento. No se oculta ni se convierte aquel FAIL en PASS.
