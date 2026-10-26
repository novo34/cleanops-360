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

## Revisión integral del original — 2026-10-26

Se ha releído íntegramente el documento de 378 líneas, “Especificación del Módulo de Presupuestos y Cálculo (Kalkulation / Offerte)”, versión disponible el 2026-10-26, 31.318 bytes, referencia libfile_53e69b734e38819186c8afa9939c64f2. Es entrada funcional aportada por el propietario, no certificación normativa. El original se conserva sin modificación. Sus afirmaciones de verificación de las plantillas son atribuidas al documento: en esta revisión no se han podido verificar directamente esas cinco hojas ni la oferta Gallo original. Fuente normativa única del producto: SRS §13.1 REQ-CALC-001…022.

### Decisiones estructurales para evitar rehacer el módulo

- Núcleo de cálculo compartido y estrategias diferenciadas por servicio (REQ-CALC-013). La petición original de “dos motores separados” se incorpora como flujos/estrategias separados para recurrente y puntual, con unidades, salida y reglas propias; no se duplican fiscalidad, costes, permisos ni snapshots. Cristales y transporte son componentes reutilizables en ambos flujos. Una oferta admite líneas de distintos servicios con periodos explícitos y totales conciliados.
- Cadena canónica: cantidad/tarea/periodo → rendimiento contextual → horas-persona → componentes de coste → contribución → estructura → precio/beneficio → descuento/cargos → impuestos. Tarifa de venta que ya incorpora estructura/margen/material no puede volver a recibir esos componentes; guardar por componente su inclusión y base. Coste, venta y facturación contractual son ejes diferentes: Spezial puede ser Pauschale o Regie; el servicio no fuerza la modalidad.
- Calendario presupuestario es proyección de fechas/turnos del contrato para cotizar, sin asignar empleados ni publicar turnos. Debe compartir semántica de recurrencia con el módulo operativo futuro; definir interfaz de intervalos/fechas y excepciones antes de implementarlo, sin crear un Planning paralelo.
- Snapshot inmutable incluye versión del método/algoritmo y procedencia de entradas. Recálculo usa nueva revisión; ejecución, adenda y factura enlazan baseline concreta y línea/tarea estable, no índices de hoja ni nombres editables. Extender el modelo existente; no decidir tablas/API físicas por anticipado.
- Cliente contratante, beneficiario final, intermediario y pagador son relaciones explícitas; dirección de servicio y facturación independientes. Cambiar un contacto no cambia automáticamente deudor/contrato. Fotos/notas se enlazan a visita/inmueble con permisos; llaves, alarma y códigos no se imprimen en oferta ni se incluyen en logs.

### Rendimientos y ficha de inspección (REQ-CALC-019)

Once factores: tipo de objeto, tipo de espacio, estado estructural, alcance del Leistungsverzeichnis, frecuencia de uso, frecuencia de limpieza, tipo de suciedad, grado de suciedad, técnica manual/máquina, preparación/desplazamiento interno y calidad exigida. Añadir mobiliario, antigüedad/accesibilidad, ventanas/altura, productos ecológicos/material aportado por cliente y restricciones de horario/aparcamiento cuando proceda. Mostrar solo campos pertinentes; no hacer obligatorio un formulario gigante.

Catálogos separados por familia de trabajo: mantenimiento, especial/a fondo, obra, mudanza, cristales, fachadas y otros servicios existentes; tipo de objeto y tarea cualifican el rendimiento. Admitir rango bajo/medio/alto/típico y propio con unidad, fuente y vigencia. Predeterminado conservador (bajo) como opción de configuración, no constante ni afirmación de rendimiento suizo oficial. Prioridad: propio medido y revisado → referencia elegida revisada → cálculo incompleto si no hay valor utilizable. Revisión tras un mes como sugerencia inicial configurable; mostrar cantidad de observaciones, calidad y comparabilidad, con aprobación humana.

