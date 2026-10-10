# CleanOps 360 — BACKUP_RECOVERY_SPEC

**Estado:** especificación documental derivada; sin implementación ni certificación de recuperación. **Fecha:** 2026-10-09.  
**Fuentes:** Product Master V3, SRS V1.1 (`REQ-INF-001`, `REQ-INF-003`, `REQ-INF-004`, recuperación/seguridad), `ARCHITECTURE.md`, `DATA_MODEL.md`.

## 1. Propósito
Definir copias, conservación, restauración coordinada y pruebas de continuidad de una primera instalación en **un único VPS suizo** con Docker, PostgreSQL, Redis/BullMQ y archivos locales privados. Las copias independientes permanecen en infraestructura físicamente separada **en Suiza**. No proclamar alta disponibilidad por disponer de backups.

## 2. Objetivos y restricciones normativas
- Backups completos **diarios** de PostgreSQL y archivos, configuración y material de secretos recuperable de forma segura.
- Archivado continuo de WAL PostgreSQL para restauración a un punto en el tiempo (PITR).
- Copia independiente, cifrada, con credenciales separadas del VPS principal, control de acceso y residencia suiza verificable.
- RPO **objetivo ≤ 15 minutos** y RTO **objetivo ≤ 4 horas**, medidos mediante ejercicios reproducibles que incluyan DB, archivos y aplicación; no son garantía hasta demostrar cumplimiento.
- Redis/BullMQ contiene estado operativo de tareas que puede no recuperarse al restaurar DB: documentar reconstrucción segura, deduplicación y reconciliación tras recuperación.
- La política de retención de backups debe respetar deberes legales por categoría y tenant, bloqueos legales y borrado; aún no existe plazo único aprobado.

## 3. Componentes protegidos y criticidad
| Activo | Método/garantía documental requerida | Riesgo si falta |
|---|---|---|
| PostgreSQL | backup base consistente + WAL completo, validación de cadena, PITR | pérdida de transacciones |
| Documentos/fotos/planos | copia incremental/completa protegida y catálogo de versiones/checksums | DB apunta a archivos inexistentes |
| Configuración Docker / manifests | artefactos de despliegue versionados, restaurables sin secretos embebidos | aplicación no arranca |
| Secretos y claves | repositorio de secretos separado cifrado + procedimiento de custodia | datos irrecuperables o exposición |
| Redis/BullMQ | plan de persistencia/rehidratación y deduplicación de tareas | envío duplicado o tareas perdidas |
| Logs y auditoría | exportación/retenido según clasificación y política legal | pérdida de trazabilidad |
| Objetos locales offline de usuarios | fuera del alcance de backup VPS; resincronización pendiente | no asumir respaldo central previo al sync |

## 4. Arquitectura documental
`VPS suizo (PostgreSQL + app + archivos + Redis/workers)` → canal cifrado de backup → `repositorio suizo independiente` con credenciales de solo escritura/restricciones de borrado apropiadas → verificador fuera del ciclo de backup → entorno aislado de prueba de restauración. El repositorio remoto no debe estar montado con permisos amplios permanentes que permitan a un atacante borrar todas las copias.

La restauración de VPS perdido requiere capacidad de aprovisionar host sustitutivo en Suiza, restaurar imágenes/configuración y conectar servicios de red; **esto no ha sido validado operativamente**.

## 5. Coherencia entre base de datos y archivos
Riesgo: un backup PITR a `T` puede referenciar un fichero creado en fecha `T` que no está aún en la copia independiente. El plan exigirá:
1. Registrar en DB el estado del archivo (`PENDING`, `SCANNING`, `READY`, `FAILED`) y checksum/referencia de almacenamiento; exponer solo `READY`.
2. Garantizar persistencia física de archivo y verificación antes de confirmar su disponibilidad lógica, usando transición idempotente y reconciliador.
3. Registrar puntos de control de backup con marcador de tiempo de DB/WAL y manifiesto/checksums de archivos; el punto restaurable elegido exige correspondencia demostrable de ambas capas.
4. Conservar versiones de archivos y tombstones conforme retención para evitar que una eliminación posterior invalide un punto de recuperación previo.
5. En restore, verificar referencias DB → archivo y archivo → metadatos, reportar faltantes/huérfanos; no ocultar fallos ni marcar restauración correcta hasta resolverlos.

**Importante:** snapshot diario de archivos por sí solo puede no satisfacer RPO 15 minutos para archivos. La estrategia de copias incrementales/versionado debe demostrarse con cambios de ficheros durante el intervalo; sin evidencia, el objetivo global se considera **NO VERIFICADO**.

