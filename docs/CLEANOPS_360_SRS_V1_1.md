# CLEANOPS 360 — SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

**Versión:** 1.1 — consolidación normativa 2026-10-09 (fuente original rotulada internamente 1.0)  
**Base:** CLEANOPS_360_PRODUCT_MASTER_V3.md, edición conciliada  
**Estado:** Baseline previa a implementación  
**Audiencia:** Product Owner, Codex, desarrollo, QA, seguridad y DevOps

---

# 1. Propósito

Este SRS convierte el Product Master V3 en requisitos verificables e implementables para CleanOps 360. Cuando un requisito explícito del SRS precise o corrija un ejemplo del Product Master, prevalece el SRS. Las cuestiones no resueltas se mantienen como `DECISION_REQUIRED` y no se completan mediante suposiciones.

CleanOps 360 será una plataforma integral para empresas de limpieza y facility services que cubra:

**oportunidad → contacto → visita → oferta → negociación → adjudicación → planificación → ejecución → horas → rapports → facturación → cobro → cierre → relación comercial futura**

Ningún requisito marcado `DECISION_REQUIRED` podrá implementarse sin resolución explícita.

---

# 2. Principios obligatorios

**REQ-PR-001 — Sistema autocontenido.** Toda la lógica de negocio principal deberá residir en CleanOps. No se usará n8n.

**REQ-PR-002 — WorkEngagement común.** El sistema usará una entidad común `WorkEngagement` con tipos `PROJECT`, `RECURRING_SERVICE`, `ONE_OFF_SERVICE` y `MAINTENANCE_CONTRACT`.

**REQ-PR-003 — Planning Engine único.** Todos los tipos de WorkEngagement deberán usar el mismo motor de planificación.

**REQ-PR-004 — Simplicidad UX.** La UI deberá ser limpia, rápida, amigable, responsive y comprensible.

**REQ-PR-005 — Human-in-the-loop.** La IA no decidirá de forma autónoma precios, contratos, salarios, sanciones o decisiones financieras sensibles.

**REQ-PR-006 — Vertical slices.** Cada feature deberá desarrollarse de extremo a extremo: DB → backend → API → permisos → UI → seguridad → pruebas → staging → validación Codex → prueba manual Product Owner.

**REQ-PR-007 — Acceptance Gate.** No se iniciará una fase dependiente hasta que la fase anterior esté `ACCEPTED`, salvo autorización explícita del Product Owner.

---

# 3. Roles y permisos

Roles base:

- Super Admin
- Company Admin
- Sales
- Planner
- Project Manager
- Site Responsible
- Visitor
- Employee
- Finance
- Viewer

Los roles son plantillas.

**REQ-AUTHZ-001.** Permisos por acción: `view`, `create`, `edit`, `approve`, `delete`, `export`, `manage_permissions`.

**REQ-AUTHZ-002.** Ámbitos: tenant, módulo, WorkEngagement, proyecto, documento, plano, oferta, finanzas y datos de empleados.

**REQ-AUTHZ-003.** El sistema deberá permitir overrides individuales por usuario.

**REQ-AUTHZ-004.** Deberá permitir accesos temporales con `start_at` y `expires_at`.

**REQ-AUTHZ-005.** La UI incluirá `Administration → Users → User Detail → Manage Access`.

**REQ-AUTHZ-006.** La autorización deberá aplicarse también en API, no solo UI.

**REQ-AUTHZ-007.** `explicit deny` prevalecerá sobre cualquier concesión; las políticas de aislamiento tenant y las restricciones de plataforma no podrán sobrepasarse mediante overrides. Ante falta de autorización, denegar por defecto. Roles conceden acceso base y grants por recurso/usuario/temporales solo dentro de las políticas superiores. Denegaciones y concesiones se aplicarán en API, con caducidad y auditoría.

---

# 4. Autenticación y MFA

**REQ-AUTH-001.** Login mediante email + password.

**REQ-AUTH-002.** Tras validar credenciales, se exigirá segundo factor según la política de riesgo del rol: obligatorio para administradores, comerciales, planificación, responsables y finanzas; configurable por tenant para empleados operativos. Las acciones sensibles exigirán step-up MFA aunque el login operativo se haya permitido sin MFA.

**REQ-AUTH-003.** Métodos MFA: código OTP por email o TOTP Authenticator.

**REQ-AUTH-004.** TOTP deberá ser compatible con aplicaciones estándar.

## OTP por email

**REQ-AUTH-010.** OTP de un solo uso.  
**REQ-AUTH-011.** Código OTP por email válido durante 5 minutos, de un solo uso y con invalidación por consumo o reenvío.  
**REQ-AUTH-012.** OTP almacenado como hash.  
**REQ-AUTH-013.** Reenvío invalida códigos anteriores.  
**REQ-AUTH-014.** Cooldown de reenvío.  
**REQ-AUTH-015.** Rate limit por usuario, IP y dispositivo.  
**REQ-AUTH-016.** Límite de intentos.  
**REQ-AUTH-017.** Mensajes que no permitan enumeración de cuentas.

## TOTP

**REQ-AUTH-020.** Activación mediante QR.  
**REQ-AUTH-021.** No se activa hasta validar el primer código.  
**REQ-AUTH-022.** Secreto TOTP cifrado.

## Recovery Codes

**REQ-AUTH-030.** Generación al activar TOTP.  
**REQ-AUTH-031.** Mostrar una única vez.  
**REQ-AUTH-032.** Guardar como hash.  
**REQ-AUTH-033.** Un solo uso.  
**REQ-AUTH-034.** MFA reset por admin deberá quedar auditado.

## Sesiones

**REQ-AUTH-040.** Pantalla `Account → Security → Active Sessions`.  
**REQ-AUTH-041.** Mostrar dispositivo, navegador, creación y última actividad.  
**REQ-AUTH-042.** Revocar sesión individual.  
**REQ-AUTH-043.** Revocar todas las demás sesiones.  
**REQ-AUTH-044.** Timeout por inactividad: 30 minutos para administración/comercial/finanzas y roles de riesgo administrativo equivalentes, 8 horas para empleados operativos; responsables y otros roles sensibles deben aplicar al menos la política restrictiva correspondiente. La clasificación de roles en los tests será explícita.  
**REQ-AUTH-045.** Timeout absoluto obligatorio independiente del tiempo de inactividad y de `remember device`; su duración numérica permanece como parámetro técnico sujeto a validación de seguridad antes de habilitar autenticación en producción.  
**REQ-AUTH-046.** `Remember device` válido por 30 días tras MFA y revocable por administrador, cambio de contraseña, reset MFA o riesgo; no amplía la validez de la sesión. La empresa podrá deshabilitar la confianza de dispositivo como endurecimiento, sin ampliar el plazo aprobado.  
**REQ-AUTH-047.** Step-up MFA para acciones sensibles.

---

# 5. Multi-tenant

**REQ-TEN-001.** Todo dato deberá pertenecer a un tenant.  
**REQ-TEN-002.** Tenant A nunca podrá acceder a datos de Tenant B.  
**REQ-TEN-003.** El aislamiento se aplicará en backend/API.  
**REQ-TEN-004.** Deberán existir tests automáticos de tenant isolation.

---

# 6. Empresas y contactos

**REQ-CRM-001.** CRUD y búsqueda de empresas.  
**REQ-CRM-002.** Una empresa podrá tener múltiples contactos, oportunidades, proyectos, contratos y WorkEngagements.  
**REQ-CRM-003.** CRUD y búsqueda de contactos.  
**REQ-CRM-004.** Roles de contacto: Bauleiter, Projektleiter, Facility Manager, Objektleiter, Einkauf, Baumanagement, administración, dirección.  
**REQ-CRM-005.** Un contacto podrá relacionarse con múltiples proyectos y oportunidades.

---

# 7. Contact Compliance y Suppression List