Rendimiento efectivo = rendimiento base × factores multiplicativos de rendimiento aplicables, todos positivos. Si se selecciona “factor de tiempo”, no usarlo como factor de rendimiento: las horas varían inversamente. Guardar factores aplicados y alcance de lo que ya incluye el valor propio; un rendimiento medido en suelo amueblado no recibe de nuevo el mismo corrector. Importar tablas BIV/EMR solo como referencias con origen/licencia y revisión, sin presentar valores numéricos del original como seeds oficiales.

### Modalidades de cálculo y unidades de salida (REQ-CALC-013/014)

| Modalidad | Entradas y cálculo | Salidas / límite |
|---|---|---|
| Recurrente por espacios | Cantidad por sala/tarea, rendimiento, visitas efectivas y trabajos periódicos, costes y calendario del contrato | Horas por pasada/mes/año, superficie de servicio del periodo, precio por m²/pasada y m²/mes con denominador, cuota mensual y equivalente anual |
| Anual por días/turnos | Enumerar cada fecha del periodo (incluye año bisiesto), zona horaria Europe/Zurich, franjas y cantidad de personas; dividir a medianoche/cambio horario o regla/vigencia | Desglose de coste y precio por día/turno/tipo de servicio y año; cuotas pactadas. No aplicar recargo salarial a todo el precio de venta |
| Puntual Bau/Spezial/Umzug | Cantidades/tareas, horas-persona, equipo, plazos, accesos y riesgo; modalidad Pauschale o Regie explícita | Precio cerrado o tarifa por hora, horas estimadas, posibles límites contractuales y garantía opcional |
| Cristales | Posición por método escalera, máquina, plataforma u ósmosis; caras/dimensiones, rendimiento, personal, montaje/desmontaje, alquiler y material | m² físicos/de servicio, h-persona, duración, coste, CHF/m², precio por posición y margen/contribución del conjunto |

Superficie de servicio puede sumar tareas o pasadas sobre la misma zona; nunca llamarla superficie física del inmueble. CHF/m² debe identificar si usa superficie física o superficie acumulada por intervenciones. Total oferta mixta no suma cantidades físicas incompatibles. Calcular varias posiciones y gastos compartidos una sola vez con reparto explícito.

Regie: tarifa comercial explícita no es coste laboral; cálculo inverso muestra ingreso efectivo/h-persona y residual después de categorías conocidas, sin llamar beneficio al residual si faltan materiales/estructura. Horas de estimación no equivalen a horas facturables aprobadas. No inferir pago/cobro de factura emitida.

El calendario real es preferente. Modo aproximado por factor mensual es opcional, etiquetado como estimación y con fórmula/fuente; parametrizar veces/día, días/semana, cada N días desde ancla, quincenal cada 14 días, dos veces/mes, mensual, trimestral y anual como recurrencias distintas. No importar etiquetas ambiguas como “cada 2 días = 2,5/semana” sin aclararlas. Precio anual equivalente de cuota estimada no se confunde con visitas realmente enumeradas. Fracciones de mes, cierres, servicios no coincidentes, vigencias futuras y ajuste final se muestran expresamente.

Reglas de recargos diferencian base salarial mínima/real, importe o porcentaje, tiempo compensatorio frente a dinero, ámbito (sector/categoría), recurrencia, excepciones, acumulación y prioridad. Ausencia de regla aplicable → borrador incompleto. No convertir tiempo compensatorio en incremento salarial por simple multiplicación. El coste por año o por hora pagada debe respetar cada base del 13.º, vacaciones, festivos y cargas; no usar días de vacaciones como porcentaje directo ni añadir ausencias dos veces.

### Cierres y vehículos (REQ-CALC-015)

Cierre del cliente, festivo de servicio y vacaciones/ausencias del personal son calendarios distintos. Un cierre no implica perder salario ni restar vacaciones del trabajador a las visitas del cliente. Ofrecer comparación: facturación por visitas, cuota anual nivelada o compensación comercial explícita de costes/ingreso según pacto. Mostrar coste evitable, coste fijo retenido, visitas omitidas y efecto neto para cliente/empresa.

