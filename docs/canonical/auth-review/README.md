# B1 V4 — publicación contractual original

## Procedencia y verificación

Paquete original: `cleanops-auth-review-v4.zip`, generado el 15 de octubre de 2026. SHA-256 verificado: `387ee8865f171d5989b1eae07c2abdbd2c91205622b258cdc25a68a8da13f010`.

Los 39 archivos originales se conservan íntegros bajo [v4/](v4/), incluidas sus rutas relativas, baseline V3, fuentes archivadas y README original. Las 38 entradas de [artifact-manifest.json](v4/artifact-manifest.json) coinciden con sus SHA-256; el propio manifiesto es el archivo 39. Ningún archivo del ZIP está ausente.

Se ejecutó `validate_package.py` sobre una copia separada: 18 pruebas estáticas, 0 fallos, 0 errores. Los logs originales permanecen intactos. Estas pruebas no compilan SQL ni prueban semántica PostgreSQL/RLS, concurrencia o navegador. No se ejecutaron PostgreSQL, migraciones, roles, grants ni despliegues. AUTH-GATE-05 permanece OPEN. Las fuentes archivadas en `v4/sources/` no sustituyen los documentos normativos actuales ni el AGENTS.md del repositorio.

Referencias: [índice previo, commit 9f13c78](https://github.com/novo34/cleanops-360/blob/9f13c78d6c49194db1bd422db19128460f93f5fc/docs/implementation/b1/README.md), [autorización del owner, PR #5 / 6198116976](https://github.com/novo34/cleanops-360/pull/5#issuecomment-6198116976). Publicación documental; no declara implementación B1 ni aprobación de producción.

## Inventario completo

- [v4/FINAL_DECISIONS.md](v4/FINAL_DECISIONS.md)
- [v4/HTTP_CONTRACT.md](v4/HTTP_CONTRACT.md)
- [v4/IMPLEMENTATION_SLICE.md](v4/IMPLEMENTATION_SLICE.md)
- [v4/POSTGRESQL_RLS.md](v4/POSTGRESQL_RLS.md)
- [v4/README.md](v4/README.md)
- [v4/SECURITY_VALUES.md](v4/SECURITY_VALUES.md)
- [v4/SESSION_REVOCATION_CONTRACT.md](v4/SESSION_REVOCATION_CONTRACT.md)
- [v4/V3_TO_V4.diff](v4/V3_TO_V4.diff)
- [v4/artifact-manifest.json](v4/artifact-manifest.json)
- [v4/b1-review-only.sql](v4/b1-review-only.sql)
- [v4/baseline-v3/block-1-grants-requiring-approval.csv](v4/baseline-v3/block-1-grants-requiring-approval.csv)
- [v4/baseline-v3/block-1-role-projection.csv](v4/baseline-v3/block-1-role-projection.csv)
- [v4/block-1-grants-functional-approved.csv](v4/block-1-grants-functional-approved.csv)
- [v4/block-1-role-projection.csv](v4/block-1-role-projection.csv)
- [v4/block-1-test-cases.yaml](v4/block-1-test-cases.yaml)
- [v4/block-1.openapi.yaml](v4/block-1.openapi.yaml)
- [v4/build_contract.py](v4/build_contract.py)
- [v4/owner-instruction.json](v4/owner-instruction.json)
- [v4/security-values.csv](v4/security-values.csv)
- [v4/security-values.yaml](v4/security-values.yaml)
- [v4/sources/AGENTS.md](v4/sources/AGENTS.md)
- [v4/sources/docs/API_SPEC.md](v4/sources/docs/API_SPEC.md)
- [v4/sources/docs/AUTHENTICATION_SPEC.md](v4/sources/docs/AUTHENTICATION_SPEC.md)
- [v4/sources/docs/CLEANOPS_360_PRODUCT_MASTER_V3.md](v4/sources/docs/CLEANOPS_360_PRODUCT_MASTER_V3.md)
- [v4/sources/docs/CLEANOPS_360_SRS_V1_1.md](v4/sources/docs/CLEANOPS_360_SRS_V1_1.md)
- [v4/sources/docs/DATA_MODEL.md](v4/sources/docs/DATA_MODEL.md)
- [v4/sources/docs/DECISION_REGISTER.md](v4/sources/docs/DECISION_REGISTER.md)
- [v4/sources/docs/DELIVERY_PLAYBOOK.md](v4/sources/docs/DELIVERY_PLAYBOOK.md)
- [v4/sources/docs/ENTITY_UI_COVERAGE.md](v4/sources/docs/ENTITY_UI_COVERAGE.md)
- [v4/sources/docs/FEATURE_TRACEABILITY_MATRIX.md](v4/sources/docs/FEATURE_TRACEABILITY_MATRIX.md)
- [v4/sources/docs/IMPLEMENTATION_GATES.md](v4/sources/docs/IMPLEMENTATION_GATES.md)
- [v4/sources/docs/PHASE_EXECUTION_DOSSIERS.md](v4/sources/docs/PHASE_EXECUTION_DOSSIERS.md)
- [v4/sources/docs/PRD.md](v4/sources/docs/PRD.md)
- [v4/sources/docs/RBAC_PERMISSIONS.md](v4/sources/docs/RBAC_PERMISSIONS.md)
- [v4/sources/docs/THREAT_MODEL.md](v4/sources/docs/THREAT_MODEL.md)
- [v4/sql-inventory.json](v4/sql-inventory.json)
- [v4/static-tests.log](v4/static-tests.log)
- [v4/validate_package.py](v4/validate_package.py)
- [v4/validation-report.json](v4/validation-report.json)

## Resolución E1 aprobada — 17-10-2026

[Adenda acumulativa del propietario](E1-OWNER-RESOLUTION-2026-10-17.md):
D2 OpenBao suizo, D3 SHA256/32bytes/issuer, D4 destinatarios verificados/outbox/cuarentena,
C-SCOPE completo y C-LOGIN MFA obligatorio. Sustituye únicamente el estado pendiente
histórico de esas decisiones, sin borrar fuentes ni aprobar SQL/ACL/infraestructura nueva.
