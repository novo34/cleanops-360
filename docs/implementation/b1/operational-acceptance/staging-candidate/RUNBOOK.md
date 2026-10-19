# Ejecución aislada preparada — NO EJECUTADA

Usar la solicitud única y RESOURCE_RECORD completos/firmados. Reutilizar
`../openbao/ACCEPTANCE.md` (OPS01–12/REC01–12) y
`../openbao/CUSTODY_AND_RECOVERY.md`; no crea otra matriz de aceptación.
Las pruebas funcionales ya aceptadas no se repiten como auditoría general.

## Secuencia y puntos de parada

1. Inventariar sin cambios primario/workload/backup/restore, país, rutas, discos,
   identidad del operador, otros servicios y capacidad. Comprobar sincronización
   de reloj, swap/core dumps desactivados, cifrado y acceso OS. STOP si una
   ubicación, soporte, custodia o fallo independiente no está acreditado.
2. Completar entradas no secretas para el renderer existente (un tenant por
   paquete). Solo offline, sin instalar nada:
   `python3 scripts/prepare-b1-openbao.py --inputs /private/approved-inputs.json --out /private/new-review-output`.
   Congelar hashes; comparar políticas exactas, nombres tenant/entorno, TTL,
   CIDRs y permisos de snapshot/restore. El renderer no valida residencia,
   custodios, firma de aprobación o retención; su salida no habilita ejecutar.
3. Tras autorización del registro y en recursos NUEVOS, preparar la release
   fijada por arquitectura. Verificar SHA256 y firmante por canal independiente.
   Instalar OpenBao nativo conforme al template existente: Raft
   /var/lib/openbao/raft, audit /var/log/openbao/audit.json; archivos TLS en
   /run/openbao-tls. Directorios cifrados, persistentes y de cuenta dedicada;
   no tmpfs para Raft/auditoría operativos. El ensayo CI en tmpfs no acredita
   durabilidad. No cambiar listener/ACL para acomodar un host no conforme.
4. TLS >=1.2, DNS SAN exacto, CA de confianza explícita, certificado cliente
   obligatorio. 8200 solo origen privado aprobado; 8201 solo peers aprobados
   (un nodo no necesita apertura pública). UI/raw/introspection/plugins OFF.
   Audit log_raw=false, hmac_accessor=true; comprobar fallo audit-deny.
5. Ceremonia con quórum elegido real, participaciones por persona/medio
   independientes, backups de shares y factores separados del snapshot.
   Configurar audit ANTES de claves/workloads; KVv2 CAS requerido y creación
   de IDs inmutables CAS0. Aplicar SOLO hashes exactos autorizados. Administrador
   humano temporal sin acceso reutilizable amplio, root revocado; credenciales
   de aplicación y snapshot/restore distintas. No shares/tokens en Git/CI.
6. Preparar staging conforme a operational-plan.json. Compose actual web/PG
   no contiene OpenBao, adaptador HTTP activo, WAL/backup operativo ni worker:
   NO usarlo como prueba de autenticación completa. OpenBao usa el candidato
   nativo recuperado; no se añade servicio oculto o imagen `latest` al Compose.
   La composición privada de ensayo existente se ejecuta en el workload
   aprobado, con synthetic fixtures y controles IPC/loopback existentes.
   Si su transporte local no puede usarse en el host designado sin cambiar
   contratos/ACL/runtime, STOP y documentar el hueco antes de implementar.
7. SOLO sintaxis de Compose (no up/build/pull/deploy) tras disponer del archivo
   privado aprobado: `docker compose --env-file /private/staging.env -f deploy/staging/compose.yaml config -q`.
   CLEANOPS_AUTH_ORIGIN=https://cleanops.nuvurent.com es la intención previa,
   no permiso de dominio público. Hasta autorización de ingress solo acceso
   privado con verificación TLS y origin coherente; sin puertos host publicados.
   Nunca conectar el superusuario bootstrap como identidad de aplicación.
8. Ejecutar obligaciones operativas siguientes y registrar PASS/FAIL/BLOCKED/SKIP
   con actor real, tiempos UTC, entorno/commit/config/policy/key-version hashes,
   recibo redactado y limpieza. Nada se marca aceptado por ejecutar el runbook.

## Pruebas operativas pendientes: alcance exacto

- REC01–02 / OPS05: sellar/reiniciar solo BAO-PRIMARY de ensayo; denegar sin
  quórum, share incorrecta y ausencia de custodio; restaurar acceso solo bajo
  ceremonia. Verificar pérdida de disponibilidad sin mecanismo de bypass.
