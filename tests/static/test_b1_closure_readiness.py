"""Verify that closure readiness reports evidence without granting acceptance."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("b1_closure_readiness", ROOT / "scripts/b1-closure-readiness.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ClosureReadiness(unittest.TestCase):
    def test_current_isolated_technical_pass_operating_manual_open(self):
        result = module.evaluate()
        self.assertEqual(result["matrixIntegrity"], "PASS")
        self.assertEqual((result["accepted"], result["total"]), (42, 44))
        self.assertEqual(result["isolatedIntegration"], "PASS")
        self.assertEqual(result["operatingPR006"], "INCOMPLETE")
        self.assertEqual(result["manualPR007"], "INCOMPLETE")
        self.assertEqual(result["authGate05"], "OPEN")
        self.assertFalse(result["closureAuthorized"])
        self.assertEqual(set(result["pendingRequirements"]), {"REQ-PR-006", "REQ-PR-007"})


    def test_fail_closed_when_evidence_is_tampered(self):
        files = (
            "closure/requirements.json",
            "operational-acceptance/openbao/integration/EXECUTION.json",
            "remaining/PO_ACCEPTANCE_RECORD.json",
        )
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for filename in files:
                target = root / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((module.BASE / filename).read_bytes())

            def mutate(filename, change):
                target = root / filename
                original = target.read_text(encoding="utf-8")
                data = json.loads(original)
                change(data)
                target.write_text(json.dumps(data), encoding="utf-8")
                return original

            name = "operational-acceptance/openbao/integration/EXECUTION.json"
            original = mutate(name, lambda d: d["checks"][0].update(status="FAIL"))
            self.assertEqual(module.evaluate(root)["isolatedIntegration"], "FAIL")
            (root / name).write_text(original, encoding="utf-8")

            name = "closure/requirements.json"
            original = mutate(name, lambda d: d.update(accepted=44))
            self.assertEqual(module.evaluate(root)["matrixIntegrity"], "FAIL")
            (root / name).write_text(original, encoding="utf-8")

            name = "remaining/PO_ACCEPTANCE_RECORD.json"
            original = mutate(name, lambda d: d.update(productOwnerDecision="ACCEPTED"))
            self.assertEqual(module.evaluate(root)["manualPR007"], "INCOMPLETE")
            self.assertFalse(module.evaluate(root)["closureAuthorized"])
            (root / name).write_text(original, encoding="utf-8")

            self.assertEqual(module.evaluate(root)["matrixIntegrity"], "PASS")
            self.assertEqual(module.evaluate(root)["isolatedIntegration"], "PASS")


if __name__ == "__main__":
    unittest.main()
