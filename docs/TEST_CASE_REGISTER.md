# CleanOps 360 — Diseño de verificaciones específicas para los 168 requisitos

**Naturaleza:** plan de pruebas documental; NO hay ejecución de software. Los pasos definen comportamiento a verificar, no pantallas/endpoints ya construidos.

Cada caso conserva el requisito fuente; durante el slice el QA debe añadir datos reproducibles, pasos técnicos concretos, resultado real, captura y vínculo con CI. Si el requisito no es una acción interactiva, la evidencia podrá ser de arquitectura o una inspección de configuración.

## Casos por requisito

### TC-001 — REQ-AUTHZ-001
- **Obligación fuente (resumen):** Permisos por acción: view, create, edit, approve, delete, export, manage_permissions.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Permisos por acción: view, create, edit, approve, delete, export, manage_permissions», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-002 — REQ-AUTHZ-002
- **Obligación fuente (resumen):** Ámbitos: tenant, módulo, WorkEngagement, proyecto, documento, plano, oferta, finanzas y datos de empleados.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Ámbitos: tenant, módulo, WorkEngagement, proyecto, documento, plano, oferta, finanzas y datos de empleados», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-003 — REQ-AUTHZ-003
- **Obligación fuente (resumen):** El sistema deberá permitir overrides individuales por usuario.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El sistema deberá permitir overrides individuales por usuario», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-004 — REQ-AUTHZ-004
- **Obligación fuente (resumen):** Deberá permitir accesos temporales con start_at y expires_at.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Deberá permitir accesos temporales con start_at y expires_at», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-005 — REQ-AUTHZ-005
- **Obligación fuente (resumen):** La UI incluirá Administration → Users → User Detail → Manage Access.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La UI incluirá Administration → Users → User Detail → Manage Access», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-006 — REQ-AUTHZ-006
- **Obligación fuente (resumen):** La autorización deberá aplicarse también en API, no solo UI.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La autorización deberá aplicarse también en API, no solo UI», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-007 — REQ-AUTHZ-007
- **Obligación fuente (resumen):** explicit deny prevalecerá sobre cualquier concesión; las políticas de aislamiento tenant y las restricciones de plataforma no podrán sobrepasarse mediante overrides. Ante falta de.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «explicit deny prevalecerá sobre cualquier concesión; las políticas de aislamiento tenant y las restricciones de plataforma no podrán sobrepasarse mediante overrides. Ante falta de», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-008 — REQ-AUTH-001
- **Obligación fuente (resumen):** Login mediante email + password.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Login mediante email + password», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-009 — REQ-AUTH-002
- **Obligación fuente (resumen):** Tras validar credenciales, se exigirá segundo factor según la política de riesgo del rol: obligatorio para administradores, comerciales, planificación, responsables y finanzas; con.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Tras validar credenciales, se exigirá segundo factor según la política de riesgo del rol: obligatorio para administradores, comerciales, planificación, responsables y finanzas; con», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-010 — REQ-AUTH-003
- **Obligación fuente (resumen):** Métodos MFA: código OTP por email o TOTP Authenticator.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Métodos MFA: código OTP por email o TOTP Authenticator», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-011 — REQ-AUTH-004
- **Obligación fuente (resumen):** TOTP deberá ser compatible con aplicaciones estándar.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «TOTP deberá ser compatible con aplicaciones estándar», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-012 — REQ-AUTH-010
- **Obligación fuente (resumen):** OTP de un solo uso.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «OTP de un solo uso», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-013 — REQ-AUTH-011
- **Obligación fuente (resumen):** Código OTP por email válido durante 5 minutos, de un solo uso y con invalidación por consumo o reenvío.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Código OTP por email válido durante 5 minutos, de un solo uso y con invalidación por consumo o reenvío», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-014 — REQ-AUTH-012
- **Obligación fuente (resumen):** OTP almacenado como hash.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «OTP almacenado como hash», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-015 — REQ-AUTH-013
- **Obligación fuente (resumen):** Reenvío invalida códigos anteriores.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Reenvío invalida códigos anteriores», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-016 — REQ-AUTH-014
- **Obligación fuente (resumen):** Cooldown de reenvío.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cooldown de reenvío», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-017 — REQ-AUTH-015
- **Obligación fuente (resumen):** Rate limit por usuario, IP y dispositivo.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Rate limit por usuario, IP y dispositivo», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-018 — REQ-AUTH-016
- **Obligación fuente (resumen):** Límite de intentos.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Límite de intentos», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-019 — REQ-AUTH-017
- **Obligación fuente (resumen):** Mensajes que no permitan enumeración de cuentas.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Mensajes que no permitan enumeración de cuentas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-020 — REQ-AUTH-020
- **Obligación fuente (resumen):** Activación mediante QR.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Activación mediante QR», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-021 — REQ-AUTH-021
- **Obligación fuente (resumen):** No se activa hasta validar el primer código.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No se activa hasta validar el primer código», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-022 — REQ-AUTH-022
- **Obligación fuente (resumen):** Secreto TOTP cifrado.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Secreto TOTP cifrado», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-023 — REQ-AUTH-030
- **Obligación fuente (resumen):** Generación al activar TOTP.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Generación al activar TOTP», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-024 — REQ-AUTH-031
- **Obligación fuente (resumen):** Mostrar una única vez.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Mostrar una única vez», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-025 — REQ-AUTH-032
- **Obligación fuente (resumen):** Guardar como hash.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Guardar como hash», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-026 — REQ-AUTH-033
- **Obligación fuente (resumen):** Un solo uso.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Un solo uso», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-027 — REQ-AUTH-034
- **Obligación fuente (resumen):** MFA reset por admin deberá quedar auditado.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «MFA reset por admin deberá quedar auditado», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-028 — REQ-AUTH-040
- **Obligación fuente (resumen):** Pantalla Account → Security → Active Sessions.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Pantalla Account → Security → Active Sessions», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-029 — REQ-AUTH-041
- **Obligación fuente (resumen):** Mostrar dispositivo, navegador, creación y última actividad.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Mostrar dispositivo, navegador, creación y última actividad», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-030 — REQ-AUTH-042
- **Obligación fuente (resumen):** Revocar sesión individual.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Revocar sesión individual», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-031 — REQ-AUTH-043
- **Obligación fuente (resumen):** Revocar todas las demás sesiones.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Revocar todas las demás sesiones», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-032 — REQ-AUTH-044
- **Obligación fuente (resumen):** Timeout por inactividad: 30 minutos para administración/comercial/finanzas y roles de riesgo administrativo equivalentes, 8 horas para empleados operativos; responsables y otros ro.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Timeout por inactividad: 30 minutos para administración/comercial/finanzas y roles de riesgo administrativo equivalentes, 8 horas para empleados operativos; responsables y otros ro», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-033 — REQ-AUTH-045
- **Obligación fuente (resumen):** Timeout absoluto obligatorio independiente del tiempo de inactividad y de remember device; su duración numérica permanece como parámetro técnico sujeto a validación de seguridad an.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Timeout absoluto obligatorio independiente del tiempo de inactividad y de remember device; su duración numérica permanece como parámetro técnico sujeto a validación de seguridad an», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-034 — REQ-AUTH-046
- **Obligación fuente (resumen):** Remember device válido por 30 días tras MFA y revocable por administrador, cambio de contraseña, reset MFA o riesgo; no amplía la validez de la sesión. La empresa podrá deshabilita.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Remember device válido por 30 días tras MFA y revocable por administrador, cambio de contraseña, reset MFA o riesgo; no amplía la validez de la sesión. La empresa podrá deshabilita», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-035 — REQ-AUTH-047
- **Obligación fuente (resumen):** Step-up MFA para acciones sensibles.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Acceder a Cuenta → Seguridad o iniciar sesión con credenciales y MFA configurados; ejecutar la operación descrita en el requisito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Step-up MFA para acciones sensibles», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Repetir con OTP consumido/caducado, sesión revocada y rol sin factor exigido; acceso denegado sin fuga de existencia de cuenta.
- **Evidencia a adjuntar:** Captura UI censurada; respuesta API; sesión y evento de seguridad.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-036 — REQ-TEN-001
- **Obligación fuente (resumen):** Todo dato deberá pertenecer a un tenant.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Todo dato deberá pertenecer a un tenant», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-037 — REQ-TEN-002
- **Obligación fuente (resumen):** Tenant A nunca podrá acceder a datos de Tenant B.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Tenant A nunca podrá acceder a datos de Tenant B», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-038 — REQ-TEN-003
- **Obligación fuente (resumen):** El aislamiento se aplicará en backend/API.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El aislamiento se aplicará en backend/API», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-039 — REQ-TEN-004
- **Obligación fuente (resumen):** Deberán existir tests automáticos de tenant isolation.
- **Fase principal de diseño:** 2; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear dos usuarios con permisos contrastados y dos tenants; ejecutar la acción exacta y su override/alcance.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Deberán existir tests automáticos de tenant isolation», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar deny individual, acceso cross-tenant, grant expirado e invocación directa API; todos denegados.
- **Evidencia a adjuntar:** Pantalla gestionar accesos; HTTP 403; query de aislamiento; auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-040 — REQ-CRM-001
- **Obligación fuente (resumen):** CRUD y búsqueda de empresas.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear empresa/contacto con sus vínculos de negocio; editar y buscar desde la UI.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «CRUD y búsqueda de empresas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Duplicado, vínculo externo al tenant o entrada inválida: informar sin guardar datos corruptos.
- **Evidencia a adjuntar:** UI lista/detalle; API; filas DB y auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-041 — REQ-CRM-002
- **Obligación fuente (resumen):** Una empresa podrá tener múltiples contactos, oportunidades, proyectos, contratos y WorkEngagements.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear empresa/contacto con sus vínculos de negocio; editar y buscar desde la UI.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Una empresa podrá tener múltiples contactos, oportunidades, proyectos, contratos y WorkEngagements», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Duplicado, vínculo externo al tenant o entrada inválida: informar sin guardar datos corruptos.
- **Evidencia a adjuntar:** UI lista/detalle; API; filas DB y auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-042 — REQ-CRM-003
- **Obligación fuente (resumen):** CRUD y búsqueda de contactos.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear empresa/contacto con sus vínculos de negocio; editar y buscar desde la UI.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «CRUD y búsqueda de contactos», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Duplicado, vínculo externo al tenant o entrada inválida: informar sin guardar datos corruptos.
- **Evidencia a adjuntar:** UI lista/detalle; API; filas DB y auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-043 — REQ-CRM-004
- **Obligación fuente (resumen):** Roles de contacto: Bauleiter, Projektleiter, Facility Manager, Objektleiter, Einkauf, Baumanagement, administración, dirección.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear empresa/contacto con sus vínculos de negocio; editar y buscar desde la UI.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Roles de contacto: Bauleiter, Projektleiter, Facility Manager, Objektleiter, Einkauf, Baumanagement, administración, dirección», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Duplicado, vínculo externo al tenant o entrada inválida: informar sin guardar datos corruptos.
- **Evidencia a adjuntar:** UI lista/detalle; API; filas DB y auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-044 — REQ-CRM-005
- **Obligación fuente (resumen):** Un contacto podrá relacionarse con múltiples proyectos y oportunidades.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear empresa/contacto con sus vínculos de negocio; editar y buscar desde la UI.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Un contacto podrá relacionarse con múltiples proyectos y oportunidades», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Duplicado, vínculo externo al tenant o entrada inválida: informar sin guardar datos corruptos.
- **Evidencia a adjuntar:** UI lista/detalle; API; filas DB y auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-045 — REQ-COM-001
- **Obligación fuente (resumen):** Cada contacto podrá almacenar data_source, source_url, first_seen_at, last_verified_at, communication_basis, do_not_contact, do_not_contact_at, privacy_request_status, retention_re.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cada contacto podrá almacenar data_source, source_url, first_seen_at, last_verified_at, communication_basis, do_not_contact, do_not_contact_at, privacy_request_status, retention_re», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-046 — REQ-COM-002
- **Obligación fuente (resumen):** Primer contacto frío no validado requiere APPROVAL.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Primer contacto frío no validado requiere APPROVAL», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-047 — REQ-COM-003
- **Obligación fuente (resumen):** Suppression List global por tenant.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Suppression List global por tenant», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-048 — REQ-COM-004
- **Obligación fuente (resumen):** DO_NOT_CONTACT impedirá comunicaciones automatizadas.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «DO_NOT_CONTACT impedirá comunicaciones automatizadas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-049 — REQ-COM-005
- **Obligación fuente (resumen):** UI para marcar no-contact desde contacto, hilo de email y Settings → Compliance.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «UI para marcar no-contact desde contacto, hilo de email y Settings → Compliance», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-050 — REQ-OPP-001
- **Obligación fuente (resumen):** Crear Opportunity manualmente sin ProjectCandidate previo.
- **Fase principal de diseño:** 4; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Crear Opportunity manualmente sin ProjectCandidate previo», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-051 — REQ-OPP-002
- **Obligación fuente (resumen):** Usuarios con opportunities.suggest podrán sugerir oportunidades sin acceso total al CRM.
- **Fase principal de diseño:** 4; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Usuarios con opportunities.suggest podrán sugerir oportunidades sin acceso total al CRM», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-052 — REQ-OPP-003
- **Obligación fuente (resumen):** Usuarios con opportunities.approve podrán convertir sugerencias en Opportunity.
- **Fase principal de diseño:** 4; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Usuarios con opportunities.approve podrán convertir sugerencias en Opportunity», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-053 — REQ-OPP-004
- **Obligación fuente (resumen):** El pipeline deberá ser configurable.
- **Fase principal de diseño:** 4; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El pipeline deberá ser configurable», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-054 — REQ-OPP-005
- **Obligación fuente (resumen):** Cada transición deberá quedar en historial.
- **Fase principal de diseño:** 4; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cada transición deberá quedar en historial», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-055 — REQ-RAD-001
- **Obligación fuente (resumen):** Abstracción SourceConnector con tipos WEB, API, RSS, EMAIL, MANUAL, IMPORT, PORTAL.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Abstracción SourceConnector con tipos WEB, API, RSS, EMAIL, MANUAL, IMPORT, PORTAL», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-056 — REQ-RAD-002
- **Obligación fuente (resumen):** Cada conector producirá RawFinding.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cada conector producirá RawFinding», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-057 — REQ-RAD-003
- **Obligación fuente (resumen):** ProjectCandidate será distinto de Opportunity.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «ProjectCandidate será distinto de Opportunity», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-058 — REQ-RAD-004
- **Obligación fuente (resumen):** La ficha de ProjectCandidate deberá mostrar la acción explícita Promote to Opportunity a usuarios con el permiso project_candidates.promote. Al ejecutarla y superar las validacione.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La ficha de ProjectCandidate deberá mostrar la acción explícita Promote to Opportunity a usuarios con el permiso project_candidates.promote. Al ejecutarla y superar las validacione», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-059 — REQ-RAD-005
- **Obligación fuente (resumen):** No todo ProjectCandidate deberá promoverse; la promoción será una decisión humana explícita salvo que una regla futura aprobada defina otro comportamiento. La configuración AUTO en.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No todo ProjectCandidate deberá promoverse; la promoción será una decisión humana explícita salvo que una regla futura aprobada defina otro comportamiento. La configuración AUTO en», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-060 — REQ-RAD-006
- **Obligación fuente (resumen):** Permitir merge manual y mantener historial.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Permitir merge manual y mantener historial», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-061 — REQ-RAD-020
- **Obligación fuente (resumen):** Pantalla Radar Runs.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Pantalla Radar Runs», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-062 — REQ-RAD-021
- **Obligación fuente (resumen):** Mostrar started_at, ended_at, sources_checked, found, new, duplicates, updated, failed.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Mostrar started_at, ended_at, sources_checked, found, new, duplicates, updated, failed», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-063 — REQ-RAD-022
- **Obligación fuente (resumen):** Botón Run now.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Botón Run now», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-064 — REQ-RAD-023
- **Obligación fuente (resumen):** Logs de ejecución visibles para usuario autorizado.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Logs de ejecución visibles para usuario autorizado», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-065 — REQ-SCR-001
- **Obligación fuente (resumen):** Score comercial configurable.
- **Fase principal de diseño:** 6; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Score comercial configurable», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-066 — REQ-SCR-002
- **Obligación fuente (resumen):** No decidirá automáticamente contacto.
- **Fase principal de diseño:** 6; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No decidirá automáticamente contacto», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-067 — REQ-SCR-003
- **Obligación fuente (resumen):** Devolverá score y reasons[].
- **Fase principal de diseño:** 6; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Devolverá score y reasons[]», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-068 — REQ-SCR-004
- **Obligación fuente (resumen):** UI con Recalculate.
- **Fase principal de diseño:** 6; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «UI con Recalculate», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-069 — REQ-EML-001
- **Obligación fuente (resumen):** Inbox integrado: enviar, recibir, responder, reenviar, adjuntos, búsqueda, etiquetas.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Inbox integrado: enviar, recibir, responder, reenviar, adjuntos, búsqueda, etiquetas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-070 — REQ-EML-002
- **Obligación fuente (resumen):** Emails vinculables a empresa, contacto, Opportunity y proyecto.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Emails vinculables a empresa, contacto, Opportunity y proyecto», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-071 — REQ-EML-003
- **Obligación fuente (resumen):** Primer email frío sin policy validada requiere aprobación.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Primer email frío sin policy validada requiere aprobación», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-072 — REQ-EML-004
- **Obligación fuente (resumen):** Negociación de precio siempre manual.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Negociación de precio siempre manual», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-073 — REQ-EML-005
- **Obligación fuente (resumen):** IA puede redactar, traducir, resumir y clasificar.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «IA puede redactar, traducir, resumir y clasificar», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-074 — REQ-EML-006
- **Obligación fuente (resumen):** IA no acepta precio/contrato/condiciones sensibles.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «IA no acepta precio/contrato/condiciones sensibles», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-075 — REQ-EML-007
- **Obligación fuente (resumen):** Email entrante se trata como contenido no confiable contra prompt injection.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Email entrante se trata como contenido no confiable contra prompt injection», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-076 — REQ-FUP-001
- **Obligación fuente (resumen):** Follow-up configurable.
- **Fase principal de diseño:** 8; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Follow-up configurable», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-077 — REQ-FUP-002
- **Obligación fuente (resumen):** Cancelar si hay respuesta, DO_NOT_CONTACT, Opportunity cerrada, contacto incorrecto o pausa manual.
- **Fase principal de diseño:** 8; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cancelar si hay respuesta, DO_NOT_CONTACT, Opportunity cerrada, contacto incorrecto o pausa manual», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-078 — REQ-FUP-003
- **Obligación fuente (resumen):** Botón administrativo Run now.
- **Fase principal de diseño:** 8; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Botón administrativo Run now», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-079 — REQ-VIS-001
- **Obligación fuente (resumen):** SiteVisit con Opportunity/Project, fecha, hora, dirección, assigned_user, contacto, teléfono, notas, planos, adjuntos y estado.
- **Fase principal de diseño:** 9; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «SiteVisit con Opportunity/Project, fecha, hora, dirección, assigned_user, contacto, teléfono, notas, planos, adjuntos y estado», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-080 — REQ-VIS-002
- **Obligación fuente (resumen):** UI móvil para notas, voz, fotos, vídeo, documentos, planos, edificios, plantas, viviendas, garajes y zonas comunes.
- **Fase principal de diseño:** 9; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «UI móvil para notas, voz, fotos, vídeo, documentos, planos, edificios, plantas, viviendas, garajes y zonas comunes», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-081 — REQ-VIS-003
- **Obligación fuente (resumen):** Formularios breves, no formularios gigantes obligatorios.
- **Fase principal de diseño:** 9; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Formularios breves, no formularios gigantes obligatorios», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-082 — REQ-OFF-001
- **Obligación fuente (resumen):** Ofertas versionadas; nunca sobrescribir.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Ofertas versionadas; nunca sobrescribir», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-083 — REQ-OFF-002
- **Obligación fuente (resumen):** Guardar changed_by, changed_at, reason, customer_request, status.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Guardar changed_by, changed_at, reason, customer_request, status», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-084 — REQ-OFF-003
- **Obligación fuente (resumen):** Negociación mostrará current_price, requested_price, delta e impacto de margen si existe.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Negociación mostrará current_price, requested_price, delta e impacto de margen si existe», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-085 — REQ-OFF-004
- **Obligación fuente (resumen):** Acciones: Accept, Counter, Maintain.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Acciones: Accept, Counter, Maintain», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-086 — REQ-OFF-005
- **Obligación fuente (resumen):** Decisión humana.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Decisión humana», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-087 — REQ-NPK-001
- **Obligación fuente (resumen):** MVP permite adjuntar PDF/XLSX/CRBX.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «MVP permite adjuntar PDF/XLSX/CRBX», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-088 — REQ-NPK-002
- **Obligación fuente (resumen):** No construir editor NPK completo en MVP.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No construir editor NPK completo en MVP», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-089 — REQ-NPK-003
- **Obligación fuente (resumen):** Arquitectura preparada para importación estructurada posterior.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Arquitectura preparada para importación estructurada posterior», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-090 — REQ-WE-001
- **Obligación fuente (resumen):** Al ejecutar la acción Accept sobre una oferta (REQ-OFF-004), el sistema deberá transicionar de forma automática e inmediata la Opportunity asociada a Won, registrar la transición e.
- **Fase principal de diseño:** 11; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Al ejecutar la acción Accept sobre una oferta (REQ-OFF-004), el sistema deberá transicionar de forma automática e inmediata la Opportunity asociada a Won, registrar la transición e», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-091 — REQ-WE-002
- **Obligación fuente (resumen):** Al transicionar una Opportunity a Won, el sistema deberá:.
- **Fase principal de diseño:** 11; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Al transicionar una Opportunity a Won, el sistema deberá:», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-092 — REQ-WE-003
- **Obligación fuente (resumen):** Crear WorkEngagement no presupone contrato firmado.
- **Fase principal de diseño:** 11; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Crear WorkEngagement no presupone contrato firmado», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-093 — REQ-PLN-001
- **Obligación fuente (resumen):** Soportar PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRACT en el mismo motor.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Soportar PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRACT en el mismo motor», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-094 — REQ-PLN-002
- **Obligación fuente (resumen):** La publicación final será humana.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La publicación final será humana», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-095 — REQ-CAL-001
- **Obligación fuente (resumen):** Calendar será vista del Planning Engine.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Calendar será vista del Planning Engine», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-096 — REQ-CAL-002
- **Obligación fuente (resumen):** Vistas día, semana, mes, empleado, equipo, proyecto y ubicación.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Vistas día, semana, mes, empleado, equipo, proyecto y ubicación», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-097 — REQ-CAL-003
- **Obligación fuente (resumen):** Mezclará todos los tipos de WorkEngagement.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Mezclará todos los tipos de WorkEngagement», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-098 — REQ-CAL-004
- **Obligación fuente (resumen):** El botón Confirmar de My Day ejecutará el mismo flujo de acknowledgement.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El botón Confirmar de My Day ejecutará el mismo flujo de acknowledgement», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-099 — REQ-SCH-001
- **Obligación fuente (resumen):** Cada planificación publicada tendrá versión.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cada planificación publicada tendrá versión», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-100 — REQ-SCH-002
- **Obligación fuente (resumen):** Guardar version, published_by, published_at, changes y affected_users.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Guardar version, published_by, published_at, changes y affected_users», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-101 — REQ-SCH-003
- **Obligación fuente (resumen):** Optimistic locking o equivalente en planificación, ofertas, permisos, proyectos, contactos, horas y rapports.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Optimistic locking o equivalente en planificación, ofertas, permisos, proyectos, contactos, horas y rapports», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-102 — REQ-CMP-001
- **Obligación fuente (resumen):** Reglas laborales no codificadas como valores fijos.
- **Fase principal de diseño:** G-CMP previo 12 / 15 ampliación; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Cargar reglas CCT/GAV versionadas y fuente vigente aprobada; solicitar revisión normativa y comparar propuesta.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Reglas laborales no codificadas como valores fijos», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar activación automática, fuente no verificable o tenant fuera de límites; la regla activa no cambia.
- **Evidencia a adjuntar:** Versiones de regla, registro de aprobación y resultado del motor.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-103 — REQ-CLI-001
- **Obligación fuente (resumen):** Puede provenir de Bauleiter, Objektleiter, Facility Manager, cliente, GU o administración.
- **Fase principal de diseño:** 15; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Puede provenir de Bauleiter, Objektleiter, Facility Manager, cliente, GU o administración», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-104 — REQ-CLI-002
- **Obligación fuente (resumen):** Toda ClientInstruction deberá generar un efecto definido y trazable en el dominio correspondiente. Ninguna instrucción podrá quedar como un registro aislado sin impacto visible.
- **Fase principal de diseño:** 15; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Toda ClientInstruction deberá generar un efecto definido y trazable en el dominio correspondiente. Ninguna instrucción podrá quedar como un registro aislado sin impacto visible», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-105 — REQ-CLI-003
- **Obligación fuente (resumen):** Ninguna ClientInstruction deberá interpretarse como aprobación de bloques de horas.
- **Fase principal de diseño:** 15; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Ninguna ClientInstruction deberá interpretarse como aprobación de bloques de horas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-106 — REQ-HRS-001
- **Obligación fuente (resumen):** Proyecto puede tener reference_hours_current.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Proyecto puede tener reference_hours_current», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-107 — REQ-HRS-002
- **Obligación fuente (resumen):** No es límite duro.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No es límite duro», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-108 — REQ-HRS-003
- **Obligación fuente (resumen):** No crear solicitudes automáticas de ampliación.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No crear solicitudes automáticas de ampliación», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-109 — REQ-HRS-004
- **Obligación fuente (resumen):** Guardar ReferenceHoursHistory.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Guardar ReferenceHoursHistory», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-110 — REQ-HRS-005
- **Obligación fuente (resumen):** UI Project → Reference Hours → View History.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «UI Project → Reference Hours → View History», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-111 — REQ-HRS-006
- **Obligación fuente (resumen):** Alertas configurables 70/85/95/100%.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Alertas configurables 70/85/95/100%», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-112 — REQ-HRS-007
- **Obligación fuente (resumen):** Superar 100% no bloquea operación.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Superar 100% no bloquea operación», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-113 — REQ-PHS-001
- **Obligación fuente (resumen):** Fases configurables: renombrar, añadir, eliminar, ordenar.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Fases configurables: renombrar, añadir, eliminar, ordenar», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-114 — REQ-PHS-002
- **Obligación fuente (resumen):** Una unidad puede tener estado independiente por fase.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Una unidad puede tener estado independiente por fase», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-115 — REQ-PHS-003
- **Obligación fuente (resumen):** Una unidad puede limpiarse varias veces.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Una unidad puede limpiarse varias veces», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-116 — REQ-PRJ-001
- **Obligación fuente (resumen):** UI sencilla por edificio/planta/unidad.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «UI sencilla por edificio/planta/unidad», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-117 — REQ-PRJ-002
- **Obligación fuente (resumen):** No exigir jerarquías profundas.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No exigir jerarquías profundas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-118 — REQ-PLAN-001
- **Obligación fuente (resumen):** Soportar PDF/JPG/PNG.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Soportar PDF/JPG/PNG», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-119 — REQ-PLAN-002
- **Obligación fuente (resumen):** Versionado obligatorio.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Versionado obligatorio», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-120 — REQ-PLAN-003
- **Obligación fuente (resumen):** Guardar name, code, revision, uploaded_at, uploaded_by, current_version, historical_versions.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Guardar name, code, revision, uploaded_at, uploaded_by, current_version, historical_versions», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-121 — REQ-PLAN-004
- **Obligación fuente (resumen):** No sobrescribir revisiones anteriores.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No sobrescribir revisiones anteriores», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-122 — REQ-PLAN-005
- **Obligación fuente (resumen):** Permisos por proyecto/documento.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Preparar personal habilitado, disponibilidad, reglas laborales aprobadas y WorkEngagement válido; generar y publicar planificación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Permisos por proyecto/documento», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Probar ausencia, solapamiento, edición concurrente y regla laboral no aprobada; prohibir publicación incompatible.
- **Evidencia a adjuntar:** Calendario antes/después; evaluación de reglas; registro de versión; respuesta API.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-123 — REQ-TRN-001
- **Obligación fuente (resumen):** Separar asignación y transporte.
- **Fase principal de diseño:** 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Separar asignación y transporte», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-124 — REQ-ACC-001
- **Obligación fuente (resumen):** Registrar key, badge, code, lockbox, opener, access_schedule, responsible_user.
- **Fase principal de diseño:** 13; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Registrar key, badge, code, lockbox, opener, access_schedule, responsible_user», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-125 — REQ-RPT-001
- **Obligación fuente (resumen):** Registro diario y frecuencia de rapport son conceptos distintos.
- **Fase principal de diseño:** 17; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Registro diario y frecuencia de rapport son conceptos distintos», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-126 — REQ-RPT-002
- **Obligación fuente (resumen):** Cada contrato definirá si la validación de rapports es obligatoria. Las horas aprobadas podrán facturarse conforme al contrato; las rechazadas/disputadas permanecerán separadas y s.
- **Fase principal de diseño:** 17; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar horas trabajadas, remitir rapport y aplicar modalidad de aprobación del contrato.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cada contrato definirá si la validación de rapports es obligatoria. Las horas aprobadas podrán facturarse conforme al contrato; las rechazadas/disputadas permanecerán separadas y s», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Rechazar horas disputadas o rapport sin aprobación requerida; no incrementar horas facturables.
- **Evidencia a adjuntar:** UI rapport; cuatro contadores; decisión aprobador; factura resultante.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-127 — REQ-OFFLINE-001
- **Obligación fuente (resumen):** Offline-first mediante IndexedDB, cola local, identificadores idempotentes, sincronización incremental y versiones para detectar concurrencia. Solo se fusionarán automáticamente ca.
- **Fase principal de diseño:** 16; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Editar en modo sin red una entidad admitida; reconectar y sincronizar contra versión servidor controlada.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Offline-first mediante IndexedDB, cola local, identificadores idempotentes, sincronización incremental y versiones para detectar concurrencia. Solo se fusionarán automáticamente ca», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Provocar conflicto sobre horas aprobadas, instrucciones o turno publicado; enviar a revisión humana, no last-write-wins.
- **Evidencia a adjuntar:** IndexedDB, cola, UI conflicto, versionado servidor y actividad auditada.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-128 — REQ-TRC-WE-001
- **Obligación fuente (resumen):** La transición Offer Accepted → Opportunity Won → Pending WorkEngagement Creation → WorkEngagement Created deberá aparecer completa en FEATURE_TRACEABILITY_MATRIX.md.
- **Fase principal de diseño:** 11; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Versionar oferta y aceptar la versión presentada al cliente autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La transición Offer Accepted → Opportunity Won → Pending WorkEngagement Creation → WorkEngagement Created deberá aparecer completa en FEATURE_TRACEABILITY_MATRIX.md», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** No permitir creación silenciosa de WorkEngagement ni equiparar aceptación con contrato firmado.
- **Evidencia a adjuntar:** Oferta versionada, estado Opportunity, PENDING/CREATED, traza de acción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-129 — REQ-INF-001
- **Obligación fuente (resumen):** La primera topología de producción deberá desplegar frontend, API, PostgreSQL, Redis, BullMQ workers y archivos en **un VPS alojado en Suiza**, con Docker, redes privadas y volúmen.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar staging equivalente y simular interrupción/restore de componente cubierto.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La primera topología de producción deberá desplegar frontend, API, PostgreSQL, Redis, BullMQ workers y archivos en **un VPS alojado en Suiza**, con Docker, redes privadas y volúmen», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fallo de WAL, ausencia de archivo, fuga de secreto o replay del job: detener activación y generar incidencia.
- **Evidencia a adjuntar:** Manifiestos, prueba restore, medición RPO/RTO y registros.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-130 — REQ-INF-002
- **Obligación fuente (resumen):** El proveedor de infraestructura suizo deberá ofrecer mitigación DDoS; se desplegarán firewall y WAF propios con reglas probadas. No se supondrá un proveedor CDN internacional.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar staging equivalente y simular interrupción/restore de componente cubierto.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El proveedor de infraestructura suizo deberá ofrecer mitigación DDoS; se desplegarán firewall y WAF propios con reglas probadas. No se supondrá un proveedor CDN internacional», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fallo de WAL, ausencia de archivo, fuga de secreto o replay del job: detener activación y generar incidencia.
- **Evidencia a adjuntar:** Manifiestos, prueba restore, medición RPO/RTO y registros.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-131 — REQ-INF-003
- **Obligación fuente (resumen):** Backups completos diarios y WAL archivado de forma continua para recuperación PostgreSQL PITR, además de copia independiente y cifrada de archivos, configuraciones y secretos recup.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar staging equivalente y simular interrupción/restore de componente cubierto.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Backups completos diarios y WAL archivado de forma continua para recuperación PostgreSQL PITR, además de copia independiente y cifrada de archivos, configuraciones y secretos recup», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fallo de WAL, ausencia de archivo, fuga de secreto o replay del job: detener activación y generar incidencia.
- **Evidencia a adjuntar:** Manifiestos, prueba restore, medición RPO/RTO y registros.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-132 — REQ-INF-004
- **Obligación fuente (resumen):** El almacenamiento local deberá aislar tenants en autorización y rutas internas, aplicar cuotas y permisos, validar MIME y magic bytes, inspeccionar malware y descompresión malicios.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar staging equivalente y simular interrupción/restore de componente cubierto.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El almacenamiento local deberá aislar tenants en autorización y rutas internas, aplicar cuotas y permisos, validar MIME y magic bytes, inspeccionar malware y descompresión malicios», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fallo de WAL, ausencia de archivo, fuga de secreto o replay del job: detener activación y generar incidencia.
- **Evidencia a adjuntar:** Manifiestos, prueba restore, medición RPO/RTO y registros.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-133 — REQ-JOB-001
- **Obligación fuente (resumen):** Redis + BullMQ ejecutará trabajos programados con deduplicación/idempotencia, concurrencia limitada, retry acotado, dead-letter o cuarentena de fallos, logs, métricas y Run now cua.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar staging equivalente y simular interrupción/restore de componente cubierto.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Redis + BullMQ ejecutará trabajos programados con deduplicación/idempotencia, concurrencia limitada, retry acotado, dead-letter o cuarentena de fallos, logs, métricas y Run now cua», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fallo de WAL, ausencia de archivo, fuga de secreto o replay del job: detener activación y generar incidencia.
- **Evidencia a adjuntar:** Manifiestos, prueba restore, medición RPO/RTO y registros.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-134 — REQ-EML-020
- **Obligación fuente (resumen):** Cada tenant podrá configurar SMTP+IMAP con secretos protegidos, conexión TLS y compatibilidad con los mecanismos de autenticación que efectivamente permita su proveedor. Enviar y r.
- **Fase principal de diseño:** 7; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cada tenant podrá configurar SMTP+IMAP con secretos protegidos, conexión TLS y compatibilidad con los mecanismos de autenticación que efectivamente permita su proveedor. Enviar y r», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-135 — REQ-EML-021
- **Obligación fuente (resumen):** Los envíos comerciales tendrán límites progresivos por tenant y cuenta, no superiores a cuotas del proveedor ni límites globales; gestionar reputación, rebotes, pausas y DO_NOT_CON.
- **Fase principal de diseño:** 8; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar cuenta SMTP/IMAP de tenant y un contacto elegible; enviar o recibir un mensaje y su seguimiento.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Los envíos comerciales tendrán límites progresivos por tenant y cuenta, no superiores a cuotas del proveedor ni límites globales; gestionar reputación, rebotes, pausas y DO_NOT_CON», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Responder al correo: cancelar follow-up aplicable sin cerrar oportunidad; bloquear DO_NOT_CONTACT, rebote, límite y reenvío duplicado.
- **Evidencia a adjuntar:** Bandeja e hilo; jobs; log de envío; oportunidad permanece con su estado.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-136 — REQ-RAD-030
- **Obligación fuente (resumen):** Frecuencia de Radar por fuente configurable, con intervalo recomendado y control de restricciones legales/técnicas de la fuente; ofrecer Run now autorizado, auditoría, métricas y d.
- **Fase principal de diseño:** 5; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear ProjectCandidate desde fuente autorizada; revisar evidencia; promover con permiso explícito.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Frecuencia de Radar por fuente configurable, con intervalo recomendado y control de restricciones legales/técnicas de la fuente; ofrecer Run now autorizado, auditoría, métricas y d», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Intentar promoción sin permiso o correo automático por detección; denegar sin modificar lead ni contactar.
- **Evidencia a adjuntar:** Radar/candidato, Opportunity relacionada, traza de promoción.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-137 — REQ-AI-020
- **Obligación fuente (resumen):** La capa multi-proveedor seleccionará proveedor/modelo por tarea, presupuesto, calidad y clasificación de datos; deberá comprobar autorización tenant, residencia/ubicación de proces.
- **Fase principal de diseño:** 8; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Presentar petición IA desde función autorizada bajo política tenant y proveedor permitido.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La capa multi-proveedor seleccionará proveedor/modelo por tarea, presupuesto, calidad y clasificación de datos; deberá comprobar autorización tenant, residencia/ubicación de proces», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Proveedor externo no autorizado, datos CH protegidos o aprobación ausente: bloquear salida/acción.
- **Evidencia a adjuntar:** Política tenant, registro proveedor, redacción, acción humana y auditoría.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-138 — REQ-DAT-020
- **Obligación fuente (resumen):** La retención se definirá por categoría y tenant con mínimos y obligaciones legales aplicables, bloqueo legal, anonimización/eliminación, pruebas y auditoría; no se fijarán periodos.
- **Fase principal de diseño:** 3; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Configurar staging equivalente y simular interrupción/restore de componente cubierto.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La retención se definirá por categoría y tenant con mínimos y obligaciones legales aplicables, bloqueo legal, anonimización/eliminación, pruebas y auditoría; no se fijarán periodos», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fallo de WAL, ausencia de archivo, fuga de secreto o replay del job: detener activación y generar incidencia.
- **Evidencia a adjuntar:** Manifiestos, prueba restore, medición RPO/RTO y registros.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-139 — REQ-FILE-020
- **Obligación fuente (resumen):** Valores iniciales de subida: foto 20 MB, documento 50 MB, plano/archivo técnico 100 MB por archivo; cada tenant podrá configurar valores sujetos a límites globales seguros y cuotas.
- **Fase principal de diseño:** 9 (capacidad mínima) / 13 ampliación; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Cargar tipo y tamaño de archivo permitidos desde UI; verificar validación real MIME y vínculo con entidad.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Valores iniciales de subida: foto 20 MB, documento 50 MB, plano/archivo técnico 100 MB por archivo; cada tenant podrá configurar valores sujetos a límites globales seguros y cuotas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Archivo sobre límite, contenido distinto a extensión o acceso cross-tenant: rechazar y limpiar subida parcial.
- **Evidencia a adjuntar:** UI visor; metadatos DB; comprobación de volumen; denegación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-140 — REQ-FIN-020
- **Obligación fuente (resumen):** Los contratos definirán modalidad de facturación: Regie por horas facturables y validación exigida, Pauschal por hitos/plazos pactados y recurrente según periodicidad. El sistema p.
- **Fase principal de diseño:** 18; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear contrato con condición de facturación válida; preparar horas validadas y horas disputadas por separado; ejecutar emisión o cálculo definido.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Los contratos definirán modalidad de facturación: Regie por horas facturables y validación exigida, Pauschal por hitos/plazos pactados y recurrente según periodicidad. El sistema p», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Introducir horas disputadas, doble petición idempotente, importe no autorizado o contrato no elegible; operación rechazada sin duplicados.
- **Evidencia a adjuntar:** Detalle factura; asiento/estado persistido; log de aprobación; prueba de repetición.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-141 — REQ-DOC-020
- **Obligación fuente (resumen):** MVP admite adjuntar PDF, XLSX y CRBX y extraer cuando sea viable información de PDF/Excel mediante IA con revisión humana obligatoria antes de incorporarla a una oferta; CRBX estru.
- **Fase principal de diseño:** 10; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Cargar tipo y tamaño de archivo permitidos desde UI; verificar validación real MIME y vínculo con entidad.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «MVP admite adjuntar PDF, XLSX y CRBX y extraer cuando sea viable información de PDF/Excel mediante IA con revisión humana obligatoria antes de incorporarla a una oferta; CRBX estru», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Archivo sobre límite, contenido distinto a extensión o acceso cross-tenant: rechazar y limpiar subida parcial.
- **Evidencia a adjuntar:** UI visor; metadatos DB; comprobación de volumen; denegación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-142 — REQ-CMP-020
- **Obligación fuente (resumen):** Motor de reglas versionadas para legislación y GAV/CCT aplicables con ajustes tenant permitidos. Una tarea programada y botón Buscar cambios consultarán fuentes verificables; la IA.
- **Fase principal de diseño:** G-CMP previo 12 / 15 ampliación; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Cargar reglas CCT/GAV versionadas y fuente vigente aprobada; solicitar revisión normativa y comparar propuesta.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Motor de reglas versionadas para legislación y GAV/CCT aplicables con ajustes tenant permitidos. Una tarea programada y botón Buscar cambios consultarán fuentes verificables; la IA», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar activación automática, fuente no verificable o tenant fuera de límites; la regla activa no cambia.
- **Evidencia a adjuntar:** Versiones de regla, registro de aprobación y resultado del motor.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-143 — REQ-REC-020
- **Obligación fuente (resumen):** Las renovaciones usarán cláusulas contractuales y plazos de preaviso, alertas y asistencia IA; renovar automáticamente solo si el contrato vigente contiene habilitación expresa; re.
- **Fase principal de diseño:** 14; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir contrato recurrente con cláusula real y fechas de vigencia; simular fin y crear propuesta de renovación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Las renovaciones usarán cláusulas contractuales y plazos de preaviso, alertas y asistencia IA; renovar automáticamente solo si el contrato vigente contiene habilitación expresa; re», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Sin autorización expresa nunca renovar automáticamente; cambios económicos exigen aprobación humana.
- **Evidencia a adjuntar:** Historial contrato y aprobación; traza de job sin alteración no permitida.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-144 — REQ-SEC-020
- **Obligación fuente (resumen):** El MVP empleará librerías maduras para hash, autenticación y TOTP, sin implementar criptografía propia. El registro, sesión y credenciales se verificarán con pruebas de seguridad.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Aplicar un control de seguridad indicado por el requisito y consultar Security Center con rol autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El MVP empleará librerías maduras para hash, autenticación y TOTP, sin implementar criptografía propia. El registro, sesión y credenciales se verificarán con pruebas de seguridad», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Ataque cross-tenant, cambio no auditado o export sin permiso: denegar en backend.
- **Evidencia a adjuntar:** Prueba de control/abuso; event log; pantalla de incidente.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-145 — REQ-SEC-021
- **Obligación fuente (resumen):** La caducidad absoluta de sesión tendrá un valor definido y probado antes de la entrega de Auth; no debe inferirse de los 30 días de dispositivo confiable ni de los timeouts de inac.
- **Fase principal de diseño:** 1; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Aplicar un control de seguridad indicado por el requisito y consultar Security Center con rol autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La caducidad absoluta de sesión tendrá un valor definido y probado antes de la entrega de Auth; no debe inferirse de los 30 días de dispositivo confiable ni de los timeouts de inac», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Ataque cross-tenant, cambio no auditado o export sin permiso: denegar en backend.
- **Evidencia a adjuntar:** Prueba de control/abuso; event log; pantalla de incidente.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-146 — REQ-PR-001
- **Obligación fuente (resumen):** Toda la lógica de negocio principal deberá residir en CleanOps. No se usará n8n.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Toda la lógica de negocio principal deberá residir en CleanOps. No se usará n8n», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-147 — REQ-PR-002
- **Obligación fuente (resumen):** El sistema usará una entidad común WorkEngagement con tipos PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRAC.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El sistema usará una entidad común WorkEngagement con tipos PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRAC», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-148 — REQ-PR-003
- **Obligación fuente (resumen):** Todos los tipos de WorkEngagement deberán usar el mismo motor de planificación.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Todos los tipos de WorkEngagement deberán usar el mismo motor de planificación», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-149 — REQ-PR-004
- **Obligación fuente (resumen):** La UI deberá ser limpia, rápida, amigable, responsive y comprensible.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La UI deberá ser limpia, rápida, amigable, responsive y comprensible», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-150 — REQ-PR-005
- **Obligación fuente (resumen):** La IA no decidirá de forma autónoma precios, contratos, salarios, sanciones o decisiones financieras sensibles.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La IA no decidirá de forma autónoma precios, contratos, salarios, sanciones o decisiones financieras sensibles», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-151 — REQ-PR-006
- **Obligación fuente (resumen):** Cada feature deberá desarrollarse de extremo a extremo: DB → backend → API → permisos → UI → seguridad → pruebas → staging →.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Cada feature deberá desarrollarse de extremo a extremo: DB → backend → API → permisos → UI → seguridad → pruebas → staging →», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-152 — REQ-PR-007
- **Obligación fuente (resumen):** No se iniciará una fase dependiente hasta que la fase anterior esté ACCEPTED, salvo autorización explícita del Product Owner.
- **Fase principal de diseño:** 0; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Seleccionar una funcionalidad de un slice y recorrer su flujo UI→API→persistencia→auditoría.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «No se iniciará una fase dependiente hasta que la fase anterior esté ACCEPTED, salvo autorización explícita del Product Owner», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase no ACCEPTED o falta de consumidor UI/prueba real: bloquear siguiente fase.
- **Evidencia a adjuntar:** Checklist, build CI, E2E real, acta de aceptación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-153 — REQ-EMP-001
- **Obligación fuente (resumen):** El sistema deberá disponer de perfiles de empleado con identidad, contacto, idioma, tipo de empleo, disponibilidad, competenc.
- **Fase principal de diseño:** 12/previo G-EMP; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar empleado, disponibilidad, ausencia y pertenencia a equipo; consultar desde Planning.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El sistema deberá disponer de perfiles de empleado con identidad, contacto, idioma, tipo de empleo, disponibilidad, competenc», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Conflictos de fechas, doble asignación y lectura de información privada no autorizada deben denegarse.
- **Evidencia a adjuntar:** Ficha personal, calendario y estado persistido; control de acceso.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-154 — REQ-EMP-002
- **Obligación fuente (resumen):** La gestión autorizada de disponibilidad, ausencias, habilidades y equipos deberá ofrecer interfaces y persistencia trazables.
- **Fase principal de diseño:** 12/previo G-EMP; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Registrar empleado, disponibilidad, ausencia y pertenencia a equipo; consultar desde Planning.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La gestión autorizada de disponibilidad, ausencias, habilidades y equipos deberá ofrecer interfaces y persistencia trazables», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Conflictos de fechas, doble asignación y lectura de información privada no autorizada deben denegarse.
- **Evidencia a adjuntar:** Ficha personal, calendario y estado persistido; control de acceso.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-155 — REQ-CMP-030
- **Obligación fuente (resumen):** Las reglas laborales GAV/CCT versionadas y su vigencia deberán evaluarse antes de publicar planificación o asignaciones depen.
- **Fase principal de diseño:** G-CMP previo 12; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Cargar reglas CCT/GAV versionadas y fuente vigente aprobada; solicitar revisión normativa y comparar propuesta.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Las reglas laborales GAV/CCT versionadas y su vigencia deberán evaluarse antes de publicar planificación o asignaciones depen», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Forzar activación automática, fuente no verificable o tenant fuera de límites; la regla activa no cambia.
- **Evidencia a adjuntar:** Versiones de regla, registro de aprobación y resultado del motor.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-156 — REQ-SVC-001
- **Obligación fuente (resumen):** ONE_OFF_SERVICE deberá poder crearse, planificarse, ejecutarse y cerrarse utilizando WorkEngagement y el Planning Engine únic.
- **Fase principal de diseño:** G-SVC-ONE previo activación / 13–18; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «ONE_OFF_SERVICE deberá poder crearse, planificarse, ejecutarse y cerrarse utilizando WorkEngagement y el Planning Engine únic», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-157 — REQ-SVC-002
- **Obligación fuente (resumen):** MAINTENANCE_CONTRACT deberá poder crearse, planificarse, revisarse y renovarse o terminarse según las condiciones contractual.
- **Fase principal de diseño:** G-SVC-MAINT previo activación / 14–18; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «MAINTENANCE_CONTRACT deberá poder crearse, planificarse, revisarse y renovarse o terminarse según las condiciones contractual», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-158 — REQ-FIN-030
- **Obligación fuente (resumen):** El sistema deberá distinguir, conservar y presentar worked_hours, validated_hours, invoiced_hours y paid_hours sin tratarlas.
- **Fase principal de diseño:** 18; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear contrato con condición de facturación válida; preparar horas validadas y horas disputadas por separado; ejecutar emisión o cálculo definido.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El sistema deberá distinguir, conservar y presentar worked_hours, validated_hours, invoiced_hours y paid_hours sin tratarlas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Introducir horas disputadas, doble petición idempotente, importe no autorizado o contrato no elegible; operación rechazada sin duplicados.
- **Evidencia a adjuntar:** Detalle factura; asiento/estado persistido; log de aprobación; prueba de repetición.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-159 — REQ-FIN-031
- **Obligación fuente (resumen):** La configuración financiera por contrato deberá contemplar billing_frequency, payment_terms, billing_method, hourly_rate, fix.
- **Fase principal de diseño:** 18; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear contrato con condición de facturación válida; preparar horas validadas y horas disputadas por separado; ejecutar emisión o cálculo definido.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La configuración financiera por contrato deberá contemplar billing_frequency, payment_terms, billing_method, hourly_rate, fix», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Introducir horas disputadas, doble petición idempotente, importe no autorizado o contrato no elegible; operación rechazada sin duplicados.
- **Evidencia a adjuntar:** Detalle factura; asiento/estado persistido; log de aprobación; prueba de repetición.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-160 — REQ-FIN-032
- **Obligación fuente (resumen):** La facturación deberá cubrir proyectos, servicios recurrentes y servicios puntuales; la recurrencia admitirá periodicidad sem.
- **Fase principal de diseño:** 18; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Crear contrato con condición de facturación válida; preparar horas validadas y horas disputadas por separado; ejecutar emisión o cálculo definido.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La facturación deberá cubrir proyectos, servicios recurrentes y servicios puntuales; la recurrencia admitirá periodicidad sem», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Introducir horas disputadas, doble petición idempotente, importe no autorizado o contrato no elegible; operación rechazada sin duplicados.
- **Evidencia a adjuntar:** Detalle factura; asiento/estado persistido; log de aprobación; prueba de repetición.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-161 — REQ-REC-030
- **Obligación fuente (resumen):** Los servicios recurrentes deberán soportar DRAFT, ACTIVE, PAUSED, RENEWAL_DUE, RENEWED, TERMINATION_PENDING y TERMINATED, con.
- **Fase principal de diseño:** 14; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir contrato recurrente con cláusula real y fechas de vigencia; simular fin y crear propuesta de renovación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Los servicios recurrentes deberán soportar DRAFT, ACTIVE, PAUSED, RENEWAL_DUE, RENEWED, TERMINATION_PENDING y TERMINATED, con», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Sin autorización expresa nunca renovar automáticamente; cambios económicos exigen aprobación humana.
- **Evidencia a adjuntar:** Historial contrato y aprobación; traza de job sin alteración no permitida.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-162 — REQ-REC-031
- **Obligación fuente (resumen):** En RENEWAL_DUE la interfaz deberá mostrar las acciones Renew, Renegotiate, Terminate y Postpone decision, respetando condicio.
- **Fase principal de diseño:** 14; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir contrato recurrente con cláusula real y fechas de vigencia; simular fin y crear propuesta de renovación.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «En RENEWAL_DUE la interfaz deberá mostrar las acciones Renew, Renegotiate, Terminate y Postpone decision, respetando condicio», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Sin autorización expresa nunca renovar automáticamente; cambios económicos exigen aprobación humana.
- **Evidencia a adjuntar:** Historial contrato y aprobación; traza de job sin alteración no permitida.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-163 — REQ-CLOSE-001
- **Obligación fuente (resumen):** El cierre deberá conservar fecha de fin, horas reales y de referencia, facturación, cobros, duración, incidencias, contacto y.
- **Fase principal de diseño:** 19; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El cierre deberá conservar fecha de fin, horas reales y de referencia, facturación, cobros, duración, incidencias, contacto y», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-164 — REQ-CLOSE-002
- **Obligación fuente (resumen):** La interfaz de cierre ofrecerá Crear referencia comercial y No ahora; podrá elaborar borrador pero no publicar referencias ex.
- **Fase principal de diseño:** 19; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «La interfaz de cierre ofrecerá Crear referencia comercial y No ahora; podrá elaborar borrador pero no publicar referencias ex», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-165 — REQ-DASH-001
- **Obligación fuente (resumen):** El dashboard deberá mostrar información útil y comprensible de trabajo del día, empleados y ausencias, incidencias de atenció.
- **Fase principal de diseño:** 0–20; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir panel con datos de dos estados y roles diferentes.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El dashboard deberá mostrar información útil y comprensible de trabajo del día, empleados y ausencias, incidencias de atenció», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Mostrar datos pendientes como aprobados o mezclar tenants debe fallar; estado vacío comprensible.
- **Evidencia a adjuntar:** Consultas reproducibles y captura KPI con filtros.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-166 — REQ-SEC-030
- **Obligación fuente (resumen):** El Security Center deberá permitir consultar eventos e incidentes autorizados, auditorías y evidencia de pruebas de recuperac.
- **Fase principal de diseño:** 20; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Aplicar un control de seguridad indicado por el requisito y consultar Security Center con rol autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El Security Center deberá permitir consultar eventos e incidentes autorizados, auditorías y evidencia de pruebas de recuperac», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Ataque cross-tenant, cambio no auditado o export sin permiso: denegar en backend.
- **Evidencia a adjuntar:** Prueba de control/abuso; event log; pantalla de incidente.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-167 — REQ-AUD-001
- **Obligación fuente (resumen):** Las acciones relevantes sobre seguridad, permisos, asignaciones, cierres, facturas y estados contractuales deberán registrar.
- **Fase principal de diseño:** 20; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Aplicar un control de seguridad indicado por el requisito y consultar Security Center con rol autorizado.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «Las acciones relevantes sobre seguridad, permisos, asignaciones, cierres, facturas y estados contractuales deberán registrar», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Ataque cross-tenant, cambio no auditado o export sin permiso: denegar en backend.
- **Evidencia a adjuntar:** Prueba de control/abuso; event log; pantalla de incidente.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.

### TC-168 — REQ-OPS-001
- **Obligación fuente (resumen):** El endurecimiento de producción deberá verificar restauración, protección de interfaz/API, aislamiento, evidencias de pruebas.
- **Fase principal de diseño:** 20; requisito transversal cuando corresponda.
- **Preparación y estímulo:** Abrir obra/visita/fase válida; registrar avance y fotografías cuando estén habilitadas.
- **Aserción específica:** verificar directamente en el estado final y en los datos el cumplimiento de «El endurecimiento de producción deberá verificar restauración, protección de interfaz/API, aislamiento, evidencias de pruebas», sin asumirlo por un HTTP 200.
- **Error / abuso / límite:** Fase inválida, carga prohibida o instrucción sin efecto operacional: rechazar o señalar incumplimiento.
- **Evidencia a adjuntar:** Timeline de obra, documentos y modificaciones de planificación.
- **Resultado:** NOT_RUN; diseñar fixtures y oráculos exactos antes de ejecutar el slice.
