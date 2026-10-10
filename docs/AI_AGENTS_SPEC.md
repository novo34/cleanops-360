# CLEANOPS 360 — AI AGENTS SPEC

**Estado:** Especificación documental preimplementación, 2026-10-09. **Jerarquía:** Product Master V3 (visión) → SRS V1.1 (normativa) → este documento (diseño derivado). Ningún endpoint o pantalla se considera implementado.

## Gobernanza multi-proveedor
Selección por tarea, coste, calidad, políticas del tenant y residencia de datos suiza; procesamiento externo de datos protegidos prohibido sin autorización y garantías verificadas.


## Agentes

Discovery, Research, Dedup, Scoring, Contact, Sales Writer, Reply Classifier, Next Action, Visit Summary, Planning, Project Risk, Document Extractor.


## Contrato de agente

Cada agente define entradas clasificadas, alcance, herramientas permitidas, output tipado, evidencias, costes, aprobación, logs, errores, límite de tokens y política de retención.


## No autonomía sensible

La IA no acepta contratos ni precios, no negocia ni aprueba salarios, sanciones, pagos o nuevas normas laborales. Contenido web/email/documento es no confiable (prompt injection).


## Salida verificable

Citas de fuentes, grado confidence CONFIRMED/PROBABLE/INFERRED/UNKNOWN cuando corresponda; revisión humana antes de incorporar partidas extraídas de PDF/Excel o cambios GAV/CCT.

