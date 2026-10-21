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
    "No hay implementaciones paralelas",
    "Causa raíz corregida",
    "Consumidores, documentación y tests usan una implementación canónica",
    "Cambios dentro de alcance",
    "Inventario de archivos añadidos/modificados/eliminados",
    "Sintaxis/lint/tests locales",
    "Tests reales y PASS/FAIL/SKIP",
    "Controles de seguridad, multi-tenant",
    "Sin merge/TECH-READY/ACCEPTED",
)
PLACEHOLDERS = {"todo", "tbd", "pendiente", "por definir", "n/a", "ninguno", "x",
                "ninguno revisado", "no he inspeccionado nada", "sin revisar"}

def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", html.unescape(value))
    value = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", value)
    value = re.sub(r"[\x60*_~\\]", "", value).strip(" \t.,;:!?¿¡-")
    return " ".join(value.casefold().split())

def visible(body: str) -> str:
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    return re.sub(r"<[^>]*>", "", body)

def validate(body: str) -> list[str]:
    if not isinstance(body, str):
        return ["PR body must be text"]
    body = visible(body)
    lines = body.splitlines()
    errors = []
    for section in SECTIONS:
        if not any(re.match(r"^#{2,3}\s+" + re.escape(section) + r"(?:\b|\s|$)", line) for line in lines):
            errors.append("Missing visible section: " + section)
    for label in FIELDS:
        matches = [i for i, line in enumerate(lines) if normalize(label) in normalize(line)]
        if len(matches) != 1:
            errors.append("Missing/duplicate field: " + label)
            continue
        i = matches[0]
        line = lines[i]
        # Extract only after the COMPLETE label, not an ambiguous prefix.
        start = normalize(line).find(normalize(label))
        if start < 0:
            errors.append("Malformed field: " + label)
            continue
        # Prefer the exact Markdown label; fallback is a normalized equivalent.
        prefix = "**" + label + "**"
        if prefix in line:
            answer = line.split(prefix, 1)[1]
        elif label in line:
            answer = line.split(label, 1)[1]
        else:
            answer = ""
        if not normalize(answer):
            following = []
            for candidate in lines[i+1:]:
                if not candidate.strip():
                    continue
                if candidate.startswith(("##", "**", "- [", "* [")):
                    break
                following.append(candidate)
                break
            answer = " ".join(following)
        value = normalize(answer)
        if len(value) < 12 or value in PLACEHOLDERS or value.startswith(("tbd ", "todo ", "pendiente ")):
            errors.append("Missing/unsubstantiated answer: " + label)
    for label in CHECKS:
        checked = [line for line in lines if re.match(r"^\s*[-*]\s+\[[xX]\]\s+", line) and label in line]
        if len(checked) != 1:
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
