# CLEANOPS 360 — Especificación funcional y técnica: Gestor de Idiomas y Traducciones

**Estado:** Requisito funcional solicitado y aprobado por Product Owner; diseño derivado **pendiente de su validación D0–D2**.  
**Ámbito:** Plataforma SaaS multi-tenant, administración, UI, PWA/offline, notificaciones y documentos.  
**Trazabilidad normativa existente:** Product Master V3 §109 y SRS V1.1 §29 exigen **DE, ES, EN, IT, PT, SQ**. Esta especificación **complementa**, sin sustituir ni reducir, esa obligación. Se aplican REQ-PR-006/007, aislamiento tenant, default deny, auditoría y gates D0–D6.

## 1. Objetivo y principio de producto

Un administrador autorizado debe poder **crear, importar, exportar, editar, revisar, activar, desactivar y mantener idiomas desde la UI** sin modificar código, reconstruir ni redesplegar el sistema. Los archivos JSON son un formato portátil de intercambio; la fuente operativa de traducciones editables debe estar **persistida y versionada** en el backend, con caché invalidable.

### 1.1 Idiomas y ámbitos

- **Catálogo inicial obligatorio:** alemán (`de`), español (`es`), inglés (`en`), italiano (`it`), portugués (`pt`) y albanés (`sq`). La implementación no puede eliminar los cuatro últimos del alcance normativo. Las traducciones incompletas no se presentarán como completas.
- **Prioridad de experiencia inicial:** alemán y español. La interfaz utiliza el idioma preferido del usuario cuando exista y esté activo; propuesta de idioma de respaldo global: `de` (confirmar en D0 antes de fijar por defecto a todos los tenants).
- **Catálogo de claves de plataforma:** único, versionado, mantenido por desarrollo; contiene identificadores de traducción estables y texto/variables de referencia. Una empresa cliente no puede cambiar las claves estructurales ni las reglas del sistema.
- **Idiomas de plataforma:** creados y gestionados por administradores de plataforma autorizados, disponibles según política global.
- **Idiomas/traducciones de tenant:** cada organización puede activar idiomas permitidos y, cuando se autorice, mantener variantes de traducción propias aisladas. La configuración de una organización nunca afecta a otra.
- **Preferencias:** idioma de usuario guardado; selector accesible en perfil/UI. Idioma de comunicación del cliente y de documentos **independiente** del idioma de la sesión. Debe existir prioridad determinista y respetar autorización tenant.
- **Locales regionales:** códigos BCP 47 validados (`de-CH`, `fr-CH`, etc.), idioma base y variante regional; formato de fecha, número, zona horaria y moneda separados de traducción textual. Para operaciones suizas, moneda y reglas comerciales no se infieren automáticamente del idioma.

## 2. Historias y criterios de aceptación

| ID de diseño | Capacidad requerida | Aceptación observable |
|---|---|---|
| I18N-001 | Ver catálogo | Tabla buscable de idiomas con código, nombre, ámbito, estado, cobertura por módulo, versión y última edición |
| I18N-002 | Crear idioma desde UI | Formulario de nombre + código BCP 47 único por ámbito; crear **borrador persistido**, sin activación automática |
| I18N-003 | Exportar JSON | Descargar plantilla completa de claves activas, por módulo o global, con textos fuente y parámetros de referencia, manteniendo identificadores estables |
| I18N-004 | Importar JSON | Subida con previsualización/diff, validación de esquema, idioma, claves, placeholders, duplicados, tamaño y encoding; errores por fila; **sin aplicación parcial silenciosa** |
| I18N-005 | Editar desde UI | Editor con búsqueda, filtros por módulo/estado, contexto de uso, texto origen y destino; cambios guardados como borrador persistente |
| I18N-006 | Revisar/publicar | Publicación explícita por rol autorizado; cobertura y advertencias visibles; nueva versión atómica, auditable y reversible |
| I18N-007 | Activar/desactivar | Activación por ámbito según permisos, nunca desactivar último idioma de respaldo viable ni romper sesiones abiertas |
| I18N-008 | Preferencia de usuario | Cambiar idioma sin intervención de desarrollo; preferencia persistente y aplicación consistente en navegación, errores y formularios |
| I18N-009 | Nuevas claves | Claves nuevas de un módulo aparecen como «pendientes» sin borrar ni sobrescribir traducciones existentes |
| I18N-010 | Fallback | Para clave inexistente/no publicada, fallback explícito configurable y fiable; nunca exponer una clave técnica al usuario final sin tratamiento de error |
| I18N-011 | Recuperar versión | Historial de actor, fecha y diff; revertir mediante **nueva publicación**, conservando evidencia |
| I18N-012 | Omnicanal | Emails, notificaciones, plantillas y documentos que el módulo admita usan idioma de destinatario/documento; su cobertura se prueba por canal |
| I18N-013 | Seguridad | Aislamiento cross-tenant, permisos por acción, CSRF/autorización, protección de import/export y auditoría de cambios |
| I18N-014 | Offline/PWA | Paquetes publicados disponibles en caché local versionada, actualizables tras reconexión; cambio local no permite editar/publicar traducciones sin autorización vigente |
| I18N-015 | Calidad | Controles automáticos para claves faltantes, sintaxis, variables e import/export round-trip; pruebas UI→API→DB→caché |

