# CLEANOPS 360 — EVENTS AND AUTOMATIONS

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Responsabilidad y control
El scheduler interno Redis+BullMQ gobierna Radar, scoring, follow-up, clasificación email, avisos, normativa y renovaciones; cada automatización crítica tendrá ejecución manual autorizada.


## Eventos propuestos

`ProjectCandidatePromoted`, `OpportunityWon`, `WorkEngagementCreated`, `MailReceived`, `MailSuppressed`, `SchedulePublished`, `RapportReviewed`, `InvoiceIssued`, `ComplianceChangeProposed`; nombres de diseño sujetos a contratos técnicos por slice.


## Fiabilidad

Enqueue idempotente, correlation id, backoff exponencial acotado, dead letter/quarantine, métricas y alertas; no bucles infinitos, ni doble envío comercial.


## Políticas

AUTO nunca supera DO_NOT_CONTACT, permisos, límites del proveedor, aprobación para cold email no validado, controles de IA y contrato. Ningún precio cambia por IA.


## Observable

Cada ejecución muestra qué, cuándo, origen, resultado, error, retry, usuario y datos afectados; Radar Runs y botones Run now desde UI autorizada.

