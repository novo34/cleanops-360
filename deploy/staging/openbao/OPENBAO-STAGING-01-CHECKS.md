# OPENBAO-STAGING-01 — gate selectivo, evidencia 28/10/2026

Corrección sobre f506a2870e1bc46a7201fa24b8aac18b20302e08 en PR #27.
Historial de consumidores, pruebas y limitaciones anteriores: este mismo archivo
en f506a287. Se conserva el mecanismo de mantenimiento, ownership y include único.
No se ejecutó instalación, build, SQL, backup, servicios ni generación de secretos.

## QG-0 / decisión

Se reutilizan capacity() en prepare-staging-synthetic.py, RESOURCE_RECORD y el
harness test_staging_synthetic.py. No otro gate/runner. Diff mínimo: parámetro
scope con default full-stack y selector CLI explícito, rama de presupuesto
incremental, dos regresiones en el harness y documentación/evidencia existentes.
No cambia Compose, Dockerfile, healthcheck ni runtime. Inventario consultado:
capacity(), consumidores CLI/render/manifest, budget/capacity del registro,
Dockerfile (descarga/descompresión, no build web), pruebas de capacidad y controles
de mantenimiento. Riesgo: confundir idle con reserva o límites runtime con build;
ambos se rechazan explícitamente. Plan de prueba: fronteras y desconocidos offline.

2000 millicpus/4608 MiB siguen siendo el control full-stack. No aplican como
mínimo incremental de añadir solo Bao sellado. Nuevo scope explícito:
openbao-sealed-addition: 2816 MiB (512+768+1536 incluyendo build), CPU pico
max(500, buildMillicpus) por fases sin solapamiento. El build conserva memoria y
disco presupuestados; su CPU/envolvente no se presume conocida. Propuesta build
500 millicpus/1536 MiB, pendiente de comprobar capacidad/límites reales del builder
existente; no se rellena buildMillicpus ni buildEnvelopeVerified con la propuesta.

## Evidencia aportada / procedencia

Propietario, 28/10/2026 14:31:16 Europe/Madrid (12:31:16 UTC): 2 CPU compartidas,
5687 MiB disponibles, 83 GB libres, sin swap; idle 74/73/84/94/92 y steal
10/13/10/5/7 %. TLS/permisos/Compose comprobados por propietario; variables en
Dokploy/.env, Autodeploy OFF. Registrado como observaciones atribuidas, sin
inspeccionar secretos ni auditar el VPS aquí. Disco normalizado conservadoramente
a 79154 MiB asumiendo GB decimales. Arquitectura amd64: observación previa x86_64.
No se infieren UUID/grants/TTL, CPU reservada ni autorizaciones de instalación.

## PASS

10/10 pruebas offline en 0.009s, subprocess.run bloqueado globalmente. Sin Docker,
Compose ni procesos externos durante esta ejecución. Dos regresiones nuevas:
- test_selective_capacity_keeps_full_stack_gate_and_counts_build
- test_selective_capacity_rejects_unknown_build_cpu_scope_and_stale_data

Acreditan full-stack intacto (2000/4608), selectivo 2816, pico build mayor que
runtime, memoria/CPU insuficiente, build null/0/negativo/bool, datos obsoletos o
futuros, memoria/CPU desconocidas, scope desconocido e idle sin conversión a CPU.
También pasan 8 pruebas existentes de mantenimiento/include, capacidad y fronteras
sintéticas (selección reproducible a continuación). Sintaxis Python por compile().

```python
import importlib.util, unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('suite', 'tests/static/test_staging_synthetic.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
names = [n for n in dir(m.Synthetic) if n.startswith('test_') and any(v in n for v in
 ['selective_capacity', 'canonical_include', 'maintenance_', 'hostinger_non_swiss',
  'unknown_low_stale', 'non_synthetic_data', 'network_scope', 'backup_is_blocked'])]
with patch('subprocess.run', side_effect=AssertionError('External processes forbidden')):
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(m.Synthetic(n) for n in names))
assert result.wasSuccessful()
```

## FAIL / BLOCKED

Evaluación del registro a la hora observada, now=2026-10-28T12:31:16Z (evaluación
histórica explícita, no reloj falsificado para una aplicación actual): BLOCKED.
Memoria/disco superan presupuesto aritmético; faltan webPostgresUnchanged,
buildOpenbaoOnly, buildEnvelopeVerified, buildMillicpus, availableMillicpus,
subnetConflictChecked y otherProjectsIsolated. Las dos primeras condiciones
requieren comprobar el plan efectivo, no significan que se deba tocar web/PG.
No cambiar a true sin evidencia. La CLI real siempre usa su reloj actual y
rechaza datos futuros o >24h. Ningún fallo de regresión actual.

Consulta GET security-advisories del repositorio OpenBao rechazada HTTP400 por
conector (endpoint no permitido): catálogo actual no comprobado. No equivale a
cero advisories ni a revisión de rangos afectados. Metadatos release v2.7.1 sí
leídos: firmas presentes, fixes GHSA enumerados en el procedimiento. Ningún
binario/firma descargado ni ejecutado; fingerprint independiente y validación
criptográfica, advisories posteriores y base Node/OS siguen pendientes.

## SKIP

Suite completa, SQL, build/perfilado real, enforce de límites del builder, TLS y
Compose efectivo propios del servidor, instalación/custodia/backend, revisión
independiente del nuevo SHA. Los reportes del propietario no se presentan como
comprobaciones independientes realizadas aquí. Gates de autorización permanecen.
Orden: configuración preparada → render efectivo comprobado → autorización
integración/instalación; luego, solo bajo esa autorización, plan build selectivo
verificado y arranque únicamente Bao, inicialmente sellado/unhealthy.

## SHA256 actuales (informe excluido)

eab7b19ac6be4bf05ee9bea272cc9531c78e9b509c107df4d38e2758887dc069  scripts/prepare-staging-synthetic.py

f1b257241e28aef36a5a231e9ffad24e863f4007e716eb10922a261f2b9f0ca0  tests/static/test_staging_synthetic.py

42df987531cf67d135171c1babc6873aea302fd21129b078eeb9d92b36b8feb9  deploy/staging/RESOURCE_RECORD.json

567796bd6d60f87e8d9f5e7ce21ba09b43e30b6791cf042aa01f8fde99f1076c  deploy/staging/README.md

cfdedf0ab2703dcc3eba47afb4080ffcaba69763767e5c3878005e93a6ff14be  deploy/staging/synthetic-plan.json

4a973f4f0d4937fc82ea7276a898299b60a9bda934e983475dad17aaff88b9ff  deploy/staging/openbao/OPENBAO-STAGING-01.md