Los IDs `I18N-xxx` son **IDs de esta especificación derivada**, no se atribuyen falsamente al SRS V1.1. Promoverlos a requisitos normativos exige revisión documental controlada.

## 3. UX: Administración → Idiomas

### 3.1 Lista
- Acciones permitidas: **Añadir idioma**, **Descargar plantilla JSON**, **Importar JSON**, **Editar traducciones**, **Ver historial**, **Publicar**, **Activar/Desactivar**.
- Columnas: nombre, código, ámbito plataforma/tenant, activo/borrador, cobertura % (con numerador/denominador), pendientes, versión, última modificación y responsable.
- Estados UI obligatorios: loading, vacío, error, acceso denegado, validación fallida, conflicto de edición, operación en progreso, éxito y reintento. Responsive y accesible, navegación con teclado y mensajes localizados.

### 3.2 Alta
- Elegir código validado y nombre legible, base/cultura regional opcionales, idioma fuente y ámbito autorizado.
- Rechazar duplicados o locales no válidos, mostrar impacto y evitar activación de una traducción vacía.
- Resultado persistido como `DRAFT`; descarga inmediata de plantilla para completar.

### 3.3 Exportación
- Botón global o por módulo y opción de `solo faltantes`. Archivo UTF-8, JSON válido, versión de esquema, `locale`, `catalogVersion`, `scope`, `module`, entradas clave→texto y metadatos de contexto separados.
- La descarga de plantilla NO contiene secretos ni datos de clientes/empleados. El texto de referencia y las claves no pueden ser modificados estructuralmente por el traductor.
- Exportación de traducciones propias sujeta a permisos `export` y auditoría.

### 3.4 Importación
- Validar antes de escribir: tipo/tamaño, profundidad máxima, JSON malformado, esquema, locale/ámbito, claves desconocidas, faltantes, duplicadas, tipos inválidos, etiquetas HTML/links peligrosos, variables/interpolación/plurales y control de acceso.
- Mostrar `añadidas / modificadas / sin cambios / omitidas / errores` con lista descargable; por defecto importar a **borrador**; nada se publica automáticamente.
- Si cambia `catalogVersion`, avisar y presentar diferencias; no eliminar claves faltantes del archivo sin confirmación explícita. Atomicidad de importación por conjunto: error bloqueante implica no aplicar cambios.
- No ejecutar contenido JSON como código ni permitir rutas de archivos, URL externas o expresiones arbitrarias mediante interpolación.

### 3.5 Edición directa
- Buscador por clave o texto; filtros por módulo, estado y falta de traducción.
- Campos con texto de referencia, contexto, notas y placeholders protegidos; vista previa del resultado con datos sintéticos.
- Guardado como borrador, validación en línea, control optimista por `revision/ETag`, aviso de conflictos y resolución explícita. No sobrescribir silenciosamente ediciones simultáneas.

