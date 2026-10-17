#!/usr/bin/env python3
"""Exhaustive CASE-site inventory and exact revision 03 delta; never executes SQL."""
import argparse
import difflib
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'docs/proposals/b1-consolidated-sql/revisions/03'
OLD = "OR x.purpose IS DISTINCT FROM CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END"
NEW = "OR x.purpose IS DISTINCT FROM (CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END)"
spec = importlib.util.spec_from_file_location('review', ROOT / 'scripts/review-b1-consolidated.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def inventory(sql):
    # Source contains no CASE in quoted literals/comments. Inventory every site,
    # including assignments and SQL-expression contexts, not only known functions.
    sites = []
    for match in re.finditer(r'\bCASE\b', sql, re.I):
        prefix = sql[:match.start()]
        command = prefix[prefix.rfind(';') + 1:]
        before = command.rstrip()
        comparison = bool(re.search(r'(?:<>|!=|<=|>=|<|>|(?<![:<>!])=|\bIS\s+(?:NOT\s+)?DISTINCT\s+FROM)\s*$', before, re.I))
        # UPDATE ... SET state=CASE is SQL assignment, not a PL/pgSQL IF operand.
        sql_update = bool(re.search(r'\bUPDATE\s+[A-Za-z_0-9.]+\s+SET\b[^;]*$', command, re.I))
        unsafe = comparison and not sql_update
        sites.append({'line': prefix.count('\n') + 1, 'barePredicateOperand': unsafe,
                      'context': ('SQL_UPDATE_EXPRESSION' if sql_update else 'PARENTHESIZED_PREDICATE' if before.endswith('(') and re.search(r'(?:<>|DISTINCT\s+FROM)\s*\($', before, re.I) else 'PLPGSQL_PREDICATE_BARE' if unsafe else 'SQL_OR_ASSIGNMENT_EXPRESSION'),
                      'sourceLine': sql.splitlines()[prefix.count('\n')]})
    return sites


def build():
    review.build_revision2()  # Revalidate all four originals and historical delta.
    previous = (TARGET.parent / '02/schema.review.sql').read_text()
    candidate = (TARGET / 'schema.review.sql').read_text()
    if previous.count(OLD) != 1 or candidate != previous.replace(OLD, NEW):
        raise ValueError('Revision 03 must contain exactly the approved-parent CASE correction')
    old_statements, new_statements = review.statements(previous), review.statements(candidate)
    changes = [(a, b) for a, b in zip(old_statements, new_statements) if a != b]
    if len(old_statements) != len(new_statements) or len(changes) != 1:
        raise ValueError('Unexpected statement changes')
    a, b = changes[0]
    if review.classify(a) != ('function', 'auth_api.consume_email_otp') or a[:-1] != b[:-1]:
        raise ValueError('Unexpected function or public signature change')
    sites = inventory(candidate)
    if any(site['barePredicateOperand'] for site in sites):
        raise ValueError('Unparenthesized CASE predicate operand remains')
    parent_sites = inventory(previous)
    defects = [site for site in parent_sites if site['barePredicateOperand']]
    if len(defects) != 1:
        raise ValueError('Same-category defect inventory changed')
    report = {'status': 'REVIEW_ONLY_NOT_AUTHORIZED_NOT_INSTALLED', 'candidate': review.hashes(candidate.encode()),
              'parent': review.hashes(previous.encode()), 'failedRun': 39044517403,
              'changedFunction': 'auth_api.consume_email_otp(text,uuid,bytea,uuid)',
              'changedStatements': 1, 'signatureChanges': 0, 'aclChanges': 0, 'policyChanges': 0,
              'caseSites': sites, 'parentDefects': defects, 'sqlCompiled': False, 'installed': False,
              'limitation': 'Lexical same-category review, not PostgreSQL compilation or proof of runtime SQL validity.',
              'authGate05': 'OPEN', 'runtime': 'closedBackend'}
    delta = ''.join(difflib.unified_diff(previous.splitlines(True), candidate.splitlines(True), fromfile='CONSOLIDATED-02', tofile='CONSOLIDATED-03-REVIEW-ONLY'))
    return {'static-review.json': json.dumps(report, indent=2) + '\n', 'APPROVED_TO_03.diff': delta}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, content in build().items():
        path = TARGET / name
        if args.check:
            if path.read_bytes() != content.encode():
                raise ValueError('Stale revision 03 review artifact')
        else:
            path.write_text(content)
    print('PASS: exact one-statement delta and all CASE sites reviewed; NO SQL executed')

if __name__ == '__main__':
    main()
