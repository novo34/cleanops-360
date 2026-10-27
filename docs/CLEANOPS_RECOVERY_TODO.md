# CleanOps 360 — TODO único de recuperación y consolidación

**Estado:** PLAN / NO AUTORIZA EJECUCIONES. **Actualización:** 2026-10-24. **Responsable de aprobación:** Product Owner. **Objetivo:** corregir hallazgos comprobados de la auditoría y reducir deuda técnica sin crear implementaciones paralelas. Este documento es el **único checklist operativo** de recuperación; no reemplaza Product Master, SRS, autorizaciones o gates.

## Reglas de ejecución (no negociables)
- Trabajar **un solo bloque abierto a la vez**, en el orden de abajo. No iniciar el siguiente sin evidencia y aceptación de cierre del anterior.
- Antes de modificar: QG-0 (inventario de consumidores, alternativa de reutilización, diff mínimo, pruebas y rollback); QG-1/QG-2 durante el cambio; QG-3 al cerrar.
- Por defecto **reutilizar, corregir en origen o consolidar**. Cualquier archivo nuevo debe justificarse por responsabilidad única, consumidor, propietario y prueba. No crear runners, wrappers, revisiones o workflows paralelos por conveniencia.
- Seguridad: `closedBackend` permanece conectado, `AUTH-GATE-05` OPEN, B1/B2 sin activación real, y sin datos ni infraestructura persistente. Cualquier SQL, PostgreSQL, staging o merge requiere su autorización específica cuando aplique.
- Mantener inmutables las evidencias, manifiestos y aprobaciones históricas. No confundir archivos `.review` con runtime; no borrar ramas o workflows sin verificar dependencias, PR y trazabilidad.
- Los hallazgos de la auditoría son **hipótesis o evidencias estáticas según su clasificación**, no sustituyen pruebas. Cada cierre requiere enlace al commit, diff, checks y resultado PASS/FAIL/SKIP.
- Si una reparación obliga a una segunda variante para la misma responsabilidad: **STOP-AND-DESIGN**; revisar causa raíz antes de escribir.
- Codebase Memory MCP / DeusData: **FUERA DE ALCANCE** hasta cerrar este checklist; no instalar ni conectar durante la recuperación.

## R0 — Línea base verificada (2026-10-24)

**Estado: DONE documental, sin intervención funcional.** Se verificaron mediante GitHub el estado de PR, ramas relevantes y documentos de autorización/preflight. La corrupción de SQL5-R3 procede de auditoría independiente estática; **no se ha vuelto a ejecutar PostgreSQL ni repetido su parseo en esta comprobación**.

| Referencia | Estado comprobado |
|---|---|
| PR #12 B2 | OPEN, DRAFT, HEAD `063cd7456056fdff2840a626655700231902ab2a`, base `feat/b1-http-flows` |
| PR #13 anterior de gobernanza | CLOSED, NOT MERGED, HEAD `7f9a6928dd2db884241ed5721b0e7afeacbb9eb6` |
| PR #14 gobernanza canónica | OPEN, NOT DRAFT, HEAD antes de este registro `158128d37a824a2598c5c3dfcfec99c83583f76b`, base `main` |
| SQL5-R3 autorizado | Reference `aff420f40d37e1e6a44942e80c7ff70fadd612ba`; manifest SHA-256 `483a8cba21c199fb4507e5b6b0ff493477d1808ec9feacfc6a21709cc0d9e052` |
| SQL5-R3 preflight | FAIL: 9 PASS, 1 FAIL, 8 SKIP, PG no ejecutado; autorización nativa no consumida |
| Rama revisión | `review/b2-sql5-r3-regex-fix` presente |
| Linajes staging | `staging` y `integrate/demo-v0-map-staging` presentes |
| Linajes B1/B2 | `feat/b1-*`, `feat/b2-users-access` presentes |
| Gobernanza | `governance/reuse-first-main` y antecedente `governance/reuse-first-quality-policy` presentes |

**No habilitado:** SQL5-R3 corrupto (AUD-010), runner de la rama incompatible (AUD-011), `closedBackend` conectado, `AUTH-GATE-05` abierto. El plan no cambia autorizaciones ni permisos. **Próximo bloque único: R1.**