### 3.6 Publicación y reversión
- Enlace claro `Guardar borrador` ≠ `Publicar` ≠ `Activar idioma`.
- Validar cobertura y campos críticos. Política de cobertura mínima y reglas de excepción deben acordarse en D0; jamás declarar 100 % si faltan claves.
- Snapshot inmutable publicado; invalidación de caché; observabilidad de versión activa. Reversión crea nueva versión de publicación auditable, no borra historial.

## 4. Contrato JSON conceptual (no impone endpoint)

```json
{
  "schemaVersion": "1",
  "locale": "fr-CH",
  "catalogVersion": "2026.10",
  "scope": "tenant",
  "module": "common",
  "translations": {
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.items_count": "{count, plural, one {# élément} other {# éléments}}"
  }
}
```

- El ejemplo ilustra el contenido del archivo de intercambio; el contrato final debe validarse en D2. El catálogo de referencia/contexto puede enviarse en campo separado o archivo compañero, **sin que el importador acepte modificaciones a identificadores**.
- Claves con namespace por módulo (`common.save`, `crm.opportunity.status`, etc.); IDs estables, no reutilizar significado de una clave. Claves obsoletas se marcan `deprecated` y se eliminan solo por migración revisada.
- Interpolación segura mediante un **formato estandarizado** elegido en D2 (por ejemplo ICU MessageFormat), con igualdad de nombres/tipos de variables frente al texto fuente. Escape seguro por canal; no renderizar HTML arbitrario.
- Determinar límites de tamaño, profundidad, número de claves y rate limits al cerrar contratos y threat model; rechazar archivos excesivos y registrar intentos fallidos.

## 5. Modelo lógico mínimo (propuesta para D2, no crear tablas anticipadamente)

- `translation_keys`: `key`, `module`, `sourceText`, `description`, `requiredParameters`, `status`, `catalogVersion`.
- `languages`: `locale`, `displayName`, `baseLocale`, `scope`, `tenantId?`, `lifecycleStatus`.
- `translation_drafts`: idioma, clave, texto, ámbito, revisión y autor; control de concurrencia.
- `translation_releases`: versión publicada, idioma, ámbito, fecha, actor, hash y estado.
- `translation_release_entries`: snapshot de claves y textos publicados por release.
- `language_preferences`: referencia a usuario + tenant, locale seleccionado; permisos e historial donde proceda.
- `audit_logs`: reutilizar el sistema transversal; evento con antes/después redacted, actor, tenant, correlación y resultado.

Los nombres son ilustrativos; diseñar relaciones, índices, RLS/políticas y API solo al implementar el slice con consumidor real. No introducir repositorios duplicados de traducción incompatibles. El catálogo de claves puede generarse de recursos versionados, mientras las traducciones administrables y los releases persisten de forma central.

## 6. Reglas de resolución, autorización y consistencia

1. Solicitud incluye contexto autenticado de `tenantId` y usuario. No confiar en `tenantId` recibido de clientes sin validación server-side.
2. Resolver idioma explícito autorizado → preferencia de usuario activa → idioma base tenant → fallback plataforma. El orden definitivo y el fallback global se ratifican en D0.
3. Para cada texto, usar traducción publicada del tenant → publicación global autorizada → fallback de locale base → idioma respaldo con mensaje registrado de falta; **ningún borrador se muestra a usuarios finales**.
4. Sólo administradores con `manage_languages` o permisos granulares `view/import/export/edit/publish/activate` pueden operar; explicit deny prevalece. Plataforma y tenant tienen permisos separados; sólo actores autorizados publican alcance global.
5. Auditoría obligatoria para alta, importación, edición, publicación, reversión, activación y exportación, sin registrar datos sensibles innecesarios.
6. Caché segmentada por `tenantId`, idioma, ámbito, módulo y release. Invalidez atómica tras publicar y estrategia de TTL/version cuando falla la comunicación; no servir traducciones de otro tenant.
7. Administrar traducciones **no** modifica reglas de negocio, permisos, importes, obligaciones legales ni datos operativos; plantillas comerciales contienen variables tipadas que no se pueden eliminar/modificar.
8. En PWA, conservar última release válida por tenant/locale; sincronizar nueva versión sin perder datos offline. No asumir disponibilidad de internet.

