# E1 — resolución arquitectónica del propietario, 17-10-2026

Autoridad: instrucción explícita «RESOLUCIÓN E1 Y FINALIZACIÓN DE B1» en esta sesión.
Base fijada: 6a63bd539b34f409ed762a844248013f6594c712, PR7 /feat/b1-http-flows.
Adenda acumulativa: conserva íntegros los originales V4/B1-X/D1, sus hashes y el historial.
Prevalece sobre los estados históricos PENDING de estas cinco decisiones; no los borra.

| Decisión | Resolución APROBADA |
|---|---|
| D2 | OpenBao aislado en infraestructura suiza. Custodio e infraestructura reales todavía por designar. Envelope v2 AES-256-GCM, AAD inmutable y versiones de lectura históricas se conservan. |
| D3 | SHA-256, secreto32bytes CSPRNG, issuer CleanOps 360; compatibilidad con autenticadores debe demostrarse. Se conservan periodo/dígitos/ventana canónicos de ensayo, sin downgrade. |
| D4 | Solo destinatarios verificados, outbox cifrado, cuarentena ante entrega incierta. |
| C-SCOPE | Recuperación/reset, trusted device y AUTHZ íntegros en B1; no exclusiones ni traslado a fases posteriores. |
| C-LOGIN | MFA obligatorio y política operacional explícita validada por servidor. No se solicita ni implementa una excepción ACTIVE desde password login. |

## Efectos y límites de la aprobación

Se permite desarrollar y probar las verticales dentro del entorno aislado autorizado.
D1 ya instalado en CONSOLIDATED05 permite enrolamiento con UUID asignado, cifrado v2,
confirmación CAS, lote de recovery digests y emisión PREAUTH condicionada al factor.
No requiere otra firma SQL para ese recorrido. El runtime permanece closedBackend.

Aprobar D4/C-SCOPE como arquitectura no instala por sí mismo columnas, funciones,
roles o ACL aún inexistentes. Deben presentarse los artefactos exactos y obtener la
aprobación específica exigida por el propietario antes de instalar SQL nuevo.
No usar una dirección normalizada como acreditación de buzón, ni finish_mail(boolean)
como si representara cuarentena. No atribuir privilegios administrativos a B1-SELF.

SMTP externo, infraestructura real, secretos productivos, producción, despliegues y
merge NO autorizados. B1 y AUTH-GATE-05 OPEN hasta aceptación integral real.

## Únicamente parámetros operativos pendientes

- D2: designación del custodio/operador, hosts/regiones suizos principal/recuperación,
  identidades por workload y ACL de OpenBao, bootstrap/unseal, ubicaciones de backups,
  soporte, retención y responsables de restauración. RPO≤15min/RTO≤4h no se reabren.
- D3: aplicaciones/plataformas/versiones obligatorias y dispositivos para medir QR,
  importación, algoritmo y drift. El perfil aprobado no se vuelve a pedir.
- D4: operador/remitente/plantilla y ruta de entrega real cuando se autorice; fuente
  operativa de prueba de buzón (challenge independiente o fuente corporativa identificada),
  retención de ciphertext terminal y responsables de resolver cuarentena. Sin proveedor
  ficticio ni SMTP externo para pruebas actuales.
- Política operacional: valores productivos y responsable de configuración dentro de
  MFA obligatorio; no introducir modo sin MFA ni promover el perfil de ensayo a producción.

Las firmas/ACL nuevas pendientes son autorizaciones de instalación, no reapertura de
estas decisiones arquitectónicas. La compatibilidad externa y la custodia real son
criterios de evidencia pendientes, no supuestas funcionalidades ya completadas.
