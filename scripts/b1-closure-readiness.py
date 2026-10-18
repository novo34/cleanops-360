#!/usr/bin/env python3
"""Read-only B1 closure gate. CI success cannot substitute for custody or PO sign-off."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/implementation/b1"


def evaluate(root=BASE):
    def read(path):
        return json.loads((root / path).read_text(encoding="utf-8"))

    matrix = read("closure/requirements.json")
    execution = read("operational-acceptance/openbao/integration/EXECUTION.json")
    po = read("remaining/PO_ACCEPTANCE_RECORD.json")
    rows = matrix["requirements"]
    ids = [r["id"] for r in rows]
    accepted = [r for r in rows if r["acceptance"] == "ACCEPTED"]
    pending = [r["id"] for r in rows if r["acceptance"] != "ACCEPTED"]

    integrity = (
        len(rows) == 44 and len(set(ids)) == 44
        and len(accepted) == matrix["accepted"]
        and set(pending) == {"REQ-PR-006", "REQ-PR-007"}
        and all(
            "accepted" not in r or (
                type(r["accepted"]) is bool
                and r["accepted"] == (r["acceptance"] == "ACCEPTED")
            )
            for r in rows
        )
    )
    synthetic_pass = (
        execution["result"] == "PASS"
        and len(execution["checks"]) == 144
        and all(c["status"] == "PASS" for c in execution["checks"])
        and execution["cleanup"] == "PASS"
    )
    # All gates are explicit. A prepared checklist is never treated as PO execution.
    operating = (
        execution.get("productiveCustodyAccepted") is True
        and execution.get("realSwissResidenceVerified") is True
        and execution.get("PR006") == "COMPLETE"
    )
    manual_cases = po.get("cases", [])
    manual = (
        len(manual_cases) == 10
        and [c.get("step") for c in manual_cases] == list(range(1, 11))
        and all(c.get("result") == "PASS" for c in manual_cases)
        and po.get("productOwnerDecision") == "ACCEPTED"
        and bool(po.get("tester")) and bool(po.get("executedAt"))
        and bool(po.get("independentSecurityReview"))
        and po.get("status") == "ACCEPTED"
    )
    gate_open = (
        matrix["authGate05"] == "OPEN" and matrix["runtime"] == "closedBackend"
        and po["authGate05"] == "OPEN" and po["runtime"] == "closedBackend"
    )
    return {
        "matrixIntegrity": "PASS" if integrity else "FAIL",
        "accepted": len(accepted),
        "total": len(rows),
        "isolatedIntegration": "PASS" if synthetic_pass else "FAIL",
        "operatingPR006": "COMPLETE" if operating else "INCOMPLETE",
        "manualPR007": "COMPLETE" if manual and operating else "INCOMPLETE",
        "authGate05": "OPEN" if gate_open else "REVIEW_REQUIRED",
        "closureAuthorized": bool(integrity and synthetic_pass and operating and manual and not gate_open and len(pending) == 0),
        "pendingRequirements": pending,
    }


if __name__ == "__main__":
    result = evaluate()
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(0 if result["matrixIntegrity"] == "PASS" and result["isolatedIntegration"] == "PASS" else 1)
