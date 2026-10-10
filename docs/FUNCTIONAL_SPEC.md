# CLEANOPS 360 — FUNCTIONAL SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Objetivo
Describir las capacidades visibles de CRM, Radar, oferta, operación y finanzas sin sustituir el SRS.


## Captación

Conector autorizado → RawFinding → normalización → deduplicación → ProjectCandidate. Ficha Radar Runs con Run now, estados, errores y evidencia de fuente. Promote to Opportunity exige permiso y revisión humana; nunca enviar correo solo por detectar candidato.


## Comercial

Crear Opportunity manual o desde ProjectCandidate; pipeline configurable con historial. Contacto frío sin base validada exige aprobación. Inbox SMTP/IMAP enlazado a empresa, contacto y oportunidad. IA solamente prepara y clasifica; precio y negociación quedan humanos.


## Conversión

Accept oferta autorizada → Opportunity Won inmediata → work_engagement_creation_status=PENDING → botón Crear WorkEngagement → CREATED tras transacción humana e idempotente. Crear WorkEngagement no implica contrato firmado.


## Operaciones

WorkEngagement unificado PROJECT/RECURRING_SERVICE/ONE_OFF_SERVICE/MAINTENANCE_CONTRACT; planificación propuesta y publicación humana; instrucciones cliente con impacto explícito; horas, fases, planos y rapports versionados.


## Cierre económico

Conservar worked_hours, validated_hours, invoiced_hours y paid_hours; Rapports controvertidos separados; factura borrador, emisión y envío son acciones distintas y autorizadas; renovación solo conforme cláusula contractual.

