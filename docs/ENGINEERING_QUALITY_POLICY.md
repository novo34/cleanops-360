# ENGINEERING QUALITY POLICY — CleanOps 360

**Estado:** política propuesta, pendiente de aprobación del Product Owner. **Ámbito:** humanos, Codex, ChatGPT, Claude y demás agentes; código, SQL, UI, fixtures, scripts, workflows e infraestructura. No altera SRS, decisiones aprobadas ni autorizaciones de ejecución.

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

Antes de solicitar merge o declarar TECH-READY:
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

## 8. Ejemplo SQL5-R3 (lección, no aprobación de código)

R1/R2 y R3 son antecedentes auditables, no tres caminos productivos. Un conflicto entre branch guard y revisión autorizada requiere revisar diseño del harness/orquestación canónica; no crear sucesivos wrappers que copien preflight. El nuevo adaptador R3 queda pendiente de evaluación, NO adoptado como solución. Mantener SQL5-R3, autorización y evidencias intactos hasta auditoría específica posterior.

**No levantar** closedBackend, AUTH-GATE-05 ni ejecutar PostgreSQL/migraciones, ni desplegar o fusionar por la aprobación de esta política.