**REQ-COM-001.** Cada contacto podrá almacenar `data_source`, `source_url`, `first_seen_at`, `last_verified_at`, `communication_basis`, `do_not_contact`, `do_not_contact_at`, `privacy_request_status`, `retention_review_at`.

Estados: `UNKNOWN`, `DIRECT_RELATION`, `EXISTING_CUSTOMER`, `INBOUND_CONTACT`, `PUBLIC_TENDER_CONTACT`, `MANUAL_REVIEW_REQUIRED`, `DO_NOT_CONTACT`.

**REQ-COM-002.** Primer contacto frío no validado requiere `APPROVAL`.  
**REQ-COM-003.** Suppression List global por tenant.  
**REQ-COM-004.** `DO_NOT_CONTACT` impedirá comunicaciones automatizadas.  
**REQ-COM-005.** UI para marcar no-contact desde contacto, hilo de email y Settings → Compliance.

---

# 8. Oportunidades

**REQ-OPP-001.** Crear Opportunity manualmente sin ProjectCandidate previo.

Campos mínimos: nombre/descripcion, ubicación, empresa, contacto, teléfono/email, origen, comentario y creador.

**REQ-OPP-002.** Usuarios con `opportunities.suggest` podrán sugerir oportunidades sin acceso total al CRM.

**REQ-OPP-003.** Usuarios con `opportunities.approve` podrán convertir sugerencias en Opportunity.

Pipeline base:

`Discovered → Researching → Qualified → Pending Approval → Approved → Contact Prepared → Contacted → Waiting Reply → Follow-up → Replied → Interested → Documentation Requested → Visit Requested → Visit Scheduled → Visited → Preparing Offer → Offer Sent → Negotiation → Won/Lost/Awarded to Third Party/Future Follow-up`

**REQ-OPP-004.** El pipeline deberá ser configurable.  
**REQ-OPP-005.** Cada transición deberá quedar en historial.

---

# 9. Radar

**REQ-RAD-001.** Abstracción `SourceConnector` con tipos WEB, API, RSS, EMAIL, MANUAL, IMPORT, PORTAL.

**REQ-RAD-002.** Cada conector producirá `RawFinding`.

Pipeline: `RawFinding → Normalize → Deduplicate → Enrich → ProjectCandidate`.

**REQ-RAD-003.** `ProjectCandidate` será distinto de `Opportunity`.  
**REQ-RAD-004.** La ficha de `ProjectCandidate` deberá mostrar la acción explícita `Promote to Opportunity` a usuarios con el permiso `project_candidates.promote`. Al ejecutarla y superar las validaciones de deduplicación y permisos, el sistema deberá crear la `Opportunity`, vincularla al `ProjectCandidate` de origen, registrar la transición y llevar al usuario a la nueva Opportunity.  
**REQ-RAD-005.** No todo ProjectCandidate deberá promoverse; la promoción será una decisión humana explícita salvo que una regla futura aprobada defina otro comportamiento. La configuración `AUTO` en Discovery/Enrichment no autoriza por sí sola la promoción automática. Las oportunidades manuales y las sugerencias de usuarios siguen REQ-OPP-001/002/003.

## Deduplicación

Comparar nombre, dirección, localidad, empresa, Bauherr, GU/TU, fechas, coordenadas y similitud semántica.

**REQ-RAD-006.** Permitir merge manual y mantener historial.

## Enriquecimiento

Podrá investigar Bauherr, GU, TU, Baumanagement, arquitecto, Projektleiter, Bauleiter, Einkauf, Vergabe, email, teléfono, fechas, tamaño, presupuesto, estado y ubicación.

Estados de confianza: `CONFIRMED`, `PROBABLE`, `INFERRED`, `UNKNOWN`.

## Source of Truth

Cada dato crítico podrá almacenar `value`, `source_type`, `source_reference`, `confidence`, `verified_at`, `verified_by`.

Precedencia: `manual_verified > trusted_structured_source > public_web_source > ai_inference`.

Una actualización automática no sobrescribirá silenciosamente un dato manual verificado.

## Radar Runs

**REQ-RAD-020.** Pantalla `Radar Runs`.  
**REQ-RAD-021.** Mostrar started_at, ended_at, sources_checked, found, new, duplicates, updated, failed.  
**REQ-RAD-022.** Botón `Run now`.  
**REQ-RAD-023.** Logs de ejecución visibles para usuario autorizado.

---

# 10. Scoring

**REQ-SCR-001.** Score comercial configurable.  
**REQ-SCR-002.** No decidirá automáticamente contacto.  
**REQ-SCR-003.** Devolverá `score` y `reasons[]`.  
**REQ-SCR-004.** UI con `Recalculate`.

---

# 11. Email y Follow-up

**REQ-EML-001.** Inbox integrado: enviar, recibir, responder, reenviar, adjuntos, búsqueda, etiquetas.

**REQ-EML-002.** Emails vinculables a empresa, contacto, Opportunity y proyecto.

Modos de automatización: `AUTO`, `APPROVAL`, `MANUAL`.

**REQ-EML-003.** Primer email frío sin policy validada requiere aprobación.  
**REQ-EML-004.** Negociación de precio siempre manual.  
**REQ-EML-005.** IA puede redactar, traducir, resumir y clasificar.  
**REQ-EML-006.** IA no acepta precio/contrato/condiciones sensibles.  
**REQ-EML-007.** Email entrante se trata como contenido no confiable contra prompt injection.

**REQ-FUP-001.** Follow-up configurable.  
**REQ-FUP-002.** Cancelar si hay respuesta, DO_NOT_CONTACT, Opportunity cerrada, contacto incorrecto o pausa manual.  
**REQ-FUP-003.** Botón administrativo `Run now`.

---

# 12. Visitas

**REQ-VIS-001.** `SiteVisit` con Opportunity/Project, fecha, hora, dirección, assigned_user, contacto, teléfono, notas, planos, adjuntos y estado.

**REQ-VIS-002.** UI móvil para notas, voz, fotos, vídeo, documentos, planos, edificios, plantas, viviendas, garajes y zonas comunes.

**REQ-VIS-003.** Formularios breves, no formularios gigantes obligatorios.

---

# 13. Ofertas y negociación

Tipos: `HOURLY`, `FIXED_PRICE`, `DOCUMENT_BASED`, `FREE_FORM`, `RECURRING_SUBSCRIPTION`.

Plantillas: Baureinigung, Bauendreinigung, Fensterreinigung, Spezialreinigung, Stundenbasis, Unterhaltsreinigung, Hauswartung, Hygiene-Service.

**REQ-OFF-001.** Ofertas versionadas; nunca sobrescribir.  
**REQ-OFF-002.** Guardar changed_by, changed_at, reason, customer_request, status.  
**REQ-OFF-003.** Negociación mostrará current_price, requested_price, delta e impacto de margen si existe.  
**REQ-OFF-004.** Acciones: Accept, Counter, Maintain.  
**REQ-OFF-005.** Decisión humana.

## NPK / CRBX

**REQ-NPK-001.** MVP permite adjuntar PDF/XLSX/CRBX.  
**REQ-NPK-002.** No construir editor NPK completo en MVP.  
**REQ-NPK-003.** Arquitectura preparada para importación estructurada posterior.

---

## 13.1. Presupuestos y cálculo de rentabilidad — ampliación 2026-10-26

Autorizada por el propietario para incorporación documental. Estado: `DESIGN_ONLY`; no implementado ni aceptado operativamente. Requisitos nuevos, sin renumerar REQ-OFF ni las 26 decisiones históricas. Detalle funcional y casos verificables en `OFFERS_AND_NEGOTIATION_SPEC.md`.

**REQ-CALC-001 — Configuración por empresa.** Panel Configuración → Presupuestos con perfiles versionados de salarios y cargas, seguros, vacaciones, festivos, 13.º salario, horas productivas, gastos generales, materiales, equipos, transporte, márgenes, descuentos, impuestos, calendario, unidades y redondeo; sin constantes económicas ocultas.

