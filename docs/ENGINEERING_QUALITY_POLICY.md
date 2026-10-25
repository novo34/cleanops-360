# ENGINEERING QUALITY POLICY — CleanOps 360

**Estado:** política candidata; exigible tras aprobación, merge y activación de branch rulesets. **Ámbito:** humanos, Codex, ChatGPT, Claude y demás agentes; código, SQL, UI, fixtures, scripts, workflows e infraestructura. No altera SRS, decisiones aprobadas ni autorizaciones de ejecución.

**Autoridad:** Product Master/SRS → arquitectura y contratos canónicos → gates de seguridad → esta política de ingeniería → instrucciones del agente. Ante contradicción: detener el cambio, no reinterpretar requisitos.

## 1. Regla fundamental: REUTILIZAR ANTES DE CREAR

**Ningún agente puede crear o copiar un archivo, función, componente, tabla, endpoint, runner, workflow, adaptador o capa arquitectónica sin realizar primero un inventario del código existente.** Debe examinar el flujo actual, sus consumidores, firmas, permisos, tests, historial pertinente y puntos de extensión.

La búsqueda previa se documenta en el PR o registro del trabajo: rutas inspeccionadas, alternativas **reuse / extend / replace / create**, decisión y por qué las otras no bastan. Se prohíbe afirmar que algo no existe sin haberlo buscado.

**Orden preferido:** reutilizar → corregir en origen → extender punto de extensión canónico → sustituir con migración controlada → crear solo con justificación verificable. No crear «wrapper», «adapter», «v2/v3», «temporary», «review runner» u otra copia como salida automática ante un fallo.

## 2. Gate de diseño ANTES de escribir (QG-0)

Cada intervención debe tener una ficha compacta, suficiente para revisión:
1. Objetivo observable, REQ y módulo único, criterio de aceptación y exclusiones.
2. Diagrama/ruta de ejecución afectada: consumidores, puntos de entrada, dependencias, dueño y fuente de verdad.
3. Inventario de reutilización: archivos, funciones, test harness, workflows y contratos ya disponibles.
4. Plan **diff mínimo**: archivos que se modificarán, archivos nuevos con justificación individual, archivos que se retirarán; impactos en otros módulos.
5. Riesgos: multi-tenant, ACL/RLS, concurrencia, reversión, integridad histórica, secretos y permisos.
6. Plan de pruebas ejecutables y evidencia; presupuesto de CI; autorización requerida para SQL, infra y producción.

Si no puede completarse un punto esencial, detener escrituras y presentar el bloqueo. La ficha NO exige crear otro documento en el repositorio: puede estar en el PR o reporte de trabajo.

## 3. Reglas durante la implementación (QG-1)

- **Una sola implementación canónica y un solo entrypoint por responsabilidad**, salvo separación explícita por contratos/entornos. Los consumidores deben apuntar al canónico.
- Corregir causas raíz, no síntomas. Si falla un guard, determinar su propósito de seguridad y dónde debe operar; nunca falsear metadatos, desactivarlo ni duplicar el guard sin decisión arquitectónica.
- No introducir módulos «por si acaso», frameworks genéricos prematuros, mocks productivos, feature flags sin fecha de retirada, código comentado, archivos huérfanos o APIs sin consumidor.
- No duplicar lógica de autenticación, RBAC, tenant, auditoría, persistencia, validación, errores, transporte de pruebas ni CI.
- SQL/migraciones productivas: mecanismo versionado único; propuestas y artefactos históricos fuera del runtime, con hashes y trazabilidad, no múltiples migraciones equivalentes activas.
- No modificar contratos, roles/ACL o gates por conveniencia de tests. Aprobación de bytes/commit no es autorización para alterarlos.
- Scripts experimentales solo en espacio temporal fuera del repo, salvo aceptación expresa. Si algo temporal se integra, debe tener dueño y condición de eliminación.
- Mantener el cambio dentro del módulo y la autorización aprobados. Si se descubre una dependencia nueva, detener y revisar alcance antes de escribirla.

## 4. Control de defectos y cambios repetidos (QG-2)

Al primer FAIL: guardar evidencia, reproducir/diagnosticar y buscar corrección en origen. Antes de una segunda revisión, analizar también el *harness* y dependencias. Si dos revisiones del mismo defecto fallan o se propone un segundo adaptador/runner para la misma función, aplicar **STOP-AND-DESIGN**: ninguna tercera variante sin revisión del owner técnico y un plan de consolidación.

Las pruebas deben probar la propiedad anunciada: concurrencia requiere simultaneidad real y efectos únicos; «script terminó» no acredita integración; SKIP jamás se presenta como PASS. Ejecutar sintaxis/lint/unit tests locales antes de usar CI costosa. No reejecutar SQL o suites acreditadas fuera de autorización exacta.

## 5. Gate de aceptación (QG-3)

