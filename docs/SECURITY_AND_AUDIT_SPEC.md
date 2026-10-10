# CLEANOPS 360 — SECURITY AND AUDIT SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Seguridad transversal
Tenant isolation desde API y persistencia, denegación explícita, MFA según riesgo, WAF/firewall propios sobre proveedor suizo DDoS.


## Controles

Rate limits por tenant/IP/usuario/operación, RBAC ABAC, CSRF según cookie auth, XSS CSP, SQL injections, SSRF en Radar, malware en uploads, export audit, secret rotation y dependency scanning.


## IA y comunicaciones

Prompt injection sobre correos y web, información clasificada y proveedor autorizado; suppression list prioritaria ante modo AUTO.


## Auditoría

Log append-only para auth, permisos, aceptación ofertas, planificación, invoices, cambios legales, datos sensibles, exportaciones, IA y automatizaciones; correlation ID.


## Pruebas

IDOR/cross tenant, session fixation, OTP abuse, export masivo, SSRF, archivo malicioso, endpoint huérfano, permisos en backend y revocación temporal.

