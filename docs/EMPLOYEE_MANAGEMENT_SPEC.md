# Gestión de personal, disponibilidad, ausencias y equipos

**Estado:** especificación funcional ampliada; no implementada. **Fuentes normativas:** SRS §18, `REQ-EMP-001`, `REQ-EMP-002`, `REQ-PR-003`, `REQ-AUTHZ-001/002/006/007`; Planning y Offline. **Dependencia:** G-EMP antes de la publicación de planificación en Fase 12, junto con G-CMP.

## Actores y pantallas

| Pantalla | Finalidad | Acciones visibles | Estados UX |
|---|---|---|---|
| Personal → Empleados | Alta, ficha, búsqueda y edición | Crear, editar perfil, consultar cualificaciones/estado | loading, lista vacía, duplicado potencial, denegado, error |
| Empleado → Disponibilidad | Disponibilidad por intervalos | Añadir, editar y consultar intervalo | conflicto, intervalo inválido, éxito |
| Empleado → Ausencias | Solicitudes y resolución por autorizado | Solicitar, consultar, aprobar/rechazar si autorizado | pendiente, solapado, conflicto, denegado |
| Personal → Equipos | Composición y vigencia | Crear equipo, asignar o retirar miembro | sin miembros, incompatibilidad, error |
| Planning → Elegibilidad | Explicar motivos de bloqueo | Consultar aptitud y ausencias relevantes | sin empleado elegible, regla incumplida, revisión |

## Datos y validación de dominio

- Perfil base exigido por `REQ-EMP-001`: identidad, contacto, idioma, tipo de empleo, disponibilidad, competencias, capacidad para conducir, vehículo, aptitud para liderar, proyectos conocidos y estado. Los valores del catálogo y obligatoriedad campo a campo son *pendientes de definición*, no inventados.
- `Employee` pertenece a un solo tenant; la asignación a varios proyectos dentro del tenant es posible según autorización. La identidad de usuario y el registro laboral no deben presumirse idénticos.
- `Availability`: empleado, intervalo local con zona horaria, tipo y origen, vigencia, autor y versión; validar `start < end`, pertenencia al tenant y conflictos definidos por política.
- `Absence`: empleado, intervalo, estado, motivo protegido, aprobador, timestamp y versión. No exponer el motivo médico u otra información sensible en el calendario general. **Estados propuestos**: `REQUESTED`, `APPROVED`, `REJECTED`, `CANCELLED`; validación obligatoria del workflow antes de codificar.
- `Team`: tenant, identificador, vigencia, miembros y periodos de pertenencia; no convertir pertenencia en asignación automática de turno.
- La ausencia aprobada o inelegibilidad normativa bloquea la *publicación de asignación inválida*; las propuestas automáticas pueden mostrar alternativa, pero no publicar por sí mismas.

## Contratos lógicos de aplicación (nombres propuestos)

| Comando/consulta | Solicitud mínima | Respuesta/efecto | Rechazos a demostrar |
|---|---|---|---|
| `employee.create` | Datos validados, tenant del contexto, clave idempotente | Perfil persistido + evento de auditoría | 400 validación; 403 permiso; 409 duplicación bajo política |
| `employee.update` | id, campos permitidos, expected_version | Nueva versión + historial | 403; 404 sin fuga; 409 concurrente |
| `availability.set` | employee_id, intervalo, tipo, expected_version | Disponibilidad persistida y recalculo propuesto | 400 intervalo; 409 solape/versión |
| `absence.request` | employee_id, intervalo, tipo | Solicitud visible | 403; 409 periodo incompatible |
| `absence.review` | absence_id, decisión, expected_version | Estado auditado + señal a Planning | 403 falta approve; 409 ya resuelta |
| `team.assign` | team_id, employee_id, fechas, versión | Membresía registrada | 403; 409 conflicto/vigencia |
| `staff.eligibility.query` | periodo, WorkEngagement, requisitos | Lista de elegibles y razones de exclusión autorizadas | 403; dato incompleto y degradación explícita |

**Transacciones:** edición de ausencia aprobada y aviso al Planning Engine deben quedar causalmente ligados; si falla una notificación, la solicitud no se pierde y el job se reintenta sin duplicar efectos.

## Criterios observables de aceptación

1. Un administrador autorizado crea empleado desde UI; recarga y verifica identidad, estado y versión persistidos.
2. Quien no tiene `edit` ve UI restringida y recibe denegación también al invocar API directamente.
3. Intentos desde tenant A sobre empleado de B no revelan existencia ni campos.
4. Registrar ausencia aprobada bloquea publicación de turno solapado e informa al planificador; no borra turno previo de forma silenciosa.
5. Dos editores simultáneos reciben conflicto de versión y pantalla de resolución.
6. Motivos confidenciales de ausencia no aparecen en calendario, notificaciones ni exports sin permiso.
7. Con conexión offline, los cambios pendientes se identifican y se concilian sin alterar planificación ya publicada.

## Matriz de pruebas propuestas (no ejecutadas)

| Caso | Tipo | Oráculo y evidencia |
|---|---|---|
| `TC-EMP-UI-01` | E2E positivo | Crear → buscar → abrir ficha; API+DB+auditoría coinciden |
| `TC-EMP-SEC-02` | E2E negativo | Cross-tenant y falta de permiso denegados; DB sin mutación |
| `TC-EMP-ABS-03` | Integración+E2E | Ausencia aprobada → propuesta rechazada con causa |
| `TC-EMP-CON-04` | Concurrencia | expected_version obsoleta no sobrescribe cambios |
| `TC-EMP-PRV-05` | Privacidad | Export sin scope excluye motivos protegidos |

## Decisiones de detalle aún no aprobadas

Catálogo de tipos de empleo, permisos sobre datos personales por rol, quién aprueba ausencias, reglas exactas de solapamiento y política de borrado/conservación. **No bloquear toda la documentación:** deben registrarse como gates de configuración/aceptación del módulo, no presumirse resueltos.

## Contrato transversal obligatorio

- **Aislamiento:** todas las lecturas, escrituras, listados, exports, jobs y archivos se filtran por tenant en servidor, sin confiar en IDs o flags del cliente (`REQ-AUTHZ-002/006/007`).
- **Autorización:** la acción exacta `view/create/edit/approve/delete/export/manage_permissions` debe resolverse por política efectiva, `explicit DENY` prevalece; los nombres de roles no otorgan privilegios implícitos. La matriz precisa de concesiones requiere aprobación del Product Owner.
- **Concurrencia:** mutaciones con versión esperada; ante versión obsoleta devolver conflicto y ofrecer comparación/recarga, nunca sobrescribir trabajo publicado ni aprobación previa.
- **Integración:** UI consume API y persistencia reales en staging; cargas, vacíos, validación, denegaciones y fallos están representados. Eventos y jobs idempotentes, con correlación y auditoría de acciones sensibles.
- **Privacidad:** ocultar datos personales y económicos a quien no tenga alcance; archivos sujetos a cuarentena y políticas suizas aprobadas; auditoría sin copiar secretos.
- **Modo de especificación:** rutas/identificadores API señalados como *propuestos* no son decisiones de producto. Cualquier regla no documentada en Master/SRS queda explícitamente por aprobar.
