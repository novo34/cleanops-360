# Instrucción vigente: módulos reales, secuenciales, sin cierre por UI

Referencia: HEAD `8026e989a2a76d9dec107700f710c415c1c6b994`.
Esta instrucción del propietario sustituye el desarrollo paralelo de módulos demo.
No se modifica el roadmap canónico ni se aceptan fases por documentación.

## Módulo y dependencias

ROADMAP sitúa Foundation antes de Authentication+MFA y después Users/Roles y CRM.
No existe en la evidencia consultada una aceptación firmada de Foundation: no se
infiere ni se inventa. System status continúa bloqueado por acceso seguro.
El trabajo B1 ya autorizado sigue siendo la dependencia técnica activa para resolver
esa base de acceso; no constituye permiso para iniciar otra fase o declarar Foundation
aceptada. Tras validarla se comprueban los gates de Foundation y B1 en su orden real.

Módulo de trabajo actual: **B1, Autenticación y MFA — OPEN**.
44 filas obligatorias del inventario de cierre: **0/44 verificadas de extremo a extremo
(0 %)**. Esto NO significa cero código o cero pruebas unitarias: significa que no hay
filas con integración auténtica y aceptación completas. El porcentaje es un conteo
reproducible de `closure/requirements.json`; no una estimación de líneas escritas.
No se utiliza el porcentaje para ocultar obligaciones abiertas o sustituir gates.

`/demo`: **UI IMPLEMENTED**, reutilizable en sus futuros slices reales. No COMPLETE.
No se implementan nuevos CRUD/módulos demo ni se conecta autenticación simulada.
La arquitectura visual, navegación y pruebas existentes se conservan sin ampliarlas.

## Avance concreto de este incremento

Sin alterar un byte del candidato SQL consolidado ni instalarlo:

1. Diff completo publicado y reproducible contra V4/B1-X/D1 originales.
2. Revisión léxica de orden/tokens/cuerpos: 236 sentencias, 73 declaraciones de función,
   65 nombres de función, seis roles y 78 GRANT/REVOKE explícitos; límite del análisis
   declarado. No sustituye compilación SQL ni pruebas PostgreSQL.
3. Firmas/cabeceras y hashes de cuerpos inventariados; tres correcciones CASE y cambio
   de wrappers visibles. Se mantiene historial y hashes originales.
4. Riesgo de los cuatro UPDATE de columna al broker explícito; no hay ACL nueva frente
   al conjunto fuente, pero sí permisos que nunca llegaron a persistir en el ensayo.
5. Solicitud exacta PG-TEST-01-CONSOLIDATED-01 preparada. Sin aprobación no se ejecuta.
6. Pruebas estáticas con mutaciones de GRANT/RLS para impedir bendecir otro candidato,
   reproducción del diff y chequeo de literales/dollar bodies. CI sin base de datos.

## Secuencia finita para continuar el módulo real

- **Ahora:** revisión/diff/ACL/solicitud preparados; mantener todo fail-closed.
- **Tras aprobación de ensayo:** completar el harness real de casos obligatorios,
  instalar la única línea base en PG16 nuevo y vacío, validar catálogo/ACL/RLS y
  transacciones/CAS/auditoría/recuperación con dos tenants. No aceptar sentinels o mocks.
  Cualquier nuevo cambio SQL vuelve a una revisión integral del mismo candidato,
  nunca se instala sin aprobar su hash ni se acumula sobre instalaciones parciales.
- **Dentro de B1, sin abrir módulos siguientes:** resolver D2/D3/D4 y los addenda
  contractuales necesarios con alternativas/contratos preparados antes de solicitar
  decisiones. Integrar TOTP/EMAIL, sesiones, recuperación y UI existentes con backend,
  PostgreSQL y servicios reales de ensayo cuando sus autorizaciones estén dadas.
- **Cierre:** E0–E9 del PLAN.md, pruebas funcionales/seguridad/integración/E2E reales,
  persistencia/aislamiento comprobados, cero bloqueos críticos y aceptación explícita
  del propietario. No se marca COMPLETE con una sola ruta o un solo factor pendiente.

El bloqueo inmediato es SOLO permiso de instalar/probar el SQL exacto y sus ACL en
el entorno sintético aislado especificado. No se solicita permiso de producción,
SMTP, claves reales o despliegues para este primer ensayo. Esos controles siguen
siendo obligaciones de B1 y se pedirán cuando se preparen sus acciones concretas.

La petición está en `docs/proposals/b1-consolidated-sql/EXECUTION_REQUEST.json`;
los cambios de seguridad, en `SECURITY_REVIEW.md`; el diff íntegro, en `FULL.diff`.
B1, AUTH-GATE-05 y PG-TEST-01 OPEN; runtime sigue `closedBackend`.
