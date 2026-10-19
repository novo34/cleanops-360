# Compatibilidad, seguridad e instalación

Investigación sobre los cuatro repositorios oficiales, clonados en directorios separados y fijados por SHA en [upstream-pins.json](evidence/upstream-pins.json). Fecha 2026-10-19. Los cuatro existían, respondieron vía GitHub y no figuraban archivados en la consulta de metadata; actividad reciente no garantiza mantenimiento futuro ni ausencia de vulnerabilidades.

## Selección

| Herramienta | Clasificación | Integración ejecutada | Límite real |
|---|---|---|---|
| [Emil](https://github.com/emilkowalski/skills) | APTA CON ADAPTACIÓN | `emil-design-eng/SKILL.md` + licencia MIT en `.agents/skills/`; solo texto | Añadido opt-in explícito para no condicionar otros trabajos; descubrimiento del cliente pendiente |
| [Impeccable](https://github.com/pbakaus/impeccable) | APTA CON ADAPTACIÓN | `.agents/skills/cleanops-impeccable`, referencias originales, LICENSE Apache-2.0 y NOTICE | Se retira launcher/tabla de comandos y se marca adaptación. No motor, hooks, detector, live server ni auto-descarga |
| [Taste](https://github.com/Leonxlnx/taste-skill) | APTA CON ADAPTACIÓN | `.agents/skills/cleanops-taste`, referencias originales y licencia MIT | Solo guía de app screens, sin scripts, historial global, assets, generadores ni fuentes automáticas. Variante gpt-taste clásica NO RECOMENDADA para este alcance |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | APTA CON ADAPTACIÓN | `@playwright/mcp` 0.0.83 + lock en runtime privado; handshake/tools/navegación/snapshot/consola ejecutados | Requiere confiar en proyecto para cargar `.codex/config.toml`; catálogo de la conversación no verificado |
| Figma MCP | NO RECOMENDADA para este alcance | No instalado ni credenciales solicitadas | No existe archivo Figma que haga necesaria su integración; reconsiderar con una necesidad concreta |

## Formatos, instalación oficial y selección concreta

**Emil.** Instalador publicado: `npx skills@latest add emilkowalski/skills`. No ejecutado: resolvería código no fijado de un instalador adicional. Se copió el único SKILL.md autocontenido revisado, manteniendo MIT; se añadió `disable-model-invocation: true`. No binario, script, hook, paquete de animación ni dependencia nueva de React. Su contenido de microinteracciones/curvas/feedback es útil, pero no autoriza animación decorativa, bibliotecas ni cambios de comportamiento. Último commit revisado 11 octubre.

**Impeccable 4.7.0.** Ya contiene formato Codex `.agents/skills/impeccable`. El método oficial `npx impeccable install --providers=codex --scope=project` instala launcher y puede instalar hooks; el launcher ejecuta o descarga un binario en `~/.impeccable/bin/`. No se ejecutó. Adaptación identificada en SKILL.md: instrucciones de preparación textual y modo Operate, conservando referencias sin editar. Toda orden CLI dentro de referencias queda expresamente deshabilitada. Se conserva LICENSE y NOTICE; no se redistribuye binario ni se atribuye funcionamiento a su detector. Último commit revisado 19 octubre.

**Taste.** README actual admite Codex mediante skills/plugin; no se presupone compatibilidad por estar orientado también a Claude. La variante gpt-taste exige AIDA, GSAP y selección simulada: incompatible con productividad empresarial y evidencia real. La variante principal tiene un recorrido distinto para app screens, que sí aporta criterios de densidad, tablas, color de datos e identidad. Sus scripts incluyen generación, escritura de historial en home, navegación CDP y descargas externas de assets; no se copiaron ni ejecutaron. Se crea wrapper MIT explícito y se conservan referencias originales. No se presenta este subconjunto como el paquete completo. Último commit revisado 19 octubre.

**MCP.** README oficial configura `npx @playwright/mcp@latest` como servidor stdio para Codex; se sustituyó resolución flotante por instalación local 0.0.83 exacta. `npm view` verificó paquete, dependencias y scripts; `npm pack --ignore-scripts` mostró siete archivos. CLI/index.js delegan implementación a playwright-core. Versiones del lock: playwright y playwright-core `1.64.0-alpha-1790635538000`; este carácter prerelease se acepta solo en runtime de herramientas aislado, nunca reemplaza el 1.56.1 del producto. Instalación `npm install --ignore-scripts --save-exact`, sin scripts de lifecycle ni descarga de navegadores. Los dos paquetes de runtime no tienen scripts; el paquete MCP contiene scripts de desarrollo, no se ejecutaron. `npm audit` devuelve cero avisos conocidos a la fecha, no es una auditoría de seguridad completa del código transitorio. Antes de actualizar: revisar diff/lock/integridades y repetir smoke. La licencia Apache-2.0 permanece en node_modules y upstream; no se redistribuyen sus fuentes en la aplicación.

## Revisión transversal de permisos y cadena de suministro

| Aspecto solicitado | Resultado y mitigación |
|---|---|
| OS y runtime | Linux disponible, Node 24.19.0, Chromium instalado, Python Playwright, OpenSSL y Codex CLI 0.159.2. Skills de texto no dependen de OS; launcher MCP preparado para este Linux, no se afirma ejecución en macOS/Windows |
| Compatibilidad Codex | SKILL.md con frontmatter y ubicación `.agents/skills/<name>`; configuración MCP `.codex/config.toml`. No se usan rutas Claude. El cliente real no pudo completar arranque por installation_id de solo lectura; se registra PENDIENTE, no instalación completa |
| Scripts ejecutados | Git clone/fetch; npm metadata/pack/install/audit con ignore-scripts; scripts propios legibles en design/scripts; CLI MCP revisada + dependencias fijadas; ningún curl-pipe-shell ni hook externo |
| Secretos y archivos | Ninguna credencial leída; Git usa su canal configurado. Skills heredan capacidad del agente, no son sandbox: el wrapper limita instrucciones pero no sustituye permisos. Launcher MCP filtra env a red/CA/PATH y fija raíz al worktree; sin Docker socket, CDP externo ni lectura libre de archivos |
| Red | GitHub/npm para investigación; demo HTTPS en navegador. MCP por stdio, sin listener remoto. Guard propio permite solo GET/HEAD de `/demo`, `/demo/…` y `/_next/…` del mismo origen; service workers bloqueados |
| Navegador | Contexto aislado, sin storageState, cookies iniciales ni sesiones reutilizadas. Archivos de runtime ignorados; no cookies/tokens en Git. Navegador headless dentro del sandbox del entorno; no se afirma aislamiento OS independiente del proceso Chromium |
| TLS | Primer intento falló por CA del proxy. Se calculó SPKI de la CA pública configurada y se confía SOLO en esa clave con flag Chromium acotado, sin `ignoreHTTPSErrors`/`--ignore-certificate-errors` general ni cambio de trust store global. No reutilizar el pin en otros entornos; no prueba el certificado público sin intermediario |
| Frontera MCP | Allowed-origins del proveedor NO es frontera de seguridad ni cubre todas las redirecciones. Guard adicional reduce superficie; servidor/proceso sigue siendo código externo capaz de acceder a archivos permitidos por sandbox. Codex solo habilita herramientas enumeradas; no browser_run_code, install-browser, storage o uploads. El cliente aún no ha cargado esa allowlist: no atribuirle protección verificada |
| Rendimiento | Solo un navegador/harness por tanda; MCP y capturas no requieren levantar Next/DB ni suites intensivas. Guías solo consumen contexto al invocarlas. Se conserva 1MB aproximado de referencias, sin runtime visual en bundle |
| Conflictos | AIDA/GSAP y cambio automático de logo/fuentes excluidos. Impeccable sin launcher/auto-hooks. Ninguna dependencia del paquete principal ni de Playwright Test se cambia |
| Necesidad | Emil para interacción; Impeccable para revisión; Taste para variación razonada; MCP para exploración real. Figma no añade valor sin documento de diseño |

## Evidencia de uso y límite del cliente

`design/evidence/mcp-smoke.json` registra initialize, 25 herramientas anunciadas, navegación real a demo, snapshot accesible, cero errores de consola y cierre. El servidor funciona. `.codex/config.toml` permite las herramientas necesarias de revisión; no registra un servidor global.

`design/evidence/codex-skills.json` registra el bloqueo real. El cliente informa que las skills pueden cargarse incluso sin confiar en configuración de proyecto, pero no llega a responder `skills/list`: no hay evidencia de los nombres descubiertos. Los ficheros son legibles y utilizables por lectura explícita en este trabajo; no se declara completado el descubrimiento automático ni la integración MCP dentro del cliente. Completar ambos en un cliente con estado escribible y confianza local aprobada, sin cambiar B1. No se solicitó permiso para modificar configuración compartida porque no es necesario para entregar los artefactos y propuestas revisables.