**REQ-CALC-002 — Vigencia y cumplimiento.** Cada parámetro tiene unidad, base de aplicación, moneda cuando proceda, origen, región/categoría, vigencia, autor y estado de revisión. Reutilizar ComplianceRuleSet; no activar reglas legales no verificadas ni permitir que un override rebaje mínimos obligatorios. Ausencia/conflicto normativo bloquea emitir la oferta afectada; se permite borrador marcado incompleto.

**REQ-CALC-003 — Catálogo de rendimientos.** Catálogo tenant de servicios/tareas, unidades, métodos, superficies, maquinaria, dificultad y rendimientos versionados; distinguir m²/h, min/unidad y horas fijas. Valores importados son referencias revisables, nunca estándares legales ni valores propios acreditados automáticamente.

**REQ-CALC-004 — Raumbuch.** Ficha de inmueble reutiliza SiteVisit/documentos: zonas/salas, cantidades, unidad, suelo, tareas, frecuencia, cristales y caras, accesibilidad, suciedad y exclusiones. Guardar medición/origen y revisión; impedir doble conteo de áreas y caras; permitir captura progresiva y anexo contractual versionado.

**REQ-CALC-005 — Coste completo.** Calcular horas-persona y costes laborales, preparación, desplazamientos, materiales, maquinaria/amortización y gastos generales con desglose y bases explícitas. Cada coste se contabiliza una sola vez; diferenciar coste de hora pagada y productiva, tarifa de venta y coste. No usar salario neto como coste empresarial ni deducciones del empleado como sobrecoste patronal.

**REQ-CALC-006 — Precio y negociación.** Mostrar coste total, precio neto, beneficio previsto, margen sobre venta y recargo sobre coste por separado; variantes de alcance/frecuencia/precio/descuento. Umbrales y precio de retirada configurables; excepción comercial exige permiso y motivo auditado, nunca omite controles legales. Si faltan costes, mostrar margen no disponible; bloquear emisión como cálculo completo, sin inventar cero.

**REQ-CALC-007 — Recurrencia presupuestaria.** Calcular visitas y horas por calendario, frecuencia, inicio/fin, festivos, cierres y servicios periódicos. Distinguir mensualidad nivelada de cobro por intervenciones y mostrar reparto/reconciliación. No activar contrato, Planning ni facturación al simular; reutilizar sus motores cuando estén disponibles.

**REQ-CALC-008 — Snapshots y ajustes.** Toda versión de oferta conserva entradas, ajustes justificados, versiones de reglas/perfiles/rendimientos, calendario, motor, política de redondeo y resultados. Cambios de configuración solo afectan nuevos cálculos solicitados; nunca alteran versiones emitidas/aceptadas. Control de concurrencia en borradores y ajustes por oferta dentro de límites normativos.

**REQ-CALC-009 — Oferta y confidencialidad.** Vista previa y PDF incluyen emisor/cliente/inmueble, objeto, alcance/tareas/frecuencias, cantidades/unidades, precios/descuentos/impuestos/totales, calendario/plazos, condiciones de pago y validez, exclusiones y anexos versionados. Separar documento cliente de cálculo interno; no exportar salarios, costes ni márgenes sin permiso y selección explícita.

**REQ-CALC-010 — Permisos y disponibilidad.** Aislar configuración/catálogos/cálculos/exportaciones por tenant. Separar permisos efectivos para configurar, ver costes, ver margen, presupuestar y aprobar excepciones. Disponibilidad comercial del módulo no concede permisos; desactivación conserva historial y acceso autorizado contractual, sin borrar datos ni modificar ofertas.

**REQ-CALC-011 — Estimado frente a real.** Con módulos operativos aceptados, comparar snapshot aceptado con horas/costes reales por tarea/zona/periodo y alcance comparable; separar horas trabajadas/validadas/facturadas/cobradas e ingresos de caja. Mostrar desviaciones, cobertura de datos y rentabilidad provisional/final. Proponer nuevos rendimientos con evidencia y aprobación humana; no actualizar catálogo ni presupuestos automáticamente.

**REQ-CALC-012 — Exactitud y aceptación.** Aritmética decimal, validación de unidades, denominadores, moneda y redondeo explícito; pruebas unitarias, integración y E2E UI→API→persistencia→PDF con aislamiento/permisos, vigencia, snapshots, concurrencia, recurrencia, descuento y ausencia de datos. La IA solo asiste; decisiones económicas siguen siendo humanas.

**REQ-CALC-013 — Estrategias y salidas.** Un núcleo común de costes, reglas, decimales y versionado soportará estrategias diferenciadas: recurrente por espacios, anual por días/turnos, puntual Pauschale/Regie y cristales por método; cierres y transporte son componentes explícitos. Cada línea conserva superficie física/de servicio, horas-persona por intervención/periodo, duración de equipo, precio por unidad/pasada/mes y total mensual/anual cuando proceda, con denominador visible. No duplicar motores de negocio.

**REQ-CALC-014 — Coste laboral temporal.** Segmentar por fecha, horario, ubicación, categoría/convenio y vigencia cuando una oferta cruce cambios; distinguir recargo salarial, compensación en tiempo, reglas de acumulación y base aplicable. Modelar cada carga con base, umbral/techo y reparto empleado/empresa, mensual/por hora; salarios reales autorizados frente a mínimos. Reutilizar ComplianceRuleSet sin construir nómina ni Planning en fase 10.

**REQ-CALC-015 — Cierres y transporte.** Configurar calendario de servicio separado del calendario de capacidad laboral, política contractual de cierres y distribución de cuotas. Compensación de cierres es variante comercial visible y aprobada, nunca derecho automático a mantener ingreso. Separar coste vehículo/km, tiempo de personas, costes por encargo y precio al cliente con distancia de ida/vuelta, reparto entre objetos, bases y exclusiones sin doble cobro.

**REQ-CALC-016 — Garantía y modificaciones contractuales.** Garantía de aceptación/entrega opcional, con alcance, plazo, exclusiones y riesgo/coste de retrabajo explícitos. Tras aceptar, cambios se tramitan como adenda/orden de cambio versionada vinculada al contrato y WorkEngagement; tarifa/modalidad, cantidades/horas estimadas, límite pactado, aprobación humana y efecto operativo/financiero separados. No crear bolsa financiera automática ni alterar ClientInstruction o contrato aceptado.

**REQ-CALC-017 — Reajustes por normativa.** Cláusula contractual versionada indica habilitación, fórmula/base/componente, fuentes, fecha efectiva, preaviso, límites y aprobación exigida. Cambio de GAV genera análisis de impacto y propuesta por contratos afectados; no aplicar al precio total un porcentaje salarial indiscriminado ni modificar/enviar/facturar automáticamente sin habilitación contractual y humana verificadas.

**REQ-CALC-018 — Contribución e inteligencia comercial.** Distinguir margen de contribución (ingreso neto menos costes variables definidos) de beneficio tras coste completo y mostrar ambos por objeto, periodo y hora con bases explícitas. Comparar cartera con datos homogéneos y medias ponderadas; registrar motivo de pérdida y referencias de mercado con zona/servicio/fecha/fuente. Umbral comercial no equivale a mínimo legal ni acredita dumping; mercado y multiplicadores salariales son controles orientativos, no sustituyen cálculo.

**REQ-CALC-019 — Rendimientos contextualizados.** Registrar once factores de inspección, rangos bajo/medio/alto, valor propio verificado prioritario y fecha/tamaño de muestra. Factores de suelo/suciedad/método con significado y aplicación explícitos; evitar corregir dos veces un rendimiento ya ajustado. Selección conservadora configurable y revisión propuesta tras periodo configurable; reducir frecuencia obliga recalcular rendimiento/costes, no garantiza conservar margen.