## 6. Flujo de backup
- Scheduler Redis/BullMQ coordina tareas, pero el backup debe seguir siendo recuperable si Redis falla. Registrar `backup_run_id`, activos incluidos, inicio/fin, checkpoint, hashes, resultados, ubicación, clave/versionado y alertas.
- Base PostgreSQL: backup consistente mediante herramienta probada y verificación de WAL continuo; no usar una copia arbitraria de directorio activo sin protocolo de consistencia.
- Archivos: backup con dedup y checksums, protección contra corrupción/ransomware; política diferenciada de archivos temporales y definitivos.
- Configuración/secretos: rotación, exportación cifrada, mecanismo de recuperación con custodia independiente; jamás subir secretos en texto plano al repositorio.
- Fallo de backup, pérdida de cadena WAL, cuota insuficiente o backup que no puede descifrarse → alerta operativa y estado `UNHEALTHY`; reintentar con límites, sin falsear cobertura.

## 7. Secuencia de recuperación completa
1. Declarar incidente, responsable y hora de inicio, elegir `target_recovery_time` válido según cadena WAL + cobertura de archivos.
2. Aislar el VPS comprometido y proteger evidencia; revocar credenciales si hay incidente de seguridad.
3. Provisionar entorno sustitutivo suizo aislado con versión compatible de despliegue, red y secretos recuperados.
4. Restaurar PostgreSQL base + WAL hasta instante acordado, verificar integridad, aislamiento tenant, esquema/migraciones y auditoría.
5. Restaurar archivos correspondientes al mismo punto lógico, comprobar inventario/checksums y coherencia de referencias.
6. Restaurar configuración y API con servicios externos de correo/IA en modo seguro (envíos automáticos deshabilitados mientras se verifica).
7. Recuperar/reconciliar BullMQ con estado persistido: `idempotency keys`, email message ids, factura ids, webhook ids; **no reemitir** mensajes comerciales, facturas, pagos o cambios irreversibles ya ejecutados.
8. Ejecutar smoke tests de Auth, lectura CRM, documento privado, oportunidad → pipeline, permisos multi-tenant, trazabilidad, observabilidad.
9. Reabrir tráfico bajo aprobación del responsable, reactivar workers por etapas, documentar resultados y comunicar incidente conforme obligaciones aplicables.

## 8. Medición RPO/RTO
- `RPO_observado = momento_del_último_dato_confirmado_antes_del_fallo − momento_del_último_dato_efectivamente_restaurado` medido en eventos testigo de DB **y archivos**. Exigir ≤ 15 minutos para afirmar objetivo alcanzado.
- `RTO_observado = inicio_del_incidente/indisponibilidad − momento_del_restablecimiento_validado` expresado como duración positiva entre instantes (inicio a servicio funcional). Exigir ≤ 4 horas.
- Registrar escenario, dataset, tamaño, frecuencia WAL/archivos, versiones, cronómetro y pasos manuales. Si el RPO o RTO supera objetivo, estado `FAILED`, plan correctivo y nueva prueba antes de afirmar cumplimiento.
- Ensayos: corrupción lógica DB; borrado accidental de archivos; pérdida total VPS; pérdida repositorio de backups; fallo durante WAL; restauración a versión compatible; workers en cola con email pendiente. Prueba de recuperación cruzada antes de declarar producción preparada.

## 9. Retención, privacidad y gobernanza
Configuración por tenant y categoría con mínimos legales validados, legal hold y registros de destrucción; copias de seguridad no deben convertirse en conservación indefinida. Cifrado en tránsito/reposo y registro de accesos. Verificar contractual y técnicamente que operador, réplicas, soporte y almacenamiento permanezcan conforme política suiza aprobada; terceros internacionales requieren evaluación aparte. Ensayar recuperación de claves y restauración sin depender de sesión viva del VPS original.

## 10. Evidencia y aceptación
Checklist documental por ejercicio: `restore_id`, `backup_set`, destino, hora objetivo, WAL íntegro, manifiesto archivos, integridad tenant, pruebas funcionales, fecha/tiempo, RPO observado, RTO observado, incidencias, aprobación humana. `PASS` solo con DB + ficheros + app + pruebas funcionales y objetivos medidos; `PARTIAL` no equivale a pass. Las métricas RPO/RTO deben revisarse con evolución de tamaño de datos/carga.

## 11. Puertas previas al despliegue
`BKP-GATE-01` herramienta, formato y consistencia de backup base/WAL; `BKP-GATE-02` frecuencia real de archivos para cumplir RPO; `BKP-GATE-03` proveedor suizo independiente y términos/seguridad; `BKP-GATE-04` política retención y cifrado/claves; `BKP-GATE-05` restauración BullMQ anti-replay; `BKP-GATE-06` tests documentados sobre volumen representativo; `BKP-GATE-07` capacidad de reemplazar VPS a tiempo. Todas son comprobaciones pendientes, no hechos implementados.
