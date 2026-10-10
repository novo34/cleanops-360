# CLEANOPS 360 — PLANS AND DOCUMENTS SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Planos y documentos
Planos PDF/JPG/PNG, revisiones históricas inmutables y permisos por documento/proyecto.


## Metadata

name, code, revision, uploaded_by, uploaded_at, current_version, historical_versions; conservar checksum y origen para auditoría.


## Seguridad

Upload → quarantine → MIME+magic bytes → malware scan → bomb check → sanitize → private volume → authorized delivery; cuotas tenant y límites iniciales 20/50/100 MB.


## Extracción

Documentos PDF/Excel asistidos por IA en fases; revisión humana de campos; parser CRBX estructurado después, validado; sin editor NPK completo en MVP.


## Recuperación

Cada archivo tiene referencia/version/manifest; restauración coherente con PostgreSQL, sin prometer PITR de archivos sin evidencia.

