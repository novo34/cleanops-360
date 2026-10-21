# SQL5-R3 — paquete de revisión, NO AUTORIZADO

Estado: PENDING_SPECIFIC_OWNER_APPROVAL. Rama aislada de revisión; no integrado en PR #12.
Base revisada: 063cd7456056fdff2840a626655700231902ab2a.

## Modificación

Sustituye únicamente el cuantificador PostgreSQL incompatible `{29,512}` por comprobaciones separadas: longitud hexadecimal de 58 a 1024 caracteres, longitud par y alfabeto `[a-f0-9]`. Conserva el resto de SQL5-R2, sus ACL y el ledger privado. Fixture R3 añade casos de límites 56,58,59,1024,1026 y alfabeto inválido.

## Alcance NO acreditado

No se ha ejecutado SQL5-R3 en PostgreSQL, ni CI, ni concurrencia paralela real. El fixture actual conserva comprobaciones de consumo/rollback secuenciales, pero NO demuestra dos conexiones simultáneas ni un único ganador bajo carrera. Es obligatorio preparar y revisar esa prueba antes de pedir permiso para una validación integral o declarar PASS.

MFA previo de identidad existente y E2E PostgreSQL siguen pendientes e independientes. Las evidencias R1/R2 permanecen inalteradas; ninguna de sus autorizaciones se extiende a R3.

## Manifest

`docs/proposals/b2-invitations/sql5-r3-manifest.review.json`
SHA-256 del manifiesto: `6baa163511ed9dda05dbdec2e629ebd28df8db2189c349610fe2a13ddba5174b`.

El runner R3 requiere un nuevo `invitation-acceptance-r3-authorization.json` con `ownerApproved=true`, commit fijo, hash del manifiesto y scope exacto. Dicho archivo NO existe. Ningún SQL debe ejecutarse sin autorización del propietario, preflight y hashes coincidentes.

No instalar PostgreSQL/OpenBao, no modificar infraestructura persistente, staging/main, B1, closedBackend ni AUTH-GATE-05.
