"""Verify that closure readiness reports evidence without granting acceptance."""
import importlib.util
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


if __name__ == "__main__":
    unittest.main()
