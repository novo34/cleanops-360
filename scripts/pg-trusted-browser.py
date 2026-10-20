#!/usr/bin/env python3
"""Existing exact owner-authorized SQL09; new trusted-device real vertical only."""
import importlib.util
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('approved09',ROOT/'scripts/pg-consolidated-09.py');nine=importlib.util.module_from_spec(spec);spec.loader.exec_module(nine)
runner=nine.runner;b=nine.b
original_payload=nine.payload
def payload():
 result=original_payload();b.REPORT.update(increment='TRUSTED_DEVICE_REAL_VERTICAL');return result
def checks():
 browser=nine.previous.browser
 browser.CONFIG='playwright.trusted-b1.config.ts'
 browser.UI_SCOPE='EXECUTED_SQL09_TRUSTED_DEVICE_REAL_BROWSER'
 browser.SECURITY_GATE='pg-trusted-security-tests.py'
 browser.browser()
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
