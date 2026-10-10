# CleanOps 360 — Gates de implementación (registro normalizado)

**Alcance:** estas condiciones son documentales o de verificación futura; no constituyen pruebas ejecutadas. Un gate tiene un solo código, una única condición y una fuente explícita.

| Gate | Fuente | Condición individual | Responsable funcional (rol) | Antes de | Estado |
|---|---|---|---|---|---|
| `ARC-G01` | `ARCHITECTURE.md` | / Proveedor VPS suizo / DDoS / WAF / Contratos, residencia y protección verificados / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `ARC-G02` | `ARCHITECTURE.md` | / Sesión absoluta / Valor aprobado y tests / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `ARC-G03` | `ARCHITECTURE.md` | / Máximos de archivo y cuotas / Límites de servidor/tenant probados / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `ARC-G04` | `ARCHITECTURE.md` | / PITR + archivos / Runbook, manifiesto y restore consistente probado / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `ARC-G05` | `ARCHITECTURE.md` | / RPO/RTO / Simulacro y métricas ≤ objetivos / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `ARC-G06` | `ARCHITECTURE.md` | / Offline por entidad / Matriz de conflictos, retry e idempotencia verificada / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `ARC-G07` | `ARCHITECTURE.md` | / IA proveedores / Registro y pruebas de bloqueo por residencia/política / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `ARC-G08` | `ARCHITECTURE.md` | / Normativa y envío / GAV/CCT vigente, retención, límites SMTP y condiciones Radar validadas / | DevOps / Security | Pre-despliegue | ABIERTO — evidencia pendiente |
| `AUTH-GATE-01` | `AUTHENTICATION_SPEC.md` | elegir duración absoluta y verificar configuración por roles | Authentication / Security | Pre-aceptación de Auth | ABIERTO — evidencia pendiente |
| `AUTH-GATE-02` | `AUTHENTICATION_SPEC.md` | parámetros de hash, limitadores/cooldowns/intentos conforme amenaza y carga | Authentication / Security | Pre-aceptación de Auth | ABIERTO — evidencia pendiente |
| `AUTH-GATE-03` | `AUTHENTICATION_SPEC.md` | protocolo de recuperación de cuenta y pérdida total de MFA | Authentication / Security | Pre-aceptación de Auth | ABIERTO — evidencia pendiente |
| `AUTH-GATE-04` | `AUTHENTICATION_SPEC.md` | inventario concreto de roles y matriz de riesgo/step-up | Authentication / Security | Pre-aceptación de Auth | ABIERTO — evidencia pendiente |
| `AUTH-GATE-05` | `AUTHENTICATION_SPEC.md` | esquema y endpoints definitivos. **No comenzar la fase de autenticación en producción sin resolver estas puertas.** | Authentication / Security | Pre-aceptación de Auth | ABIERTO — evidencia pendiente |
| `BKP-GATE-01` | `BACKUP_RECOVERY_SPEC.md` | herramienta, formato y consistencia de backup base/WAL | DevOps / Recovery | Pre-operación de datos reales | ABIERTO — evidencia pendiente |
| `BKP-GATE-02` | `BACKUP_RECOVERY_SPEC.md` | frecuencia real de archivos para cumplir RPO | DevOps / Recovery | Pre-operación de datos reales | ABIERTO — evidencia pendiente |
| `BKP-GATE-03` | `BACKUP_RECOVERY_SPEC.md` | proveedor suizo independiente y términos/seguridad | DevOps / Recovery | Pre-operación de datos reales | ABIERTO — evidencia pendiente |
| `BKP-GATE-04` | `BACKUP_RECOVERY_SPEC.md` | política retención y cifrado/claves | DevOps / Recovery | Pre-operación de datos reales | ABIERTO — evidencia pendiente |
| `BKP-GATE-05` | `BACKUP_RECOVERY_SPEC.md` | restauración BullMQ anti-replay | DevOps / Recovery | Pre-operación de datos reales | ABIERTO — evidencia pendiente |
| `BKP-GATE-06` | `BACKUP_RECOVERY_SPEC.md` | tests documentados sobre volumen representativo | DevOps / Recovery | Pre-operación de datos reales | ABIERTO — evidencia pendiente |
| `BKP-GATE-07` | `BACKUP_RECOVERY_SPEC.md` | capacidad de reemplazar VPS a tiempo. Todas son comprobaciones pendientes, no hechos implementados | DevOps / Recovery | Pre-operación de datos reales | ABIERTO — evidencia pendiente |
| `OFF-GATE-01` | `OFFLINE_SYNC_SPEC.md` | tabla exacta de operaciones offline por rol | Offline / Security | Pre-activación offline | ABIERTO — evidencia pendiente |
| `OFF-GATE-02` | `OFFLINE_SYNC_SPEC.md` | tamaños/cache TTL y borrado ante pérdida/robo | Offline / Security | Pre-activación offline | ABIERTO — evidencia pendiente |
| `OFF-GATE-03` | `OFFLINE_SYNC_SPEC.md` | contratos de API de cursor/versionado y migración IndexedDB | Offline / Security | Pre-activación offline | ABIERTO — evidencia pendiente |
| `OFF-GATE-04` | `OFFLINE_SYNC_SPEC.md` | resolución humana con UI y permisos | Offline / Security | Pre-activación offline | ABIERTO — evidencia pendiente |
| `OFF-GATE-05` | `OFFLINE_SYNC_SPEC.md` | retención y protección de fotos locales | Offline / Security | Pre-activación offline | ABIERTO — evidencia pendiente |
| `OFF-GATE-06` | `OFFLINE_SYNC_SPEC.md` | validación navegador/PWA de modo offline real. No asumir que estas decisiones técnicas ya están aprobadas | Offline / Security | Pre-activación offline | ABIERTO — evidencia pendiente |
| `G-EMP` | `EMPLOYEE_MANAGEMENT_SPEC.md` | Personal, ausencias, disponibilidad y equipos operativos probados E2E | People / Planning | Antes de publicar Planning | ABIERTO — evidencia pendiente |
| `G-CMP` | `COMPLIANCE_RULES_SPEC.md` | Reglas laborales efectivas aprobadas, bloqueo de publicación no conforme | Compliance / Planning | Antes de publicar Planning | ABIERTO — evidencia pendiente |
| `G-SVC-ONE` | `ONE_OFF_SERVICE_SPEC.md` | Flujo de servicio puntual completo con controles de facturación | Operations | Antes de activar servicio puntual | ABIERTO — evidencia pendiente |
| `G-SVC-MAINT` | `MAINTENANCE_CONTRACT_SPEC.md` | Contrato mantenimiento, recurrencia y renovaciones controladas | Operations / Contracts | Antes de activar mantenimiento | ABIERTO — evidencia pendiente |

**Total: 30 gates distintos.**

Se prohíbe aceptar un gate por coincidencia de palabras. La aceptación requiere evidencia, revisión de seguridad y, cuando corresponda, pruebas reales con la funcionalidad integrada.
