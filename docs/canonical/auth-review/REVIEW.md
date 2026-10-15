# Revisión documental final B1 V4 — PR #6

Resultado: **PASS para aprobación documental y continuación de código B1 ya autorizada**. No es aceptación de implementación, habilitación de acceso ni cierre de AUTH-GATE-05.

## Evidencia y alcance

Revisión acotada del paquete original publicado en 796ba73cbe0ed7c5fc48ccba16711e6d030f1f7b, con base documental 9f13c78d6c49194db1bd422db19128460f93f5fc. Los 39 originales se releyeron directamente desde GitHub y coinciden byte por byte con el ZIP. SHA-256 del ZIP: 387ee8865f171d5989b1eae07c2abdbd2c91205622b258cdc25a68a8da13f010. Las 38 entradas del manifiesto coinciden; el manifiesto es el archivo 39. No se modifica ningún original ni documento normativo.

Validación offline realizada: 18 pruebas estáticas PASS en copia separada, sin PostgreSQL. Comparación adicional de los CSV: las ocho reglas conservan todos los campos V3 compartidos salvo approval_status, actualizado por decisión owner; approval_source añadido. Inventario: 80 proyecciones, 60 valores (5 APPROVED, 55 propuestas), 13 operaciones, 26 escenarios especificados. Los escenarios no son pruebas de producto ejecutadas.

## Precedencia temporal y trazabilidad resuelta

- [6195913199](https://github.com/novo34/cleanops-360/pull/5#issuecomment-6195913199): arquitectura compartida PostgreSQL/RLS, contexto verificado, tenant/actor preservados, mínimo privilegio y DENY prioritario. V4 mantiene estas bases y no instala reglas efectivas.
- [6196628955](https://github.com/novo34/cleanops-360/pull/5#issuecomment-6196628955): roles funcionales no crean grants detallados ni herencia administrativa.
- [6196986740](https://github.com/novo34/cleanops-360/pull/5#issuecomment-6196986740) y [6197407914](https://github.com/novo34/cleanops-360/pull/5#issuecomment-6197407914): alcance propio y ocho reglas funcionales con predicados aprobados. Las 80 proyecciones no son privilegios autónomos; revocación propia no incluye otra persona ni otra empresa y bulk preserva la actual.
- [6198116976](https://github.com/novo34/cleanops-360/pull/5#issuecomment-6198116976), posterior al ZIP: **autoriza código UI/API/backend/pruebas y archivos de migración para revisión usando V4 y perfil de ensayo**. Supera las solicitudes históricas de autorización de código/perfil en FINAL_DECISIONS.md e IMPLEMENTATION_SLICE.md. No volver a pedirlas. Argon2id 64 MiB, t=3, p=1, sal individual y rehash progresivo son propuesta previa reconocida para ensayo; no aprobación de producción. La etiqueta histórica NOT OWNER approval de los costes en V4 no debe usarse para negar esta autorización posterior.
- El requisito de revisar HEAD de fix/system-status-build-tests en los originales describe la base histórica a505c4f; la continuación debe verificar la rama autorizada actual feat/b1-auth-rbac-rls y preservar trabajo publicado. No reconstruir historial.
- SCOPE-01 en block-1-test-cases.yaml conserva el nombre histórico block-1-grants-requiring-approval.csv. Para consultar V3, resolver a [baseline-v3/block-1-grants-requiring-approval.csv](v4/baseline-v3/block-1-grants-requiring-approval.csv); para implementar V4, usar [block-1-grants-functional-approved.csv](v4/block-1-grants-functional-approved.csv). No falta ese contrato: cambió de nombre/estado. Los identificadores heredados en matrices son trazabilidad conceptual; el harness futuro debe mapearlos a casos ejecutables, sin afirmar cobertura por mera referencia.

No se detectó contradicción bloqueante con las decisiones consultadas. MFA obligatorio inicial para operativos se declara propuesta conservadora de ensayo, no modificación normativa de MFA configurable/adaptativo. Trusted device está diferido y su máximo normativo no se interpreta como vida de sesión. SQL contiene GRANT/roles como diseño REVIEW ONLY; su publicación no los ejecuta.

## Pendientes reales, distintos de aprobaciones existentes

1. Evidencia técnica: benchmarking Argon2id/antiabuso, expiración absoluta/step-up, TOTP/replay y concurrencia, corpus comprometidas y controles de errores. Seleccionar/medir el perfil propuesto dentro del alcance autorizado; no solicitar otra aprobación general para escribir código.
2. Concretar librerías maduras, configuración versionada, clasificación de riesgo, frontera runtime/verificador privado, claves/rotación y futuro mapping de credenciales de servicio. Decisiones de implementación revisables; no credenciales reales en Git.
3. Autorización específica antes de ejecutar PostgreSQL/DDL/migraciones, incluso efímeros, y antes de instalar fixtures/bindings/grants o roles. Aún no concedida.
4. Aceptación operativa/producción de parámetros y contrato final, habilitación de accesos y criterios AUTH-GATE-05 requieren evidencia y decisiones posteriores. Administración/System Status, recuperación administrativa/pérdida total y retención legal real quedan fuera de este slice.

No hay bloqueo documental pendiente. La semántica/compilación PLpgSQL, privilegios/RLS reales, pool/locks y E2E no están certificados por checks estáticos.

## Siguiente incremento ejecutable preparado

Sobre checkout aislado con HEAD remoto verificado y estos contratos disponibles: configuración validada de 60 valores con perfil de ensayo explícito; schemas de las 13 operaciones y máquina de estados de preauth/MFA/tenant; UI de login consumiendo API real con cookies/CSRF y errores seguros. Probar sin DB las fronteras de entrada, estados no operativos, DENY, propiedad/tenant y errores de dependencia. Usar librerías maduras para Argon2id/TOTP/AEAD; no simular integración completa. Después, repositorios transaccionales/broker y migración expansiva para revisión, sesiones propias y tenant switch; preparar suites A/B sin ejecutar PostgreSQL. Sin rutas admin/System Status, seeds, grants activos, despliegue ni merge. AUTH-GATE-05: OPEN.
