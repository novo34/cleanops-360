# CLEANOPS 360 — RBAC PERMISSIONS

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Política obligatoria
`deny-by-default`, `explicit deny` prevalece y tenant isolation no admite bypass. Los roles son plantillas, no barreras fijas de asignación.


## Evaluación

1 validar autenticación/sesión; 2 tenant y pertenencia; 3 recurso y relación; 4 restricciones legales/sistémicas; 5 explicit deny en cualquier ámbito; 6 permisos base de rol y grants por recurso/usuario/tiempo; 7 decisión + auditoría en acciones sensibles.


## Roles

Super Admin, Company Admin, Sales, Planner, Project Manager, Site Responsible, Visitor, Employee, Finance y Viewer; limitar cada acción a su necesidad. No inventar matriz exacta: permisos finos por endpoint se elaboran al diseñar el slice y se comprueban en API.


## Scopes

Tenant, módulo, WorkEngagement, proyecto, documento, plano, oferta, finanzas y datos de empleados. Temporal start_at/expires_at; expiración automática y revocación.


## Pruebas

Negative tests de IDOR y cross-tenant, grants temporales vencidos, conflicto deny/grant, roles cambiados durante sesión, recurso movido entre ámbitos y bitácora de cambios.

## Matriz de evaluación de autorizaciones — contrato de especificación

Las 7 acciones normativas de `REQ-AUTHZ-001` aplican a cada recurso enumerado. Esta es una **matriz de decisión obligatoria de diseño**, no una concesión masiva de permisos.

Leyenda precisa: `POL` = evaluar política efectiva (rol, tenant, ámbitos, grants, `explicit deny`, fecha, owner, separación de funciones y step-up); `N/A` = acción no expuesta en ese recurso; `DENY` = denegado. **POL no significa autorización**: si no existe grant vigente y autorizado, resultado DENY. No se permiten celdas ambiguas `A (si permiso)`, `A (si delegado)` ni `R/solicitar`.

Orden de evaluación para toda celda POL: autenticación → aislamiento tenant → prohibiciones legales/plataforma → explicit deny → acción+ámbito del permiso positivo → step-up cuando proceda → registro auditado. Cada endpoint debe implementar la misma decisión que la UI (UI oculta/deshabilita, API deniega). Super Admin no puede sortear el aislamiento de tenant; Visitor sin invitación activa queda denegado.

### Tabla recurso × acción (aplicación obligatoria para los 10 roles)

| Recurso | view | create | edit | approve | delete | export | manage_permissions |
|---|---|---|---|---|---|---|---|
| `users` | POL | POL | POL | POL | POL | POL | POL |
| `access` | POL | POL | POL | POL | POL | POL | POL |
| `contacts` | POL | POL | POL | POL | POL | POL | POL |
| `project_candidates` | POL | POL | POL | POL | POL | POL | POL |
| `opportunities` | POL | POL | POL | POL | POL | POL | POL |
| `offers` | POL | POL | POL | POL | POL | POL | POL |
| `work_engagements` | POL | POL | POL | POL | POL | POL | POL |
| `projects` | POL | POL | POL | POL | POL | POL | POL |
| `staffing_requirements` | POL | POL | POL | POL | POL | POL | POL |
| `employees` | POL | POL | POL | POL | POL | POL | POL |
| `absences` | POL | POL | POL | POL | POL | POL | POL |
| `planning` | POL | POL | POL | POL | POL | POL | POL |
| `timesheets` | POL | POL | POL | POL | POL | POL | POL |
| `rapports` | POL | POL | POL | POL | POL | POL | POL |
| `invoices` | POL | POL | POL | POL | POL | POL | POL |
| `contracts` | POL | POL | POL | POL | POL | POL | POL |
| `documents` | POL | POL | POL | POL | POL | POL | POL |
| `compliance` | POL | POL | POL | POL | POL | POL | POL |
| `security.events` | POL | N/A | N/A | N/A | N/A | POL | POL |
| `security.incidents` | POL | N/A | N/A | N/A | N/A | POL | POL |
| `security.revoke_sessions` | POL | N/A | N/A | POL | N/A | N/A | POL |
| `audit_logs` | POL | N/A | N/A | N/A | N/A | POL | POL |
| `settings` | POL | POL | POL | POL | POL | POL | POL |


### Tabla de roles (se aplica a todas las filas anteriores)

| Rol | Tenant/scope y principio de autorización | Datos especialmente sensibles |
|---|---|---|
| Super Admin | POL sujeto a ámbito, recurso y grant explícito | Administración de plataforma bajo separación de funciones; no bypass cross-tenant. |
| Company Admin | POL sujeto a ámbito, recurso y grant explícito | Solo tenant asignado; administración sujeta a step-up. |
| Sales | POL sujeto a ámbito, recurso y grant explícito | Comercial y contactos delegados; sin datos de salud, payroll o cuentas. |
| Planner | POL sujeto a ámbito, recurso y grant explícito | Planificación, disponibilidad necesaria y asignaciones; minimización de datos. |
| Project Manager | POL sujeto a ámbito, recurso y grant explícito | Proyectos asignados y contratos si tiene grant específico. |
| Site Responsible | POL sujeto a ámbito, recurso y grant explícito | Turnos y personal a cargo únicamente. |
| Visitor | POL sujeto a ámbito, recurso y grant explícito | Acceso de invitación explícita, limitado en tiempo/recurso. |
| Employee | POL sujeto a ámbito, recurso y grant explícito | Datos propios y turnos asignados; auto-servicio acotado. |
| Finance | POL sujeto a ámbito, recurso y grant explícito | Facturas/pagos aprobados; segregación de funciones. |
| Viewer | POL sujeto a ámbito, recurso y grant explícito | Lectura de recursos expresamente compartidos; no exportación por defecto. |


