# Revisión independiente de 17 hallazgos Semgrep preexistentes

Fecha: 2026-10-20. Base: staging `646c9af496b2497a542ab58d96ae1e7b17b1ee81`. Integración: `c639403eeb195cc5cd0f96893d8503f2aa4ae4f7`.

Alcance: revisión estática de los 17 resultados de Semgrep 1.177.0, reglas locales sin modificar. No ejecuta los harnesses de PostgreSQL/OpenBao ni activa B1. Los 10 archivos afectados son byte a byte iguales a staging; comparación y localizaciones originales en `../implementation/demo-staging/evidence/semgrep-comparison.json`.

## Dictamen

**17 falsos positivos de vulnerabilidad en su contexto actual; ninguna vulnerabilidad explotable demostrada entre estos 17.** Esto no certifica todo B1. Las reglas los clasifican ERROR y el job continúa bloqueado: el análisis humano no altera su resultado ni concede una excepción automática.

| # | Archivo:línea | Regla / clasificación de riesgo | Evidencia del flujo |
|---|---|---|---|
| 1 | e2e/b1-real-postgres.spec.ts:116 | Import / informativo, FP | Especificador literal `otpauth`; los datos del QR no se usan para resolver el módulo. |
| 2 | e2e/b1-real-postgres.spec.ts:250 | Import / informativo, FP | Mismo literal `otpauth`; URI.parse actúa después de importar. |
| 3 | e2e/b1-recovery-postgres.spec.ts:39 | Import / informativo, FP | Literal `otpauth`; material del servidor solo alimenta el parser del autenticador. |
| 4 | e2e/b1-recovery-postgres.spec.ts:121 | Import / informativo, FP | Literal `otpauth`; ningún identificador de módulo controlado por respuesta HTTP. |
| 5 | e2e/b1-recovery-postgres.spec.ts:142 | Import / informativo, FP | Literal `otpauth`, también en contexto de prueba negativa. |
| 6 | e2e/b1-recovery-postgres.spec.ts:187 | Import / informativo, FP | Literal `otpauth`, independiente de entradas de recuperación. |
| 7 | lib/b1/approved-backend.ts:605 | Import / informativo, FP | Literal `otpauth`; binding/autorización no cambian el especificador. No es carga de código recibido del usuario. |
| 8 | lib/b1/password.ts:29 | Import / informativo, FP | Literal `argon2`; el password es argumento de hash, no ruta de módulo. |
| 9 | lib/b1/password.ts:66 | Import / informativo, FP | Literal `argon2`; encoded/password son datos de verificación, no código/import. |
| 10 | lib/b1/totp.ts:61 | Import / informativo, FP | Literal `otpauth`; secreto descifrado se entrega posteriormente a Secret/TOTP, no al cargador. |
| 11 | scripts/openbao-isolated-worker.mjs:26 | Import / informativo en harness confiable, FP contextual | Especificador variable, pero su único productor de repositorio es scripts/test-b1-openbao-integration.py:49: literal `./openbao-b1-integration.ts`, serializado por stdin a docker exec en contenedor de prueba propiedad del harness. No es endpoint HTTP ni dato de usuario. No ejecutar con stdin no confiable. |
| 12 | scripts/pg05-browser-backend.ts:108 | Import / informativo, FP | Literal `node:crypto`, módulo integrado en Node; ninguna dependencia de la entrada IPC. |
| 13 | scripts/openbao-b1-integration.ts:79 | Credencial / informativo, fixture sintética | Contraseña explícitamente sintética, usada para generar hashes de la prueba. Dominio fixture.invalid, PG por Unix socket en core; el ejecutor copia el módulo dentro del contenedor. No es secreto desplegado ni valor recuperado de infraestructura. |
| 14 | scripts/pg05-browser-backend.ts:33 | Credencial / informativo, fixture sintética | Passphrase fija de prueba; scripts/b1-real-browser-server.mjs:20–36 exige ID de contenedor, etiqueta de propiedad, NetworkMode=none, ausencia de puertos y mounts de host antes de ejecutar el backend. No se importa desde rutas de aplicación. |
| 15 | scripts/pg05-http-real.ts:19 | Credencial / informativo, fixture sintética | Mismo valor de fixture. scripts/pg-http-integration.py copia y ejecuta este runner dentro del contenedor PG propio, con conexión Unix socket y hostname fixture.invalid. No hay credencial de servicio externo. |
| 16 | e2e/b1-reset-postgres.spec.ts:95 | SSRF / informativo, FP | fetch se ejecuta en page.evaluate del navegador. Primer argumento constante `/auth/password/reset/authorize`; receipt solo va en JSON del body. No hay URL controlada por la entrada ni petición desde un servidor. |
| 17 | e2e/b1-reset-postgres.spec.ts:116 | SSRF / informativo, FP | Misma ruta relativa fija; foreign.targetUser/ticket solo en body. Es prueba negativa de aislamiento tenant (espera 403). No controla hostname/esquema/puerto. |

Los 11 imports literales fijan el módulo en código/lockfile; se ha distinguido explícitamente el único import variable. Las tres cadenas de prueba no son secretos reales: no deben reutilizarse fuera de estos fixtures. Las dos llamadas fetch no tienen un sink URL contaminado; la regla amplia confunde datos del body con destino de red.

## Revisión/corrección separada propuesta — NO implementada

Si el responsable B1/seguridad exige conformidad sintáctica con las reglas actuales, revisar en un PR independiente: imports estáticos conocidos en los 11 puntos literales; sustituir el selector de módulo del worker por una selección literal cerrada; generar credenciales aleatorias compartidas mediante el IPC de los fixtures y conservar las pruebas negativas de reset con destinos constantes reconocibles por el analizador. Medir inicialización, dependencias nativas y límites del harness antes de cambiar nada. Estas son propuestas, no vulnerabilidades confirmadas ni cambios autorizados a producción/B1.

No se han añadido `nosemgrep`, excludes, cambios de severidad, excepciones ni modificaciones de reglas/workflows. Un futuro ajuste de la regla de SSRF para limitar taint al argumento URL requiere revisión propia; no se realiza aquí. El aviso de parser del worker MapLibre minificado es una limitación adicional del análisis, separada de estos 17 hallazgos; su hash coincide con el paquete fijado 6.15.0.
