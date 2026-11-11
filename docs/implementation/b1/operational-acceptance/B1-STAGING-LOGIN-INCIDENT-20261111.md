# B1 staging: incidencia de acceso del 2026-11-11 (cerrada)

Estado: **RESUELTA**. `https://b1.cleanops.nuvurent.com/login` carga y el primer actor inicia sesión
(auditoría: `auth.login SUCCESS` y `auth.mfa.verify SUCCESS`, 2026-11-11T20:56:00Z).
Todo lo ejecutado en el VPS se hizo con `scripts/b1-staging.py` descargado de Git y con SHA256 verificado
contra el commit publicado (U-6.1). Este documento no contiene secretos.

## 1. Resumen en una tabla

| # | Síntoma | Causa | Arreglo | Commit |
|---|---|---|---|---|
| 1 | `GET /login` → 500. Traefik: `dial tcp …:8443: connection refused` | El paquete derivado llevaba el `integration.mjs` del PR #33: importaba `createDurableCandidateVerifier` (no existe en esta rama) y tenía el audience antiguo. El cargador fallaba cerrado y el listener ForwardAuth 8443 no arrancaba | Re-render del módulo con el renderer de la rama + aprobación del PO + reinicio del servicio | `4021f5e` |
| 2 | Todo `/auth/*` → 503 `AUTH_DEPENDENCY_UNAVAILABLE` | La ruta de Traefik copiaba `X-B1-Context`, pero el listener emite y la app verifica `x-cleanops-b1-assertion`. Además no reenviaba el cuerpo, y la aserción va ligada al cuerpo | Plantilla de `route` corregida (cabecera real, `forwardBody`, `maxBodySize: 65536`, `preserveRequestMethod`, `authRequestHeaders`) | `4909aa1` |
| 3 | `GET /login` → 500 solo en navegador. Traefik: `Request.ContentLength=-1 with nil Body` | Regresión del arreglo 2: con `forwardBody`, Traefik falla la llamada ForwardAuth de peticiones sin cuerpo por HTTP/3 | Dos routers: GET/HEAD sin `forwardBody` (prioridad 20), resto de métodos con `forwardBody` (prioridad 10) | `a1bef6d` |
| 4 | `POST /auth/login` → 401 | No era un fallo: credenciales incorrectas (`LOGIN_DENIED`). El PO no tenía a mano la contraseña de la ceremonia del 2026-11-03 | El PO recuperó sus credenciales de los ficheros de la ceremonia (sección 4) | — |

## 2. Estado final verificado

| Comprobación | Resultado |
|---|---|
| `diagnose-package` | PASS (`integration` y `full-load` OK) |
| `/login` desde IP permitida por HTTP/1.1, HTTP/2 y HTTP/3 | 200, con CSS y JS |
| `/auth/me` sin sesión | 401 `AUTH_INVALID` |
| `POST /auth/login` con cuerpo vacío y sin cuerpo | 400 |
| `smoke` desde el VPS (IP no permitida) | 403/403 |
| Inicio de sesión real del primer actor (contraseña + MFA) | PASS, hecho por el PO |

No verificado: el resto del flujo P5 (selección de empresa, administración, dispositivos de confianza, cierre de sesión).

## 3. Artefactos y hashes

- Módulo de integración vigente: sha256 `09c2381dafd95bf539cbf5afa1a954510a1e16aeade4488acd8873a723b252ef`
  (anterior: `a3b7c35996b3a0b47809c91d96466b7eb9bd84c1369efd79daf45f306d88f62a`).
- Aprobación del PO registrada en `integration.approval` del manifiesto derivado:
  `PO novo34 2026-11-11 PR#36 https://github.com/novo34/cleanops-360/pull/36#issuecomment-6805864025`.
