# B1 staging — gate de integración controlada (2026-10-30)

Estado: **PREPARADO PARA REVISIÓN; NO AUTORIZA DESPLIEGUE NI ACTIVACIÓN**.

## Fuente comprobada

- Base: `staging` en `d3ea84b38fd1574db1610f03b59c8c4a5050ac72`, sin divergencia frente a `prep/installation-catalog-20261030` en la comparación del 30-10-2026.
- Rama de preparación: `prep/installation-catalog-20261030`.
- El checkout operativo Dokploy informado previamente conserva cambios locales en `deploy/staging/compose.yaml` para PG/TLS/HBA. No sobrescribir ni normalizar esos bytes sin reconciliación verificable.
- El contrato de rutas en `lib/b1/runtime.ts` llama `composeTrustedRuntime({ kind: 'closed' })`. La preparación de credenciales no activa login.
- Última suite B1 compartida por el owner: 269 casos, 253 PASS / 16 FAIL en copia montada desde Windows; posteriores commits corrigen el escenario bootstrap y fijan EOL LF. **Sin nuevo resultado completo; no afirmar PASS.**

## Orden obligatorio y condiciones de parada

1. **Preflight Git/archivos (solo lectura):** constatar SHA actual de `origin/staging`, identidad del compose efectivamente usado por Dokploy, sus modificaciones no publicadas y SHA de los archivos PG/TLS/HBA. Abortar si cualquiera difiere del conjunto previamente verificado.
2. **Reconciliación sin sustitución:** derivar el cambio mínimo sobre el Compose *efectivamente operativo*, conservando imagen/digest, mounts, servicios, redes, volúmenes, secretos, rutas, políticas PG/TLS/HBA y arranque existentes. La rama Git de preparación NO es un reemplazo íntegro del Compose de Dokploy.
3. **Render y análisis inerte:** validar Compose, perfiles, rutas de archivo y redes existentes; verificar permisos POSIX, usuario/grupo del consumidor, sink tmpfs, Agent cert auto-auth y ausencia de puertos públicos. No recrear ni reiniciar PG, OpenBao ni web.
4. **Verificación en Linux desde bytes Git:** ejecutar TypeScript y pruebas B1 sobre checkout limpio con finales de línea originales. Archivar resultados y correlacionarlos con SHA. Los 16 fallos anteriores no pueden cerrarse por inferencia. Mantener controles de hashes; no cambiar manifest, aprobaciones o contratos para forzar PASS.
5. **Gate de runtime:** presentar revisión exacta de cómo se seleccionará el backend privado en inicio del servidor, cómo se cerrará el pool, qué fuentes privadas se montan y cómo el fallo de dependencias da 503 sin emitir cookies. Prohibida activación por headers, query, cookies o un selector ambiental no revisado.
6. **Aprobación separada para despliegue:** disponer de diff, inventario, plan de rollback verificable y pruebas del Agent sin exponer tokens; obtener autorización explícita antes de modificar servicios.
7. **Ejecución controlada, solo tras aprobación:** desplegar Agent/web bajo los límites aprobados y demostrar renovación/reautenticación del Agent. Ninguna recreación de PG/Bao, cambios SQL ni certificados.
8. **FIRST-ACTOR y aceptación:** requieren autorización específica; después probar login real → TOTP → sesión activa, recuperación/fallo cerrado, validación independiente y aceptación formal PR006/PR007. Solo entonces actualizar SRS/Product Master/TODO y declarar B1 cerrado.

## Prohibiciones vigentes

No PR/merge a staging o main, no despliegue Dokploy, no SSH/VPS mutable, no nuevas migraciones, no tocar root token de KeePassXC, no imprimir secretos, no reemplazar archivos privados, no recrear volúmenes ni redes. Evidencias: hashes/rutas no sensibles, checks y estado, nunca contenido de credenciales.
