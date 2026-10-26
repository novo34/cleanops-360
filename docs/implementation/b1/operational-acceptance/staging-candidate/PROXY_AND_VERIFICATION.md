# Recuperación y comprobación dirigida — 2026-10-19

PR #7 draft/open, HEAD c6e95bef9626fb26f88a93068fd206523a4433eb.
Comentarios6265353767,6265414562,6265436750 y6265480712 publicados;
reporte recovery/2026-10-19-integration.json presente: source ca32fcf0,
run39239447182/job118016424543,144/144 PASS y cleanup PASS.
CI HEAD B1 run39239818720 y E1 run39239818786 SUCCESS verificados.
No se repitieron pruebas funcionales históricas ni se les atribuyó aceptación operativa.

## Proxy Git local: BLOQUEADO, alternativa funcionando

Copia original /workspace/cleanops-360: rama work, HEAD d522e2e, sin cambios locales.
`git fetch origin` falla conectando proxy:8080 (connection refused, antes de
autenticación). Nombre proxy resuelve; política HTTP unrestricted/enforced.
Estado del entorno cloud: sin bindings de secretos/identidades salientes.
No es evidencia de token Git inválido ni denegación de acceso al repositorio.

Sin modificar Git/configuración del proxy, rutas, CA, credenciales o commits;
sin unset proxy, bypass de red, reset, clean, force-push o login interactivo.
El conector GitHub permite lecturas y publicación con expected_sha/fast-forward.
La reparación del sidecar corresponde al entorno administrado; repetir fetch
solo cuando el servicio esté recuperado. No llamar sincronizado al checkout antiguo.
Área local de preparación separada: /workspace/b1-operational-candidate.

Socket Docker local: operación no permitida; no se inició/reinició daemon.
Compose config -q PASS sobre el Compose exacto de staging, usando origen staging.invalid y
archivo temporal sintético de validación eliminado al terminar. Es validación offline;
no se crean contenedores ni secretos reales, no pull/build/up ni contacto con Dokploy.

## Comprobación del candidato existente

Renderer/template/inputs/ACL source recuperados exactamente por Git blob.
Una copia por apply_patch añadió un salto final extra; la primera comprobación
local de SHA SQL14 falló por esa copia. Se recuperaron bytes exactos contra
Git blob, sin modificar SQL en Git; segundo ensayo6/6 PASS. No fallo SQL corregido.

Seis pruebas existentes test_b1_openbao_preparation.py PASS: TLS/mTLS y exclusión
de servicios peligrosos; ACL read exacta sin default; CREATE/CAS y separación
backup/restore/force; denegación de entradas peligrosas; registro vacío no
renderizable; SHA SQL14 inalterado. Prueba offline, no ensayo operativo.
MANIFEST.json histórico coincide con los archivos disponibles verificados;
se añade un manifiesto actual de referencias, sin reescribir evidencia histórica.

OpenBao candidato v2.7.1, amd64 SHA256
0e2f1ce10d124e03112b50dd2fbec6b78003783253bc3a91587938f39d1e2243;
arm64 SHA2562b3807d90f224df05d4fe1fdede7f052d2227596c648a56bd291381f8fd01840.
El digest amd64 fue ejecutado en CI; confianza independiente de firma/revisión
de advisories en el host real sigue pendiente. No descarga/instalación nueva aquí.

Template: TLS >=1.2 y mTLS obligatorio; UI/raw/introspection/plugins OFF;
Raft local privado; audit archivo privado log_raw=false/hmac_accessor=true.
Raft requiere persistencia cifrada, controles de memoria y energía del host real.
ACL JSON existente: scopes exactos de tenant/entorno/propósito/ID, CAS requerido,
sin list/update/delete de workloads ni herencia default; permisos de snapshot,
restore normal y snapshot-force separados. Sin edición o instalación de ACL.

## Staging: divergencia registrada, sin integración

HEAD permanente c85b49870f31efd802216d778b1808c3cc4c4509. Comparación real por
blobs (no solo diff three-dot de GitHub): custody-composition y harness nativo
ya coinciden con B1; el driver/test de pool, test estático de wiring, evidencia y
dos workflows difieren. Archivos deploy/staging/workflows staging existen solo
allí y deben preservarse. `operational-plan.json` fija la integración mínima
propuesta; ninguna rama se movió y no se hizo merge/cherry-pick.

Compose publicado: web+PG16, red interna, sin puertos host ni Traefik, PG bootstrap
no usado como identidad runtime, sin SQL/migración/init automático. UI health200
no prueba autenticación. No OpenBao, WAL/backup completo ni runner privado activos
en ese Compose; este paquete no afirma que lo estén. Autodeploy debe permanecer
OFF; el estado real en Dokploy no se inspeccionó ni cambió.
