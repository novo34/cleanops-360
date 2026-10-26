# Resolución E1 — incremento funcional privado

Base6a63bd539b34f409ed762a844248013f6594c712. Fuente funcional final9ee13418890ad92635b67f0e89eb450f6d1e4ea5.
E1 aprobado registrado en docs/canonical/auth-review/E1-OWNER-RESOLUTION-2026-10-17.md,
sin alterar originales/hashes V4/B1-X/D1 ni borrar el historial. No se reabren decisiones.

## Implementado y ejecutado

[Run39073390845](https://github.com/novo34/cleanops-360/actions/runs/39073390845) SUCCESS:
**14 checks PASS /0FAIL/BLOCKED/SKIP, incluyendo4 recorridos Chromium reales**.
SQL05 exacto autorizado, PG16 nuevo sin red/puertos/binds/volúmenes compartidos,
fixtures exclusivamente sintéticos. Limpieza PASS; inventarios preexistentes iguales.
EXECUTION_REPORT.json conserva hashes/proveniencia/fases, nunca factores/cookies/URI.

1. Login/TOTP, sesión persistida, identidad,52 sesiones por cursor firmado, revocación
   individual, step-up/bulk preservando actual y logout/401.
2. PREAUTH→enrolamiento con UUID antes de cifrar→QR canvas local/URI temporal→rechazo
   de formato incorrecto y código numérico inválido sin activar método ni códigos→
   primer código correcto→CAS ACTIVE+sesión+10 recovery HMAC32→presentación única→
   rechazo replay→logout con bootstrap nuevo→nuevo login/verificación de método version2.
3. ACTIVE→step-up05→otro método pendiente→confirmación sin06 denegada403→step-up06
   con ventana de contador real→confirmación sin rotar sesión→dos métodos ACTIVE→
   reemplazo atómico del lote de recovery codes. Login múltiple/selección200 y quinta
   verificación429 sin sesión: se mantiene el umbral V4, no se suben ni borran límites.
4. Otro principal/usuario/dispositivo sintéticos independientes con dos métodos ACTIVE:
   sin selección no reto ni sesión; /me401; UUID autorizado seleccionado explícitamente;
   TOTP válido→sesión comprometida→/me200. Misma red sintética y perfil V4 sin cambios.

Una conexión/tx para validación, autorización, efectos, CAS, auditoría e idempotencia.
URIs/códigos/cookies no se emiten antes del COMMIT. Reservas de enrolamiento/confirmación
one-time completadas sin guardar respuesta secreta; sin custodia/bound válido falla cerrado.
Máximo de métodos explícito, validado y comprobado contra material ACTIVE confiable.
No hay tenant/user/version/risk suministrados por el cliente como autoridad.

## Código independiente EMAIL y recuperación

- mail-envelope.ts: AES256GCM v2, nonce aleatorio, AAD MAIL separado con tenant/user/
  method/version/recipient-generation/outbox/challenge/key-version, TTL300s, validación
  cerrada y objetos privados con serialización/inspección redactadas. Pruebas reales de
  cifrado/descifrado/tampering/cambio de tenant/generaciones/claves/expiración PASS.
- planMailRetry: UNKNOWN→QUARANTINE incluso tras TTL, sin reenvío ciego. Retry transitorio
  solo dentro de presupuesto y antes de expires. Pruebas PASS. No está conectado a worker.
- Generación/almacenamiento HMAC/presentación/regeneración de recovery codes sí integrados
  y probados con PostgreSQL. Consumo público, pérdida total y reset administrativo NO
  implementados: consume_recovery_internal carece de caller grant y no autoriza sesión.
- EMAIL sigue cerrado: SQL05 no acredita destinatario verificado ni persistencia de
  cuarentena. No se sustituye por booleanos, tablas accedidas directamente o superusuario.
  SQL-BOUNDARY.md fija brechas, firmas propuestas, mínimos ACL y orden de locks;
  son REVIEW ONLY, no cuerpos SQL instalables ni aprobación para ejecutarlos.

## CI y defectos

CI sin DB39073390840: lint/typecheck,173B1,Vitest13PASS/3SKIP de su integración DB separada,
build y57Chromium. Las pruebas PostgreSQL reales anteriores294PASS no se repiten.
Los4 E2E nuevos sí usan PostgreSQL real; aquellos SKIP no se ocultan ni se cuentan como PASS.

- Timeout reproducido: close() esperaba conexiones activas mientras el navegador
  esperaba terminar el test; closeAllConnections solo sobre servidor propio lo resuelve.
  Regresión de Node real y CLEANUP_DONE verificadas. TIMEOUT.md y ATTEMPT_1.json.
- Viejos tests exigían prohibición de enrolamiento preaprobación; adaptados al E1 vigente,
  conservando negación sin método pendiente, aislamiento, owned y runtime cerrado.
- Vector ACTIVE largo agotaba el presupuesto al quinto intento; diagnóstico429 preservado,
  caso negativo mantenido y positivo separado por cuenta/dispositivo, sin borrar buckets.
  ACTIVE_ATTEMPT_1/2.json conservan los fallos, no se reetiquetan PASS.
- Logout dejaba UI sin bootstrap/CSRF para el siguiente acceso. Ahora navega a /login para
  obtener binding nuevo; E2E prueba nuevo login y TOTP después del enrolamiento/logout.

## Estado y pendientes

**0/44 aceptados completos;18 requisitos con nueva evidencia real parcial.** MATRIX.md
individualiza los44 IDs y separa implementación, integración, pruebas y aceptación.
No se promueve automáticamente un PASS técnico a cierre de requisito/gate.

Parámetros operativos pendientes exclusivamente: custodio/hosts suizos/identidades y
recuperación OpenBao; apps/plataformas/versiones/dispositivos de compatibilidad; fuente
operativa de prueba de buzón, remitente/ruta de entrega cuando se autorice y retención/
resolución de cuarentena; operador/procedimiento real de comprobación de identidad para
pérdida total. Perfil D3 y MFA obligatorio no se vuelven a solicitar.

Trabajo pendiente dentro de B1: materializar UNA revisión SQL/ACL consolidada para
verified recipients/outbox/quarantine, recuperación/reset, trusted device, AUTHZ y
rotación PREAUTH de empresa; publicar diff/hashes para autorización específica ANTES de
instalar. Después integrar esas APIs/UI y ejecutar sus E2E reales. No hay candidato
instalable nuevo aprobado ni se pide aprobar firmas sin cuerpos. Custodia real y
compatibilidad externa requieren las designaciones anteriores para su validación.

No SMTP externo, proveedores/secretos productivos, infraestructura real, despliegue ni
merge. Runtime closedBackend; B1/AUTH-GATE-05 OPEN; ningún otro módulo comenzado.
