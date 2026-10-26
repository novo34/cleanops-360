# CLEANOPS 360 — REQUIREMENTS COVERAGE

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Registro exhaustivo de requisitos normativos — índice completo con anexo correctivo

**Criterio:** cada ID del SRS aparece una vez. La fase indica fase principal orientativa, no exclusividad ni validación. La descripción abreviada no sustituye el texto normativo SRS. Los detalles de API/UI/test deben completarse y verificarse en el slice real.

| ID | Fase principal propuesta | Resumen textual fuente | Autoridad | Estado de evidencia |
|---|---|---|---|---|
| REQ-AUTHZ-001 | 2 | Permisos por acción: view, create, edit, approve, delete, export, manage_permissions. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTHZ-002 | 2 | Ámbitos: tenant, módulo, WorkEngagement, proyecto, documento, plano, oferta, finanzas y datos de empleados. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTHZ-003 | 2 | El sistema deberá permitir overrides individuales por usuario. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTHZ-004 | 2 | Deberá permitir accesos temporales con start_at y expires_at. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTHZ-005 | 2 | La UI incluirá Administration → Users → User Detail → Manage Access. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTHZ-006 | 2 | La autorización deberá aplicarse también en API, no solo UI. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTHZ-007 | 2 | explicit deny prevalecerá sobre cualquier concesión; las políticas de aislamiento tenant y las restricciones de plataforma no podrán sobrepasarse mediante overrides. Ante falta de  | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-001 | 1 | Login mediante email + password. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-002 | 1 | Tras validar credenciales, se exigirá segundo factor según la política de riesgo del rol: obligatorio para administradores, comerciales, planificación, responsables y finanzas; con | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-003 | 1 | Métodos MFA: código OTP por email o TOTP Authenticator. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-004 | 1 | TOTP deberá ser compatible con aplicaciones estándar. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-010 | 1 | OTP de un solo uso. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-011 | 1 | Código OTP por email válido durante 5 minutos, de un solo uso y con invalidación por consumo o reenvío. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-012 | 1 | OTP almacenado como hash. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-013 | 1 | Reenvío invalida códigos anteriores. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-014 | 1 | Cooldown de reenvío. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-015 | 1 | Rate limit por usuario, IP y dispositivo. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-016 | 1 | Límite de intentos. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-017 | 1 | Mensajes que no permitan enumeración de cuentas. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-020 | 1 | Activación mediante QR. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-021 | 1 | No se activa hasta validar el primer código. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-022 | 1 | Secreto TOTP cifrado. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-030 | 1 | Generación al activar TOTP. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-031 | 1 | Mostrar una única vez. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-032 | 1 | Guardar como hash. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-033 | 1 | Un solo uso. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-034 | 1 | MFA reset por admin deberá quedar auditado. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-040 | 1 | Pantalla Account → Security → Active Sessions. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-041 | 1 | Mostrar dispositivo, navegador, creación y última actividad. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-042 | 1 | Revocar sesión individual. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-043 | 1 | Revocar todas las demás sesiones. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-044 | 1 | Timeout por inactividad: 30 minutos para administración/comercial/finanzas y roles de riesgo administrativo equivalentes, 8 horas para empleados operativos; responsables y otros ro | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-045 | 1 | Timeout absoluto obligatorio independiente del tiempo de inactividad y de remember device; su duración numérica permanece como parámetro técnico sujeto a validación de seguridad an | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-046 | 1 | Remember device válido por 30 días tras MFA y revocable por administrador, cambio de contraseña, reset MFA o riesgo; no amplía la validez de la sesión. La empresa podrá deshabilita | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AUTH-047 | 1 | Step-up MFA para acciones sensibles. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-TEN-001 | 2 | Todo dato deberá pertenecer a un tenant. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-TEN-002 | 2 | Tenant A nunca podrá acceder a datos de Tenant B. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-TEN-003 | 2 | El aislamiento se aplicará en backend/API. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-TEN-004 | 2 | Deberán existir tests automáticos de tenant isolation. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CRM-001 | 3 | CRUD y búsqueda de empresas. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CRM-002 | 3 | Una empresa podrá tener múltiples contactos, oportunidades, proyectos, contratos y WorkEngagements. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CRM-003 | 3 | CRUD y búsqueda de contactos. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CRM-004 | 3 | Roles de contacto: Bauleiter, Projektleiter, Facility Manager, Objektleiter, Einkauf, Baumanagement, administración, dirección. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CRM-005 | 3 | Un contacto podrá relacionarse con múltiples proyectos y oportunidades. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-COM-001 | 3 | Cada contacto podrá almacenar data_source, source_url, first_seen_at, last_verified_at, communication_basis, do_not_contact, do_not_contact_at, privacy_request_status, retention_re | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-COM-002 | 3 | Primer contacto frío no validado requiere APPROVAL. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-COM-003 | 3 | Suppression List global por tenant. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-COM-004 | 3 | DO_NOT_CONTACT impedirá comunicaciones automatizadas. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-COM-005 | 3 | UI para marcar no-contact desde contacto, hilo de email y Settings → Compliance. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OPP-001 | 4 | Crear Opportunity manualmente sin ProjectCandidate previo. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OPP-002 | 4 | Usuarios con opportunities.suggest podrán sugerir oportunidades sin acceso total al CRM. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OPP-003 | 4 | Usuarios con opportunities.approve podrán convertir sugerencias en Opportunity. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OPP-004 | 4 | El pipeline deberá ser configurable. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OPP-005 | 4 | Cada transición deberá quedar en historial. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-001 | 5 | Abstracción SourceConnector con tipos WEB, API, RSS, EMAIL, MANUAL, IMPORT, PORTAL. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-002 | 5 | Cada conector producirá RawFinding. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-003 | 5 | ProjectCandidate será distinto de Opportunity. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-004 | 5 | La ficha de ProjectCandidate deberá mostrar la acción explícita Promote to Opportunity a usuarios con el permiso project_candidates.promote. Al ejecutarla y superar las validacione | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-005 | 5 | No todo ProjectCandidate deberá promoverse; la promoción será una decisión humana explícita salvo que una regla futura aprobada defina otro comportamiento. La configuración AUTO en | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-006 | 5 | Permitir merge manual y mantener historial. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-020 | 5 | Pantalla Radar Runs. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-021 | 5 | Mostrar started_at, ended_at, sources_checked, found, new, duplicates, updated, failed. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-022 | 5 | Botón Run now. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-023 | 5 | Logs de ejecución visibles para usuario autorizado. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SCR-001 | 6 | Score comercial configurable. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SCR-002 | 6 | No decidirá automáticamente contacto. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SCR-003 | 6 | Devolverá score y reasons[]. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SCR-004 | 6 | UI con Recalculate. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-001 | 7 | Inbox integrado: enviar, recibir, responder, reenviar, adjuntos, búsqueda, etiquetas. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-002 | 7 | Emails vinculables a empresa, contacto, Opportunity y proyecto. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-003 | 7 | Primer email frío sin policy validada requiere aprobación. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-004 | 7 | Negociación de precio siempre manual. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-005 | 7 | IA puede redactar, traducir, resumir y clasificar. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-006 | 7 | IA no acepta precio/contrato/condiciones sensibles. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-007 | 7 | Email entrante se trata como contenido no confiable contra prompt injection. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-FUP-001 | 8 | Follow-up configurable. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-FUP-002 | 8 | Cancelar si hay respuesta, DO_NOT_CONTACT, Opportunity cerrada, contacto incorrecto o pausa manual. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-FUP-003 | 8 | Botón administrativo Run now. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-VIS-001 | 9 | SiteVisit con Opportunity/Project, fecha, hora, dirección, assigned_user, contacto, teléfono, notas, planos, adjuntos y estado. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-VIS-002 | 9 | UI móvil para notas, voz, fotos, vídeo, documentos, planos, edificios, plantas, viviendas, garajes y zonas comunes. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-VIS-003 | 9 | Formularios breves, no formularios gigantes obligatorios. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OFF-001 | 10 | Ofertas versionadas; nunca sobrescribir. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OFF-002 | 10 | Guardar changed_by, changed_at, reason, customer_request, status. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OFF-003 | 10 | Negociación mostrará current_price, requested_price, delta e impacto de margen si existe. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OFF-004 | 10 | Acciones: Accept, Counter, Maintain. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OFF-005 | 10 | Decisión humana. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-NPK-001 | 10 | MVP permite adjuntar PDF/XLSX/CRBX. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-NPK-002 | 10 | No construir editor NPK completo en MVP. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-NPK-003 | 10 | Arquitectura preparada para importación estructurada posterior. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-WE-001 | 11 | Al ejecutar la acción Accept sobre una oferta (REQ-OFF-004), el sistema deberá transicionar de forma automática e inmediata la Opportunity asociada a Won, registrar la transición e | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-WE-002 | 11 | Al transicionar una Opportunity a Won, el sistema deberá: | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-WE-003 | 11 | Crear WorkEngagement no presupone contrato firmado. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PLN-001 | 12 | Soportar PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRACT en el mismo motor. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PLN-002 | 12 | La publicación final será humana. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CAL-001 | 12 | Calendar será vista del Planning Engine. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CAL-002 | 12 | Vistas día, semana, mes, empleado, equipo, proyecto y ubicación. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CAL-003 | 12 | Mezclará todos los tipos de WorkEngagement. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CAL-004 | 12 | El botón Confirmar de My Day ejecutará el mismo flujo de acknowledgement. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SCH-001 | 12 | Cada planificación publicada tendrá versión. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SCH-002 | 12 | Guardar version, published_by, published_at, changes y affected_users. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SCH-003 | 12 | Optimistic locking o equivalente en planificación, ofertas, permisos, proyectos, contactos, horas y rapports. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CMP-001 | G-CMP previo 12 / 15 ampliación | Reglas laborales no codificadas como valores fijos. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CLI-001 | 15 | Puede provenir de Bauleiter, Objektleiter, Facility Manager, cliente, GU o administración. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CLI-002 | 15 | Toda ClientInstruction deberá generar un efecto definido y trazable en el dominio correspondiente. Ninguna instrucción podrá quedar como un registro aislado sin impacto visible. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CLI-003 | 15 | Ninguna ClientInstruction deberá interpretarse como aprobación de bloques de horas. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-HRS-001 | 16 | Proyecto puede tener reference_hours_current. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-HRS-002 | 16 | No es límite duro. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-HRS-003 | 16 | No crear solicitudes automáticas de ampliación. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-HRS-004 | 16 | Guardar ReferenceHoursHistory. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-HRS-005 | 16 | UI Project → Reference Hours → View History. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-HRS-006 | 16 | Alertas configurables 70/85/95/100%. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-HRS-007 | 16 | Superar 100% no bloquea operación. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PHS-001 | 13 | Fases configurables: renombrar, añadir, eliminar, ordenar. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PHS-002 | 13 | Una unidad puede tener estado independiente por fase. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PHS-003 | 13 | Una unidad puede limpiarse varias veces. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PRJ-001 | 13 | UI sencilla por edificio/planta/unidad. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PRJ-002 | 13 | No exigir jerarquías profundas. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PLAN-001 | 13 | Soportar PDF/JPG/PNG. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PLAN-002 | 13 | Versionado obligatorio. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PLAN-003 | 13 | Guardar name, code, revision, uploaded_at, uploaded_by, current_version, historical_versions. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PLAN-004 | 13 | No sobrescribir revisiones anteriores. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-PLAN-005 | 13 | Permisos por proyecto/documento. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-TRN-001 | 12 | Separar asignación y transporte. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-ACC-001 | 13 | Registrar key, badge, code, lockbox, opener, access_schedule, responsible_user. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RPT-001 | 17 | Registro diario y frecuencia de rapport son conceptos distintos. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RPT-002 | 17 | Cada contrato definirá si la validación de rapports es obligatoria. Las horas aprobadas podrán facturarse conforme al contrato; las rechazadas/disputadas permanecerán separadas y s | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-OFFLINE-001 | 16 | Offline-first mediante IndexedDB, cola local, identificadores idempotentes, sincronización incremental y versiones para detectar concurrencia. Solo se fusionarán automáticamente ca | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-TRC-WE-001 | 11 | La transición Offer Accepted → Opportunity Won → Pending WorkEngagement Creation → WorkEngagement Created deberá aparecer completa en FEATURE_TRACEABILITY_MATRIX.md. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-INF-001 | 0 | La primera topología de producción deberá desplegar frontend, API, PostgreSQL, Redis, BullMQ workers y archivos en **un VPS alojado en Suiza**, con Docker, redes privadas y volúmen | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-INF-002 | 0 | El proveedor de infraestructura suizo deberá ofrecer mitigación DDoS; se desplegarán firewall y WAF propios con reglas probadas. No se supondrá un proveedor CDN internacional. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-INF-003 | 0 | Backups completos diarios y WAL archivado de forma continua para recuperación PostgreSQL PITR, además de copia independiente y cifrada de archivos, configuraciones y secretos recup | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-INF-004 | 0 | El almacenamiento local deberá aislar tenants en autorización y rutas internas, aplicar cuotas y permisos, validar MIME y magic bytes, inspeccionar malware y descompresión malicios | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-JOB-001 | 0 | Redis + BullMQ ejecutará trabajos programados con deduplicación/idempotencia, concurrencia limitada, retry acotado, dead-letter o cuarentena de fallos, logs, métricas y Run now cua | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-020 | 7 | Cada tenant podrá configurar SMTP+IMAP con secretos protegidos, conexión TLS y compatibilidad con los mecanismos de autenticación que efectivamente permita su proveedor. Enviar y r | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-EML-021 | 8 | Los envíos comerciales tendrán límites progresivos por tenant y cuenta, no superiores a cuotas del proveedor ni límites globales; gestionar reputación, rebotes, pausas y DO_NOT_CON | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-RAD-030 | 5 | Frecuencia de Radar por fuente configurable, con intervalo recomendado y control de restricciones legales/técnicas de la fuente; ofrecer Run now autorizado, auditoría, métricas y d | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-AI-020 | 8 | La capa multi-proveedor seleccionará proveedor/modelo por tarea, presupuesto, calidad y clasificación de datos; deberá comprobar autorización tenant, residencia/ubicación de proces | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-DAT-020 | 3 | La retención se definirá por categoría y tenant con mínimos y obligaciones legales aplicables, bloqueo legal, anonimización/eliminación, pruebas y auditoría; no se fijarán periodos | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-FILE-020 | 9 (capacidad mínima) / 13 ampliación | Valores iniciales de subida: foto 20 MB, documento 50 MB, plano/archivo técnico 100 MB por archivo; cada tenant podrá configurar valores sujetos a límites globales seguros y cuotas | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-FIN-020 | 18 | Los contratos definirán modalidad de facturación: Regie por horas facturables y validación exigida, Pauschal por hitos/plazos pactados y recurrente según periodicidad. El sistema p | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-DOC-020 | 10 | MVP admite adjuntar PDF, XLSX y CRBX y extraer cuando sea viable información de PDF/Excel mediante IA con revisión humana obligatoria antes de incorporarla a una oferta; CRBX estru | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-CMP-020 | G-CMP previo 12 / 15 ampliación | Motor de reglas versionadas para legislación y GAV/CCT aplicables con ajustes tenant permitidos. Una tarea programada y botón Buscar cambios consultarán fuentes verificables; la IA | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-REC-020 | 14 | Las renovaciones usarán cláusulas contractuales y plazos de preaviso, alertas y asistencia IA; renovar automáticamente solo si el contrato vigente contiene habilitación expresa; re | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SEC-020 | 1 | El MVP empleará librerías maduras para hash, autenticación y TOTP, sin implementar criptografía propia. El registro, sesión y credenciales se verificarán con pruebas de seguridad. | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |
| REQ-SEC-021 | 1 | La caducidad absoluta de sesión tendrá un valor definido y probado antes de la entrega de Auth; no debe inferirse de los 30 días de dispositivo confiable ni de los timeouts de inac | SRS V1.1 | DESIGN_ONLY; implementación y E2E pendientes |

