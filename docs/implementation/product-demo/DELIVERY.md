# Producto demostrable y backend B1 — dos líneas de entrega

Base revisada: HEAD `994a9363d488ec4cc2fddd403ff368195b215067`, PR #7.
Autoridad: nueva instrucción del propietario sobre ejecución paralela; Product Master
V3 §§12, 103, 106, 141/143/145; SRS V1.1; ROADMAP; UX_UI_SPEC y PLANNING_ENGINE_SPEC.
Ninguna fuente canónica se sobrescribe. La demo es una excepción explícitamente
solicitada al orden histórico de fases, NO aceptación anticipada de dichas fases.

## Estado real de la interfaz al iniciar

- `/`: System status con loading, error y gate; no dashboard operativo.
- `/login`: panel LOGIN/PREAUTH/selección TOTP/verificación/step-up; validado previamente
  con fixtures, runtime todavía cerrado. No se presenta como autenticación operativa.
- No existían rutas empresariales para empresas/clientes/empleados/Planning.

Reutilizado: Next App Router/React/TypeScript, lucide-react, política CSP con nonces,
proxy seguro existente, tipografía del sistema, infraestructura Playwright Chromium,
servidor TLS de pruebas, lint/typecheck/Vitest/B1/build. El AuthPanel y System status
no se reimplementan. System status conserva su ruta y añade un acceso a `/demo`.
Los estilos de producto están limitados a `.demo-*`; no cambian las pantallas de auth.

## Incremento D0 implementado: recorrido demo independiente

Entrada `/demo`; navegación por URL a empresas, clientes, empleados y Planning.
Dos escenarios ficticios seleccionables, 3 empresas y 6 personas por escenario,
7 servicios de los cuatro WorkEngagement aprobados. Todos los identificadores son
`demo-*`; correos `example.invalid`; datos públicos y deliberadamente ficticios.

| Módulo / requisito de origen | Efecto funcional D0 | Criterio objetivo de demo |
|---|---|---|
| Dashboard · REQ-DASH-001 / Master §106 | Agenda del lunes ficticio, disponibilidad/ausencias, revisiones, comercial/finanzas ficticias; acceso a fichas y módulos | Cifras operativas derivadas del escenario; fichas abren/cierra con foco restaurado; botones navegan |
| Navegación · UX_UI_SPEC | URLs explícitas, ruta activa, menú móvil, enlace para saltar al contenido | 5 vistas accesibles; rutas no permitidas 404; sin overflow a 390/768/1440 px |
| Empresas · REQ-CRM-001/002/003/004 | Directorio, búsqueda por nombre/ciudad/contacto, filtro relación, ficha con contacto y servicios | Búsqueda sin acentos; estado vacío recuperable; sin registros de otro escenario |
| Clientes · REQ-CRM-001/002 | Proyección de empresas con relación Cliente; reutiliza modelo y ficha | 2 clientes del mismo directorio, prospecto excluido; no entidad CRM duplicada |
| Empleados · REQ-EMP-001/002 | Personas, estados, competencias, idiomas/conducción, búsqueda/filtro y ficha | Filtro Vacaciones y búsqueda Lucía; activación Enter y cierre Escape; foco regresa |
| Planning · REQ-PR-003, REQ-PLN-001/002, REQ-CAL-001/003 | Una semana de propuestas; filtros por tipo/revisión; cobertura y solapamientos explicados | 4 tipos en la misma vista; 3 avisos en escenario Léman; gap de 2 personas reproducible; publicar siempre deshabilitado |

Criterios visuales: jerarquía clara agenda→atención→equipo/negocio; paleta verde oscuro,
papel cálido y acentos por tipo de trabajo; iconografía consistente; fuente local sin
terceros; búsqueda/filtros legibles; foco visible; no acciones sin efecto o sin estado
explícito. Capturas 390/1440 por módulo publicadas como artifact `demo-visual-review`.
La prueba de overflow no sustituye la revisión visual/manual del propietario.

## Límites verificables, sin seguridad simulada

- La demo no importa backend B1/DB ni llama `/auth`, `/me`, `/mfa` o `/api`.
- No escribe localStorage/sessionStorage/IndexedDB/cookies ni imprime datos.
- Filtros/escenario/fichas solo en memoria; recarga vuelve al escenario inicial.
- Selector de escenario NO es control de autorización multiempresa. Todos estos
  datos son públicos; su separación de vistas no certifica RLS.
