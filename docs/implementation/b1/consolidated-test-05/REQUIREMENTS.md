# Individual B1 acceptance — 0/44 accepted

All 44 canonical rows remain individually BLOCKED for full acceptance. Partial executed cases and exact source/run are retained per row in REQUIREMENTS.json; these are not unexecuted cases marked PASS.

| Requirement | Acceptance | Specific remaining obligation |
| --- | --- | --- |
| REQ-PR-006 | BLOCKED | Completar E0–E9, UI/API/PG real de todo B1 y aceptación PO; el runtime operativo sigue closedBackend. |
| REQ-PR-007 | BLOCKED | Mantener bloqueado el siguiente módulo hasta la aceptación formal completa de B1 y AUTH-GATE-05. |
| REQ-AUTHZ-001 | BLOCKED | Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF. |
| REQ-AUTHZ-002 | BLOCKED | Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF. |
| REQ-AUTHZ-003 | BLOCKED | Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF. |
| REQ-AUTHZ-004 | BLOCKED | Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF. |
| REQ-AUTHZ-005 | BLOCKED | Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF. |
| REQ-AUTHZ-006 | BLOCKED | Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF. |
| REQ-AUTHZ-007 | BLOCKED | Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF. |
| REQ-AUTH-001 | BLOCKED | Validar la UI de login contra el backend real y completar aceptación; HTTP/Argon2id/PG se evidencian separadamente. |
| REQ-AUTH-002 | BLOCKED | Resolver C-LOGIN y aprobar la política canónica de MFA por riesgo; no introducir bypass operativo. |
| REQ-AUTH-003 | BLOCKED | Completar D4 y el flujo EMAIL operativo verificado; TOTP privado real no acepta por sí solo ambos canales ni su UI. |
| REQ-AUTH-004 | BLOCKED | D3: verificar apps/plataformas/versiones requeridas con autenticadores reales; OTPAuth no demuestra interoperabilidad externa. |
| REQ-AUTH-010 | BLOCKED | D4: verificar el consumo de un solo uso por todos los recorridos EMAIL reales y sus reintentos de entrega. |
| REQ-AUTH-011 | BLOCKED | D4: destinatario verificado, TTL300s y reenvío/consumo/expiración de entrega integral, sin extensión de TTL. |
| REQ-AUTH-012 | BLOCKED | D2/D4: HMAC y claves reales de EMAIL, almacenamiento y canales de entrega completos; fixtures SQL no acreditan custodia. |
| REQ-AUTH-013 | BLOCKED | Completar el reenvío EMAIL público con invalidación atómica de retos/outbox anteriores y versiones de destinatario. |
| REQ-AUTH-014 | BLOCKED | Completar cooldown EMAIL en la UI/API/worker real; el cooldown TOTP nativo ya se ejecutó con espera real. |
| REQ-AUTH-015 | BLOCKED | Validar límites de las tres dimensiones con ingreso confiable, carga y flujos reales completos; perfil actual de ensayo. |
| REQ-AUTH-016 | BLOCKED | Cubrir presupuestos de intentos y bloqueo por todos los canales públicos, incluidos EMAIL y recuperación. |
| REQ-AUTH-017 | BLOCKED | Validar presentación UI y todos los errores reales seguros; pruebas HTTP de contraseña conocida/ausente se vinculan como evidencia parcial. |
| REQ-AUTH-020 | BLOCKED | D2/D3: enrolamiento público con QR y app real; la ruta de enrolamiento permanece cerrada. |
| REQ-AUTH-021 | BLOCKED | D2/D3: primer código real antes de activar método/sesión por UI/API; SQL de confirmación/CAS queda como evidencia parcial. |
| REQ-AUTH-022 | BLOCKED | D2: custodio/proveedor, aislamiento, rotación y recuperación de claves reales; envelope v2 se prueba solo con clave sintética efímera. |
| REQ-AUTH-030 | BLOCKED | Completar enrolamiento público y generación de recovery codes con proveedor/HMAC aprobados. |
| REQ-AUTH-031 | BLOCKED | Validar entrega única de recovery codes en UI/API e idempotencia integral; no inferirla del lote de digests SQL. |
| REQ-AUTH-032 | BLOCKED | Validar HMAC/custodia y ausencia de plaintext en todo el flujo real de recovery codes. |
| REQ-AUTH-033 | BLOCKED | Aprobar e integrar contrato público completo de recuperación; el consumidor interno sin grant público no satisface ese flujo. |
| REQ-AUTH-034 | BLOCKED | Resolver C-SCOPE y aprobar el contrato/ACL administrativo de reset MFA; no heredar permisos B1-SELF. |
| REQ-AUTH-040 | BLOCKED | Completar aceptación UI/API/PG de Account → Security → Active Sessions; el recorrido HTTP privado se evalúa aparte. |
| REQ-AUTH-041 | BLOCKED | Validar los cuatro campos de sesión en la UI con datos reales y aceptación PO. |
| REQ-AUTH-042 | BLOCKED | Completar E2E UI de revocación individual con respuestas reales y aceptación; comprobar la evidencia SQL/HTTP adjunta. |
| REQ-AUTH-043 | BLOCKED | Completar E2E UI de revocación bulk preservando la sesión actual y otras empresas; no promover el caso HTTP a aceptación UI. |
| REQ-AUTH-044 | BLOCKED | Validar caducidad por inactividad por riesgo en todos los recorridos UI/API y aceptar el perfil operativo. |
| REQ-AUTH-045 | BLOCKED | Validar caducidad absoluta independiente del idle en todos los recorridos y aceptar el perfil operativo. |
| REQ-AUTH-046 | BLOCKED | Resolver C-SCOPE y contrato real de trusted device y revocaciones; no trasladarlo a otra fase. |
| REQ-AUTH-047 | BLOCKED | Completar UI y todas las acciones sensibles según política aprobada; step-up privado/bulk HTTP se vincula como evidencia parcial. |
| REQ-TEN-001 | BLOCKED | Completar los casos V4 de aislamiento mediante UI/API/PG para el alcance aprobado; revisar evidencia parcial nativa, roles y pool real antes de aceptación. |
| REQ-TEN-002 | BLOCKED | Completar los casos V4 de aislamiento mediante UI/API/PG para el alcance aprobado; revisar evidencia parcial nativa, roles y pool real antes de aceptación. |
| REQ-TEN-003 | BLOCKED | Completar los casos V4 de aislamiento mediante UI/API/PG para el alcance aprobado; revisar evidencia parcial nativa, roles y pool real antes de aceptación. |
| REQ-TEN-004 | BLOCKED | Completar los casos V4 de aislamiento mediante UI/API/PG para el alcance aprobado; revisar evidencia parcial nativa, roles y pool real antes de aceptación. |
| REQ-SEC-020 | BLOCKED | Completar proveedor de claves, provisión, exposición en sinks y aceptación de seguridad de todo el flujo; las bibliotecas maduras ya se ejercitan. |
| REQ-SEC-021 | BLOCKED | Aceptar perfil operativo de expiración absoluta y probarlo integralmente, sin promover valores de ensayo a producción. |
| REQ-AUD-001 | BLOCKED | Completar auditoría Auth en todos los flujos pendientes, fallos, recuperación y sinks reales; no inferir cobertura total de unos casos atómicos. |
