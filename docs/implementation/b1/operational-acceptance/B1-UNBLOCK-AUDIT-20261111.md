# B1 / AUTH-GATE-05 — auditoría de bloqueo y plan de desbloqueo (2026-11-11)

**Estado:** PROPUESTA PARA DECISIÓN DEL PROPIETARIO. No modifica normativa, gates, SQL, VPS ni PR existentes.
**Base auditada:** `main` `4f19c36f8eda2c846c6e3c7164814f26841b3bce`; PR #33 `prep/b1-final-closure-20261102` HEAD `04070ebc30472324a65b8b11077834dacdaa000d`; PR #31, #34; ramas `docs/b1-staging-evidence-20261103`, `prep/b1-dokploy-traefik-handoff-20261103`.
**Nota de rutas:** `B1-SHADOW-CUTOVER-EVIDENCE-20261104.md`, `B1-AUTH-GATE-05-ISOLATION-PLAN-20261105.md`, `scripts/b1-private-operator.mjs`, `scripts/b1-device-ui-router.py` y los scripts `*-20261105.py` existen solo en la rama del PR #33, no en `main`.
**Pregunta auditada:** por qué B1 / AUTH-GATE-05 no se consigue completar de principio a fin.

## 1. Veredicto

El bloqueo **no es técnico de código**. El código B1 está funcionalmente acreditado en aislamiento (42/44 criterios ACCEPTED en `docs/implementation/b1/closure/MATRIX.md`; solo quedan REQ-PR-006 y REQ-PR-007, que son staging real + prueba manual PO + aceptación formal). La infraestructura base también avanzó: SQL14 + 0002/0003 instalados en VPS, primer actor `COMMITTED`, Traefik 3.7.17, mTLS, OpenBao 5/5 lecturas, `/login` bootstrap PREAUTH/CSRF PASS.

B1 no se cierra porque el proceso contiene **cinco interbloqueos autoimpuestos** y una topología de staging innecesariamente frágil. Mientras sigan existiendo, cualquier agente (Codex, ChatGPT, Claude) seguirá produciendo "un siguiente paso único", un script fechado y un commit de evidencia, sin converger.

## 2. Causas raíz (ordenadas por impacto)

### CR-1 — "AUTH-GATE-05" significa tres cosas distintas a la vez

| Uso | Dónde | Qué exige |
|---|---|---|
| Gate documental | `docs/IMPLEMENTATION_GATES.md` fila AUTH-GATE-05, `docs/AUTHENTICATION_SPEC.md` l.76 | "esquema y endpoints definitivos" antes de producción |
| Interruptor runtime en BD | `identity_private.require_enabled()` lanza `RAISE EXCEPTION 'AUTH_GATE_05'` (SQLSTATE 42501) si `identity_private.configuration.deployment_enabled=false` | Abrir un flag por base de datos |
| Cierre total de B1 | `closure/PLAN.md` §4 E0–E9 y §6 | Custodia OpenBao suiza operativa, RPO≤15min/RTO≤4h medidos, SMTP real, carga, staging E2E, revisión independiente, PO |

Consecuencia: el gate documental (que podría cerrarse con los hashes ya fijados de SQL14/0002/0003 y `lib/b1/openapi.json`) queda rehén del cierre operativo completo, y el flag runtime hereda el mismo tabú ("no abrir hasta cerrar AUTH-GATE-05"). Es circular: para cerrar el gate hay que probar login real, y para probar login real hay que abrir el flag que lleva el nombre del gate.

### CR-2 — El flag `deployment_enabled` vive en una base compartida

`B1-AUTH-GATE-05-ISOLATION-PLAN-20261105.md` §2 prohíbe abrirlo en `cleanops_staging` porque no se puede demostrar que ninguna otra aplicación use esa base. El propio plan ya identifica el camino correcto (§3 "camino preferido": base PostgreSQL aislada para B1), pero no se ejecutó y se siguió intentando abrir el flag en la base compartida con ventanas temporales (`b1-gate-trial-20261105.py`, `b1-chrome-gate-window-20261105.py`).

### CR-3 — La única cuenta no puede usarse por diseño del propio gate

