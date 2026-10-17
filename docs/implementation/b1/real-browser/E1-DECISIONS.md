# E1 — decisiones ejecutables para completar B1

Base verificada: 318a77f4fc67623810e6fdfa080bb2fe0da0ecae. B1 y AUTH-GATE-05 OPEN.
No cambia documentación canónica, SQL, ACL ni el runtime closedBackend.

Fuentes: [plan de cierre y referencias primarias](../closure/PLAN.md),
[44 obligaciones](../closure/requirements.json), [contratos HTTP](../../../../lib/b1/openapi.json),
[propuestas de ceremonia](../../../proposals/b1-ceremony-material/APPROVAL.md).
Las 294 comprobaciones PG/HTTP de run 39068144839 continúan aprobadas; no se repiten.
D1 ya ensayado en CONSOLIDATED-05: la antigua autorización pendiente de instalación
mencionada en PLAN.md es histórica, no se solicita de nuevo.

| Decisión humana pendiente | Alternativas y riesgo | Recomendación concreta | Qué permite ejecutar |
|---|---|---|---|
| D2: custodio y ubicación/identidades reales | OpenBao o Vault autoalojados en Suiza: operación, quorum y recuperación a cargo del propietario. KMS de proveedor real identificado: revisar residencia, soporte y control de wrapping. Claves en variables generales no satisfacen separación/custodia. | OpenBao separado por workloads, infraestructura suiza identificada y backup independiente; data keys por tenant/propósito, resolver de versiones antiguas, doble control de recuperación. El propietario debe identificar custodio, hosts/regiones y soporte antes de autorizar infraestructura. Mantener envelope v2 AES-256-GCM/AAD inmutable; RPO≤15min/RTO≤4h ya aprobados. | Implementar/ensayar resolver, rotación CAS y recuperación con sistema de custodia real autorizado. No aceptar pruebas con claves efímeras como cierre D2. |
| D3: perfil y apps obligatorias | SHA256/32 bytes CSPRNG/issuer CleanOps 360; SHA1 solamente como política alternativa explícita si una app obligatoria no soporta SHA256. Riesgo: importación ignora algoritmo o label expone PII. | Aprobar SHA256, 32 bytes, issuer CleanOps 360 y alias no PII; conservar periodo30/dígitos6/ventana±1 canónicos de ensayo. Identificar apps, plataformas y versiones obligatorias (Google/Microsoft Authenticator, Aegis, 2FAS son candidatos, no compatibilidad acreditada). Sin downgrade automático. | Enrolamiento real tras D2 y pruebas QR/importación/códigos/drift con apps requeridas; los vectores de biblioteca no sustituyen esa evidencia. |
| D4: destinatario, entrega y resultado incierto | Challenge independiente de buzón persistido/versionado, o fuente corporativa autoritativa identificada. SMTP real del tenant/proveedor autorizado, o Postfix suizo con entregabilidad demostrada. Reintentar resultado incierto puede duplicar entrega. | Verificación de buzón independiente para autoservicio; outbox cifrado por tenant/propósito, worker asíncrono, claim/finish CAS y revalidación de generación/TTL. UNKNOWN a cuarentena sin reenvío ciego. Ensayar primero sumidero local, sin SMTP externo. | Preparar contrato mínimo de verificación de destinatario y estados de entrega; requiere aprobación exacta de SQL/ACL ANTES de instalar. Proveedor externo NO solicitado para este ensayo local. Un método EMAIL ACTIVE no acredita buzón verificado. |
| C-SCOPE: conciliación normativa | V4 excluye reset ajeno/pérdida total y difiere trusted device; SRS AUTH-034/046/gates/roadmap los requieren. AUTHZ001..007 referenciados, Manage Access situado después de Auth. Declarar cierre con exclusiones contradice la orden del propietario. | Addendum de completitud B1 que incluya recuperación/reset/trusted device y AUTHZ trazados, con contratos administrativos separados y denegación por defecto. Aprobar la conciliación y luego firmas/ACL exactos, sin atribuir poderes a B1-SELF. | Preparar esas APIs y UI reales contra alcance explícito; no inventar ahora endpoints de recuperación inexistentes en las 14 operaciones aprobadas. |
| C-LOGIN: política de MFA operativa | SRS AUTH-002 admite configuración operacional; V4 siempre exige MFA y prohíbe ACTIVE desde password login. Mantener siempre MFA cumple el slice pero no demuestra opción SRS. | Addendum coordinado SQL/HTTP/UI para política OPERATIONAL explícita derivada/revalidada en servidor; sensibles y step-up permanecen obligatorios. Hasta aprobar, conservar prohibición ACTIVE desde login. | Implementar política autorizada y pruebas negativas sin eliminar las guardas actuales. |

## Trabajo que no espera esas decisiones

UI existente, sin interfaz paralela: login → TOTP preconfigurado → sesión persistida,
identidad, lista de sesiones, step-up, revocación propia y logout. Selección múltiple ya
consume el endpoint aprobado. Enrolamiento/confirmación están conectados al contrato,
pero el backend sigue cerrado por D2/D3. No hay API de recuperación total publicada;
no se añade una ruta ficticia. EMAIL sigue cerrado en el backend; ensayos SQL locales
previos no equivalen a entrega HTTP ni a verificación de destinatario aprobada.

Corrección independiente: idempotencia de mutaciones UI ante pérdida de respuesta.
Se retiene únicamente digest de solicitud y UUID en memoria de la ceremonia, nunca
cuerpo/factor/cookie en almacenamiento persistente ni logs. Cambiar cuerpo o destino
crea otra identidad; confirmar/cancelar limpia la reserva local. El servidor conserva
CAS/reservas owned como autoridad, incluyendo conflicto seguro para resultados de un uso.

## Composición real aislada y evidencia

`python3 scripts/pg-b1-browser.py` verifica los cuatro blobs históricos y el candidato05
exacto autorizado (blob62cec23e534fe15888ddba98cf76add7e857cfef,
SHA256 3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c).
Instala desde cero en nuevo PG16 Docker sin red/puertos/binds/volúmenes y fixtures sintéticos.
La UI real Next.js usa TLS loopback; un proceso exclusivo de tests transporta Request/Response
por stdin/stdout de docker exec. Dentro del contenedor se ejecuta createAuthHandler con
createApprovedPrivateBackend, Argon2id y TOTP reales y conexión Unix PostgreSQL con rol
identity_service. No page.route, cookies inyectadas, respuestas simuladas ni flag de runtime.
El transporte conserva Origin/Fetch Metadata/CSRF del navegador. Claves efímeras son solo
fixtures preconfigurados, no aprobación D2/D3 ni enrolamiento público.

Prueba comprueba UI, persistencia de sesión/contador, step-up, revocación, logout y 401
posterior. Recorrido real PASS en Actions 39069778121, fuente c34783024fac52da1582eb75c6494e518fd31339. No retener JSON Playwright sin depurar: factores
pueden aparecer en errores; publicar únicamente nombres/status y limpieza/huellas.
Cada requisito mantiene aceptación individual en la matriz: cubrir parcialmente un
recorrido no convierte automáticamente una obligación completa en ACCEPTED.

## Ejecución verificada

[Run39069778121](https://github.com/novo34/cleanops-360/actions/runs/39069778121): 11 comprobaciones PASS, 0 FAIL/BLOCKED/SKIP, limpieza PASS. Incluye una prueba Chromium end-to-end real; los otros diez checks son preparación, integridad, instalación y aislamiento/proceso. No presentar once checks como once recorridos UI. El recorrido usa TOTP preconfigurado sintético, no enrolamiento público ni compatibilidad de apps externas.
