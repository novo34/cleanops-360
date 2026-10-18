#!/usr/bin/env python3
"""Current recovery-code vertical plus EMAIL regression, exact approved SQL07."""
import importlib.util
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('recovery_browser',ROOT/'scripts/pg-email-browser.py');run=importlib.util.module_from_spec(spec);spec.loader.exec_module(run)
run.CONFIG='playwright.recovery-b1.config.ts'
run.UI_SCOPE='EXECUTED_RECOVERY_CODE_AND_EMAIL'
run.b.REPORT['increment']='RECOVERY_CODE_AND_EMAIL_REGRESSION'
if __name__=='__main__':sys.exit(run.runner.main())
