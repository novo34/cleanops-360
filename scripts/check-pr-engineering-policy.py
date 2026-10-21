#!/usr/bin/env python3
"""Cheap, dependency-free QG-0 PR guard. Fails closed on absent reuse evidence.

Usage: python scripts/check-pr-engineering-policy.py --event "$GITHUB_EVENT_PATH"
No network, secrets, database or mutations. Semantic reuse requires human review.
"""
import argparse
import json
from pathlib import Path
import re
import sys

REQUIRED = (
    "## Cambio y trazabilidad",
    "## QG-0",
    "## QG-1/QG-2",
    "## QG-3",
)
FIELDS = (
    "REQ / módulo / resultado observable:",
    "Exclusiones y autorizaciones exactas:",
    "Archivos, componentes, funciones, contratos, harness y workflows existentes inspeccionados (rutas concretas):",
    "Alternativas evaluadas (reutilizar / corregir en origen / extender / reemplazar / crear):",
    "Justificación del diff mínimo y archivos nuevos",
    "Riesgos de seguridad, ACL/RLS, tenant, migraciones, concurrencia y reversión:",
    "Evidencias (URL/run/SHA):",
    "Excepciones explícitas, dueño, aprobación y fecha/condición de eliminación:",
)

def validate(body: str) -> list[str]:
    errors = []
    if not isinstance(body, str):
        return ["PR body absent"]
    for heading in REQUIRED:
        if heading not in body:
            errors.append("Missing section: " + heading)
    for field in FIELDS:
        if field not in body:
            errors.append("Missing field: " + field)
    # Require meaningful content rather than an unfilled PR template.
    lines = body.splitlines()
    for field in FIELDS[:6]:
        matching = [i for i, line in enumerate(lines) if field in line]
        if not matching:
            continue
        i = matching[0]
        after = lines[i].split(field, 1)[1].replace("**", "").strip()
        follow = lines[i+1].strip() if i+1 < len(lines) else ""
        if not after and (not follow or follow.startswith(("##", "**", "- [", ">"))):
            errors.append("Unfilled field: " + field)
    if "No hay implementaciones paralelas" not in body:
        errors.append("Missing anti-duplication assertion")
    if "Sintaxis/lint/tests locales" not in body:
        errors.append("Missing validation assertion")
    # An unchecked checklist is not evidence. QG-3 must be explicitly completed.
    required_checks = (
        "No hay implementaciones paralelas",
        "Consumidores, documentación y tests usan una implementación canónica",
        "Inventario de archivos añadidos/modificados/eliminados",
        "Sintaxis/lint/tests locales",
        "Sin merge/TECH-READY/ACCEPTED",
    )
    for label in required_checks:
        if not re.search(r"(?m)^- \[x\] [^\n]*" + re.escape(label), body, re.IGNORECASE):
            errors.append("Unchecked mandatory evidence: " + label)
    # Never accept explicit bypasses as evidence.
    if re.search(r"(?im)^\s*(?:QG-0|inventario de reutilización)\s*:\s*(?:n/a|omitido|skip)\s*$", body):
        errors.append("Reuse inventory cannot be waived by a placeholder")
    return errors

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", type=Path, required=True)
    args = parser.parse_args()
    event = json.loads(args.event.read_text(encoding="utf-8"))
    pr = event.get("pull_request")
    if not isinstance(pr, dict):
        print("Not a pull request event; fail closed")
        return 2
    errors = validate(pr.get("body") or "")
    if errors:
        print("ENGINEERING_POLICY_GATE FAIL")
        for error in errors:
            print("- " + error)
        return 1
    print("ENGINEERING_POLICY_GATE PASS (documentary structure only; review required)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