Si se ofrece el modelo orientativo SVS ajustado = SVS base × unidades base / unidades facturables, las unidades y periodos deben coincidir, denominador >0 y base contractual ser explícita. Es una propuesta de precio, no compensación automática ni justificación legal. No aplicar incremento de SVS y volver a recuperar el mismo ingreso en la mensualidad. Si unidades facturables son cero, solicitar revisión; no dividir ni emitir cuota engañosa.

Coste vehículo/km = (costes fijos anuales + costes variables anuales) / km anuales para esa base; combustible = litros/100 km × precio/litro × km/año /100. Leasing y amortización no se suman como dos recuperaciones del mismo activo sin justificación contable. km totales indican ida/vuelta, trayecto compartido y criterio de reparto. Separar vehículo, horas-persona de viaje, peajes/parking/alquiler y precio cobrado al cliente (km, hora o forfait); dejar claro qué está incluido/excluido. Viaje de dos trabajadores multiplica coste humano, no kilómetros del vehículo. Si el precio/km ya incluye tiempo o margen no se añaden otra vez. Velocidad solo estima duración con unidad km/h y denominador positivo; permite tiempo real estimado manualmente.

### Negociación, garantías y continuidad contractual (REQ-CALC-016…018/020)

Simulador lado a lado: frecuencia → alcance → plazo → condiciones de pago → descuento de precio como guía configurable. Cambiar frecuencia puede modificar suciedad/rendimiento, y ampliar plazo añade exposición a inflación/recargos; recalcular en lugar de garantizar margen constante. Mostrar efecto total de descuento + cargos elegibles/no elegibles, base antes/después y diferencia respecto de oferta comparable; no anunciar ahorro que oculta un aumento neto.

Margen de contribución = ingresos netos − costes variables definidos; contribución/h = contribución / horas-persona del mismo alcance. Beneficio previsto tras coste completo es distinto; ni “estructura+margen” ni residual equivalen a beneficio neto. Cartera: sumar ingresos y costes comparables y luego dividir, nunca media simple de porcentajes. Referencias de mercado y multiplicador de salario son comprobaciones orientativas con fecha/zona/alcance/fuente y permiso; un umbral de CHF/h no acredita incumplimiento del convenio ni dumping. No mostrar etiquetas legales automáticas por precio.

Abnahmegarantie: opción explícita en oferta/contrato con aceptación cubierta, plazo, responsable, exclusiones y límites contractuales, reserva de coste de retrabajo por escenario y forma de atención. No garantía universal, ni incremento de precio fijo obligatorio. Retrabajo de garantía enlaza al servicio original y distingue coste absorbido de trabajo nuevo autorizado; no factura por sí solo.

Adenda/orden de cambio: conserva contrato/oferta aceptados, delta de alcance/horas/precio, modalidad y tarifa, límite opcional pactado, solicitante y aprobación sobre versión exacta; estados propuesto → pendiente de aprobación → aprobado/rechazado → aplicado auditado. Una ClientInstruction operativa puede seguir su flujo original sin constituir consentimiento de pago; no bloquear medidas operativas autorizadas por falta de adenda ni crear una bolsa financiera obligatoria. Aplicar precio/factura solo con habilitación contractual y permisos. Transición Accept → Won → WE PENDING → creación humana se conserva.

Reajuste GAV: análisis por contratos, componentes salariales y fechas afectados; cláusula con fórmula, base, peso del componente laboral, periodo de referencia, preaviso, límites/redondeo y evidencia de aprobación. Si no existe cláusula habilitante, propuesta de renegociación. Aun existiendo, la IA no aplica cambios económicos; no alterar snapshots ni facturas emitidas. Fechas previstas de salarios se cargan como valores normativos publicados por categoría, no simple porcentaje general que ignore redondeos oficiales. Escenarios multianuales muestran exposición y contratos pendientes de revisión.