- Manifiesto derivado tras la aprobación: sha256 `8cad8c781389c6e388b2ffb7e1b4d79579e1e1369217281acda98bd186d11a78`.
- Ruta Traefik `b1-staging.yml`: original `d5226a9f…3828fe` → intermedia `bea7a99a…ee5a8f` → vigente
  `3199e8ba8f6c69eb2303021c285dceb96eb00dafecc29aaa7d3aef89324875b5`. La allowlist (2 entradas), el backend, la
  dirección ForwardAuth y las rutas TLS no cambiaron (`route --reuse-current`).
- No se tocaron: el paquete privado original, la base de datos (solo lecturas), la web original
  `cleanops.nuvurent.com`, el hosting `82.25.102.171`, ni ningún fichero pinneado por Semgrep.

## 4. Primer actor y credenciales

- Identidad única del staging: tenant «CleanOps 360», estado `COMMITTED` desde el 2026-11-03. El email y el nombre
  no se escriben aquí (dato personal): se consultan con `first-actor-info`. El email de acceso es exactamente el que
  devuelve ese subcomando.
- Las credenciales salieron de la ceremonia `b1-private-operator.mjs first-actor.prepare`. Sus ficheros están en
  el VPS en `/run/cleanops-b1-first-actor/generation-3/prepare/` (root, 0400/0600):
  - `request.json`: petición de `prepare`; incluye el campo `password`.
  - `result.json`: `capability`, `provisioningUri` (alta del TOTP) y `recoveryCodes`.
- **`/run` es memoria volátil: esos ficheros se pierden al reiniciar el VPS.** La copia duradera debe estar en el
  gestor de contraseñas del PO. Nunca se pegan en un chat, un PR ni un documento.

### Cómo funciona la recuperación (leído en el código)

| Tienes | Te falta | Qué hacer |
|---|---|---|
| Contraseña | TOTP | Tras la contraseña, usar un código de recuperación (26 caracteres) |
| Códigos de recuperación | Contraseña | **No basta.** «Restablecer contraseña» exige además un ticket de 43 caracteres que autoriza un usuario con sesión activa (`/auth/password/reset/authorize`) |
| Nada | Todo | Rehacer el primer actor: `rollback seed` se detiene con STOP-AND-DESIGN |

