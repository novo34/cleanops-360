# CleanOps 360 — Criterio de liberación documental y ejecución

## Resultado normativo
Se acepta como **base de planificación e inicio controlado Foundation**, no como aprobación tácita de parámetros operativos y grants por rol. El diseño no equivale a pruebas de producción.

## Obligaciones del equipo al recibir «desarrolla la siguiente fase»

1. Leer Product Master, SRS, ROADMAP, dependencias y dossier. Seleccionar solo el siguiente slice cuyas precondiciones estén satisfechas.
2. Convertir sus requisitos y casos `TC-*` en escenarios con fixtures y aserciones observables ANTES de codificar. No introducir parámetros faltantes como decisiones aprobadas.
3. Resolver con Product Owner solo decisiones de negocio no aprobadas; seguridad/arquitectura puede proponer opciones técnicamente fundadas, nunca rebajar restricciones.
4. Para flujos protegidos, conseguir aprobaciones de grants positivos del rol/acción/recurso y probar denegaciones por API.
5. Implementar **UI/UX + frontend + API + backend + persistencia + seguridad** en el mismo slice. No exponer endpoints huérfanos salvo servicios internos documentados y con consumidor/prueba.
6. Ejecutar pruebas unitarias, integración, navegador E2E, seguridad y aceptación manual con evidencia archivada; bloquear estado ACCEPTED si una dimensión falla.
7. Enviar entrega al Product Owner con evidencia, riesgos residuales y cambios documentales mínimos. No avanzar fase dependiente sin aprobación.

## Parámetros configurables y gates
Es aceptable diferir proveedor VPS específico, límites globales de subida, tiempo absoluto de sesión, flujos normativos exactos según GAV y estrategia detallada de recuperación **hasta su gate correspondiente**. No es aceptable desplegar, tratar datos reales, usar IA externa o activar funcionalidad afectada sin cerrar el gate con evidencia.

## Discrepancias
Si dos documentos se contradicen, parar la funcionalidad afectada y seguir jerarquía canónica; registrar incidente, proponer cambio consistente y solicitar validación si modifica el comportamiento de negocio. No corregir silenciosamente el SRS.

## Afirmaciones prohibidas en el informe de cierre
«Todos los requisitos están probados» sin ejecución; «todos los permisos decididos» cuando grants siguen pendientes; «RPO/RTO cumplidos» sin ensayo; «especificación cerrada para producción» cuando proveedor, legalidad o política sigue por verificar.
