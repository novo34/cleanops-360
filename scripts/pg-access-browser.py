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
 browser.CONFIG='playwright.access-b1.config.ts';browser.UI_SCOPE='EXECUTED_SQL10_AUTHZ_REAL_BROWSER';browser.SECURITY_GATE='pg-access-security-tests.py'
 browser.browser()
 runner.module('audit_acceptance','pg-access-security-tests.py').audit_acceptance(b)
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
