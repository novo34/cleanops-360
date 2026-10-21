# SQL5-R2 — autorización independiente pendiente

R1 se conserva intacto: run 39582464898, **26 PASS / 11 FAIL**, limpieza PASS.
Reporte original y hash del ZIP: `docs/implementation/b2/sql5-first-execution/`.
SQL5 consultaba `security_log`, pero B1 concede al broker únicamente INSERT.

R2 mantiene esa ACL B1. Añade un ledger privado exclusivo de intentos de
invitación (digests/evento/tiempos, sin secretos), dos índices y SELECT/INSERT/DELETE
únicamente para el broker. Las consultas de ventanas móviles leen ese ledger;
la auditoría y las escrituras append-only B1 permanecen. El ledger elimina sus
filas caducadas al registrar intentos. No hay segundo motor de autorización.

Resto de operaciones SQL5: tabla de capacidades, dos columnas de política sin
defaults productivos, identificador global de invitación, cuatro helpers y siete
funciones/EXECUTE identity e INSERT broker en entidades B1 existentes, sin cambios
de precondiciones ni emisión de sesiones. En total R2 crea dos tablas privadas.

`sql5-r2-manifest.review.json` fija SQL4 intacto, SQL5-R2, fixtures y runner.
Los fixtures conservan las expectativas R1; cambian el archivo que instalan y
añaden comprobaciones de ACL append-only, privacidad del ledger y cinco fallos
con bloqueo del sexto intento. No se ha ejecutado R2. CI solo analiza su gramática.

Alcance solicitado: ejecutar esos bytes en GitHub Actions alojado, PG16 efímero
sin red, puertos, volúmenes ni credenciales externas, datos sintéticos y limpieza
verificada, sobre SQL14+SQL1+SQL2+SQL3 exactos y SQL4 como dependencia. No repetir
la suite histórica SQL4. Verificar manifiesto/hashes/commit/autorizaciones previas
antes de SQL. La aprobación R1 no autoriza R2.

Identidades existentes y E2E PostgreSQL de aceptación siguen pendientes/excluidos.
Sin correo real, bases persistentes, B1 real, staging/main, merges o despliegues.