Con una sola identidad no hay quien autorice un ticket si esa identidad pierde la contraseña (ver hallazgo 2 del PR #36).

## 5. Subcomandos nuevos de `scripts/b1-staging.py`

| Subcomando | Tipo | Qué hace |
|---|---|---|
| `render-integration` | escribe en el paquete derivado | Re-renderiza `integration.mjs` en un contenedor efímero sin red de la imagen desplegada, reutilizando el informe y la aprobación de email del módulo actual. Guarda copia en `<paquete>.integration-backup`. No toca el manifiesto |
| `approve-integration --sha256 … --approval-reference …` | escribe en el manifiesto derivado | Registra la aprobación del PO: solo `integration.sha256` e `integration.approval` |
| `rollback render-integration` | restaura | Devuelve módulo y manifiesto desde la copia |
| `route --reuse-current` | reescribe la ruta | Re-renderiza la ruta gestionada con los mismos parámetros; guarda la anterior en `.b1-staging.yml.prev` |
| `first-actor-info` | solo lectura | Email, tenant y nombre del primer actor |
| `diagnose-auth` | solo lectura | Códigos de evento, resultados de auditoría y contadores de intentos; nunca identificadores ni material |

Los tres primeros solo aceptan el paquete derivado (`origin` = `https://b1.cleanops.nuvurent.com`); con el original
se detienen con STOP-AND-DESIGN.

## 6. Si vuelve a fallar: por dónde empezar

1. `/login` da 500 → `diagnose` (logs de Traefik). `connection refused` a 8443 = el listener no arrancó: `diagnose-package`
   nombra el primer paso que falla. `ContentLength=-1 with nil Body` = una petición sin cuerpo pasó por el router con `forwardBody`.
2. `/auth/*` da 503 → la aserción no llega o no verifica: comprobar que la ruta vigente copia `X-Cleanops-B1-Assertion`
   y que `inventory` muestra `INTEGRATION_AUDIENCE` igual a `PACKAGE_ORIGIN`.
3. Login da 401 o 429 → `diagnose-auth`: `LOGIN_DENIED` son credenciales; `blocked=true` es límite de intentos.
4. Un paquete derivado nuevo (`package-origin`) **siempre** necesita `render-integration` + `approve-integration`
   antes de servir, porque copia el módulo tal cual.
5. Tras cambiar el paquete privado hay que reiniciar `cleanops360-b1-web` (Reload en Dokploy); tras cambiar la ruta no.

## 7. Pendiente

- Flujo completo P5.
- Copia de rollback en `/root/cleanops-b1-private-b1host.integration-backup` (módulo y manifiesto anteriores) y
  `.b1-staging.yml.prev`: decidir cuándo borrarlas.
- Riesgo residual de la ruta: un método distinto de GET/HEAD que llegue por HTTP/3 sin cuerpo y sin `Content-Length`
  podría dar 500. El POST sin cuerpo desde Chromium dio 400.
- `tests/static/test_b1_staging.py`: 36 pasan, 1 se salta y `test_inventory_reports_journal_matches_after_install`
  falla en el contenedor de pruebas usado (sin Node 24 ni dependencias del repo); no se comparó contra la rama sin estos cambios.
- Guardar la contraseña, el TOTP y los códigos de recuperación en un gestor de contraseñas antes de cualquier reinicio del VPS.

## 8. Prueba P5 del PO (2026-11-11, tras el acceso)

| Acción | Resultado | Evidencia (`diagnose-auth`) |
|---|---|---|
| Inicio de sesión con contraseña + MFA | PASS | `auth.login SUCCESS`, `auth.mfa.verify SUCCESS` (20:56Z) |
| Seleccionar empresa | PASS según el PO | sin evento de auditoría propio observado |
| Revocar mis demás sesiones (con step-up) | PASS | `self_sessions.revoke_other_own_sessions SUCCESS` (21:03Z) |
| Recordar este dispositivo | **FAIL: `POLICY_DENIED`** (21:04Z, tras step-up correcto) | `TRUSTED_DEVICES_PREFERENCE=no-row` |
| Acción de las 20:57Z (tras `auth.challenge.issue`) | **FAIL: `DEPENDENCY_FAILURE`** | acción y dependencia sin identificar |

Causa del fallo de dispositivos de confianza: `auth_api.register_trusted_device` exige
`app.auth_preferences.trusted_devices_enabled = true` para el tenant y esa fila no existe. La regla `B1-SELF-06` sí
está activa. En esta rama ni la aplicación ni el SQL (SQL14, 0002, 0003) escriben en `app.auth_preferences`: no hay
forma revisada de activar la preferencia. Activarla es una decisión de diseño del PO (quién la escribe y con qué
aprobación); no se ha insertado nada a mano.

### Segunda tanda de la prueba P5 del PO (2026-11-11, 21:11Z en adelante)

| Acción | Resultado | Evidencia |
|---|---|---|
| Cerrar sesión y volver a entrar | PASS | `self_sessions.revoke_self_session SUCCESS` (21:11:03Z), `auth.login SUCCESS` (21:11:28Z) |
| Mis sesiones | PASS según el PO | — |
| Mi identidad | PASS según el PO | — |
| Añadir autenticador | **FAIL: `DEPENDENCY_FAILURE`** un segundo después del step-up correcto (21:11:41Z → 21:11:42Z). Mismo patrón a las 20:57Z. La UI vuelve al menú sin mostrar el QR | causa sin determinar: `enrollTotp` lanza `unavailable()` (candidatos: `deps.enrollment` ausente, límite de métodos sin definir, alias de cuenta, o clave de escritura de custodia/OpenBao) |
| Reintentos posteriores | `RATE_LIMITED` ×3 (21:12Z) | límite de emisión de desafíos; se libera solo |
| Usuarios y permisos | NO PROBADO: el formulario exige el UUID (36 caracteres) del usuario destino y la UI no lo muestra ni lista usuarios | hueco de usabilidad; `first-actor-info` no imprime el `userId` |