## Control de aceptación
Cada fila exige trazabilidad completa y prueba de backend consumido desde UI, salvo entidades operativas internas explícitamente justificadas. Si no hay implementación, permanece DESIGN_ONLY.


## Anexo correctivo: requisitos omitidos por el patrón anterior y nuevos IDs normativos

| ID | Fase o gate | Texto fuente abreviado | Autoridad | Estado |
|---|---|---|---|---|
| REQ-PR-001 | 0 | Toda la lógica de negocio principal deberá residir en CleanOps. No se usará n8n. | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-PR-002 | 0 | El sistema usará una entidad común WorkEngagement con tipos PROJECT, RECURRING_SERVICE, ONE_OFF_SERVICE y MAINTENANCE_CONTRAC | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-PR-003 | 0 | Todos los tipos de WorkEngagement deberán usar el mismo motor de planificación. | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-PR-004 | 0 | La UI deberá ser limpia, rápida, amigable, responsive y comprensible. | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-PR-005 | 0 | La IA no decidirá de forma autónoma precios, contratos, salarios, sanciones o decisiones financieras sensibles. | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-PR-006 | 0 | Cada feature deberá desarrollarse de extremo a extremo: DB → backend → API → permisos → UI → seguridad → pruebas → staging →  | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-PR-007 | 0 | No se iniciará una fase dependiente hasta que la fase anterior esté ACCEPTED, salvo autorización explícita del Product Owner. | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-EMP-001 | 12/previo G-EMP | El sistema deberá disponer de perfiles de empleado con identidad, contacto, idioma, tipo de empleo, disponibilidad, competenc | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-EMP-002 | 12/previo G-EMP | La gestión autorizada de disponibilidad, ausencias, habilidades y equipos deberá ofrecer interfaces y persistencia trazables  | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-CMP-030 | G-CMP previo 12 | Las reglas laborales GAV/CCT versionadas y su vigencia deberán evaluarse antes de publicar planificación o asignaciones depen | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-SVC-001 | G-SVC-ONE previo activación / 13–18 | ONE_OFF_SERVICE deberá poder crearse, planificarse, ejecutarse y cerrarse utilizando WorkEngagement y el Planning Engine únic | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-SVC-002 | G-SVC-MAINT previo activación / 14–18 | MAINTENANCE_CONTRACT deberá poder crearse, planificarse, revisarse y renovarse o terminarse según las condiciones contractual | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-FIN-030 | 18 | El sistema deberá distinguir, conservar y presentar worked_hours, validated_hours, invoiced_hours y paid_hours sin tratarlas  | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-FIN-031 | 18 | La configuración financiera por contrato deberá contemplar billing_frequency, payment_terms, billing_method, hourly_rate, fix | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-FIN-032 | 18 | La facturación deberá cubrir proyectos, servicios recurrentes y servicios puntuales; la recurrencia admitirá periodicidad sem | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-REC-030 | 14 | Los servicios recurrentes deberán soportar DRAFT, ACTIVE, PAUSED, RENEWAL_DUE, RENEWED, TERMINATION_PENDING y TERMINATED, con | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-REC-031 | 14 | En RENEWAL_DUE la interfaz deberá mostrar las acciones Renew, Renegotiate, Terminate y Postpone decision, respetando condicio | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-CLOSE-001 | 19 | El cierre deberá conservar fecha de fin, horas reales y de referencia, facturación, cobros, duración, incidencias, contacto y | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-CLOSE-002 | 19 | La interfaz de cierre ofrecerá Crear referencia comercial y No ahora; podrá elaborar borrador pero no publicar referencias ex | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-DASH-001 | 0–20 | El dashboard deberá mostrar información útil y comprensible de trabajo del día, empleados y ausencias, incidencias de atenció | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-SEC-030 | 20 | El Security Center deberá permitir consultar eventos e incidentes autorizados, auditorías y evidencia de pruebas de recuperac | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-AUD-001 | 20 | Las acciones relevantes sobre seguridad, permisos, asignaciones, cierres, facturas y estados contractuales deberán registrar  | SRS V1.1 | DESIGN_ONLY; E2E pendiente |
| REQ-OPS-001 | 20 | El endurecimiento de producción deberá verificar restauración, protección de interfaz/API, aislamiento, evidencias de pruebas | SRS V1.1 | DESIGN_ONLY; E2E pendiente |

