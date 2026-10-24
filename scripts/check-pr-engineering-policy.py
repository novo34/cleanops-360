#!/usr/bin/env python3
"""Validate PR engineering evidence; human review determines its truth."""
import argparse
import html
import json
from pathlib import Path
import re
import sys
import unicodedata

FIELDS = (
    "REQ / módulo / resultado observable:",
    "Exclusiones y autorizaciones exactas:",
    "Archivos, componentes, funciones, contratos, harness y workflows existentes inspeccionados (rutas concretas):",
    "Alternativas evaluadas (reutilizar / corregir en origen / extender / reemplazar / crear):",
    "Justificación del diff mínimo y archivos nuevos (cada uno con dueño, consumidor, prueba y criterio de retirada si temporal):",
    "Riesgos de seguridad, ACL/RLS, tenant, migraciones, concurrencia y reversión:",
    "Evidencias (URL/run/SHA):",
    "Excepciones explícitas, dueño, aprobación y fecha/condición de eliminación:",
)
SECTIONS = ("Cambio y trazabilidad", "QG-0", "QG-1/QG-2", "QG-3")
CHECKS = (
    "No hay implementaciones paralelas, wrappers/guards/runner duplicados, endpoints huérfanos ni mocks productivos.",
    "Causa raíz corregida; no nueva variante por fallo previo sin STOP-AND-DESIGN.",
    "Consumidores, documentación y tests usan una implementación canónica.",
    "Cambios dentro de alcance y autorizaciones; no se han modificado archivos aprobados sin nueva aprobación.",
    "Inventario de archivos añadidos/modificados/eliminados, sin basura o duplicación.",
    "Sintaxis/lint/tests locales antes de CI costosa.",
    "Tests reales y PASS/FAIL/SKIP separados con enlaces a logs y commit exacto.",
    "Controles de seguridad, multi-tenant, concurrencia e idempotencia probados si afectan al cambio.",
    "Sin merge/TECH-READY/ACCEPTED hasta satisfacer gates y revisión del propietario.",
)
PLACEHOLDERS = {"todo", "tbd", "pendiente", "por definir", "n/a", "ninguno", "x",
                "ninguno revisado", "no he inspeccionado nada", "sin revisar",
                "false", "falso", "no", "none", "null", "0"}

def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", html.unescape(value))
    value = "".join(char for char in value
                    if not unicodedata.category(char).startswith("C") or char.isspace())
    value = re.sub(r"[\x60*_~\\]", "", value).strip(" \t.,;:!?¿¡-")
    return " ".join(value.casefold().split())

def answer_text(answer: str) -> str:
    """Accepted inline grammar: literal prose/URLs and paired inline code only.

    Links, images, HTML, escapes and emphasis are deliberately outside this
    form's dialect. Their source length must never count as visible evidence.
    """
    parts = []
    i = 0
    while i < len(answer):
        char = answer[i]
        if char == "`":
            end = answer.find("`", i + 1)
            if end < 0 or end == i + 1:
                raise ValueError("Unpaired/empty inline code")
            parts.append(answer[i + 1:end])
            i = end + 1
        elif char in "[]<>!*_~\\":
            raise ValueError("Use literal prose/URLs or inline code in answers")
        else:
            parts.append(char)
            i += 1
    # Decode entities only after syntax recognition: escaped markup is text,
    # but encoded whitespace/control characters still cannot supply evidence.
    return normalize("".join(parts))


def validate(body: str) -> list[str]:
    """Parse a restricted top-level Markdown form, never arbitrary Markdown.

    Blocks: ATX headings, exact bold field labels, prose continuations and
    exact task items. Quotes are ineligible; other block syntax fails closed.
    There is no source-text search inside code, HTML, links or references.
    """
    if not isinstance(body, str):
        return ["PR body must be text"]
    sections = []
    answers = {}
    checks = []
    current = None
    quoted = False
    errors = []
    for raw in body.splitlines():
        if not raw.strip():
            quoted = False
            continue
        line = raw.expandtabs(4)
        if len(line) - len(line.lstrip()) > 3:
            return ["Indented blocks are outside the form dialect"]
        line = line.lstrip()
        if (re.match(r"^(`{3,}|~{3,})", line)
                or re.search(r"<(?:[A-Za-z!/?])", line)):
            return ["Code blocks and raw HTML are outside the form dialect"]
        if line.startswith(">"):
            quoted = True
            current = None
        # Lazy paragraph continuations also belong to a quote. This dialect
        # requires a blank boundary before returning to the top-level form.
        if quoted:
            continue
        heading = re.fullmatch(r"#{2,3}\s+(.+)", line)
        if heading:
            sections.append(heading[1])
            current = None
            continue
        field = next((label for label in FIELDS
                      if line.startswith("**" + label + "**")), None)
        if field is not None:
            if field in answers:
                errors.append("Duplicate field: " + field)
            answers.setdefault(field, []).append(line[len(field) + 4:].strip())
            current = field
            continue
        task = re.fullmatch(r"[-*]\s+\[([ xX])\]\s+(.+)", line)
        if task:
            checks.append((task[1], task[2]))
            current = None
            continue
        if (re.match(r"^(?:[-+*]\s|\d+[.)]\s|#{1,6}\s|\[)", line)
                or line.startswith(("**", "---", "===", "~~~"))):
            errors.append("Unsupported Markdown block")
            current = None
            continue
        if current is not None:
            answers[current].append(line)

    for section in SECTIONS:
        if sum(bool(re.match(re.escape(section) + r"(?:\b|\s|$)", title))
               for title in sections) != 1:
            errors.append("Missing/duplicate section: " + section)
    for label in FIELDS:
        try:
            value = answer_text(" ".join(answers.get(label, [])))
        except ValueError:
            value = ""
        tokens = [word.strip(".,;:!?¿¡-()") for word in value.split()]
        if (sum(char.isalnum() for char in value) < 12
                or value in PLACEHOLDERS
                or all(word in PLACEHOLDERS for word in tokens)
                or value.startswith(("tbd ", "todo ", "pendiente "))):
            errors.append("Missing/unsubstantiated answer: " + label)
    for label in CHECKS:
        matching = [mark for mark, text in checks if text == label]
        if len(matching) != 1 or matching[0] not in ("x", "X"):
            errors.append("Mandatory checklist unchecked/missing/duplicate: " + label)
    return errors

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", type=Path, required=True)
    args = parser.parse_args()
    try:
        payload = json.loads(args.event.read_text(encoding="utf-8-sig"))
        pr = payload.get("pull_request") if isinstance(payload, dict) else None
        if not isinstance(pr, dict):
            raise ValueError("Expected pull_request object")
        errors = validate(pr.get("body"))
    except (ValueError, OSError, UnicodeError) as err:
        print("ENGINEERING_POLICY_GATE FAIL: invalid event (" + type(err).__name__ + ")")
        return 2
    for err in errors:
        print("FAIL: " + err)
    if errors:
        return 1
    print("ENGINEERING_POLICY_GATE PASS (document structure only; review required)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
