# Riesgos y parámetros abiertos — CleanOps 360

**No se declaran resueltos por este documento.** Registro detallado y responsables **por rol**: `IMPLEMENTATION_GATES.md`. Dependencias: `DEPENDENCY_GRAPH.md`.

| Riesgo/decisión técnica | Responsable propuesto | Fecha límite por hito | Evidencia de cierre |
|---|---|---|---|
| Caducidad absoluta de sesión y revocación | Security/Auth | Antes de aprobar Auth (F1) | TTL aprobado y tests de sesión |
| Compatibilidad datos/archivos PITR y restore | DevOps/DBA | Antes de producción (F20), diseño F0 | Restore coordinado, RPO/RTO medidos |
| VPS CH, DDoS y WAF efectivo | DevOps/Security | Antes de producción (F20) | Evidencia proveedor, configuración y pruebas |
| Validación proveedor IA/SMTP/IMAP y transferencias | Legal/Security | Antes de activar conectores | Contratos, flujo de datos y autorización |
| GAV/CCT y normas laborales aplicables | Responsable cumplimiento | Antes de Planning (G-CMP) | Fuente vigente, versión aprobada y test de bloqueo |
| Offline conflictos y cuotas | Frontend/API/QA | Antes de cada slice offline | Casos por entidad con recuperación de conflicto |
| Personal y disponibilidad operativos | Operaciones/QA | Antes de Planning (G-EMP) | E2E altas/ausencias/disponibilidad/asignación |
| Parámetros globales de ficheros y cuotas | Security/Ops | Antes de subir archivos reales | Valor firmado, límites y pruebas |

Las 26 decisiones del Product Owner permanecen aprobadas. La fecha numérica y responsable nominal deberán asignarse al comenzar ejecución; no se inventan en etapa documental.
