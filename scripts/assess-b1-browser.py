#!/usr/bin/env python3
"""Attach executed browser evidence without promoting partial requirements to accepted."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT/'docs/implementation/b1/real-browser'
COVERED = {'REQ-AUTH-001','REQ-AUTH-017','REQ-AUTH-040','REQ-AUTH-041','REQ-AUTH-043','REQ-AUTH-047','REQ-TEN-003','REQ-SEC-020'}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--report',required=True)
    parser.add_argument('--source-sha',required=True)
    parser.add_argument('--run',required=True,type=int)
    parser.add_argument('--job',required=True,type=int)
    args=parser.parse_args()
    report=json.loads(Path(args.report).read_text())
    if report.get('scope') != 'B1-REAL-BROWSER-PG05' or report.get('candidate',{}).get('sha256') != '3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c':
        raise ValueError('Evidence scope/hash mismatch')
    checks=[c for c in report['checks'] if c['name'].startswith('Browser-PG-')]
    passed=report.get('result')=='PASS' and report.get('cleanup')=='PASS' and checks and all(c['status']=='PASS' for c in checks)
    report['provenance']={'head':args.source_sha,'run':args.run,'job':args.job,'url':f'https://github.com/novo34/cleanops-360/actions/runs/{args.run}'}
    (TARGET/'EXECUTION_REPORT.json').write_text(json.dumps(report,indent=2)+'\n')
    matrix=json.loads((TARGET/'REQUIREMENTS.json').read_text())
    canonical=json.loads((ROOT/'docs/implementation/b1/closure/requirements.json').read_text())
    if {r['id'] for r in matrix['requirements']} != {r['id'] for r in canonical['requirements']} or len(matrix['requirements'])!=44:
        raise ValueError('Canonical row mismatch')
    matrix['browserRun']=report['provenance']
    matrix['browserResult']=report['result']
    for row in matrix['requirements']:
        row['accepted']=False
        if row['id'] in COVERED:
            row['newBrowserEvidence']={'status':'PASS' if passed else 'FAIL','test':'e2e/b1-real-postgres.spec.ts','report':'EXECUTION_REPORT.json','provenance':report['provenance'],'checks':checks,'scope':'Only exercised steps; not complete requirement acceptance'}
    (TARGET/'REQUIREMENTS.json').write_text(json.dumps(matrix,indent=2,ensure_ascii=False)+'\n')
    lines=['# B1 — evidencia individual UI/API/PostgreSQL','','Aceptados completos: **0/44**. Evidencia parcial nueva: '+('PASS' if passed else 'FAIL')+'. Las decisiones E1, aceptación y demás flujos no se heredan de este resultado.','','| Requisito | Aceptación completa | Evidencia anterior | Nuevo navegador real | Obligación restante |','|---|---|---|---|---|']
    for row in matrix['requirements']:
        state=row['newBrowserEvidence']['status'] if row['newBrowserEvidence'] else 'Sin evidencia nueva'
        lines.append('| '+row['id']+' | '+row['status']+' | '+row['priorPartialStatus']+' | '+state+' | '+row['remainingAcceptanceObligation'].replace('|',' / ')+' |')
    (TARGET/'MATRIX.md').write_text('\n'.join(lines)+'\n')
    print('44 rows traced; no automatic acceptance from partial browser evidence')

if __name__=='__main__': main()
