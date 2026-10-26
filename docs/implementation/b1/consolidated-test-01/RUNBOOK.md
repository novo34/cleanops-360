# PG-TEST-01-CONSOLIDATED-01 — ejecución autorizada

Aprobación expresa del propietario ligada al SQL Git blob
7507a29dc58c27fa4b9ab7f3b6dd628397485c9a y a la solicitud revisada.
SHA-256 completo: 42169677305df68612d44a6c0f0a4b4bafe1ec142d041e9a9a0e426d84e97863.
AUTHORIZATION.json registra alcance y límites; los documentos históricos de propuesta
permanecen como snapshots REVIEW ONLY, no se reescriben para aparentar una prueba pasada.

## Qué se ejecuta

`python3 scripts/pg-consolidated-01.py`: reutiliza el transporte y limpieza de
pg-test-01.py; sustituye SOLO el selector de payload para enviar el consolidado entero,
byte por byte. Antes verifica cuatro originales, Git/SHA-256, diff íntegro y ACL.
No V4 seguido de patches, no guardas eliminadas al vuelo, no bypass del compilador.
SHOW check_function_bodies debe devolver on. psql -f - aporta línea exacta del archivo.

El workflow se ejecuta solo en PR7/mismo repositorio/rama, en la transición desde HEAD
29d23f0ec109e157a4d4db71182f38a01cef4c04. No se reinstala automáticamente al publicar
la evidencia posterior. El runner Ubuntu es nuevo; Docker usa un único contenedor
labelled propio, PG16 oficial por RepoDigest, network=none, tmpfs, sin puertos/binds/
volúmenes/servicios preexistentes. Nunca se cambia chmod/socket/daemon local ni se poda.

La instalación es una transacción. Si compila, se comprueba persistencia, se usan los
fixtures sintéticos y conexiones técnicas separadas del harness y sus pruebas reales
base de roles/ACL/RLS/A-B/sesiones/locks/rollback/COMMIT/backup-restore.
Si la instalación falla, se comprueba rollback de esquemas/roles y todos los grupos
obligatorios dependientes se marcan BLOCKED, nunca PASS ni SKIP para ocultar el fallo.

El harness histórico contiene escenarios avanzados todavía no ejecutados/implementados;
sus sentinels BLOCKED se conservan. No se considera el PASS de compilación/base como
PG-TEST-01 completo. Si la instalación pasa, hay que completar y ejecutar esos casos
reales (CAS/concurrencia, MFA y reservas owned) antes de cualquier aceptación; el wrapper
no puede emitir PASS completo mientras sigan pendientes.

## Evidencia y limpieza

Reporte `artifacts/pg-consolidated-01/report.json`; logs de CI y artifact redactado.
No contraseñas generadas/tokens/ciphertext ni comandos con secretos en logs.
Se inspecciona la etiqueta antes de eliminar solo el contenedor propio; inventarios
antes/después de contenedores/redes/volúmenes deben coincidir. Bases/restores/fixtures
viven exclusivamente dentro del contenedor efímero; no se toca recurso preexistente.

Ante defecto SQL: detener nuevas instalaciones, conservar candidato autorizado,
corregir el generador fuente y producir una NUEVA revisión consolidada con diff y
hashes; nunca ejecutar esa revisión sin aprobación específica. Los fallos del harness
pueden corregirse sin alterar el SQL autorizado, con evidencia y revalidación acotada.

B1 y AUTH-GATE-05 OPEN; closedBackend conectado. El ensayo no acepta requisitos
completos ni activa backend/EMAIL/enrolamiento/producción; no despliegue/merge.
