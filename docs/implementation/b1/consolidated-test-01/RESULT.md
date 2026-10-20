# PG-TEST-01-CONSOLIDATED-01 — FAIL; B1 NO cerrable

Ejecución real autorizada: [run39036655470](https://github.com/novo34/cleanops-360/actions/runs/39036655470),
head b8a00e4e6d9f3906e8642bd7cc5ef21c573ede99; job117407776015.
EXECUTION_REPORT.json contiene resultados por caso, imagen, hashes y diagnóstico.

- **PASS8 / FAIL1 / BLOCKED21 / SKIP0**, más limpieza PASS.
- Cuatro fuentes originales, candidato exacto Git7507a29 y SHA-256 completo
  42169677305df68612d44a6c0f0a4b4bafe1ec142d041e9a9a0e426d84e97863 verificados.
  submittedSqlSha256 coincide: no se añadieron correcciones ni ACL.
- PG16 oficial, contenedor nuevo/network-none/tmpfs/sin puertos/binds/volúmenes;
  check_function_bodies=on. No acceso a datos reales ni producción.
- **FAIL:** compilación del reemplazo D1 totp_material_locked, SQLSTATE42601,
  stdin línea1462/body27. Mismo patrón CASE que el corregido en la declaración B1-X.
- **PASS:** al fallar esa única transacción, cero esquemas app/auth_api/identity_private/
  crypto y cero roles cleanops persistieron. No quedó una base parcialmente instalada.
- **BLOCKED:** autenticación/MFA/sesiones, ACL/DEFINER/RLS/A-B, CAS, reservas owned,
  concurrencia/bloqueos de negocio, rollback/COMMIT funcional y backup/restore de B1.
  Sus dependencias no existen tras rollback; no se sustituyen por una DB vacía, SQL
  alterado o pruebas simuladas para aparentar ejecución. Rollback de instalación no
  equivale a superar rollback de los flujos de negocio.
- **PASS:** se eliminó solo el contenedor cuya etiqueta propia se verificó. Inventarios
  de contenedores/redes/volúmenes preexistentes coinciden antes/después. PGDATA y /tmp
  eran tmpfs; no volumen que quede pendiente de borrado. El pull de imagen oficial
  queda en caché del runner efímero; ningún recurso preexistente se borró o reconfiguró.

Requisitos B1 completos: **0/44**, sin variación; ninguna fila obtiene aceptación por
compilación fallida o por checks de infraestructura. B1/AUTH-GATE-05/PG-TEST-01 OPEN;
closedBackend sigue conectado. No se comienza el módulo siguiente.

## Corrección preparada, NO instalada

Causa raíz corregida en generador de revisiones y regresión de ambas declaraciones.
Nueva línea base íntegra en docs/proposals/b1-consolidated-sql/revisions/02/.
Un único par de paréntesis adicional en D1 frente al SQL autorizado; cero cambio de
ACL/firma/política. Histórico y originales intactos. La revisión02 no está SQL-compilada
ni autorizada. El workflow de esta ejecución solo admite la transición desde el HEAD
aprobado y NO repite la instalación al publicar esta evidencia o la revisión02.

Siguiente acción precisa: autorización PG-TEST-01-CONSOLIDATED-02 del blob
**d723ff9f615caafa701418dbaea60dec43479bba**, SHA-256
**a1c524b9821319d830f4a753fb8691dde218e291341d90bd1d3ea14254c1e3fd**,
para repetir la instalación desde cero en otro PG16 aislado con las condiciones aprobadas.
Se requiere por condición7 del propietario, NO se pide nuevamente permiso para el blob
7507a29 ya ensayado. No se instala otro SQL hasta esa nueva autorización.

Reproducción del ensayo histórico: preflight + scripts/pg-consolidated-01.py, que sigue
fijado únicamente al blob7507a29. No ejecutarlo manualmente como si seleccionara revisión02.
Evidencia pública limitada a fixtures/diagnóstico de fuente y resultados; no secretos.