**REQ-CALC-020 — Documento comercial completo.** Identificar entidad contratante, intermediario, pagador y dirección de trabajo/facturación por separado. PDF DE/FR/IT con numeración, fechas/envío/validez, UID/CHE cuando corresponda, contacto, objeto, alcance por partida, importes neto/impuestos/bruto, condiciones/reajuste, versión AGB y mecanismo de aceptación; anexos Raumbuch y plan de limpieza de alcance comercial. Traducción no altera cantidades/condiciones ni publica planificación. Cambios muestran diff de partidas y efecto neto conjunto de descuentos/cargos.

**REQ-CALC-021 — Importación y configuración inicial.** Asistente por empresa para datos propios, fuentes/versiones y parámetros incompletos; importación de tablas y documentos con mapeo de unidades/moneda, procedencia/licencia, revisión y aceptación humana antes de activar. Diferenciar valor normativo verificado, estimación propia y referencia orientativa. Contratos preparados para nómina, tiempos móviles, vehículos, CRM, contratos y finanzas sin depender de productos externos ni crear módulos anticipados; CRBX estructurado posterior conforme REQ-NPK.

**REQ-CALC-022 — Cierre verificable del diseño.** Trazar todos los apartados del documento original a requisito, tratamiento (incorporado/corregido/diferido) y caso de prueba, manteniendo pendientes explícitos. Antes de codificar fijar contratos de cálculo/versionado, clasificación de costes, recurrencia, cambios y eventos de integración; bloquear solo la capacidad afectada por decisiones esenciales no resueltas. Documentar sin afirmar pruebas funcionales ni garantizar ausencia absoluta de cambios futuros.

Entrega de ampliación: REQ-CALC-013/014/015/019/020/021/022 en fase 10; REQ-CALC-016/017 define condiciones en fase 10 y activa efectos solo al aceptar contratos/operaciones/finanzas correspondientes; REQ-CALC-018 entrega contribución estimada en fase 10 y cartera/real con sus fuentes aceptadas. Todos DESIGN_ONLY.

Entrega secuencial: REQ-CALC-001…010/012 pertenecen al alcance presupuestario de fase 10; REQ-CALC-011 es integración posterior con fases 16–18, sin exigir construir esos módulos anticipadamente. Cierre presupuestario no equivale al cierre de rentabilidad real.

---

# 14. Conversión a WorkEngagement

**REQ-WE-001.** Al ejecutar la acción `Accept` sobre una oferta (REQ-OFF-004), el sistema deberá transicionar de forma automática e inmediata la `Opportunity` asociada a `Won`, registrar la transición en el historial y auditar quién aceptó la oferta.

**REQ-WE-002.** Al transicionar una `Opportunity` a `Won`, el sistema deberá:
- establecer `work_engagement_creation_status = PENDING`;
- mostrar de forma visible la acción `Crear WorkEngagement`;
- no crear el WorkEngagement automáticamente;
- requerir una acción humana explícita y autorizada para crearlo;
- conservar la Opportunity en estado `Won` mientras la creación operativa permanezca pendiente.

Al ejecutar `Crear WorkEngagement`, el sistema deberá crear el WorkEngagement correspondiente, copiar las relaciones y datos reutilizables definidos en la spec, establecer `work_engagement_creation_status = CREATED`, registrar auditoría y navegar al nuevo WorkEngagement.

**REQ-WE-003.** Crear WorkEngagement no presupone contrato firmado.

Estados de contrato: `NOT_REQUIRED`, `PENDING`, `RECEIVED`, `SIGNED`, `ACTIVE`, `EXPIRED`, `TERMINATED`.

---

# 15. Planning Engine

**REQ-PLN-001.** Soportar PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRACT en el mismo motor.

Entradas mínimas: WorkEngagement, schedule, empleados, disponibilidad, skills, descansos, ubicación, transporte, continuidad, prioridades, instrucciones cliente, fechas, horas y restricciones.

Salidas mínimas: propuestas, conflictos, huecos, alertas y replanificación.

**REQ-PLN-002.** La publicación final será humana.

---

# 16. Calendar y My Day

**REQ-CAL-001.** Calendar será vista del Planning Engine.  
**REQ-CAL-002.** Vistas día, semana, mes, empleado, equipo, proyecto y ubicación.  
**REQ-CAL-003.** Mezclará todos los tipos de WorkEngagement.

My Day mostrará hora, lugar, dirección, trabajo, equipo, responsable, transporte, acceso, instrucciones y cambios recientes.

Acciones: confirmar, registrar horas, informar ausencia, solicitar transporte si permitido, abrir proyecto y ver documentos autorizados.

Estados de acknowledgement: `SENT`, `DELIVERED`, `READ`, `ACKNOWLEDGED`.

**REQ-CAL-004.** El botón `Confirmar` de My Day ejecutará el mismo flujo de acknowledgement.

---

# 17. Planificación versionada y concurrencia

**REQ-SCH-001.** Cada planificación publicada tendrá versión.  
**REQ-SCH-002.** Guardar version, published_by, published_at, changes y affected_users.  
**REQ-SCH-003.** Optimistic locking o equivalente en planificación, ofertas, permisos, proyectos, contactos, horas y rapports.

---

# 18. Empleados y Compliance Rule Engine

Perfil de empleado: identity, contact, language, employment_type, availability, skills, driver, vehicle, can_lead, known_projects, status.

Estados: active, vacation, sick, unavailable, partial, training, inactive.

**REQ-CMP-001.** Reglas laborales no codificadas como valores fijos.

`ComplianceRuleSet`: country, region, collective_agreement, effective_from, effective_to, employee_category, rule_type, rule_value, source.

---

# 19. Client Instructions

Tipos:

`INCREASE_STAFF`, `REDUCE_STAFF`, `CHANGE_PRIORITY`, `REPEAT_CLEANING`, `NEW_AREA`, `PAUSE_WORK`, `REACTIVATE_WORK`, `CHANGE_DEADLINE`, `OTHER`.

**REQ-CLI-001.** Puede provenir de Bauleiter, Objektleiter, Facility Manager, cliente, GU o administración.  
**REQ-CLI-002.** Toda `ClientInstruction` deberá generar un efecto definido y trazable en el dominio correspondiente. Ninguna instrucción podrá quedar como un registro aislado sin impacto visible.

| Tipo de ClientInstruction | Efecto obligatorio |
|---|---|
| `INCREASE_STAFF` | Crear/actualizar `StaffingRequirement` con número solicitado y fecha efectiva; recalcular disponibilidad; mostrar déficit si no hay personal suficiente; crear tarea para Planner cuando quede necesidad sin cubrir. |
| `REDUCE_STAFF` | Reducir el `StaffingRequirement` desde la fecha efectiva; recalcular propuesta de asignación; si afecta planificación ya publicada, generar cambio pendiente para revisión del Planner. |
| `CHANGE_PRIORITY` | Actualizar prioridad operativa y solicitar recálculo de la propuesta del Planning Engine; si afecta trabajos publicados, generar alerta/tarea de revisión. |
| `REPEAT_CLEANING` | Crear una nueva intervención pendiente para la fase/zona indicada y reflejarla en progreso y Planning Engine. No crear una categoría financiera de “extra”. |
| `NEW_AREA` | Crear o activar el área/unidad de trabajo indicada y generar el requerimiento operativo correspondiente para planificación. |
| `PAUSE_WORK` | Registrar la pausa y su fecha efectiva; marcar planificación futura afectada para revisión y replanificación. No modificar silenciosamente asignaciones publicadas. |
| `REACTIVATE_WORK` | Reactivar el WorkEngagement/área afectada y generar nueva necesidad de planificación desde la fecha efectiva. |
| `CHANGE_DEADLINE` | Actualizar la fecha objetivo/instruida, recalcular riesgos y necesidades de personal y generar alerta si la planificación actual ya no permite cumplirla. |
| `OTHER` | Crear tarea de revisión para el responsable asignado hasta que la instrucción sea clasificada o resuelta. |

