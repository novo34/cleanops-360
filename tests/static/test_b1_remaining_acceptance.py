"""Trace per-case real evidence without promoting partial/operational gates."""
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads((ROOT/path).read_text())
class RemainingAcceptance(unittest.TestCase):
 def test_every_composite_case_has_its_original_real_pass_and_cleanup(self):
  proof=read('docs/implementation/b1/remaining/ACCEPTANCE_EVIDENCE.json')
  self.assertEqual(proof['kind'],'COMPOSITE_REAL_CASE_EVIDENCE')
  for case in proof['checks']:
   raw=read(case['sourceReport']);self.assertEqual(raw['source'],case['source']);self.assertEqual(raw['run'],case['run']);self.assertEqual(raw['cleanup'],'PASS')
   self.assertTrue(any(c['name']==case['name'] and c['status']=='PASS' for c in raw['checks']))
  # Earlier complete policy run failed; keep it intact and reuse only independent PASS cases.
  prior=read('docs/implementation/b1/remaining/POLICY_EXECUTION.json');self.assertEqual(prior['result'],'FAIL')
  self.assertEqual(sum(c['status']=='PASS' and c['name'].startswith('Browser-PG-POLICY') for c in prior['checks']),4)
  self.assertFalse(any(c['status']!='PASS' for c in proof['checks']))
 def test_open_requirements_are_classified_and_no_runtime_or_formal_closure(self):
  matrix=read('docs/implementation/b1/closure/requirements.json');status=read('docs/implementation/b1/remaining/STATUS.json')
  self.assertEqual(matrix['accepted'],sum(r['acceptance']=='ACCEPTED' for r in matrix['requirements']))
  self.assertEqual({r['id'] for r in matrix['requirements'] if r['acceptance']=='OPEN'},{r['id'] for r in status['remaining']})
  allowed={'FUNCTIONALITY_INCOMPLETE','EVIDENCE_OR_TEST_PENDING','REAL_OPERATIONAL_DEPENDENCY','FORMAL_ACCEPTANCE_PENDING'}
  for row in status['remaining']:self.assertIn(row['classification'],allowed);self.assertTrue(row['blocker'])
  self.assertEqual(status['B1'],'OPEN');self.assertEqual(status['AUTH-GATE-05'],'OPEN');self.assertEqual(status['runtime'],'closedBackend')
  self.assertFalse(status['functionalContractDependency']['installed'])
 def test_final_directed_regression_is_raw_real_pass_with_complete_cleanup(self):
  report=read('docs/implementation/b1/remaining/REGRESSION.json');self.assertEqual(report['result'],'PASS')
  distinct=set();count=0;executions=0
  for battery in report['batteries']:
   raw=read(battery['report']);self.assertEqual(raw['result'],'PASS');self.assertEqual(raw['cleanup'],'PASS')
   self.assertEqual(raw['source'],battery['source']);self.assertEqual(raw['run'],battery['run']);self.assertEqual(raw['job'],battery['job'])
   self.assertTrue(all(c['status']=='PASS' for c in raw['checks']));count+=len(raw['checks'])
   cases=[c['name'] for c in raw['checks'] if c['name'].startswith('Browser-PG')];executions+=len(cases);distinct.update(cases)
  self.assertEqual(count,report['passedChecksIncludingRepeatedInstallationGuards']);self.assertEqual(executions,report['browserExecutionsIncludingRepeatedCommonCases']);self.assertEqual(len(distinct),report['distinctBrowserCases'])
  self.assertEqual(report['B1'],'OPEN');self.assertEqual(report['runtime'],'closedBackend')
if __name__=='__main__':unittest.main()