`b1-chrome-gate-window-20261105.py` exige que la cuenta activa tenga email en dominio reservado (`.test`, `.invalid`, `example.com`…). La cuenta del primer actor creada el 03/11 no lo cumple → `B1_CUENTA_SINTETICA=NO_ACREDITADA` (05/11). La regla "no crear otra cuenta" + "no cambiar emails" + "solo cuentas sintéticas" deja **cero** caminos posibles en esa base.

### CR-4 — "Revisor independiente" sin definición ejecutable

`ENGINEERING_QUALITY_POLICY.md` §8.4–5 ya define la norma vigente: propietario humano único + **auditoría IA independiente del SHA final** + autorización expresa; "no se requiere segundo colaborador". Sin embargo, las fichas B1 (`B1-SHADOW-CUTOVER-EVIDENCE-20261104.md` §"Registro de aprobaciones", `PO_MANUAL_DEMONSTRATION.md`, MATRIX PR-006) piden un "reviewer independiente con identidad", y la revisión de Claude sobre `a5abbac` se registró como REJECTED "por falta de independencia". Resultado: una condición que el modelo de gobierno de propietario único no puede satisfacer nunca.

### CR-5 — Topología de staging: dos builds Next.js en el mismo host enrutados por nombre de cookie

`scripts/b1-device-ui-router.py` enruta `Host("cleanops.nuvurent.com") && Path("/login") && HeaderRegexp("Cookie", "__Host-cleanops_b1_ingress_device=")` y lo mismo para `/_next/static/`, mientras la web antigua sigue sirviendo el resto del host. Esto produjo: HTTP 500 en Brave, assets mezclados, necesidad de `assetPrefix` en runtime, canary de assets, rebuilds, y divergencias por `SameSite=Strict` en navegación cruzada. Los 43 commits del 05/11 son casi todos consecuencia de esta topología, no de defectos de B1.

### CR-6 — Proceso: evidencia por terminal en lugar de ejecución por lotes

- PR #33: 379 commits, 143 archivos, base `staging` (que Dokploy despliega automáticamente), DRAFT desde el 02/11.
- 43 commits solo el 05/11; 8 scripts fechados de un solo uso en `scripts/*-20261105.py` (contradice "no crear runners/wrappers paralelos" de la propia política).
- 116 scripts, 30 configs Playwright, 35 workflows, 206 documentos `.md`, ~50 ramas.
- El propietario actúa de mensajero: el agente propone un comando, el propietario lo ejecuta en el VPS, pega la salida, el agente la documenta en un commit y propone el siguiente. Cada chat nuevo reconstruye contexto y repite "no repetir PASS".
- STOP-AND-DESIGN (§4 de la política: dos fallos del mismo defecto) debió activarse tras el segundo HTTP 500 de UI y no se activó.

## 3. Decisiones que debe firmar el propietario (desbloqueo)

Ninguna reabre las 26 decisiones de producto ni D1–D4/C-SCOPE/C-LOGIN aprobados el 17/10. Son decisiones de **método y alcance de aceptación**.

| ID | Decisión propuesta | Recomendación |
|---|---|---|
| U-1 | Separar estados: **AUTH-GATE-05** = esquema y endpoints congelados (texto literal del gate); **B1-STAGING-ACCEPTED** = E2E real en staging + checklist PO; **B1-OPERATIONAL** = custodia suiza, RPO/RTO, SMTP real, carga. B1-OPERATIONAL pasa a ser precondición de **release a producción**, no de aceptación funcional de B1. | Aprobar. Sustituye la instrucción "B1 no se cierra con funcionalidades pendientes" solo en lo operativo; ninguna funcionalidad B1 queda fuera. |
| U-2 | Staging B1 en **base de datos dedicada** (`cleanops_b1_staging`, mismo clúster o contenedor propio, sin puertos públicos), instalada con el runner oficial de migraciones (SQL14 → 0002 → 0003). En esa base `deployment_enabled=true` de forma **permanente** mientras sea staging. | Aprobar. Elimina CR-2 sin ventanas temporales ni timers. |
| U-3 | En esa base, nuevo primer actor **sintético** (`admin@b1.cleanops.test`) mediante el operador privado existente `scripts/b1-private-operator.mjs`; segundo tenant y usuarios de prueba con la misma vía. La cuenta del 03/11 en `cleanops_staging` queda intacta y fuera del ensayo. | Aprobar. Elimina CR-3. |
| U-4 | Staging B1 en **hostname propio** (p. ej. `b1.cleanops.nuvurent.com`) con router Traefik que envía **todo** el host al contenedor B1. Acceso restringido por la mTLS/ForwardAuth ya construida o por IP allowlist. Se retiran los routers por nombre de cookie sobre `cleanops.nuvurent.com`. | Aprobar. Elimina CR-5; la web original no se toca. Requiere registro DNS. |
| U-5 | "Revisión independiente" = auditoría IA de un agente/sesión que **no** escribió el cambio, sobre el SHA final, publicada como comentario del PR, más CodeRabbit sin hilos abiertos. Conforme a `ENGINEERING_QUALITY_POLICY.md` §8.4–5. | Aprobar. Elimina CR-4. |
| U-6 | Congelar el registro de evidencia por terminal: una ficha de resultado por ensayo completo, no un commit por salida. Scripts fechados se consolidan en un único `scripts/b1-staging.py` con subcomandos (`inventory`, `install`, `enable`, `smoke`, `rollback`). | Aprobar. |

