#!/usr/bin/env python3
"""Offline PostgreSQL-16 grammar checks, not catalog/ACL/runtime validation or SQL execution."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys
from pglast import parse_sql, parse_plpgsql, get_postgresql_version

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('b1_sql_lexer', ROOT / 'scripts/review-b1-consolidated.py')
lexer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lexer)


def inspect(path):
    sql = path.read_text()
    errors, functions, adaptations = [], [], []
    try:
        parse_sql(sql)
    except Exception as error:
        errors.append({'scope': 'top-level', 'error': str(error)})
    # Preserve complete dollar bodies/signatures. Parse every PL/pgSQL declaration,
    # including overridden definitions; collect errors instead of stopping at first.
    for tokens in lexer.statements(sql):
        kind, name = lexer.classify(tokens)
        if kind != 'function':
            continue
        body_token = next(t for t in tokens if re.match(r'^\$[A-Za-z_0-9]*\$', t))
        # Find the exact declaration using its unique body rather than rebuilding operators.
        body_at = sql.index(body_token)
        starts = list(re.finditer(r'CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\b', sql[:body_at], re.I))
        statement = sql[starts[-1].start():body_at + len(body_token)] + ';'
        language = re.search(r'\bLANGUAGE\s+(plpgsql|sql)\b', statement, re.I)
        if not language:
            continue
        functions.append(name)
        try:
            if language.group(1).lower() == 'plpgsql':
                try:
                    parse_plpgsql(statement)
                except Exception:
                    # libpg_query 16.1 does not register RETURNS TABLE OUT parameters
                    # for bare RETURN NEXT. Parse the remaining grammar using a
                    # parser-only placeholder; NEVER submit this text to PostgreSQL.
                    if not re.search(r'RETURNS\s+TABLE\b', statement, re.I) or not re.search(r'RETURN\s+NEXT\s*;', statement, re.I):
                        raise
                    adjusted = re.sub(r'RETURN\s+NEXT\s*;', 'RETURN NEXT NULL;', statement, flags=re.I)
                    parse_plpgsql(adjusted)
                    adaptations.append({'scope': name, 'reason': 'libpg_query OUT-parameter limitation', 'parserOnly': 'RETURN NEXT NULL placeholder; original native CREATE still mandatory'})
            else:
                body = next(t for t in tokens if re.match(r'^\$[A-Za-z_0-9]*\$', t))
                tag = re.match(r'^\$[A-Za-z_0-9]*\$', body).group()
                parse_sql(body[len(tag):-len(tag)])
        except Exception as error:
            errors.append({'scope': name, 'error': str(error)})
    return {'path': str(path.relative_to(ROOT)), 'functionDeclarations': len(functions), 'errors': errors, 'parserAdaptations': adaptations,
            'limitations': 'No catalog/type/privilege/dynamic-query planning. Real PG16 tests remain mandatory.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', nargs='?', default='docs/proposals/b1-consolidated-sql/revisions/03/schema.review.sql')
    args = parser.parse_args()
    version = get_postgresql_version()
    if version[0] != 16:
        raise RuntimeError('PostgreSQL 16 parser required')
    report = inspect(ROOT / args.path)
    report['parserVersion'] = version
    print(json.dumps(report, indent=2))
    return bool(report['errors'])

if __name__ == '__main__':
    sys.exit(main())