Antes de solicitar merge, READY_FOR_PO o ACCEPTED:
- Trazabilidad requisito → implementación única → consumidor → prueba ejecutada → evidencia.
- Inspección de diff por duplicados, archivos añadidos, referencias y cambios fuera de alcance.
- Comprobación de rutas, imports, referencias, tests y documentación; remover artefactos que no tienen dueño/consumidor o mantenerlos justificados explícitamente.
- Pruebas con casos positivos/negativos, tenants/roles, concurrencia y limpieza cuando corresponda. PASS, FAIL, SKIP separados.
- Evidencias verificables por commit, sin secretos; gastos CI proporcionales.
- Seguridad/ACL/RLS, trazabilidad histórica y aprobaciones obligatorias intactas.
- Revisión humana y aceptación explícita de las excepciones documentadas.

Un PR puede estar técnicamente completo pero no ACEPTADO. Si hay deuda nueva, incluir dueño, razón, fecha/condición de retiro y gate; no ocultarla.

## 6. Matriz de decisiones frente a nuevos archivos

| Caso | Acción predeterminada |
|---|---|
| Funcionalidad ya existente | Reutilizar; arreglar el defecto en origen |
| API existente incompleta | Extender contrato mínimo y actualizar sus consumidores/tests |
| Harness genérico con guard de rama | Revisar diseño de configuración y permisos antes de otro runner |
| Evidencia de ejecución fallida | Conservar inmutable fuera del código runtime |
| Nueva variante SQL por error de sintaxis | Corregir candidato canónico preservando historial; exigir aprobación nueva si cambian bytes |
| Adaptador temporal de pruebas | No integrar por defecto; necesita justificación/fecha de eliminación |
| Nuevo archivo realmente necesario | Explicar ruta, dueño, consumidor, prueba y por qué no se puede reutilizar |

## 7. Aplicación y límites

**Humana:** cada PR requiere ficha QG-0 y checklist QG-3. **Automática:** comprobaciones estáticas pueden verificar trazabilidad, rutas nuevas, archivos de revisión en runtime, duplicados evidentes y ausencia de campos obligatorios. Ningún linter puede probar por sí solo que la mejor arquitectura fue reutilizada: revisión técnica obligatoria. No activar controles bloqueantes sobre PR existentes hasta inventariar falsos positivos y aprobar baseline.

**Enforcement:** agentes deben rechazar tareas que impliquen crear archivos sin QG-0; si el dueño pide «continúa», continuar dentro del alcance ya autorizado, no interpretar como ampliación de permisos. Toda excepción requiere razón, aprobación y caducidad. El cierre de un módulo precede al siguiente.

**No levantar** closedBackend, AUTH-GATE-05 ni ejecutar PostgreSQL/migraciones, ni desplegar o fusionar por la aprobación de esta política.


## 8. Activación R1 pendiente de aprobación del propietario

Este apartado concreta el despliegue del control; no concede excepciones ni autoriza merge o protecciones. La autoridad de ROADMAP, DELIVERY_PLAYBOOK e IMPLEMENTATION_GATES indicada en AGENTS.md permanece vigente.

1. Revisar independientemente el SHA final de PR #14 y sus pruebas locales. El bootstrap requiere merge explícitamente autorizado: main todavía no contiene el workflow ni el verificador; no ejecutar código del PR mediante pull_request_target para salvar ese bloqueo.
2. Antes de activar controles, aprobar baseline de los PR abiertos #1, #2, #4, #5, #6, #7, #12 y #14 (inventario 2026-10-24). No existe una excepción automática por fecha, etiqueta o texto del autor. Completar sus fichas o aprobar explícitamente una transición antes de hacer obligatorio el check.
3. Procedimiento de validación tras el merge autorizado: provocar un evento edited mediante actualización real del cuerpo en un PR existente dirigido a main. Verificar en Actions el nombre observado: workflow engineering-policy / job engineering-policy. Registrar SHA, run y contexto exacto antes de configurarlo como required check; seleccionar GitHub Actions como aplicación de origen.
4. El administrador debe mantener un ruleset o protección clásica equivalente para main y las ramas base aplicables feat/b1-*, feat/b2-* y docs/b1-v4-canonical-publication, además de feat/foundation-bootstrap: pull request obligatorio, cero aprobaciones formales adicionales de GitHub (required_approving_review_count=0), descartar aprobaciones obsoletas, auditoría IA independiente del SHA final y autorización expresa del único propietario, conversaciones resueltas, check engineering-policy / engineering-policy obligatorio (usar el contexto real observado), rama actualizada, impedir force-push y borrado, lista de bypass vacía. Verificar también reglas heredadas y protecciones clásicas; no conceder bypass al propietario, administradores o aplicaciones por comodidad.
5. El propietario único autoriza expresamente el merge después de una auditoría IA independiente sobre el SHA final de todos los cambios, incluidos AGENTS.md, esta política, DELIVERY_PLAYBOOK, el TODO, plantilla, verificador y workflows. Registrar SHA, dictamen, pruebas y autorización en el PR; cualquier cambio de SHA exige revalidación y autorización vigente. La auditoría IA no es una review APPROVED de GitHub; no se requiere segundo colaborador, cuentas artificiales ni autoaprobación formal. Este es un control procedimental: el check documental no acredita el dictamen ni la autorización y no impide por sí solo fusionar un cambio que debilite los controles. Las protecciones automáticas siguen siendo obligatorias también para administradores, sin bypass autorizado por esta política.
6. Los PR #12, #7, #6 y #5 tienen bases distintas de main. Hasta que sus bases reciban el mecanismo canónico mediante integración autorizada, no pueden producir este check: registrar el bloqueo, nunca generar un PASS artificial. R1 no autoriza modificar esas ramas ni define su integración (R2).
7. Verificar con autorización y sin abrir otro PR: usar uno existente elegible para main, registrar cuerpo y SHA, demostrar que un cuerpo incumplidor falla y bloquea merge, restaurarlo con ficha válida y comprobar PASS, revisión obligatoria y ausencia de bypass. No fusionarlo para probar el control. Guardar evidencia de la API/UI de merge bloqueado: un FAIL local no demuestra protección remota.

