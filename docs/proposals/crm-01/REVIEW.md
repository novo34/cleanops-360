# CRM-01 — candidato de empresas y contactos

Estado: IN_DEVELOPMENT / BLOCKED para integración y aceptación. PROPUESTO, no aprobado.
Base remota comprobada por GitHub y fetch: main `4f19c36f8eda2c846c6e3c7164814f26841b3bce`.
El checkout inicial `4c625d2fb1f654fdfcabb751a4f63e5234fd9154` estaba dos commits detrás; únicamente difería el caller de AUD-031. Rama creada desde main actual. No se ha repetido la sonda.

## QG-0 registrado antes de escribir

Objetivo observable: alta, listado/búsqueda, ficha y edición de empresas y varios contactos en el consumidor privado, reutilizando la presentación existente. REQ-CRM-001/002/003 parciales (sin borrado), REQ-CRM-004 y REQ-COM-001 parciales. Ni CRUD completo ni fase 3 aceptada. Excluidos import/export, comunicaciones, Radar, oportunidades, ofertas, Planning y facturación SaaS.

Flujo candidato: `/crm/empresas` y `/crm/clientes` → contrato aditivo `/auth/crm/*` → `handleAuth` → B1 (sesión del servidor, CSRF, validación, reserva propia y transacción) → `crmRecord` → broker parametrizado → funciones SQL candidatas → catálogo de recursos/effective_access y datos/auditoría en la misma transacción. El runtime conserva closedBackend. Company es registro comercial dentro del tenant; nunca organization ni identidad.

Inventario y decisión:

- Inspeccionados `components/demo/workspace.tsx`, `operations-map.tsx`, `app/demo/[[...section]]/page.tsx`, `app/demo/layout.tsx`, `demo.css`, `themes.css`, `lib/demo/model.ts`: reutilizar estilos y extraer únicamente la fila de empresa. Mantener fixtures y preferencias visuales fuera de CRM. No copiar el workspace/mapa ni convertir Company.contact en modelo de datos.
- Inspeccionados `lib/b1/runtime.ts`, `service.ts`, `contracts.ts`, `approved-backend.ts`, `v4-broker.ts`, `pg-identity-driver.ts`, `lib/b2/users.ts`, `user-changes.ts`, `access.ts`: extender transporte/contrato/broker actuales; no segundo evaluador, login, transacción, journal ni runtime setter.
- Inspeccionados `scripts/trusted-migrations.mjs`, `scripts/b2-real-browser-server.mjs`, `scripts/b2-browser-backend.ts`, `scripts/b2-directory-postgres.py`, sus consumidores/workflows y e2e B2; no duplicar runner ni alterar paquetes históricos/autorizaciones/allowlist.
- Consultados Master V3, SRS §§6–7 y requisitos transversales, ROADMAP fase 3, DELIVERY_PLAYBOOK, IMPLEMENTATION_GATES, DATA_MODEL §4.2, RBAC_PERMISSIONS, política y documentación canónica B1 V4, registro de recuperación y ejecución secuencial. Registros históricos no sustituyen la autorización actual: R0–R3 no se reabren, PR23 sigue DRAFT, B1/B2 no se cierran; AUD-031 integral, R4 y SQL5 nativo no se declaran completos.

Archivos nuevos, todos PROPUESTOS y bajo dueño técnico CRM (revisión/aceptación PO):

| Archivo | Consumidor y prueba | Razón de creación |
|---|---|---|
| `components/company-row.tsx` | demo y CRM; regresión demo navegador | Extracción mínima de presentación sin acoplar CRM al proveedor de fixtures |
| `components/crm-workspace.tsx` | página privada; e2e boundary | Ningún formulario privado de empresas/contactos existe; no duplicar AuthPanel ni UsersDirectory B2 |
| `app/crm/[view]/page.tsx`, `crm.css` | ambos directorios; e2e boundary | Consumidor privado único con adaptación de formulario; estilos base reutilizados |
| `app/auth/crm/{companies,company,change}/route.ts` | UI privada; pruebas de ingress/boundary | Entradas Next concretas que delegan íntegramente en handleAuth |
| `lib/crm/http.json`, `model.ts` | validación/UI; pruebas de contrato | Contrato aditivo y tipos de múltiples contactos distintos de Company demo/B2 |
| `lib/crm/records.ts` | backend B1; unitarias CRM | Dispatch mínimo del módulo; no implementa identidad/ACL/transacción |
| `tests/b1/crm-records.test.ts` | suite offline B1 | Propiedades nuevas: rechazo autoridad, respuestas ajenas, validación, cierre |
| `e2e/crm-boundary.spec.ts` | Playwright existente | Denegación real en navegador sin fixtures CRM |
| `docs/proposals/crm-01/schema.review.sql` | revisión PO; ensayo futuro | Datos/fuentes/supresión CRM no existen en B1/B2; fuera del runtime/migraciones |
| Este dossier y `trial-request.json` | revisión PO; hashes verificables | Contrato de decisiones, evidencia y alcance de ensayo sin reutilizar autorización histórica |