**Regla común:** el Planning Engine podrá recalcular propuestas y alertas automáticamente, pero nunca deberá publicar cambios de asignación sin confirmación humana.

**REQ-CLI-003.** Ninguna ClientInstruction deberá interpretarse como aprobación de bloques de horas.

---

# 20. Horas de referencia

**REQ-HRS-001.** Proyecto puede tener `reference_hours_current`.  
**REQ-HRS-002.** No es límite duro.  
**REQ-HRS-003.** No crear solicitudes automáticas de ampliación.  
**REQ-HRS-004.** Guardar `ReferenceHoursHistory`.  
**REQ-HRS-005.** UI `Project → Reference Hours → View History`.  
**REQ-HRS-006.** Alertas configurables 70/85/95/100%.  
**REQ-HRS-007.** Superar 100% no bloquea operación.

---

# 21. Fases y estructura de obra

Plantilla: Grobreinigung, Erste Reinigung, Weitere Reinigung, Endreinigung, Nachreinigung.

**REQ-PHS-001.** Fases configurables: renombrar, añadir, eliminar, ordenar.  
**REQ-PHS-002.** Una unidad puede tener estado independiente por fase.  
**REQ-PHS-003.** Una unidad puede limpiarse varias veces.

**REQ-PRJ-001.** UI sencilla por edificio/planta/unidad.  
**REQ-PRJ-002.** No exigir jerarquías profundas.

---

# 22. Planos

**REQ-PLAN-001.** Soportar PDF/JPG/PNG.  
**REQ-PLAN-002.** Versionado obligatorio.  
**REQ-PLAN-003.** Guardar name, code, revision, uploaded_at, uploaded_by, current_version, historical_versions.  
**REQ-PLAN-004.** No sobrescribir revisiones anteriores.  
**REQ-PLAN-005.** Permisos por proyecto/documento.

---

# 23. Transporte, llaves y accesos

**REQ-TRN-001.** Separar asignación y transporte.

Opciones: direct, company_vehicle, coworker, public_transport, other.

**REQ-ACC-001.** Registrar key, badge, code, lockbox, opener, access_schedule, responsible_user.

---

# 24. Work Logs, Timesheets y Rapports

Work Log: team, hours, phase, area, completed_units, comment, photos.

Timesheets mediante empleado, responsable de equipo o importación externa.

Rapports: weekly, biweekly, monthly o custom.

**REQ-RPT-001.** Registro diario y frecuencia de rapport son conceptos distintos.

**REQ-RPT-002.** Cada contrato definirá si la validación de rapports es obligatoria. Las horas aprobadas podrán facturarse conforme al contrato; las rechazadas/disputadas permanecerán separadas y sin alteración del registro de horas trabajadas. Facturación provisional únicamente con autorización contractual expresa; toda aprobación, rechazo parcial y resolución tendrá trazabilidad y auditoría.

---

# 25. Finanzas

Separar `worked_hours`, `validated_hours`, `invoiced_hours`, `paid_hours`.

Facturación configurable: billing_frequency, payment_terms, billing_method, hourly_rate, fixed_price, currency, VAT.

Soportar proyectos, recurrentes y one-off.

Recurrent billing: weekly, monthly, quarterly o custom.

---

# 26. Servicios recurrentes

Estados: `DRAFT`, `ACTIVE`, `PAUSED`, `RENEWAL_DUE`, `RENEWED`, `TERMINATION_PENDING`, `TERMINATED`.

En `RENEWAL_DUE` mostrar: Renew, Renegotiate, Terminate, Postpone decision.

Debe soportar recurrencia, pausa, reanudación, renovación, terminación, re-cotización y facturación recurrente.

---

# 27. Cierre y referencias

Al cerrar proyecto guardar end_date, actual_hours, reference_hours, billing, payments, duration, incidents, contact y result.

UI: `Crear referencia comercial` / `No ahora`.

Puede crear draft automático, nunca publicación externa automática.

---

# 28. Dashboard

Bloques mínimos:

**Hoy:** trabajos, empleados, ausencias, alertas.  
**Necesita atención:** falta personal, conflictos, cambios cliente, horas, accesos.  
**Comercial:** oportunidades, respuestas, visitas, ofertas.  
**Finanzas:** trabajado, facturado, pendiente cobro.

Debe ser limpio, no saturado.

---

# 29. Multiidioma, responsive, PWA y offline

Idiomas iniciales: DE, ES, EN, IT, PT, SQ.

Responsive: 320, 375, 430, tablet, 1024, 1440, 1920.

Navegadores: Chrome, Edge, Firefox, Safari.

PWA instalable con push y offline parcial.

Offline mínimo: assignment, address, team, instructions, cached plans, work log, timesheet, incident, pending photos.

**REQ-OFFLINE-001.** Offline-first mediante IndexedDB, cola local, identificadores idempotentes, sincronización incremental y versiones para detectar concurrencia. Solo se fusionarán automáticamente cambios compatibles; conflictos relevantes (horas aprobadas, planificación publicada, permisos, instrucciones y estados financieros) irán a revisión humana, nunca a sobrescritura silenciosa. Se exigirá reautenticación y nueva comprobación de permisos para sincronizar tras caducar la sesión.

---

# 30. IA y automatizaciones

Agentes: Discovery, Research, Dedup, Scoring, Contact, Sales Writer, Reply Classifier, Next Action, Visit Summary, Planning, Project Risk, Document Extractor.

Cada agente tendrá scope, permissions, inputs, outputs, logs, approval mode y failure handling.

Automatizaciones críticas deberán poder ejecutarse manualmente:

- Radar → Run now
- Scoring → Recalculate
- Email classifier → Process
- Follow-up → Run now
- Planning → Generate proposal
- Notification → Send test

Toda automatización vivirá dentro de CleanOps.

---

# 31. Data Classification y AI Data Policy

Clasificaciones: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `HIGHLY_CONFIDENTIAL`.

Puede influir en permisos, exportación, IA y auditoría.

Políticas por tenant:

- allow_ai_email_processing
- allow_ai_documents
- allow_ai_plans
- allow_ai_financial_data
- allow_ai_employee_data

---

# 32. Seguridad

## Edge
Protección DDoS + WAF antes de Application/API.

## Rate limiting
Global, tenant, user, IP, endpoint y operation.

Aplicar a login, reset, OTP, upload, export, AI, email, radar y reports.

## Resource & Cost Guard
Límites: tenant_ai_budget, tenant_email_quota, tenant_storage_quota, tenant_api_quota, tenant_worker_quota, tenant_search_quota.

Cada uno: soft_limit, hard_limit, alert_threshold.

## Concurrency
Limitar requests, uploads, exports, AI jobs, reports y radar runs concurrentes.

## Payload limits
Definir límites de JSON, arrays, query, pagination, uploads, número de archivos, dimensiones, páginas PDF y descompresión.

## File Security
Pipeline:
`Upload → Quarantine → MIME/Magic Bytes → Malware Scan → Bomb Check → Sanitize → Store → Signed URL`

## Auth Abuse
Protección contra brute force, credential stuffing y OTP abuse con progressive delays, throttling y challenge.

## Session Security
HttpOnly, Secure, SameSite, rotation, fixation protection, inactivity timeout, absolute timeout, revoke y MFA freshness.

## CSRF
Protección explícita si se usan cookies.

## XSS
Output encoding, sanitización HTML y CSP.

## Injection
Prepared queries/ORM seguro y allowlists.

## SSRF
Radar/importadores bloquean private IPs, metadata endpoints, unsafe protocols, DNS rebinding y redirects peligrosos.

## Business Flow Abuse
Límites para emails/day, exports/hour, downloads/day, invitations/hour, AI/hour, opportunities/hour, radar runs/hour.

## Exports
Permiso específico, audit, límite y step-up MFA opcional.

