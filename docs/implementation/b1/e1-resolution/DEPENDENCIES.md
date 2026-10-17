# QR local: dependencias resueltas y revisadas

Workflow39071729387, artifact12115691357 genera SOLO package.json/lock en runner
sin credenciales de escritura de rama, sin scripts lifecycle ni SQL. Se publica
mediante el conector tras revisar el resultado, no mediante una instalación local
fallida ni lock escrito manualmente.

Pins: qrcode1.5.4 y @types/qrcode1.5.6. El encoder usa canvas local; no servicios QR
externos, imágenes persistidas, capturas del secreto ni SVG/HTML inyectado.
Ninguna dependencia previa cambia versión, resolved ni integrity. Cinco entradas
existentes cambian únicamente clasificación dev→producción; is-fullwidth-code-point
deja además de ser optional porque el árbol QR lo necesita. El resto son nuevas
entradas del árbol QR/tipos. No se cambia Argon2id, OTPAuth, pg, Next o React.

QR generado y leído por pruebas no acredita compatibilidad con apps reales. Apps,
plataformas/versiones y dispositivos obligatorios siguen por identificar; D3 se
mantiene aprobado y no se degrada el algoritmo.
