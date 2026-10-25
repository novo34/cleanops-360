# Corrección de fixtures, sin cambiar SQL ni permisos

SQL2-R2 y SQL3-R2 autorizados individualmente por el propietario2026-10-21,
con los hashes exactos de este documento. Se verificaron contra los bytes del
commit147dac36 y se registraron en los dos manifiestos de autorización.
Primera ejecución R2: SQL2 PASS166/166, SQL3 PASS44/44, Actions39548304721.
Evidencia separada: ../../implementation/b2/r2-authorized-execution.json.
Los originales R1 se conservan íntegros con sus FAIL.
Primera ejecución: Actions39542403981, jobs119032884865 y119032885120. Ambos
preflights y ambas instalaciones pasaron. Los resultados FAIL se conservan en
`../../implementation/b2/first-authorized-execution.json`.

## Causa y corrección exacta

Los fixtures calculaban digests dentro de sentencias ejecutadas como identity,
que carece deliberadamente de USAGE/EXECUTE sobre crypto. El SQLSTATE42501 se
producía antes de llamar a las funciones de negocio. Se cambia únicamente ese
cálculo por hashlib.sha256 en el harness y se pasan los mismos32 bytes mediante
decode(hex), igual que en el fixture B1 original pg11-access-security-tests.py.
No se concede ningún permiso adicional.

La comprobación ACL del helper SQL2 resolvía una firma dentro de identity_private
desde identity, que tampoco tiene USAGE. Se obtiene el OID mediante la conexión
de inspección ya usada por el harness y se comprueba el mismo EXECUTE=false desde
identity por OID. La llamada directa al helper sigue debiendo fallar42501.

Todos los escenarios, grants sintéticos, escrituras, expectativas y auditorías
restantes son los mismos. No se debilitan assertions ni se modifican SQL2/SQL3,
RBAC, sesiones, grants de aplicación, matriz B1 o pruebas Chromium. SQL3 ya pasó
el E2E real de edición/desactivación/reactivación con sus tres auditorías; SQL2
pasó la matriz B1 completa. Eso no convierte los jobs globales FAIL en PASS.

## Dos aprobaciones de fixture independientes

Commit inmutable de ambos fixtures R2: `147dac36c921e1ff1ee6af7ca1b30bf9425c0062`.

Operaciones SQL2: crear fixtures sintéticos de recursos, roles, reglas y
pertenencias; insertar evidencia step-up; consultar catálogo/permisos efectivos
y ACL; reservar/cambiar/completar o descartar asignaciones mediante las funciones
owned B1 existentes, comprobando auditorías. Cambiar vigencias, revocación y estado
sintéticos; limpiar el DENY creado por Chromium; ejecutar la matriz B1 original.
La única consulta adicional R2 es obtener el OID del helper para inspección ACL.

Operaciones SQL3: crear recursos/reglas y evidencia step-up sintéticos; consultar
versiones; reservar/cambiar/completar o descartar edición/estado con las funciones
owned autorizadas; dos conexiones concurrentes y rollback; fixtures sintéticos
de dispositivos, preauth y challenges; comprobar revocación por tenant, auditorías,
reactivación y self-disable. Chromium ejecuta edición/desactivación/reactivación.
No se añade ninguna operación de negocio frente a R1.

| Paquete | Nuevo archivo | SHA-256 |
|---|---|---|
| SQL2, fixture r2 | `../b2-access/access-tests.r2.review.py` | `72ed26f1e515ef5e7126271a91e9cdfb38575826e861a04b2196ea6e0e7e2550` |
| SQL3, fixture r2 | `user-change-tests.r2.review.py` | `1a66ccf3610b01bf840ad1f8a9e01c6917c7fe55ed72123b574008442168e6b2` |

Cada autorización solo sustituiría el fixture de ese paquete en su ejecución
individual. SQL2 mantiene SHA256d11842d50959ea6e2e90afe8d90d7c327bcbc8ca45685e893c436baae3549efe
y SQL3 mantiene SHA25677c3d298602d1e2a273db104b5ee28d7d4db2c8824558c9b7d1775440bf8df4b,
con sus autorizaciones previas. Contenedores separados PostgreSQL16 efímeros,
sin red/puertos/mounts persistentes en GitHub-hosted Actions, SQL14+SQL1 exactos
autorizados, hashes y ausencia de conexiones/credenciales externas verificados
antes de instalar; parada ante cualquier preflight fallido y limpieza obligatoria.
Sin bases persistentes, B1 real, staging/main, merges o nuevos grants.