## 4. Plan de ejecución de principio a fin (tras firmar U-1…U-6)

Cada paso termina en PASS/FAIL; un FAIL repetido activa STOP-AND-DESIGN en vez de otro script.

| Paso | Acción | PASS |
|---|---|---|
| P0 | Cerrar AUTH-GATE-05 **documental**: tabla de hashes (SQL14, 0002, 0003, `lib/b1/openapi.json`, `lib/b1/contracts.ts`) en `IMPLEMENTATION_GATES.md` con referencia a esta decisión. | Gate = CLOSED (esquema/endpoints); B1 sigue OPEN. |
| P1 | Consolidar PR #33: rebase sobre `staging` real, retirar scripts fechados y routers por cookie, añadir `scripts/b1-staging.py`. Revisión U-5. | CI Quality PASS; CodeRabbit 0 hilos; auditoría IA independiente sin bloqueantes. |
| P2 | Crear `cleanops_b1_staging` + roles; runner oficial de migraciones; `deployment_enabled=true`. | `security_policy()` devuelve política 60/60; sin errores 42501. |
| P3 | Ceremonia primer actor sintético + tenant A/B y usuarios u1/u2 sintéticos vía operador privado. | Recibo `COMMITTED`; ninguna credencial impresa. |
| P4 | Shadow B1 apuntando a la base dedicada; router `Host("b1.cleanops.nuvurent.com")` completo; DNS + certificado. | `GET /login` 200 en Chrome/Edge con CSS/JS; cookies PREAUTH/CSRF. |
| P5 | PO ejecuta `docs/implementation/b1/remaining/PO_MANUAL_DEMONSTRATION.md` filas 1–10 en `b1.cleanops.nuvurent.com` (TOTP con app real; EMAIL con simulador/Mailpit según D4 ya aprobado). | Cada fila con resultado real, fecha y SHA. |
| P6 | Revisión independiente U-5 del SHA desplegado + firma PO → **B1-STAGING-ACCEPTED**; REQ-PR-006/007 ACCEPTED. | Matrix 44/44. |
| P7 | (Posterior, independiente) B1-OPERATIONAL: OpenBao suizo con custodio, restore con reloj RPO/RTO, SMTP real. Precondición de producción. | Según `closure/PLAN.md` E7. |

## 5. Qué NO hacer

- No abrir `deployment_enabled` en `cleanops_staging` ni crear ventanas temporales con timers.
- No volver a enrutar por nombre de cookie sobre `cleanops.nuvurent.com`.
- No crear más scripts `*-AAAAMMDD.py` ni fichas por salida de terminal.
- No fusionar PR #33 a `staging` tal cual: Dokploy despliega `staging` automáticamente.
- No usar la cuenta real del 03/11 para el ensayo.

## 6. Riesgos residuales