- No hay sesión falsa, rol autorizado falso ni indicadores de backend seguro.
- El resumen de conflictos solo compara fixtures; no implementa el optimizador ni
  valida skills/descansos/GAV/CCT/transporte. No se permite asignar/publicar trabajo real.
- D0 no declara CRUD real, auditoría persistida, sincronización offline ni aceptación
  normativa completados. Esas obligaciones permanecen en sus slices reales.

## Dependencias críticas y trabajo que avanza en paralelo

| Línea | Puede avanzar ahora | Dependencia que sí impide integración real |
|---|---|---|
| Producto demo | Navegación, diseño, filtros/fichas, formularios y journeys sobre fixtures públicos, pruebas UI | Ninguna dependencia PostgreSQL para el recorrido demo |
| Backend/seguridad | Candidato SQL único, trazabilidad y pruebas estáticas; resolver defectos demostrados en propuesta | Autorización del hash/ACL consolidado antes de instalarlo o validar SQL en PG16 |
| Empresas/clientes reales | UX y validadores conforme CRM/contact compliance existentes | Auth/RBAC/tenant/auditoría y API/persistencia reales; gate de contacto antes de comunicaciones |
| Empleados reales | UX de perfil/disponibilidad/equipo sin datos reales | Auth/RBAC, datos sensibles, aislamiento/auditoría y aceptación G-EMP |
| Planning real | UI de propuestas, selección y explicación de conflictos demo | G-EMP y G-CMP aceptados, motor único con entradas reales, autorización humana y versionado/concurrencia |
| Integración final B1 | Mantener suites existentes y closedBackend; preparar pruebas | E0–E9, D1–D4 operativos, PG real autorizado, recuperación y aceptación completa |

## Plan finito de entregas verificables

1. **D0, este incremento:** recorrido completo de cinco vistas, datos aislados, filtros,
   fichas, Planning de lectura, capturas y regresión CI. PASS demo solo si las pruebas
   siguientes pasan; revisión visual pendiente hasta que el propietario la realice.
2. **D1 producto:** formularios/edición demo de empresas/contactos y empleados,
   validaciones/empty/error/conflictos de edición según contratos existentes; efectos
   temporales explícitos, sin inventar APIs ni comunicación externa. Evidencia UI por
   journey y revisión visual. No depende de instalar SQL B1.
3. **D2 producto:** propuesta/revisión de Planning demo consumiendo el mismo modelo;
   conflictos de disponibilidad/versión explicados. Publicación real cerrada hasta
   G-EMP/G-CMP y sus pruebas. No se presenta un algoritmo ficticio como cumplimiento.
4. **B1 backend en paralelo:** revisar/aprobar una sola línea base SQL consolidada,
   instalar desde cero solo tras autorización, completar matriz real PG/B1 y corregir
   defectos en revisiones integrales trazables. E0–E9 y AUTH-GATE-05 no se cierran por UI.
5. **Integración real por slices:** sustituir únicamente fixtures de cada módulo cuando
   su contrato/API/RBAC/DB/auditoría estén validados; pruebas funcionales/seguridad/E2E
   y aceptación del propietario conforme ROADMAP. No hay migración de deuda de B1.

## Pruebas y reproducción sin DB

```
node --experimental-strip-types --test --test-isolation=none tests/b1/demo-model.test.ts tests/b1/consolidated-sql.test.ts
python3 scripts/consolidate-b1-sql.py --check
npm run lint
npm run typecheck
npm run test:b1
npm test
npm run build
npx playwright test --config=playwright.b1.config.ts
```

9 casos Chromium nuevos (incluyen tres tamaños): requests privados/cookies/storage y
CSP; navegación/búsqueda/vacío/fichas; teclado/foco; cambio de escenario/recarga;
Planning/cobertura/publicación cerrada; rutas 404; 15 combinaciones vista×viewport.
Las 46 pruebas TOTP previas continúan en la misma suite; no se sustituyen por la demo.
CI ejecuta cero SQL/DB y sube únicamente PNG de datos ficticios (sin capturas de auth).
No despliegue, merge ni producción autorizados o ejecutados.
