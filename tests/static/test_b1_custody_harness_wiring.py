"""Guard the unpublished private PostgreSQL/OpenBao composition boundary.

This is a wiring regression, NOT a new real PostgreSQL/OpenBao execution.
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class CustodyHarnessWiring(unittest.TestCase):
    def test_synthetic_harness_uses_scoped_private_composition(self):
        source = (ROOT / "scripts/openbao-b1-integration.ts").read_text(encoding="utf-8")
        self.assertIn("withB1Custody({pool:identity,custody:vault", source)
        self.assertIn("totpKeys:[keys[0],keys[1]]", source)
        self.assertIn("audit:keys[2],otp:keys[3],recovery:keys[4],cursor:keys[5]", source)
        self.assertNotIn("createApprovedPrivateBackend(identity,", source)

    def test_runtime_stays_closed_and_never_imports_custody_harness(self):
        runtime = (ROOT / "lib/b1/runtime.ts").read_text(encoding="utf-8")
        self.assertIn("createAuthHandler(closedBackend, origin, undefined, internalOrigins)", runtime)
        self.assertNotIn("custody-composition", runtime)
        self.assertNotIn("openbao-b1-integration", runtime)


if __name__ == "__main__":
    unittest.main()