## Exfiltration Detection
Detectar mass export, mass download y acceso anómalo.

## Isolation
Separar public web, API, workers, radar workers, AI workers, file processors, database y storage.

## Secrets/Supply Chain
Secret manager, rotation, no secrets en repo/logs, dependency scanning, SBOM, SAST, secret scanning, branch protection y code review.

---

# 33. Security Center

Pantallas:

- Overview
- Events
- Sessions
- Access Changes
- Automations
- Incidents

Permisos:

- security.view
- security.manage_incidents
- security.revoke_sessions
- security.view_exports
- security.manage_limits

Eventos:

- LOGIN_BRUTE_FORCE
- CREDENTIAL_STUFFING_SUSPECTED
- MASS_EXPORT
- MASS_DOWNLOAD
- PRIVILEGE_CHANGE
- MALWARE_UPLOAD
- RATE_LIMIT_TRIGGERED
- SUSPICIOUS_API_PATTERN
- ABNORMAL_AUTOMATION
- SSRF_BLOCKED
- AI_ABUSE_LIMIT

---

# 34. Auditoría

Registrar login, failed login, permission changes, price changes, offer versions, schedule publication, timesheet changes, rapport changes, document access, bulk export, deletion, AI actions y automation actions.

Los logs de auditoría no serán modificables por usuarios normales.

---

# 35. Trazabilidad End-to-End

Toda feature deberá documentar:

`UI Surface → UI Action → Permission → Command/API → Validation → State Transition → Persistence → Side Effects → Event(si aplica) → Consumers(si aplica) → Notification(si aplica) → Audit → Success/Empty/Error/Loading → Retry/Recovery → Tests`

Deberá existir `FEATURE_TRACEABILITY_MATRIX.md`.

Ninguna feature se considera completa con trazabilidad incompleta.

---

# 35.1 Trazabilidad crítica Comercial → Operaciones

**REQ-TRC-WE-001.** La transición `Offer Accepted → Opportunity Won → Pending WorkEngagement Creation → WorkEngagement Created` deberá aparecer completa en `FEATURE_TRACEABILITY_MATRIX.md`.

La fila deberá identificar como mínimo:

- UI Action `Accept`;
- permiso requerido;
- endpoint/command;
- transición de Opportunity;
- auditoría;
- estado `PENDING`;
- UI action `Crear WorkEngagement`;
- permiso requerido para creación;
- endpoint/command de creación;
- datos copiados desde Opportunity/Offer;
- creación del WorkEngagement;
- navegación resultante;
- estados de error y retry;
- tests unitarios, integración y E2E.

---

# 36. Entity Ownership y UI Coverage

Cada entidad se clasificará como:

- USER_MANAGED
- SYSTEM_MANAGED
- DERIVED
- AUDIT_ONLY
- INTEGRATION_MANAGED

Documentar owner domain, created/read/updated by, retention, UI, API, lifecycle y permissions.

Deberá existir `ENTITY_UI_COVERAGE.md`.

Ninguna tabla podrá quedar sin propósito documentado.

---

# 37. Calidad, observabilidad y recuperación

Antes de entregar una fase deberán pasar:

- lint
- typecheck
- unit tests
- integration tests
- E2E
- security tests
- migration validation
- build

El sistema tendrá logs estructurados y correlation id o equivalente para procesos críticos.

Deberán existir backups y restore tests.

**Objetivos de recuperación aprobados:** RPO de 15 minutos y RTO de 4 horas, sujetos a pruebas documentadas de restauración completa (PostgreSQL PITR, ficheros y aplicación); no son garantía de alta disponibilidad en un único VPS.

---

# 38. Entornos y release

Entornos: LOCAL, STAGING, PRODUCTION.

Flujo:
`feature branch → tests → merge → staging → Codex validation → Product Owner testing → ACCEPTED → release`

Nada va directo a producción.

Staging deberá mostrar versión, build/commit y environment.

---

# 39. Feature Flags y visibilidad

Feature flags por tenant.

Una feature `IN_DEVELOPMENT` no aparece a usuarios normales.  
`READY_FOR_USER_TEST` solo visible en staging/testers.  
`ACCEPTED` puede habilitarse normalmente.

---

# 40. Manual User Acceptance

Estados:

- IN_DEVELOPMENT
- CODEX_TESTING
- READY_FOR_USER_TEST
- USER_TESTING
- CHANGES_REQUESTED
- ACCEPTED

Cada fase deberá incluir checklist manual.

Codex no puede auto-marcar `ACCEPTED`; lo confirma el Product Owner.

---

# 41. Datos de prueba y Report Problem

Cada fase deberá incluir seed data.

Staging/dev tendrá `Reset Demo Data`; producción no.

Staging tendrá `Report Problem` capturando URL, user, browser, viewport, build version y timestamp.

---

# 42. Orden de implementación

**Fase 0 — Foundation**  
Repo, environments, CI/CD, DB baseline, staging, logs, build version, feature flags; VPS suizo único y Docker, firewall/WAF propio, volúmenes persistentes, Redis/BullMQ, backups/PITR independientes.

**Fase 1 — Authentication + MFA**  
Organizations, users, password, email OTP, TOTP, recovery codes, sessions, reset, seguridad, audit.

**Fase 2 — Users + Roles + Permissions**

**Fase 3 — Companies + Contacts**

**Fase 4 — Manual Opportunities + Pipeline**

**Fase 5 — Radar**

**Fase 6 — Enrichment + Scoring**

**Fase 7 — Inbox + Email**

**Fase 8 — AI Email + Follow-up**

**Fase 9 — Visits**

**Fase 10 — Offers + Negotiation**

**Fase 11 — WorkEngagement Core**

**Fase 12 — Planning Engine + Calendar + My Day**

**Fase 13 — Projects + Phases + Plans**

**Fase 14 — Recurring Services**

**Fase 15 — Client Instructions**

**Fase 16 — Hours + Work Logs**

**Fase 17 — Rapports**

**Fase 18 — Finance**

**Fase 19 — Closeout + References**

**Fase 20 — Production Hardening**

Cada fase: Codex prueba → Product Owner prueba → `ACCEPTED`.

---

# 43. Definition of Done

Una feature está terminada solo si:

1. UI funciona.
2. Backend funciona.
3. Permisos funcionan.
4. Persistencia funciona.
5. Side effects funcionan.
6. Eventos/consumidores funcionan cuando aplican.
7. Error/loading/empty states existen.
8. Seguridad está aplicada.
9. Audit existe cuando corresponde.
10. Tests automáticos pasan.
11. Codex la prueba.
12. Product Owner la prueba.
13. Product Owner la acepta.

---

# 44. Criterios globales de rechazo

Rechazar si:

- existe botón sin backend;
- una oferta aceptada no transiciona automáticamente su Opportunity a `Won`;
- una Opportunity `Won` no muestra `Crear WorkEngagement` mientras su creación operativa esté pendiente;
- un ProjectCandidate no ofrece `Promote to Opportunity` a usuarios autorizados;
- una ClientInstruction no produce el efecto operativo definido para su tipo;
- endpoint sin propósito;
- tabla sin owner/lifecycle/UI decision;
- falta permiso;
- faltan estados de error/loading/empty;
- falta auditoría;
- falta security test;
- falta E2E;
- no puede probarse desde UI;
- Product Owner no la ha aceptado;
- se usa n8n;
- MFA no funciona;
- OTP reutilizable o spameable;
- bypass de permisos;
- fuga cross-tenant;
- radar permite SSRF;
- uploads sin escaneo;
- exportaciones masivas sin controles;
- rate limiting insuficiente;
- IA ejecuta acciones sensibles sin approval;
- feature incompleta visible en navegación.

---

## 44.1. REQUISITOS ADICIONALES TRAS APROBACIÓN DEL PRODUCT OWNER

### Requisitos aprobados adicionales (nuevos IDs; no renumeran los existentes)

