#!/usr/bin/env python3
"""Independent AUTHZ acceptance negatives on exact authorized SQL10, no browser dependency."""
import importlib.util
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('access10',ROOT/'scripts/pg-access-browser.py');access=importlib.util.module_from_spec(spec);spec.loader.exec_module(access)
runner=access.runner;b=access.b
def checks():
 tests=runner.module('access_native','pg-access-security-tests.py')
 if not tests.gate(b):b.record('AUTHZ-native-acceptance','BLOCKED','Role/ACL prerequisite failed');return
 tests.audit_acceptance(b)
 runner.module('access_native_backup','pg-e1-native-tests.py').backup(b,31)
 b.REPORT['newUIE2E']='NOT_EXECUTED_NATIVE_ONLY_AUTHZ';b.REPORT['b1RequirementsAccepted']=0
runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
