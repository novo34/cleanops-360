# CLEANOPS 360 — THREAT MODEL

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Modelo preliminar STRIDE / abuso de negocio
Los activos incluyen identidad, empleados, contactos, datos financieros, email, documentos y códigos de acceso a obras.


## Suplantación

Credential stuffing, OTP abuse, robo de sesión y trust device → MFA según riesgo, rate limit, revocación, step-up y auditoría.


## Manipulación

Oportunidad Won fraudulenta, precio modificado, Rapport sobrescrito, invoice duplicada → versionado, RBAC, idempotencia y transacciones.


## Repudio

Aceptar ofertas, publicar horario, aprobar norma o factura sin rastro → audit append-only + correlation ID + actor.


## Divulgación

IDOR/cross tenant, exfiltration, proveedores IA no autorizados, logs secretos → aislamiento backend, clasificaciones y política de exportación.


## Denegación/privilegios

DDoS, SSRF radar, zip bombs y escalado de roles → WAF, cuotas, sandbox, explicit deny y negative tests.


