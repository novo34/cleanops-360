# CleanOps 360 — cierre contractual propuesto V4

Instrucción ejecutada: OWNER [6197407914](https://github.com/novo34/cleanops-360/pull/5#issuecomment-6197407914). Las ocho reglas B1-SELF-01..08 están APROBADAS como contrato funcional, con predicados/restricciones V3 conservados. No están activadas; las 80 filas por rol no son privilegios autónomos. Este paquete no cambia normativa ni contiene código de aplicación.

## Archivos vigentes

- block-1.openapi.yaml + HTTP_CONTRACT.md: propuesta final de13 operaciones, schemas acotados, errores, cookies/CSRF, preauth/selección/MFA, idempotencia y límites.
- security-values.yaml/.csv + SECURITY_VALUES.md: única tabla lógica de60 parámetros/decisiones técnicas; cinco entradas ya aprobadas con fuente,55 propuestas concretas pendientes de pruebas. No se inventan aprobaciones. Corpus/valores aprobados se reutilizan sin consulta adicional.
- b1-review-only.sql + POSTGRESQL_RLS.md: DDL completo de definición fresca propuesto, funciones broker y ceremonias,21 tablas con RLS, roles técnicos/permisos, outbox/auditoría/concurrencia y plan de migración. No se ha ejecutado ni se debe tratar como migración sobre staging existente.
- block-1-grants-functional-approved.csv y block-1-role-projection.csv: estado funcional aprobado, effective_decision DENY y referencia6197407914; sin seeds ni bindings activos.
- IMPLEMENTATION_SLICE.md + block-1-test-cases.yaml: slice de código que se podrá autorizar y criterios de pruebas reales. FINAL_DECISIONS.md: exclusivamente las decisiones imprescindibles restantes.
- validate_package.py, static-tests.log y validation-report.json: validación offline, sin instalar nada ni contactar PostgreSQL. artifact-manifest.json conserva hashes; V3_TO_V4.diff permite revisión de cambios.

## Base y restricciones verificadas

PR5 abierto/draft, rama head fix/system-status-build-tests, SHA a505c4f7f05ca79730a6326b294c597eead912a9; base Foundation8aeff94569cc9698c8e18ca8266515f51061faa2. Local work=d522e2edc95ac39af058522fecbcd9fd316667b3, intacto y no usado como base de implementación. Archivos en /workspace/cleanops-auth-review-v4, fuera del repo. Main/Foundation/PR4 e historial preservados, sin commits/push/comentarios/merge. No credenciales ni DB de producción. AUTH-GATE-05 permanece OPEN.

Fuentes reutilizadas: copias de lectura normativas al SHA conocido en sources/; comentarios OWNER6195913199/6196628955/6196986740 y aprobación funcional6197407914 consultados en GitHub. Ninguna nueva auditoría general. Los números aprobados documentados son OTP5min, inactividad30min/8h y trusted-device≤30d; Argon2id aprobado como algoritmo, no su coste. Valores distintos no se han supuesto aprobados.

**Límite de evidencia:** los checks estáticos revisan inventario/referencias/delimitadores SQL, schemas y coherencia de aprobaciones. No se instaló parser SQL externo, servidor ni esquema; por tanto no certifican compilación PostgreSQL, RLS/locks o rendimiento. Esas comprobaciones deben ejecutarse en el ensayo aislado autorizado antes de aceptar la implementación. No se oculta esta limitación bajo “ejecutable”.