Diff mínimo: modificar únicamente composición B1, inventarios/tests afectados, script de suite offline y fila demo extraída. Sin retiradas. Revertir la rama revierte código; no se han instalado datos ni ACL que requieran rollback operativo.

Riesgos: vinculación de organizaciones/flags aún no aprobada; grants de companies y contacts pendientes; SQL/ACL sin compilar ni ejecutar; CAS, atomicidad, aislamiento, supresión y concurrencia requieren PG real. No elevar fixtures o modelos de transacción unitarios a prueba de esas propiedades. Sin datos privados, secretos ni almacenamiento CRM en navegador.

Pruebas previstas antes de CI: lint, typecheck, Vitest, B1 offline, B2 sin DB, Chromium para demo y cierre privado. Ensayo PG y activación requieren autorización distinta. No construir contenedores ni ejecutar servicios PostgreSQL/OpenBao.

## Contrato mínimo candidato

Rutas propuestas nuevas, no endpoints históricos aprobados: GET `/auth/crm/companies` (`search`, `clients_only=true`, `after`), GET `/auth/crm/company` (`company_id`), POST `/auth/crm/change`. Los dos directorios consultan las mismas tablas; clientes es filtro relation=Cliente.

POST exige CSRF e Idempotency-Key B1. Operaciones CREATE_COMPANY, EDIT_COMPANY, CREATE_CONTACT, EDIT_CONTACT; sin delete. La edición exige company_id, expected_version y motivo; contactos también versionan la empresa bajo bloqueo de fila. Validación estricta rechaza actor, tenant, rol de usuario y campos extra. Los roles de contacto son exclusivamente los ocho de REQ-CRM-004, no roles RBAC.

ContactCompliance conserva los nueve campos de REQ-COM-001; timestamps de observación/verificación son declaraciones del usuario, el de No contactar lo deriva el servidor. Base jurídica y estado de privacidad son texto registrado, no catálogos legales aprobados ni autorización de comunicaciones. La marca No contactar no se puede levantar mediante esta slice. Candidato propone supresión por email lower/trim y tenant, conservada al cambiar email y derivada al consultar otros contactos con el mismo identificador. Esa normalización y política conservadora necesitan revisión explícita; no se adjudica una base jurídica.

La respuesta de cambio solo entrega id/versión. Se reutiliza la reserva B1 con one_time_result: un reintento después del commit recibe RESULT_NOT_REPLAYABLE (409), nunca vuelve a ejecutar el efecto ni guarda PII en el journal. Ante respuesta perdida, la UI mantiene la clave para el mismo payload. 409 obliga a recargar/reconciliar: no se reintenta automáticamente con versión nueva. La recuperación asistida de un alta cuyo resultado se perdió está pendiente (búsqueda/recarga; no prometer replay de resultado).

## Decisiones exactas pendientes y frontera de activación

1. Aprobar contrato, catálogo `companies`, acciones view/create/edit, alcance y matriz rol/recurso/acción; `contacts` ya es recurso normativo pero no concede grants. Aprobar políticas de lectura de contacto/creación y visibilidad de edición por recurso. Ningún ALLOW de usuario o rol se inserta en el candidato.
2. Aprobar SQL/ACL, incluida ampliación INSERT sobre app.access_resources al broker. No modificar contratos/SQL históricos. No instalar el candidato por descubrir un archivo ni añadirlo a trusted-migrations.
3. Aprobar cómo la organization_id de public.feature_flags se vincula con el tenant B1 app.organizations y qué clave identifica CRM. Las entidades tienen esquemas y fuentes de identidad distintas. No suponer igualdad por UUID. Aprobar bloqueo/consistencia de desactivación durante mutaciones y reintentos. No es un sistema comercial de entitlements; sin planes/precios inventados.
4. Hasta esa decisión `identity_private.crm_module_guard()` DENIEGA todas las operaciones, aun con grants. No hay setter ni flag que instale identidades/grants. Datos se conservarían al desactivar; la denegación debe estar en servidor, antes de leer o mutar. El guard deberá reemplazarse en el mismo candidato, revisarse y volver a hashearse antes de probar el camino positivo: los bytes actuales solo permiten ensayo de denegación.
5. Revisión SQL de defensa en profundidad antes de ejecución: validaciones de todos los campos compliance/tipos/fechas/keys directamente en SQL, catálogo de privacidad/base jurídica si el PO lo define, auditoría detallada de cambios y denegaciones, tamaño máximo del agregado y límites de contactos. El servidor TS ya valida, pero eso no certifica la superficie SQL interna. No presentar este candidato como listo para instalar.

