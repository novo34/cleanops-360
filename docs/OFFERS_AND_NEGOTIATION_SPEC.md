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

## Presupuestos configurables — diseño 2026-10-26

Fuente normativa: SRS §13.1, REQ-CALC-001…012. Extiende el mismo editor/versionado; no crea otro motor de ofertas. Estado DESIGN_ONLY, implementación y pruebas pendientes.

### Panel y resolución de parámetros

Configuración → Presupuestos: perfiles de coste laboral; materiales/equipos/transporte; gastos generales; catálogo de tareas/rendimientos; calendario; precios/márgenes/descuentos; fiscalidad; documentos. Mostrar valor, unidad/base, fuente, vigencia y estado de revisión. Formularios progresivos, validación de campo, loading/empty/error, comparación antes de guardar y conflictos visibles. Simulación y vista previa antes de activar un perfil.

Precedencia: regla obligatoria aplicable → perfil tenant vigente → ajuste explícito de oferta permitido. Un ajuste comercial nunca sustituye una obligación legal. Guardar motivo/autor y procedencia de cada valor resuelto. No fijar porcentajes o salarios universales ni copiar parámetros alemanes. Costes por póliza/caja/empresa se verifican con su fuente real; una fecha de consulta no acredita por sí sola vigencia jurídica. Valores ausentes se señalan, no se sustituyen por cero. Normativa propuesta por IA exige aprobación humana conforme REQ-CMP-020.

El permiso de configurar costes es independiente de ver salarios individuales. Permitir perfiles por categoría sin exponer datos personales; aplicar permisos en API, búsquedas, logs y PDF. La activación comercial del módulo se integra con los controles tenant existentes; no diseñar aquí un segundo sistema de suscripciones/cobro.

### Cadena de cálculo auditable

1. Visita/Raumbuch → zonas y tareas medidas: cantidad, unidad, método, frecuencia, dificultad y evidencia. Cristales: declarar si cantidad/rendimiento corresponde a una cara o a ambas; dimensiones y cantidad de elementos explícitas.
2. Horas-persona por tarea: cantidad / rendimiento para unidades/h, o cantidad × minutos/unidad / 60. Añadir tiempos fijos de preparación y desplazamiento de forma explícita; tamaño de equipo cambia duración, no divide el coste de horas-persona.
3. Coste laboral: coste empresarial anual aplicable / horas-persona productivas anuales compatibles con ese perfil. Mostrar salario bruto, 13.º si corresponde, cargas patronales y seguros con bases/techos aplicables; vacaciones/ausencias y festivos afectan denominador o provisión según régimen. Documentar método para que no se cobren dos veces. No aplicar una suma universal de porcentajes a conceptos con bases distintas.
4. Coste total C = personal + otros costes directos + gastos generales asignados. Un concepto incluido en tarifa/perfil no se suma de nuevo; distinguir gastos recuperables y fiscalidad no recuperable según régimen aprobado.
5. Elegir método de precio: recargo u sobre coste → P=C×(1+u); margen objetivo m sobre venta → P=C/(1-m), con C≥0, u≥0 y 0≤m<1 para estos métodos. Oferta manual es modalidad explícita, no cálculo rentable acreditado. Beneficio=P-C; margen=(P-C)/P si P>0; recargo=(P-C)/C si C>0; caso cero → no disponible.
6. Descuento d: neto descontado=P×(1-d), 0≤d≤1, con alcance sobre líneas elegibles explícito; cargos no descontables separados. Recalcular beneficio/margen después del descuento y antes de impuestos. IVA cobrado no es beneficio. Política de redondeo por moneda/línea/impuesto/total versionada y conciliada; no usar redondeo de efectivo en todas las operaciones.

Pruebas aritméticas sintéticas, no tarifas recomendadas: C=100 y margen 20% → P=125; recargo 20% → P=120. Sobre 125, descuento 10% → 112,50; beneficio 12,50 y margen 11,111…%. Caso documental corregido: 18×63×0,98+45=1.156,32 antes de impuestos si los 45 no reciben descuento; no 1.172. Ninguno de estos números es un parámetro legal.

### Calendario, variantes y emisión

Calendario presupuestario enumera intervenciones en el periodo contractual y aplica cierres/festivos conforme condiciones; no asumir cuatro semanas por mes ni 52 semanas efectivas para todos los contratos. Mensualización nivelada: total del periodo / cuotas pactadas, con ajuste de céntimos trazable. Cobro por intervención: importe por visitas previstas; mostrar meses variables. Recalcular variante sobre sus entradas completas; comparar alcance, horas, costes y neto en igual periodo/moneda. Sin autopublicar turnos, renovar ni facturar.