- U-1 cambia el criterio de cierre que el propietario fijó en `closure/PLAN.md`; requiere firma expresa y quedará registrado como adenda.
- U-4 requiere DNS y certificado; si no hay subdominio disponible, alternativa: puerto/hostname interno accesible solo vía VPN/SSH tunnel.
- La base dedicada comparte clúster PostgreSQL con otras bases: aislar por base + roles propios + `REVOKE CONNECT FROM PUBLIC`; contenedor propio si el propietario lo prefiere.
- Brave quedó fuera de alcance por decisión del 05/11; con hostname propio la causa probable (mezcla de builds) desaparece, pero debe verificarse.

## 7. Registro de decisiones del propietario

Decisiones tomadas por el propietario único (Klever / novo34) en conversación del 2026-11-11, una a una, tras explicación. Cada fila es la firma expresa requerida por §3.

| ID | Fecha | Decisión | Efecto |
|---|---|---|---|
| U-1 | 2026-11-11 | **APROBADA.** B1 se separa en tres estados: AUTH-GATE-05 (esquema y endpoints congelados), B1-STAGING-ACCEPTED (E2E real en staging + prueba manual PO) y B1-OPERATIONAL (custodia OpenBao suiza, RPO≤15min/RTO≤4h, SMTP real, carga). | B1-OPERATIONAL pasa a ser precondición de release a producción, no de aceptación funcional de B1 ni de inicio de B2/B3. No se elimina ninguna funcionalidad ni requisito. Adenda a `closure/PLAN.md` §6 limitada a lo operativo. |
| U-2 | 2026-11-11 | **APROBADA — variante "mismo PostgreSQL".** Base nueva `cleanops_b1_staging` en el clúster PostgreSQL existente del VPS, usada exclusivamente por B1, instalada con el runner oficial (SQL14 → 0002 → 0003), roles técnicos propios y `REVOKE CONNECT ... FROM PUBLIC`. `deployment_enabled=true` permanente mientras sea staging. | `cleanops_staging` y la cuenta del 03/11 quedan intactas y fuera del ensayo. Se abandonan las ventanas temporales (`b1-gate-trial-20261105.py`, `b1-chrome-gate-window-20261105.py`). Rollback: `DROP DATABASE cleanops_b1_staging` y sus roles, sin afectar a nada más. |
| U-3 | 2026-11-11 | **APROBADA — juego completo.** En `cleanops_b1_staging`, identidades sintéticas en dominio reservado `.test` creadas exclusivamente mediante el operador privado existente: `admin@b1.cleanops.test` (primer actor, tenant A), `u1@a.b1.cleanops.test` y `u2@a.b1.cleanops.test` (tenant A), `u1@b.b1.cleanops.test` (tenant B). | Contraseñas elegidas por el propietario durante la ceremonia, nunca en Git/chat/logs. TOTP enrolado con app real del propietario en el primer login. La cuenta real del 03/11 en `cleanops_staging` no se usa ni se modifica. Cubre filas 1–10 de `PO_MANUAL_DEMONSTRATION.md`, incluidas selección de empresa (fila 2) y aislamiento entre tenants (fila 8). |
| U-4 | 2026-11-11 | **APROBADA — `b1.cleanops.nuvurent.com` + lista de IPs.** (a) B1 staging en hostname propio: un único router Traefik `Host("b1.cleanops.nuvurent.com")` hacia el contenedor B1; DNS A al VPS y certificado Let's Encrypt por Traefik. (b) Acceso en staging restringido por `ipAllowList` de Traefik con las IPs del propietario; medida solo de staging, no existe en producción. | **Se conserva** (producto): login, MFA TOTP/EMAIL, empresas, sesiones, dispositivo de confianza 30 d del SRS, recuperación, permisos, SQL14/0002/0003, operador privado. **Se conserva** (infraestructura, también en producción): OpenBao y claves, mTLS Traefik→B1, Traefik 3.7.17, PKI ya verificada — sin reconfigurar. **Se retira** (andamios por compartir host): routers por nombre de cookie (`b1-device-ui-router.py`, UI v2), canary `/b1-static`/`assetPrefix`, ventanas SQL temporales y los 8 scripts `*-20261105.py`. **Se retira** el pase de dispositivo `__Host-cleanops_b1_ingress_device` como control de acceso: no figura en SRS/Product Master/Architecture y es inviable en producción. **Consecuencia técnica:** `ingress-forward-auth.ts`/`server-startup.ts` hoy exigen pase de dispositivo para emitir la aserción `b1-context-v1`; se requiere un cambio mínimo para emitirla tras verificar mTLS de Traefik sin cookie de dispositivo (necesario igualmente para producción), con pruebas y revisión U-5. El `audience` del manifiesto pasa a `https://b1.cleanops.nuvurent.com` mediante nueva versión del manifiesto, nunca editándolo a mano. La web de `cleanops.nuvurent.com` no se toca. |
| U-5 | 2026-11-11 | **APROBADA — revisión cruzada entre modelos.** "Revisión independiente" en B1 = (1) auditoría IA por un modelo distinto del que escribió el cambio (Codex escribe → Claude revisa; Claude escribe → Codex revisa), en sesión nueva que recibe solo PR + SHA, sin la conversación de desarrollo; (2) sobre el SHA final exacto, repetida si cambia; (3) veredicto publicado como comentario del PR; (4) CodeRabbit con 0 hilos abiertos; (5) autorización expresa final del propietario. | Aplica `ENGINEERING_QUALITY_POLICY.md` §8.4–5 a B1. Sustituye en las fichas B1 (`PO_MANUAL_DEMONSTRATION.md`, MATRIX PR-006, `B1-SHADOW-CUTOVER-EVIDENCE-20261104.md`) la exigencia de "reviewer independiente con identidad". No se requiere segundo humano. |
| U-6 | 2026-11-11 | **APROBADA — método por bloques + rama limpia.** (1) Un único script de operación `scripts/b1-staging.py` con subcomandos `inventory` (solo lectura), `install`, `enable`, `seed`, `route`, `smoke`, `rollback`; prohibidos nuevos scripts `*-AAAAMMDD.py`. (2) Cada paso P0–P6 se entrega como bloque completo; el propietario lo ejecuta en el VPS y pega solo el resumen final PASS/FAIL (sin secretos). (3) Un registro por paso terminado; dos fallos con el mismo síntoma → STOP-AND-DESIGN. (4) Rama limpia nueva desde `staging` con solo el código útil (grupos 1 y 2 de U-4) + `b1-staging.py`; PR #33 se cierra como histórico sin borrar ramas ni evidencias. | **Restricción confirmada 2026-11-11:** el agente no tiene acceso al VPS (entorno cloud sin DNS/SSH hacia `cleanops.nuvurent.com`; el puente al equipo del propietario no expone `~/.ssh`). Toda operación en el VPS la ejecuta el propietario. El agente escribe y prueba el script contra PostgreSQL desechable, lo publica en Git con hash, y el propietario lo obtiene verificando ese hash. `inventory` evita repetir preparación ya hecha al cambiar de chat. |
| U-6.1 | 2026-11-11 | **APROBADA — ejecutor en VPS: sesión local con reglas.** Una sesión de Claude en el equipo del propietario, con SSH root al VPS `srv1155120` (`72.61.195.72`, verificado por hostname), ejecuta los bloques en lugar del propietario, bajo estas reglas: (1) solo ejecuta `scripts/b1-staging.py` obtenido de Git con SHA256 verificado contra el commit publicado; (2) `inventory` (solo lectura) puede ejecutarse sin consulta; (3) `install`, `enable`, `seed`, `route`, `rollback` y cualquier subcomando que cambie estado requieren el "sí" explícito del propietario en esa sesión, para ese subcomando; (4) prohibidos comandos ad hoc que cambien estado, edición manual de manifiestos/Compose/Traefik/SQL, y cualquier acción sobre `cleanops_staging`, la web original o el hosting compartido (`82.25.102.171`); (5) nunca imprimir secretos, cookies, contraseñas ni material de claves; (6) cada paso termina con el resumen PASS/FAIL de U-6. | Modifica la restricción de U-6 ("toda operación la ejecuta el propietario"): sigue vigente para cualquier acción fuera de estas reglas. DNS `b1.cleanops.nuvurent.com` A → `72.61.195.72` lo crea el propietario en hPanel (no hay conector Hostinger). |

**Estado de decisiones:** U-1…U-6 APROBADAS el 2026-11-11. El plan §4 queda desbloqueado; siguiente paso P0 + P1.
