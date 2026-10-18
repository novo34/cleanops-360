"""Already owner-authorized SQL11; targeted remaining B1 criteria only."""
import importlib.util
from pathlib import Path
import sys
import os
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('remaining11',ROOT/'scripts/pg-consolidated-11.py');eleven=importlib.util.module_from_spec(spec);spec.loader.exec_module(eleven)
runner=eleven.runner;b=eleven.b
def checks():
 browser=eleven.prior.nine.previous.browser
 group=os.environ.get('B1_REMAINING_GROUP','abuse')
 if group not in ['abuse','mfa-admin']:raise RuntimeError('INVALID_REMAINING_GROUP')
 browser.CONFIG='playwright.'+group+'-b1.config.ts';browser.UI_SCOPE='EXECUTED_SQL11_'+group.upper().replace('-','_')+'_REAL_BROWSER';browser.SECURITY_GATE='pg11-access-security-tests.py'
 browser.browser()
 b.REPORT['increment']='REMAINING_B1_OTP_ABUSE_ANTIENUM'
runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
