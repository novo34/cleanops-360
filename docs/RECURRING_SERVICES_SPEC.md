# CleanOps 360 — Servicios recurrentes

**Estado:** diseño funcional ampliado. Fuentes `REQ-PR-002/003`, `REQ-REC-020/030/031`, `REQ-FIN-020/031/032`, decisiones aprobadas 22, 23 y 26.

## Superficies UI

- WorkEngagement `RECURRING_SERVICE`: detalle de vigencia, ubicaciones, periodicidad, franjas, equipos, reglas de servicio, visitas programadas y vistas calendario.
- Contrato: `billing_frequency`, modalidad, importes, plazos de pago, hitos/revisión si aplican, renovación, preaviso, cláusulas y versiones visibles.
- Bandeja de vencimientos: alertas y acciones humanas `Renew`, `Renegotiate`, `Terminate`, `Postpone decision` con historial, impacto económico y aprobaciones.
- Planificación y finanzas deben usar el mismo Planning Engine y mismo circuito de validación de horas/rapports que los demás WorkEngagement.

## Estados y ciclos diferenciados

- Servicio: `DRAFT`, `ACTIVE`, `PAUSED`, `RENEWAL_DUE`, `RENEWED`, `TERMINATION_PENDING`, `TERMINATED` (`REQ-REC-030`).
- Contrato documental/legal y estado operativo no son sinónimos. `RENEWAL_DUE` no implica renovación ejecutada; `PAUSED` no equivale a contrato rescindido.
- Cada transición se autoriza en backend, conserva versión anterior, fecha efectiva, actor/motivo y efectos sobre futuras visitas/facturas. Las transiciones exactas y excepciones deben validarse en el diseño de estados antes de implementar; no inventar autorizaciones contractuales.

## Planificación y ejecución

1. Definir frecuencia/ventana por ubicación y condiciones contractuales; generar ocurrencias **con identidad determinística por contrato+ventana** para evitar duplicados en reintentos.
2. El Planning Engine evalúa empleados, ausencias, skills, descansos, traslado y normas GAV/CCT vigentes antes de publicación por humano.
3. Excepciones, festivos y cambios de ubicación producen propuesta auditada y revisión del Planner, sin alterar visitas ya ejecutadas.
4. Empleados completan ejecución y rapport (inclusive offline si permitido); reportes disputados conservan estado no facturable salvo cláusula expresa.
5. PAUSED o TERMINATED deben recalcular ocurrencias futuras y elegibilidad de periodos sin borrar visitas realizadas ni facturas emitidas.

## Renovación y decisiones económicas

- Calcular anticipación y preaviso desde versión contractual; generar alertas y tareas sin inferir la aceptación del cliente.
- `Renew`: solo automatizable con cláusula vigente inequívoca; de otro modo requiere aprobación humana autorizada.
- `Renegotiate`: genera versión de propuesta; nunca ajusta precio/condición económica activa automáticamente.
- `Terminate`: requiere verificación contractual, fecha efectiva y trazabilidad; no borra informes históricos.
- `Postpone decision`: registra motivo y próxima revisión, no renueva ni cambia vigencia por sí mismo.
- IA puede resumir fechas y sugerir borrador, pero no firmar, aceptar, renegociar ni cambiar precios.

## Facturación recurrente

- `billing_frequency` es el nombre canónico; si existen alias heredados no son dos fuentes de verdad.
- Generar borrador del periodo en base a modalidad contractual y elegibilidad; `(contract_id, period, billing_method)` debe prevenir duplicados de generación.
- Emitir y enviar se tratan como **acciones separadas** sujetas a permisos/política y auditoría. No se factura a ciegas periodo pausado/terminado, ni horas disputadas sin autorización contractual expresa.

## Rechazos y pruebas

Errores propuestos: `REC_INVALID_STATE`, `REC_CONTRACT_CLAUSE_REQUIRED`, `REC_PERMISSION_DENIED`, `REC_BILLING_DUPLICATE`, `REC_SCHEDULE_CONFLICT`, `REC_EFFECTIVE_DATE_CONFLICT`, `REC_TENANT_MISMATCH`.

| Caso | UI y acción | Evidencia |
|---|---|---|
| REC-E2E-01 | Configurar frecuencia y generar visitas | ocurrencias no duplicadas, versiones guardadas |
| REC-E2E-02 | Publicar planning con ausencia incompatible | alerta/bloqueo basado en norma aplicable |
| REC-E2E-03 | Llegar vencimiento sin autorrenovación | aviso + 4 decisiones, ninguna renovación oculta |
| REC-E2E-04 | Solicitar cambio económico por IA | solo borrador, aprobación humana antes de efecto |
| REC-E2E-05 | Pausar servicio con trabajos ejecutados | plan futuro recalculado, histórico intacto |
| REC-E2E-06 | Reintentar generación factura mismo periodo | una sola intención de borrador facturable |
| REC-E2E-07 | Emitir y enviar factura | permisos independientes, eventos separados |

**Gate:** revisión visible de estado, fechas, cláusulas, visitas y facturas con backend, DB, auditoría y tests E2E; no se considera completado con un job programado sin UI.

## Semántica transversal obligatoria

- `tenant_id` se aplica a lecturas, mutaciones, búsquedas, archivos y eventos; un identificador válido de otro tenant debe devolver respuesta indistinguible de recurso no accesible, sin revelar información.
- Cada mutación exige permisos efectivos en backend, idempotencia cuando pueda reintentarse y control de versiones para evitar sobrescrituras concurrentes.
- Los identificadores de comandos y rutas HTTP que se describen son **contratos lógicos propuestos**, no rutas técnicas ya aprobadas. Deben fijarse en `API_SPEC.md` antes de la slice correspondiente.
- La UI debe utilizar API y persistencia reales. Si una acción visible no está operativa, no podrá declararse aceptada. Cada cambio relevante produce auditoría sin secretos ni contenido confidencial innecesario.
- Los errores se representan como códigos de dominio estables, con mensaje localizado, `correlation_id` y tratamiento accesible en UI. Nunca se interpretará la falta de conexión como operación confirmada.