## Casos de integración/E2E real preparados, NO ejecutados

Usar el transporte TLS/socket del harness B2 existente, bajo nueva autorización exacta y sin habilitar paquetes históricos como atajo. Preparar extensión canónica de su inventario y allowlist de operaciones; sus hashes actuales no autorizan CRM. No se crea otro runner.

| Caso | Preparación y operación | Evidencia exigida tras recarga/commit |
|---|---|---|
| 1 | Tenant A, grant aprobado: crear empresa; añadir contactos con roles Facility Manager y Einkauf mediante UI | GET tras nueva página/nueva transacción devuelve empresa y ambos contactos, versiones 1/2/3 |
| 2 | Leer versión 3, editar nombre y contacto con motivo | Versión aumenta una vez por operación; actor/tenant/correlación y antes/después correctos en audit_logs |
| 3 | Buscar nombre de empresa y nombre/email de segundo contacto; repetir en Clientes | Misma identidad de empresa; sin duplicación ni coincidencias sobre contactos no visibles |
| 4 | Marcar No contactar; recargar; consultar otro contacto con mismo email; cambiar email | Marca/timestamp servidor y supresión por tenant conservadas; intento de levantar marca denegado |
| 5 | Sesión tenant B sobre id de A, GET lista/ficha y POST las cuatro variantes | Sin filas ajenas, 404/denegación uniforme; cero mutaciones/auditoría de éxito en A |
| 6 | Sin grant, con ALLOW, luego DENY explícito, grant vencido y recurso delegado | Reutiliza effective_access; DENY prevalece para lectura/edición y contactos; UI y API coherentes |
| 7 | Segundo contacto inválido, roles fuera de catálogo, authority extra, email/fecha inválidos | 422 antes de efecto HTTP; SQL directo también deniega; sin filas/auditoría de éxito parciales |
| 8 | Dos conexiones simultáneas editan misma expected_version | Solo un ganador; 409 al segundo; contenido/versión/auditoría únicos, sin overwrite silencioso |
| 9 | Dos envíos simultáneos de clave/payload idénticos; luego payload distinto con misma clave | Una sola creación/edición; 409 no replay/mismatch según journal; una auditoría de éxito |
| 10 | Fallo real en escritura de auditoría y fallo real de COMMIT, luego retry | Datos, recursos, supresión, versión y reserva revierten juntos; retry controlado produce un único efecto |

Añadir prueba de módulo ausente/desactivado con grant válido: lista/ficha/mutación denegadas y datos conservados. La prueba positiva está BLOCKED por decisiones y bytes pendientes; no usar fixtures en /demo ni simular respuesta API para aceptación.

## QG-1 / QG-2 / QG-3

Una fila de presentación, un contrato CRM aditivo, un dispatch B1, un broker parametrizado, un candidato SQL. Sin nuevo evaluador, runner, sesión ni fuente de datos de Clientes. Revisar inventario con git diff; ninguna allowlist o protección modificada.

Evidencia final y solicitud se registran en trial-request.json. FAIL iniciales conservados allí; correcciones en origen: inventarios de operaciones/broker ampliados sin tocar contratos históricos, fixture HTTP añadió Sec-Fetch-Site exigido por B1, suite CRM se colocó en tests/b1 conforme al runner canónico, lint eliminó import sin consumidor y sincronizó carga asíncrona. npm ci necesitó cache bajo /tmp por permisos del entorno; sin cambio de lockfile.