Oferta PDF: ocho componentes del original explícitos: (1) razón social/contacto/UID aplicable, número/fecha/validez; (2) destinatario y facturación; (3) inmueble, superficie/plantas/particularidades; (4) Leistungsverzeichnis con tareas por zona/frecuencia; (5) líneas/precios mensual/anual cuando proceda, neto/descuento/cargos/impuestos/bruto; (6) condiciones/pago/garantía/reajuste; (7) AGB versionadas adjuntas o referencia accesible conservada; (8) firma o aceptación autorizada con evidencia. Adjuntar Raumbuch y plan de limpieza comercial, no turnos de empleados. DE/FR/IT con importes idénticos, términos revisados, referencia a versión/idioma aceptados y sin afirmar firma cualificada por pulsar Accept. Envío y validez se registran por versión; nuevo borrador no reinicia validez de una oferta ya enviada.

CRM registra pérdida: precio, alcance, plazo, competencia u otro con nota/fecha; análisis por tipo de objeto/zona con acceso autorizado y datos suficientes. No inventar precio de competidor ni hacer públicos datos de otras empresas del SaaS.

### Interfaces y configuración inicial (REQ-CALC-021/022)

Asistente tenant: revisar reglas aplicables, costes reales o perfiles por categoría, capacidad anual, rendimientos, gastos, fiscalidad, documentos y umbrales. Distinguir estimado/referencia/verificado y fechas; permite borradores incompletos, bloquea solo acciones que requieren el dato faltante. No obliga a cargar nómina personal para cotizar.

Antes de codificar fijar: identificadores estables de objeto/zona/tarea/línea; unidad/cantidad; periodos/recurrencias y timezone; códigos de clasificación de coste e inclusión; versión del perfil y reglas; entrada/respuesta de cálculo y diagnóstico de faltantes; snapshots/salida pública/interna; precondición de versión e idempotencia; cambio contractual y enlace de baseline a horas/rapport/factura. Son contratos mínimos a detallar en API_SPEC, no un nuevo framework de plugins ni autorización de DDL.

Productores/consumidores futuros: personal aporta salario/categoría autorizados sin exponer nómina completa; tiempos móviles aportan horas por tarea/zona y revisión; vehículos aportan costes disponibles; contratos conservan cláusulas/anexos/garantías; facturación consume modalidad y cantidades aprobadas; CRM consume precios/motivo de pérdida; documentos soportan DE/FR/IT y exportación de partidas. Sin estos módulos, perfiles manuales revisados y estimaciones son válidos como tales, no datos reales simulados. Importar CSV/XLSX/PDF requiere validación y revisión humana; CRBX estructurado/licencias NPK siguen diferidos conforme requisitos existentes. No crear módulo flota/nómina solo para cotizar.

### Conciliación del original y correcciones (todos los apartados)