## 7. Pruebas obligatorias / evidencia de aceptación

- Alta `fr-CH` desde UI → respuesta backend → persistencia → aparece en catálogo tras refrescar/relogin; no aparece aún en selector si no se activa.
- Exportar plantilla completa y `missing only`; importar JSON válido; comprobar diff; editar una palabra en UI, guardar borrador, publicar y verificar que otro usuario ve el texto correcto sin rebuild.
- JSON malformado, locale divergente, duplicados, campos sorpresa, claves desconocidas, claves faltantes y placeholder/plural incorrecto: errores precisos, sin escrituras parciales.
- Cargar payload de HTML/script en texto; comprobar escape por canal y ausencia de XSS/ejecución.
- Dos administradores editan misma clave: ETag/versión detecta conflicto, sin pérdida silenciosa.
- Aislamiento tenant: lectura, escritura, publicación, exportación, caché e importaciones cross-tenant denegadas y auditadas.
- Actor sin permisos, DENY explícito, sesión expirada/MFA cuando proceda: rechazo backend aunque UI se manipule.
- Borrador no visible; publicación visible sin reinicio; reversión restaura traducciones previas dejando rastro.
- Fallback para clave ausente, idioma desactivado, locale variante y seis idiomas iniciales. Texto de errores en UI, email y documento se comprueba cuando cada canal esté implementado.
- Pruebas de regresión de nuevas claves/módulos, versiones, pluralización, variables, rendimiento y recuperación offline. Validar CI y navegador real contra API/DB, no mocks como prueba de aceptación.

**Matriz mínima REQ (diseño) → UI → servicio/persistencia → test:** I18N-001/002/003/004/005/006/007/008/009/010/011/012/013/014/015 deberán rastrearse individualmente en el dossier del slice y gates D0–D6. Prohibido declarar `ACCEPTED` con tests únicamente unitarios o sin verificación de aislamiento.

## 8. Roadmap y entregas verticales

- **Foundation (Fase 0):** establecer la estrategia de catálogo, namespaces, render seguro, contrato de adaptador i18n y arquitectura para disponibilidad multiidioma; no generar masivamente tablas o endpoints del gestor sin usuario real. La vista bootstrap no implica que el módulo de Administración esté terminado.
- **Primer slice funcional autorizado de administración (fase concreta a asignar en D0 según dependencias de autenticación/RBAC):** UI Idiomas + alta + persistencia + exportación/importación JSON + edición + borrador/publicación + activación + preferencia, con permisos/auditoría y E2E completos. Puede dividirse en slices menores pero cada uno tendrá UI→backend→datos y pruebas reales.
- **Cada fase posterior:** registrar claves de módulos nuevos, traducir DE/ES prioritariamente y mantener explícitas las seis lenguas normativas. Completar canal de email/documentos al entregarse ese módulo; no afirmar que un canal no implementado está traducido.
- **Fase de cierre:** certificación de cobertura por idioma/módulo/canal; añadir idioma nuevo sin tocar código y corregir traducción en UI sin redespliegue son pruebas de aceptación obligatorias.

## 9. Decisiones pendientes (D0/D2; no suponer aprobadas)

- Ámbito exacto de **creación de nuevos idiomas** por administrador de tenant frente a administrador de plataforma.
- Política de activación/cobertura mínima por módulo, fallback global exacto y procedimiento de aprobación de traducciones.
- Roles/step-up concretos, límites de importación y duración de retención/versionado.
- Formato definitivo de interpolación/plurales y política de recursos legalmente vinculantes.
- Ubicación de menú/terminología y fase concreta del primer slice, conforme a dependencias RBAC.

Estas decisiones **no bloquean documentar ni preparar la infraestructura i18n**; sí deben resolverse antes de programar los comportamientos correspondientes. No modificar Product Master/SRS antiguos silenciosamente: una ratificación normativa será versionada, con trazabilidad y revisión independiente.
