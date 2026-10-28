# OPENBAO-STAGING-01 — evidencia de corrección, 28/10/2026

Corrección sobre c2911e0c7db7e5bead68fb7ea54456f3283c80ab en el mismo PR #27.
Base staging original a217cfeda74431b77ffa30d117febb62695c70d0. Ninguna escritura
sobre staging, main, CRM, Dokploy ni VPS. Copia local de revisión, no checkout
remoto. Evidencia anterior: versión de este informe en c2911e0; sus pruebas de
Compose v2.40.3 son históricas, no se repitieron ni se atribuyen a esta corrección.

## Inventario de consumidores y QG-0

Se inspeccionó el árbol remoto no truncado de c2911e0. Se compararon hashes blob
con el checkout local, buscando el literal compose.openbao.yaml en los archivos
idénticos; se descargaron y buscaron las versiones remotas discrepantes de código,
configuración y documentación. Consumidores/referencias encontrados:

- deploy/staging/compose.yaml: único include, conservado sin cambios en esta corrección.
- scripts/prepare-staging-synthetic.py: ya usaba solo el entrypoint canónico.
- scripts/staging-maintenance.py: corregido doble -f y proyecto hardcodeado obsoleto.
- deploy/staging/README.md: eliminadas instrucciones antiguas de doble -f,
  consolidación desplegable e ingress adicional; actualizado orden previo y mantenimiento.
- deploy/staging/synthetic-plan.json: include único, Autodeploy sin confirmar,
  orden previo; ya no declara lista de overlays para desplegar.
- deploy/staging/openbao/OPENBAO-STAGING-01.md: referencia canónica y orden explícito.

El harness existente tests/static/test_staging_synthetic.py comprueba ahora ambos
productores de comandos y el include único. No se crea script de backup ni runner.
RESOURCE_RECORD.json incorpora composeProject, sin aprobar despliegue/backup ni
fabricar capacidad. Fuente: proyecto observado por el propietario cleanops360-f4fxmd.
El registro privado debe coincidir con identidad y composePath canónicos. config
se valida antes de ps/inspect, lectura de token y exec; guards de ownership y
puertos se conservan. No se enumeran proyectos ni hay fallback.
El instalador SQL histórico no es consumidor del overlay y queda intacto; no se
adapta ni ejecuta para este encargo. La identidad del mantenimiento queda resuelta
sin afirmar que el instalador SQL esté habilitado para el despliegue observado.

## PASS actual

8/8 pruebas en 0.006s, usando el harness existente y bloqueando subprocess.run
para que ninguna llamada externa pueda ejecutarse. El test de consolidación
intercepta localmente el comando y devuelve JSON sintético; no invoca Compose.
Las nuevas pruebas no ejecutan backup, SQL, contenedores ni servicios:

- test_canonical_include_is_used_once_by_every_command_producer
- test_maintenance_rejects_wrong_project_path_and_ownership
- test_maintenance_validates_its_exact_compose_before_discovery
- test_hostinger_non_swiss_is_allowed_without_productive_acceptance
- test_unknown_low_stale_capacity_and_other_projects_block
- test_non_synthetic_data_smtp_cost_and_quorum_are_rejected
- test_network_scope_and_production_renderer_cannot_be_reinterpreted
- test_backup_is_blocked_without_signed_synthetic_scope

Sintaxis Python de maintenance, prepare-staging-synthetic y harness: PASS mediante
compile(), sin importar/ejecutar CLI ni escribir pyc.

Reproducción de la ejecución sin procesos externos, desde raíz del repositorio:

```python
import importlib.util, unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('suite', 'tests/static/test_staging_synthetic.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
names = [
 'test_canonical_include_is_used_once_by_every_command_producer',
 'test_maintenance_rejects_wrong_project_path_and_ownership',
 'test_maintenance_validates_its_exact_compose_before_discovery',
 'test_hostinger_non_swiss_is_allowed_without_productive_acceptance',
 'test_unknown_low_stale_capacity_and_other_projects_block',
 'test_non_synthetic_data_smtp_cost_and_quorum_are_rejected',
 'test_network_scope_and_production_renderer_cannot_be_reinterpreted',
 'test_backup_is_blocked_without_signed_synthetic_scope']
with patch('subprocess.run', side_effect=AssertionError('External process forbidden')):
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(m.Synthetic(n) for n in names))
assert result.wasSuccessful()
```

## FAIL / límites de evidencia

Una selección inicial de regresiones antiguas incluyó
 test_direct_tools_cannot_bypass_the_synthetic_data_or_backup_directory_boundary;
falló por FileNotFoundError del artefacto SQL no materializado en la copia parcial,
antes de cualquier llamada Docker/SQL. No se ejecutó SQL, ni se cambió/deshabilitó
el test para hacerlo pasar. Suite completa NO acreditada. La selección final
anterior valida el alcance autorizado sin dependencia SQL y pasa. Ningún FAIL
pendiente en las tres regresiones nuevas.

El gate de capacidad sigue BLOCKED por registro incompleto; no se ha rellenado
con observaciones parciales para fabricar PASS. No es autorización de instalar.

## SKIP

Compose/Dokploy efectivos en servidor, ingreso en vivo, capacidad/red actual,
backup real, SQL, build, TLS real, instalación, init/unseal, custodia y backend.
Sin generación de secretos ni cambios de servicios/volúmenes. Revisión independiente
del nuevo SHA pendiente; no se presenta como completada por estas pruebas.

Orden bloqueante: configuración y archivos/variables requeridos preparados →
render efectivo de Dokploy comprobado antes de integrar → autorización expresa
de integración/instalación. Perfil apagado no garantiza compatibilidad de parseo.

## SHA256 actuales (informe excluido para evitar autorreferencia)

6bb5fd674a8e9df9cdb36178efa67490de2c6e1fe89330accb81fc8738e96502  deploy/staging/compose.yaml

8020829a96a0b996af721f54dcd149af1e08ab0529747e3ab07eaa7a3485e12b  deploy/staging/RESOURCE_RECORD.json

fe89da8a5f4ca38d3b947cb9c7312fa2b1d7b8a7cc5b9f3bc4a53243a02946ed  deploy/staging/README.md

cc26938c8d7a6ee5900a7dbbb671ecf2105c886b7a47005105d2fda12d64eca6  deploy/staging/synthetic-plan.json

091ce723f49e93c0b98f1fd72ace6f20b59fe81bd5581e5b494acafa12da7528  scripts/prepare-staging-synthetic.py

361c1ad9d3204cccdb3422890defd74a089211275099bcfc783ef67f93a4975d  scripts/staging-maintenance.py

9dfc943c555c8c555837e54b41058c239c28a84bb006cd253e547c2f929c001c  tests/static/test_staging_synthetic.py

08a8d31713bf3b3d6f0488b01cdf4ce2da80641b12753b10974c8231cbec11ee  deploy/staging/openbao/server-inputs.json

0bbcfdbac6419a7103095e5fc013439e6a21c7567a7c9c1b6e6eeebb0e86d84c  deploy/staging/openbao/OPENBAO-STAGING-01.md