### Acciones especializadas (no se confunden con las siete acciones CRUD básicas)

- `security.events.view`, `security.incidents.view`, `security.revoke_sessions`, `security.permissions.manage`, `security.audit.export`: DENY por defecto; acceso individual con ámbito y step-up para revocaciones/exportaciones.
- `project_candidates.promote`, `offers.accept`, `work_engagements.create_from_won`, `planning.publish`, `rapports.approve`, `invoices.issue`, `compliance.activate_rule_version`: comprobaciones explícitas de permiso especializado y estado; no derivan automáticamente de `edit`.
- `employee.absence.request` y `employee.absence.approve`: permisos diferentes y sin autoaprobación salvo política explícita permitida.

### Criterios mínimos verificables

Para CADA rol × recurso × acción válida: probar sin grant DENY; con grant limitado permitir solo scope; explicit deny prevalece; cross-tenant siempre DENY; grant expirado DENY; acción sensitive exige step-up; cambios de permisos se auditan. La matriz ejecutable de concesiones concretas queda **pendiente de aprobación de cada vertical slice**; hasta entonces las celdas POL **no conceden nada**.


## Registro de permisos especializados propuestos para conciliación

Los siguientes nombres NO conceden acceso a ningún rol. Requieren decisión positiva de rol × recurso × acción, restricciones de ámbito y pruebas negativas antes de implementar una slice. Hasta su aprobación su comportamiento es DENY.

| Operación | Permiso | Política base |
|---|---|---|
| `COM-01` | `mail.accounts.manage` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `COM-02` | `mail.accounts.manage` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `COM-03` | `mail.drafts.create` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `COM-04` | `mail.outbound.approve` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `COM-05` | `mail.outbound.send` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `COM-06` | `mail.accounts.sync` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `COM-07` | `contacts.suppress` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `COM-08` | `mail.followups.cancel` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OFF-01` | `offers.create` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OFF-02` | `offers.edit` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OFF-03` | `offers.negotiate` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OFF-04` | `offers.accept` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OFF-05` | `opportunities.view` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OFF-06` | `work_engagements.create_from_won` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OPS-01` | `projects.view` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OPS-02` | `projects.progress.edit` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OPS-03` | `site_visits.attachments.create` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OPS-04` | `client_instructions.create` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `OPS-05` | `projects.close.request` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `REC-01` | `recurring_services.create` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `REC-02` | `recurring_services.schedule.edit` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `REC-03` | `contracts.renew.propose` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `REC-04` | `contracts.renew.execute` | DENY salvo concesión explícita válida, tenant y explicit deny |
| `REC-05` | `invoices.issue` | DENY salvo concesión explícita válida, tenant y explicit deny |


## Cierre de especificación del evaluador — no equivale a aprobar grants

**Decisión canónica:** los diez roles son etiquetas de asignación, no un permiso implícito. No hay `allow` hasta que una regla positiva exacta y vigente haya sido aprobada para acción, recurso, ámbito y contexto. Un operador que todavía no tenga un perfil de concesiones aprobado verá la pantalla de acceso restringido; ninguna API acepta la petición. Este comportamiento por defecto está completamente definido y es comprobable.

| Rol definido | Estado de grant predefinido | Capacidad administrativa implícita | Regla para el slice |
|---|---|---|---|
| Super Admin | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Company Admin | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Sales | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Planner | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Project Manager | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Site Responsible | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Visitor | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Employee | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Finance | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |
| Viewer | Ningún grant positivo aprobado globalmente | No | Aprobar acciones y ámbitos necesarios ANTES de habilitar el flujo del rol; documentar en la ficha del slice |

**Separación de funciones sin excepciones por rol:** crear un cambio sensible no supone derecho a aprobarlo; el sistema verifica mandato de aprobación y restricciones normativas. Super Admin puede administrar plataforma según poderes expresos, pero nunca atravesar tenant; Visitor requiere invitación válida y recurso concreto. La UI y API consumen una misma decisión.

### Pruebas mínimas del motor de autorización

1. Sin concesión positiva explícita → DENY para los diez roles y siete acciones.
2. Concesión positiva dentro del tenant y ámbito correctos → ALLOW salvo restricción superior.
3. Concesión positiva + DENY en cualquier ámbito relevante → DENY.
4. Grant expirado o revocado → DENY inmediatamente también en API.
5. Usuario asociado a otro tenant o recurso compartido sin base → DENY.
6. Cambio de rol mientras la sesión está activa → permisos reevaluados en la siguiente operación.
7. `approve` de contrato, factura, norma laboral o planificación requiere su propio permiso y aprobación humana si la política de negocio lo exige.
8. Audit trail registra antes/después, autor y motivo para gestión de permisos; la concesión no se autoaprueba.

**Gate funcional no suprimible:** el Product Owner deberá validar qué grants positivos exactos son necesarios para cada rol en el slice. No se utilizarán grants generosos provisionales para hacer funcionar la UI. Esto es un dato funcional aún pendiente, no un defecto oculto ni una decisión inventada.
