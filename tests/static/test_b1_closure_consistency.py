"""B1 closure consistency: canonical acceptance strings, not optional legacy booleans.

Read-only offline regression; never implies operational or PO acceptance.
"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
B1 = ROOT / "docs/implementation/b1"


def load(relative):
    return json.loads((B1 / relative).read_text(encoding="utf-8"))


class B1ClosureConsistency(unittest.TestCase):
    def test_all_44_canonical_rows_have_unambiguous_disposition(self):
        matrix = load("closure/requirements.json")
        rows = matrix["requirements"]
        ids = [row["id"] for row in rows]
        self.assertEqual(len(rows), 44)
        self.assertEqual(len(set(ids)), len(ids))
        self.assertEqual({row["acceptance"] for row in rows}, {"ACCEPTED", "OPEN"})
        accepted = [row for row in rows if row["acceptance"] == "ACCEPTED"]
        self.assertEqual(len(accepted), matrix["accepted"])
        self.assertEqual(matrix["accepted"], 42)
        self.assertEqual(
            {row["id"] for row in rows if row["acceptance"] == "OPEN"},
            {"REQ-PR-006", "REQ-PR-007"},
        )
        # Some historical rows omit the redundant accepted field. When present,
        # it must agree with the canonical acceptance decision, not redefine it.
        for row in rows:
            if "accepted" in row:
                self.assertIs(type(row["accepted"]), bool, row["id"])
                self.assertEqual(row["accepted"], row["acceptance"] == "ACCEPTED", row["id"])
            if row["acceptance"] == "ACCEPTED":
                self.assertTrue(row.get("evidence"), row["id"])
                self.assertTrue(row.get("tests"), row["id"])

    def test_operational_and_owner_gates_cannot_be_inferred_from_ci(self):
        matrix = load("closure/requirements.json")
        integration = load("operational-acceptance/openbao/integration/EXECUTION.json")
        manual = load("remaining/PO_ACCEPTANCE_RECORD.json")
        self.assertEqual(matrix["authGate05"], "OPEN")
        self.assertEqual(matrix["runtime"], "closedBackend")
        self.assertEqual(integration["result"], "PASS")
        self.assertEqual(len(integration["checks"]), 144)
        self.assertEqual(integration["accepted"], 42)
        self.assertEqual(integration["fullB1Result"], "OPEN_NOT_ACCEPTED")
        self.assertFalse(integration["productiveCustodyAccepted"])
        self.assertFalse(integration["realSwissResidenceVerified"])
        self.assertEqual(integration["PR006"], "OPEN")
        self.assertEqual(integration["PR007"], "OPEN")
        self.assertEqual(manual["status"], "PREPARED_NOT_EXECUTED")
        self.assertEqual(manual["authGate05"], "OPEN")
        self.assertEqual(manual["runtime"], "closedBackend")
        self.assertIsNone(manual["productOwnerDecision"])
        self.assertEqual([c["step"] for c in manual["cases"]], list(range(1, 11)))
        self.assertTrue(all(c["result"] == "NOT_EXECUTED" for c in manual["cases"]))


if __name__ == "__main__":
    unittest.main()
