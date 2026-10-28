# Evidencia OPENBAO-STAGING-01 — 28/10/2026

Base verificada por conector GitHub: staging a217cfeda74431b77ffa30d117febb62695c70d0.
CRM-01 09c578137860cfc3726e67a21304a228c0657061 existe; no se actualiza su ref.
La copia de revisión /workspace/openbao-staging-01 se materializó desde blobs
remotos de esa base. El checkout /workspace/cleanops-360 quedó intacto.
No se afirma checkout Git local de staging: el objeto no estaba disponible.

## PASS

- Docker Compose v2.40.3 local resuelve include sin iniciar Docker services.
  Servidor observado por propietario: v5.0.2; ejecución allí NO realizada.
- Comparación config --no-interpolate --no-path-resolution --format json antes/
  después: modelos completos web y postgres iguales, volumen pgdata igual;
  Bao solo custody interna, sin ports, traefik.enable=false.
- node --check scripts/staging-bao-health.mjs; sintaxis Python de ambos renderers.
- Cuatro tests existentes Preparation: reproducible_private_tls, exact_read_scopes,
  creator_has_no_update y public_addresses_missing_ttls (nombres completos en
  tests/static/test_b1_openbao_preparation.py). 4/4 PASS en 0.003s.
- Seis tests existentes Synthetic: offline_consolidation, hostinger_non_swiss,
  unknown_low_stale_capacity, non_synthetic_data_smtp_cost_and_quorum,
  network_scope y merged_compose. 6/6 PASS en 0.366s, solo render/config offline.
  Fixtures de UUID/TTL de estos tests no son decisiones de staging.
- Ninguna clave, token, init/unseal, SQL ni servicio generado/ejecutado.

## FAIL

- Transporte Git CLI: proxy:8080 rechaza conexión; publicación vía conector GitHub.
- Primer control del consolidator con include + -f overlay duplicado falló con
  OFFLINE_COMPOSE_MERGE_FAILED. Corregido en su punto canónico y prueba existente;
  revalidación PASS entre las seis pruebas anteriores. Sin fallo estático pendiente.
- Gate de capacidad existente: prepare-staging-synthetic.py retorna BLOCKED/exit2
  con RESOURCE_RECORD original no cumplimentado. Es rechazo esperado; observaciones
  parciales no sustituyen medición con hora, CPU disponible e aislamiento.

## SKIP

- Compose v5.0.2 exacto y modelo efectivo inyectado por Dokploy, ingress en vivo,
  autodeploy, acceso VPS, red/rutas y capacidad fresca: no autorizados aquí.
- Binario OpenBao, build de imagen, verificación independiente de firma/advisories,
  TLS efectivo y permisos de mounts, ceremonia, audit fail-closed, recuperación y
  workloads: no ejecutados. Preparación no acredita instalación ni custodia.
- Suite completa de integración y tests SQL: fuera del alcance autorizado.
- Revisión independiente del commit final: pendiente; este informe no es dictamen
  independiente ni autorización de merge/despliegue.

## SHA256 de los archivos propuestos (este informe se excluye a sí mismo)

6bb5fd674a8e9df9cdb36178efa67490de2c6e1fe89330accb81fc8738e96502  deploy/staging/compose.yaml

091ce723f49e93c0b98f1fd72ace6f20b59fe81bd5581e5b494acafa12da7528  scripts/prepare-staging-synthetic.py

6f1344734f7d94e491268466453e14fa9b61ecfac6919b1353ebebc8c6581e49  tests/static/test_staging_synthetic.py

08a8d31713bf3b3d6f0488b01cdf4ce2da80641b12753b10974c8231cbec11ee  deploy/staging/openbao/server-inputs.json

2a49044e12b67083a31977af13277a38172e99e4fdcbb8b2e3869160114ffebf  deploy/staging/openbao/OPENBAO-STAGING-01.md

