# Siguiente slice implementable, aún no autorizado

## Alcance cerrado de preparación

13 operaciones HTTP, ocho reglas funcionales aprobadas, cuatro estados AuthResult y backend+RLS desde inicio. UI Login/OTP/QR/primer código/recuperación de códigos mostrados una vez/Account-Security-sesiones/selector de empresa. No usuarios ajenos, no asignación de permisos, no administración de MFA ajeno, no System Status ni recuperación de pérdida total. No programar aplicación hasta autorización del propietario.

## Orden de trabajo después de autorizar código

1. Verificar de nuevo HEAD de fix/system-status-build-tests y crear checkout aislado; AGENTS y guías Next pertinentes antes de código. Fuera de main/Foundation/PR4. Contratos V4 son propuesta derivada, sin editar Product Master/SRS/PRD/decisiones históricas.
2. Implementar tabla de configuración validada contra security-values.yaml: valores aprobados fijos y perfil propuesto versionado. Ningún fallback a defaults de librería; valores ausentes/fallo del corpus/secretos/DB→fallo seguro. Backend/DB comparan versión del perfil, clases de riesgo y política.
3. Servicio de identidad privado y runtime con conexiones separadas: librería Argon2id/mature TOTP/AEAD/HMAC/CSPRNG, verificación de CSRF/origen, normalización email consistente, hash ficticio ante cuenta ausente y limitación progresiva por usuario/IP/dispositivo. No reimplementar criptografía en SQL ni exponer atestación a HTTP. Recibir validated_counter del browser queda prohibido: solo servicio privado tras TOTP verificado.
4. Construir repositorios transaccionales y wrappers con parámetros SQL, locks ordenados, gestión de idempotencia y fallos. Traducir SQLSTATE/códigos internos a errores seguros HTTP; retorno false de factor se confirma para preservar intentos y luego responde401, no rollback del contador. Nunca error/denegación como éxito persistido.
5. Implementar UI real conectada a las 13 operaciones: loading/error/empty/success confirmados, accesible, estados no operativos de ceremonia, cookies rotadas solo tras commit. QR/recovery una vez; no secret logging/analytics. Selección pendiente no mezcla tenants ni cambia origen antes de commit destino.
6. Preparar migración expansiva revisada (distinta de fresh schema) y harness de dos tenants sintéticos. **No ejecutarlos** hasta autorización separada de ensayo. Harness instala solo fixtures aprobados en DB efímera, no grants administrativos ni identidades de producción; despliegue sigue deshabilitado fuera de ese entorno.
7. Ensayo autorizado: compilación SQL/PLpgSQL en PostgreSQL objetivo, introspección de roles/privilegios/RLS de21 tablas, integración con runtime/broker reales, concurrencia/replay/locks/pool, SMTP controlado y navegadores. Fallo bloquea aceptación; no sustituir por éxito simulado con fixtures HTTP.
8. CI SHA exacto: lint/typecheck/build, validación de contratos, unitarias, SQL compile/integration, E2E, dependencias/secretos. Revisión independiente+PO. Aprobar implementación no activa bindings ni cierra gates; una habilitación futura exige evidencia y decisión propia. No merge en este encargo.

## Evidencia automática que debe añadirse, no afirmada hoy

| Grupo | Criterio bloqueante |
|---|---|
| Perfil Argon2id | Pico de memoria/latencia y concurrencia; no reducir coste por DoS sin revisión; rehash seguro de versión |
| Antiabuso | Cinco fallos/900s por usuario y dimensiones propuestas; NAT/IPv6/dispositivo reiniciado; backoff progresivo sin lockout permanente y sin enumeración; los umbrales son propuestas, no aprobados |
| Clock/MFA | OTP300s, invalidación al reenviar, primer TOTP, ventana/replay contador, códigos hash únicos, consumo concurrente una vez |
| Estados/cookies | CSRF bootstrap/login, SameSite/Host/HttpOnly, session fixation, no cookie/token en JS/log, PENDING/ENROLLMENT/SELECTION sin negocio |
| Revocación | Propia individual/bulk excluye actual; A/u2 y B/u1 intactos; posterior al commit token revocado falla; carreras/reintentos sin deadlock persistente |
| Tenant/RLS | Positivos A y B con binding de fixture autorizado; negativos CRUD/FK/joins/listados/funciones; falta/falsificación de GUC no establece contexto; rol real no owner |
| Cambio tenant | Verificar origen/destino/factor, no heredar permisos, rotación/auditoría atómicas, caches limpias; origen revocado mientras factor destino pendiente hace rollback |
| Pool/GC | Conexión A→B tras commit/rollback/cancelación/savepoint; contexto de xid activo no purgado; no snapshots de permiso entre requests |
| Idempotencia/outbox | Misma clave/hash no duplica efecto, distinto hash409, secreto no reentregado; mail lease/claim/expiry/duplicado SMTP no da segundo consumo |
| Auditoría/retención | Éxito+evento mismo commit; fallo canal separado; runtime no escribe/edita logs/política; tenant/actor preservados tras desactivación/restore |

Los 26 casos heredados de V3 siguen en block-1-test-cases.yaml, complementados por esta matriz. La aprobación funcional ahora consta como tal; falta binding/activación autorizada, no una nueva aprobación de su semántica.
