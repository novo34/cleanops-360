"""Regression: a column ACL does not impose subject/expiry row filtering."""
import hashlib
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
SQL=ROOT/'docs/proposals/b1-consolidated-sql/revisions/04/schema.review.sql'

class ConditionalPG04GateTests(unittest.TestCase):
    def test_exact_candidate_has_global_broker_timestamp_visibility(self):
        raw=SQL.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),'81538c713e7e031a5acdc0b374f36a55e34ded733d9d08c99bc363c606d61083')
        self.assertEqual(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'f2c3c7c1f0859b9a6e0e2ed2c701f3c5d060774c')
        sql=raw.decode()
        block=re.search(r'DO \$private_policies\$(.*?)END \$private_policies\$;',sql,re.S).group(1)
        self.assertIn("'security_log'",block)
        self.assertIn('TO cleanops_auth_broker USING (true) WITH CHECK (true)',block)
        self.assertIn('GRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_auth_broker;',sql)
        table=re.search(r'CREATE TABLE identity_private.security_log \((.*?)\n\);',sql,re.S).group(1)
        self.assertNotIn('tenant_id',table)

    def test_production_runtime_remains_closed(self):
        runtime=(ROOT/'lib/b1/runtime.ts').read_text()
        self.assertIn('createAuthHandler(closedBackend, origin)',runtime)
