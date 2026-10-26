# Solicitud única B1-OPER-STAGING-01 — BORRADOR, NO AUTORIZADA

Candidato preparado el 2026-10-19 sobre B1 `c6e95bef9626fb26f88a93068fd206523a4433eb`
y staging `c85b49870f31efd802216d778b1808c3cc4c4509`. B1 42/44; PR006,
PR007 y AUTH-GATE-05 OPEN; runtime closedBackend. No funcionalidades nuevas.

Esta es la única solicitud operativa de este paquete. El registro
[RESOURCE_RECORD.json](RESOURCE_RECORD.json) debe completarse con referencias NO
secretas antes de solicitar una firma ejecutiva. Una aprobación genérica, campos
vacíos o una propuesta de quórum no autorizan aprovisionamiento. Direcciones
físicas, nombres de red privados y valores secretos van en el inventario privado;
en Git solo identificadores opacos, huellas y referencia a su aprobación.

## Recursos y residencia a identificar

|ID|Recurso mínimo para el ensayo operativo|Situación|
|---|---|---|
|BAO-PRIMARY|Una VM Linux dedicada no productiva, un nodo Raft, cuenta OS propia, disco cifrado y auditoría persistente; propuesta de capacidad inicial 2 vCPU/4 GiB/20 GiB para OpenBao, sujeta a medición.|Modelo previsto: servidor doméstico suizo portable. Activo, emplazamiento, arquitectura, cifrado, capacidad, UPS y operador pendientes. No HA inferida.|
|B1-WORKLOAD|VM/entorno no productivo para Next.js, PG16, ejecutor privado de B1, emisor y worker separados; navegador PO sin acceso a claves.|Hostinger/Dokploy es una opción prevista, no residencia suiza verificada. Web/PG ya proponen 0,65 CPU/768 MiB y 0,6 CPU/1 GiB; falta margen OS, build, WAL, auditoría y backups. No es dimensionamiento total aceptado.|
|BACKUP-CH|Destino cifrado suizo con control independiente, fuera del dominio de fallo del primario; PG/WAL, Raft, configuración, catálogo y archivos requeridos.|Ubicación, cuenta, retención, inmutabilidad, custodios de descifrado y capacidad pendientes. Otro volumen del mismo host no basta.|
|RESTORE-CH|Destino suizo NUEVO, aislado y temporal para restaurar PG y OpenBao; inventario y límite de coste aprobados.|No usar primario, datos existentes ni infraestructura de otros proyectos.|
|PO-REVIEW|Puesto/route privada autorizados para PO y revisor independiente, acceso temporal y evidencia redactada.|Personas, ubicación, ruta y fechas pendientes.|

Se documentará procesamiento, discos, réplicas, copias, medios de custodia, PKI,
logs y acceso de operadores/soporte. Una IP privada, un disco cifrado o un dominio
no demuestran país. Si el VPS o el ejecutor de criptografía está fuera de Suiza,
no se le entregan claves ni datos B1: STOP hasta elegir una ruta conforme.
El servidor doméstico y el VPS no se declaran aprobados por esta preparación.

## Custodia, roles y material privado

Principal confirmado: propietario del proyecto (`novo34`); identidad legal y
referencia privada de custodia por registrar. Propuesta preferente: Shamir 2 de 3,
con dos personas adicionales reales e independientes, una participación por persona.
Solo es viable tras nombrarlas y verificar sus medios suizos de recuperación.
Alternativa 2 de 2: requiere elección expresa y aceptación de que la ausencia o
pérdida de cualquiera bloquea recuperación; no hay cambio automático a este esquema.
No auto-unseal/HSM/KMS nuevo en este alcance.

Roles propuestos reutilizan exactamente el renderer existente, sin ampliar ACL:
identity-verifier (TOTP y HMAC permitidos), enrollment-issuer (AEAD asignadas),
mail-worker (solo mail AEAD), key-creator (CREATE/CAS0 en IDs enumerados),
snapshot-reader (solo snapshot), restore-operator (restore mismo sello) y
restore-breakglass (solo snapshot-force sobre destino fresco expresamente
identificado). Un paquete por tenant, sin comodines/listado ni política default.
Administrador humano de políticas/roles: identidad y procedimiento pendientes;
ninguna ACL administrativa amplia se inventa o instala. Revisor independiente
distinto de los autores; PO realiza sus propias observaciones.