Umbral de margen mínimo, precio de retirada y límites de descuento son configurables por tenant/servicio con jerarquía documentada. El backend bloquea emitir una variante que requiera aprobación comercial hasta permiso efectivo, motivo y aprobación sobre versión exacta; excepción de margen no permite incumplir mínimos legales. Borradores incompletos admitidos con advertencia; no presentar rentabilidad inventada en ofertas FREE_FORM o DOCUMENT_BASED.

Documento cliente: las ocho agrupaciones de REQ-CALC-009 y anexos del Raumbuch; plantillas ajustables sin eliminar información obligatoria aplicable. Vista previa debe distinguir PDF cliente y cálculo interno. Una nueva configuración propone un recálculo en nueva versión; no altera oferta emitida, aceptada ni contrato. Costes y salarios internos excluidos por defecto de exportación al cliente.

### Contratos lógicos y datos por diseñar

Extender Offer.CreateDraft/Revise y el editor existentes con resolver perfil vigente, calcular variante, comparar, solicitar/aprobar excepción, previsualizar y exportar. Nombres HTTP/DTO definitivos se fijarán antes del slice; no hay endpoints creados por este documento. Guardar snapshot completo de entradas, procedencias/versiones, calendario, ajustes, motor, redondeo, desglose y resultado asociado a OfferVersion. Referencias solas a un catálogo mutable son insuficientes. Edición exige expected_version, reintentos idempotentes y auditoría sin salarios en logs generales.

### Aceptación diseñada (NO ejecutada)

| Caso | REQ | Evidencia futura requerida |
|---|---|---|
| CALC-01 | 001/002 | Dos tenants configuran valores distintos; perfil futuro no se aplica antes de vigencia; faltante/conflicto legal impide emisión afectada. |
| CALC-02 | 003/004/005 | 600 m² a 200 m²/h = 3 horas-persona; dos personas = 1,5 h de duración; tiempo fijo una vez; cara de cristal sin duplicar. |
| CALC-03 | 005/012 | Coste anual/productivo reproducible; vacaciones/13.º/cargas sin duplicación; cero horas productivas o rendimiento inválido rechazados. |
| CALC-04 | 006/012 | Ejemplos de margen/recargo/descuento anteriores; debajo del umbral requiere autorización en backend; excepción no supera cumplimiento. |
| CALC-05 | 007 | Periodo parcial, festivo/cierre y frecuencia variable; visitas enumeradas; cuotas reconcilian total sin ejecutar operación. |
| CALC-06 | 008 | Cambio de salario/rendimiento conserva PDF y snapshot anteriores; nueva versión recalcula solo por acción; edición concurrente produce conflicto. |
| CALC-07 | 009/010 | PDF y vista cliente no contienen costes/salarios/margen; exportación interna exige permiso; IDs de otro tenant no filtran datos. |
| CALC-08 | 006/010/012 | Sin coste no hay margen; módulo deshabilitado no permite crear cálculos; historial preservado bajo permisos; unidades/moneda inválidas rechazadas. |
| CALC-09 | 011 | Con operación real aceptada: comparar mismo alcance/periodo; horas disputadas conservadas; rendimiento propuesto no modifica catálogo sin revisión. |
| CALC-10 | 001…010/012 | E2E completo configurar → Raumbuch → calcular → negociar → nueva versión → PDF → aceptar; persistencia, permisos y auditoría verificables. |

### Entrega secuencial y fuentes pendientes

Fase 10 cubre presupuesto completo y baseline estimada. REQ-CALC-011 queda explícitamente pendiente de fases 16–18; su aceptación no se simula ni bloquea la entrega del cálculo estimado por exigir construir módulos futuros. Antes de emitir con mínimos laborales se necesita el subconjunto aprobado de ComplianceRuleSet/fuentes necesario para cotizar, sin adelantar todo Planning/G-EMP. El cierre integral de comparación real exige datos operativos reales y pruebas propias.

Los cinco Google Sheets del curso alemán siguen sin contenido accesible. No se certifican sus fórmulas ni el archivo previo como fuente normativa; importación futura exige revisión aritmética, unidades, doble conteo, licencia y adaptación suiza. Valores legales/salariales/fiscales no se incrustan en código: fuente, vigencia y aprobación humana antes de activar.
