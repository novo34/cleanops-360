import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('restricted',ROOT/'scripts/review-b1-restricted-purge.py')
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)

class RestrictedPurgeTests(unittest.TestCase):
    def test_exact_review_and_reproducible_diffs(self):
        for name,content in review.build().items():self.assertEqual((review.TARGET/name).read_text(),content)

    def test_broker_has_neither_read_nor_delete(self):
        sql=(review.TARGET/'schema.review.sql').read_text()
        self.assertNotIn('GRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_auth_broker;',sql)
        self.assertNotIn('GRANT DELETE ON identity_private.security_log TO cleanops_auth_broker;',sql)
        self.assertIn('REVOKE DELETE ON identity_private.security_log FROM cleanops_auth_broker;',sql)
        self.assertEqual(sql.count(review.NEW),1)

    def test_broader_policies_role_assumption_and_data_return_are_rejected(self):
        sql=(review.TARGET/'schema.review.sql').read_text()
        for changed in [sql.replace('FOR SELECT TO cleanops_security_log_purger USING (expires_at<=statement_timestamp())','FOR SELECT TO cleanops_security_log_purger USING (true)'),
                        sql.replace('NOINHERIT NOBYPASSRLS','NOINHERIT BYPASSRLS'),
                        sql.replace('$purge$;','$purge$;\nGRANT cleanops_security_log_purger TO cleanops_auth_broker;'),
                        sql.replace('WHERE expires_at<=statement_timestamp()\n$purge$', 'WHERE expires_at<=statement_timestamp() RETURNING expires_at\n$purge$')]:
            with self.assertRaises(ValueError):review.validate(changed)

    def test_helper_is_static_void_and_expiry_only_without_direct_service_grants(self):
        fragment=(review.TARGET/'purge-boundary.review.sql').read_text()
        self.assertIn('purge_expired_security_log() RETURNS void',fragment)
        self.assertIn('LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog',fragment)
        self.assertEqual(fragment.count('USING (expires_at<=statement_timestamp())'),2)
        self.assertNotIn('RETURNING',fragment)
        self.assertNotIn('GRANT cleanops_security_log_purger TO',fragment)
        self.assertNotIn('GRANT CREATE',fragment)
        self.assertIn('TO cleanops_auth_broker;',fragment)