**REQ-INF-001.** La primera topología de producción deberá desplegar frontend, API, PostgreSQL, Redis, BullMQ workers y archivos en **un VPS alojado en Suiza**, con Docker, redes privadas y volúmenes persistentes. No se expondrán PostgreSQL o Redis a internet. Separación de servicios lógica y de permisos; preparar extracción futura a otros servidores, pero no declararla implantada.

**REQ-INF-002.** El proveedor de infraestructura suizo deberá ofrecer mitigación DDoS; se desplegarán firewall y WAF propios con reglas probadas. No se supondrá un proveedor CDN internacional.

**REQ-INF-003.** Backups completos diarios y WAL archivado de forma continua para recuperación PostgreSQL PITR, además de copia independiente y cifrada de archivos, configuraciones y secretos recuperables, en ubicación suiza separada del VPS principal. Pruebas de restauración end-to-end deberán medir RPO ≤ 15 minutos y RTO ≤ 4 horas; si fallan, bloquear la afirmación de cumplimiento y elevar plan correctivo. Un solo VPS no implica alta disponibilidad.

**REQ-INF-004.** El almacenamiento local deberá aislar tenants en autorización y rutas internas, aplicar cuotas y permisos, validar MIME y magic bytes, inspeccionar malware y descompresión maliciosa, y permitir migración futura sin modificar el dominio.

**REQ-JOB-001.** Redis + BullMQ ejecutará trabajos programados con deduplicación/idempotencia, concurrencia limitada, retry acotado, dead-letter o cuarentena de fallos, logs, métricas y `Run now` cuando proceda.

**REQ-EML-020.** Cada tenant podrá configurar SMTP+IMAP con secretos protegidos, conexión TLS y compatibilidad con los mecanismos de autenticación que efectivamente permita su proveedor. Enviar y recibir deberán soportar vinculación a thread/empresa/contacto/oportunidad. No exponer contraseñas en navegador ni logs.

**REQ-EML-021.** Los envíos comerciales tendrán límites progresivos por tenant y cuenta, no superiores a cuotas del proveedor ni límites globales; gestionar reputación, rebotes, pausas y `DO_NOT_CONTACT`. Los controles de compliance prevalecen sobre el modo `AUTO`.

**REQ-RAD-030.** Frecuencia de Radar por fuente configurable, con intervalo recomendado y control de restricciones legales/técnicas de la fuente; ofrecer `Run now` autorizado, auditoría, métricas y deduplicación. Descubrir un candidato no autoriza contacto automático.

**REQ-AI-020.** La capa multi-proveedor seleccionará proveedor/modelo por tarea, presupuesto, calidad y clasificación de datos; deberá comprobar autorización tenant, residencia/ubicación de procesamiento y garantías contractuales, bloquear la transferencia de datos protegidos fuera de Suiza en ausencia de aprobación y garantías verificadas, y auditar decisión/ruta de datos.

**REQ-DAT-020.** La retención se definirá por categoría y tenant con mínimos y obligaciones legales aplicables, bloqueo legal, anonimización/eliminación, pruebas y auditoría; no se fijarán periodos no verificados para categorías específicas.

**REQ-FILE-020.** Valores iniciales de subida: foto 20 MB, documento 50 MB, plano/archivo técnico 100 MB por archivo; cada tenant podrá configurar valores sujetos a límites globales seguros y cuotas; cualquier cambio debe validarse en API.

**REQ-FIN-020.** Los contratos definirán modalidad de facturación: Regie por horas facturables y validación exigida, Pauschal por hitos/plazos pactados y recurrente según periodicidad. El sistema podrá crear borradores automáticos; emitir factura requiere política autorizada explícita y controles de permisos/duplicados/auditoría. El envío al cliente es una acción o automatización independiente, igualmente autorizada.

**REQ-DOC-020.** MVP admite adjuntar PDF, XLSX y CRBX y extraer cuando sea viable información de PDF/Excel mediante IA con revisión humana obligatoria antes de incorporarla a una oferta; CRBX estructurado se posterga a fase validada sin editor NPK completo en MVP.

**REQ-CMP-020.** Motor de reglas versionadas para legislación y GAV/CCT aplicables con ajustes tenant permitidos. Una tarea programada y botón `Buscar cambios` consultarán fuentes verificables; la IA generará diferencias, citas, vigencia e impacto en planificación/empleados. Ningún cambio de regla activa será aplicado sin revisión y aprobación humanas auditadas.

**REQ-REC-020.** Las renovaciones usarán cláusulas contractuales y plazos de preaviso, alertas y asistencia IA; renovar automáticamente solo si el contrato vigente contiene habilitación expresa; renegociar, alterar importes o condiciones sensibles requiere aprobación humana. Mantener `Renew`, `Renegotiate`, `Terminate`, `Postpone decision` y registrar decisiones.

**REQ-SEC-020.** El MVP empleará librerías maduras para hash, autenticación y TOTP, sin implementar criptografía propia. El registro, sesión y credenciales se verificarán con pruebas de seguridad.

**REQ-SEC-021.** La caducidad absoluta de sesión tendrá un valor definido y probado antes de la entrega de Auth; no debe inferirse de los 30 días de dispositivo confiable ni de los timeouts de inactividad. El rol y su riesgo determinan MFA y tiempo inactivo, no permisos heredados ad hoc.

### Matriz de escenarios críticos de aceptación

| Escenario | Resultado obligatorio |
|---|---|
| OTP expirado > 5 min / reenvío | Rechazo; previo invalidado; rate limit |
| Empleado offline, sesión vencida | Cambios locales preservados, autenticación y permisos revalidados antes del sync |
| Dos usuarios editan planificación publicada | Conflicto/locking y revisión; nunca pérdida silenciosa |
| VPS perdido | Restore de DB+archivos y pruebas medibles RPO/RTO; evidencias, no SLA implícito |
| IA intenta mandar dato protegido a proveedor no autorizado | Bloqueo y auditoría |
| Contacto suprimido o cold email sin base validada | Envío bloqueado/pedido de aprobación; `AUTO` no lo supera |
| Rapport con 85 h validadas de 100 h trabajadas | 100 trabajadas permanecen, 85 validables para facturar según contrato, 15 disputadas |
| Oferta `Accept` | Opportunity `Won` inmediato; WE `PENDING` hasta acción humana |
| Modificación normativa sugerida por IA | No cambia regla activa sin revisión humana |
| Renovación sin cláusula de autorrenovación | Alerta/propuesta; nunca renovación automática |


# 45. DECISIONES APROBADAS Y PARÁMETROS DE IMPLEMENTACIÓN

1. Auth propia con librerías consolidadas, sin criptografía casera.
2. SMTP + IMAP por empresa, extensible a autenticación exigida por proveedores.
3. VPS propio y Docker.
4. Infraestructura y almacenamiento primario en Suiza; tratamiento internacional protegido según política.
5. Archivos en volúmenes persistentes privados en VPS.
6. Redis + BullMQ para colas y workers.
7. Offline-first IndexedDB, sync incremental, control de versiones y conflictos importantes revisados por humanos.
8. Proveedor suizo con protección DDoS, firewall y WAF propio.
9. Backup diario + WAL PostgreSQL PITR, archivos y copias independientes en Suiza.
10. Un VPS suizo para componentes de aplicación, datos, Redis y archivos.
11. Denegación explícita prevalece; deny-by-default e aislamiento tenant.
12. MFA por riesgo de rol; empleados operativos configurables; step-up sensible.
13. OTP por email de 5 minutos.
14. Dispositivo de confianza 30 días, revocable, no equivale a sesión.
15. Inactividad de 30 minutos para administración/comercial/finanzas y 8 horas operativos, caducidad absoluta separada.
16. Retención por tenant/categoría dentro del derecho suizo, supresión/anonimización/legal hold y auditoría.
17. Límites iniciales por tenant: fotos 20 MB, documentos 50 MB, técnicos 100 MB, con máximos globales.
18. RPO objetivo 15 min / RTO objetivo 4 h sujeto a restauraciones probadas, no SLA.
19. Límites escalonados por empresa/cuenta, rebotes, reputación, pausas; cumplimiento comercial obligatorio.
20. Radar frecuencia por fuente, `Run now`, respeto a restricciones de fuentes.
21. IA multi-proveedor por coste/calidad/tarea/privacidad; no enviar datos protegidos fuera de Suiza sin autorización y garantías verificadas.
22. Validación de rapports por contrato, facturar aprobado, disputar por separado; provisional solo con permiso contractual.
23. Facturación por contrato: Regie horas facturables, Pauschal hitos, recurrente periodicidad; borrador automatizable, emisión autorizada y envío separado.
24. Documentos PDF/Excel asistidos por IA con validación humana; CRBX estructurado posterior con parser validado.
25. Normativa base versionada con ajustes por tenant; vigilancia automática + manual asistida por IA; fuentes, impacto y aprobación humana para aplicar cambios.
26. Renovación contractual configurable, avisos e IA asistiva; autorrenovación solo por cláusula contractual expresa; cambios económicos humanos.

