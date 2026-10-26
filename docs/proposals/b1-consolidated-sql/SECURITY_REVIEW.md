# Revisión acotada de la línea base consolidada

Referencia del propietario: `8026e989a2a76d9dec107700f710c415c1c6b994`.
Estado: REVIEW ONLY, NO PostgreSQL compilado/instalado. No se cambia el candidato.
La petición de ejecución está fijada en `EXECUTION_REQUEST.json`.

## Diff completo y comprobación reproducible

- `FULL.diff`: diff unificado de la concatenación ÍNTEGRA de originales V4+B1-X+D1
  contra el único candidato. No se omite ningún cambio por función o permiso.
- `static-review.json`: cuatro hashes originales, hash candidato, hash del diff,
  inventario de 73 declaraciones/reemplazos de función (65 nombres distintos), sus
  cabeceras/cuerpos, seis roles técnicos y 78 GRANT/REVOKE de nivel superior.
- `python3 scripts/review-b1-consolidated.py --check`: verifica 236 sentencias en
  el mismo orden y los mismos tokens, cuerpos entre dollar-quotes incluidos,
  salvo las transformaciones exactas declaradas. No es parser ni compilador SQL.
- Los bloques DO que reasignan propietarios/revocan PUBLIC también se comparan
  literalmente. Las 78 ACL del inventario no cuentan SQL dinámico dentro de esos DO.

Cambios completos: paréntesis en dos operandos CASE de issue_active_session (ya
ensayados en PG16), paréntesis en un CASE de totp_material_locked (pendiente de ensayo),
retirada de las dos excepciones REVIEW_ONLY, wrappers externos convertidos a una
transacción única y comentarios documentales. Ningún predicado, firma, cuerpo o ACL
adicional se modifica. El ROLLBACK de revisión deja de descartar B1-X/D1 solo cuando
se autorice e instale esta línea base entera. No hay una cadena de overlays instalados.

## Seguridad: qué se preserva y qué se autoriza de nuevo

**Frente a los tres contratos fuente:** cero ampliaciones de ACL/roles/DDL funcional.
Las ACL, firmas, SECURITY DEFINER/INVOKER, search_path y orden de statements son los
mismos de las fuentes, con los tres operandos CASE corregidos. No se dan tablas al
runtime, identity_service ni mail_worker, ni membresía del broker/ddl_owner a callers.
No se añaden LOGIN, reglas de negocio, bindings, usuarios, emails, claves ni activación.

**Frente a lo que llegó a instalarse realmente en PG-TEST-01:** B1-X y D1 nunca quedaron
instalados. Sus ALTER/funciones/ACL pasarían a persistir al instalar el consolidado.
No es correcto decir que esta ejecución no cambia privilegios por el mero hecho de
que los textos se aprobasen para integración TypeScript. Por eso hace falta aprobación
específica del archivo completo, incluida la ACL ya diseñada de ambos contratos.

D1 incluye exactamente estos cuatro privilegios de columna para los SELECT con lock:

- `GRANT UPDATE(id) ON identity_private.principals TO cleanops_auth_broker;`
- `GRANT UPDATE(id) ON app.organizations TO cleanops_auth_broker;`
- `GRANT UPDATE(id) ON app.users TO cleanops_auth_broker;`
- `GRANT UPDATE(tenant_id) ON app.policy_versions TO cleanops_auth_broker;`

Riesgo residual que debe aprobarse conscientemente: UPDATE(column) permite modificar
esa columna, no es una capacidad exclusiva de bloqueo. El broker sigue NOLOGIN,
NOSUPERUSER/NOBYPASSRLS, sin membresías para callers, con nombres calificados y
search_path fijo. La equivalencia textual no demuestra ausencia de escalada ni
corrección de RLS: esas propiedades exigen pruebas reales con roles separados.
No se relajan locks ni se conceden UPDATE más amplios para evitar el fallo 42501.

## Bloqueo mínimo y autorización precisa

Solicitar únicamente **PG-TEST-01-CONSOLIDATED-01** según EXECUTION_REQUEST.json:
instalar UNA VEZ el archivo exacto y su ACL combinada en PostgreSQL16 Docker nuevo,
efímero, aislado/network-none/tmpfs, con datos sintéticos y sin recursos compartidos.
Candidato Git `7507a29dc58c27fa4b9ab7f3b6dd628397485c9a`;
SHA-256 `42169677305df68612d44a6c0f0a4b4bafe1ec142d041e9a9a0e426d84e97863`.

La aprobación anterior de PATCH-01 no cubre el nuevo CASE ni el cambio de persistencia.
La instrucción actual prohíbe instalar SQL modificado sin autorización. No se inicia
el contenedor ni se ejecuta el candidato antes de recibir esa aprobación.

Después: verificar hashes/diff de nuevo → instalación transaccional desde cero →
compilación/persistencia/roles/ACL/DEFINER/RLS → positivos y negativos entre A/B →
CAS y reservas owned con barreras/concurrencia → rollback/COMMIT → backup/restore →
limpieza y reporte por caso. Casos no ejecutados siguen OPEN; no PG-TEST-01 PASS.
El harness histórico no cubre todavía todos los escenarios obligatorios: sus sentinels
BLOCKED no son pruebas implementadas. Deben sustituirse por casos reales antes de
usar sus resultados para aceptación, sin inventar permisos ni alterar SQL para forzar PASS.

Esta autorización NO aprobaría D2/D3/D4 operativos, addenda C-SCOPE/C-LOGIN ni el cierre
B1. Estas decisiones permanecen en PLAN.md y se abordarán dentro de B1 cuando corresponda;
no se solicitan anticipadamente para bloquear este ensayo mínimo.