Comprobación 2026-10-24: GET /repos/novo34/cleanops-360/rulesets devuelve []; GET /branches/main/protection devuelve 403 Resource not accessible by integration. Protección clásica no verificable con esta conexión; el propietario debe inspeccionarla con Administration:read. El HEAD inicial del PR solo tiene el check Vercel Preview Comments, sin check de ingeniería. No se ha activado ningún control ni probado bloqueo remoto.


### Formato del control documental R1

El verificador acepta un subconjunto explícito de Markdown: encabezados ATX, etiquetas completas de la plantilla en negrita al inicio de línea, respuestas de prosa con continuación y nueve casillas exactas. En respuestas se admiten URLs literales y código inline con backticks simples emparejados; se rechazan enlaces/imágenes Markdown, referencias, escapes, énfasis y HTML. Las citas no aportan evidencia; los bloques cercados/indentados y HTML se rechazan. La longitud mínima se mide en caracteres alfanuméricos del texto normalizado, nunca en destinos de enlaces o sintaxis oculta. Los ejemplos/logs se enlazan mediante URL literal. Esta restricción evita depender de un renderizador o parser adicional y debe incluirse al aprobar la baseline de PR históricos.

Un PASS documental no autoriza modificar o eliminar controles. El workflow ejecuta el verificador de la rama base confiable mediante refs/heads/base.ref y registra el SHA efectivo con permisos de lectura y nunca el head propuesto, incluso si el PR cambia el propio workflow/verificador. Antes del merge se requiere auditoría IA independiente de todos los cambios sobre el SHA final y autorización expresa del único propietario, particularmente para AGENTS, política, TODO, plantilla, verificador y workflows. No se requieren aprobaciones formales adicionales de GitHub; las reglas mantienen checks obligatorios, descarte de aprobaciones obsoletas y ausencia de bypass. Sin dichas reglas, un cuerpo válido puede acompañar un cambio que debilita controles: no hay protección remota demostrada. El bootstrap y la prueba de rechazo remoto descritos arriba siguen pendientes de autorización y ejecución.

Las continuaciones implícitas de párrafo citado tampoco aportan campos: el dialecto exige una línea en blanco para volver al formulario de nivel superior después de una cita. Esta frontera se cubre con regresiones por cada campo.

El formato estructural del formulario usa únicamente finales de línea LF/CR/CRLF y espacios ASCII o tabulaciones conforme a su dialecto Markdown. Los separadores Unicode/control no pueden fabricar líneas; el espacio Unicode en la prosa de una respuesta no se interpreta como marcador estructural. La baseline preparada en el TODO no es una excepción del verificador ni una autorización de transición: cada PR debe acreditar su propia ficha antes de exigir el check.

### Estado comprobado R1 — 2026-10-25

PR #14 y #15 fusionados; main en 57748ca4d349a170a5e23da733b1b37e065b3e00. El procedimiento inicial de §8.1 ya se ejecutó; se conserva como trazabilidad, no como permiso de nuevos merges. Run 40180793778 / job 121131238671 ejecutó el verificador canónico desde ese SHA y rechazó ocho casillas del PR #1 con salida 1. La API de rama confirma protected=true, engineering-policy obligatorio para everyone y app_id=15368 (GitHub Actions). El propietario aporta confirmación administrativa de strict=true, required_approving_review_count=0, enforce_admins=true, dismiss_stale_reviews=true, required_conversation_resolution=true y force-push/borrado deshabilitados. La integración mantiene 403 al consultar protección detallada: esos detalles se atribuyen a la evidencia aportada, no a lectura administrativa independiente.

C8 y R1 siguen BLOCKED: falta recorrido positivo auténtico, atribución independiente del bloqueo al check y verificación completa de ausencia de bypass. Las bases no-main siguen sin cobertura acreditada. No se cambian protecciones ni se convierte la auditoría IA en aprobación formal. Las referencias históricas del TODO a un segundo revisor quedan sustituidas normativamente por §8.4–5, conservando su valor de registro anterior.
