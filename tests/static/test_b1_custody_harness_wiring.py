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

    def test_real_drill_copies_current_harness_and_fails_closed(self):
        script = (ROOT / "scripts/test-b1-openbao-integration.py").read_text(encoding="utf-8")
        copier = (ROOT / "scripts/pg-http-integration.py").read_text(encoding="utf-8")
        worker = (ROOT / "scripts/openbao-isolated-worker.mjs").read_text(encoding="utf-8")
        self.assertIn("'scripts/openbao-b1-integration.ts'", script)
        self.assertIn("module('bao_runtime','pg-http-integration.py').copy_runtime", script)
        self.assertIn("str(root/name)", copier)
        self.assertIn("'./openbao-b1-integration.ts'", script)
        self.assertIn("INTEGRATION_WORKER_CHECK_FAILED", script)
        self.assertIn("INTEGRATION_WORKER_REDACTED_PROTOCOL_FAILURE", script)
        self.assertIn("await import(input.integrationModule)", worker)

    def test_runtime_stays_closed_and_never_imports_custody_harness(self):
        runtime = (ROOT / "lib/b1/runtime.ts").read_text(encoding="utf-8")
        self.assertIn("createAuthHandler(closedBackend, origin, undefined, internalOrigins)", runtime)
        self.assertNotIn("custody-composition", runtime)
        self.assertNotIn("openbao-b1-integration", runtime)


if __name__ == "__main__":
    unittest.main()
