# D0 — Evidencia del incremento demo

Base de producto probada: `09a1201263f2298a1eafb701cb10704358e634c2`.
[CI 39015978175](https://github.com/novo34/cleanops-360/actions/runs/39015978175): SUCCESS.

- Lint, typecheck y build: PASS.
- Consolidación determinista sin ejecutar SQL: PASS.
- B1: 159 PASS; incluye 4 pruebas nuevas de modelo/contrato consolidado.
- Vitest: 13 PASS, 3 SKIP de PostgreSQL por no conectar DB. No se contabilizan como PG PASS.
- Chromium: 55 PASS (46 regresiones TOTP + 9 casos demo).
- 15 combinaciones de módulo×viewport sin overflow horizontal; 10 capturas desktop/mobile.
- Cero requests privados/cookies/storage en el caso demo; rutas desconocidas devuelven 404;
  fichas con Enter/Escape/foco, filtros/empty state y publicación deshabilitada verificados.
- No workflow PG automático ejecutado; ningún SQL nuevo instalado.

Capturas: [artifact demo-visual-review](https://github.com/novo34/cleanops-360/actions/runs/39015978175/artifacts/12094523803),
SHA-256 del ZIP `9d64c77feccbd07c4335d5f93008b250f04068c7b7603a3c77b24fb3f5709dc8`.
Es un artifact de CI con retención de 7 días, no un despliegue. Las pruebas lo regeneran.

Revisión visual del desarrollador sobre capturas reales de Chromium: dashboard desktop
1440/mobile 390, Planning desktop y empleados mobile revisados. Jerarquía, texto,
espaciado y adaptación coherentes; no se confunde con aceptación visual del propietario.

Mejora posterior acotada: conservar el escenario ficticio en memoria al navegar entre
módulos mediante un provider exclusivo de `/demo`; recargar vuelve al escenario inicial.
Regresión añadida al caso de cambio de escenario. Ajuste de singular/plural en contadores.
No cambia CSS, contratos, auth, datos reales o permisos. Su CI se verifica separadamente
en el HEAD del PR, sin atribuirle el resultado del commit anterior.

Entrada de revisión: `/demo` en la aplicación existente (también enlazada desde `/`).
No se ha creado hosting ni ejecutado despliegue. La revisión manual del propietario
puede usar la aplicación local o las capturas del artifact.

Pendientes reales: aceptación visual del propietario; integración auténtica y publicación
sujetas a contratos/seguridad/gates. La demo funciona sin esas dependencias. El único
bloqueo para probar el SQL consolidado es la autorización específica de su hash/ACL;
no bloquea entregas de producto demo. B1 y AUTH-GATE-05 permanecen OPEN.