## Ampliación de presupuestos — 2026-10-26

| Requisito | Fase | Alcance | Fuente | Estado |
|---|---|---|---|---|
| REQ-CALC-001 | 10 | Configuración por empresa | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-002 | 10 | Vigencia y cumplimiento | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-003 | 10 | Catálogo de rendimientos | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-004 | 10 | Raumbuch | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-005 | 10 | Coste completo | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-006 | 10 | Precio y negociación | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-007 | 10 | Recurrencia presupuestaria | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-008 | 10 | Snapshots y ajustes | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-009 | 10 | Oferta y confidencialidad | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-010 | 10 | Permisos y disponibilidad | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-011 | 16–18 | Estimado frente a real | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |
| REQ-CALC-012 | 10 | Exactitud y aceptación | SRS §13.1; OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; implementación, integración y E2E pendientes |

CALC-01…10 son casos diseñados, no evidencia PASS. Cierre de fase 10 no cierra REQ-CALC-011 ni módulos operativos.

## Conciliación integral del original — ampliación

| Requisito | Fase | Alcance | Fuente | Estado |
|---|---|---|---|---|
| REQ-CALC-013 | 10 | Estrategias y salidas | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-014 | 10 | Coste laboral temporal | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-015 | 10 | Cierres y transporte | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-016 | 10 diseño; efectos 11–18 según dependencia | Garantía y modificaciones contractuales | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-017 | 10 diseño; efectos 11–18 según dependencia | Reajustes por normativa | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-018 | 10 diseño; efectos 11–18 según dependencia | Contribución e inteligencia comercial | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-019 | 10 | Rendimientos contextualizados | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-020 | 10 | Documento comercial completo | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-021 | 10 | Importación y configuración inicial | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |
| REQ-CALC-022 | 10 | Cierre verificable del diseño | SRS §13.1; matriz original en OFFERS_AND_NEGOTIATION_SPEC.md | DESIGN_ONLY; pruebas funcionales NOT_RUN |

CALC-11…21 añaden cobertura diseñada, no PASS. Filas de alcance 10 diseño/efectos posteriores deben dividirse por capacidad antes de aceptar; nunca cerrar requisito integral con una plantilla o mock.
