# Servicio puntual — ONE_OFF_SERVICE

**Estado:** especificación ampliada; no implementada. **Base aprobada:** `REQ-PR-002/003`, `REQ-SVC-001`, `REQ-FIN-032`; integración en único WorkEngagement y Planning Engine. **Gate:** G-SVC-ONE antes del consumo operativo de los servicios puntuales.

## Flujo de negocio y superficies UI

`Crear solicitud de servicio → validar alcance y cliente → autorizar ejecución → crear WorkEngagement ONE_OFF_SERVICE → proponer planificación → confirmar publicación humana → ejecutar/My Day → registrar horas/rapport/incidencias → validar lo facturable → borrador/emitir/enviar según contrato → cerrar servicio`

La creación a partir de una oportunidad adjudicada **no omite** el paso humano `Won → WE creation PENDING → crear WE`; tampoco implica contrato firmado. Puede existir un flujo autorizado de entrada directa, pero su política específica requiere confirmación documental.

| Pantalla | Elementos | Comportamiento demostrable |
|---|---|---|
| Operaciones → Servicios puntuales | Listado, filtros por estado, cliente y fecha; CTA crear | Estados loading/empty/error, permisos, paginación |
| Alta/ficha | Cliente, sitio, alcance, zonas, ventana solicitada, presupuesto/referencia, responsable | Validaciones servidor, confirmación y detalle persistido |
| Planificación compartida | Capacidad, restricciones laborales, asignación propuesta | Publicación siempre humana con explicación de bloqueos |
| My Day / Rapport | Inicio/fin, avance, incidencias, aprobación | Persistencia, historial, conflictos offline |
| Facturación y cierre | Horas validadas, modalidad contractual, documentos | Borrador separado de emisión y envío; sin duplicados |

## Estado y operaciones

**Estados de trabajo propuestos, no normativos:** `DRAFT`, `READY`, `SCHEDULED`, `IN_PROGRESS`, `AWAITING_VALIDATION`, `COMPLETED`, `CLOSED`, `CANCELLED`. Revisar alineación con estados comunes WorkEngagement antes de implementación; evitar mantener dos máquinas de estado contradictorias. Solo usuario autorizado cambia a `CLOSED` tras verificar obligaciones pendientes; la existencia de factura emitida no debe suponerse requisito universal de cierre.

| Operación lógica propuesta | Precondiciones | Resultado | Denegaciones/errores |
|---|---|---|---|
| `oneOff.create` | Cliente y alcance válidos; acceso `create` | WE único y registro específico | 400 datos; 403 permiso; 409 idempotencia/duplicado |
| `oneOff.updateScope` | Edición habilitada; expected_version | Nueva versión y aviso si afecta plan publicado | 403, 409 concurrente, cambio contractual sin aprobación |
| `oneOff.proposeSchedule` | Empleados y regla G-CMP disponibles | Propuesta sin publicar | 409 inelegible o datos insuficientes |
| `oneOff.publishSchedule` | Planner autorizado y validaciones vigentes | schedule_version publicada y auditada | 403, 409 cambio concurrente, regla laboral |
| `oneOff.registerWork` | Asignación válida o excepción autorizada | Trabajo real y evidencia | 403, input inválido, duplicado |
| `oneOff.close` | Validaciones de cierre configuradas y permiso | Cierre auditado; historial consultable | 403, 409 pendientes, reintento duplicado |

## Datos e invariantes

`work_engagements.type=ONE_OFF_SERVICE`, vínculo tenant/cliente, `one_off_services`, assignments, shifts, work_logs, timesheets, rapports, incidencias, invoices y referencias a contrato cuando exista. No crear planificación/finanzas paralelas. Horas worked/validated/invoiced/paid distintas; una disputa permanece separada; las modalidades Regie/Pauschal se interpretan exclusivamente desde la configuración aprobada del contrato.

El servicio no se factura automáticamente por completarse. Borrador, emisión y envío son acciones distintas. Las operaciones deben ser idempotentes y auditadas, especialmente reintentos de creación, publicación, cierre y factura.

## Escenarios de aceptación específicos

| ID | Camino | Resultado comprobable |
|---|---|---|
| `TC-ONE-01` | UI crear → planificar → publicar → My Day → rapport → cerrar | WE/plan/rapport coherentes y visibles en todas las pantallas |
| `TC-ONE-02` | Intentar crear dos veces con mismo identificador de solicitud | Un WE, una auditoría causal y respuesta estable |
| `TC-ONE-03` | Programar empleado ausente / regla GAV no válida | Bloqueo de publicación con causa y sin turno publicado |
| `TC-ONE-04` | Cerrar con actividad o validación pendiente | Bloqueo conforme a política de cierre aprobada; no borrado de evidencia |
| `TC-ONE-05` | Facturación Regie con horas disputadas | Disputas excluidas salvo habilitación contractual expresa; sin doble factura |
| `TC-ONE-06` | Usuario sin permiso/cross-tenant | API deniega y UI no ofrece acción inapropiada |
| `TC-ONE-07` | Edición concurrente/offline | Conflicto visible, sin sobrescritura de publicación |

## Configuraciones por resolver

Campos obligatorios específicos por tipo de limpieza, catálogo de motivos de cierre/cancelación, requisitos exactos del cierre contractual y autorización de entrada directa sin Opportunity. No atribuirles valores hasta su aprobación.

## Contrato transversal obligatorio

- **Aislamiento:** todas las lecturas, escrituras, listados, exports, jobs y archivos se filtran por tenant en servidor, sin confiar en IDs o flags del cliente (`REQ-AUTHZ-002/006/007`).
- **Autorización:** la acción exacta `view/create/edit/approve/delete/export/manage_permissions` debe resolverse por política efectiva, `explicit DENY` prevalece; los nombres de roles no otorgan privilegios implícitos. La matriz precisa de concesiones requiere aprobación del Product Owner.
- **Concurrencia:** mutaciones con versión esperada; ante versión obsoleta devolver conflicto y ofrecer comparación/recarga, nunca sobrescribir trabajo publicado ni aprobación previa.
- **Integración:** UI consume API y persistencia reales en staging; cargas, vacíos, validación, denegaciones y fallos están representados. Eventos y jobs idempotentes, con correlación y auditoría de acciones sensibles.
- **Privacidad:** ocultar datos personales y económicos a quien no tenga alcance; archivos sujetos a cuarentena y políticas suizas aprobadas; auditoría sin copiar secretos.
- **Modo de especificación:** rutas/identificadores API señalados como *propuestos* no son decisiones de producto. Cualquier regla no documentada en Master/SRS queda explícitamente por aprobar.