QG-3 no permite afirmar seguridad transaccional/DB probada ni slice aceptada. No abrir PR con declaraciones C1–C9 falsas: falta evidencia real de multi-tenant/concurrencia/idempotencia/atomicidad y revisión independiente del SHA final. Entrega local revisable; borrador remoto pendiente de satisfacer política, no se marca COMPLETE/READY_FOR_USER_TEST/ACCEPTED. No merge, deploy, cierre B1/B2 o reapertura R0–R3.

## Ampliación QG-0 — internacionalización CRM (antes de ampliar frontend)

Solicitud adicional del propietario: localizar íntegramente el incremento CRM en de/es/en/it/pt/sq; no iniciar gestor de idiomas. Inventario con rg en app/lib/components/package y nombres i18n/locale/translation/language: no existe catálogo/resolución compartida en main. RootLayout fija lang=es; AuthPanel, directorios B2 y demo tienen textos y formatos españoles. Esta deuda anterior se registra y se conserva sin refactor masivo.

PR #2 consultado en GitHub: abierto, DRAFT, merged=false, head 07952283ad55c2dff164644cbd86cad4ee6bc739; propuesta documental, no implementación ni aprobación integral. Sus cuatro P1 (autoridad, ownership, CAS de publicación, permisos) siguen fuera de CRM. No se implementan publicación/import/export/administración, tablas, grants, servicios, caché tenant ni fallback de ese PR. Francés sigue limitado a documentos comerciales DE/FR/IT según su alcance; no se añade a la UI.

PROPUESTOS compartidos, dueño técnico frontend/i18n y revisión PO: lib/i18n/catalogs/{de,es,en,it,pt,sq}.json, lib/i18n/index.ts (claves/variables tipadas, interpolación de texto y plurales Intl), lib/i18n/resolve.ts (resolución pura servidor/cliente y formatos explícitos), scripts/check-i18n.mjs (AST antes de JSON.parse y cobertura de referencias/textos nuevos), tests/i18n.test.mjs. Consumidores concretos: CrmPage, CrmWorkspace, su formulario y e2e CRM; pruebas de catálogo/idioma y typecheck. Crear estos archivos es necesario porque no existe punto canónico que extender; no mezclar recursos con contratos B1 ni fixtures demo. No son temporales ni un segundo motor de traducción: base versionada única ampliable por namespaces, compatible con futura publicación revisada sin anticipar su persistencia.

Modificar solo frontend nuevo CRM, su contrato/modelo/candidato de datos nuevos para códigos de negocio estables y las pruebas afectadas. CompanyRow seguirá recibiendo etiquetas de presentación: su consumidor demo conserva textos históricos. No traducir nombres/emails/procedencias/bases jurídicas/estados de privacidad introducidos por usuario. Códigos de relación/roles se separan de etiquetas traducidas; errores se resuelven por códigos/status, nunca por texto de backend.

Resolución mínima: parámetro de idioma explícito soportado; en su ausencia, negociación Accept-Language entre los seis idiomas. Si no hay coincidencia o el explícito es inválido, selección con autónimos; ningún idioma global de respaldo. El servidor entrega locale al cliente, navegación conserva la selección y el contenedor CRM declara lang. Formato regional es un argumento separado, timezone de datos se fija explícitamente a UTC, no se infiere moneda del idioma. Sin nuevas preferencias persistidas ni cookies de identidad.

Verificaciones: claves tipadas y análisis de referencias; exactitud de conjuntos de claves, vacíos, duplicados del texto JSON antes del parser, placeholders/tipos/plurales; AST del incremento UI contra literales fuera del catálogo con excepciones explícitas de marca/autónimos/datos; tests negativos del verificador; cambio de idioma, textos extensos y responsive en navegador. Una traducción ausente falla aunque otro idioma tenga texto. Traducciones iniciales de ingeniería no equivalen a aceptación lingüística del PO/nativo. Riesgo y gate: ampliar cobertura comprobable sin declarar completos idiomas o pantallas históricas.


### Resultado de la ampliación y revisión del diff

76 mensajes por idioma en common/crm; cobertura técnica exacta 76/76 para de/es/en/it/pt/sq, sin traducciones vacías y sin fallback por clave. Esto no declara un idioma completo ni aceptación lingüística: revisión humana de terminología y calidad aún pendiente. Los seis catálogos son recursos de código compartidos, no registros globales sin tenant ni un servicio administrable. Los placeholders tipados y sus tipos tienen una sola declaración canónica consumida por el runtime y por el comprobador.

