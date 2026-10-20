> **Ejecución real 01: FAIL**, SQLSTATE42601 en reemplazo D1; rollback y limpieza
> PASS. El blob aprobado 7507a29 queda intacto. Evidencia en
> `docs/implementation/b1/consolidated-test-01/RESULT.md`. Revisión completa 02,
> corregida en generador y NO instalada, en `revisions/02/REVIEW.md`.
> La solicitud nueva es PG-TEST-01-CONSOLIDATED-02; no repetir autorización del anterior.

> Revisión secuencial vigente: `SECURITY_REVIEW.md`, `FULL.diff` y
> `static-review.json`. Solicitud mínima de ejecución: `EXECUTION_REQUEST.json`
> (`PG-TEST-01-CONSOLIDATED-01`), todavía sin aprobación. El candidato conserva
> exactamente el mismo hash; no se añade otro parche ni se instala SQL.

# B1 — Propuesta canónica SQL consolidada, REVIEW ONLY

Nueva estrategia autorizada por el propietario: preparar un único contrato limpio de
instalación desde cero, sin seguir instalando parches sucesivos. Este documento NO
aprueba ni sustituye la documentación canónica. El candidato no está SQL-compilado ni
instalado. B1/AUTH-GATE-05 OPEN; closedBackend permanece conectado.

## Artefacto único y procedencia

`schema.review.sql` contiene, en orden de dependencia, V4 → B1-X → D1 dentro de
una sola transacción. No usa includes, fixtures, cuentas LOGIN, semillas ni conexiones.
`manifest.json` fija Git/SHA-256 de los cuatro originales y del candidato completo.
Los originales, PATCH-01, PATCH-02 y resultados históricos permanecen intactos.

Generación reproducible sin base de datos:

```
python3 scripts/consolidate-b1-sql.py
python3 scripts/consolidate-b1-sql.py --check
```

El generador solo lee fuentes byte-verificadas y escribe estos dos artefactos de
propuesta; no ejecuta procesos SQL, PostgreSQL, Docker o red. `--check` solo compara.
Falla si cambia un hash, un punto de corrección o un envoltorio esperado.

## Defectos pendientes y resolución propuesta

| Evidencia real | Tratamiento consolidado | Estado |
|---|---|---|
| V4 `issue_active_session` SQLSTATE 42601 | Paréntesis en los dos operandos CASE, como PATCH-01 ya compilado | Corrección previa conservada |
| B1-X `totp_material_locked` SQLSTATE 42601 | Paréntesis en el único CASE comparado del IF | Propuesto, no SQL-compilado |
| B1-X/D1 terminan ROLLBACK y tienen stop REVIEW_ONLY | Guardas y wrappers externos retirados; una transacción explícita BEGIN/COMMIT para el candidato completo | Cambio de instalación pendiente de aprobación |
| Broker: `permission denied for table policy_versions` (42501) | D1 ya incluye UPDATE(tenant_id) para su bloqueo, junto con los tres grants de columna revisados | Incluido SIN ampliar ACL; no validado instalado |
| CAS/MFA/transiciones/aislamiento positivo bloqueados | Contratos existentes consolidados, ninguna relajación para forzar PASS | Requieren instalación y pruebas reales autorizadas |

La transformación preserva literalmente los cuerpos, firmas y ACL originales salvo
los tres operandos CASE descritos. Solo se eliminan comentarios de cabecera y el
comentario de inalcanzabilidad que dejó de aplicar. No hay valores de producción,
configuración habilitada, custodia de claves o destinatarios nuevos.

## Revisión y autorización siguientes, una sola línea base

1. Revisar el candidato COMPLETO y su manifiesto; verificar firmas/ACL contra los
   originales y los cambios declarados. El generador permite reproducir ese diff.
2. Autorizar expresamente el hash consolidado y su ACL combinada para PG16 efímero,
   aislado y sintético. La aprobación de PATCH-01 no se extiende a esta propuesta.
3. Solo tras esa autorización, instalar una vez desde cero y ejecutar la matriz
   obligatoria completa: compilación, roles/ACL/DEFINER/search_path, RLS y acceso
   positivo/negativo A/B, ciclos MFA/sesión, CAS/idempotencia owned, concurrencia,
   rollback/COMMIT y recuperación. No declarar PASS con casos omitidos/bloqueados.
4. Cualquier defecto descubierto se resuelve en una revisión versionada del candidato
   consolidado, con diff completo y autorización antes de instalar SQL cambiado;
   no mediante una cadena de overlays aplicados a una instalación parcial.

El workflow histórico PG-TEST-01 deja de ejecutarse automáticamente por cada cambio
frontend: queda solo como reproducción manual de PATCH-01. Nunca selecciona el nuevo
SQL. La CI ordinaria ejecuta únicamente generación estática y pruebas sin DB.

No se solicita despliegue, merge, staging compartido, SMTP, claves reales ni activación.
