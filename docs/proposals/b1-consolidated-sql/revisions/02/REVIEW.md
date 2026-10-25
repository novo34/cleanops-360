# Revisión consolidada 02 — REVIEW ONLY, NO INSTALAR

## Defecto real y causa raíz

El SQL autorizado 7507a29dc58c27fa4b9ab7f3b6dd628397485c9a se envió exactamente, con
SHA-256 42169677305df68612d44a6c0f0a4b4bafe1ec142d041e9a9a0e426d84e97863.
[PG16 run 39036655470](https://github.com/novo34/cleanops-360/actions/runs/39036655470),
head b8a00e4e6d9f3906e8642bd7cc5ef21c573ede99: SQLSTATE42601, psql stdin línea1462,
body línea27 de auth_api.totp_material_locked(text,uuid,text), reemplazo D1.

Causa: el generador corrigió el CASE de la declaración B1-X, pero REPLACEMENTS['D1']
estaba vacío. D1 vuelve a declarar la misma función y conservaba el mismo CASE ambiguo.
La comprobación de equivalencia textual previa preservaba ese defecto de la fuente:
no sustituía compilación PostgreSQL. La consolidación anterior omitió esa segunda
corrección; no se atribuye el fallo a Docker, permisos o un problema de infraestructura.

## Corrección en fuente y nueva línea base única

scripts/consolidate-b1-sql.py --revision 02 aplica la corrección también a D1 y exige
que las DOS declaraciones de totp_material_locked tengan el operando entre paréntesis.
Una regresión vuelve a introducir el error SOLO en el reemplazo D1 y exige rechazo.
El generador, no una edición manual del SQL generado, produce la nueva revisión completa.

`schema.review.sql` es UN archivo íntegro desde cero, NO un patch aplicable al anterior.
El SQL autorizado fallido, su manifiesto y los cuatro originales permanecen intactos.
La revisión por defecto 01 sigue reproduciendo el hash histórico; 02 es explícita.

Git blob nuevo: d723ff9f615caafa701418dbaea60dec43479bba.
SHA-256 nuevo: a1c524b9821319d830f4a753fb8691dde218e291341d90bd1d3ea14254c1e3fd.

APPROVED_TO_02.diff muestra el cambio COMPLETO frente al archivo autorizado:
un par de paréntesis en un operando CASE del reemplazo D1, sin modificar sus valores,
predicado, firma, permisos, tablas ni orden de bloqueos. FULL_SOURCE.diff incluye todo
el delta frente a los originales. static-review.json demuestra una sentencia/cuerpo
cambiado, cero cambios de firma o ACL. No se afirma que el nuevo SQL compile: NO ejecutado.

## Autorización concreta pendiente

PG-TEST-01-CONSOLIDATED-02: aprobar SOLO el nuevo archivo/hash completo y su ACL
inalterada para un nuevo PG16 Docker aislado/network-none/tmpfs/sin puertos o volúmenes
compartidos, datos sintéticos, misma matriz de pruebas y limpieza de recursos propios.
No reutilizar una instalación parcial ni aplicar APPROVED_TO_02.diff como SQL.
La condición7 del propietario exige autorización nueva porque se modifican bytes SQL.
No se ha instalado ni enviado esta revisión al contenedor de ensayo.

Tras autorización: compilación de la línea base íntegra → persistencia/catálogo/ACL/RLS →
casos reales auth/MFA/sesión/CAS/owned/concurrencia/rollback/COMMIT/restore. No se certifica
B1 con vectores de librería, mocks o sentinels. Mientras el esquema no compila, los casos
dependientes son BLOCKED, no SKIP ni PASS. Siguen dentro de B1, sin aplazarlos a otra fase.

```
python3 scripts/consolidate-b1-sql.py --revision 02 --check
python3 scripts/review-b1-consolidated.py --revision 02 --check
python3 -m unittest discover -s tests/static -v
```

Estas órdenes solo leen/generan/verifican archivos; no conectan a PostgreSQL.
B1/AUTH-GATE-05/PG-TEST-01 OPEN. closedBackend intacto; no despliegue/merge/producción.
