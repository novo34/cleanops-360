# Propuesta de sistema reutilizable — no aplicada

Base observada: React 19.2/Next 16.4, CSS propio, lucide-react 0.468.0, SWR. No hay necesidad probada de sustituir componentes por otro framework. `components/demo/workspace.tsx` ya incluye Badge, Avatar, Empty, Metric, DetailContent y shell; reutilizar sus comportamientos antes de extraer piezas.

## Tokens semánticos candidatos

| Grupo | Propuesta inicial | Regla |
|---|---|---|
| Identidad | Mantener `#183c35` tinta, `#216753` acción, `#dcedd6` acento suave, `#f5f6f1` fondo, blanco superficie | Colores existentes, sin cambio de marca; no dar mismo significado a selección y alerta |
| Texto secundario | Candidato `#52645b` en fondos claros; no reutilizar automáticamente overrides `#6b796d`/`#6c7c6b` | Medir ≥4,5:1 normal y ≥3:1 grande; tokens por función, no nombres de color sueltos |
| Riesgo | Texto `#85421a`, fondo `#f4e9d9`, icono + etiqueta | Propuesta a medir por pareja y tamaño. Color nunca único portador de significado |
| Borde/foco | Separador suave `#d1dbcf`; foco 3px `#216753` con offset adecuado | El borde tenue no delimita por sí solo controles esenciales; éstos precisan contraste suficiente |
| Tipo | Fuente actual/system fallback, cuerpo 14–16px, metadatos 12–13px, título 24–32px; line-height 1,4–1,6 | rem, zoom y texto multilíngüe; números tabulares para horas/importes. Serif B solo con aprobación |
| Espaciado | 4, 8, 12, 16, 24, 32, 48px | Compactar espacios de información repetida, respirar en cambios de sección |
| Radios | 4px datos/badges, 6–8px controles, 10–12px diálogo | Sin cápsulas universales ni radii distintos por pantalla |
| Elevación | 0 por defecto; una capa de separación para overlay; diálogo nativo | Borde o cambio de tono antes que sombra; no añadir blur caro |
| Movimiento | instantáneo para navegación frecuente; 120/160/200ms por estado; ease-out | Nada decorativo. Reduced motion elimina traslaciones; feedback de estado y foco se mantienen |

## Arquitectura progresiva

Primero, aislar DashboardOverview dentro del archivo existente o un componente local según el diff mínimo aprobado. `lib/demo/model.ts` permanece como fuente de fixtures; no se usa como autorización. Estilos bajo modificador propio de dashboard, evitando alterar sidebar, fichas y otras vistas por accidente. No tocar globals.css ni tokens globales del producto durante el piloto.

Tras validar piloto, proponer extracción pequeña con consumidores reales: `StatusBadge`, `DataRow`, `ViewToolbar`, `EmptyState`, `MetricStrip`, `DetailDialog`. Las APIs de props, foco y eventos deben conservar lo actual. No crear un nuevo kit entero sin consumidores. Demo y UI autenticada podrán compartir presentación después de revisión, pero proveedores de datos y permisos seguirán separados.

## Patrones previstos

- Navegación: nombre del producto, contexto explícito y ubicación actual; teclado; colapso responsive deliberado. Mantener navegación existente en piloto.
- Datos: lista semántica para agenda, tabla nativa para comparación de columnas cuando exista. Cabeceras/sort/selección accesibles, toolbar y paginación sólo si el backend las soporta; no fingir nuevas capacidades. Priorizar columnas en móvil sin eliminar datos decisivos.
- Formularios: labels persistentes, ayuda/errores asociados, grupos por tarea, validación sin borrar campos y feedback de envío. No rediseñar login B1 ni crear formularios CRUD sintéticos como funcionalidad completada.
- Estados: vacío con siguiente paso real, loading consistente cuando haya espera real, error con retry seguro cuando exista; offline/permisos/conflicto se conectarán a contratos reales, no se inventan en demo.
- Feedback: local cerca de la acción; live-region solo para cambios útiles, no cada render. Alertas críticas persistentes. No nuevos modales cuando baste detalle inline.
- Diálogos: conservar `<dialog>`, nombre, cierre, Escape y devolución de foco comprobados; no reemplazar por div estilizado.
- Responsive: escritorio amplio de datos; tablet con densidad y navegación revisadas; móvil con prioridad de excepciones y agenda legible. DOM/foco y orden visual coherentes.
- Accesibilidad: objetivo WCAG 2.2 AA; automatización + lectura humana. Contrast checks para todos los estados, zoom, teclado, lector, target y foco no tapado. No declarar AA solo por axe.
- Rendimiento: CSS/WAAPI para microfeedback; sin GSAP, icon packs adicionales o librería de charts por defecto. Evaluar volumen antes de virtualizar; tabla/lista paginada accesible antes de complejidad innecesaria.

Una vez elegida dirección, registrar decisiones con ejemplos reales de estados antes de promover tokens globales. Cambios de shell o AGENTS.md raíz se revisan por separado para no afectar otros equipos.