### Parámetros de implementación todavía por concretar (no reabren las 26 decisiones)

- Nombre del proveedor VPS suizo y evidencia contractual de residencia, DDoS y límites de recursos.
- Duración numérica del timeout **absoluto** de sesión (distinto del timeout por inactividad y de 30 días trusted device).
- Límites máximos globales de archivos, capacidad/cuotas por tenant y tamaños de archivo de respaldo.
- Políticas exactas de conservación por categoría y verificación jurídica del GAV/CCT y otras normas.
- Umbrales concretos por cuenta para warm-up, rebotes, reputación y horarios comerciales.
- Intervalos recomendados por conector Radar ajustados a sus términos reales.
- Lista de proveedores/modelos IA aprobados con garantías verificadas y decisiones de transferencia.
- Política de discrepancias entre eventos respaldados y archivos en restauración puntual.
- Detalle de calendario de pruebas de restauración, método de alertas y control de secretos.
Estos son parámetros verificables de implementación o selección de proveedor, **no decisiones de producto aún abiertas**. Deben cerrarse antes de activar la feature afectada en producción; nunca se rellenarán con hechos inventados.

---

# 45A. Requisitos normativos indexados — cobertura de obligaciones preexistentes

> Estos identificadores formalizan obligaciones ya expresadas en §18, §§25–28, §§32–34 y §§38–39. No alteran las 26 decisiones aprobadas. Cada requisito necesita diseño detallado y evidencia E2E durante su vertical slice.

**REQ-EMP-001.** El sistema deberá disponer de perfiles de empleado con identidad, contacto, idioma, tipo de empleo, disponibilidad, competencias, capacidad de conducir, vehículo, aptitud para liderar, proyectos conocidos y estado, conforme al §18.

**REQ-EMP-002.** La gestión autorizada de disponibilidad, ausencias, habilidades y equipos deberá ofrecer interfaces y persistencia trazables antes de habilitar asignación de personas en el Planning Engine, con aislamiento por tenant y auditoría de cambios sensibles.

**REQ-CMP-030.** Las reglas laborales GAV/CCT versionadas y su vigencia deberán evaluarse antes de publicar planificación o asignaciones dependientes de ellas; cambios de norma activa requerirán aprobación humana según la decisión 25.

**REQ-SVC-001.** `ONE_OFF_SERVICE` deberá poder crearse, planificarse, ejecutarse y cerrarse utilizando WorkEngagement y el Planning Engine únicos previstos en REQ-PR-002 y REQ-PR-003.

**REQ-SVC-002.** `MAINTENANCE_CONTRACT` deberá poder crearse, planificarse, revisarse y renovarse o terminarse según las condiciones contractuales, utilizando WorkEngagement y Planning Engine únicos, sin renovar automáticamente salvo autorización contractual expresa.

**REQ-FIN-030.** El sistema deberá distinguir, conservar y presentar `worked_hours`, `validated_hours`, `invoiced_hours` y `paid_hours` sin tratarlas como equivalentes (§25).

**REQ-FIN-031.** La configuración financiera por contrato deberá contemplar `billing_frequency`, `payment_terms`, `billing_method`, `hourly_rate`, `fixed_price`, `currency` e impuestos/VAT (§25); la emisión autorizada permanecerá separada del borrador y envío.

**REQ-FIN-032.** La facturación deberá cubrir proyectos, servicios recurrentes y servicios puntuales; la recurrencia admitirá periodicidad semanal, mensual, trimestral o personalizada (§25).

**REQ-REC-030.** Los servicios recurrentes deberán soportar `DRAFT`, `ACTIVE`, `PAUSED`, `RENEWAL_DUE`, `RENEWED`, `TERMINATION_PENDING` y `TERMINATED`, con transiciones auditables (§26).

**REQ-REC-031.** En `RENEWAL_DUE` la interfaz deberá mostrar las acciones `Renew`, `Renegotiate`, `Terminate` y `Postpone decision`, respetando condiciones contractuales y aprobación humana de cambios económicos (§26).

**REQ-CLOSE-001.** El cierre deberá conservar fecha de fin, horas reales y de referencia, facturación, cobros, duración, incidencias, contacto y resultado (§27).

**REQ-CLOSE-002.** La interfaz de cierre ofrecerá `Crear referencia comercial` y `No ahora`; podrá elaborar borrador pero no publicar referencias externamente de forma automática (§27).

**REQ-DASH-001.** El dashboard deberá mostrar información útil y comprensible de trabajo del día, empleados y ausencias, incidencias de atención, actividad comercial y métricas de finanzas, sin sobrecarga visual (§28).

**REQ-SEC-030.** El Security Center deberá permitir consultar eventos e incidentes autorizados, auditorías y evidencia de pruebas de recuperación, con controles de acceso por tenant y rol (capítulos de seguridad y auditoría).

**REQ-AUD-001.** Las acciones relevantes sobre seguridad, permisos, asignaciones, cierres, facturas y estados contractuales deberán registrar actor, fecha, entidad, acción y resultado, sin exponer secretos o datos de otros tenants (capítulos de auditoría).

**REQ-OPS-001.** El endurecimiento de producción deberá verificar restauración, protección de interfaz/API, aislamiento, evidencias de pruebas y registro de incidentes antes de aceptación de la fase final (§§32–34, §§38–39).


---

# 46. Instrucción final para Codex

Antes de programar:

1. validar este SRS contra Product Master V3;
2. generar los documentos derivados;
3. listar `DECISION_REQUIRED`;
4. crear dependency graph;
5. crear `FEATURE_TRACEABILITY_MATRIX.md`;
6. crear `ENTITY_UI_COVERAGE.md`;
7. crear `THREAT_MODEL.md`;
8. crear `SECURITY_ARCHITECTURE.md`;
9. definir Fase 0 y Fase 1;
10. crear checklist manual;
11. implementar solo la fase autorizada;
12. ejecutar automated gate;
13. desplegar a STAGING;
14. marcar `READY_FOR_USER_TEST`;
15. esperar aceptación del Product Owner.

> CleanOps crecerá por fases funcionales completas, no por módulos aislados. Cada función deberá poder verse, probarse y verificarse desde la UI. La seguridad deberá estar integrada desde el inicio.

## Nota de consolidación normativa (2026-10-09)

Se conservaron los requisitos originales, se resolvieron `REQ-AUTHZ-007`, `REQ-AUTH-002`, `REQ-RPT-002` y `REQ-OFFLINE-001` y se añadieron requisitos nuevos verificables. Las 26 decisiones de producto quedan cerradas; los parámetros técnicos concretos siguen identificados. No sustituye auditoría jurídica ni pruebas de producción.
# FIN DEL SRS