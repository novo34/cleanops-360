# CleanOps 360 — Ofertas y negociación

**Estado:** diseño funcional ampliado. Fuentes `REQ-OFF-001…005`, `REQ-WE-001…003`, `REQ-TRC-WE-001`, `REQ-PR-002/005/006`.

## Superficies de UI y permisos

- Opportunity → Ofertas: listado de versiones, crear borrador, edición de condiciones, vista previa, historial legible de cambios, propuestas del cliente y estados de negociación.
- Pantalla comparativa muestra precio vigente, importe solicitado, delta e impacto en margen **solo cuando existan datos suficientes**; si no, indicador explícito de datos no disponibles, nunca margen inventado.
- Acciones humanas `Accept`, `Counter`, `Maintain` con confirmación, justificación cuando aplique y control de permiso efectivo. IA puede preparar textos/comparativas, no aceptar condiciones.
- Opportunity `Won` muestra bandera visible `WorkEngagement pendiente` y acción `Crear WorkEngagement`; la UI debe navegar al WorkEngagement creado.

## Variantes de oferta

`HOURLY`, `FIXED_PRICE`, `DOCUMENT_BASED`, `FREE_FORM` y `RECURRING_SUBSCRIPTION` comparten versión inmutable. Plantillas por tipo de servicio no cambian automáticamente modalidad contractual. Un fichero importado PDF/Excel se revisa por humano antes de influir precio; CRBX estructurado es posterior.

## Invariantes de versión

- Cada versión guarda `changed_by`, `changed_at`, `reason`, `customer_request`, `status` y copia de precios/condiciones anteriores. Nunca sobreescribir una versión emitida.
- Una edición simultánea exige `expected_version`; si el estado cambió, devolver conflicto con diferencia visible y opción de nueva propuesta, no sobrescritura.
- El snapshot que se acepta se referencia por su `offer_version_id`, no por un puntero mutable a la oferta.
- Contrato comercial y estado de creación operativa son conceptos separados. `work_engagement_creation_status=PENDING` **no significa** `contract_status=PENDING`.

## Transición comercial a operación (obligatoria)

1. Usuario autorizado abre versión concreta, revisa las condiciones y ejecuta `Accept`.
2. Una transacción de dominio marca esa versión aceptada, la Opportunity vinculada `Won` y su `work_engagement_creation_status=PENDING`, con evento y auditoría. Si falla una parte no se presenta éxito parcial.
3. La UI muestra la acción visible `Crear WorkEngagement`. **No se crea automáticamente.**
4. Una persona autorizada elige tipo entre los cuatro WorkEngagement admitidos; visualiza relaciones y datos reutilizables que se copiarán.
5. Ejecuta creación idempotente, valida tipo, permisos, fuente Won y ausencia de vínculo operativo incompatible; crea WorkEngagement, enlaza versión aceptada, cambia indicador a `CREATED`, registra actor y navega a ficha.
6. El contrato puede permanecer en `NOT_REQUIRED/PENDING/RECEIVED/...` según su ciclo propio. No se infiere que esté firmado.

## Alternativas y rechazos

`OFFER_STALE_VERSION`, `OFFER_NOT_AUTHORIZED`, `OFFER_ALREADY_ACCEPTED`, `OFFER_INVALID_TRANSITION`, `WE_ALREADY_CREATED`, `WE_SOURCE_NOT_WON`, `WE_RELATION_INCOMPLETE`, `WE_TENANT_MISMATCH`. `Accept` repetido no crea Won histórico duplicado; `Crear WorkEngagement` repetido devuelve vínculo ya creado o rechazo seguro.

## Contratos lógicos a definir en API_SPEC

`Offer.CreateDraft`, `Offer.Revise(expected_version)`, `Offer.Negotiate(action)`, `Offer.Accept(version_id,idempotency_key)`, `WorkEngagement.CreateFromWon(opportunity_id,type,idempotency_key)`, `Opportunity.GetCommercialOperationalStatus`. Se trata de **nombres propuestos**, no endpoints desplegados.

## Pruebas de aceptación diseñadas

| Caso | Comprobación | Resultado verificable |
|---|---|---|
| OFF-E2E-01 | Crear y revisar oferta en UI | versiones y autoría persistidas, historial visible |
| OFF-E2E-02 | Aceptar versión con rol autorizado | Won + indicador PENDING atómicos, auditoría y CTA visible |
| OFF-E2E-03 | Abrir ficha Won sin crear WE | cero WorkEngagement nuevo, botón permanece disponible |
| OFF-E2E-04 | Crear WE por acción humana | solo un registro WE, CREATED y navegación correcta |
| OFF-E2E-05 | Aceptar desde sesión concurrente obsoleta | conflicto sin sobrescritura de la versión correcta |
| OFF-E2E-06 | Crear WE sin permiso/otro tenant | no hay operación ni fuga de relaciones |
| OFF-E2E-07 | Comprobar contrato aún no firmado | estado comercial no simula firma ni activación |

**Gate:** evidencia completa `Accept → Won → PENDING → Created`, desde navegador, DB, eventos y auditoría; no aceptar una transición solo porque el endpoint responda 200.

## Semántica transversal obligatoria

- `tenant_id` se aplica a lecturas, mutaciones, búsquedas, archivos y eventos; un identificador válido de otro tenant debe devolver respuesta indistinguible de recurso no accesible, sin revelar información.
- Cada mutación exige permisos efectivos en backend, idempotencia cuando pueda reintentarse y control de versiones para evitar sobrescrituras concurrentes.
- Los identificadores de comandos y rutas HTTP que se describen son **contratos lógicos propuestos**, no rutas técnicas ya aprobadas. Deben fijarse en `API_SPEC.md` antes de la slice correspondiente.
- La UI debe utilizar API y persistencia reales. Si una acción visible no está operativa, no podrá declararse aceptada. Cada cambio relevante produce auditoría sin secretos ni contenido confidencial innecesario.
- Los errores se representan como códigos de dominio estables, con mensaje localizado, `correlation_id` y tratamiento accesible en UI. Nunca se interpretará la falta de conexión como operación confirmada.