- REC03–07 / OPS03–06: revocar cada workload/cert/SecretID, CA/SAN/cert caducado,
  key ID/version/purpose/tenant/env erróneos, intentos list/write/delete/admin,
  CAS ausente/stale/overwrite y audit sink lleno. Capturar denegación real y
  ausencia de sesión/éxito; nunca cuerpos del proveedor ni valores secretos.
- REC08 / OPS07: crear nuevo ID AEAD solo con CREATE/CAS0 autorizado; comprobar
  lectura exacta antigua/nueva, nuevas escrituras en el ID nuevo y recuperación
  de backups retenidos. Wrapping-key rotation conserva bytes/ID del data key;
  probar por separado. No hay writer SQL14 aprobado para recifrado persistente
  CAS ni migración multiversión HMAC. Esos subcasos permanecen BLOCKED si son
  necesarios: no simular cierre, cambiar bytes detrás de un ID, cambiar HMAC
  en caliente, usar SQL dueño o atribuir persistencia a un helper en memoria.
- REC09–10 / OPS08: backup cifrado independiente de PG+roles/WAL, Raft,
  TLS/config/catalogue y archivos requeridos, manifest/hash verificable.
  Alteración/truncado/sello incorrecto deben rechazar restore sin tocar origen.
  Destino RESTORE-CH fresco aislado; snapshot-force solo si expresamente firmado
  con hash y quórum original. Revocar credenciales temporales/restauradas y
  verificar identidad ordinaria + aislamiento antes de tráfico privado.
- REC11–12: probar rechazo/quarantena de ACTIVE/PREAUTH/trust/recovery/contadores
  OTP/outbox potencialmente obsoletos. Nunca restablecer autoridad por rewind.
  Si no se demuestra estado monotónico, mantener aislado, registrar BLOCKED y
  usar solo revocación/re-enrollment ya aprobados; ningún SQL/ACL nuevo.
  Transporte EMAIL simulado claramente identificado, sin SMTP externo.

## Medición de recuperación y residencia

RPO objetivo <=900 s; RTO <=14400 s, ya fijados, no inferidos de CI26.294 s.
Antes del fallo registrar recibos de commits de marcadores sintéticos con reloj
sincronizado, punto de recuperación coherente y secuencia monotónica externa.
Registrar t_incident, último commit confirmado antes del fallo y último commit
coherente recuperado. Pérdida observada = diferencia de puntos confirmados;
conservar detalle de marcadores perdidos/recuperados, lag de WAL y edad/duración
de snapshot. Una congelación previa de escrituras no demuestra RPO bajo carga.

Medir RTO desde t_incident/declaración de indisponibilidad hasta restauración,
quórum, reconciliación de seguridad y comprobaciones UI/API/PG/custodia completas
(t_service_validated); incluir espera real de personas y obtención de backups,
no solo tiempo del comando restore. Fracaso por exceder objetivos o carecer de
evidencia. Cadencia concreta debe cubrir duración+transferencia+lag y acordarse
antes de ejecutar; daily PG base backup + WAL continuo sigue siendo canónico.

Residencia: inventario/contrato/atestación física privada, país de backup/restore/
soporte/PKI y control de exportación; probar rutas denegadas. Publicar referencia
y hash, nunca dirección doméstica. Registrar sincronización, configuración
y ubicación de cada recurso; IP RFC1918 o cifrado no bastan.

## Revisión, manual y cierre

Entregar al revisor independiente source c6e95bef, SQL14 exacto y manifiesto de
este paquete; antes de ejecutar añadir build staging y hashes de configuración
renderizada, certificados públicos/identidades de política y evidencias OPS/REC.
Identificar persona/independencia/fecha/alcance, findings con severidad y
remediación verificada; los autores no firman su propia independencia.

Reutilizar SIN cambios los diez pasos de
`../../remaining/PO_MANUAL_DEMONSTRATION.md` y su
`PO_ACCEPTANCE_RECORD.json`. Añadir observaciones reales de indisponibilidad,
versiones de clave y recuperación; códigos/QR/URI/cookies nunca en capturas.
Registrar source/SQL/config/env/tester/UTC/outcome y recibos persistidos.
Los57 Chromium previos son automatización, no observación PO. Las144 comprobaciones
PG/OpenBao no sustituyen el recorrido UI real con la custodia designada.

Tras resultados completos y revisión sin bloqueantes, PO registra decisión real
en PHASE_ACCEPTANCE_TEMPLATE. No precargar ACCEPTED ni cerrar PR006/PR007,
B1 o AUTH-GATE-05. La activación runtime, release, SMTP y main quedan fuera.