| Original | Tratamiento y destino | REQ / prueba diseñada |
|---|---|---|
| §0 principios 1–3 | Coste/rendimiento primero; configuración versionada, mercado solo referencia | 001…006/008/018; CALC-01…04/14 |
| §0 principio 4 | Recurrente/puntual separados por estrategia, núcleo común reutilizado | 013; CALC-11 |
| §0 principio 5 | Medición/revisión propia con aprobación, integrada después de operación | 011/019; CALC-09/13 |
| §1.1 salarios, seguros, suplementos | Bases, reparto, categorías, región, calendario, vigencia; corregir universalizaciones, verificar reglas antes de activar | 002/005/014; CALC-01/03/12 |
| §1.2 tarifa/mercado/multiplicadores | Coste productivo y venta distintos; referencias opcionales no legales; no doble estructura/margen | 005/006/018; CALC-04/14 |
| §1.3 tablas/factores/valor propio | Catálogo contextual con rangos, once factores, revisión conservadora y muestra | 003/019/021; CALC-02/13 |
| §1.4 inmueble/Raumbuch | Actores/direcciones separados, accesos restringidos, mediciones/anexo | 004/020; CALC-02/07/17 |
| §2 pasos 1–4 | Horas-persona, preparación, calidad/viaje, ausencias sin doble conteo | 005/014/015; CALC-02/03/16 |
| §2 paso 5 mensualización | Calendario real y factores aproximados explícitos; corregir cifras incoherentes | 007/013; CALC-05/11 |
| §2 pasos 6–10 y salidas | Coste/tarifa, materiales/equipos, descuento, margen e impuestos aplicables separados | 005/006/012/013; CALC-03/04/11 |
| §2 caso inverso | Tarifa efectiva/residual desglosados; no validar oferta Gallo ausente | 005/012/013; CALC-18 |
| §2.1 anual por días | Turnos/fechas/reglas/29-feb/cambio horario; corregir ejemplo no reproducible | 007/013/014; CALC-11/12 |
| §2.2 cierres | Escenario comercial explícito según pacto; calendario personal separado | 007/015; CALC-15 |
| §2.3 cristales | Método/caras/altura/equipo/material/duración/coste y contribución | 004/013; CALC-02/11 |
| §2.4 transporte | Coste km/tiempo/personas/forfait y reparto; no equiparar CHF45 a fórmula no verificada | 005/015; CALC-16 |
| §3 ocho componentes/anexos | Todos explícitos; UID/validez/AGB/aceptación, DE/FR/IT | 009/020; CALC-07/17 |
| §4.1 versionado | Diff de partidas, envío/validez y snapshot inmutable | 008/020; CALC-06/17 |
| §4.2 palancas | Simulación de frecuencia/alcance/plazo/pago/precio con costes recalculados | 006/018; CALC-04/14 |
| §4.3 contribución/cartera/transparencia | Separar contribución/beneficio, medias ponderadas, cargos visibles | 006/018/020; CALC-14 |
| §4.4 cambios/reajuste/pérdida | Garantía, adenda/Regie/tope, cláusula/impacto y motivo pérdida; efectos por fases | 016/017/018; CALC-19/20 |
| §5 workflow | Conserva flujo CleanOps de creación humana WE y bucle de rendimientos aprobado | 008/011/016; OFF-E2E-02…07/CALC-09/19 |
| §6 integraciones | Contratos de datos existentes, no módulos paralelos, facturación solo autorizada | 010/011/016/017/020/021; CALC-09/17/19/20 |
| §7 defaults | No activar cifras orientativas sin fuente aplicable; distinguir tipo de valor | 001/002/014/021; CALC-01/12/21 |
| §8 prompt | Intención funcional incorporada en requisitos; errores numéricos/legalidad no se heredan | 001…022; CALC-01…21 |
| §9 lagunas | Reglas regionales romanda/Ticino/NAV, pólizas y datos propios siguen pendientes para activar el ámbito afectado; atribución BIV/EMR no certificada | 002/019/021/022; CALC-01/13/21 |
| §10 fuentes | Registro/procedencia y contraste selectivo actual; sin convertir dominios citados en evidencia de todas las cifras | 002/021/022; CALC-21 |

#### Correcciones numéricas y normativas que NO se importarán como defaults

