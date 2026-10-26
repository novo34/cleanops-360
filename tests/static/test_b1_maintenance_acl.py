import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('maintenance_acl',ROOT/'scripts/review-b1-maintenance-acl.py')
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)

class MaintenanceACLTests(unittest.TestCase):
    def test_exact_column_grant_preserves_every_other_statement_and_original(self):
        files=review.build()
        for name,content in files.items():
            self.assertEqual((review.TARGET/name).read_text(),content)
        previous=(review.TARGET.parent/'03/schema.review.sql').read_text()
        new=(review.TARGET/'schema.review.sql').read_text()
        review.verify_delta(previous,new)
        self.assertIn('DELETE FROM identity_private.security_log WHERE expires_at<=statement_timestamp()',previous)
        self.assertNotIn(review.GRANT,previous)
        self.assertEqual(new.count(review.GRANT),1)

    def test_no_broader_select_service_grant_or_modified_predicate_is_reviewable(self):
        old=(review.TARGET.parent/'03/schema.review.sql').read_text()
        new=(review.TARGET/'schema.review.sql').read_text()
        variants=[new.replace('SELECT(expires_at) ON identity_private.security_log','SELECT ON identity_private.security_log'),
                  new.replace(review.GRANT,review.GRANT.replace('cleanops_auth_broker','cleanops_auth_maintenance')),
                  new.replace('DELETE FROM identity_private.security_log WHERE expires_at<=statement_timestamp()','DELETE FROM identity_private.security_log')]
        for variant in variants:
            with self.subTest(variant=variant[-40:]),self.assertRaises(ValueError):review.verify_delta(old,variant)

    def test_complete_final_definition_inventory(self):
        result=review.inventory((review.TARGET/'schema.review.sql').read_text())
        self.assertEqual(result['declarations'],73)
        self.assertEqual(result['finalDefinitions'],65)
        function=next(f for f in result['functions'] if f['name']=='auth_api.gc_ephemeral')
        self.assertIn('identity_private.security_log',function['referencedRelations'])
