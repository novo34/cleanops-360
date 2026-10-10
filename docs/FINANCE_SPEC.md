# CLEANOPS 360 — FINANCE SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Política económica aprobada
Facturación por contrato: Regie (horas elegibles), Pauschal (hitos/plazos) y recurrente (periodicidad).


## Separación de acciones

Draft ≠ Issue ≠ Send. Borradores automatizables; emisión por política explícita autorizada; envío separado, con logs e idempotencia.


## Estados monetarios

worked_hours, validated_hours, invoiced_hours, paid_hours se conservan por separado; entidades invoice, invoice_line, payment y auditoría.


## Impuestos

Currency, VAT, payment terms y numbering sujetos a validación suiza y configuración tenant; no inventar valor fiscal o plazo obligatorio.


## Pruebas

Concurrent issuance y retry sin números/documentos duplicados; facturas por periodos, parcial disputado, cancelación y edición posterior auditada.



## Contratos de prueba y errores vinculantes

- Un borrador sin aprobación jamás debe pasar a `ISSUED`; enviar sin emitir, devolver rechazo sin mutación.
- Para Regie, agregar solo líneas elegibles de horas aprobadas; separar horas disputadas y mostrar explicación al usuario. Para Pauschal, calcular por hitos/importe contratado, no multiplicar horas.
- Emisión concurrente/doble clic: misma clave de idempotencia produce una factura, un número y un evento de auditoría. Fallo al enviar correo no debe desemitir factura.
- El formulario debe presentar `billing_frequency`, vencimiento, método, tasa e impuestos; `billing_cycle` queda alias histórico de lectura, nunca segundo campo de escritura.
- UI incluye estados cargando, vacío, error de validación y conflicto, historial de borradores, emisiones y pagos; pruebas `TC-X-009` y registro de `REQ-FIN-*`.