Los códigos nuevos de relación son PROSPECT y CUSTOMER; los ocho roles son BAULEITER, PROJEKTLEITER, FACILITY_MANAGER, OBJEKTLEITER, EINKAUF, BAUMANAGEMENT, ADMINISTRATION y MANAGEMENT. Corresponden en orden a las ocho funciones normativas de REQ-CRM-004; las etiquetas están en el catálogo. No se migraron datos ni se alteró Company demo. Las bases jurídicas, solicitudes de privacidad y demás texto del cliente siguen siendo datos libres registrados, nunca etiquetas traducidas ni permisos.

La lista candidata usa proyección mínima de 10 empresas (nombre del primer contacto visible y conteo de contactos visibles), en vez de cargar todos los datos compliance de todos los contactos en cada fila. La ficha conserva múltiples contactos; se mantiene un límite de tamaño explícito de respuesta que requiere revisión y prueba PG con valores máximos. La marca de supresión se conserva al editar desde formulario y su ayuda está localizada. La semántica nueva de códigos y esta proyección cambian únicamente los artefactos CRM propuestos; requieren la revisión de sus hashes antes de ejecutar.

PROPUESTO adicional: tests/crm-i18n.test.ts, dueño frontend/CRM, consumidor Vitest existente; prueba los formularios reales en seis idiomas y conserva nombres, email y datos del usuario, sin crear un harness de identidades. No es prueba API/DB. PROPUESTO verification.txt, dueño CRM/revisión PO: evidencia de salida ejecutada con comandos y hashes en trial-request.json, fuera del runtime. No contiene datos reales ni secretos.

El selector usa el locale resuelto por servidor y el contenedor lo declara con lang; conserva idioma al navegar entre Empresas y Clientes, conserva datos de formulario/búsqueda al cambiar idioma y mantiene el format locale explícito. Las fechas se muestran en UTC mediante Intl y formato regional separado; CRM no usa moneda ni infiere una por idioma. Las validaciones del formulario usan catálogo y atributos accesibles en lugar de mensajes nativos dependientes del idioma del navegador. RootLayout y páginas anteriores mantienen su deuda lang/textos/formatos; la base nueva no los presenta como localizados.

Regresiones iniciales de navegador conservadas como FAIL de diagnóstico: selector de alertas ambiguo por herramientas dev, filtro Planning interaccionado durante hidratación dev, carga dinámica del módulo i18n incompatible con el transformador CJS del runner y desbordamiento real de navegación alemana a 390 px. Correcciones en origen: scope main en la aserción, compilación local de producción sin tocar CSP, import estático en el test, flex-wrap/min-width/ajuste de texto en CSS privado. Los resultados finales se separan de esas ejecuciones y nunca se presentan como evidencia positiva de DB.

PROPUESTO lib/i18n/parameters.ts (dueño frontend/i18n; consumidores runtime, comprobador y sus tests): extrae únicamente la declaración canónica de variables/tipos. Es necesario que el comprobador no importe los catálogos JSON indirectamente antes de comprobar duplicados en sus bytes originales. Extender index.ts con otra lectura duplicaría la declaración o ejecutaría el parser prematuramente; no se crea otro catálogo ni motor.


### Evidencia final local

Implementación fijada en 33b513e574fb55e0140c500cd23e2181e40ef0e3. PASS: lint (una advertencia histórica AuthPanel), typecheck, build local, B1 offline 250, B2 sin DB 34, Vitest 22 e i18n 8. Navegador Chromium: 14 casos distintos (demo y cierre CRM); los cuatro CRM se revalidaron sobre el build final tras extraer la declaración de variables. SKIP: tres integraciones PostgreSQL históricas de system-status, los diez casos reales CRM, Firefox/WebKit, revisión lingüística humana y revisión independiente final. FAIL final: ninguno de los controles locales ejecutados; los FAIL de diagnóstico previos se conservan diferenciados. Evidencia de salida ejecutada en verification.txt; bytes, hashes, dependencias, datos sintéticos, operaciones, aislamiento, limpieza y bloqueos en trial-request.json.

Solicitud aislada todavía no ejecutable para el camino positivo: los bytes actuales deniegan CRM y el harness histórico no tiene paquete CRM aprobado. No se inventan un comando, fixture aprobado ni permiso para sortear su guard. La decisión de flags/grants y la revisión de defensa SQL deben producir un bundle nuevo, completo y hasheado antes de pedir autorización de ejecución. No se ha realizado push ni abierto PR con casillas QG-3 falsas. El borrador remoto y aceptación permanecen pendientes de sus gates.
