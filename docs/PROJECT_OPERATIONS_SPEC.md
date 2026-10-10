# CleanOps 360 — Operaciones de obra

**Estado:** diseño funcional ampliado. Fuente: Master/SRS de proyectos, `REQ-PR-002/003/006`, `REQ-PLN-001/002`, `REQ-CLI-002`, `REQ-CLOSE-001/002`, `REQ-FILE-020` y reglas de rapports/facturación.

## Experiencia de usuario

- WorkEngagement `PROJECT` → resumen de obra, fases, inmuebles/edificios, plantas, unidades, planificación, personal, progreso, fotos, incidencias, instrucciones del cliente, rapport, finanzas y cierre.
- SiteVisit móvil: ficha de visita, contacto, dirección, anotaciones, fotos, planos y estado de subida/sincronización. Debe mostrar pendientes y errores offline.
- Vista de progreso: porcentaje y estado independiente por fase/unidad; soportar repetición de limpieza sin destruir el historial.
- No se activa una acción si falta autorización efectiva; el estado visible se obtiene del backend, no se simula localmente como confirmado.

## Entidades y relaciones conceptuales

`WorkEngagement(PROJECT) → Building → Floor → Unit → CleaningPhase/PhaseExecution`, con jerarquía opcional sin obligación de niveles vacíos. `SiteVisit`, `ClientInstruction`, `Incident`, `Media`, `Timesheet/Rapport` y `ScheduleAssignment` se enlazan al proyecto; no crear duplicados de las entidades existentes del modelo lógico.

## Ejecución y progreso

1. Iniciar proyecto desde WorkEngagement ya creado mediante la acción humana aprobada.
2. Registrar fases configurables `Grobreinigung`, `Erste Reinigung`, `Weitere Reinigung`, `Endreinigung`, `Nachreinigung`, sin imponer secuencia rígida si obra/contrato permite otras.
3. Crear unidad y asignar fases; un cambio en una unidad no modifica por accidente el progreso de otra.
4. Registrar nueva ejecución de fase o re-limpieza como evento nuevo, con actor, momento, fotos, incidencias y observaciones; no reescribir el historial anterior.
5. Una instrucción cliente válida tiene un **efecto operativo visible** (p.ej. actualizar restricción de planificación, tarea, personal o aviso) trazable a `REQ-CLI-002`; una nota sin efecto no cumple ese requisito.
6. Cambios a planificación publicada necesitan revisión humana y evaluación de disponibilidad/descansos/reglas activas.

## Horas, costes y alertas

- `reference_hours_current` es referencia, no límite duro; el acumulado de horas registra fuente y estado `worked/validated/invoiced/paid` sin confundirlos.
- Alertas 70/85/95/100 son parametrizables y solo informativas. Superar umbral no solicita automáticamente ampliación al cliente.
- Regie factura horas elegibles validadas conforme contrato; Pauschal depende de hitos o fechas aprobados. Un rapport disputado queda separado.

## Visita, adjuntos y modo offline

- Fotos antes de fase 9: validación de tipo/tamaño/cuota, upload idempotente, cuarentena y referencias privadas, conforme `REQ-FILE-020`.
- IndexedDB conserva cola local en modo offline; al reconectar verifica sesión, `tenant_id`, permisos, versiones y reglas de resolución por entidad, con revisión humana para cambios relevantes.
- UI distingue `local pendiente`, `sincronizando`, `sincronizado` y `conflicto`; una foto solo local nunca aparece como respaldo ya completado.

## Cierre

- Vista `Cerrar proyecto` compara finalización, incidencias, horas reales/referencia, facturación, cobros, fecha, contacto y resultado; advertencias/validaciones bloqueantes deben responder a regla del negocio documentada, no a suposición.
- Tras cierre ofrecer `Crear referencia comercial` o `No ahora`; una referencia se guarda como borrador y **no se publica externamente** sin aprobación separada.
- El cierre no destruye registros ni cambia retrospectivamente horas aprobadas.

## Errores y pruebas

Errores de dominio propuestos: `PROJECT_WRONG_TYPE`, `PHASE_VERSION_CONFLICT`, `MEDIA_UPLOAD_REJECTED`, `CLIENT_INSTRUCTION_NOT_APPLIED`, `SCHEDULE_REAPPROVAL_REQUIRED`, `CLOSE_DATA_MISSING`, `TENANT_ACCESS_DENIED`.

| Caso | Navegador | Verificación persistencia/seguridad |
|---|---|---|
| PRJ-E2E-01 | Crear fases y unidades | progreso independiente, relaciones correctas |
| PRJ-E2E-02 | Registrar nueva limpieza de unidad | versión anterior preservada, historial visible |
| PRJ-E2E-03 | Recibir instrucción cambiar dotación | modificación de StaffingRequirement o tarea y déficit visible |
| PRJ-E2E-04 | Subir foto desde visita | validación efectiva, archivo privado y referencia ligada |
| PRJ-E2E-05 | Editar offline y reconectar con conflicto | alerta, no sobrescritura silenciosa |
| PRJ-E2E-06 | Cerrar obra | métricas y auditoría, sin publicar referencia |
| PRJ-E2E-07 | Usuario de otro tenant abre foto/proyecto | backend deniega y no revela medios |