Material a generar/injectar SOLO tras autorización: password bootstrap PG;
credenciales ordinarias de servicios PG; CA/certificados/llaves TLS y mTLS;
RoleID + SecretID de un uso response-wrapped por workload; tokens de vida corta;
claves CSPRNG de 32 bytes por tenant/propósito/ID/version; participaciones Shamir;
claves independientes de cifrado de backups y medios de custodia. El token root
de inicialización es temporal y se revoca tras verificar el acceso mínimo.
Secretos fuera de Git/chat/CI/argumentos/logs; inventario público sin bytes.

El archivo previsto `/opt/cleanops360/secrets/postgres_bootstrap_password` NO se
ha comprobado en el VPS. No se presume existente ni se crea ahora. TTL/maxTTL,
SecretID TTL, CIDRs, IDs/versiones, retención, cadencia, presupuesto de cifrados/
nonces y revisión de rotación quedan sin valor operativo hasta aprobación.

## Alcance exacto que debe firmarse en un solo registro

1. Aprobar inventario privado de los cinco recursos, residencia, red, costes,
   responsables, quórum elegido, mecanismo de inyección y parámetros completos.
   Elegir arquitectura/release fijada en release-pin.json; verificar digest y
   confianza independiente del firmante/advisories ANTES de instalar. Un nuevo
   release/digest o política distinta exige revisar este mismo candidato.
2. Aprobar la integración revisada de los blobs indicados en
   `deploy/staging/operational-plan.json` sobre la rama permanente staging.
   Preservar su Compose, Dockerfile, workflows y rama Dokploy. No integrar ramas
   enteras a ciegas: las historias divergen. Nada se ha cherry-picked/mergeado.
3. Aprobar instalación aislada, init/unseal, TLS/mTLS, audit sink privado, KVv2/CAS,
   y aplicación de los archivos EXACTOS del renderer, cuyos hashes deberán
   añadirse al registro tras completar entradas. Esto NO aprueba cambios SQL/ACL.
   SQL14 solo podrá instalarse en un PG16 NUEVO nombrado, con blob
   `1971a9fdc5c1f3fd1fcb5f6706459678e5399256` y SHA256
   `965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa`.
   Ninguna actualización de BD existente ni migración alternativa.
4. Aprobar creación de material de ENSAYO no productivo y separación de workloads;
   ejecución privada del adaptador existente, sin cablear runtime.ts. El Compose
   web actual conserva closedBackend: desplegar la UI no demuestra login operativo.
5. Aprobar REC01–12 sobre esos recursos, captura redactada, backups cifrados y
   restauración en RESTORE-CH. Snapshot-force solo con destino/hash/quórum original
   expresamente consignados; jamás sobre el origen. Inyectar fallos solo en
   recursos propios. Preservar evidencias, revocar credenciales temporales y
   eliminar únicamente recursos temporales inventariados.
6. Aprobar acceso temporal del revisor y sesión PO de diez pasos existentes.
   Registrar resultados reales; la aprobación de ejecutar NO es aceptación PR007.

Excluidos: producción, datos de clientes, SMTP externo, DNS/puertos públicos,
cambio de rama/configuración Dokploy, Autodeploy, merge main, activación
closedBackend, nuevos contratos SQL/ACL, persistencia de recifrado sin CAS aprobada
o migración HMAC no implementada. Si se desea ejecutar específicamente en
Hostinger/Dokploy, su recurso, región y operaciones de instalación deben nombrarse
en el registro; su URL no constituye autorización.

## Condiciones de salida

PR006 sigue OPEN hasta evidencia de residencia/custodia, lifecycle/recovery completo,
RPO <=15 min y RTO <=4 h, revisión independiente sin bloqueantes y observaciones PO.
No se acepta un REC obligatorio BLOCKED/SKIP ni se sustituye una carencia contractual
por SQL de propietario. PR007 sigue OPEN hasta decisión formal real del PO usando
PHASE_ACCEPTANCE_TEMPLATE. B1 y AUTH-GATE-05 no cambian por firmar esta solicitud.

Siguiente operación segura: rellenar el registro NO secreto con referencias a
recursos/personas reales; renderizar offline con el script existente y congelar
sus hashes para revisión. No firma, instalación ni despliegue se han realizado.