- Final §8: 18×63×0,98+45 = 1.156,32 netos; al 8,1% orientativo del ejemplo, impuesto redondeado 93,66 y bruto 1.249,98. Un neto de 1.172 produciría 1.266,93, no 1.266,95. El importe de una factura real no se reconstruye a partir de estos datos incompatibles.
- §2: 400/200×8,70×32 = 556,80, no 556; precio m²/pasada 0,16 y m² físico/mes 1,392 (presentación 1,39). Bajo un factor uniforme 4,35: 6/sem = 26,10 y 3/sem = 13,05, no 25,09/12,54. 1/año equivale a 1/12, no 0,085. “Quincenal” y dos veces/mes no son intercambiables; 4,35 es aproximación, no factor exacto universal.
- §2.1: con 3 h nocturnas ×2 personas y 8 h diurnas ×1 persona, tarifa 30 y factor noche 1,15, la fórmula descrita da 447, no 627. No se conserva la cuota anual 20.220,75 como regresión válida sin entradas completas reproducibles; no sustituir factores alemanes por porcentajes suizos aplicados indiscriminadamente a venta.
- §2.2: el ejemplo 30×261/241≈32,4896 y 6.025×261/241=6.525 es aritméticamente coherente, pero su aplicación contractual/económica no es automática. §2.4: 9.440/20.000=0,472; no deducir 0,55/km ni 51,01 totales sin bases completas ni afirmar que cualquier Hilfsmittel equivale exactamente a transporte.
- Contraste consultado 2026-10-26: GAV Deutschschweiz 2026–2029 art.12.5 atribuye NBU al empleado; no “100% empresa” por defecto. Asunción empresarial adicional solo si está documentada. El art.6.5 distingue trabajo excepcional de supuestos regulares específicos: no aplicar 25% dominical a todo trabajador. Usar reglas y fuentes aplicables, no este resumen como nómina. Texto fuente: https://allpura.ch/pdf/GAV_2026-2029.pdf ; regla general UVG: https://www.bag.admin.ch/de/unfallversicherung . Esto no acredita todos los datos del original ni cobertura regional completa.
- Precio comercial bajo no prueba dumping, mínimos no son salarios reales y aporte del empleado no es coste patronal salvo asunción documentada. Ausencias/preparación/viaje no son universalmente “no facturables”: manda el contrato y el tratamiento de coste elegido sin duplicación. IVA se aplica según sujeción/régimen/prestación; no “siempre” ni tasa única eterna.

### Casos adicionales de aceptación — diseñados, NOT_RUN

| Caso | Requisitos | Resultado futuro exigido |
|---|---|---|
| CALC-11 | 007/013 | Oferta mixta recurrente/puntual/cristales con bases separadas; calendario real vs estimado, 29-feb, unidades y mensual/anual reconciliados; ninguna asignación publicada. |
| CALC-12 | 002/005/014 | Turno cruza medianoche, cambio horario y vigencia; clasificar por regla aplicable; tiempo compensatorio distinto de dinero; techos/repartos; recargo no aplicado a toda venta. |
| CALC-13 | 003/019 | Once factores/rangos/propio; factor de suelo aplicado una vez, propio protegido, cambio de frecuencia recalcula; revisión con muestra insuficiente no activa valor. |
| CALC-14 | 006/018 | Contribución y beneficio distintos; media de cartera ponderada; plazo/pago y cargos transparentes; umbral comercial no emite acusación legal. |
| CALC-15 | 007/015 | Cierre cliente sin restar vacaciones de plantilla; comparar cuotas vs visitas y compensación pactada; denominador cero rechazado; coste recuperado una vez. |
| CALC-16 | 005/015 | 9.440/20.000=0,472/km; combustible con /100; ida/vuelta y dos trabajadores, viaje compartido repartido; ni tiempo ni margen cobrado dos veces. |
| CALC-17 | 008/009/020 | Ocho componentes, UID aplicable, pagador/dirección separados, AGB/anexos/validez/envío preservados y DE/FR/IT con mismo importe; códigos de acceso excluidos. |
| CALC-18 | 005/012/013 | Casos corregidos 556,80/447/1.156,32/1.249,98; cálculo inverso de 1.127/18≈62,611… y residual 506 no etiquetado beneficio sin costes completos. |
| CALC-19 | 016 | Garantía/retrabajo, orden de cambio y tope pactado; no modifica baseline ni cobra sin habilitación; ClientInstruction mantiene efecto operativo. Efectos reales solo con módulos aceptados. |
| CALC-20 | 017 | Cambio salarial futuro: propuestas por contratos afectados y componente laboral; sin cláusula → renegociación; no aplicar ni emitir/enviar factura por IA. Integración posterior según roadmap. |
| CALC-21 | 002/021/022 | Asistente/importación con fuente/vigencia/unidad/licencia/revisión; parámetro alemán/no verificado no se activa como regla suiza; ningún apartado original queda sin tratamiento. |