**Gate:** cada cambio observable desde UI debe persistir, auditarse, respetar permisos y verificarse mediante test E2E y prueba manual del Product Owner.

## Semántica transversal obligatoria

- `tenant_id` se aplica a lecturas, mutaciones, búsquedas, archivos y eventos; un identificador válido de otro tenant debe devolver respuesta indistinguible de recurso no accesible, sin revelar información.
- Cada mutación exige permisos efectivos en backend, idempotencia cuando pueda reintentarse y control de versiones para evitar sobrescrituras concurrentes.
- Los identificadores de comandos y rutas HTTP que se describen son **contratos lógicos propuestos**, no rutas técnicas ya aprobadas. Deben fijarse en `API_SPEC.md` antes de la slice correspondiente.
- La UI debe utilizar API y persistencia reales. Si una acción visible no está operativa, no podrá declararse aceptada. Cada cambio relevante produce auditoría sin secretos ni contenido confidencial innecesario.
- Los errores se representan como códigos de dominio estables, con mensaje localizado, `correlation_id` y tratamiento accesible en UI. Nunca se interpretará la falta de conexión como operación confirmada.

## Casos E2E contractuales OPS (diseño, no ejecutados)

Estos IDs sustituyen las referencias huérfanas de `CROSS_DOMAIN_CONTRACT_MATRIX.md`. No reemplazan los escenarios `PRJ-E2E-*` existentes: los complementan con evidencia específica por operación.

### `OPS-E2E-01` — Abrir una obra autorizada (`OPS-01`)

- **Dado:** Usuario con acceso al proyecto dentro de su tenant; obra persistida.
- **Cuando:** Abrir ficha mediante GET /projects/{id}.
- **Entonces:** Se muestran fases/unidades y versión persistida; lectura no altera timestamps operativos.
- **Negativos:** Identificador de otro tenant u obra inexistente: no revela información; nunca muta.
- **Evidencia exigida:** UI y respuesta API, consulta DB, auditoría de acceso sensible si aplica.
- **Estado:** diseñado, NO ejecutado.

### `OPS-E2E-02` — Registrar avance con concurrencia (`OPS-02`)

- **Dado:** Obra activa; fase editable; dos usuarios leen versión N.
- **Cuando:** Guardar progreso sobre N; segundo usuario intenta guardar también sobre N.
- **Entonces:** Primera escritura crea evento de progreso vinculado a fase/unidad; segunda recibe conflicto y UI permite revisión.
- **Negativos:** No acepta porcentaje fuera de rango o fase no editable; no sobrescribe historial.
- **Evidencia exigida:** UI, conflicto 409, eventos separados y persistencia.
- **Estado:** diseñado, NO ejecutado.

### `OPS-E2E-03` — Adjuntar imagen a visita (`OPS-03`)

- **Dado:** Visita autorizada y cuenta con cuota disponible.
- **Cuando:** Subir archivo válido y luego intentar MIME falso, tamaño excesivo y tenant ajeno.
- **Entonces:** Archivo válido queda privado, escaneado y unido a visita; errores sin enlaces públicos ni registro aprobado.
- **Negativos:** Fallo antivirus o cuota bloquea publicación; offline queda pendiente sin confirmar en servidor.
- **Evidencia exigida:** UI móvil, almacenamiento privado, referencias DB y registros de rechazo.
- **Estado:** diseñado, NO ejecutado.

### `OPS-E2E-04` — Registrar instrucción del cliente (`OPS-04`)

- **Dado:** Proyecto y personal de planificación disponibles.
- **Cuando:** Registrar instrucción que condiciona fecha/recursos.
- **Entonces:** Se crea ClientInstruction y efecto visible vinculado: restricción, tarea o aviso revisable en Planning.
- **Negativos:** Si efecto no se puede crear: transacción rechazada o estado explícito no aplicado; nunca éxito silencioso.
- **Evidencia exigida:** UI instrucción + Planning, DB y evento/auditoría.
- **Estado:** diseñado, NO ejecutado.

### `OPS-E2E-05` — Solicitar cierre y comprobar bloqueos (`OPS-05`)

- **Dado:** Obra con incidencias/horas/documentos conocidos.
- **Cuando:** Pulsar Solicitar cierre con una condición pendiente.
- **Entonces:** No se declara cerrada; UI presenta condiciones pendientes y, al resolverse, transición autorizada y auditada.
- **Negativos:** Rol sin permiso, obra de otro tenant o cierre duplicado no altera estado.
- **Evidencia exigida:** UI, API, histórico de estados y auditoría.
- **Estado:** diseñado, NO ejecutado.

