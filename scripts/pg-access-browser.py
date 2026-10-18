#!/usr/bin/env python3
"""Approved SQL10, real AUTHZ UI/API/PG; no new SQL or privileges installed."""
import importlib.util
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('approved10',ROOT/'scripts/pg-consolidated-10.py');ten=importlib.util.module_from_spec(spec);spec.loader.exec_module(ten)
runner=ten.runner;b=ten.b
payload10=ten.payload
def payload():
 result=payload10();b.REPORT.update(increment='AUTHZ_REAL_VERTICAL');return result
def checks():
 browser=ten.prior.nine.previous.browser
 browser.CONFIG='playwright.access-safe-b1.config.ts';browser.UI_SCOPE='EXECUTED_SQL10_AUTHZ_READONLY_FAILCLOSED_REAL_BROWSER';browser.SECURITY_GATE='pg-access-security-tests.py'
 browser.browser()
 b.REPORT['retainedAuthzBlocker']={'source':'c27dbc68e23867d20a552da14c589d2d1f572568','run':39119733531,'PASS':89,'FAIL':4,'reexecuted':False,'newSql11Installed':False,'AUTHZ':'INCOMPLETE'}
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