## Estado y evidencias
- [x] **R0 — Baseline congelada y alcance verificado.** Confirmar HEAD y estado de PR #14 (gobernanza) y #12 (B2); registrar commits de referencia y las ramas staging/B1/B2 a comparar. Identificar evidencia del hallazgo AUD-010 en SHA aprobado. Ninguna modificación de producto. **Cierre:** inventario concreto de referencias, árbol de PR, gates, autorizaciones, lista de cambios permitidos y verificación de que no hay ejecuciones pendientes. **No ejecutar código de producción.**
- [x] **R1 — Gobernanza realmente obligatoria (PR #14).** Validar el verificador **real** y el workflow, con pruebas positivas/negativas y seguridad de `pull_request_target` (solo checkout de base, permisos mínimos, no ejecución de PR). Resolver bootstrap del primer merge, revisión independiente vigente del SHA final, compatibilidad con PR históricos y coste CI. Corregir **solo** cinco archivos existentes del PR #14 salvo justificación QG-0. PR #13 ya cerrado sin merge; no reabrir ni duplicar. **Cierre:** aprobación del propietario para merge y merge verificado; protección y check obligatorio realmente activos en main, con auditoría IA independiente y autorización del propietario único; cuatro bases históricas técnicamente inmovilizadas sin bypass hasta su integración y protección definitiva en R2; PR de prueba inválido bloqueado y PR válido aceptado, con evidencias; registrar limitación de un solo propietario y bypass. **Si faltan permisos para rulesets:** BLOQUEADO, no declarar DONE.
### R1 — Aceptación formal del propietario (2026-10-25)

**Estado: DONE. C8 global: PASS en el alcance de R1.** El propietario autorizó expresamente el cierre formal el 2026-10-25, tras la auditoría final READY FOR CLOSURE. SHA de `main` auditado: `9b2254ad360afd1c497fde4f7374ebbcf9c72f1b`. PR #14–#17 fusionados; controles originales reutilizados, sin archivos ni mecanismos de gobernanza adicionales. Pruebas remotas: negativo https://github.com/novo34/cleanops-360/actions/runs/40186945956 (FAIL esperado por C8); positivo https://github.com/novo34/cleanops-360/actions/runs/40187618429 (PASS C1–C9); validación de #17 https://github.com/novo34/cleanops-360/actions/runs/40191890884 (PASS). `engineering-policy` requerido en `main`, asociado a GitHub Actions app 15368, y protección administrativa confirmada por el propietario. Ruleset temporal activo https://github.com/novo34/cleanops-360/rules/25820330: cuatro bases históricas exactas, restricciones update/deletion/non_fast_forward, bypass vacío y SHA intactos; PR #5/#6/#7/#12 bloqueados. Auditoría del SHA #17: https://github.com/novo34/cleanops-360/pull/17#issuecomment-6397456479 . No se ejecutaron PostgreSQL/SQL, B1/B2, staging ni despliegues. `closedBackend` y `AUTH-GATE-05` siguen bloqueados. R2 permanece TODO; las cuatro ramas no pueden desbloquearse hasta integración/protección definitiva y nueva autorización, sin intervalo desprotegido. Los registros anteriores de R1 se conservan como historial, aunque indiquen estados previos BLOCKED.

- [x] **R2 — Definir integración canónica B1/B2/staging.** Comparar cambios concretos en linajes divergentes (AUD-001/038), PR y dependencias; determinar propietario de cada archivo/flujo, orden de integración y contratos. No elegir una rama completa por intuición ni fusionar por simple ancestry. **Cierre:** mapa archivo/flujo → origen canónico, conflictos resueltos, plan de migración reversible y matriz de regresión, aprobado antes de merges; integración del mecanismo canónico y protección definitiva de las cuatro bases históricas con controles remotos verificados antes de permitir merges. El ruleset de inmovilización 25820330 permanece activo hasta sustitución efectiva autorizada, sin intervalo desprotegido ni cambios funcionales B1/B2 sin autorización específica.

### R2 — Preparación de aceptación formal (2026-10-26)

**Estado: READY FOR OWNER ACCEPTANCE. Casilla abierta; no DONE ni aceptación productiva.** Esta anotación actualiza exclusivamente R2; conserva los registros históricos y no inicia R3. La preparación requiere revisión independiente del nuevo SHA documental y aceptación expresa del propietario antes de cualquier merge.

- **Integración y procedencia:** PR #19, rama codex/r2-canonical-integration, candidato publicado y revisado `a7370cae7bc4e2f0a1193d61cfd3a041b1e3d653`. Mapa archivo/flujo → origen canónico y decisiones conservados en el dossier local existente: integration-matrix.json/CSV, consolidation-manifest.json, manifiestos derivados de dependencias/P2 y p2-local/main-sync/expected-tree.json. Selección B1/B2 por componente; staging consolidado sin activar infraestructura; contratos V4 y SQL14 históricos preservados. No es elección de una rama completa por ancestry ni autorización de migración.
- **Integridad Git:** árbol `7c2fe40e636c1ba4c23200b59efc0248eac3e84c`, 942 archivos; 929 blobs/modos idénticos a `8f4e8e2e7d6713fce475e63352124585ad56f29c` y 13 documentos exactos de `main@22ab611b156f26848994483a4e8e29b86bac10d2`, sin rutas adicionales/faltantes ni conflictos. Ambos son los padres ordenados del merge a7370ca. Evidencia: https://github.com/novo34/cleanops-360/commit/a7370cae7bc4e2f0a1193d61cfd3a041b1e3d653 . El nuevo commit documental modificará únicamente esta sección del TODO; los otros 941 archivos deben conservarse íntegros y verificarse tras publicar.
- **P2-A y P2-B RESOLVED:** https://github.com/novo34/cleanops-360/pull/19#discussion_r4376618506 y https://github.com/novo34/cleanops-360/pull/19#discussion_r4376620930 . Renovación por touch V4, caducidad persistida y límite absoluto, CSRF/revocación/logout, cookies tras commit e idempotencia preservados; ruta canónica B1/B2 offline con permiso separado del nativo. Concurrencia PostgreSQL real y aceptación operativa no quedan aprobadas por resolver los defectos de código.
- **CI sobre a7370ca:** Quality PASS https://github.com/novo34/cleanops-360/actions/runs/40311009640 ; npm audit cero vulnerabilidades, Semgrep/guard/fixtures, Gitleaks, SBOM, ESLint y TypeScript PASS. Gobernanza documental PASS https://github.com/novo34/cleanops-360/actions/runs/40311004677 ; preparación staging PASS https://github.com/novo34/cleanops-360/actions/runs/40311009741 , SQL14 VERIFIED_ONLY_NOT_INSTALLED. Estos resultados no se atribuyen anticipadamente al nuevo SHA documental; debe comprobarse su CI real.
- **Regresiones offline:** https://github.com/novo34/cleanops-360/actions/runs/40302500739/job/121503553307 ejecutó `8f4e8e2e7d6713fce475e63352124585ad56f29c`: B1 242 PASS, B2 34 PASS y autorización 4 PASS; nativos SKIP. Todos sus archivos se conservaron en a7370ca. B1/B2 offline de a7370ca permanece SKIP; tampoco se autoriza implícitamente offline/nativo para el nuevo commit. Las comprobaciones estáticas no se convierten en pruebas funcionales.
- **Revisión:** dictamen estático favorable del SHA a7370ca emitido en el chat, sin problemas importantes identificados en la sincronización, registrado documentalmente en https://github.com/novo34/cleanops-360/pull/19#issuecomment-6415703533 . No constituye revisión automatizada publicada por el bot ni aprobación formal humana. La respuesta automatizada anterior corresponde a 8f4e8e2, no al SHA sincronizado. La política §8 exige nueva revisión independiente y autorización vigente para el SHA documental final; no se presume independencia por registrar el dictamen propio.
- **Protección definitiva verificada por lectura:** https://github.com/novo34/cleanops-360/rules/25879296 , R2-permanent-historical-bases, ACTIVE. Temporal https://github.com/novo34/cleanops-360/rules/25820330 también ACTIVE e intacto. Ambos con update/deletion/non_fast_forward, bypass vacío y sin exclusiones, cubren exclusivamente feat/foundation-bootstrap, feat/b1-auth-rbac-rls, docs/b1-v4-canonical-publication y feat/b1-http-flows; no incluyen main ni otras ramas. SHA conservados, respectivamente: `8aeff94569cc9698c8e18ca8266515f51061faa2`, `9f13c78d6c49194db1bd422db19128460f93f5fc`, `bd0de506d033f4c617d23c3be42fd325f21225f5` y `569975aab87c377248a7e9239cec237f5a20b9c6`. El temporal se mantiene; no se autoriza su retirada ni cambios administrativos. La lectura acredita configuración coexistente y conservación de refs, sin pruebas destructivas ni afirmar observación continua de la creación manual.
- **Rollback y matriz de regresión:** preimágenes, orígenes y manifiestos históricos/derivados conservados en el dossier; retirada local controlada o restauración por hash. Un rollback remoto requiere autorización específica y revert normal, sin force-push: el revert del merge con primer padre solo deshace la sincronización documental, no toda la integración R2. Este cambio del TODO puede revertirse aisladamente sin modificar reglas ni referencias históricas.
- **Límites y obligaciones posteriores:** PostgreSQL/OpenBao reales, SQL/migraciones, concurrencia nativa y aceptación productiva B1/B2 siguen pendientes de permisos/gates propios. Parser Semgrep MapLibre parcialmente limitado según excepción exacta revisada; no cobertura completa ni reducción nueva de reglas. Presupuestos REQ-CALC-001…022/COST-GATE-01 son DESIGN_ONLY/NOT_RUN para módulos posteriores y no amplían R2. AUTH-GATE-05 OPEN, closedBackend conectado y R3 no iniciado.
- **Aceptación pendiente:** verificar diff de un archivo y conservación de los otros 941, CI real del nuevo SHA, revisión independiente vigente y decisión explícita del propietario. No se marca R2 DONE, no se cambia el PR de borrador ni se autoriza merge/despliegue por esta preparación.

### R2 — Cierre formal y aceptación expresa del propietario (2026-10-26)

**Estado: DONE para el alcance de integración canónica R2; aceptación formal del propietario concedida en la conversación el 2026-10-26, tras la integración controlada del PR #19.** Este asiento prevalece sobre el estado READY FOR OWNER ACCEPTANCE del registro preparatorio anterior, que se conserva como evidencia histórica de su momento. No declara B1/B2 productivos ni inicia R3.

- **Integración final:** PR #19 MERGED/CLOSED; candidato final `6f6361fede10cb6d3a2b5c7937360306bd64b610`; merge commit de main `692edd8adfa6c4285436bc40dcada3012659daca` (https://github.com/novo34/cleanops-360/pull/19). Mapa de procedencias, rollback y matriz de regresiones documentados en el registro R2 precedente; no se reescriben sus referencias históricas.
- **Verificaciones:** Quality posterior al merge PASS sobre `692edd8adfa6c4285436bc40dcada3012659daca`. Quality, engineering-policy y staging preparation del candidato final PASS; P2-A/P2-B RESOLVED. Codex publicó revisión independiente del SHA final sin problemas importantes identificados: https://github.com/novo34/cleanops-360/pull/19#issuecomment-6416928144 . Las pruebas B1/B2 offline del SHA final permanecieron SKIP; las 242 B1, 34 B2 y 4 de autorización PASS pertenecen al SHA anterior y no equivalen a validación nativa.
- **Protección histórica definitiva:** ruleset `25879296` ACTIVE y temporal `25820330` ACTIVE, ambos con reglas update/deletion/non_fast_forward, cuatro referencias exactas, bypass y exclusiones vacíos. La protección temporal se conserva sin modificar; las cuatro bases históricas siguen inmovilizadas.
- **Aceptación del propietario:** aprobación explícita del cierre formal R2 el 2026-10-26, posterior a la aprobación y comprobación del merge PR #19. Este registro documental se tramita por PR independiente y conserva la gobernanza de main.
- **Exclusiones permanentes del cierre R2:** AUTH-GATE-05 OPEN; closedBackend conectado. PostgreSQL/OpenBao reales, SQL/migraciones, concurrencia real, validaciones nativas/RLS y aceptación operativa B1/B2 continúan pendientes de autorizaciones y gates propios; limitación conocida del parser MapLibre. No se autoriza despliegue, activación de backend, levantamiento de protecciones ni inicio de R3 con este documento.

- [x] **R3 — Reparación mínima SQL5 (AUD-010/011/023).** Preservar R1/R2/R3 originales y sus hashes. Crear **un único candidato corregido** a partir de R2, aplicar sustitución literal segura (evitar expansión JS `$'`), verificar SQL íntegro hasta el único `COMMIT`, sintaxis PostgreSQL/PLpgSQL y manifiesto; reutilizar scripts de parseo/revisión existentes y añadir la cobertura faltante, sin duplicar harness ni guards. Resolver el desacuerdo rama/alcance mediante diseño de ejecución canónico; no falsear variables. **Cierre estático:** hashes nuevos, diff justificado, revisión independiente y *nueva autorización explícita* por commit+manifiesto. **Cierre nativo:** solo después de autorización, una ejecución de PG16 efímero aislado con fixtures sintéticos, concurrencia y limpieza; PASS/FAIL/SKIP documentados. Hasta entonces SQL5 BLOCKED. No ejecutar R3 corrupto.

### R3 — Preflight y STOP-AND-DESIGN (2026-10-26)

**Estado: OPEN / BLOCKED_FOR_DESIGN; después, BLOCKED_FOR_NATIVE_VALIDATION.** El encargo del propietario autoriza preflight, TODO y reparación estática mínima, no ejecución nativa ni cierre. R0/R1/R2 conservan sus cierres y todos sus registros. R4 no se inicia. Este checklist amplía exclusivamente R3.

#### R3 — Decisión técnica y continuidad controlada (2026-10-26)

**Estado operativo actual: IN_PROGRESS_STATIC_IMPLEMENTATION / BLOCKED_FOR_NATIVE_VALIDATION.** Se considera resuelto el STOP-AND-DESIGN **solo para avanzar a la implementación y pruebas estáticas de R3**, sobre el diseño documental publicado en PR #22, SHA `de708e4542d0a50f487f965b082a2f33fd31fd3b`. No equivale a aceptación del código futuro, autorización de ejecución ni cierre de R3. Las menciones anteriores a BLOCKED_FOR_DESIGN se conservan como estados históricos de su momento. El PR continúa DRAFT y sin merge; el estado debe reevaluarse si se descubre nueva duplicación o dependencia fuera de alcance.

- [x] Diseño de consolidación revisado técnicamente: un solo preflight/entrypoint en `scripts/b2-directory-postgres.py`, perfil cerrado `sql5-r3`, reutilización condicionada de `.github/workflows/b2-acceptance-r2-postgres.yml`; sin crear runner, wrapper ni workflow paralelo. Conservar los 20 artefactos históricos, rechazando autorizaciones viejas sobre bytes nuevos; vincular candidato C, manifiesto M y definición real W a una futura autorización independiente. Evidencia documental: https://github.com/novo34/cleanops-360/pull/22#issuecomment-6419033018 .
- [x] Revisión independiente Codex de **este SHA documental** completada sin hallazgos importantes: https://github.com/novo34/cleanops-360/pull/22#issuecomment-6419089311 . Cualquier commit futuro de implementación exige revisión independiente renovada; este dictamen no acredita ni aprueba código aún inexistente.
- [x] Quality del SHA `de708e4542d0a50f487f965b082a2f33fd31fd3b` verificado PASS en GitHub Actions; pruebas PostgreSQL protegidas SKIP. El FAIL de engineering-policy sobre el SHA anterior `7a78d06985909757a8f7e45ef8dbe1b7ecb0e924` no se convierte en PASS ni se fuerza el formulario; verificar el check de gobernanza sobre cada SHA futuro antes de declarar aptitud para merge.
- [ ] **Gate crítico W/ref — PREVIO A TODA ACTIVACIÓN NATIVA:** verificar con evidencia de GitHub Actions la elegibilidad de `pull_request_review` y qué definición/ref real del workflow será ejecutada; la definición modificada solo en PR #22 NO se presume seleccionable antes de su integración en la rama predeterminada. Comprobar `GITHUB_WORKFLOW_SHA`, `GITHUB_WORKFLOW_REF`, PR/ref/checkout C y exclusión R2/R3; si W no es seleccionable sin merge, mantener BLOCKED_FOR_NATIVE_VALIDATION y resolver el orden de activación conforme a gobernanza, sin fusionar, desplegar, cambiar triggers o ejecutar infraestructura por conveniencia.
- [ ] Completar implementación estática SQL5 derivada de R2, fixture, manifiesto, harness canónico, workflow existente y pruebas negativas/positivas; verificar diff/hashes, compatibilidad y rechazo de autorizaciones antiguas; publicar SHA y solicitar nueva revisión. No marcar estas tareas PASS anticipadamente.
- [ ] Autorización posterior del propietario específica para PG16 efímero, vinculada a C/M/W y alcance exacto; sin ella SQL/PG16/OpenBao/migraciones/concurrencia nativa permanecen SKIP. Merge, cierre R3 y R4 requieren sus gates y aceptación posterior separados.

#### Fase 1 — Preflight y trazabilidad

- [x] HEAD remoto inicial verificado por GET branches/main: `975134a78621820bf3b790c392ab35726194ec66`; R2 DONE formal en este TODO. La copia local estaba en `22ab611b156f26848994483a4e8e29b86bac10d2`: no se usa como base ni se sobreescribe.
- [x] Autoridad inspeccionada: AGENTS.md, ENGINEERING_QUALITY_POLICY.md §§1–6/8, DELIVERY_PLAYBOOK.md, IMPLEMENTATION_GATES.md, ROADMAP.md y plantilla PR. Alcance AUD-010/011/023; AUTH-GATE-05 OPEN, closedBackend conectado; autorizaciones históricas no transferibles.
- [x] Inventario SQL5-R1/R2 en main y R3 en commit histórico `aff420f40d37e1e6a44942e80c7ff70fadd612ba`, rama review/b2-sql5-r3-regex-fix actualmente `80c426896d0ed42113462ae38e4499c245f18ef2`. R3 no existe en el árbol main inspeccionado. Se conservaron los originales remotos sin escritura.
- [x] Bytes y Git blob verificados recalculando SHA-1 del objeto y SHA-256 del contenido UTF-8; rutas relativas a docs/proposals/b2-invitations:

| Artefacto histórico | Bytes | Git blob | SHA-256 |
|---|---:|---|---|
| 005-invitation-acceptance.review.sql (R1, main) | 27732 | a4d81e6d0397d3c13146a81b13d7033a68ca94aa | 490e916ccfbca8c5584fd689ee21b3deaa2d90bdb08ae93db390e0f97e47dd83 |
| 005-invitation-acceptance.r2.review.sql (main) | 29591 | a5eb322b7ff134482579754e7663612fd525e820 | eb2d02cc459b1f26afa1107c99670d1e6c4132be504091c42026218046ac8de9 |
| 005-invitation-acceptance.r3.review.sql (aff420f) | 42122 | 071c594695df537576029474f5bd2fe1bfce042a | 14f1f9ba932e1f3f88e8fcbfa9226378ad801618abec532301bac40a8e63d62b |
| sql5-r3-manifest.review.json (aff420f) | 693 | 67bbf69db969b91e0c4c484ff4f8e91e845294f1 | 483a8cba21c199fb4507e5b6b0ff493477d1808ec9feacfc6a21709cc0d9e052 |

- [x] Inspeccionados manifiestos SQL5-R2/R3; runner scripts/b2-acceptance-r2-postgres.review.py y runner R3 histórico; fixture acceptance-tests.r2.review.py y fixture R3 histórico; autorización R3 y report.json históricos. Fixture R3 SHA-256 `02b5922a9b02ed0c0a4c93009fb455e3b7f75ce9e68e1f8429a66ff23cc6c68a`; runner R3 `d0b1bd3d3354b8eb5f238ab524adf13092adea719e299253d5e89e76e306085a`. Sus AST Python son válidos; no se importaron fixtures.
- [x] Consumidores/mecanismos inspeccionados: scripts/b2-directory-postgres.py, scripts/prepare-b2-composition-approval.py, tests/static/test_b2_execution_preflight.py, scripts/parse-b1-sql.py, workflows B2 acceptance R2 y preflight R3 histórico. Dependencias declaradas: B1 SQL14 → B2 SQL1/SQL2/SQL3 → SQL4 → SQL5 y fixtures; la suite SQL4 histórica no debe repetirse.
- [x] AUD-010 reproducido exactamente: una llamada JavaScript String.replace con replacement de texto que contiene el token `$'` reproduce byte por byte el SQL R3 histórico desde R2. Inserta el sufijo posterior al match y luego vuelve a añadirlo. Primera divergencia offset 17106; COMMIT; en offsets 29693 y 42114 (base cero). Incluye regex truncada, cola duplicada y SQL después del primer COMMIT. No son defectos independientes a reparar sobre R3.
- [x] AUD-011 confirmado: preflight canónico exige feat/b2-users-access; la rama R3 histórica no cumple. El reporte conservado cuenta 9 PASS/1 FAIL/8 SKIP y postgresStarted=false/sqlExecuted=false/nativeExecutionAuthorizationConsumed=false; se atribuye al reporte histórico, no a una ejecución nueva.
- [x] AUD-023 / reutilización: scripts/b2-r3-review-preflight.review.py en 80c4268 declara “Duplicates only its preflight checks” y copia los guards de bindings externos, autorización B2, hashes B2, SQL14 y sesión B1. SHA-256 `205b60e638a8ef9fd93e0ed55e8ac81121f36d3d642a257836cc839f55e908bc`; blob `b483b03705314a9a6570396704c9915b338bd744`. Se verifica duplicación real; la clasificación AUD-023 del encargo no constituye una auditoría PostgreSQL.
- [x] Riesgos/diff/rollback: cambiar el harness altera el artefacto a01 del manifiesto de composición, hash `d968c9621cbd6327d9ce473b434b9bceebb58669c9cb4c60f79306f37027e00b`. prepare-b2-composition-approval.py exige los bytes históricos; no basta permitir otra rama. No modificar aprobaciones anteriores. Esta entrega solo amplía el TODO; rollback por revert documental normal, sin SQL ni force-push.

#### Fase 2 — Diseño mínimo y bloqueo demostrado

- [x] Seleccionar R2 como futura base; no editar el R3 corrupto. Sustitución localizada única: predicado regex `^(?:[a-f0-9]{2}){29,512}$` por longitud 58…1024, paridad cero y regex `^[a-f0-9]+$`, conservando coalesce y el resto de la expresión. No modificar firmas, permisos, owners ni RLS.
- [x] Reproducción positiva/negativa temporal con Node: replacement string genera exactamente R3; replacement callback conserva literalmente el dólar, produce 29704 bytes, un COMMIT y sufijo intacto. Solo demostración en memoria; no candidato publicado ni validación PostgreSQL.
- [x] Determinar corrupción completa mediante reproducción exacta de todo el archivo, no solo primer match. No hay justificación para conservar la cola insertada.
- [x] **STOP-AND-DESIGN obligatorio:** encargo §5 y política §4 ante duplicación de guards. No incorporar el preflight paralelo ni crear otro runner/wrapper. QG-0 bloquea implementación hasta revisión del owner técnico del plan de consolidación.
- [x] Alternativas: reutilizar sin cambios rechaza R3; copiar guard/runner perpetúa duplicación; falsear GITHUB_HEAD_REF/identidad/contexto está prohibido; ampliar ramas globalmente debilita alcance. Extender el preflight canónico con configuración explícita es la alternativa propuesta, pero requiere resolver su vínculo de bytes con la composición histórica.
- [ ] Revisar y aprobar diseño de consolidación: un solo guard canónico de entorno/identidad/evento/rama y un entrypoint SQL5; perfil R3 exacto vinculado a commit, artefactos, manifiesto y scope. Mantener rechazo por defecto, controles históricos y aislamiento. Definir cómo verificar el harness actualizado sin reutilizar la autorización de bytes antiguos; no reescribir manifiestos históricos.
- [ ] Fijar consumidores y migración de runners existentes, pruebas equivalentes y rollback antes de cambiar el harness. Retener las copias históricas solo como evidencias, fuera de ejecución. No ampliar R5 ni publicar segunda arquitectura.
- [ ] Confirmar que toda nueva dependencia está dentro del alcance autorizado; STOP-AND-DESIGN ante nueva duplicación o dependencia fuera de alcance.

#### Fase 3 — Implementación (PENDIENTE tras resolver diseño)

- [ ] Crear un único candidato corregido desde R2 en esta única rama R3 basada en main actualizado. Originales históricos inmutables; una sola propuesta activa.
- [ ] Reutilizar herramientas existentes; añadir solo regresiones imprescindibles con owner B2/QA, consumidor y propiedad probada; ningún harness, workflow o wrapper nuevo de conveniencia.
- [ ] Resolver configuración por mecanismo canónico sin falsear GITHUB_HEAD_REF, evento, identidad, autorización o contexto alojado.
- [ ] Preservar funciones, contratos B1/B2, owners, roles, GRANT/REVOKE, ACL/RLS; no cambiar backend ni funcionalidad no relacionada.

#### Fase 4 — Validación estática (PENDIENTE del candidato)

- [ ] Verificar archivo completo, BEGIN y único COMMIT final; inspeccionar contenido anterior/posterior, sin SQL ejecutable añadido tras COMMIT.
- [ ] Validar comillas simples, escapes/literales, dollar-quotes, bloques PL/pgSQL y delimitadores; detectar regex truncadas, duplicaciones y truncamientos.
- [ ] Comparar semántica relevante: firmas de funciones, tablas, índices, dependencias y referencias resueltas contra SQL14/SQL1–4.
- [ ] Verificar owners, roles, GRANT, REVOKE, ACL y restricciones RLS sin debilitamiento.
- [ ] Probar sustitución literal positiva/negativa, incluyendo reproducción de corrupción histórica y ausencia de contenido insertado.
- [ ] Probar rechazo de manifiesto incompleto/alterado, hash incorrecto, fixture ajeno y autorización de otro commit/SHA.
- [ ] Probar rechazo de rama/evento/repositorio/identidad/runner no autorizado y bindings externos, antes de cargar transporte; no falsear contexto real.
- [ ] Ejecutar tests estáticos seguros existentes y regresiones mínimas, registrando comandos y salidas por SHA.
- [x] Limitación actual: pglast no instalado (find_spec=false). scripts/parse-b1-sql.py usa parse_sql/parse_plpgsql PG16 y adapta RETURN NEXT para OUT; no valida catálogo/tipos/privilegios/planificación dinámica. No se instaló parser ni PostgreSQL. Parseo PostgreSQL/PLpgSQL: SKIP, nunca sustituido por análisis textual.
- [ ] Registrar cobertura real del parser disponible y sus adaptaciones como NOT_VALIDATED/SKIP según corresponda. Estático no equivale a nativo.

#### Fase 5 — Evidencias y revisión

- [ ] Nuevo manifiesto del candidato; SHA-256 de cada artefacto y del manifiesto, procedencia y diff mínimo; nunca usar la autorización histórica de aff420f.
- [ ] Comprobar integridad de originales y conservar manifiestos, aprobaciones, fixtures y evidencia de FAIL históricos.
- [ ] Completar matriz requisito → implementación única → consumidor → prueba → evidencia por SHA; sin archivos huérfanos.
- [x] QG-0 documental: objetivo R3/preflight; fuentes y consumidores arriba; reuse/extend preferidos, copia rechazada; diff único TODO, owner PO/Engineering, consumidor equipo de recuperación, prueba preservación histórica/checklist; reversión documental. QG-0 de código: BLOCKED_FOR_DESIGN.
- [x] QG-1/QG-2 de esta entrega: sin cambios funcionales, duplicación nueva ni mecanismos nuevos; STOP aplicado al descubrir duplicación existente.
- [ ] QG-1/QG-2 del candidato: causa raíz corregida y seguridad preservada, sin autorizar ejecuciones reales.
- [ ] Checklist QG-3 previo a aceptación: inventario y diff revisados, trazabilidad, pruebas auténticas, referencias, seguridad, revisión independiente vigente y decisión del propietario. No aceptación anticipada.
- [ ] Publicar esta evidencia/checklist en PR en borrador, con fichas exactas de gobernanza; registrar commit final y solicitar revisión independiente Codex sobre ese SHA.
- [ ] Tras desbloqueo, publicar candidato estáticamente validado y manifiesto en el mismo PR acotado; revisión independiente renovada si cambia SHA.
- [x] Coste de esta investigación: cero Actions solicitadas manualmente, pruebas locales AST/texto/hash/Node; CI automática del PR se registrará según resultados reales. No elevar checks no observados a PASS.

| Requisito | Implementación/consumidor inspeccionado | Prueba y estado de esta intervención |
|---|---|---|
| AUD-010 integridad | SQL5 R2/R3; fixture SQL5 | PASS reproducción exacta Node; FAIL integridad del histórico; candidato pendiente |
| AUD-011 contexto | preflight B2; runners SQL5; workflow R2 | PASS comprobación estática de rechazo por rama; ejecución CI SKIP |
| AUD-023 reutilización | preflight B2 y preflight R3 histórico | PASS identificación AST de cinco guards duplicados; consolidación BLOCKED |
| Trazabilidad | manifiesto/autoridad histórica | PASS hashes/blobs R1/R2/R3 y hash manifiesto histórico; nuevo manifiesto SKIP |
| Sintaxis | parser B1 PG16 / AST Python | PASS seis AST; PostgreSQL/PLpgSQL SKIP por parser ausente |
| Seguridad real | transporte B1/B2; SQL14/SQL4/SQL5 | SKIP nativo, ACL/RLS efectivos y concurrencia; no autorizados |

Reproducción ejecutada fuera del repositorio: `node /tmp/cleanops-r3-inspect/diagnose.cjs`. Algoritmo reproducible: leer R2 UTF-8; buscar una vez el texto `coalesce(method->>'ciphertext','') !~ '^(?:[a-f0-9]{2}){29,512}$'`; reemplazar por `(length(coalesce(method->>'ciphertext','')) NOT BETWEEN 58 AND 1024 OR length(coalesce(method->>'ciphertext','')) % 2 <> 0 OR coalesce(method->>'ciphertext','') !~ '^[a-f0-9]+$')`. Comparar String.replace(texto, replacement) con R3 completo: igualdad exacta. Comparar con String.replace(texto, () => replacement): un COMMIT y sufijo de R2 intacto. Seis `ast.parse` locales sobre harness, runners R2/R3, preflight R3, fixture R3 y test_b2_execution_preflight; sin llamar main/preflight ni transporte. Hashes calculados con hashlib.sha256(bytes), blobs con SHA-1 de cabecera Git + bytes; cotejados contra API de árboles fijada por SHA. Los temporales no son artefactos canónicos ni una suite incorporada.

#### R3 — Gate W/ref: procedimiento de desbloqueo sin ejecución (2026-10-26)

**Decisión:** preparación estática del SHA `04b425adc148d12f0c7340ff9a82986f30630d98` revisada; mantener **OPEN / BLOCKED_FOR_NATIVE_VALIDATION**. Este registro es un procedimiento de decisión, **no** una aprobación de los cuatro fingerprints, del workflow, de PostgreSQL ni del merge. No modifica ni reemplaza los gates anteriores.

- [x] Contraste documental de GitHub Actions: el evento `pull_request_review` tiene `GITHUB_REF=refs/pull/<n>/merge` y `GITHUB_SHA` del merge ref, mientras `github.workflow_ref` y `github.workflow_sha` identifican la definición efectivamente usada (GitHub Docs: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows y https://docs.github.com/en/actions/reference/workflows-and-actions/contexts). Esto **no demuestra** qué definición W seleccionaría una revisión futura del PR22.
- [ ] **Evidencia read-only W/ref:** localizar un run histórico de `pull_request_review` de este repositorio sin volverlo a disparar y verificar por API y artefactos sanitizados qué `workflow_ref`, `workflow_sha`, ruta, commit ejecutado y checkout corresponden; si no existe evidencia suficiente, documentar NOT_VALIDATED y solicitar procedimiento de verificación específico de gobernanza, sin evento de prueba que pueda ejecutar SQL.
- [ ] **Aprobar secuencia de integración/activación:** determinar si la definición W de PR22 puede seleccionarse realmente antes de merge; en caso contrario presentar alternativa estrictamente compatible con reglas y autorizaciones existentes, para aprobación **previa** del propietario. Prohibido fusionar para desbloquear silenciosamente, usar `pull_request_target`, falsear env, introducir triggers, workflow/runner paralelos o saltar protecciones.
- [ ] **Revisión de activación con hash renovado:** la eliminación futura de los `false` del job/paso y de `R3_NATIVE_ENABLED=False` cambia bytes ejecutables; generar C/M/W nuevos tras esos cambios, analizar activación accidental y obtener revisión independiente y autorización nativa expresa ligadas a valores finales, scope, dependencias, fixture, identidad, contexto y aislamiento. Ningún permiso anterior se recicla.
- [ ] **Aprobación expresa Gitleaks:** confirmar por el propietario las cuatro excepciones exactas `.gitleaksignore` de digests públicos antes de merge, sin exclusión general; su presencia actual no implica esa aprobación.
- [ ] **Gate de ejecución y cierre:** solo con W/ref acreditados, CI/engineering-policy legítimos, aprobación del propietario y aislamiento PG16 autorizado se podrá ejecutar SQL y verificar catálogo, permisos efectivos, ACL/RLS, tenant, concurrencia, idempotencia y limpieza. Posteriormente revisión nueva del SHA real y autorización de merge/cierre independiente. R4 sigue bloqueado.

#### R3 — Evidencia remota read-only de workflow histórico (2026-10-26)

- [x] Consulta read-only de GitHub Actions `GET /actions/runs?event=pull_request_review`: diez runs visibles, seis del workflow `.github/workflows/b2-acceptance-r2-postgres.yml`, incluyendo `39584858298`, `39585052936`, `40210612435`, `40302500916`, `40313891123`, `40313928430`. La selección histórica está demostrada para este path; no se lanzó ni reintentó ninguno.
- [x] Run `39585052936` (2026-10-21, evento `pull_request_review`, rama `feat/b2-users-access`, PR12, workflow id `391577171`): el job `acceptance-r2` ejecutó checkout/setup y la verificación previa de dependencias PASS, después `Verify exact SQL5-R2 approval before isolated PG16 execution` FAIL; resultado global FAIL. Evidencia: https://github.com/novo34/cleanops-360/actions/runs/39585052936 . No proclamar autorización ni PASS SQL5-R2 nativa.
- [x] Run `40313928430` (2026-10-26, evento `pull_request_review`, rama `codex/r2-canonical-integration`, mismo workflow id/path): SKIP por restricciones del evento; evidencia https://github.com/novo34/cleanops-360/actions/runs/40313928430 . Confirma que el trigger puede producir un run que no ejecuta el job protegido.
- [ ] **W/ref todavía NO ACREDITADOS para PR22:** la API de runs consultada expone `path`, `workflow_id`, `head_sha`, `head_branch`, evento y estado, pero en estos resultados no muestra `GITHUB_WORKFLOW_SHA` y `GITHUB_WORKFLOW_REF` efectivos del runner. Un `head_sha` de evento de revisión no equivale por sí solo al SHA W de definición. No deducir W de C, del SHA main ni del nombre del workflow. Conservar `false` en workflow y `R3_NATIVE_ENABLED=False` en harness.
- [ ] **Siguiente decisión explícita del propietario/gobernanza:** fijar una vía verificable para observar la definición W/ref real y su elegibilidad antes de quitar barreras. Si requiere cambio de código, workflow o integración previa, diseñar secuencia y autorizarla expresamente; renovar candidato C, manifiesto M, definición W y revisión independiente del SHA final. Prohibido ejecutar una review como experimento si pudiera tocar servicios protegidos, activar R3, mezclar permisos históricos o forzar merge.

#### R3 — Secuencia propuesta de selección y activación W/ref (2026-10-26; DISEÑO, NO AUTORIZACIÓN)

**Hallazgo comprobado en workflow del PR22:** el trigger es exclusivamente `pull_request_review: submitted`; el job R3 contiene `false && ...`, el paso R3 tiene `if: ${{ false }}` y el harness tiene `R3_NATIVE_ENABLED=False`. La ruta R2 original está condicionada a PR12. Ningún SHA documental ni revisión Codex levanta esos bloqueos. Un evento de review nuevo no demuestra por sí solo qué versión W ha usado GitHub y **no** autoriza pruebas nativas.

**Secuencia gobernada y sin autorreferencias:**

1. [ ] **Acreditación de elegibilidad, solo lectura:** obtener evidencia específica de selección de definiciones en `pull_request_review` (documentación vigente y, si es posible, metadata de ejecuciones históricas); distinguir definición/ref efectivos (W) de checkout C, SHA de evento y merge ref. Ante incertidumbre, conservar `W_REF_NOT_VALIDATED`; no inferir que la versión de PR22 se ejecutará antes de merge.
2. [ ] **Decisión de integración previa, separada:** si GitHub requiere definición presente en main para seleccionar W, preparar propuesta mínima de integración/registro del workflow con gates R3 **cerrados**, pero **NO** ejecutar merge, cherry-pick, cambio de trigger, ruleset o branch sin autorización expresa del propietario. Examinar impacto sobre PR22, ramas congeladas, reglas, historial R2 y exigencia engineering-policy. Si las reglas actuales no admiten esa integración, mantener bloqueo y elevar alternativas; prohibido bypass.
3. [ ] **Revisión posterior a cualquier integración autorizada:** confirmar por API el SHA W/ref realmente seleccionable; cotejar bytes de workflow, job, `permissions`, `if`, checkout y dependencias contra la versión fijada. Si W apunta a definición distinta, detenerse: nunca normalizar ref mediante variables falsas o wildcard.
4. [ ] **Candidato final de activación:** únicamente después de acreditar W/ref y aprobar su vía de integración, preparar un cambio mínimo que retire las tres barreras R3 de manera controlada (condición del job, condición del paso, `R3_NATIVE_ENABLED`), sin abrir R2 ni añadir workflows. **La activación debe ser fail-closed hasta el nuevo evento/aprobación real.** Analizar orden de publicación y evitar ventana donde un evento pudiera ejecutar código no aprobado; evaluar si se necesita otra fase de integración protegida.
5. [ ] **Nueva integridad y autorización:** computar commit C definitivo, SHA-256 M de manifiesto actualizado con bytes ejecutables y SHA W exacto de workflow seleccionado; revalidar 34 rutas y 20 históricos, renovar pruebas estáticas y revisión independiente. Obtener aprobación del propietario **del alcance completo** C/M/W, dependencias SQL14/SQL1–4, SQL5, fixture sintético, runner PG16 aislado, evento, identidad, coste, limpieza y efectos autorizados. Nunca utilizar SHA del candidato estático anterior como autorización de los nuevos bytes.
6. [ ] **Ejecución nativa, posteriormente autorizada:** solo tras aprobar todas las fases anteriores, comprobar evento/commit/ref verdaderos antes de transporte; ejecutar PG16 efímero aislado, ACL/RLS, tenant, concurrencia, idempotencia y limpieza con informe sanitizado. Cualquier FAIL detiene cierre; nueva revisión sobre SHA realmente ejecutado y autorización de merge/cierre independiente.

**Riesgo de orden:** la ruta de merge del PR22 puede quedar impedida por engineering-policy legítimamente FAIL hasta pruebas nativas, mientras la selección de W podría requerir integración previa en main. Esta circularidad no se resuelve falseando QG-3, marcando PASS nativo, haciendo un merge provisional sin autorización ni abriendo otro runner. Se necesita decisión expresa de gobernanza para una separación permitida entre preparación de definición cerrada, habilitación autorizada y prueba; sin ella R3 permanece OPEN / BLOCKED_FOR_NATIVE_VALIDATION. No se afirma haber demostrado selección W/ref ni viabilidad de un cambio en main.

#### R3 — Contraste de reglas vigentes y elegibilidad GitHub Actions (2026-10-26; lectura solamente)

- [x] `GET /repos/novo34/cleanops-360/rulesets` confirma dos rulesets **activos**: `25879296` (permanente) y `25820330` (congelación histórica); ambos imponen `deletion`, `non_fast_forward` y `update` a las mismas cuatro ramas históricas, **no a refs/heads/main** según sus condiciones. No se modificaron. Eso NO demuestra ausencia de branch protection u otros requisitos en main.
- [ ] `GET /repos/novo34/cleanops-360/branches/main/protection` devolvió **403 Resource not accessible by integration**. Protección efectiva completa de main y requisitos de integración siguen **NOT_VERIFIED**; no afirmar que main está libre de restricciones ni intentar bypass. Escalar acceso de lectura/consulta de propietario antes de aprobar una estrategia que dependa de merge.
- [x] GitHub Docs, referencia workflows: para un evento GitHub busca archivos workflow en el commit/ref asociado y ejecuta la versión de ese ref; algunos eventos adicionalmente exigen archivo en default branch (https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows). Para `pull_request_review`, GitHub documenta `GITHUB_REF=refs/pull/<PR>/merge`, `GITHUB_SHA` como último commit del merge ref, y `workflow_ref`/`workflow_sha` como identificación de definición en ejecución (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows y https://docs.github.com/en/actions/reference/workflows-and-actions/contexts). **Estas reglas no constituyen una observación real de W/ref para PR22.**
- [ ] **Gate de diseño antes de integración:** confrontar la exigencia exacta del preflight R3 `GITHUB_WORKFLOW_REF=novo34/cleanops-360/.github/workflows/b2-acceptance-r2-postgres.yml@refs/pull/22/merge` y su comprobación de bytes W en C con la definición realmente seleccionada por GitHub. Los runs históricos no exponen estos valores, de modo que no puede darse PASS a este contrato sin evidencia o ajuste revisado. No activar sobre suposiciones.
- [ ] **Bloqueo de política:** engineering-policy FAIL por pruebas nativas pendientes sigue siendo una barrera legítima. Cualquier excepción o separación de integración de un workflow cerrado exige diseño exacto, lectura confirmada de protecciones de main y aprobación expresa del propietario; ni Codex ni un agente pueden redefinirla sin permiso.

#### R3 — Primera y única observación W/ref autorizada (2026-10-26)

- [x] El propietario `novo34` envió una revisión formal `COMMENT` exacta sobre `ad6b1975e3d1aa9baac6b467b5e39634b3cbf577` y manifiesto SHA-256 `868a156e752cb6c451f2b495c5623de53684b69e904b7de43e83898e3672d705`. ID review `5655994215`; no se autorizaron SQL/servicios/merge. Evidencia https://github.com/novo34/cleanops-360/pull/22 .
- [x] Único run real de observación `40365474104`, runAttempt=1, evento `pull_request_review: submitted`: **success**. Job `acceptance-r2` realizó checkout, Python, diagnóstico y subida de evidencia **PASS**; pasos históricos SQL5-R2 y entrypoint SQL5-R3 **SKIP**. URL: https://github.com/novo34/cleanops-360/actions/runs/40365474104 ; artifact `b2-r3-workflow-context` id `12669952537`. El diagnóstico imprimió `result=OBSERVED`, `nativeRefContract=MATCH`, `nativeExecution=NOT_INVOKED`.
- [x] Identidad de ejecución observada **para esa única revisión y esa versión**: checkout/reviewCommit `ad6b1975e3d1aa9baac6b467b5e39634b3cbf577`; `GITHUB_REF=refs/pull/22/merge`; `GITHUB_SHA=9f2df5c3cf4a15ddc463d564a8823f42dc90139d`; `GITHUB_WORKFLOW_REF=novo34/cleanops-360/.github/workflows/b2-acceptance-r2-postgres.yml@refs/pull/22/merge`; `GITHUB_WORKFLOW_SHA=9f2df5c3cf4a15ddc463d564a8823f42dc90139d`; SHA-256 del workflow en checkout `f3b78481073e0b423749bbaf5099a9ed225ab12e5098b6d9c4f14d10cdcf24fd`. Evidencia literal sanitizada visible en log del job `121721860831` y artifact.
- [x] **Desbloqueo parcial:** el contrato W/ref es acreditado para el workflow diagnóstico exacto y el PR abierto, por lo que no está demostrada necesidad de integrar previamente. **NO** transferir este PASS a futuros C/M/W después de modificar archivos: un commit documental posterior mueve HEAD/ref y exige nuevos valores. La observación única ya se consumió; NO reenviar/reintentar sin autorización distinta.
- [ ] **Bloqueos aún vigentes:** aprobación expresa del propietario para cuatro fingerprints Gitleaks; acceso/verificación administrativa de protección clásica main (403); diseño y autorización separada de activación de gates con hashes C/M/W renovados, nueva revisión independiente, validación nativa PG16 y engineering-policy legítimo PASS, posterior autorización de merge y cierre. R3 sigue **OPEN/BLOCKED_FOR_NATIVE_VALIDATION**; AUTH-GATE-05 y closedBackend inalterados; R4 no iniciado.

#### Fase 6 — Gate nativo posterior (TODO; nueva autorización obligatoria, NO EJECUTAR)

- [ ] Autorización nueva del propietario vinculada a commit exacto, SHA-256, manifiesto, fixtures, dependencias, rama/evento y alcance; las anteriores no autorizan bytes nuevos.
- [ ] PostgreSQL 16 efímero autorizado, fixtures sintéticos y entorno alojado aislado.
- [ ] Aislamiento multiempresa y roles; ACL/RLS reales.
- [ ] Concurrencia simultánea e integridad de datos/idempotencia con efectos únicos.
- [ ] Limpieza verificada y evidencias sanitizadas de ejecución.
- [ ] Corregir cualquier FAIL dentro de autorización; revisión independiente renovada del SHA final y evidencia.

#### Fase 7 — Cierre posterior (TODO; autorización expresa obligatoria)

- [ ] QG-3 final y dictamen independiente vigente.
- [ ] Autorización expresa del propietario para merge y aceptación.
- [ ] Merge autorizado y verificación posterior de main, sin modificar rulesets 25879296/25820330 ni cuatro bases congeladas.
- [ ] Actualización formal R3 a DONE únicamente tras gates completos y aceptación; solo entonces desbloqueo secuencial R4.

**Resultado de esta entrega:** bloqueo STOP-AND-DESIGN demostrado y checklist preparado; candidato/manifest nuevo/SHA de candidato no emitidos. Cero SQL real, PostgreSQL, Docker PostgreSQL, OpenBao, migraciones, fixtures ejecutados, datos persistentes, despliegues, merge o R4 iniciados por esta intervención. Las verificaciones de sintaxis de Python y la reproducción de texto no acreditan seguridad ni sintaxis nativa PostgreSQL.


#### R3 — Contrato de consolidación propuesto para aprobación técnica (2026-10-26)

**Estado: OPEN / BLOCKED_FOR_DESIGN. DESIGN_ONLY; no autoriza implementación ni ejecución.** Continúa PR #22 sobre SHA auditado `7a78d06985909757a8f7e45ef8dbe1b7ecb0e924`. Main releído: `975134a78621820bf3b790c392ab35726194ec66`. Se conserva el preflight y STOP anterior como historial. El propietario autoriza ahora únicamente evaluación y documentación del diseño.

**Evidencia remota previa:** Quality SUCCESS; engineering-policy FAILURE; revisión Codex COMPLETED sin hallazgos importantes sobre 7a78d06: https://github.com/novo34/cleanops-360/pull/22#issuecomment-6418618956 . Log engineering-policy https://github.com/novo34/cleanops-360/actions/runs/40340106300/job/121632393395 confirma dos respuestas insuficientes (inventario y justificación) y dos casillas abiertas (causa raíz corregida; pruebas de seguridad/multi-tenant/concurrencia/idempotencia). No se modifica su formulario ni se marcan esas casillas para fabricar PASS; el diseño no es una corrección ejecutada. La revisión previa no cubre anticipadamente el nuevo SHA documental.

##### QG-0 del diseño: inventario exacto y límites

Resultado observable: resolver el diseño de AUD-011/AUD-023 para permitir después una sola reparación estática AUD-010, sin duplicar guards, runner o workflow. Owner técnico B2/Engineering; seguridad B1/Security; evidencia QA; aceptación PO. Ruta propuesta: evento real de propietario → workflow SQL5 existente → main canónico B2 → preflight único → plan autorizado exacto → transporte B1 existente → fixture SQL5 seleccionado. En esta intervención solo se inserta texto en R3; cero archivos nuevos, ejecutables alterados o eliminados. Reversión documental por revert normal.

Búsqueda reproducible sobre árbol 7a78d06: 166 archivos de scripts, tests/static, workflows y propuestas con extensiones py/yml/yaml/mjs/ts; todos recuperados por SHA (staging-maintenance.py requirió una segunda lectura, sin referencias al harness). Búsquedas GitHub code search complementarias de b2-directory-postgres, preflight, prepare-b2-composition-approval, b2-acceptance y b2-invitations-postgres; resultados completos, sin paginación pendiente. Se verificaron por contenido las referencias indexadas; Playwright solo contiene un comentario alusivo al directorio, no una invocación. El inventario se limita al árbol y a los dos scripts históricos indicados; no pretende enumerar todos los commits de todas las ramas.

| Llamada/consumidor exacto en 7a78d06 | Contrato actual y efecto | Tratamiento propuesto |
|---|---|---|
| scripts/b2-directory-postgres.py:176, main(scope) | baseline = preflight(); luego authorize_composition para combined o authorize_package para access/users; transporte después | Único entrypoint R3; añadir selector cerrado sql5-r3, sin alterar los nombres directory/access/users/combined |
| scripts/prepare-b2-composition-approval.py:38, prepare() | runner.preflight(); authorize_package access/users; verifica 20 bytes y prepara metadata CI del manifiesto histórico | Conservar archivo y semántica histórica. No se llama desde R3; sobre harness nuevo debe rechazar a01, no omitirlo |
| tests/static/test_b2_execution_preflight.py:39/45/51/63 | Cuatro puntos de llamada runner.preflight() en cuatro métodos: positivo, binding externo, bytes cambiados y entorno/rama | Extender este mismo test: contexto sintético completo y negativas R3; nunca ejecutar transporte |
| scripts/b2-invitations-postgres.review.py:75–82 | Carga core; sustituye authorize_composition por plan SQL4; core.main('combined') | Conservar histórico. R3 no lo invoca ni importa; SQL4 solo dependencia SQL, sin su suite |
| scripts/b2-acceptance-postgres.review.py:38–46 | Carga core; plan SQL5-R1 mediante monkeypatch; core.main('combined') | Conservar bytes/hashes; no enrutar R3 por este runner |
| scripts/b2-acceptance-r2-postgres.review.py:38–46 | Igual, con manifiesto/fixture SQL5-R2 | Conservar bytes/hashes; no cambiar su firma ni reutilizar su permiso para R3 |
| tests/static/test_b2_execution_preflight.py, resto | main('combined') con transporte prohibido; authorize_package/composition y authorize SQL4/SQL5 | Mantener casos y extender sin borrar expectativas de rechazo; las importaciones de fixtures siguen prohibidas |
| scripts/b2-acceptance-r3-postgres.review.py en aff420f/80c4268 | Otro consumidor indirecto core.main('combined'); no existe en main | No recuperar ni instalar. Evidencia inmutable, no entrypoint nuevo |
| scripts/b2-r3-review-preflight.review.py en 80c4268 | Define preflight_r3(core), cinco guards copiados; no consumidor de esa función identificado en los scripts históricos leídos | No recuperar ni importar. No atribuirle una ejecución inexistente |

Hay **dos puntos de llamada de producción directos al preflight**, cuatro en tests y tres consumidores indirectos SQL4/SQL5 en main. Las llamadas a authorize_package/authorize_composition son validación de paquetes/composición, no otros preflights de entorno.

| Consumidor indirecto CI/documental | Invocación/trigger actual; compatibilidad |
|---|---|
| .github/workflows/b2-directory-postgres.yml:28 | python scripts/b2-directory-postgres.py; pull_request opened/synchronize/reopened, rama feat/b2-users-access |
| .github/workflows/b2-reviewed-packages.yml:33 | Mismo main --package access/users, matriz de dos paquetes; mismos eventos/rama |
| .github/workflows/b2-combined-postgres.yml:30/32 | prepare y main --package combined; mismos eventos/rama |
| .github/workflows/b2-invitations-postgres.yml | prepare y runner SQL4; workflow_dispatch pero condición exige payload pull_request: no habilitado por el diseño; no arreglarlo dentro de R3 |
| .github/workflows/b2-acceptance-postgres.yml | prepare y runner R1; pull_request synchronize más asunto de commit único; conservar sin nuevos disparadores |
| .github/workflows/b2-acceptance-r2-postgres.yml | prepare y runner R2; pull_request_review submitted, PR12, rama exacta, review de owner y texto/commit específicos. Único archivo workflow que se propone extender para R3 |
| .github/workflows/b2-no-db.yml | unittest test_b2_execution_preflight; no llama al preflight en producción; rama B2 únicamente; no ampliar toda esta suite para R3 |
| docs/proposals/b2-integration/workflow.review.yml | Propuesta histórica de prepare/main combined, artefacto a03, no workflow instalado nuevo |
| docs/proposals/b2-invitations/workflow.review.yml | Propuesta histórica prepare/SQL4, ligada a hash; mantener inmutable |
| docs/proposals/b2-integration/APPROVAL.md y AUTHORIZATION.review.json | Consumidores documentales/hash a01 del harness; mantener íntegros |
| docs/proposals/b2-invitations/sql4-manifest.review.json, sql5-manifest.review.json y sql5-r2-manifest.review.json | Ligaduras de runners, fixtures y SQL; preservar archivos y comprobaciones originales |

##### Contrato canónico único propuesto

**Selección cerrada:** conservar main(scope='directory') y CLI --package; añadir exclusivamente el valor literal `sql5-r3` al enum existente. preflight conserva la llamada sin argumentos y el retorno SQL14 str; se propone argumento keyword-only `scope='directory'` que main pasa explícitamente. No aceptar branch, repository, identity, reference, arbitrary manifest path o fixture desde CLI/env. Una tabla cerrada dentro del harness asocia cada scope a su evento/rama/paquete; ningún JSON del PR puede ampliar esa tabla. Perfil desconocido o dato ausente/inconsistente: rechazo.

El mismo preflight aplica **una sola vez** los cinco guards actuales: bindings sensibles, aprobación directorio/hashes, aprobación SQL14/hash/blob y perfil de sesión B1; contexto alojado se valida también en ese único punto. Las validaciones de bytes/autorización de paquetes se mantienen en sus funciones canónicas. main resuelve todo el plan autorizado antes de importar transporte/fixture o inspeccionar Docker. El flujo R3 no usa monkeypatch ni llama prepare; no reemplaza preflight desde fuera. El retorno y llamadas históricas siguen disponibles, pero no conceden permiso a bytes nuevos.

**Matriz cerrada de contexto:**

| Scope | Evento/subtipo y origen admisibles | Autorización efectiva |
|---|---|---|
| directory/access/users/combined históricos | pull_request opened/synchronize/reopened, PR12, head repo novo34/cleanops-360, rama feat/b2-users-access; sin forks | Mantener guardas/contratos históricos; nunca derivar autorización del nombre de rama. Nueva versión del harness no queda autorizada por los registros antiguos |
| combined usado por runner SQL5-R1 | pull_request synchronize, mismo PR/rama; autorización R1 exacta y condición one-shot original | No reejecutar; nuevo harness + permiso viejo = rechazo. Mantener evidencias de su ejecución pasada |
| combined usado por runner SQL5-R2 | pull_request_review submitted, PR12, rama B2, owner/review.commit_id correctos y texto histórico exacto | No reejecutar; autorización R2 no habilita R3. Clasificación de revisión solo si coincide paquete/registro SQL5-R2, nunca por evento aislado |
| SQL4 workflow_dispatch | No tiene payload PR admisible en el workflow actual | Rechazo/SKIP conservado; no ampliar a dispatch ni reparar otros workflows |
| sql5-r3 propuesto | pull_request_review submitted, PR22 OPEN, base main, head repo exacto y rama codex/r3-sql5-controlled-preflight | Nueva aprobación nativa del propietario para C+M+W+scope; sin ella rechazo |

La tabla no añade ámbitos históricos nuevos: los clasifica para compatibilidad y conserva sus restricciones más estrechas. En los consumidores históricos donde el evento no identifica por sí solo el paquete, se exige además el registro específico y el set de artefactos; ninguna clasificación convierte combined en permiso SQL5.

**Evento/identidad/referencias R3:** leer GITHUB_EVENT_PATH real; comprobar GITHUB_EVENT_NAME, action=submitted, repository.id=1412999204/full_name, PR22, base/head repos, rama y base main; PR abierto y sin fork. Owner novo34 id 17856013 debe coincidir con repository.owner, review.user y sender; GITHUB_ACTOR_ID y GITHUB_TRIGGERING_ACTOR se contrastan con el owner. Exigir GITHUB_ACTIONS=true, RUNNER_ENVIRONMENT=github-hosted, primer intento (GITHUB_RUN_ATTEMPT=1), review.commit_id = PR.head.sha = git rev-parse HEAD = C de 40 hex. GITHUB_SHA del evento de review puede ser el merge ref: no se exige falsamente que sea el checkout C. GITHUB_HEAD_REF, si existe, debe coincidir con payload; si el evento no lo define, la rama procede del payload, sin escribir esa variable. Rechazar pull_request_target, push, issue_comment, dispatch, actor ajeno, review obsoleta y rerun: una nueva ejecución requiere nueva revisión explícita, no reutilizar el mismo evento.

**Aprobación nueva sin autorreferencia:** C será el commit candidato final que contiene todos los bytes del harness, workflow, fixture y SQL y el nuevo manifiesto; M = SHA-256 de ese manifiesto. La evidencia autorizante será la review real del propietario, ligada a C, cuyo body debe ser exactamente `Execute owner-authorized SQL5-R3 candidate C manifest M workflow W; native isolated validation only.` sustituyendo C/M/W por los valores completos. W es el SHA real de definición del workflow que la plataforma vaya a ejecutar. No se acepta un ownerApproved=true creado por el agente ni el registro R3 de aff420f. Guardar review.id, autor, commit, hash de body, run.id/attempt y C/M/W en evidencia sanitizada; no modificar esa review. No se crea otro archivo de autorización. El permiso para generar el candidato futuro y el permiso para ejecutarlo siguen separados.

**Confianza del workflow:** reutilizar exclusivamente .github/workflows/b2-acceptance-r2-postgres.yml, un solo job existente con condiciones mutuamente excluyentes R2/R3. La alternativa R3 hace checkout review.commit_id sin credenciales persistidas, y llama directamente `python scripts/b2-directory-postgres.py --package sql5-r3`; no añade workflow ni runner R3. Los pasos prepare/runner R2 quedan condicionados exclusivamente al contexto histórico R2; nunca corren para R3. La carga de artefactos reutiliza el paso existente con destino según scope. Mantener permissions contents:read, actions fijadas, timeout 15m, ninguna inyección de secretos y ningún trigger push/pull_request/dispatch nuevo.

Exigir GITHUB_WORKFLOW_SHA=W y comprobar que el archivo de workflow obtenido de git show W:path coincide con los bytes declarados en C; validar GITHUB_WORKFLOW_REF para la ruta exacta y el ref de review de PR22 esperado (`refs/pull/22/merge`). Si la plataforma resuelve la definición desde otro ref, no sustituir variables ni aceptar wildcard: el gate queda bloqueado hasta verificar documentalmente el ref real y aprobar ese ajuste exacto. Esto es una precondición de activación futura, no una afirmación de que el workflow modificado ya sea seleccionable antes de merge. La aprobación incluirá W real, diferente de C cuando corresponda; ni el manifiesto ni la review necesitan contener su propio hash. La autenticidad descansa en GitHub-hosted y la definición revisada/fijada, no en que JSON/env sean por sí mismos una firma criptográfica; no se proclama resistencia a código ya malicioso aprobado por el owner.

**Plan inmutable antes de transporte:** scope sql5-r3 fija SQL14→SQL1→SQL2→SQL3→SQL4→SQL5 candidato, fixture SQL5 y reporte artifacts/b2-acceptance-r3/report.json. Reutilizar transporte pg-test-01 y solo baseline b.fixtures() requerido; no ejecutar b.main(), suite combinada, SQL4 histórica ni fixtures access/users. El hook de navegador no se instala para este scope y functionalBrowser=SKIP_NOT_IN_THIS_PACKAGE; no se reclama UI validada. Después de verificar todos los bytes se analiza AST del fixture antes de importarlo. No cambiar SQL/roles ni excepciones de los módulos B1/B2 para satisfacer el harness. El futuro fixture SQL5 debe instalar solo las dos dependencias SQL4/candidato previstas y probar concurrencia real tras autorización; sus referencias se fijan al único candidato, nunca al R3 corrupto.

##### Hash histórico del harness: preservación de evidencia y permiso nuevo

La comparación de árboles Git de 7a78d06 y `3ea4ec890fd05a59ae803f005e29cad713d1e5e8` verifica los **20 blobs idénticos**, incluido a01 scripts/b2-directory-postgres.py, SHA-256 histórico `d968c9621cbd6327d9ce473b434b9bceebb58669c9cb4c60f79306f37027e00b`. No se omite a01 del manifiesto viejo ni se reemplaza su hash. prepare() y authorize_composition() históricos mantienen la comparación de los 20 bytes del árbol de trabajo con sus autorizaciones; al cambiar a01 deben fallar. Compatibilidad segura no significa hacer PASS esas aprobaciones sobre código nuevo.

Para R3, el único harness separa explícitamente:

1. **Procedencia histórica, solo lectura:** comprobar manifiesto original de composición y SHA-256 `133cc6643d7caa6082688bdbd6ba87cb4ffaad659de5c30911a6ef5b759f004b`, commit 3ea4ec8 y todos sus 20 artefactos mediante git show, incluido a01 antiguo; no importar ni ejecutar el harness extraído. Cotejar también aprobaciones individuales de SQL14/SQL1/SQL2/SQL3/SQL4 y contrato. Conservar esta verificación como evidencia de procedencia, nunca como permiso R3.
2. **Bundle actual R3, permiso independiente:** validar set exacto/hash de todos los archivos previstos, git show C:path == working bytes, HEAD limpio para esos archivos y aprobación real C/M/W. La discrepancia a01 antiguo/nuevo solo está permitida en el mapa explícito de reemplazos R3 de la tabla de diff; ambos hashes se publican. Ninguna excepción genérica de “harness permitido” o “ignorar hash”.
3. **Dependencias sin cambios:** a02…a20 se cotejan con los bytes históricos; no se ejecutan sus suites por verificarlas. Se incluyen además valores de seguridad y registros leídos por el transporte/preflight. Una discrepancia nueva fuera del mapa bloquea diseño; no ampliar permisos ni asumir equivalencia semántica.

Esto conserva intacta la evidencia histórica y exige nueva aprobación para TODOS los bytes que se ejecuten, incluido el harness y workflow actualizados. Las autorizaciones viejas no se consumen de nuevo; la nueva review debe autorizar explícitamente la instalación de dependencias históricas y baseline sintético en este scope. No cambiar prepare-b2-composition-approval.py para que maquille el manifiesto antiguo.

##### Diff futuro mínimo por archivo (propuesta, NO implementado)

| Ruta exacta | Acción mínima futura y propietario/consumidor |
|---|---|
| scripts/b2-directory-postgres.py | Modificar: único preflight y selector cerrado sql5-r3; validación de evento/review/bundle y plan antes de transporte; reporte específico. Owner B2/Security; consumidor único workflow SQL5 existente |
| .github/workflows/b2-acceptance-r2-postgres.yml | Modificar: extender el job existente con alternativa exacta PR22/R3, llamada directa al main y evidencia; preservar alternativa R2. Owner DevOps/Security; sin nueva definición paralela |
| tests/static/test_b2_execution_preflight.py | Modificar: extender la suite única para contexto/evento, referencias, manifiestos y pruebas de rechazo antes de transporte. Owner QA; consumidor unittest local y CI estática autorizada |
| docs/CLEANOPS_RECOVERY_TODO.md, solo R3 | Modificar: registrar diseño, futura implementación y evidencia. Owner PO/Engineering; único seguimiento |
| docs/proposals/b2-invitations/005-invitation-acceptance.r3-candidate.review.sql | Crear después de aprobación técnica: único candidato activo derivado de R2, sustitución literal mínima. Owner B2/SQL; consumidor fixture R3 y parser; originales conservados |
| docs/proposals/b2-invitations/acceptance-tests.r3-candidate.review.py | Crear después de aprobación técnica: único fixture del candidato, derivado de fixture histórico R3 con ruta corregida y regresiones imprescindibles; no runner. Owner B2/QA; consumidor main sql5-r3; ningún import antes de autorización/AST |
| docs/proposals/b2-invitations/sql5-r3-candidate-manifest.review.json | Crear después de aprobación técnica: un único manifiesto activo del bundle nuevo. Owner B2/Security; consumidor preflight; la nueva review autoriza su SHA-256 exacto |

Cero archivos nuevos en esta entrega de diseño. Los tres artefactos propuestos no son temporales ni otra arquitectura; se justifican por preservar originales inmutables y vincular un único candidato reparado con consumidor y evidencia. No crear runner, guard, wrapper, módulo genérico, test paralelo, workflow R3 ni nuevo roadmap. No modificar runners R1/R2/SQL4, prepare, manifiestos históricos, SQL14/SQL1–4, contratos, ACL/RLS, runtime/lib ni otras ramas.

**Set del nuevo manifiesto:** schemaVersion, scope fijo SQL5_R3_ACCEPTANCE_HOSTED_EPHEMERAL_PG16, contexto cerrado PR22/rama/evento/identidad/ruta workflow; historicalReferences fijados; files con rutas únicas y SHA-256. Campos desconocidos, claves JSON duplicadas, paths absolutos/../symlinks, digests inválidos, fichero extra/faltante o destino fuera del root: rechazo. No campo ownerApproved autoafirmado; C/M/W proceden de review/plataforma.

files incluirá exactamente: las 20 rutas a01…a20 del manifiesto de composición (a01 con NUEVO hash; otras 19 inmutables), el workflow existente SQL5-R2 con NUEVO hash, lib/b1/security-values.json, docs/implementation/b2/directory-authorization.json, access-authorization.json, users-authorization.json, combined-authorization.json, invitation-administration-authorization.json, invitation-contract-approval.json (todos bajo docs/implementation/b2), docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json, docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json, docs/proposals/b2-integration/AUTHORIZATION.review.json, docs/proposals/b2-invitations/004-invitation-administration.review.sql y los dos nuevos artefactos candidato SQL/fixture. **34 rutas**; el manifiesto no se incluye a sí mismo. Esas rutas se fijan en código, no se deducen aceptando cualquier files del JSON. Los dos registros de B1 se mencionan separadamente del directorio B2. El fixture no ejecutará ni importará archivos fuera del set. Una dependencia ejecutable adicional detectada obliga a revisar el set antes de implementar; no se declara cobertura dinámica completa por búsqueda textual.

##### Compatibilidad y migración acotada

| Consumidor | Fuente histórica | En el árbol con harness nuevo | Migración R3 |
|---|---|---|---|
| directory y access/users | Firmas, scopes, SQL y registros conservados | Se preservan validaciones; no dar por autorizada nueva versión del ejecutor. Sin permiso actualizado no ejecutar | Sin cambios de workflow ni repetición; solo extender pruebas estáticas de compatibilidad |
| prepare/combined | Manifiesto 20 artefactos 3ea4ec8 | FAIL esperado por nuevo hash a01; ese FAIL es protección, no regresión a suprimir | R3 verifica procedencia en git y bundle nuevo; no usa prepare ni muta metadata antigua |
| SQL4 runner/workflow | Manifiesto y suite histórica intactos | Rechazo si se intenta composición nueva bajo permiso antiguo; dispatch permanece bloqueado | SQL4 se instala solo como dependencia exacta expresamente incluida en nueva autorización |
| SQL5-R1/R2 runners | Registros exactos anteriores, resultados FAIL/PASS/SKIP conservados | No permisos para R3; no migrar su referencia ni reemplazar sus hashes | Workflow R2 mantiene ruta histórica condicionada; alternativa R3 llama main único, sin esos runners |
| SQL5-R3 histórico/preflight copiado | aff420f y 80c4268 inmutables | No se incorporan al árbol ni a CI | Reemplazo operativo por main canónico; evidencia histórica conservada por SHA |
| Pruebas preflight/CI no-db | Mismos métodos y rechazo antes de transporte | Añadir contexto sintético de evento e identidad; demostrar que bytes nuevos + permisos viejos fallan | Ampliar archivo de tests existente; ejecución local segura primero |
| SQL/contratos B1/B2 y frontend | Aprobaciones específicas, no activación productiva | Sin cambios funcionales por esta consolidación | Permisos, tenants, MFA/owned, sesiones y closedBackend intactos |

Orden futuro: aprobar diseño técnico → implementar los tres cambios ejecutables acotados y tres artefactos propuestos → verificar estáticamente/manifestar → publicar C y M, revisar independientemente C → comprobar definición real W/ref y elegibilidad del workflow sin iniciar servicios → solicitar NUEVA autorización nativa del owner ligada a C/M/W → solo entonces evento y ejecución. No marcar ready ni fusionar #22 para hacer seleccionable un workflow sin autorización. Si el workflow no resulta seleccionable o W/ref no cumple, registrar BLOCKED_FOR_NATIVE_VALIDATION y resolver activación por la gobernanza existente; no crear otro workflow ni usar pull_request_target.

##### Matriz de regresiones propuesta (todas PENDIENTES de implementación)

| ID | Positivo estático exigido | Negativas mínimas y efecto esperado |
|---|---|---|
| CTX-01 | Payload R3 completo, owner real simulado, PR22/rama y hosted coherentes | Scope/rama/PR/repo id/full_name/base/head/fork incorrectos; contexto ausente → FAIL antes de transporte |
| CTX-02 | Evento review submitted, owner id/login/sender/actor coherentes | push, pull_request_target, issue_comment, dispatch, review edited, actor ajeno, rerun → FAIL |
| REF-01 | review.commit_id=PR.head.sha=checkout C; W/ref exactos | Review obsoleta, checkout distinto, SHA corto, W distinto, workflow/ref ajenos; HEAD_REF contradictorio → FAIL; no escribir env |
| AUTH-01 | Review nueva literal con C/M/W y scope exactos | Usar permisos R1/R2/aff420f, ownerApproved local, aprobación individual para composición, body parcial o de otro SHA → FAIL |
| HASH-01 | Los 20 originales verificados en git; bundle C con nuevo a01 aprobado | Suprimir a01, actualizar manifiesto viejo, git object ausente, dependencia distinta o digest incorrecto → FAIL |
| MAN-01 | Set cerrado de 34 rutas y bytes iguales al commit | Missing/extra, clave duplicada, scope extraño, path traversal/symlink, fixture de otro candidato, manifiesto alterado → FAIL |
| SEC-01 | Los cinco guards únicos mantienen positivos previos | Mutar aprobación/hash/blob SQL14, sesiones, autorización directorio o bytes B2; DATABASE_URL/PGOPTIONS/PGPASSWORD/OPENBAO_TOKEN y demás bindings de regex → FAIL sin valor secreto en salida |
| FLOW-01 | main sql5-r3 genera plan exacto y AST válido, sin hook navegador | Fixture malformado, fallo en cualquier gate → assert transporte/fixture/Docker nunca llamados; no usar salidas antiguas como evidencia nueva |
| COMP-01 | Firmas y selección directory/access/users/combined conservadas; fuentes históricas intactas | Nuevo a01 con permisos históricos → FAIL esperado; ningún runner antiguo puede elegir sql5-r3 por monkeypatch o payload |
| SQL-01 | Sustitución callback y único diff R2→candidato; BEGIN/COMMIT, delimitadores y firmas | Reproducción $', truncamiento, cola duplicada, SQL tras COMMIT, GRANT/owner/ACL/RLS cambiados → rechazo estático; parser informa límites |
| CI-01 | Condiciones R2/R3 excluyentes en un job y un archivo; R3 invoca solo main | Publicar docs/push/review no-owner no inicia suite nativa; no ejecución R1/R2/SQL4 ni workflow paralelo |
| HIST-01 | Restar solo inserciones R3 recupera TODO y comparar árboles preserva históricos | Cualquier alteración fuera de R3/originales → FAIL documental |

Mocks de evento solo dentro de unittest/tempdir; no exportar metadatos sintéticos a un proceso CI de ejecución. No ejecutar main positivo con transporte real durante tests estáticos; interceptar load/subprocess del transporte, sin importar fixtures. Separar casos positivos del contrato, rechazo intencional e infraestructura SKIP. Ninguna de estas pruebas futuras recibe PASS en esta entrega.

**Controles estáticos posibles:** grafo de consumidores/imports, AST, esquema y hashes, set de archivos, contexto/evento simulado, rechazo antes de transporte, condiciones YAML, diff exacto y comparación de firmas/GRANT/ACL/RLS declarados. Parser existente PG16 puede verificar gramática con sus límites; su ausencia es SKIP. Tests con eventos sintéticos no acreditan identidad real ni elegibilidad de la definición GitHub. Comprobar contexto alojado real, W/ref y disparo seguro exige evidencia CI autorizada; integridad referencial/catálogos/tipos, ACL/RLS efectivos, tenants/roles, MFA/owned, locks/concurrencia simultánea, atomicidad/idempotencia y limpieza efectiva siguen pendientes de PostgreSQL 16 real específicamente autorizado.

**Contraste contractual:** leídos lib/b1/contracts.ts, lib/b2/invitation-acceptance.ts, docs/RBAC_PERMISSIONS.md, INVITATION_CONTRACT.review.md y invitation-contract-approval.json (contrato aprobado, sqlExecutionAuthorized=false). Preservar tenant derivado del servidor, deny explícito, separación capacidad de invitación/sesión B1, MFA antes de ACTIVE, no reset de identidad existente, ownership transaccional y no emisión de sesión desde aceptación. No cambiar evaluator RBAC ni GRANT/REVOKE/owners/RLS. Una verificación textual de esas invariantes no acredita su ejecución; defectos funcionales fuera de AUD-010/011/023 se registran sin iniciar R4.

**Riesgos y rollback:** el nuevo gate es código privilegiado y requiere revisión independiente de C y aprobación explícita; el body/env por sí solos no son firma. Rechazo accidental de un consumidor es preferible a autorizar bytes no aprobados; la matriz distingue esa incompatibilidad intencional de una regresión de API. Publicar código futuro no debe activar suites históricas. W/ref de GitHub es gate pendiente, no autorización inferida. Rollback documental: revert de este commit. Rollback futuro: revert conjunto de harness/workflow/tests y retirar la selección activa de candidato/manifiesto, conservándolos por commit y las evidencias; sin ejecutar SQL inverso, modificar originales ni reautorizar ejecuciones antiguas. Si ya hubiera ejecución efímera autorizada, limpieza por ownership antes de cerrar; no force-push, reglas, bases congeladas o despliegue.

**Dictamen QG-0:** inventario, contrato, alternativas, diff por archivo, owners/consumidores, compatibilidad, riesgos, pruebas y rollback preparados para revisión técnica. Preferencia extend/reuse; create solo tres artefactos de revisión con propósito y consumidor, más tarde. STOP-AND-DESIGN no levantado: pendiente aprobación técnica del contrato y verificación de elegibilidad W/ref antes de activar nativo. No implementación ejecutable, candidato SQL, manifiesto nuevo ni permiso nativo emitidos. QG-1/QG-2 de documentación: sin duplicación nueva; QG-3 de aceptación pendiente. R3 OPEN/BLOCKED_FOR_DESIGN; #22 borrador; R4/R5 no iniciados.

**Validación de esta entrega documental:** PASS lectura y análisis AST de los archivos Python dentro de los 166 archivos recuperados, sin imports de runtime: confirma las dos llamadas directas de producción y cuatro puntos de llamada en tests. PASS cotejo por blob de los 20 artefactos históricos. PASS reconstrucción exacta del TODO previo retirando solo esta inserción; mismas casillas y estados, sin alterar R0/R1/R2. Pruebas CTX/REF/AUTH/HASH/MAN/SEC/FLOW/COMP/SQL/CI propuestas: NOT_RUN; no existe implementación del contrato ni candidato que probar. CI del nuevo SHA y revisión independiente nueva se consultarán en el PR; no heredan PASS del SHA anterior.



#### R3 — Implementación estática autorizada tras revisión de diseño (2026-10-26)

**Estado vigente: OPEN / BLOCKED_FOR_NATIVE_VALIDATION; activación del workflow bloqueada.** El propietario autoriza esta implementación estática después de la revisión de de708e4542d0a50f487f965b082a2f33fd31fd3b. Codex sin problemas importantes: https://github.com/novo34/cleanops-360/pull/22#issuecomment-6419089311 . El STOP de diseño permite este diff acotado; no concede permiso de activación, PostgreSQL, merge o cierre. Los estados de diseño precedentes se conservan como historial. Main inicial confirmado: 975134a78621820bf3b790c392ab35726194ec66; padre del trabajo: de708e4542d0a50f487f965b082a2f33fd31fd3b. El SHA publicado y la revisión independiente final se registran en el mismo PR para evitar autorreferencia. Antes de publicar se detectó el avance documental f053f5af4cd479f92910da1b065cd5f0e13137d1; se conserva íntegro como nueva base de publicación, sin sobrescribir la decisión técnica añadida.

**QG-0 ejecutable, aplicado antes de editar:** reutilizar los consumidores y contrato inventariados arriba; corregir AUD-010 desde R2 y AUD-011/023 en un solo preflight/main. Cuatro archivos existentes modificados (harness, workflow SQL5-R2, suite estática y este TODO, solo R3); tres artefactos de revisión nuevos (SQL/fixture/manifiesto), cada uno con dueño y consumidor descritos en el diseño. Ningún runner/wrapper/workflow paralelo. Alcance excluye SQL14/SQL1–4, B1/B2 funcional, seguridad/ACL/RLS, producción, R4 y R5. Riesgos: permisos de bytes nuevos, confianza del evento, elegibilidad W/ref y no confundir análisis léxico con PostgreSQL. Pruebas locales antes de CI; rollback conjunto por revert normal, sin SQL inverso, force-push ni alteración de evidencias históricas.

**Elegibilidad analizada ANTES de modificar el workflow:** fuente oficial leída por SHA: https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md#pull_request_review . Documenta review submitted/edited/dismissed y GITHUB_REF=refs/pull/NUMERO/merge, GITHUB_SHA=último merge commit; ese apartado no contiene la restricción de archivo en default branch presente en otros eventos. Esto describe semántica, NO prueba selección/ejecutabilidad de nuestra W. El archivo del mismo nombre ya existe en main, pero la versión nueva solo está propuesta. No se emitió ningún evento de autorización nativa para ensayar elegibilidad. W real, GITHUB_WORKFLOW_REF y posibilidad de selección siguen NOT_VALIDATED. Si la plataforma exige integrar primero la definición, esa integración/activación requiere gobernanza y autorización específica; no se crea otro workflow, ni dispatch, ni pull_request_target.

**Cierre de activación verificable:** el job existente preserva la condición histórica PR12 y añade la alternativa R3 con `(false && PR22...)`; el paso main R3 también tiene `if: ${{ false }}`. El harness mantiene R3_NATIVE_ENABLED=False y falla con R3_NATIVE_ACTIVATION_REQUIRED aun con C/M/W sintéticos válidos, antes de importar transporte/fixture. Publicar o pedir revisión de #22 no habilita el job R3. Activar exigirá modificar bytes revisados, producir NUEVOS C/M/W y autorización posterior; los hashes de esta entrega no autorizan esa futura variante activada.

**Archivos/propiedad y consumidores:** scripts/b2-directory-postgres.py (B2/Security, main y preflight canónicos); .github/workflows/b2-acceptance-r2-postgres.yml (DevOps/Security, mismo job SQL5); tests/static/test_b2_execution_preflight.py (QA, unittest existente); docs/CLEANOPS_RECOVERY_TODO.md (PO/Engineering, recuperación R3); los tres nuevos archivos de docs/proposals/b2-invitations pertenecen respectivamente a B2/SQL, B2/QA y B2/Security y se consumen por el plan sql5-r3/parser y por el verificador del bundle. Ningún archivo eliminado. Autorizaciones, manifiestos y originales R1/R2/R3 se conservan sin cambios; R3 original sigue en su commit/rama históricos, no se incorpora una segunda copia ejecutable.

| Artefacto candidato único | Bytes | SHA-256 |
|---|---:|---|
| 005-invitation-acceptance.r3-candidate.review.sql | 29704 | b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2 |
| acceptance-tests.r3-candidate.review.py | 10744 | aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb |
| sql5-r3-candidate-manifest.review.json | 4999 | 4a694627864d89d2c9b96b863eb1efb5bdaf056cf0a77a3e7affe57f2d7021a9 |

**Diff SQL funcional exacto, línea 156:** sustituir solo `coalesce(method->>'ciphertext','') !~ '^(?:[a-f0-9]{2}){29,512}$'` por `(length(coalesce(method->>'ciphertext','')) NOT BETWEEN 58 AND 1024 OR length(coalesce(method->>'ciphertext','')) % 2 <> 0 OR coalesce(method->>'ciphertext','') !~ '^[a-f0-9]+$')`. Python str.replace literal, una ocurrencia verificada; no expansión de `$'`. Todo el resto del archivo coincide byte por byte con R2. El fixture solo cambia la ruta R3 histórica a la candidata; restaurar esa ruta recupera exactamente SHA-256 02b5922a9b02ed0c0a4c93009fb455e3b7f75ce9e68e1f8429a66ff23cc6c68a. No se cambia la semántica ni se ejecuta su concurrencia.

**Compatibilidad y autorización:** se conserva firma preflight() y su retorno SQL14; main transmite scope keyword-only. Una sola función execution_context valida scopes cerrados, evento real, owner/actor/sender, repositorio/id, rama/PR y hosted; la rama sale del payload sin escribir GITHUB_HEAD_REF. Se conserva una sola copia de los cinco guards. Los consumidores históricos reciben comprobaciones de contexto coherentes y no pueden ejecutar el harness nuevo usando sus permisos viejos; prepare/composición conservan intacta la verificación original que rechaza a01 nuevo. El caso de rechazo deliberado está cubierto para directory/access/users/combined. R3 verifica los 20 artefactos originales por objetos Git, incluido a01 histórico, y los 34 archivos del bundle actual por hash y C. Las otras 19 rutas de composición permanecen iguales; nueve registros/valores adicionales se fijan también por hash para no ampliar indirectamente el diff. SQL4 exacto y manifiesto histórico se comprueban aparte. Nunca reescribir a01 ni manifestar que el permiso histórico autoriza bytes nuevos. No importar ni ejecutar código extraído del historial.

**Resultados ejecutados localmente:** `python -B -m unittest discover -s tests/static -p test_b2_execution_preflight.py -v`: **33 PASS, 0 FAIL, 1 SKIP (34 tests)**. Incluye los diez tests originales ampliando solo su contexto sintético; 24 casos nuevos con subcasos de evento/rama/owner/fork/ref/checkout, manifest/hashes/paths/symlinks, aprobación antigua, dependencias alteradas incluso rehasheadas y fixture AST inválido. El positivo usa bytes reales y Git histórico para procedencia, con evento/checkout C/W simulados solo en unittest y transporte interceptado. No es una autorización real ni acredita identidad CI.

| Requisito / mecanismo / consumidor | Evidencia de esta entrega |
|---|---|
| AUD-010, candidato y fixture sql5-r3 | PASS diff literal único y archivo entero; regresión Node reproduce SHA del R3 corrupto y callback obtiene candidato; longitudes/paridad/hex conservan lenguaje intencionado en modelo Python |
| AUD-011, execution_context/preflight y main | PASS contexto positivo sintético y negativas antes de transporte; ausencia de HEAD_REF en review usa payload; variables reales nunca falseadas |
| AUD-023, harness canónico y workflow existente | PASS sin nuevo runner/guard/workflow; gate nativo cerrado incluso tras autorización simulada válida; imports de transporte nunca llamados en negativas |
| Procedencia, 20 originales y 34 archivos actuales | PASS todos los hashes; a01 original conservado vía Git, otras 19 rutas idénticas; rechazo de bundle/record/valores modificados y manifiesto histórico alterado |
| SQL íntegro/ACL/contratos declarados | PASS igualdad de todos los bytes salvo predicado; 38 statements léxicos, 11 funciones, 8 statements ACL; BEGIN y único COMMIT final, comillas y dollar-quotes también inspeccionados dentro de cuerpos |
| Referencias declaradas | Escaneo textual SQL14/SQL1–5: 125 declaraciones de función, 20 referencias cualificadas SQL5 y cero referencias introducidas; cuatro corresponden a tablas. No acredita resolución de catálogo/tipos/privilegios |
| Gramática PostgreSQL/PLpgSQL | SKIP: pglast ausente. Lexer existente no es parser PostgreSQL; no se instaló parser pesado ni servidor |
| ACL/RLS efectivos, tenants/roles, locks, MFA/owned, idempotencia, simultaneidad, integridad y limpieza reales | SKIP: ninguna prueba nativa autorizada ni ejecutada |

También PASS: AST Python de harness/tests/fixture; `git diff --check`; verificación independiente de los 34 hashes reales del manifiesto. Log local /tmp/r3-static-tests.log; resultados y comandos se publican en la evidencia del PR por SHA. Las negativas que esperan rechazo son tests PASS, no ejecuciones SQL fallidas; se conserva FAIL del R3 histórico y su reporte anterior, sin repetirlo. No se atribuye PASS del diseño ni de main al commit nuevo. CI Quality/engineering-policy y revisión Codex del SHA publicado deben consultarse en #22; QG-3 sigue abierto y no se falsean sus casillas para obtener PASS.

**QG-1/QG-2:** causa raíz reparada estáticamente, sin mecanismo paralelo ni pérdida de evidencia; no hubo que ejecutar infraestructura para superar tests. **QG-3:** candidato estático preparado para revisión, no aceptación. Pendientes: revisión independiente del SHA final; validación/activación W/ref por gobernanza; nueva autorización nativa exacta C/M/W/scope/dependencias; PostgreSQL 16 efímero y fixtures/ACL/RLS/concurrencia/limpieza autorizados; revisión posterior; autorización de merge y cierre. R3 no DONE, R4 no iniciado, AUTH-GATE-05 OPEN y closedBackend conectado; rulesets 25879296/25820330 y bases congeladas sin cambios. Cero SQL ejecutado, PostgreSQL, Docker PostgreSQL, OpenBao, migraciones/seeds/datos persistentes, despliegues o merge.



##### R3 — FAIL CI investigado y ajuste exacto del mecanismo existente

Quality de fceffc302f44819cca19196ba3adc84878e7e5f2: FAIL en Gitleaks, https://github.com/novo34/cleanops-360/actions/runs/40347200390/job/121657186525 . Auditoría npm, guard/tests Semgrep y fixtures estáticos pasaron antes de ese paso. El log muestra cuatro generic-api-key, exclusivamente en líneas 34/35/46/49 del nuevo manifiesto. Verificación posterior: son los SHA-256 públicos de SQL2, fixture access R2, E2E access y config Playwright access; coinciden con sus bytes y con el mismo objeto en 3ea4ec890fd05a59ae803f005e29cad713d1e5e8. Ninguna credencial ni secreto nuevo identificado en esos hallazgos. No se cambia su contenido ni se reformatea el manifiesto para ocultarlos; su SHA sigue 4a694627864d89d2c9b96b863eb1efb5bdaf056cf0a77a3e7affe57f2d7021a9.

QG-0 adicional antes del ajuste: inventariado .gitleaksignore, cuyo mecanismo canónico ya registra digests públicos mediante commit/archivo/regla/línea. Extender solo con los cuatro fingerprints exactos del commit fceffc3; alternativa de excluir ruta/regla/manifiesto completo rechazada. Propietario Security/QA, consumidor Gitleaks existente, evidencia hashes/objetos históricos y log, riesgo de excepción excesiva evitado por alcance inmutable. Cinco archivos existentes modificados y tres nuevos en el diff acumulado (ocho en total); no modificar otro scanner/guard/workflow. Conservar el prefijo completo de .gitleaksignore y todos sus fingerprints anteriores. No se afirma aprobación humana de estas entradas por el agente: quedan sujetas a revisión independiente del SHA final y aprobación del propietario antes de aceptación/merge. Condición de retirada: si el historial examinado ya no contiene esas ubicaciones, revisar y retirar solo esas entradas; nunca reescribir historia para producir un PASS.

Los cuatro fingerprints propuestos son fceffc302f44819cca19196ba3adc84878e7e5f2:docs/proposals/b2-invitations/sql5-r3-candidate-manifest.review.json:generic-api-key:34, :35, :46 y :49 (mismo prefijo completo). No afectan archivos/rules/commits futuros ni deshabilitan el detector. Rollback del ajuste mediante revert de su commit, sin tocar candidato/hashes, permisos o autorizaciones. CI del SHA final debe verificarse de nuevo; el FAIL original se conserva y no se convierte retroactivamente en PASS. Engineering-policy de fceffc3 sigue FAIL y no se falsea el formulario para resolverlo. Native suites SKIP; no hubo SQL/infraestructura ejecutada para investigar este FAIL.



##### R3 — Validación estática final y corrección documental (2026-10-26)

**Estado: OPEN/BLOCKED_FOR_NATIVE_VALIDATION; PR #22 DRAFT.** Inicio verificado en e23c9507dd79d22996ee1ac66b1467dc3e8278a9 y main 975134a78621820bf3b790c392ab35726194ec66. Revisión independiente de e23c950 finalizada sin problemas importantes: https://github.com/novo34/cleanops-360/pull/22#issuecomment-6419779211 . Esta intervención no reconstruye SQL/fixture/manifiesto, no modifica harness/workflow/arquitectura ni amplía exclusiones; solo actualiza cuerpo del PR y añade esta evidencia R3. QG-0: reutilizar verificador documental, parser/instalador y suite existentes; propietario PO/Engineering/QA; consumidor revisión y gate; diff mínimo un archivo existente (TODO, solo inserción R3) más metadata PR; rollback por revert documental/restauración de metadata, sin SQL ni infraestructura. Se conservan íntegros R0/R1/R2 y registros anteriores.

**Engineering-policy real, diagnóstico y corrección:** https://github.com/novo34/cleanops-360/actions/runs/40347972760/job/121659921464 devuelve cuatro errores: dos campos insuficientes y dos casillas abiertas. El dialecto de scripts/check-pr-engineering-policy.py rechaza guiones bajos fuera de código inline: las rutas con underscores en inventario/justificación invalidaban respuestas completas. Reproducción local: answer_text rechaza el nombre desnudo CLEANOPS_RECOVERY_TODO.md y acepta la ruta entre backticks. Cuerpo nuevo con formato exacto de la plantilla, los ocho archivos, propietarios/consumidores, hashes, resultados, riesgos y pendientes actuales. Se acredita la casilla de causa raíz por la reparación estática revisada y la resolución técnica del STOP; la casilla de seguridad/multiempresa/concurrencia/idempotencia permanece abierta. Verificación local del cuerpo nuevo: todos los campos válidos, ocho casillas acreditadas y un único error legítimo en esa casilla nativa; CLI devuelve 1. No hay excepción del checker ni PASS documental artificial; este gate exige todas las casillas y no puede pasar legítimamente antes de esas pruebas reales.

**Parser existente evaluado y utilizado de forma aislada:** el entorno base sigue sin pglast. Se creó únicamente /tmp/cleanops-r3-parser-venv; se reutilizó scripts/install-pg16-parser.py sin modificarlo, dentro del venv, con fuentes fijadas a lelit/pglast@a238e28b0d655f0b57c40215585e0d0f39574442 y pganalyze/libpg_query@fce106abf41205e5d0db47bea7de44ad1e36f7a5. Una primera compilación FAIL porque Python configuraba clang ausente; corregido solo para el proceso de compilación con CC=gcc, ya disponible. No se instaló compilador ni paquetes globales ni se alteró ninguna variable de GitHub Actions. La lectura de red inicial del sandbox estaba restringida; la capacidad adicional de red permitió obtener las mismas fuentes fijadas, sin eludir proxy/TLS ni leer credenciales. El instalador confirma pglast 6.16, gramática PG16.1, sqlExecuted=false y limpieza de fuentes; comprobación posterior: cero directorios temporales b1-pg16-parser restantes.

SHA-256 de los archivos fuente descargados: pglast 0ee15c99f351dfbaaabcbacd80ddd51d2fe37e657279f95f3c3a829de7681337; libpg_query 40e39025f9d587747f760af2b6879d8896c0095eed4d2a3b2a8af8adab58352a. El parser es biblioteca gramatical, no servidor PostgreSQL, transporte, migración ni ejecución SQL. Se conserva sin cambios el candidato y el mecanismo de parseo.

Comando ejecutado: /tmp/cleanops-r3-parser-venv/bin/python -B scripts/parse-b1-sql.py docs/proposals/b2-invitations/005-invitation-acceptance.r3-candidate.review.sql . Resultado: PASS, parserVersion [16,1], functionDeclarations 11, errors [], parserAdaptations []; salida 0. No se aplicó el placeholder RETURN NEXT del helper a este archivo. Cierra el SKIP de gramática del entorno anterior; no reescribe su evidencia histórica. Limitación explícita del parser: no resuelve catálogo, tipos, privilegios ni planificación dinámica; no demuestra ACL/RLS efectivos, roles/tenants, MFA/owned, locks, atomicidad, idempotencia, concurrencia o limpieza de un PostgreSQL real.

**Regresiones necesarias repetidas:** /tmp/cleanops-r3-parser-venv/bin/python -B -m unittest discover -s tests/static -p test_b2_execution_preflight.py -v . Resultado: 34 PASS, 0 FAIL, 0 SKIP en la suite estática (incluye ahora la prueba del parser). Los eventos y C/W simulados permanecen exclusivamente en unittest; los fixtures nativos no se importaron ni ejecutaron, transporte interceptado. Evidencia local: /tmp/r3-final-static-tests.log, SHA-256 f3780c89091a3428a2bbaa9692bd85e8a927150e4e875f13be03dfc1728fa1b3. Informe /tmp/r3-pg16-grammar-report.json, SHA-256 23d620c19be17cd71113d52497bf7ed4b5de1cd80760d50ddf9d79c1b9cdc9a0. Las salidas se registran además en el comentario del PR por SHA.

| Comprobación final | Resultado / límite |
|---|---|
| 41 blobs locales frente al árbol remoto e23c950 | PASS, incluidos parser/instalador/checker y los artefactos del bundle |
| Manifiesto completo de 34 archivos | PASS todos los SHA-256, sin regenerarlo |
| 20 artefactos históricos | PASS objetos y hashes; 19 siguen idénticos en el bundle actual; a01 original conservado en Git |
| Candidato SQL / fixture / manifiesto | Inmutables: b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2 / aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb / 4a694627864d89d2c9b96b863eb1efb5bdaf056cf0a77a3e7affe57f2d7021a9 |
| Cuatro fingerprints Gitleaks | PASS revisión de validez/necesidad: solo commit fceffc3, regla generic-api-key, manifiesto y líneas 34/35/46/49; coinciden con hashes de objetos públicos de 3ea4ec8. No nuevas entradas ni exclusiones ampliadas |
| Necesidad de esos fingerprints | El rango histórico de Quality incluye fceffc3, que produjo los cuatro hallazgos en el run original; eliminarlos reintroduciría esos falsos positivos. No se cambió .gitleaksignore ni se habilitó una exclusión por ruta/regla |
| Desactivación nativa | PASS: R3_NATIVE_ENABLED=False verificado por AST; alternativa PR22 false y paso nativo false en el workflow, bytes intactos |
| W/ref reales | NOT_VALIDATED; no se emite evento ni se activa definición |
| ACL/RLS efectivos, multiempresa, concurrencia/idempotencia, integridad/limpieza nativas | SKIP, requieren autorización y PG16 efímero real |
| CI previa e23c950 | Quality PASS run 40347975636; engineering-policy FAIL run 40347972760; 32 checks SKIP. No se hereda PASS de esos runs al SHA nuevo |

**Autorizaciones exactas pendientes:** aceptación expresa del propietario de las cuatro entradas Gitleaks propuestas antes de merge; gobernanza y autorización específica para selección/integración/activación de la definición real W/ref (si exige main, no fusionar por conveniencia); revisión y publicación de los nuevos bytes activados con C, SHA-256 del manifiesto M y W exactos; autorización nueva de ejecución nativa por C/M/W y scope SQL5_R3_ACCEPTANCE_HOSTED_EPHEMERAL_PG16, dependencias/fixtures exactos, propietario e intento/evento válidos; PostgreSQL 16 efímero aislado sintético con ACL/RLS, multiempresa, concurrencia/idempotencia, integridad y limpieza; revisión independiente posterior a cualquier corrección; autorización separada de merge y aceptación/cierre formal R3. R4 solo tras cierre formal, nunca por este informe.

El cuerpo PR se actualizará con el SHA documental publicado y se solicitará nueva revisión independiente; sus resultados y CI real se registran en el PR para no crear autorreferencia en este commit. QG-1/QG-2 de esta intervención: sin cambios ejecutables ni mecanismos nuevos; QG-3 de aceptación continúa abierto. AUTH-GATE-05 OPEN, closedBackend conectado y protecciones históricas sin cambios. Cero PostgreSQL/Docker PostgreSQL/SQL ejecutado/OpenBao/migraciones/fixtures nativos/datos persistentes/despliegues/merge; no R4.


#### R3 — Desbloqueo de gobernanza W/ref: evidencia y secuencia condicionada (2026-10-26)

**Estado: OPEN/BLOCKED_FOR_NATIVE_VALIDATION; PR #22 DRAFT. DISEÑO Y LECTURA, NO AUTORIZACIÓN.** HEAD inicial de main: `975134a78621820bf3b790c392ab35726194ec66`; HEAD PR22: `f51cdd2df53d07825c5963e68f23abea7444dd23`. mergeable=true y mergeable_state=blocked; la capacidad de combinar árboles no concede permiso de merge. Esta actualización añade exclusivamente evidencia R3 al TODO y no cambia SQL5, fixture, manifiesto, harness, workflow, triggers, permisos o protecciones. Conserva todos los registros anteriores. QG-0: fuentes inspeccionadas AGENTS/política §§2–5/8, TODO, workflow SQL5, engineering-policy, harness y APIs/docs indicadas abajo; reutilizar mecanismo existente, no nueva arquitectura. Dueño PO/Engineering/Security; consumidor decisión del propietario y revisión independiente. Diff mínimo: un documento existente, sin archivos nuevos; pruebas de preservación por comparación de árboles/contenido. Rollback documental por revert normal, sin SQL ni force-push.

##### 1. Protecciones observadas: no confundir mecanismos ni permisos

| Fuente leída | Evidencia actual | Alcance y límite |
|---|---|---|
| GET branches/main | protected=true; protection.enabled=true; required_status_checks.enforcement_level=everyone; contexto engineering-policy; app_id=15368 (GitHub Actions) | PASS resumen de rama: el check es obligatorio. No acredita todos los detalles de protección clásica ni ausencia de bypass administrativo |
| GET rulesets?includes_parents=true | Dos rulesets de repositorio devueltos: 25820330 temporal y 25879296 permanente, ambos ACTIVE | Lista solicitada con herencia; no se devolvieron otros rulesets. No sustituye lectura de protección clásica |
| GET rulesets/25820330 y /25879296 | Ambos incluyen exclusivamente refs/heads/feat/foundation-bootstrap, feat/b1-auth-rbac-rls, docs/b1-v4-canonical-publication y feat/b1-http-flows; exclude=[]; update/deletion/non_fast_forward; bypass_actors=[]; current_user_can_bypass=never | PASS: inmovilizan las cuatro bases históricas, NO refs/heads/main. Su bypass vacío no demuestra bypass vacío en main |
| GET branches/main/protection | 403 Resource not accessible by integration | NOT_VERIFIED para protección clásica completa. No ausencia de protección |
| Subrecursos required_status_checks, required_pull_request_reviews, enforce_admins | También 403 Resource not accessible by integration | NOT_VERIFIED: strict/up-to-date, reviews requeridas, administradores, excepciones de revisión/push, conversaciones, force-push/borrado y demás ajustes detallados no se revalidan por esta conexión |
| GET rules/branches/main | Rechazo del conector INVALID_ARGUMENT por endpoint no soportado; no respuesta efectiva de GitHub | CONNECTOR_UNSUPPORTED, no lista vacía de reglas efectivas ni 403 remoto. No se intentó eludir la conexión |

Lectura de las cuatro ramas confirma protected=true y SHA intactos: foundation `8aeff94569cc9698c8e18ca8266515f51061faa2`; auth-rbac-rls `9f13c78d6c49194db1bd422db19128460f93f5fc`; publicación V4 `bd0de506d033f4c617d23c3be42fd325f21225f5`; http-flows `569975aab87c377248a7e9239cec237f5a20b9c6`. Ninguna escritura, desbloqueo ni prueba destructiva.

**Solicitud de lectura al propietario, pendiente:** aportar export actual con Administration:read de `GET /repos/novo34/cleanops-360/branches/main/protection` y, si está disponible, `GET /repos/novo34/cleanops-360/rules/branches/main`, junto con lista heredada de rulesets. Debe acreditar checks/app/strict, requisito de PR/revisiones, descarte de reviews obsoletas, administradores/excepciones/bypass, conversaciones, restricciones de push, force-push/borrado y otros gates configurados. No proporcionar tokens ni credenciales. Las confirmaciones administrativas históricas se conservan como evidencia de su fecha, no como relectura actual. No autorizar una estrategia de integración basándose en un 403.

##### 2. Selección documentada, evidencia histórica y W/ref todavía no observados

Fuentes oficiales leídas y fijadas a github/docs@`02c25d16369fe27f9bdb28d1201f6b452f0d21dd`:
- `data/reusables/actions/about-triggers.md`: busca workflows en el commit/ref asociado al evento y usa la versión de ese ref; algunos eventos exigen además presencia en default branch.
- `content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md#pull_request_review`: evento de review, GITHUB_REF=refs/pull/NUMERO/merge y GITHUB_SHA=último commit de ese merge ref; ese apartado no impone explícitamente default-branch presence.
- `data/reusables/actions/workflow-ref-description.md` y `workflow-sha-description.md`: ref/ruta y commit de la definición realmente usada. Son conceptos distintos del checkout explícito y del blob del archivo.

El path `.github/workflows/b2-acceptance-r2-postgres.yml` YA existe en main (2040 caracteres, versión R2); la versión del PR tiene 2967 caracteres. No falta registrar un path nuevo en main ni se ha demostrado que haya que fusionar la versión actualizada para seleccionarla. La lectura del endpoint de metadata `actions/workflows/391577171` fue rechazada por el conector; no se inventa su state administrativo.

**Evidencia real disponible sin disparar nada:** run `39585052936`, evento pull_request_review, PR12, workflow_id 391577171, path SQL5-R2, API head_sha `96d2ada22845e7c7e3e1131f6ea814152c3be89b`. Job `119171778246` registra checkout explícito de ese mismo SHA. La base B1 `569975a...` no contiene ese workflow según GET contents (404); esto distingue selección del workflow de la mera lectura del archivo en esa base, pero no reconstruye por sí solo el estado histórico de la rama por defecto. No volver a ejecutar ese run ni consumir su autorización.

Se descargó SOLO para lectura el artefacto sanitizado `12339033084` del run histórico: ZIP SHA-256 `e56ecc0e3df13778c0cc1e5d0daadddeb6a365551339cc32ff1d60744f3b678a`; report.json SHA-256 `2fb82c0bc1b3b24abb10824e4f95b8c48d4e8edcbcb9e3a20570ea86664426e9`, ambos iguales a la procedencia registrada. Sus claves son b2TechReady/checks/cleanup/existingIdentityAcceptance/functionalBrowser/image/result/runtime/scope; NO registra workflow_sha/workflow_ref ni GITHUB_WORKFLOW_SHA/GITHUB_WORKFLOW_REF. Los logs leídos tampoco contienen esos dos campos. Estado: **NOT_RECORDED**, no permiso para deducirlos. La API head_sha es metadata del run y el log acredita checkout; ninguno sustituye W. No extraer ni ejecutar código del ZIP.

**Snapshot Git real para PR22, anterior a esta inserción documental:**

| Símbolo | Valor observado o estado |
|---|---|
| B0, base main | 975134a78621820bf3b790c392ab35726194ec66 |
| C0, HEAD PR22 | f51cdd2df53d07825c5963e68f23abea7444dd23 |
| M0, SHA-256 del manifiesto actual | 4a694627864d89d2c9b96b863eb1efb5bdaf056cf0a77a3e7affe57f2d7021a9, inmutable en esta intervención |
| Ref Git leído | GET git/ref/pull/22/merge devuelve refs/pull/22/merge |
| V0, commit de prueba de merge creado por GitHub | 6abf0863a46bc872f8dbc0c6bb1df3d1a73ff513; NO es merge realizado en main |
| Padres de V0 | B0 y C0, en ese orden |
| Árbol de V0 y C0 | Ambos 3d9e6d4bb15c564047b2be6eee93fe82e04c85bc; el workflow de V0 coincide exactamente con C0 y difiere del de main |
| W real de un runner PR22 | NOT_VALIDATED: no se lanzó ni observó un job que exporte su GITHUB_WORKFLOW_SHA |
| workflow_ref real de un runner PR22 | NOT_VALIDATED: no se inventa desde V0, C0, head_sha o nombre del workflow |

V0 demuestra disponibilidad de bytes en el ref Git asociado al evento, NO que un runner los haya seleccionado. Documentación y contenido son compatibles con selección pre-merge; no se acredita ejecución actual de W. Este commit documental cambiará C y normalmente el merge ref: V0/C0 son evidencia histórica, NO tupla para una autorización futura. Toda observación/autorización debe usar valores actuales después de finalizar y revisar los bytes.

##### 3. Compatibilidad del contrato y defecto de una secuencia integración-primero

El harness actual exige: repo/id/owner/evento/identidad/hosted exactos; review submitted de owner y estado commented; PR22 OPEN, base main, rama codex/r3-sql5-controlled-preflight; review.commit_id=PR.head.sha=checkout C; GITHUB_REF=refs/pull/22/merge; GITHUB_WORKFLOW_REF=novo34/cleanops-360/.github/workflows/b2-acceptance-r2-postgres.yml@refs/pull/22/merge; GITHUB_WORKFLOW_SHA=W=GITHUB_SHA; bytes de workflow en W iguales a los manifestados en C. M es SHA-256 del manifiesto completo, no commit ni blob.

**Compatibilidad condicionada, no PASS observado:** si GitHub selecciona la definición desde el merge ref como describe la documentación del evento, V identifica el candidato natural a W y sus bytes satisfacen la comparación con C en este snapshot. La igualdad W=GITHUB_SHA y el ref literal se deben observar en el runner, no inferir de la metadata. Un W/ref de main/head distinto será rechazado; antes de proponer cualquier corrección se requiere evidencia del desajuste concreto. No relajar a wildcard ni falsear env. No hay defecto confirmado que justifique modificar hoy SQL/fixture/manifiesto/harness.

**Incompatibilidad comprobada de orden:** “fusionar PR22 → activar → ejecutar una review de PR22” NO cumple el contrato actual: el merge cierra PR22 y el guard requiere OPEN; el ref de PR no sirve como identidad estable posterior a merge. No reutilizar C0, V0 o el permiso de PR22 cerrado. Si una evidencia futura obligara a integrar antes, haría falta una propuesta posterior que resuelva explícitamente contrato de PR abierto y gobernanza, no un cambio silencioso de rama/PR ni otro runner.

Las tres barreras siguen intactas: false en alternativa de job R3, if false en paso nativo y R3_NATIVE_ENABLED=False. No se cambió ninguna en esta intervención.

##### 4. Engineering-policy: distinguir readiness para merge de autorización para probar

Quality de C0 PASS: https://github.com/novo34/cleanops-360/actions/runs/40355129627/job/121685411603 . Engineering-policy de C0 FAIL: https://github.com/novo34/cleanops-360/actions/runs/40355126385/job/121685404913 . El log registra checkout de main@975134a y un único error auténtico: casilla de seguridad/multiempresa/concurrencia/idempotencia aún no probadas. El workflow canónico usa pull_request_target solo para leer política desde base; no ejecuta código head. No se propone usarlo para R3.

El resumen de protección hace ese check obligatorio para MERGE; no prueba un bloqueo general de Actions. El workflow SQL5 y su harness no consultan engineering-policy como condición técnica de ejecución. La política §5 exige QG-3 antes de merge/READY_FOR_PO/ACCEPTED, no proclamar todas las pruebas ya realizadas antes de poder probarlas. Mantener el FAIL veraz durante preparación y pruebas no equivale a bypass del required check: main sigue bloqueada.

**Decisión procedimental pendiente del propietario:** confirmar expresamente una fase de observación y, posteriormente, una prueba nativa acotada antes del merge, mientras ese único FAIL permanece como gate de aceptación. Se exige Quality y estática vigentes, revisión independiente y autorización específica; no ignorar otros FAIL ni interpretar esto como permiso ya concedido. Si una norma adicional o protección no visible exigiera integración previa o check PASS antes de toda prueba, detener esa ruta y resolver la contradicción normativamente; jamás marcar una casilla falsa.

La circularidad “necesito merge para observar W; necesito PostgreSQL para permitir merge” es **condicional**, no necesidad demostrada. La vía pre-merge evita el ciclo sin quitar protecciones. La alternativa integración-primero no es ejecutable con las restricciones y contrato actuales.

##### 5. Alternativas y secuencia mínima PROPUESTA; no ejecutar sin decisiones separadas

| Alternativa | Evaluación |
|---|---|
| Selección/observación y validación en PR22 abierto, integración main al final | Preferida, condicionada a observación autorizada y a lectura administrativa suficiente; respeta required check y contrato OPEN |
| Integrar primero la versión cerrada para seleccionarla | No se demostró necesaria. Ahora bloqueada por engineering-policy y por la incompatibilidad OPEN tras merge. No ejecutar merge parcial, cherry-pick o bypass |
| Deducir W de head_sha, checkout C o V0 sin observar runner | Rechazada: metadata/bytes no son medición de la definición usada |
| Cambiar triggers/permisos, introducir otro workflow/runner, usar pull_request_target para head, env falsas o wildcard | Fuera de alcance/prohibida |
| Desmarcar check obligatorio, usar privilegio admin, force-push o marcar PASS nativo inexistente | Prohibida; no propuesta de desbloqueo |

**A — Observación no nativa, decisión y autorización propias.** Solicitud precisa al propietario: autorizar el diseño/revisión de una observación mínima dentro del MISMO job/workflow, conservando trigger pull_request_review:submitted y contents:read. Evento exclusivamente review comentada del owner, PR22/rama/repo/head exactos y texto de observación distinto de la autorización nativa. Registrar solo una whitelist no secreta: evento, ref, SHA de evento, GITHUB_WORKFLOW_REF/SHA, checkout C, hash M, PR/base/head, actor/id, run.id/attempt. Nunca volcar env/token ni importar harness/fixtures o llamar transporte/Docker/SQL/OpenBao. Las tres barreras NATIVAS continúan cerradas; la condición de observación debe ser distinta y mutuamente excluyente de la nativa. Salir después de guardar evidencia sanitizada. No añadir runner, workflow o permiso; cualquier actualización de bytes del workflow implica nueva integridad del manifiesto tras autorización y revisión, nunca editar el manifiesto histórico. Esto es una propuesta de cambio posterior, NO implementada ni una review enviada en esta intervención.

Un job que permanece false no puede revelar su entorno; por ello solo lectura/API no cubre el dato ausente y hace falta autorización explícita de esa observación. No prometer observar W sin ningún cambio o evento. El diagnóstico no es activación ni permiso nativo. Si el modo de observación no resulta seleccionable o devuelve otro ref, registrar ese hecho y mantener bloqueo; proponer después la corrección mínima al contrato solo ante el desajuste confirmado.

**B — Preparación/activación, autorización separada y todavía SIN ejecución.** Después de acreditar la resolución: solicitar permiso específico para preparar el cambio mínimo ya previsto de activación en el workflow/harness existentes, con gates de identidad/scope/hash intactos y sin alterar SQL/fixture. Publicar C_act, M_act, revisión independiente y checks estáticos. La sola publicación o review de código NO puede ejecutar PostgreSQL: solo el texto nativo exacto del propietario permitirá superar los guards. Mantener separado el texto de observación del texto de ejecución y probar su exclusión. No aplicar este cambio ahora.

**C — Fijar la tupla FINAL y volver a observar, sin confundir W_diag con W_act.** Cambiar el workflow para activarlo cambia W y M: una observación de la versión de diagnóstico NO acredita el SHA final. Antes de autorizar SQL, finalizar todos los bytes, fijar base B_act, HEAD C_act, M_act y merge ref V_act; observar W_act/ref con modo no nativo autorizado de ESA misma definición final y sin llamar main nativo. Confirmar checkout C_act, W_act=SHA del evento, ref esperado, bytes de workflow en W_act iguales a C_act y los 34 hashes. Cualquier cambio de main/head/workflow/manifiesto, incluso documental, obliga a actualizar tupla y autorización; ninguna ventana de permiso abierto. No imponer artificiosamente C_act=W_act: C es checkout y W es definición, normalmente commit de merge para este evento.

**D — Ejecución nativa, permiso NUEVO y explícito.** Solo con observación final válida y decisiones previas: propietario autoriza una ejecución exacta mediante la review real ligada a C_act, body literal del contrato `Execute owner-authorized SQL5-R3 candidate C manifest M workflow W; native isolated validation only.` con valores completos y scope SQL5_R3_ACCEPTANCE_HOSTED_EPHEMERAL_PG16. Debe cubrir dependencias SQL14/SQL1–4, candidato/fixture exactos, baseline sintético, runner GitHub-hosted, primer intento, PG16 propio efímero sin red/puertos/binds/volúmenes persistentes, roles/tenant/ACL/RLS/concurrencia/idempotencia/integridad, coste y limpieza sanitizada; no repetir suites históricas. No cambia ni consume aprobaciones anteriores. El preflight real comprueba otra vez la tupla antes de importar transporte. Divergencia o FAIL: parar, sin fallback.

**E — Integración main, permiso SEPARADO y posterior a evidencia.** Registrar los resultados nativos reales por SHA/M/W, corregir FAIL solo con alcance y autorización nuevos, revisión independiente vigente y aceptación expresa de fingerprints. Marcar la casilla de engineering-policy únicamente con evidencia nativa auténtica; comprobar check remoto PASS y todos los controles de main ya leídos con acceso suficiente. Solicitar autorización explícita de merge sobre el SHA final; NO ejecutarla por este encargo. Después de un merge futuro autorizado: verificar main, obtener cierre formal R3 y solo entonces permitir R4. Una revisión técnica o aceptación del diseño no sustituye ninguno de esos permisos.

##### 6. Decisiones exactas todavía requeridas al propietario

1. Aportar lectura administrativa actual de main; no conceder bypass ni cambiar reglas para completar esa lectura.
2. Aceptar o rechazar expresamente los cuatro fingerprints Gitleaks de fceffc3/manifiesto/líneas 34,35,46,49; siguen PENDIENTES, sin nuevas exclusiones.
3. Aprobar o rechazar la vía pre-merge, con integración final posterior a pruebas y engineering-policy legítimamente FAIL solo por la casilla nativa durante preparación. No autorizar merge con ese FAIL.
4. Autorizar separadamente el diseño/cambio y una observación no nativa exacta en el job existente, con whitelist y exclusión de servicios descritas en A. Sin ese permiso no ejecutar review de prueba ni modificar workflow.
5. Tras ver evidencia de selección, autorizar preparación de activación acotada; revisión de C_act/M_act y observación final W_act/ref de esa versión. Ninguna autorización se presume de esta decisión documental.
6. Emitir, solo entonces, permiso nativo exacto por C/M/W/scope/dependencias/fixture/aislamiento/limpieza; cualquier cambio invalida la tupla anterior.
7. Tras pruebas/revisión vigentes y todos los controles satisfechos, autorizar por separado integración/merge y cierre. Si se exige integración previa, mantener bloqueo y solicitar antes una propuesta normativa/contractual revisada; esta intervención no cambia política ni protecciones.

**Resultado de esta intervención:** PASS lectura de refs, bytes/contrato estático, rulesets visibles, resumen protegido de main y procedencia del artefacto histórico; NOT_VERIFIED protección clásica completa por 403; NOT_RECORDED W/ref histórico; NOT_VALIDATED W/ref real de PR22; FAIL legítimo engineering-policy, Quality PASS solo del SHA inicial citado; SKIP todo diagnóstico nuevo y ejecución nativa por falta de autorización. W/ref no queda activado ni certificado por publicar esta evidencia. Diff único TODO/R3, sin alterar otros módulos, cuerpo PR, SQL, fixture, manifiesto, harness, workflow, triggers, permisos o reglas. R3 OPEN/BLOCKED_FOR_NATIVE_VALIDATION, PR DRAFT, AUTH-GATE-05 OPEN y closedBackend conectado; sin PostgreSQL, SQL, Docker PostgreSQL, OpenBao, migraciones, fixtures nativos, despliegue, merge ni R4.

### R3 — Diagnóstico W/ref no nativo implementado (2026-10-26)

**R3 OPEN / BLOCKED_FOR_NATIVE_VALIDATION; PR #22 en borrador. W/ref real: NOT_VALIDATED.** Base remota verificada `fdcac274617a5396e2fa95ffa2ce66a17f6a156c`; main `975134a78621820bf3b790c392ab35726194ec66`. La autorización de esta intervención cubre implementación y pruebas estáticas, no una revisión diagnóstica real ni servicios.

- QG-0 PASS: cuatro archivos modificados, cero nuevos: workflow R2 existente (dueño DevOps/seguridad), su única entrada de hash en el manifiesto (dueño R3), suite estática existente (dueño ingeniería), esta sección (dueño recuperación). Inventario releído: main del harness y prepare-composition, cuatro consumidores de pruebas; wrappers SQL4/R1/R2 y tres workflows reutilizan el preflight; manifiestos históricos conservan su harness fijado. Ningún consumidor nativo se migra aquí; no se crea otro runner, script, job, workflow ni autorización de ejecución nativa.
- Workflow: mismo trigger `pull_request_review: submitted`, permisos contents:read, acciones fijadas y checkout sin credenciales persistentes. Nueva ruta exclusiva de diagnóstico para PR22 abierto, repositorio ID1412999204, rama exacta `codex/r3-sql5-controlled-preflight`, base main, propietario novo34 ID17856013 como actor/sender/reviewer, revisión COMMENTED sobre head exacto y attempt1. Rechazo por defecto; cuerpo completo enlaza C/M. El filtro de job valida prefijo/sufijo; el colector exige igualdad íntegra antes de emitir metadatos. Repetir un run se rechaza; una revisión nueva constituye otra autorización y queda fuera de la autorización de una sola observación.
- Colector inline sin importar harness/fixture ni leer SQL. Único subprocess permitido: `git --no-replace-objects rev-parse HEAD`, lectura constante para contrastar checkout C. No secretos ni carga de transporte. Registra únicamente PR/review/run/attempt, evento/ref/SHA, C de revisión/checkout, M y W/ref real más digest del workflow del checkout. Errores emiten rechazo fijo, sin payload ni excepción. Entradas/salida rechazan symlinks. Evidencia `artifacts/b2-acceptance-r3/workflow-context.json`, artefacto `b2-r3-workflow-context`, retención7 días.
- C = review.commit_id = PR.head.sha = git HEAD; V = GITHUB_SHA del evento merge; W = GITHUB_WORKFLOW_SHA y workflow_ref observados. Se admiten para observación únicamente este mismo archivo en merge22/main/rama exacta; main/rama se registran como MISMATCH. `nativeRefContract=MATCH` solo indica igualdad ref merge22 y W=V, no verificación de todos los bytes de W ni permiso nativo. El hash de archivo registrado corresponde al checkout C. Sin resultados reales se desconoce qué definición seleccionará GitHub; la evaluación estática de expresiones es un modelo de regresión, no ejecución del intérprete Actions.
- Barreras nativas preservadas: cláusula R3 con false, step nativo `if: false`, harness `R3_NATIVE_ENABLED=False`. Los dos pasos históricos solo admiten PR12; el diagnóstico solo PR22 y texto distinto. No utiliza autorizaciones SQL5-R1/R2. Una revisión Codex no satisface actor/cuerpo diagnósticos. Publicación push no es trigger de este workflow. Los controles reales ACL/RLS, multiempresa, concurrencia e idempotencia siguen pendientes; no cambian contratos B1/B2 ni se inicia R4.
- SHA256 workflow `f3b78481073e0b423749bbaf5099a9ed225ab12e5098b6d9c4f14d10cdcf24fd`; manifiesto actualizado `868a156e752cb6c451f2b495c5623de53684b69e904b7de43e83898e3672d705`. Única modificación JSON: hash de ese workflow; mismas 34 rutas y otros 33 hashes intactos. SQL candidato `b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2`, fixture `aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb` y harness `0aae0dbec4f7aa17549f803b1276765cd88242f6d1b501c402fccbf649d5c5f3` sin cambios. Veinte artefactos históricos contrastados con objetos Git originales; no se reescriben manifiestos/aprobaciones ni se permite el harness nuevo con permisos viejos. Cuatro fingerprints Gitleaks previos intactos, aceptación expresa del propietario pendiente.

| Verificación local segura | Resultado |
|---|---|
| 44 tests de suite estática existente ampliada; positivos sintéticos C/V/W distintos, merge MATCH y main MISMATCH | PASS |
| Negativos evento/actor/repo/PR/rama/fork/review/C/M/ref/runner/reintento/contexto ausente y bytes alterados | PASS |
| Aislamiento R2/R3/diagnóstico; AST sin transporte y Git lectura como único subprocess; no filtración de valores sensibles; symlinks | PASS |
| YAML estructura y Python inline AST; integridad34 y procedencia20; candidato literal y parser PG16.1 aislado sin servidor | PASS |
| Fallos de regresión local | Ninguno |
| CI Quality y revisión independiente del SHA publicado | PENDING al crear este commit; resultados enlazados en conversación del PR |
| engineering-policy | Bloqueo legítimo de casilla nativa previamente FAIL; no se falsea ni se exime |
| Observación Actions auténtica, PostgreSQL/SQL/fixtures nativos/servicios | SKIP, no autorizados; W/ref NOT_VALIDATED |

Procedimiento posterior, **no ejecutado**: revisar diff/SHA final, Quality y dictamen independiente; reconfirmar main/HEAD y barreras. Solicitar autorización nueva del propietario para una sola observación, no para SQL. El propietario debe presentar una revisión formal COMMENT sobre el SHA final C (no issue comment ni aprobación nativa), con texto exacto `Observe owner-authorized SQL5-R3 workflow context candidate C manifest 868a156e752cb6c451f2b495c5623de53684b69e904b7de43e83898e3672d705; metadata only, no services or SQL.` Sustituir C por el SHA final publicado, sin otros cambios ni espacios adicionales; debe seguir siendo head. No reenviar/rerun. Antes de autorizar comprobar definición elegible: la documentación de GitHub atribuye pull_request_review al merge ref del PR; si la definición elegible no contiene esta ruta, no habrá diagnóstico aceptable. Ausencia de run/artefacto no prueba W. No forzar integración ni cambiar trigger/protecciones; elevar solicitud separada de integración revisada del mismo workflow, manteniendo gates nativos cerrados. No convertir esa alternativa en autorización de merge.

Protecciones: main protected y engineering-policy requerido para everyone/app15368; clásica 403 = NOT_VERIFIED. Rulesets históricos activos25820330/25879296 conservados. Pendientes separados: aceptación de fingerprints, cierre legítimo de política, nueva autorización de observación, evidencia W/ref; si resulta necesaria, autorización de integración; luego revisión/activación nativa específica enlazada a nuevos C/M/W y autorización posterior PostgreSQL16. Ninguno se consume aquí. Rollback: revertir exclusivamente estas cuatro modificaciones sobre el PR; restaurar hash previo del workflow y manifiesto previo juntos, sin tocar SQL/harness/historial/protecciones. C/M cambian e invalidan cualquier texto diagnóstico anterior; ningún rollback activa nativo.

### R3 — Preparación controlada de activación, sin versión ejecutable (2026-10-26)

**OPEN / BLOCKED_FOR_NATIVE_VALIDATION; PR22 DRAFT.** HEAD inicial remoto `717a908224873b43aee4a3cc3e61713cd2c5bc10`; main `975134a78621820bf3b790c392ab35726194ec66`. Esta intervención prepara regresiones y el plan operativo; no retira ninguna barrera ni autoriza SQL, servicios, observaciones adicionales o merge. Las anotaciones anteriores se conservan como historia.

**QG-0 y diff mínimo.** Releídos AGENTS, política, TODO, workflow, execution_context/preflight/authorize_r3/main y consumidores directos/indirectos (prepare-composition, SQL4/R1/R2, workflows directory/reviewed-packages/combined/invitations/acceptance y suite estática). Ruta única: evento legítimo → mismo job/checkout C → preflight canónico → authorize_r3 → flag → transporte B1 existente. Se reutiliza la suite; no se amplía la arquitectura. Modificados únicamente tests/static/test_b2_execution_preflight.py (dueño QA/seguridad) y esta sección R3 (dueño recuperación); cero archivos nuevos o retirados. Workflow, harness, manifiesto, candidato y fixture permanecen byte a byte intactos. Se prefieren pruebas y diseño a preparar prematuramente bytes ejecutables; no se migran consumidores históricos ni se inicia R4.

**Observación existente verificada por API/log, sin repetirla.** Run40365474104/job121721860831 success, attempt1, permisos contents:read; checkout y review C=`ad6b1975e3d1aa9baac6b467b5e39634b3cbf577`; V=GITHUB_SHA=W=`9f2df5c3cf4a15ddc463d564a8823f42dc90139d`; workflow_ref exacto `novo34/cleanops-360/.github/workflows/b2-acceptance-r2-postgres.yml@refs/pull/22/merge`. OBSERVED/MATCH, nativeExecution NOT_INVOKED, pasos R2 y R3 omitidos. El objeto Git W consultado tiene padres [main975134a…, C ad6b197…] y árbol ac5f972…, el mismo de C en esa instantánea. Artefacto12669952537, ZIP digest reportado por upload e018a49de9db72f977c40893e580e7fec4f9933fe947c40a7cfcf6a5d2d1c7d7; aquí se leyó log/API, no se descargó ni se ejecutó el ZIP. No confundir head_sha de run con W. No trasladar ese W histórico a nuevos bytes.

**Contratos efectivos y dos bloqueos de preparación.** Identidad owner login+ID, repositorio/ID, evento submitted/COMMENTED, PR abierto, base main, rama exacta, revisión sobre head, attempt1 y runner hosted se comprueban en execution_context. preflight rechaza bindings externos sensibles y comprueba dependencias; authorize_r3 exige cuerpo C/M/W exacto, checkout C, ref merge22, W=V, manifiesto cerrado34, bytes C y bytes workflow en W, procedencia20 y permisos históricos como procedencia solamente. R3_NATIVE_ENABLED=False impide importar transporte incluso con contexto sintético íntegro. No se ha demostrado semántica nativa ACL/RLS por estos checks.

1. **Disponibilidad local de W: defecto reproducido estáticamente.** El checkout del run real usa ref=C/fetch-depth0 y descarga heads+tags; no obtiene explícitamente refs/pull/22/merge. W es hijo merge de C, no ancestro que deba llegar con esas ramas. La nueva prueba con repositorios Git locales efímeros reproduce falta de W tras ese refspec, rechazo EXACT_GIT_OBJECT_REQUIRED y disponibilidad tras fetch del ref exacto, manteniendo HEAD=C. Esto acredita el defecto de garantía, no afirma haber inspeccionado objetos del runner histórico ya destruido. No autorizar activación hasta corregirlo en el workflow existente.
2. **Caducidad temporal: FAIL conocido pendiente.** attempt1 impide rerun y C/M/W evita reutilizar hashes distintos; no limita la antigüedad de un evento encolado. Hoy authorize_r3 no consulta submitted_at ni vencimiento. Tres regresiones nuevas XFAIL muestran que fecha ausente, futura o año2000 llegan al gate cerrado R3_NATIVE_ACTIVATION_REQUIRED. El flag evita transporte, pero no sustituye caducidad. No se declara implementada ni PASS; al corregir el contrato futuro deben quitarse expectedFailure y pasar como negativos normales. No añadirlos a exclusiones de CI ni cambiar tests históricos para ocultarlos.

**Cambios futuros propuestos, todavía NO implementados ni aprobados.** Un único conjunto coherente, en los mismos cinco archivos: (a) workflow existente: fetch read-only de refs exactas merge22/main/rama origen para disponer de W y contrastar snapshot sin cambiar checkout C; predicado nativo completo y separado del diagnóstico, paso nativo solo bajo nueva autorización nativa y selección correcta de artefacto report.json para ruta nativa (hoy PR22 sube únicamente workflow-context.json); (b) authorize_r3/execution_context del harness existente: timestamp UTC obligatorio, vencimiento acotado, runId válido, cotejo de refs actualizadas/parents [B,C] y bytes W antes de transporte, sin alterar scopes históricos; (c) manifiesto: únicamente hashes afectados de harness/workflow, mismas34 rutas, sin ownerApproved ni permiso incorporado; (d) suite existente: regresiones de nueva caducidad/refs/fetch/artefactos y barreras correspondientes a cada fase; (e) R3 del TODO: evidencia y permisos. El SQL5 y fixture no necesitan cambios por los hallazgos actuales: literal/gramática aislada y derivación inmutable pasan; catálogo, tipos y comportamiento real continúan SKIP. Cualquier defecto nativo posterior necesita corrección propuesta y nueva autorización, no bytes improvisados.

**Propuesta exacta de vigencia para aprobar antes de implementar.** Ventana máxima15 minutos desde review.submitted_at UTC, no configurable por variables; rechazar timestamp ausente/malformado/futuro, edad>900 segundos y expiry fuera del intervalo [submitted_at, submitted_at+900s], así como now>expiry. Añadir al cuerpo nativo el campo UTC expires E, definido por el propietario fuera del repo. Cuerpo PROPUESTO, no aceptado por el harness actual y no autorización de este texto: `Execute owner-authorized SQL5-R3 candidate C manifest M workflow W expires E; native isolated validation only.` Revalidar justo antes del primer transporte. El timeout15m de job es otro control, no un TTL de aprobación. Una sola revisión nueva y attempt1; cualquier cambio de C/M/W/B, refs, expiry o bytes aborta y exige permiso nuevo; no renovar una aprobación automáticamente. TTL y extensión del cuerpo requieren aceptación expresa antes de preparar versión ejecutable.

**Orden operativo sin circularidad y sin ventana de permiso implícito:**

1. Propietario aprueba este diseño y autoriza explícitamente preparar la versión futura, con TTL/contrato y alcance de cambios anteriores. Esta autorización NO permite PostgreSQL ni merge. Resolver además fingerprints y lectura administrativa pendiente antes de gates que dependan de ellos; no alterar política ni protecciones.
2. Implementar primero el endurecimiento/fetch/routing de evidencias en los mecanismos existentes con las tres barreras aún cerradas, rehash solamente hashes necesarios del manifiesto declarativo, ejecutar positivos/negativos (sin transporte), resolver XFAIL y revisión independiente del SHA. No usar la observación histórica como permiso de ejecución ni repetirla. Si se pide otra observación de una versión distinta, necesita autorización nueva específica; no es paso automático de este plan.
3. Tras aprobación técnica vigente y autorización expresa de preparación de bytes ejecutables, retirar en un único diff mínimo y revisable las tres barreras correspondientes al nuevo contrato, sin que exista revisión nativa que autorice esa tupla nueva. Publicar únicamente tras pruebas estáticas y evidencia de que diagnóstico, aprobaciones antiguas, Codex y push no pueden activar nativo. Revisar independientemente el SHA final y obtener Quality; cualquier cambio posterior reinicia validación. Ese commit será capaz de ejecutar solo con autorización nueva; no constituye autorización de backend.
4. Obtener C final y M; leer B y W del merge ref por API, comprobar padres [B,C], refs exactas y bytes del workflow W iguales a los revisados en C. C no incluye su propio hash, M no se incluye a sí mismo y W no se incrusta en código ni manifiesto: no hay autorreferencia. W existe después de publicar C y antes de la review nativa. Todo cambio posterior de head/main/merge invalida la tupla; el fetch y el preflight futuros deben rechazarlo en runtime. La compatibilidad de ref está demostrada para la versión diagnóstica; la futura ejecución seguirá comprobando su W real, no lo inferirá de ese PASS.
5. Propietario emite autorización NUEVA de una única ejecución por C/M/W/B/E y scope exacto: SQL14+SQL1–4 como dependencias, SQL5 candidato/fixture fijados, PG16 hosted efímero, identidad/evento/rama exactos, coste, aislamiento y limpieza. Solo entonces envía una review COMMENT exacta con el contrato nuevo. No usar aprobaciones diagnósticas/R1/R2 ni permisos antiguos de SQL como permiso para el nuevo harness. Esta intervención no envía ninguna review de ejecución.
6. Futuro run: cotejar evento/review/C/M/W/refs/timestamps antes de importar transporte. Aislamiento existente network=none, sin puertos/binds/volúmenes persistentes, tmpfs y label propio; secretos efímeros y rechazo de Docker remoto del transporte existente conservados. SQL real/roles/tenants/concurrencia/idempotencia y limpieza deben producir evidencia real; timeout/interrupción no se reporta como cleanup PASS sin comprobación. FAIL detiene y no autoriza rerun. Activación prepara capacidad, ejecución usa permiso separado, merge/cierre requiere autorización posterior independiente y engineering-policy legítimo PASS. Si selección futura W/ref falla, STOP: no merge previo ni bypass para salvarlo.

| Evidencia de esta intervención | Estado |
|---|---|
| Suite completa51: 48 pruebas, incluidos 44 anteriores y negativos nuevos observación→nativo/C-W antiguos/W ausente/refspec Git local | PASS48 |
| Rechazo temporal ausente/futuro/vencido antes del flag: tres requisitos no implementados | XFAIL3, defectos abiertos, NO PASS |
| YAML/AST, mismo trigger/permisos/job, integridad34 y procedencia20, candidato/fixture, gramática parser PG16.1 sin servidor | PASS |
| Observación histórica leída, sin nueva ejecución; C distinto W y V=W | PASS limitado a run40365474104 |
| PostgreSQL/SQL/fixture nativo, aislamiento efectivo/ACL/RLS/concurrencia/limpieza | SKIP, sin autorización |
| Quality y revisión exacta del SHA publicado | PENDING al publicar; resultados en conversación del PR |
| engineering-policy | FAIL legítimo previo por casilla nativa; no modificado ni eximido |

**Integridad sin nueva apariencia de aprobación.** M permanece `868a156e752cb6c451f2b495c5623de53684b69e904b7de43e83898e3672d705`; workflow `f3b78481073e0b423749bbaf5099a9ed225ab12e5098b6d9c4f14d10cdcf24fd`; harness `0aae0dbec4f7aa17549f803b1276765cd88242f6d1b501c402fccbf649d5c5f3`; SQL5 `b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2`; fixture `aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb`. M es inventario de bytes, no consentimiento. Los veinte históricos se verifican contra Git original, incluido harness a01 antiguo; otros19 iguales, registros/aprobaciones originales sin cambios. SQL firmas/ACL y contratos B1/B2 no se alteran. Barreras false/false/False intactas. Main/protecciones, fingerprints y formulario sin cambios; clásico403 permanece NOT_VERIFIED, no ausencia de reglas.

**Rollback y parada.** Revertir solo pruebas/documentación de esta preparación no cambia runtime ni manifiestos; conservar evidencia de defectos. Rollback de una activación futura deberá cerrar primero ambas rutas nativas y flag, regenerar hashes afectados, invalidar tupla/review y conservar informes; no ejecutar SQL inverso. Un run ya iniciado no se detiene con un revert: control/limpieza explícitos son condición de autorización futura. Pendientes: aprobar propuesta TTL y plan; autorizar preparación ejecutable; aceptar cuatro fingerprints; acreditar protecciones completas; revisar SHA final y nueva C/M/W/B; autorizar posteriormente PG16 y revisión de ejecución; obtener evidencia nativa, política legítima y permiso separado de merge/cierre. STOP antes de retirar cualquier barrera. No R4, no servicios, no observación nueva.

### R3 — Endurecimiento definitivo de caducidad y adquisición W (2026-10-26)

**R3 OPEN / BLOCKED_FOR_NATIVE_VALIDATION; PR22 DRAFT.** Base remota ac4acf2dc4bfffbde57464045fe88996561695af, main975134a78621820bf3b790c392ab35726194ec66. La nueva autorización cubre estas dos correcciones estáticas; no prepara ni habilita versión ejecutable, ni concede ejecución nativa/integración. Evidencias previas y tres XFAIL quedan como historia; estado actual de esas mismas pruebas: PASS reales.

- **QG-0:** AGENTS, política, TODO, harness/workflow/manifiesto y suite releídos; inventario canónico: main→preflight→execution_context y authorize_r3→git_bytes, consumidores prepare-composition y wrappers SQL4/R1/R2, workflows directory/reviewed-packages/combined/invitations/acceptance. Corrección en origen; no segundo runner, wrapper, guard ni workflow. Cuatro archivos modificados: scripts/b2-directory-postgres.py (dueño seguridad/DevOps), tests/static/test_b2_execution_preflight.py (QA), entrada hash harness del manifiesto34 (dueño R3), esta inserción R3 (recuperación). Cero archivos nuevos/retirados. El workflow no necesita modificación para obtener W: la adquisición se realiza dentro del helper Git ya existente y solo en su llamada R3 autorizada.
- **Caducidad:** causa raíz, review.submitted_at no se consultaba. execution_context exige para sql5-r3 exclusivamente review.submitted_at auténtico del payload, cadena UTC estricta YYYY-MM-DDTHH:MM:SSZ y fecha civil válida; compara con reloj local time.time() en epoch UTC, rechaza futuro o edad>900s; extremos0 y900s admitidos. No usa variables de entorno como reloj/fecha/expiry autorizante. RuntimeError fijo FRESH_R3_OWNER_REVIEW_REQUIRED, sin eco de datos. Segunda validación al terminar authorize_r3 impide que adquisición/procedencia prolonguen vigencia y exige contexto idéntico. Scope R2/históricos no recibe nuevos requisitos temporales. Permanece attempt1 y owner/evento/PR/rama/C exactos. Se implementa el contrato autorizado de edad15m; la propuesta anterior de campo expires E era diseño, NO se incorpora al cuerpo ni se acepta desde env. Cuerpo nativo C/M/W anterior conservado, siempre pendiente de nueva aprobación del propietario para los bytes futuros.
- **W exacto:** causa raíz, fetch heads+tags del checkout C no garantiza objeto merge W. git_bytes recibe opción restringida fetch_workflow=True solo en la llamada authorize_r3 para R3_WORKFLOW y SHA validado igual a GITHUB_WORKFLOW_SHA; nunca modifica comportamiento de llamadas históricas. Comprueba objeto commit local; si falta, git fetch por SHA completo desde URL fija https://github.com/novo34/cleanops-360.git con --no-tags/--no-recurse-submodules/--no-write-fetch-head/--no-auto-maintenance y timeout60s. No utiliza origin configurable, ramas mutables, refspec destino o sustitución W por HEAD. Tras disponibilidad exige rev-parse W^{commit} exactamente igual a W, lee bytes workflow de W y compara con checkout/manifiesto ya contrastado en C. Fetch/error/timeout y verificación fallida producen error fijo; stdout/stderr remoto no se publica. Ref merge22, V=W, revisiónC, git HEAD=C y M cerrado34 siguen obligatorios antes de solicitar W. El fetch solo adquiere objetos Git, sin checkout ni actualización de ramas locales/remotas/protegidas ni servicios.
- **Integridad:** manifiesto SHA256 nuevo `77ce38719e108a47cd5e392b45a55811bd0fb27b246e9b2db862103657b49067`; único hash modificado: harness `596d7a37fa721edda6d5313606e0398d21bcd8cebe26852900fb5ac2db6f7f01`. M mantiene mismas34 rutas, contexto y referencias; no agrega ownerApproved ni autorización. Otros33 hashes intactos, incluido workflow f3b78481073e0b423749bbaf5099a9ed225ab12e5098b6d9c4f14d10cdcf24fd. SQL5 b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2 y fixture aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb intactos; no se reconstruyen. Procedencia20 original verificada por Git: harness antiguo a01 conserva su hash en manifiesto histórico, otras19 rutas conservadas. Autorizaciones R1/R2 originales no se editan ni autorizan harness nuevo.
- **Observación histórica leída, no repetida:** run40365474104/job121721860831 sigue success/attempt1, diagnóstico OBSERVED/MATCH/NOT_INVOKED, pasos históricos y entradaR3 SKIP. C ad6b197… y V=W9f2df5… documentados anteriormente corresponden solo a esa versión; no autorizan C/M/W nuevos. W runtime de esta entrega no se observa ni se presenta como validado. No hay dependencia circular: M es inventario sin sí mismo/C/W, C se publica y luego puede obtenerse W; permiso nativo futuro deberá usar tupla nueva y refs reales.

| Verificación ejecutada en esta intervención | Resultado |
|---|---|
| Suite estática existente ampliada57; las mismas tres XFAIL sin eliminar ni debilitar, ahora con error temporal exacto | PASS57; XFAIL0, FAIL0, SKIP0 |
| Fechas ausentes/malformadas/inválidas/no UTC/futuras/vencidas; límites0/899/900/900.001s y futuro0.001s; expiry durante verificación; fechas env ignoradas | PASS |
| W ausente→adquisición por SHA, caché sin fetch, C y refs conservados; errores/timeout/objeto faltante o SHA incorrecto; rechazo mutable ref/otroSHA/otroarchivo | PASS estático; Git real local, frontera de red sustituida solo dentro unittest |
| Eventos/actores/reintentos/C-M-W-ref y permisos antiguos/observación→nativo rechazados; scopes R2/R3 aislados; no transporte | PASS |
| Integridad34, procedencia20, AST/YAML, gates cerrados; SQL literal/fixture original y parser PG16.1 aislado sin servidor | PASS |
| Quality y auditoría Codex exacta del SHA final | PENDING al publicar; enlaces/resultados en conversación PR |
| engineering-policy | FAIL legítimo de casilla nativa, sin cambios de formulario/política |
| Fetch W real GitHub, observación nueva, PostgreSQL/SQL/Docker/OpenBao/fixtures nativos/migraciones/despliegue/merge | SKIP, no ejecutados ni autorizados |

**Barreras y riesgos residuales:** R3_NATIVE_ENABLED=False, false del job y false del step nativo permanecen byte a byte. Workflow/trigger/permisos/protecciones, R0/R1/R2 y fingerprints intactos; R4 sin iniciar. La red puede denegar fetch del SHA merge: se aborta, nunca se sustituye por rama ni se declara PASS. Pruebas locales no acreditan transporte GitHub real ni selección futura W/ref. TTL permite hasta900s desde timestamp y no convierte attempt1 en permiso de repetir; nueva revisión owner para otra ejecución requeriría autorización nueva. Persisten validación nativa ACL/RLS/tenants/concurrencia/idempotencia/limpieza y cerrado AUTH-GATE-05/closedBackend; no se afirman resultados nativos.

**Rollback y siguiente permiso:** revertir juntos estos cuatro cambios y restaurar M/harness previos; conserva historia y no activa nada, pero restaura los dos defectos, por lo que cualquier activación seguirá bloqueada. Cambio de C/M/W invalida autorizaciones anteriores. El siguiente permiso exacto es autorizar preparación revisable de la versión ejecutable del mismo harness/workflow: routing nativo y artefacto correctos, retirada controlada de las tres barreras, hashes actualizados y nueva revisión exacta, sin ejecutar todavía PostgreSQL. No se implementa aquí. Después será imprescindible permiso distinto para una única ejecución PG16 por C/M/W/B y alcance/dependencias/fixture/aislamiento/limpieza, dentro de TTL; merge/cierre es otro permiso posterior. Cuatro fingerprints y lectura administrativa main403=NOT_VERIFIED siguen pendientes. No se consume permiso de observación previo ni aprobación histórica.

### R3 — Versión ejecutable revisable preparada, activación bloqueada (2026-10-26)

**R3 OPEN / BLOCKED_FOR_NATIVE_VALIDATION; PR22 DRAFT.** Base remota04ba0db006f6a269ed880a9e9b3187d2c6795e06 y main975134a78621820bf3b790c392ab35726194ec66 confirmados antes de modificar. La autorización del propietario permite preparar/publicar routing y contrato revisables, NO ejecutar SQL/servicios, activar backend ni merge. Se preservan íntegramente todos los registros previos, incluidas las tres barreras históricas y sus verificaciones anteriores; el estado vigente de esta preparación se describe aquí.

- **QG-0 / reutilización:** releídos AGENTS, política, TODO, execution_context/preflight/authorize_r3/git_bytes/main, manifiesto34, workflow y suite. Consumidores: prepare-composition, wrappers SQL4/R1/R2 y workflows directory/reviewed-packages/combined/invitations/acceptance siguen canónicos. Ruta única: review legítima→mismo job→checkout C→preflight→authorize_r3(C/M/W/B)→flag independiente→transporte existente. No se añade guard, runner, wrapper, workflow, job ni archivo. Cinco archivos existentes: harness (seguridad, vínculo B/graph/refs/runId), workflow (DevOps, routing y artefacto), tests canónicos (QA), manifiesto (R3, dos hashes), exclusivamente esta inserción R3 (recuperación). SQL/fixture y componentes B1/B2 sin modificaciones. Riesgos de ACL/RLS/tenants/concurrencia permanecen pendientes de pruebas nativas y no se reinterpretan como comprobaciones estáticas.
- **Preparación ≠ activación ≠ ejecución:** antes de retirar condicionesfalse se ejecutaron las57 pruebas de baseline, incluido caso de autorización íntegra que termina en flag cerrado sin importar transporte. Se sustituyen únicamente los dos false del routing por predicados de propósito; se conserva `R3_NATIVE_ENABLED=False` como bloqueo independiente, literal y sin override por env o CLI. Incluso una review C/M/W/B íntegra, vigente y del propietario termina con R3_NATIVE_ACTIVATION_REQUIRED antes de load/Docker/fixture. No se elimina toda barrera ni hay ventana de ejecución. Activar exige otro cambio de bytes/hashes expresamente autorizado y revisado; ejecutar exige otra autorización distinta.
- **Workflow:** mismo evento pull_request_review:submitted, permisos contents:read, job único, acciones por SHA y checkout review.commit_id sin credenciales persistentes. Se reutiliza el predicado existente de PR22/owner/repositorio/rama/estado/evento/attempt1/merge ref y se distinguen dentro de él propósito diagnóstico y propósito nativo. No se duplican guards canónicos. El filtro nativo enlaza C y B en prefijo/sufijo; igualdad íntegra de C/M/W/B se exige en el harness antes de transporte. Review ordinaria, Codex, permiso diagnóstico, R2, rerun o texto nativo anterior sin B no habilitan esta ruta. Step diagnóstico solo Observe; step R3 solo Execute para PR22; pasos históricos solo PR12. El upload existente conserva nombres/rutas R2 y diagnósticos y selecciona b2-acceptance-r3-pg16-sanitized / artifacts/b2-acceptance-r3/report.json para el propósito nativo. Un hipotético intento ahora registraría FAIL por flag, no validación PostgreSQL; aquí no se provoca ningún intento.
- **Contrato canónico:** B se toma de pull_request.base.sha auténtico; C=review.commit_id=head.sha=git HEAD, M=hash del manifiesto cerrado34, W=GITHUB_WORKFLOW_SHA=GITHUB_SHA con workflow_ref exacto merge22. Los tres SHA se validan completos; B debe constar en el cuerpo. Se mantiene obtención W por SHA exacto y validación de bytes W/C/M. Se exige grafo Git W con exactamente padres [B,C] en ese orden. Consulta Git read-only ls-remote a URL fija del repositorio compara las tres refs vigentes main/rama exacta/merge22 con B/C/W; no usa refs mutables como sustitución de SHA. Rechaza salida incompleta/duplicada/malformada, cambios, timeout/fallo, sin publicar stdout/stderr. RunId positivo obligatorio. TTL UTC máximo900s de submitted_at, attempt1, identidad owner+ID y revalidación final de contexto permanecen. No se usa fecha env ni aprobación histórica. Las consultas son comprobaciones en instante dado, no bloqueo atómico de refs GitHub: los bytes ejecutables siguen fijados a C/M/W/B, nunca se ejecuta un head nuevo por sustitución.
- **Hashes finales de preparación:** manifiesto SHA256 `e7755198708a163dd96432b6268d8a07b280d61495fc7daaa932e6e275f3085b`; harness `a5e90240a8a73addebde0ceab3295c7e327f785052d9cbe148fc57a3252e883f`; workflow `8bd460cf4e0103f2c7c83bc27577f39126754d76b91979690ac37c841147f5fb`. M conserva mismas34 rutas/contexto/referencias y otros32 hashes; no ownerApproved nuevo ni permiso embebido. SQL5 b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2 y fixture aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb intactos. Veinte históricos contrastados con Git original, incluidos a01 y su hash antiguo, otros19 byte iguales y autorizaciones originales intactas. Hash de preparación no autoriza ejecutar ni sirve como hash final de activación.

| Validación ejecutada en esta preparación | Estado |
|---|---|
| Baseline57 antes de retirar los false de routing; bloqueo independiente antes de transporte | PASS57 |
| Suite ampliada65: se conservan57 tests y se adaptan explícitamente expectativas de routing/contrato B; ocho pruebas adicionales | PASS65; FAIL0, XFAIL0, SKIP0 |
| Review correcta en fixture estática llega al bloqueo independiente; ninguna importación de transporte | PASS estático; no evento GitHub ni ejecución nativa |
| Eventos/owner/tiempo/reintentos/M/W/refs/C/B, permiso antiguo R2/diagnóstico/C-M-W sin B, padres equivocados y refs cambiadas/inaccesibles | PASS |
| Selección separada de step e informe R2/diagnóstico/R3; flag único literalFalse sin toggle de tests | PASS |
| Integridad34/procedencia20, AST/YAML, literal SQL/fixture y parser PostgreSQL16.1 aislado sin servidor | PASS |
| Quality y revisión independiente exacta del SHA publicado | PENDING al publicar; evidencia final en conversación PR |
| engineering-policy | FAIL legítimo de casilla nativa, sin modificar formulario/política |
| Workflow runtime de versión nueva, ls-remote/fetch GitHub reales, diagnóstico repetido, PG16/SQL/Docker/OpenBao/fixtures/migraciones/despliegue/merge | SKIP, no autorizados/no ejecutados |

**Permiso futuro y procedimiento, NO EJECUTAR AQUÍ:**

1. Revisar este SHA de preparación, Quality y dictamen independiente; propietario aprueba preparación. Pedir permiso expreso separado para activar únicamente el flag nativo del mismo harness, con manifest rehash y pruebas/revisión nuevas, sin SQL ni evento de ejecución. Ese cambio futuro invalida C/M/W de preparación; no emitir review nativa sobre este SHA bloqueado. Si se detecta defecto de routing/contrato, corregir y revisar antes de activar, no crear otra vía.
2. Tras publicar/revisar la activación autorizada, fijar C_act, M_act, B_act y W_act reales: API main/head/merge ref, padres [B_act,C_act] y bytes workflow de W_act idénticos a los revisados en C_act. W se conoce después de publicar C y antes de cualquier review nativa; no se incrusta en código ni manifiesto, M no se incluye a sí mismo y no hay autorreferencia. La observación histórica40365474104 no se repite ni autoriza estos valores; W/ref nuevo se comprobará en runtime. Si GitHub cambia refs, abortar y pedir autorización renovada, sin normalizar variables.
3. Solicitud precisa al propietario: autorizar UNA ejecución pre-merge en PR22 por tupla C_act/M_act/W_act/B_act, SQL14+SQL1–4 como dependencias inmutables, SQL5/fixture fijados, hosted PG16 efímero network-none/tmpfs/sin puertos/binds/volúmenes, sin datos reales ni servicios externos, coste/timeouts, limpieza e informe sanitizado. No reutilizar approvals R1/R2/diagnóstico ni aprobación de preparación/activación; no se concede permiso de merge. Deben resolverse gates de seguridad y aceptación pendientes, incluidos fingerprints y lectura administrativa cuando aplique, sin falsear engineering-policy.
4. Solo tras ese permiso NUEVO, propietario novo34 envía una review formal COMMENT en C_act que siga siendo HEAD, cuerpo exacto `Execute owner-authorized SQL5-R3 candidate C_act manifest M_act workflow W_act base B_act; native isolated validation only.` Sustituir placeholders por hashes completos; sin saltos adicionales; no issue comment ni review APPROVED. Fecha submitted_at auténticaUTC no futura, antigüedad≤900s también al finalizar preflight; attempt1. No se envía ni se simula esa review en GitHub durante esta preparación. No rerun: cualquier FAIL/expiry/cambio de tupla exige investigar y permiso nuevo. La ejecución posterior recogerá roles/tenants/ACL/RLS/concurrencia/idempotencia/cleanup reales; solo después, política legítima, revisión vigente y autorización separada de merge/cierre.

**Rollback / límites:** revert conjunto de estos cinco archivos restaura routingfalse, harness y M previos; no SQL inverso ni cambio de ramas protegidas. Conservar informes y revocar cualquier tupla anterior; hashes cambian, ningún permiso se renueva automáticamente. Un revert no detendría un run iniciado: no existe run nativo aquí, y una futura autorización deberá prever control/limpieza verificables. W/ref y red de esta versión son NOT_VALIDATED runtime, no se presentan modelos de expresiones Actions ni Git boundaries simuladas como PASS nativos. Preparación se detiene con flagFalse. Main/protecciones, cuatro fingerprints y formulario no cambian; aceptación expresa de fingerprints y protección clásica completa403=NOT_VERIFIED siguen pendientes. No R4, no R3 DONE, no merge, AUTH-GATE-05 OPEN y closedBackend conectado.

### R3 — Validación nativa real PG16 y preparación de cierre formal (2026-10-26)

- [x] Propietario `novo34` envió **una sola** review formal `COMMENT` (`pullrequestreview-5659312253`) con autorización nativa exclusiva, C=`3ceafbd6631b08bc673eb4a4f855aa1dec025930`, M SHA-256=`907d691791d73be42d03db266b5e7ad92c5c5ead098a29134f022709aa6e6b97`, W=`c8093b8d1c99129bcb3c8298d693fd4744c91a47`, B=`975134a78621820bf3b790c392ab35726194ec66`. URL: https://github.com/novo34/cleanops-360/pull/22#pullrequestreview-5659312253 . Review distinta de la observación previa; no repetir/rerun sin permiso nuevo.
- [x] **Evidencia remota de ejecución nativa:** GitHub Actions `40404650268` (2026-10-26 21:28 UTC), conclusión `success`; job `121859154243` PASS, paso `R3 canonical entrypoint` PASS, histórico R2 y observación W/ref SKIP. Log real `B2_SQL5-R3 PASS`. URL: https://github.com/novo34/cleanops-360/actions/runs/40404650268 . Artefacto sanitizado `b2-acceptance-r3-pg16-sanitized`, ID `12691355642`; debe preservarse su informe y contrastarse para aceptación completa.
- [x] **Pruebas reales identificadas PASS en el log:** instalación SQL14, ACL/EXECUTE y SQL5 corregido; validación de cuerpo de funciones PG; logins sintéticos separados; rechazo de acceso directo (`42501`), enlaces privados y denegados; MFA/CSRF, límites de intentos, rollback, hex 56/58/59/1024/1026 e inválido; carrera paralela y mutación única, idempotencia, segregación por tenant, auditoría y revocación. Cleanup informó `preexisting-containers-networks-volumes-unchanged PASS`. No equivale a producción desplegada ni a cobertura funcional de browser.
- [x] Codex independiente sobre HEAD ejecutado `3ceafbd6631b08bc673eb4a4f855aa1dec025930`: «Didn't find any major issues», https://github.com/novo34/cleanops-360/pull/22#issuecomment-6427135468 . Cuatro fingerprints Gitleaks exactos aceptados expresamente; protección administrativa `main` contrastada por captura del propietario (required `engineering-policy`, strict, sin bypass, conversaciones resueltas, sin force push/deletion); integración REST detallada devuelve 403, no reinterpretar como desprotección.
- [ ] **Aceptación formal aún pendiente:** verificar y archivar el informe interno del artefacto sanitizado, identificar resultado efectivo del required check `engineering-policy` en el SHA de cierre, cumplir los criterios canónicos sin marcar falso PASS y obtener dictamen independiente de cualquier commit posterior de cierre. No afirmar R3 DONE ni hacer merge sin autorización expresa posterior; revisar el cuerpo de PR y todas las conversaciones. Este registro mueve C y W; invalida valores previos para otra review nativa. PostgreSQL no se debe repetir como efecto de registrar evidencias.
- [ ] **Siguiente decisión:** tras QG-3, aprobación expresa del propietario para cierre/merge controlado de PR #22. Mantener PR DRAFT, `R3 OPEN / READY_FOR_OWNER_ACCEPTANCE` solo cuando todos los checks y evidencias requeridos estén comprobados. AUTH-GATE-05 permanece OPEN y closedBackend conectado; R4 no iniciado.

### R3 — Aceptación expresa del propietario de cuatro fingerprints Gitleaks (2026-10-26)

- [x] El propietario **autoriza exclusivamente** las cuatro excepciones R3 existentes de `.gitleaksignore`, ya documentadas como hashes SHA-256 públicos; **NO** autoriza ninguna ampliación de regla, ruta, ubicación, commit o exclusión. Se mantienen idénticos sus bytes y el mecanismo de detección. Fingerprints inmutables: `fceffc302f44819cca19196ba3adc84878e7e5f2:docs/proposals/b2-invitations/sql5-r3-candidate-manifest.review.json:generic-api-key:{34,35,46,49}` (cuatro entradas exactas, no wildcard). Esta aceptación es documental y **NO** constituye aprobación de SQL, PostgreSQL, revisión Execute, despliegue, merge, cierre R3 ni levantamiento de engineering-policy.
- [ ] Persisten la revisión independiente final del SHA activado `14e671855c67569337ba3abdb1f487cabf3d3acb`, la lectura administrativa de la protección clásica `main` (integración HTTP 403), y el permiso específico para una sola ejecución nativa controlada. Cualquier nuevo commit documental mueve C y altera W/B potencialmente: reconfirmar nueva tupla C/M/W/B antes de solicitar o emitir review Execute. R3 **OPEN / BLOCKED_FOR_NATIVE_VALIDATION**.

### R3 — Activación del flag autorizada, sin ejecución nativa (2026-10-26)

**R3 OPEN / BLOCKED_FOR_NATIVE_VALIDATION; PR22 DRAFT.** Base remota e3d9589f80517c94baf707bb70804b28ae4b69bf; main975134a78621820bf3b790c392ab35726194ec66. El propietario autorizó expresamente publicar la capacidad activada revisable; NO autorizó PostgreSQL/SQL/Docker/OpenBao/migraciones/fixtures/despliegues/merge ni review Execute. Las evidencias anteriores del flagFalse permanecen como historia, no describen el estado vigente.

- **QG-0:** AGENTS/política/TODO, harness/main/preflight/execution_context/authorize_r3/git_bytes, workflow, tests y manifiesto releídos. Se reutiliza entrada canónica y los mismos consumidores prepare-composition/wrappers SQL4/R1/R2/workflows B2; no arquitectura nueva, guard, runner, wrapper, workflow, job ni archivo añadido/retirado. Cinco archivos existentes: harness (seguridad: único cambio AST funcional flagTrue y comentarios), workflow (DevOps: exclusivamente comentarios/nombre del step que ya no deben afirmar cerrado), tests (QA: expectativas activadas y prueba de orden), manifiesto (R3: solo dos hashes de bytes cambiados), exclusivamente esta inserción R3 (recuperación). SQL/fixture y contratos B1/B2 no cambian. Riesgos nativos multiempresa/ACL/RLS/concurrencia siguen pendientes de pruebas reales.
- **Cambio exacto y seguridad:** R3_NATIVE_ENABLED=True, sin override env/CLI; comprobación defensiva del flag permanece. Comparación AST del harness con baseline demuestra que solo cambia ese booleano; preflight/authorize_r3/execution_context/git_bytes y todos sus rechazos son idénticos. YAML comparado conserva íntegros trigger, routing, condiciones, permisos, acciones, checkout no persistente, steps/run y artefactos; únicamente cambia etiqueta del step nativo y comentarios. No se retira ni se debilita autorización de evento. Capacidad activada NO equivale a permiso de ejecutar.
- **Contrato necesario antes de transporte:** review formal COMMENT nueva de novo34/login+ID/sender/actor/triggering_actor, pull_request_review:submitted, PR22 abierto/repoID/branch exactos/base main, attempt1 y runId positivo; submitted_at UTC auténtico con edad0..900s, sin fecha env. C=review=head=checkout; M inventario cerrado34 y bytes C; W=GITHUB_WORKFLOW_SHA=GITHUB_SHA/ref merge22 exacto, objeto W obtenido por SHA fijo y bytes comparados; B=base.sha y cuerpo exacto, padresW=[B,C], refs vigentes main/head/merge=B/C/W. Revalidación final de contexto/TTL antes de retornar autorización. Datos sensibles externos y permisos históricos incompatibles rechazan por defecto. Cualquier discrepancia impide load/transporte; URL/read-only Git y stdout/stderr sanitizados conservados.
- **No activación accidental:** push/publicación no son trigger de este workflow; reviews comunes/Codex/diagnósticas no tienen propósito Execute ni cuerpo exacto; reruns attempt>1 y aprobaciones R1/R2/C/M/W/B anteriores se rechazan. No había revisión nativa de este nuevo SHA al preparar publicación y no se emite ninguna. Los hashes nuevos no son consentimiento. En las pruebas negativas, main devuelve FAIL y loader nunca se llama. En el único positivo estático se intercepta la primera llamada a load con BaseException centinela antes de ejecutar su implementación; jamás se importa transporte ni se obtiene objeto backend. No se usa un backend simulado que pudiera aparentar PASS nativo.
- **Integridad final:** manifiesto SHA256 `907d691791d73be42d03db266b5e7ad92c5c5ead098a29134f022709aa6e6b97`; harness `f7aa921f0cd1362913a4264d653e8b73cd1d2919fc0ee06a17bdd99b06d1cbdb`; workflow `397e4fe5de04462f7fe4346ef643327a07a4f843ac1591fd2e90c0c12dbd408a`. M mismas34 rutas/contexto/referencias/otros32 hashes y ninguna aprobación nueva. SQL5 b017fed6d5c3f7590fb1e36f8655332ad26a8ad4b4c673edb7dea90e676d44b2 y fixture aa05424abb1cacc3da418d65cd2137d8c305d639eb0032e9a7ebc47659fbccbb intactos. Veinte históricos verificados por objetos Git originales: a01/hash del harness antiguo en manifiesto histórico se preserva, otros19 iguales, aprobaciones originales no modificadas ni reutilizadas para nuevos bytes.

| Verificación de esta intervención | Estado |
|---|---|
| Baseline65 antes de cambiar flag | PASS65 |
| Suite canónica ampliada66, con expectativas ajustadas de flag y positivo cortado en loader | PASS66; FAIL0/XFAIL0/SKIP0 |
| Eventos/identidad/reviews antiguas o diagnósticas/reruns/tiempo/C-M-W-B/refs/hashes inválidos: load no llamado | PASS estático |
| Autorizar contexto íntegro de fixture alcanza solo frontera interceptada; prueba AST orden preflight→authorize_r3→load→servicios | PASS estático; no autorización real ni ejecución nativa |
| Integridad34/procedencia20, AST/YAML y único cambio AST flag, parser PG16.1 aislado sin servidor | PASS |
| Quality y revisión Codex del SHA final | PENDING al publicar; evidencia final enlazada en conversación PR |
| engineering-policy | FAIL legítimo previo por casilla nativa, sin modificar formulario/política |
| Observación runtime nueva, fetch/ls-remote GitHub desde harness, PostgreSQL/SQL/Docker/OpenBao/fixtures/migraciones/despliegue/merge | SKIP, no ejecutados ni autorizados |

**Siguiente autorización exacta, NO enviada aquí:** después de Quality y revisión independiente final, reconfirmar HEAD C_act de esta activación, M_act anterior y B_act=HEAD main; leer W_act real del merge ref y verificar por API padres[B_act,C_act], ref/bytes workflow iguales a los revisados. El comentario final del PR registra la tupla observada por API, no una observación de runner ni permiso. Cualquier cambio posterior de C/M/W/B invalida esa tupla y obliga a revisar/autorizar de nuevo; M no se incluye a sí mismo ni contiene C/W, evitando circularidad. Runtime comprobará su propio W/ref y refs vigentes; no se falsean variables ni se repite la observación histórica40365474104.

El propietario debe autorizar separadamente UNA ejecución pre-merge por C_act/M_act/W_act/B_act, alcance SQL14+SQL1–4/SQL5 y fixture fijados, hosted PG16 efímero network-none/tmpfs/sin puertos/binds/volúmenes, coste/timeout, efectos sintéticos y limpieza verificable, sin acceso a servicios/datos reales ni merge. Resolver gates pendientes aplicables sin exenciones ni casillas falsas. Solo tras ese permiso nuevo, dueño envía review formal COMMENT sobre C_act aún HEAD, cuerpo exacto `Execute owner-authorized SQL5-R3 candidate C_act manifest M_act workflow W_act base B_act; native isolated validation only.` Sustituir placeholders por hashes finales completos; sin saltos extra. attempt1, timestamp GitHubUTC≤900s también al terminar autorización; no rerun. Este texto documental no autoriza ni dispara ejecución. Si W/ref/hash o tiempo difieren, abortar; no normalizar env ni usar permisos de preparación/activación/observación/históricos como permiso nativo.

**Rollback:** revertir conjuntamente cinco archivos restaura flagFalse, M y comentarios/tests previos; no SQL inverso, force-push ni cambios de protección. Puede cerrarse capacidad con parche revisado flagFalse+rehash; todo nuevo SHA invalida la tupla. Un revert no detendría run ya iniciado: no existe ejecución nativa aquí; una autorización futura debe prever cancelación/limpieza verificables y evidencias FAIL/SKIP auténticas. Riesgos residuales: red/W/ref nuevo NOT_VALIDATED runtime, consultas refs no son bloqueo atómico aunque bytes fijados nunca sustituyen código, pruebas nativas ACL/RLS/tenant/concurrencia/idempotencia/limpieza pendientes. Cuatro fingerprints siguen pendientes de aceptación expresa; clásico403=NOT_VERIFIED, no ausencia de protección. Integración/merge/cierre requiere permiso posterior separado. No R4, no R3 DONE; AUTH-GATE-05 OPEN y closedBackend conectado.

### R3 — Evidencia final preservada y solicitud de aceptación (2026-10-27)

**R3 OPEN; aceptación expresa del propietario pendiente; PR22 DRAFT.** Base documental dbd260de83c70e0c7755723c6275a9149c394ae2; main975134a78621820bf3b790c392ab35726194ec66. Este asiento complementa el registro nativo previo y prevalece sobre las menciones históricas a validación pendiente. La aptitud READY_FOR_OWNER_ACCEPTANCE exige Quality, engineering-policy y dictamen independiente exactos del SHA documental final, registrados en la conversación del PR; no se heredan checks ni revisión de otro SHA. No marca DONE, no autoriza merge, no inicia R4 y no repite PostgreSQL.

- **QG-0 y alcance mínimo:** inspeccionados AGENTS, política, TODO, formulario/verificador confiable de main, diff ocho archivos del PR, review formal5659312253, run40404650268/job121859154243, artifact12691355642 y conversaciones. Reutilizados TODO R3 y cuerpo obligatorio del PR; no nuevos archivos, código, harness, runner, workflow, guards ni arquitectura. Dueño PO/Engineering para esta conciliación y evidencia; consumidor aprobación owner/auditoría del mismo PR. Archivo modificado exclusivamente este TODO por inserción en R3, más metadata del PR. R0/R1/R2 y todas las evidencias R3 anteriores se conservan literalmente.
- **Autorización y ejecución comprobadas:** review formal COMMENT5659312253 del propietario sobre C=3ceafbd6631b08bc673eb4a4f855aa1dec025930, M=907d691791d73be42d03db266b5e7ad92c5c5ead098a29134f022709aa6e6b97, W=c8093b8d1c99129bcb3c8298d693fd4744c91a47 y B=975134a78621820bf3b790c392ab35726194ec66. Run40404650268 attempt1 success, paso R3 success, históricos R2/diagnóstico SKIP. Este permiso quedó consumido; ninguna nueva ejecución/review Execute está autorizada aquí. https://github.com/novo34/cleanops-360/actions/runs/40404650268/job/121859154243 .
- **Archivo interno preservado:** descargado ZIP sanitizado de GitHub en solo lectura, sin ejecutar su contenido. SHA256 ZIP1506bytes=3e7df38818460bba9fb434a4f51912d4a06f3db33cfceeaf58ce774b1d1f74b1, coincide con digest API. Única entrada report.json5618bytes, SHA256=62a2a1d7c749764c7c041f91d014246391d2f710efa16f3611ee49a16aa980ff. JSON verificado result PASS, cleanup PASS,53checks PASS,0FAIL. Se incluye copia íntegra a continuación dentro del documento existente para conservar evidencia aunque caduque el artefacto remoto. https://github.com/novo34/cleanops-360/actions/runs/40404650268/artifacts/12691355642 .
- **Cobertura real acotada:** instalación SQL14 y SQL1–4/SQL5 con EXECUTE, cuerpos de funciones PG, logins sintéticos separados, acceso directo denegado42501, enlaces privados/denegados, MFA/CSRF, límites de intentos, longitudes/hex56/58/59/1024/1026/inválido, rollback, carrera paralela y mutación única, idempotencia, tenant invitado, auditoría/revocación y credenciales/membresías existentes sin cambios. Aislamiento observado network-none/sin puertos/binds/volúmenes y preexisting-containers-networks-volumes-unchanged PASS; eliminación del contenedor cleanup PASS. functionalBrowser=SKIP_NOT_IN_THIS_PACKAGE, b2TechReady=false, runtime=closedBackend: no se declara aceptación productiva B1/B2, cobertura global RLS/browser, despliegue ni residencia suiza por estos resultados.
- **Integridad y revisión:** dbd260de tiene como padre C ejecutado3ceafbd663 y solo modifica TODO; código, SQL, fixture, manifiesto34,20históricos/aprobaciones y cuatro fingerprints aceptados siguen intactos. Esta fase tampoco los cambia. Revisión favorable sobre el código ejecutado: https://github.com/novo34/cleanops-360/pull/22#issuecomment-6427135468 . Se solicita revisión NUEVA del SHA final de este asiento; ese resultado se enlaza al concluir, sin heredar el dictamen de3ceafbd.
- **Gobernanza y metadata:** el cuerpo del PR se concilia con flagTrue, ejecución nativa realizada, hashes vigentes y excepciones exactas aceptadas. La casilla nativa ya marcada se sustenta en53checks reales, sin cambiar políticas, reglas ni pruebas. Se conserva el formato ocho campos/nueve casillas, validado localmente con verificador de main antes de publicar metadata. Required engineering-policy más reciente de dbd260de PASS, app15368, run40409438018/job121875837850; FAIL anteriores del mismo SHA quedan históricos. Quality previo PASS run40408556350; ambos deben revalidarse sobre el nuevo SHA. Resumen main confirma required para everyone; detalles de protección atribuibles a captura administrativa del propietario, GET detallado403=NOT_VERIFIED para la integración, no desprotección. No se usa bypass ni se modifica protección.

| Evidencia | Resultado y límite |
|---|---|
| Ejecución nativa autorizada40404650268 e informe interno completo | PASS53, result/cleanup PASS,0FAIL |
| ZIP/digest, copia íntegra y comparación con logs/tupla/review | PASS lectura; sin ejecución de contenido |
| Código ejecutado y manifiesto preservados en cambios documentales | PASS por diff Git y árbol; sin permiso nativo reutilizado |
| Formulario nuevo frente al verificador confiable de main | PASS local; check remoto sobre SHA final debe confirmarse |
| Quality/engineering-policy/revisión independiente final | Condiciones de aceptación, enlaces y resultados exactos en conversación PR al finalizar |
| Nueva ejecución SQL/servicios, despliegue, merge y R4 en esta intervención | SKIP, no autorizados/no ejecutados |
| Browser y aceptación productiva B1/B2 | SKIP/fuera del paquete; AUTH-GATE-05 OPEN |

**Copia íntegra de report.json sanitizado.** Los bytes entre delimitadores, incluido salto final, reproducen el archivo de5618bytes y el SHA256 anterior. No es código para ejecutar.

```json
{
  "scope": "SQL5_R3_ACCEPTANCE_HOSTED_EPHEMERAL_PG16",
  "runtime": "closedBackend",
  "checks": [
    {
      "name": "exact-B2-hashes-SQL14-authorization-hosted-CI-no-external-bindings",
      "status": "PASS"
    },
    {
      "name": "owned-container-network-none-no-ports-no-bind-or-volume",
      "status": "PASS"
    },
    {
      "name": "install-exact-authorized-SQL14",
      "status": "PASS"
    },
    {
      "name": "postgres-function-body-validation-enabled",
      "status": "PASS"
    },
    {
      "name": "install-exact-authorized-B2-functions-and-EXECUTE",
      "status": "PASS"
    },
    {
      "name": "synthetic-fixtures-and-separated-logins",
      "status": "PASS"
    },
    {
      "name": "B1-approved-12h24h-existing-session-fixture",
      "status": "PASS"
    },
    {
      "name": "install-exact-authorized-access-SQL-and-ACL",
      "status": "PASS"
    },
    {
      "name": "install-exact-authorized-users-SQL-and-ACL",
      "status": "PASS"
    },
    {
      "name": "SQL5-install-004-invitation-administration.review.sql",
      "status": "PASS"
    },
    {
      "name": "SQL5-install-005-invitation-acceptance.r3-candidate.review.sql",
      "status": "PASS"
    },
    {
      "name": "SQL5-explicit-synthetic-tenant-policy",
      "status": "PASS"
    },
    {
      "name": "SQL5-no-direct-identity-access",
      "status": "PASS",
      "detail": {
        "sqlstate": "42501"
      }
    },
    {
      "name": "SQL5-R2-attempt-ledger-private",
      "status": "PASS",
      "detail": {
        "sqlstate": "42501"
      }
    },
    {
      "name": "SQL5-R2-B1-security-log-remains-append-only",
      "status": "PASS"
    },
    {
      "name": "SQL5-no-runtime-call",
      "status": "PASS",
      "detail": {
        "sqlstate": "42501"
      }
    },
    {
      "name": "SQL5-synthetic-issued-link",
      "status": "PASS"
    },
    {
      "name": "SQL5-link-is-private-no-membership-before-MFA",
      "status": "PASS"
    },
    {
      "name": "SQL5-no-user-or-session-created",
      "status": "PASS"
    },
    {
      "name": "SQL5-unknown-capability-denied",
      "status": "PASS"
    },
    {
      "name": "SQL5-invalid-link-is-generic",
      "status": "PASS"
    },
    {
      "name": "SQL5-prepare-pending-MFA",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-hex-56",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-hex-58",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-hex-59",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-hex-1024",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-hex-1026",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-invalid-hex",
      "status": "PASS"
    },
    {
      "name": "SQL5-expired-capability-denied-with-rollback",
      "status": "PASS"
    },
    {
      "name": "SQL5-before-MFA-no-activation",
      "status": "PASS"
    },
    {
      "name": "SQL5-wrong-CSRF-denied",
      "status": "PASS"
    },
    {
      "name": "SQL5-native-factor-CAS",
      "status": "PASS"
    },
    {
      "name": "SQL5-rollback-activation",
      "status": "PASS"
    },
    {
      "name": "SQL5-rollback-has-no-member",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-parallel-race",
      "status": "PASS"
    },
    {
      "name": "SQL5-R3-parallel-unique-mutate",
      "status": "PASS"
    },
    {
      "name": "SQL5-consumed-idempotent-no-recreation",
      "status": "PASS"
    },
    {
      "name": "SQL5-active-only-in-invited-tenant",
      "status": "PASS"
    },
    {
      "name": "SQL5-activation-audited-once",
      "status": "PASS"
    },
    {
      "name": "SQL5-revocation-fixture",
      "status": "PASS"
    },
    {
      "name": "SQL5-revoked-link-denied",
      "status": "PASS"
    },
    {
      "name": "SQL5-existing-identity-synthetic-invite-other-tenant",
      "status": "PASS"
    },
    {
      "name": "SQL5-existing-identity-fails-closed-without-prior-factor-proof",
      "status": "PASS"
    },
    {
      "name": "SQL5-existing-credential-and-memberships-untouched",
      "status": "PASS"
    },
    {
      "name": "SQL5-R2-synthetic-failure-budget-invite",
      "status": "PASS"
    },
    {
      "name": "SQL5-R2-record-credential-failure-1",
      "status": "PASS"
    },
    {
      "name": "SQL5-R2-record-credential-failure-2",
      "status": "PASS"
    },
    {
      "name": "SQL5-R2-record-credential-failure-3",
      "status": "PASS"
    },
    {
      "name": "SQL5-R2-record-credential-failure-4",
      "status": "PASS"
    },
    {
      "name": "SQL5-R2-record-credential-failure-5",
      "status": "PASS"
    },
    {
      "name": "SQL5-R2-sixth-credential-attempt-blocked",
      "status": "PASS"
    },
    {
      "name": "SQL5-helpers-not-public",
      "status": "PASS"
    },
    {
      "name": "preexisting-containers-networks-volumes-unchanged",
      "status": "PASS"
    }
  ],
  "cleanup": "PASS",
  "result": "PASS",
  "functionalBrowser": "SKIP_NOT_IN_THIS_PACKAGE",
  "authorization": {
    "candidate": "3ceafbd6631b08bc673eb4a4f855aa1dec025930",
    "manifestSha256": "907d691791d73be42d03db266b5e7ad92c5c5ead098a29134f022709aa6e6b97",
    "workflow": "c8093b8d1c99129bcb3c8298d693fd4744c91a47",
    "base": "975134a78621820bf3b790c392ab35726194ec66",
    "reviewId": 5659312253,
    "reviewBodySha256": "f51a6812bc2268eb1db8a3a04375099e10db9b847026430343436b389478db41",
    "runId": "40404650268",
    "attempt": 1
  },
  "image": "postgres@sha256:d81f7b51697014367236d07ec58b54153fc28f828b72bf247fe5c7487520bcb0",
  "b2TechReady": false
}
```

**Decisión pendiente y rollback:** tras checks/dictamen finales satisfactorios, solicitar aceptación expresa del alcance R3 sobre el SHA documental final. Autorización de merge/integración debe ser expresa y separada o nombrarse inequívocamente en la decisión owner; hasta entonces conservar PR DRAFT y casilla R3 abierta. No cerrar ni iniciar R4 por este registro. El merge deberá respetar required check, strict, conversaciones y reglas sin bypass. Rollback de esta conciliación: revertir solo inserción documental y restaurar metadata anterior si se requiere, conservando evidencias; no afecta código ni ejecuta SQL. El cambio documental mueve C/W y revoca cualquier tupla anterior para otra ejecución. La prueba nativa ya acreditada no se repite para actualizar documentación.

### R3 — Cierre formal y aceptación expresa del propietario (2026-10-27)

**Estado: DONE para el alcance de reparación SQL5 AUD-010/AUD-011/AUD-023 y su validación nativa aislada.** El propietario aprobó expresamente la aceptación del candidato cdb9f6c24250c2fabb993033f59abf57d1974231, presentado con QG-3 satisfecho, y ordenó: «Aprobado la aceptación cierra R3 porfavor». Fuente: conversación de esta tarea el2026-10-27, posterior a la solicitud concreta de aceptación del SHA exacto. Este asiento prevalece sobre estados OPEN/BLOCKED/READY_FOR_OWNER_ACCEPTANCE anteriores, conservados como historia. Se marca únicamente la casilla R3; no se declara aceptación productiva B1/B2 ni se inicia R4.

- **Base aceptada y evidencia:** cdb9f6c24250c2fabb993033f59abf57d1974231; revisión Codex independiente sin problemas importantes https://github.com/novo34/cleanops-360/pull/22#issuecomment-6435879616 . Quality PASS https://github.com/novo34/cleanops-360/actions/runs/40464702840/job/122057209898 y engineering-policy PASS, GitHub Actions app15368, https://github.com/novo34/cleanops-360/actions/runs/40464856390/job/122057710514 . QG-3 final y alcance expuestos para aprobación: https://github.com/novo34/cleanops-360/pull/22#issuecomment-6435906725 .
- **Validación nativa aceptada:** run40404650268/job121859154243 sobre C3ceafbd6631b08bc673eb4a4f855aa1dec025930, review owner5659312253,53controles PASS, result PASS y cleanup PASS. Informe sanitizado íntegro archivado en sección R3 precedente, SHA25662a2a1d7c749764c7c041f91d014246391d2f710efa16f3611ee49a16aa980ff; ZIP3e7df38818460bba9fb434a4f51912d4a06f3db33cfceeaf58ce774b1d1f74b1. Permiso nativo consumido; no se repite ejecución para cerrar documentación.
- **QG-0 / cambio mínimo:** releídos AGENTS, política, TODO y evidencia/metadata del PR. Se reutiliza TODO canónico, dueño PO/Engineering; consumidores recuperación y auditoría/PR. Solo casilla R3 y este registro, más metadata coherente del PR; sin archivos nuevos, código, SQL, fixture, manifiesto, harness, workflow, guard, runner o tests nuevos. R0/R1/R2 e historial R3 preservados, otros944blobs intactos. No hay impacto multi-tenant/ACL/RLS/concurrencia por este asiento documental. Formulario conservado y validado con checker de main; checks y revisión exactos del commit de cierre se registran en conversación PR, sin heredarlos de otro SHA.
- **Integridad:** M907d691791d73be42d03db266b5e7ad92c5c5ead098a29134f022709aa6e6b97 y sus34rutas,20históricos/aprobaciones y cuatro fingerprints exactos aceptados sin cambios. El SHA nuevo documenta la decisión owner; no extiende consentimiento para bytes ejecutables ni renueva una review C/M/W/B.
- **Límites permanentes:** este DONE cubre exclusivamente reparación canónica y validación aislada SQL5-R3 acreditada. functionalBrowser=SKIP_NOT_IN_THIS_PACKAGE, b2TechReady=false; AUTH-GATE-05 OPEN y closedBackend conectado. B1/B2 productivos, browser completo, despliegue, residencia suiza y futuras ampliaciones conservan sus gates. Protecciones y reglas no modificadas; lectura clásica REST403 mantiene su limitación y atribución de evidencia administrativa del propietario. No se crean bypass ni exenciones.
- **Integración pendiente separada:** aceptación/cierre R3 no autoriza fusionar ni cerrar el PR22 como abandonado. PR sigue DRAFT/OPEN, sin merge, main975134a78621820bf3b790c392ab35726194ec66 sin cambios. Cualquier integración requiere permiso expreso sobre el candidato final revisado y cumplimiento de required checks/reglas sin bypass. R4 permanece sin iniciar y requiere encargo posterior; no se ejecuta por marcar R3.
- **Verificación y reversión:** comparación de diff y árbol debe confirmar un único archivo documental cambiado y metadata, informe archivado intacto, Quality/engineering-policy y Codex exactos del SHA de cierre. No se repiten servicios ni suites nativas; esos pasos SKIP en esta intervención. Para reabrir R3, registrar motivo y decisión autorizada, restaurar casilla/estado con commit documental normal y conservar historia; ningún SQL inverso ni force-push. Una aprobación de merge futura no se presume de esta aceptación.

- [ ] **R4 — Compatibilidad B1↔B2 y seguridad efectiva.** Confirmar firmas y permisos ejecutables, llamadas a funciones revocadas (AUD-013/024), comportamiento de aceptación de invitación y contrato `Idempotency-Key` (AUD-031); revisar tabla RLS/ACL de B2 (AUD-027) sin cambiar RLS a ciegas. Verificar audit trail entre tenants (AUD-033), caducidad absoluta y aceptación humana de parámetros (AUD-028), y contexto/performance (AUD-034). **Cierre:** defectos confirmados corregidos mínimamente, tests por tenant/rol, regresiones, contrato y autorización. No activar B1 ni B2 por este paso.

### R4 — Continuación Cloud, 2026-10-27 (sin publicación)

**IN_PROGRESS / aceptación y validación nativa bloqueadas.** Base exacta
`f79056811026b04d669281d7c8366104fd7b6fe3`; revisados ese commit y
`9d98a1c0c712cc0d36b032d5ab2afde8d5668c35`. No se reabre R0–R3 ni se inicia
R5–R9. Esta inspección propia no constituye revisión independiente.

**QG-0 previo a editar:** aceptación de invitación B2, MFA y aislamiento existentes
(REQ-AUTH-001/002, REQ-SEC-020); timeout separado REQ-AUTH-045/REQ-SEC-021.
Ruta reutilizada: panel → handler → ceremonia → broker parametrizado → candidato
SQL5; fixture → harness/workflow existentes, desactivados para AUD031.
Inventariados esos consumidores, contratos B1/B2, SQL14 y SQL1–5, manifiesto y
suite estática. Decisión extend/reuse: mejorar la fixture existente y su hash;
registrar resultados aquí. Sin archivos nuevos, runners, contratos, roles,
ACL/RLS o cambios de runtime. Riesgos: no confundir comprobaciones de bytes y
transporte simulado con garantías nativas, no reutilizar permisos R3 y no emitir
material privado en evidencias. Reversión: restaurar conjuntamente fixture y
manifiesto al SHA base; conservar este registro histórico; nunca SQL inverso.

| Hallazgo, en orden | Comprobación concreta | Resultado / siguiente dependencia |
|---|---|---|
| AUD-031 | Handler/ceremonia transmiten clave; broker usa `(text,text,bytea,uuid)` igual al candidato; digest SHA-256 con dominio propio. SQL valida capacidad/CSRF, tenant derivado, generación, política y vencimiento; serializa por destinatario y bloquea invitación/capacidad antes de consumir. | Coherencia estática comprobada; mismo digest devuelve éxito sin otra mutación, otro digest genera conflicto, digest legado nulo deniega. Eficacia concurrente SKIP. |
| AUD-031, cobertura | La fixture solo contaba usuario y auditoría tras carrera/replay. | Ampliada en origen: compara filas completas de principal, credencial, usuarios, MFA, recursos, sesiones, invitación, capacidades, outbox y auditoría antes/después de rollback, replay y denegaciones; comprueba también preservación del tenant original tras escenarios adicionales. No imprime snapshots. Nuevas aserciones nativas preparadas, NO ejecutadas. |
| AUD-013/024 | SQL14 revoca cinco mutadores de acceso directos; búsqueda de llamadas en `lib`, `scripts`, `tests` y consumidor `approved-backend.ts`. | Consumidor activo usa `changeAccessOwned`; llamadas directas localizadas en `tests/b1/access-broker.test.ts`, con pool simulado. No confirmado fallo activo por esos mutadores. Entradas históricas del broker conservadas; retirada corresponde a R6. No se afirma compatibilidad de todo el catálogo ni permisos efectivos sin PG. |
| AUD-027 | SQL14 incluye ENABLE/FORCE RLS y política broker para tablas base; segundo bloque incluye `access_resources`, `access_roles`, `access_role_memberships`, `access_rules`. SQL1–4 usan contexto servidor y filtros tenant. | No confirmada ausencia de RLS de esas tablas. Política broker `true` requiere validar aislamiento dentro de funciones; no prueba aislamiento por sí sola. Catálogo/ACL efectivas y casos tenant/rol SKIP; ninguna política modificada. |
| AUD-033 | `issue_session` SQL14 escribe `tenant.switch.out` con tenant/usuario de origen y `tenant.switch.in` con destino; misma correlación y transacción. SQL5 inserta auditoría con `c.tenant_id`. | No confirmado defecto por mezclar ambos tenants en esas inserciones. Nuevas comparaciones de fixture incluyen auditoría entre tenants. Validación nativa de cambio de empresa y rollback SKIP; no se declara AUD-033 cerrado. |
| AUD-028 | `valid_session` limita absoluta e inactividad; `touch_activity` usa LEAST con absoluta. `security-values.json` conserva `absolute_sensitive=28800` y `absolute_operational=86400` como PROPOSED_BENCHMARK_REQUIRED. | Propuesta concreta pendiente: 8h/24h absolutas por riesgo, sujetas a pruebas y aceptación; no habilitadas por esta revisión. Parámetros de invitación ya tienen `parametersApproved=true` en su aprobación histórica: no se pide aprobarlos otra vez. El nuevo contrato de replay AUD-031 sí sigue pendiente. |
| AUD-034 | `context()` revalida sesión por backend/xid; SQL1 invoca `effective_access` por recurso, SQL2 vuelve al evaluador canónico y contexto. | Trabajo repetido visible en código; impacto de rendimiento NO medido. No introducir caché que elimine revalidación. Preparado siguiente análisis autorizado: EXPLAIN/mediciones con volumen sintético y comprobación de política/tenant, solo tras permiso nativo propio. |

**Contrato AUD-031 propuesto, no aceptado:** clave ASCII `[A-Za-z0-9._:-]{8,128}`;
ámbito de replay = capacidad de aceptación autenticada, sin selector de tenant;
mismo digest confirma el consumo mientras la capacidad/política/generación sigan
válidas; otro digest produce HTTP409 genérico; consumo legado sin digest deniega
ambas claves; vencimiento deniega sin renovar plazo. Commit incierto conserva
clave y cookies para reintentar; éxito HTTP elimina cookies y conduce al login,
sin emitir sesión B1. No se promete recuperación del navegador tras borrar esas
cookies ni soporte de identidad existente sin prueba de factores previa.
Candidato de instalación limpia, no migración ni instalación junto a SQL5-R3.

**Evidencia local de esta intervención:**

- PASS: `node --experimental-strip-types --test --test-isolation=none tests/b2/*.test.ts`: 48/48; `npm run test:b1:offline`: 242/242; `npm run typecheck`; ESLint acotado a los seis archivos TS/TSX publicados de AUD031.
- PASS: `python -m unittest discover -s tests/static -p test_b2_execution_preflight.py`: 76 casos, 75 PASS / 1 SKIP por ausencia de pglast. No acredita gramática PostgreSQL. AST Python de fixture y todos los hashes del manifiesto comprobados; flags de aprobación/ejecución siguen false.
- FAIL inicial de preparación: suite estática sin objetos históricos locales (2 failures, 45 errors, 1 skip). Resuelto recuperando por SHA `3ea4ec8`, `147dac3`, `0eb651f`; posterior ejecución anterior PASS. No se modificó el guard ni se sustituyeron objetos por archivos actuales.
- SKIP: SQL, PG/OpenBao, migraciones, fixtures/concurrencia nativa, catálogo/ACL/RLS efectivos, E2E, benchmark, CI remota y revisión independiente. Sin servicios, commits nuevos, push, PR, merge, despliegue o cambios de protecciones. Históricos R3 y candidato SQL intactos.

**Decisiones pendientes exactas:** aceptar o corregir el contrato AUD031 anterior;
autorizar publicación del diff de esta rama para revisión independiente en GitHub
(commit/push y, si procede, PR borrador). Después de revisar bytes finales,
configurar y revisar contexto PR/W/ref y emitir autorización NUEVA por C/M/W/B,
scope `SQL5_AUD031_ACCEPTANCE_HOSTED_EPHEMERAL_PG16`, dependencias/fixture exactas,
intento y limpieza: este registro NO activa ninguna barrera. Aceptación de 8h/24h
absolutas requiere validación de seguridad antes de Auth productiva; no concede
permiso de habilitar backend. QG-3, dictamen independiente y aceptación PO siguen
pendientes; R4 permanece abierto y AUTH-GATE-05 intacto.

- [ ] **R5 — Consolidar CI, runners y Playwright (AUD-002/003/014/042).** Identificar workflow único vigente y artefactos one-shot históricos, referencias de sus nombres/SHAs, consumidores, scripts y autorizaciones. Reutilizar mecanismos existentes y reducir solo armazones duplicados, sin cambiar la semántica de pruebas ni borrar logs/evidencias. Evaluar 35 configs Playwright por cobertura y selección real antes de retirar. **Cierre:** matriz old→new, no pérdida de casos/autorización/artefactos, CI local y remota equivalentes con gasto medido, rollback, nada huérfano.
- [ ] **R6 — Retirar código obsoleto comprobado (AUD-008/021/024/036/039).** Solo después de tener sustitutos aceptados: grafo estático y referencias dinámicas de cada candidato; diferenciar runtime, tests, scripts manuales y revisiones de seguridad; migrar tests antes de borrar funciones o rutas. Los cuerpos efectivos de R14 y SQL histórico aprobado se conservan hasta la revisión formal correspondiente. **Cierre:** lista KEEP/REUSE/CONSOLIDATE/REMOVE por archivo, no referencias rotas, build/typecheck/seguridad/E2E pertinentes PASS.
- [ ] **R7 — Documentación y estado real.** Anotar contadores 41/44 versus 42/44 sin alterar registros históricos; actualizar coverage AUTH como IMPLEMENTED_NOT_VALIDATED cuando corresponda; alinear contratos, códigos de requisitos, ownership y fuentes canónicas. **Cierre:** documento↔código↔prueba↔aprobación trazable, sin duplicar autoridades, gates abiertos documentados.
- [ ] **R8 — Validación integral y aceptación de recuperación.** Ejecutar únicamente suites necesarias y expresamente autorizadas (tipado, lint, tests de seguridad, DB/E2E cuando sus gates lo permitan); verificar multi-tenant, permisos, concurrencia, idempotencia, observabilidad y limpieza; revisar árbol final por duplicados/huérfanos, PR pendientes y runtime. **Cierre:** inventario de deuda residual con propietarios o cero deuda no justificada en alcance, resultados reales por SHA, aprobación explícita del PO. No declarar B1/B2 TECH-READY o ACCEPTED sin sus propios gates.
- [ ] **R9 — Experimento DeusData/codebase-memory-mcp (separado, condicionado).** **Solo después de R8:** revisión oficial de release/checksums, piloto aislado y de solo lectura, benchmark en copia local, ninguna edición de AGENTS/config sin aprobación. Su adopción necesita valor medido y evaluación de seguridad. No es un componente de CleanOps 360 ni una excusa para crear otra capa.

## Orden de decisión
**Ahora:** R0 y R1 cerrados con aceptación del propietario; siguiente bloque único R2 (TODO, aún no iniciado). R3 y posteriores únicamente tras el cierre autorizado del bloque precedente. Hallazgos HIGH se pueden elevar a emergencia solo con riesgo de seguridad demostrado y autorización del propietario. Si las comprobaciones bloquean una fase, consignar BLOCKED y su causa; no saltar al siguiente bloque para aparentar progreso.

## Formato único del parte por bloque
`Bloque | estado TODO/IN_PROGRESS/BLOCKED/DONE | SHA inicial → final | hallazgos | código reutilizado | archivos añadidos/modificados/retirados | pruebas PASS/FAIL/SKIP | permisos/autorizaciones | riesgos pendientes | evidencia URLs | aceptación PO`.

**Este checklist no declara ninguna intervención completa al crearse.**

## R1 — Evidencia de remediación (2026-10-24)

Registro histórico: las referencias de esta sección y las siguientes a otro colaborador, segundo revisor o aprobación ajena al autor describen el diseño anterior. La norma vigente es §8.4–5 de ENGINEERING_QUALITY_POLICY: propietario humano único, auditoría IA independiente por SHA y autorización final expresa, sin autoaprobación formal. Los hechos y autorizaciones históricos no se reescriben.

**Estado: BLOCKED; casilla R1 abierta.** HEAD inicial verificado por GitHub: `42dc7e85ebdb451195a2cb1caf434f23455b2603`. El commit que incorpora este registro identifica el candidato final; aún necesita revisión independiente vigente.

- QG-0: inspeccionados AGENTS.md, DELIVERY_PLAYBOOK, política, TODO, plantilla, verificador, workflow y árbol real del PR. Se reutilizan verificador/plantilla/workflow existentes; sin nuevo runner, harness persistente ni archivos nuevos. Diff: verificador, nombre del workflow, política (activación) y este registro. Rollback: revertir este commit en la rama de gobernanza; no altera runtime.
- Reproducción en bytes del HEAD inicial: respuestas `false false false` y texto de casilla truncado fueron aceptados. Corregidos en el mismo verificador: rechazo de respuestas formadas solo por placeholders, texto completo de las nueve casillas y límites de respuestas multilínea. Los hallazgos anteriores sobre etiquetas completas, comentarios HTML y casillas ya estaban parcialmente corregidos; no se duplicó la solución.
- PASS local: sintaxis Python y 37 casos CLI sobre el archivo corregido: positivos inline/multilínea; negativos cuerpo vacío/null, plantilla vacía, false repetido, comentarios HTML, placeholders inline/multilínea/Unicode, cada uno de los ocho campos vacío y cada una de las nueve casillas desmarcada/truncada. SHA-256 del verificador probado: `8e3b528b285e9028c9a8a1d5d833fcf880cb218a0ecf97964c11c53833ee04c9`. Fixtures efímeras en /tmp, no integradas como otro sistema.
- Revisión estática de seguridad: pull_request_target, checkout fijado al base.sha, acción fijada por SHA, contents:read, credenciales no persistidas, sin interpolación del cuerpo en shell, sin ejecución del head ni secretos añadidos. Workflow renombrado engineering-policy para alinear el nombre solicitado; contexto remoto exacto pendiente de observar.
- CI: sin ejecución manual; SKIP bootstrap remoto porque main no contiene el mecanismo. Check inicial observado: solo Vercel Preview Comments, no acredita política. FAIL/SKIP pendientes no se declaran PASS.
- Revisión independiente previa: CHANGES REQUIRED sobre bbf5c5b; no constituye aprobación del candidato final. Nueva revisión por SHA final pendiente. La revisión propia y las pruebas anteriores no se presentan como independientes.
- Protecciones: API rulesets devuelve []; protección clásica main devuelve 403 Resource not accessible by integration (estado desconocido, falta Administration:read). CODEOWNERS ausente; alternativa propuesta: revisión obligatoria de todos los cambios por otro colaborador, sin bypass. Configuración detallada y baseline de ocho PR abiertos en §8 de la política, todavía sin aprobación/activación.
- Bloqueos de cierre: revisión independiente, aprobación de baseline y bootstrap/merge por el propietario, segundo revisor elegible, reglas activas y comprobación de PR inválido bloqueado/válido aceptado. Bases B1/B2 sin mecanismo: no se modifican ni se adelanta R2. Sin PostgreSQL, SQL5, staging, despliegue, cambios de closedBackend o AUTH-GATE-05.


## R1 — Corrección del análisis Markdown y revalidación

**Estado: BLOCKED; R1 permanece sin marcar.** HEAD inicial confirmado: `cd97157383c1d117e645de46d91b58f235874663`. El commit que incorpora esta sección es el candidato de remediación; el SHA final y la comprobación de bytes publicados se registran en el PR #14, evitando autorreferencia del hash del propio documento.

- QG-0: se releen AGENTS, DELIVERY_PLAYBOOK, política, TODO, plantilla, verificador y workflow. Se reutilizan FIELDS/CHECKS, normalización y CLI del verificador existente; no hay parser, verificador, workflow ni archivo de pruebas paralelo. Modificados únicamente verificador, instrucciones de la plantilla, política (dialecto y protección) y este TODO. Rollback: revertir el commit de remediación en gobernanza, sin tocar runtime.
- Revisión independiente recuperada: [review 5638625106](https://github.com/novo34/cleanops-360/pull/14#pullrequestreview-5638625106), SHA `cd97157383c1d117e645de46d91b58f235874663`, finalizada con tres P2: bloques de código, enlaces vacíos/referencias invisibles y hash de evidencia. Todos reproducidos; no se presenta la revisión anterior como aprobación de la reparación.
- Corrección en origen: análisis secuencial de un dialecto explícito del formulario. Solo encabezados ATX, campos completos anclados, prosa continuada y casillas exactas; respuestas de texto/URL literal o código inline emparejado. No se cuenta sintaxis de links, imágenes, referencias, HTML ni bloques como respuesta; citas ineligibles. Se rechazan formatos fuera del dialecto en vez de intentar interpretar Markdown arbitrario. Medición alfanumérica y normalización Unicode de controles; casillas duplicadas/contradictorias rechazadas. Restricción documentada para la baseline histórica.
- **Rectificación del hash previo:** `8e3b528b…33ee04c9` era la copia temporal con un newline adicional. El blob realmente publicado en cd971573 tenía SHA-256 `85f8850763e8264dd1fe56af162f94b497bfb128bf605ddaaba877555b932c27`; los 37 casos se repitieron contra ese contenido exacto. Se conserva el registro anterior como histórico, no como evidencia válida de equivalencia de bytes.
- **PASS local del candidato:** sintaxis compilada en memoria y 109 casos CLI con eventos por stdin: 92 cuerpos (los 37 anteriores más 55 adversariales/positivos), 9 entradas malformadas y 8 contratos de metadatos de PR que proponen eliminar/alterar controles. Batería reproducible completa, sin archivos nuevos: [comentario 6386341280](https://github.com/novo34/cleanops-360/pull/14#issuecomment-6386341280). SHA-256 del verificador candidato: `cf8a057c1758b28969a1a9171bf9fb3599c0aaf23a27b6dd48a1bd66b8958ccf`. Revalidar este hash y repetir batería sobre contenido recuperado por SHA después de publicar. Cero bypass conocidos reproducidos en esta batería; no prueba veracidad semántica de respuestas.
- Workflow sin cambios: revisión estática conserva pull_request_target, acción checkout fijada por SHA, base.sha, contents:read, persist-credentials:false, sin ejecutar head ni interpolar body en shell. Los metadatos de archivos no son un control de revisión: un cuerpo válido puede acompañar un cambio debilitador. Se exige revisión de todos los cambios por otro colaborador mediante reglas, último push aprobado, descarte de aprobaciones obsoletas y bypass vacío, como control equivalente para archivos de gobernanza.
- Protecciones reconsultadas: rulesets=[]; branches/main protected:false, protection.enabled:false, required_status_checks off y sin contextos/checks. Endpoint administrativo detallado devuelve 403. No hay administración demostrada por la integración ni protecciones activadas. **SKIP:** CI/ejecución remota y prueba de merge bloqueado; main carece del mecanismo y bootstrap no autorizado. No se inventa excepción automática para PR históricos ni se modifica B1/B2.
- Pendientes: nueva revisión independiente del SHA final; aprobación por el propietario de baseline y bootstrap; merge autorizado posterior, observación del contexto real del check y activación autorizada de reglas; demostrar en PR existente incumplidor FAIL + merge bloqueado y restauración válida PASS con revisión todavía exigida. §8 de política mantiene el procedimiento. No hay merge, activación, PostgreSQL, SQL5, staging ni R2. R1 sigue BLOCKED aun si las pruebas locales y revisión del candidato son satisfactorias.


**Revalidación final del límite de citas:** tras publicar `3d400789e6ae174687090a1054eed64ba4765689`, se reprodujo un campo en continuación implícita de cita aceptado erróneamente. Corregido en el mismo estado de bloques: la cita y sus continuaciones quedan ineligibles hasta línea en blanco. Batería ampliada a **118 PASS** (101 cuerpos, incluidos los 37 originales, 9 eventos malformados y 8 contratos de metadatos); sintaxis PASS. SHA-256 candidato final del verificador: `658ae97a99f4d1ae2503fca52d0744f383db8d43ac944b0e4ee36e957174eb3f`. [Batería final reproducible](https://github.com/novo34/cleanops-360/pull/14#issuecomment-6386375256). El hash `cf8a057c…8958ccf` y 109 casos corresponden al candidato intermedio 3d400789, no al final. El commit de esta corrección y la igualdad de bytes publicados se registran en el PR; revisión independiente vigente del nuevo SHA pendiente. R1 sigue BLOCKED y no se activa ningún control.


## R1 — Corrección Unicode y baseline histórica preparada (2026-10-24)

**Estado: BLOCKED; no DONE ni solicitud de bootstrap.** HEAD inicial confirmado: `7d80533bc6a8b1e939408a7204372736d9a16ec6`. El commit que incorpora esta sección contiene el candidato; SHA final, hashes post-publicación y dictamen aislado se registran en PR #14 sin crear commits para autorreferenciar el propio documento.

### QG-0, correcciones y evidencias

- Reutilizados: verificador/FIELDS/CHECKS/CLI, workflow y plantilla actuales; batería de 118 conservada y ampliada sin archivos nuevos. Inspeccionados AGENTS, política, DELIVERY_PLAYBOOK, TODO, cuerpos/bases/diffs/reviews/runs de ocho PR. Alcance autorizado: solo dos P2 y preparación documental del P1; no aceptación de producto.
- P2 Markdown: se reconocen únicamente CR/LF/CRLF; se rechazan controles y separadores Unicode que fabricaban bloques. Espaciado estructural ASCII, sin strip/regex Unicode para encabezados, listas o fronteras de cita. Padding de lista limitado a 1–4 espacios del dialecto; NBSP legítimo en prosa sigue admitido. No excepciones por ejemplo, fecha, autor o PR.
- P2 cobertura: §8.4 añade `feat/foundation-bootstrap`. Contraste exacto de bases actuales: main (#1/#2/#4/#14), feat/foundation-bootstrap (#5), feat/b1-auth-rbac-rls (#6), docs/b1-v4-canonical-publication (#7), feat/b1-http-flows (#12). Todos cubiertos por la especificación; esto no instala controles en sus bases.
- PASS local: sintaxis + **206 casos CLI** (189 cuerpos, 9 entradas malformadas, 8 contratos de metadatos); conserva los 118 y añade 88 regresiones/positivos Unicode/espacios/CR/CRLF/tabs/padding. [Batería reproducible completa](https://github.com/novo34/cleanops-360/pull/14#issuecomment-6390231426). SHA-256 candidato del verificador: `894a75104652bd22f4843eddc056148d4a3a02c8b1642a21444f607d757f4c97`. Repetir por SHA publicado y verificar Git blob IDs antes de atribuir PASS final.
- Solo se modifican verificador, política y este TODO; workflow/plantilla sin cambios. Sin nuevos archivos, runners, workflows, PR, SQL, PostgreSQL, despliegue, reglas, cambios B1/B2/staging o R2. Publicación de remediación no equivale a merge ni activación.
- Revisión independiente requerida del SHA resultante mediante sesión aislada sin contexto de implementación; no depender del bot atascado. Estado y resultado se enlazan en el PR. La revisión propia y 206 PASS no sustituyen ese dictamen.

### Baseline P1 — fichas preparadas, NO aprobadas ni publicadas en otros PR

Instantánea de cuerpos/bases/HEAD/diffs/runs consultada el 2026-10-24. Se preservan cuerpos y estados; los hashes abajo identifican exactamente el texto leído. No se ha marcado retrospectivamente ninguna casilla de otro PR. **FAIL de formulario** significa que su cuerpo no satisface el verificador, no que todas sus funcionalidades hayan fallado. **PASS de API/run** certifica el hecho leído, no todos los resultados internos ni autorización del propietario. La inspección estática de paths no certifica arquitectura/reutilización; los consumidores, dueños, permisos y rollback de producto pendientes quedan SKIP.

| PR | Base real | HEAD de instantánea | Archivos del diff completo | Formulario actual | Evidencia principal / pendiente |
|---|---|---|---:|---|---|
| [#1](https://github.com/novo34/cleanops-360/pull/1) | main | `8aeff94569cc9698c8e18ca8266515f51061faa2` | 23 | FAIL (24 errores) | Quality success; PO pendiente |
| [#2](https://github.com/novo34/cleanops-360/pull/2) | main | `07952283ad55c2dff164644cbd86cad4ee6bc739` | 3 | FAIL (26 errores) | Diseño documental; D0/D2 pendientes |
| [#4](https://github.com/novo34/cleanops-360/pull/4) | main | `6165ac22632fd396db5e9b81c3fe00078bae3af3` | 35 | FAIL (30 errores) | Quality failure: Semgrep |
| [#5](https://github.com/novo34/cleanops-360/pull/5) | feat/foundation-bootstrap | `a505c4f7f05ca79730a6326b294c597eead912a9` | 28 | FAIL (25 errores) | Quality success; cuerpo desfasado |
| [#6](https://github.com/novo34/cleanops-360/pull/6) | feat/b1-auth-rbac-rls | `bd0de506d033f4c617d23c3be42fd325f21225f5` | 42 | FAIL (21 errores) | Quality failure: Gitleaks |
| [#7](https://github.com/novo34/cleanops-360/pull/7) | docs/b1-v4-canonical-publication | `569975aab87c377248a7e9239cec237f5a20b9c6` | 658 | FAIL (32 errores) | 3 success / 23 skipped; gates OPEN |
| [#12](https://github.com/novo34/cleanops-360/pull/12) | feat/b1-http-flows | `063cd7456056fdff2840a626655700231902ab2a` | 136 | FAIL (28 errores) | SQL5-R2 histórico 39 PASS/7 FAIL; HEAD sin run |
| [#14](https://github.com/novo34/cleanops-360/pull/14) | main | `7d80533bc6a8b1e939408a7204372736d9a16ec6` | 6 | FAIL (25 errores) | 206 PASS R1; revisión/activación pendientes |

Cada ficha cubre los ocho campos de la plantilla de forma agrupada; es material de revisión para el propietario, no un cuerpo listo para pegar ni una declaración de ejecución nueva. Para todos: dueño de aceptación = Product Owner; no existe excepción aprobada ni fecha de gracia. Condición de transición = ficha individual acreditada y aprobación explícita antes de hacer obligatorio el check. Casillas de QG-1/QG-3 siguen sin marcar donde falte evidencia; los tests no aplicables se justifican como SKIP, no PASS automático.

#### Ficha preparada PR #1

- **REQ/módulo/resultado y exclusiones/autorizaciones:** Foundation: estructura Next.js, cabeceras/CSP y pipeline inicial; el cuerpo declara bootstrap autorizado, pero no aporta identificador REQ ni aceptación PO. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 23 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/d522e2edc95ac39af058522fecbcd9fd316667b3...8aeff94569cc9698c8e18ca8266515f51061faa2); rutas inspeccionadas: package.json, app/layout.tsx, lib/security-headers.ts, .github/workflows/quality.yml, test/foundation.test.ts. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Seguridad CSP/cabeceras y supply chain; el inventario no contiene rutas API ni migraciones. No se reaudita producto. PASS comprobado: [Quality 38382612764](https://github.com/novo34/cleanops-360/actions/runs/38382612764) success sobre el HEAD de ficha; review 5502168633 COMMENTED sobre ese HEAD, no APPROVED. SHA-256 del cuerpo leído: `f731c51793f4211e1613e509f48f2685cc0c5ff17ffb4ee3bcd6d83466352c2f`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. SKIP: vincular REQ y autorización original, revisión de hallazgos y autenticidad de cada test del job; inventario de nuevo archivo→dueño/consumidor y aceptación PO no completados. El cuerpo actual permanece FAIL (24 errores); ninguna casilla se cambia desde R1.

#### Ficha preparada PR #2

- **REQ/módulo/resultado y exclusiones/autorizaciones:** Diseño de gestión de idiomas UI/JSON; sin implementación/ejecución del módulo. El cuerpo mantiene D0/D2 pendientes y preserva las decisiones normativas. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 3 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/d522e2edc95ac39af058522fecbcd9fd316667b3...07952283ad55c2dff164644cbd86cad4ee6bc739); rutas inspeccionadas: docs/I18N_LANGUAGE_MANAGEMENT_SPEC.md, docs/START_HERE.md, docs/ROADMAP.md. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Coherencia con Master/SRS, alcance tenant/plataforma, fallback y permisos aún por decidir; reversión solo documental. PASS comprobado: diff de tres documentos, sin código; review 5489627708 COMMENTED sobre HEAD. GET runs para HEAD devuelve cero: no hay ejecución remota acreditada para este SHA. SHA-256 del cuerpo leído: `72158bf444f0f548661e0a2381d95057676ed8e7f1798eedf4cec0fa6395a0a8`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. SKIP: resolución D0/D2, coherencia documental y autorización de decisiones; pruebas de módulo no aplican al diseño y no se marcan PASS. Revisión no equivale aceptación. El cuerpo actual permanece FAIL (26 errores); ninguna casilla se cambia desde R1.

#### Ficha preparada PR #4

- **REQ/módulo/resultado y exclusiones/autorizaciones:** Administration/System Status: health/version/config/audit y UI con AUTH-GATE-05 abierto. El cuerpo declara lint/typecheck/test/build y 401; PostgreSQL real no ejecutado en su sandbox. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 35 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/d522e2edc95ac39af058522fecbcd9fd316667b3...6165ac22632fd396db5e9b81c3fe00078bae3af3); rutas inspeccionadas: app/api/system-status/health/route.ts, lib/system-status/access.ts, components/admin-system-status.tsx, db/migrations/0001_system_status.sql. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Datos administrativos, autorización, persistencia y migración. R1 no autoriza ejecutar ni reparar esas capacidades; SQL/ACL intactos. FAIL comprobado: [Quality 39367788017](https://github.com/novo34/cleanops-360/actions/runs/39367788017) failure en Static security analysis (Semgrep). Review 5516594600 pertenece a otro SHA. SHA-256 del cuerpo leído: `3d627246b1a0a79aa7c6ef4da639086e32741cf780faffd8e79826ef7b50aae4`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. FAIL: CI actual. SKIP: PG real según el cuerpo, revisión vigente/aceptación y autorización SQL; resultados enumerados localmente sin trazas por SHA no se elevan a PASS. El cuerpo actual permanece FAIL (30 errores); ninguna casilla se cambia desde R1.

#### Ficha preparada PR #5

- **REQ/módulo/resultado y exclusiones/autorizaciones:** System Status aislado sobre Foundation; el cuerpo sigue citando head 42e4baee y 21 archivos, frente a 28 archivos y HEAD real de esta ficha. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 28 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/8aeff94569cc9698c8e18ca8266515f51061faa2...a505c4f7f05ca79730a6326b294c597eead912a9); rutas inspeccionadas: .github/workflows/quality.yml, lib/system-status/access.ts, tests/system-status-access.test.ts, scripts/trusted-migrations.mjs, e2e/system-status-states.spec.ts. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Desfase de evidencia/cuerpo, gates de autorización y migraciones; no tocar PR #4 ni ejecutar servicios. Reversión de producto fuera de R1. PASS comprobado: [Quality 38676440330](https://github.com/novo34/cleanops-360/actions/runs/38676440330) success sobre HEAD actual; reviews 5531676670 y 5536812928 COMMENTED sobre ese HEAD. SHA-256 del cuerpo leído: `b1ba1dad7828a4d40ba20af7055c2ea0c38e99520d47d228ec61a84681aeda6c`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. SKIP: Firefox/WebKit según cuerpo, pruebas PG/locales solo declaradas sin revalidación de logs y fuente; actualizar referencias del cuerpo requiere autorización específica. Gate AUTH-GATE-05 y aceptación siguen pendientes. El cuerpo actual permanece FAIL (25 errores); ninguna casilla se cambia desde R1.

#### Ficha preparada PR #6

- **REQ/módulo/resultado y exclusiones/autorizaciones:** Publicación documental de contratos B1 V4; SQL de revisión es artefacto, no runtime. No ejecuta B1, SQL ni grants; AUTH-GATE-05 abierto. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 42 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/9f13c78d6c49194db1bd422db19128460f93f5fc...bd0de506d033f4c617d23c3be42fd325f21225f5); rutas inspeccionadas: docs/canonical/auth-review/v4/artifact-manifest.json, docs/canonical/auth-review/v4/validation-report.json, docs/canonical/auth-review/v4/static-tests.log, docs/implementation/b1/README.md. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Custodia de originales/hashes y no confundir verificación léxica con PostgreSQL; originales no se alteran. PASS documental: validation-report.json del HEAD declara 18 tests, failures/errors 0, postgresql_executed:false. FAIL CI comprobado: [Quality 38811596589](https://github.com/novo34/cleanops-360/actions/runs/38811596589) en Secret scanning (Gitleaks v2). Review 5540304970 COMMENTED sobre HEAD. SHA-256 del cuerpo leído: `be8873928c39da23090fa5bb15e89a7b8d8492e1dc79e1339e3d450bd10b85da`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. FAIL: CI Gitleaks. SKIP: no se reejecutó ni certificó independientemente el manifiesto completo; SQL semántico/PG no ejecutados, no convertirlos en PASS. Preservar incidente y revisión de hallazgos. El cuerpo actual permanece FAIL (21 errores); ninguna casilla se cambia desde R1.

#### Ficha preparada PR #7

- **REQ/módulo/resultado y exclusiones/autorizaciones:** B1 validación aislada; el cuerpo declara 42/44, PR006/PR007/AUTH-GATE-05 OPEN y closedBackend activo. No es aceptación operacional ni formal. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 658 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/bd0de506d033f4c617d23c3be42fd325f21225f5...569975aab87c377248a7e9239cec237f5a20b9c6); rutas inspeccionadas: .github/workflows/b1-no-db.yml, docs/implementation/b1/operational-acceptance/openbao/integration/PROXY_DEADLINE_EXECUTION.json. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Custodia/residencia/recuperación y aceptación real pendientes. No activar staging ni interpretar pruebas sintéticas como producción; no comparar/integrar linajes en R1. PASS de API: 26 runs del HEAD, tres success (39487330134, 39487330419 y [39487330178](https://github.com/novo34/cleanops-360/actions/runs/39487330178)), 23 skipped. Son conclusiones de run comprobadas, no repetición de pruebas. Reviews de PR no cubren este HEAD exacto. SHA-256 del cuerpo leído: `7f6b721241dd1268398832f0ab76677b67a420b689fbf04ac93a99407512667a`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. SKIP: validaciones remotas omitidas siguen SKIP; cifras de cada suite y equivalencia entre fuentes históricas no revalidadas en R1. FAIL de cierre documental/operativo: gates abiertos, sin aceptación PO; no se revoca ni se amplía una aceptación histórica. El cuerpo actual permanece FAIL (32 errores); ninguna casilla se cambia desde R1.

#### Ficha preparada PR #12

- **REQ/módulo/resultado y exclusiones/autorizaciones:** B2 usuarios/Manage Access reutilizando RBAC B1; closedBackend y AUTH-GATE-05 preservados. El cuerpo excluye identidades existentes, concurrencia y E2E de aceptación. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 136 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/569975aab87c377248a7e9239cec237f5a20b9c6...063cd7456056fdff2840a626655700231902ab2a); rutas inspeccionadas: docs/implementation/b2/sql4-evidence/b2-invitations/report.json, docs/implementation/b2/sql5-r2-execution/report.json, docs/implementation/b2/invitation-acceptance-r2-authorization.json. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Tenant/ACL/MFA/idempotencia y aceptación; SQL5 y autorizaciones históricas permanecen inmutables. Ninguna ejecución PostgreSQL ni reparación B2 en R1. PASS histórico: [SQL4 39568439638](https://github.com/novo34/cleanops-360/actions/runs/39568439638) success en 978233774027274ee8a3e229f5e66b57d73dcdb9. FAIL histórico: [SQL5-R2 39585052936](https://github.com/novo34/cleanops-360/actions/runs/39585052936) failure en 96d2ada22845e7c7e3e1131f6ea814152c3be89b; report.json del HEAD contiene 39 PASS/7 FAIL, confirmado por lectura. Cero runs para el HEAD administrativo actual. SHA-256 del cuerpo leído: `255c11b3f838113b09574a8998307d2cec57df759ffe44574c2858fa7c89bb14`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. FAIL conservados SQL5-R2; SKIP: concurrencia, MFA previa de identidades existentes y E2E según el cuerpo. No elevar el éxito SQL4 a éxito B2 ni solicitar nuevas ejecuciones. Reviews COMMENTED son autorizaciones acotadas históricas, no aceptación de fase. El cuerpo actual permanece FAIL (28 errores); ninguna casilla se cambia desde R1.

#### Ficha preparada PR #14

- **REQ/módulo/resultado y exclusiones/autorizaciones:** R1 gobernanza canónica; sin código de producto ni autorizaciones SQL/infra. Cuerpo histórico todavía usa la ficha anterior y queda intacto. REQ exactos y autorización de cierre no se inventan; confirmar con las fuentes del propio PR.
- **Inventario y alternativas/diff mínimo:** 6 archivos en [diff fijado por base y head](https://github.com/novo34/cleanops-360/compare/d522e2edc95ac39af058522fecbcd9fd316667b3...7d80533bc6a8b1e939408a7204372736d9a16ec6); rutas inspeccionadas: AGENTS.md, .github/PULL_REQUEST_TEMPLATE.md, .github/workflows/engineering-policy.yml, scripts/check-pr-engineering-policy.py, docs/ENGINEERING_QUALITY_POLICY.md, docs/CLEANOPS_RECOVERY_TODO.md. Reutilizar esos mecanismos; no crear otra variante. La corrección de esta ficha sería solo metadata tras autorización específica; responsabilidad de cada archivo nuevo, consumidor y prueba quedan por validar, no se presupone diff mínimo de producto aprobado.
- **Riesgos/reversión y evidencias:** Integridad de gobernanza, procedencia de ejecución y revisión obligatoria; sin reglas reales no hay garantía de bloqueo. Rollback de esta remediación mediante revert en rama de gobernanza, no runtime. PASS de la remediación R1: 206 casos CLI, incluida batería original de 118, sintaxis y hash candidato; repetir contra bytes recuperados por SHA al publicar. Cero Actions del HEAD inicial; el bot de revisión anterior no es evidencia suficiente. SHA-256 del cuerpo leído: `8990590fb33972cde4e82a06a69449e76e01114bb7281af7d913b2376171565d`.
- **Excepciones/owner/condición y declaraciones pendientes:** sin excepción aprobada; PO debe resolver aplicabilidad y revisar evidencia antes de autorizar transición. SKIP: bootstrap/CI remoto/bloqueo de merge. Pendiente revisión aislada del SHA final, aprobación de baseline/owner y activación posterior autorizada. No pedir bootstrap con defectos confirmados abiertos. El cuerpo actual permanece FAIL (25 errores); ninguna casilla se cambia desde R1.

### Condición para resolver el P1 y cerrar R1

Primero revisar el candidato corregido; después el propietario debe aprobar la baseline individual y autorizar cualquier cambio de cuerpo/estado. Nada de exenciones automáticas: los PR sin prueba de una declaración permanecen bloqueados. #14 necesita bootstrap explícito y excepcionalmente validado de forma local por ausencia del mecanismo en main; no ejecutar código del head en pull_request_target. Las bases no-main conservan su bloqueo hasta integración canónica específicamente autorizada, sin anticipar R2 ni modificar ramas aquí. §8 exige auditoría IA independiente del SHA final y autorización expresa del único propietario para TODOS los cambios de gobernanza, sin aprobaciones formales adicionales de GitHub y sin bypass. Las menciones anteriores al segundo colaborador son históricas. El check documental no protege por sí solo un cambio de controles acompañado de cuerpo válido.

SKIP: CI manual/ensayo remoto/activación; falta autorización y mecanismo en main. No existe protección real demostrada ni PR incumplidor bloqueado. No solicitar bootstrap con defectos confirmados abiertos. R1 continúa BLOCKED aunque los dos P2 estén corregidos técnicamente; quedan revisión aislada final, baseline aprobada, reglas reales y prueba remota.

## R1 — Estado vigente y modelo de propietario único (2026-10-25)

**Estado: BLOCKED; C8 pendiente; R2 no iniciado.** Esta sección actualiza el estado sin alterar las fichas ni evidencias históricas. Política canónica §8.4–5: un propietario humano, auditoría IA independiente de todos los cambios sobre SHA final, pruebas auténticas y autorización expresa trazable en el PR. La IA no emite una aprobación humana formal; no se requieren cuentas ni revisores adicionales. Los cambios de SHA invalidan la autorización anterior hasta revalidación. El control de autorización/auditoría es procedimental, no un gate automático equivalente a required reviews.

- Main verificado: 57748ca4d349a170a5e23da733b1b37e065b3e00, merges de #14 y #15. Workflow/verificador existentes reutilizados, sin cambios en este PR documental. Únicamente política y TODO corregidos; cero archivos añadidos. Rollback documental mediante revert del commit tras autorización; no afecta producto ni reglas.
- PASS remoto negativo: https://github.com/novo34/cleanops-360/actions/runs/40180793778/job/121131238671 . Checkout refs/heads/main y SHA efectivo 57748ca4d349a170a5e23da733b1b37e065b3e00; verificador ejecutado, ocho casillas pendientes rechazadas, salida 1. PR #1 conserva su cuerpo y estados.
- PASS API limitado: main protected=true, engineering-policy requerido, enforcement_level=everyone, app_id=15368. Confirmación administrativa aportada por el propietario: strict=true, required_approving_review_count=0, enforce_admins=true, dismiss_stale_reviews=true, required_conversation_resolution=true, allow_force_pushes=false, allow_deletions=false. No se modifican estas opciones. GET detallado sigue 403 con la integración; no se presenta como ausencia de protección ni como lectura independiente de los detalles aportados.
- Bloqueos simultáneos PR #1: check obligatorio FAIL, estado behind y conversaciones sin resolver (27 totales, 13 no obsoletas en la última lectura). El requisito fallido acredita incumplimiento; no aísla experimentalmente su contribución al bloqueo. Ensayo aislado pendiente: un PR real autorizado, actualizado y sin conversaciones pendientes, con el resto de gates satisfechos; observar rechazo por check sin intentar merge. No actualizar #1 ni resolver hilos artificialmente.
- Caso positivo: siete PR abiertos examinados, ninguno con nueve declaraciones acreditadas; no convertirlos a PASS. El PR documental autorizado puede servir de candidato acotado solo si sus propias declaraciones se acreditan; C8 de este PR debe referirse a sus cambios documentales y no afirmar cierre de R1. No basta un PASS local o un merge anterior. El ensayo exige cuerpo auténtico, revisión independiente del SHA final, check remoto PASS y elegibilidad de merge sin ejecutarlo; cualquier cambio de cuerpo para ensayo requiere autorización específica.
- Bases históricas: #1/#2/#4 hacia main reciben el verificador vigente aunque base.sha histórico sea antiguo; se conserva FAIL legítimo. #5/#6/#7/#12 tienen bases no-main y carecen de cobertura canónica acreditada: siguen bloqueados hasta integración/autorización específica, sin exenciones ni intervención en B1/B2 desde este PR.
- Pendientes para cierre: revisión independiente vigente del SHA documental publicado (se registra en su PR para evitar autorreferencia), aprobación y merge expresamente autorizados, recorrido positivo auténtico, bloqueo independiente, evidencia completa de ausencia de bypass y coherencia de cobertura. Ninguna casilla R1/C8 se marca DONE. CI manual, ensayo remoto adicional y configuración: SKIP por autorización/alcance.

## R1 — Delimitación segura preparada, pendiente de aceptación

**R1: BLOCKED documental; R2: NOT STARTED. No se marca C8 global DONE.** Este registro sustituye las condiciones de estado anteriores sin reescribir sus evidencias. R1 cubre main operativa y congelación efectiva de las bases históricas; R2 decide linajes, integración canónica y protección definitiva. No se autoriza ejecutar R2 por preparar esta delimitación.

- PASS ya acreditados, sin repetición: PR #16 con declaraciones C1–C9 específicas, revisión independiente de 2691e98453e423e13edb8e31b378c62218ab334c, run negativo https://github.com/novo34/cleanops-360/actions/runs/40186945956 y positivo https://github.com/novo34/cleanops-360/actions/runs/40187618429; integración en main f1ce8741af48c64ad0db698bb8cc4ca1c3f61c2f. El rechazo aislado de #16 no depende de behind ni conversaciones. No se exige otro candidato positivo ni se confunde auditoría IA con APPROVED de GitHub.
- Inmovilización acreditada: https://github.com/novo34/cleanops-360/rules/25820330, active, target branch, cuatro refs exactas, bypass_actors=[], current_user_can_bypass=never y reglas update/deletion/non_fast_forward. Bases protegidas y PR #5/#6/#7/#12 bloqueados. No se afirma ejecución del verificador en esas bases. SHA preservados: foundation 8aeff94569cc9698c8e18ca8266515f51061faa2; auth-rbac-rls 9f13c78d6c49194db1bd422db19128460f93f5fc; docs/b1-v4 bd0de506d033f4c617d23c3be42fd325f21225f5; http-flows 569975aab87c377248a7e9239cec237f5a20b9c6.
- Main mantiene engineering-policy requerido para everyone, GitHub Actions app15368. Los detalles administrativos aportados por el propietario mantienen su procedencia; el 403 de la integración no los convierte en ausencia de protección ni en lectura independiente. El modelo único y las limitaciones de controles procedimentales permanecen vigentes.
- Obligación transferida a R2: analizar integración sin elegir linajes por intuición; instalar el mecanismo canónico y protección definitiva, probarlos remotamente y obtener autorización antes de retirar o cambiar la inmovilización. No se permite una ventana de escritura sin protección. No se modifican bases, PR, SQL, staging, closedBackend ni AUTH-GATE-05 desde este cambio documental.
- Pendientes exclusivos de cierre: revisión independiente del commit documental final, publicación e integración autorizadas, aceptación expresa de R1 y actualización de su casilla únicamente con esa autorización. El candidato local sin commit se identifica por SHA base y hash del diff, no por un SHA final inventado. Las fichas y FAIL/SKIP históricos se conservan; no hay nuevos workflows, verificadores ni mecanismos.
