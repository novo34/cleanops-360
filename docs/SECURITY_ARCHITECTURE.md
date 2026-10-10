# CLEANOPS 360 — SECURITY ARCHITECTURE

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Topología inicial obligatoria
Internet → mitigación DDoS del proveedor suizo → firewall/WAF propio → reverse proxy TLS → frontend/API Docker → red interna PostgreSQL, Redis/BullMQ y volúmenes locales.


## Red

Exponer solo 443 (y puertos mínimos de administración restringidos); no publicar Postgres/Redis; aislamiento de servicios por permisos, secrets y redes Docker.


## Identidad

Hash librería madura, MFA por rol, TOTP/OTP email, recuperación, sesiones revocables, explicit deny y step-up.


## Protección datos

Cifrado tránsito y reposo donde sea factible, backups fuera del VPS en Suiza, garantías verificadas para IA y correo; no asumir procesamiento local por localizar DB en Suiza.


## Observabilidad

Security Center eventos, alertas de exportación, auth abuse, SSRF, backups y anomalías; pruebas de penetración externas antes de producción.

