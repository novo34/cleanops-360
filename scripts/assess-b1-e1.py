#!/usr/bin/env python3
"""Trace all44 obligations after approved E1 without inventing acceptance."""
import argparse
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'docs/implementation/b1/e1-resolution'
BASIC={'REQ-AUTH-001','REQ-AUTH-017','REQ-AUTH-040','REQ-AUTH-041','REQ-AUTH-042','REQ-AUTH-043','REQ-AUTH-047','REQ-TEN-003','REQ-SEC-020'}
ENROLL={'REQ-AUTH-003','REQ-AUTH-004','REQ-AUTH-020','REQ-AUTH-021','REQ-AUTH-022','REQ-AUTH-030','REQ-AUTH-031','REQ-AUTH-032'}
REMAIN={
'REQ-AUTH-002':'C-LOGIN aprobado: MFA obligatorio. Completar evidencia operacional de perfiles/roles y aceptación; no se propone excepción sin MFA.',
'REQ-AUTH-003':'TOTP privado integrado y ensayado. Completar EMAIL con destinatario verificado y nuevos contratos SQL/ACL autorizados.',
'REQ-AUTH-004':'Compatibilidad de apps/plataformas/versiones obligatorias todavía por demostrar; SHA256/32bytes/issuer ya aprobados.',
'REQ-AUTH-020':'PREAUTH y ACTIVE con QR local implementados y probados. Pendientes custodia OpenBao operativa y compatibilidad externa/aceptación.',
'REQ-AUTH-021':'Primer código/CAS y no activación previa, grants05/06 separados y COMMIT verificados. Pendientes integración de custodia real y aceptación integral.',
'REQ-AUTH-022':'Envelopev2/AAD inicial inmutable y verificación después de method_version2 ejecutados. Pendientes custodia/rotación/recuperación con OpenBao real e identidades designadas.',
'REQ-AUTH-030':'Generación y regeneración de10 códigos reales en flujo privado probado. Completar custodia operacional y aceptación de la vertical de recuperación completa.',
'REQ-AUTH-031':'Entrega única y desaparición de códigos/URI/QR tras confirmación/logout/nuevo login probadas. Pendientes aceptación integral y pérdida total de MFA dentro de B1.',
'REQ-AUTH-032':'HMAC32 persistido sin plaintext e invalidación del lote anterior verificadas. Pendientes custodia operacional y revisión de todos los sinks del flujo completo.',
'REQ-AUTH-033':'El consumidor interno sin caller grant no es un protocolo público de recuperación. Implementar contrato SQL/HTTP/CAS de re-enrolado restringido tras autorización exacta.',
'REQ-AUTH-034':'C-SCOPE aprobado. Implementar reset administrativo con permiso explícito, step-up, motivo, comprobación de identidad real y auditoría; SQL/ACL nuevos aún no instalados.',
'REQ-AUTH-040':'Lista/paginación de52 sesiones y revocaciones UI/API/PG ejecutadas; completar aceptación del producto/PO y fuente operacional de contexto.',
'REQ-AUTH-041':'Campos dispositivo/navegador/creación/actividad y caducidad, con páginas reales probados. Completar evidencia operacional de actividad/absoluta y aceptación PO.',
'REQ-AUTH-042':'Revocación individual UI/API/PG ejecutada. Vincular aceptación integral con negativas/fallos aprobados; runtime operativo cerrado.',
'REQ-AUTH-043':'Bulk con step-up preserva actual; evidencia previa protege tenant ajeno. Pendiente aceptación integral/operacional.',
'REQ-AUTH-046':'C-SCOPE aprobado. Registro/revocación de trusted devices, expiración≤30d, invalidación por credenciales/reset/riesgo y contratos SQL/ACL pendientes.',
'REQ-AUTH-047':'Step-up04/05/06 reales integrados; completar restantes acciones sensibles, política operacional y aceptación.',
}
def main():
 p=argparse.ArgumentParser();p.add_argument('--report',required=True);p.add_argument('--sha',required=True);p.add_argument('--run',type=int,required=True);p.add_argument('--job',type=int,required=True);p.add_argument('--ci-run',type=int,required=True);args=p.parse_args()
 report=json.loads(Path(args.report).read_text())
 if report.get('scope')!='B1-REAL-BROWSER-PG05' or report.get('candidate',{}).get('sha256')!='3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c':raise ValueError('Evidence scope/hash mismatch')
 cases=[c for c in report['checks'] if c['name'].startswith('Browser-PG-')]
 if len(cases)!=4:raise ValueError('Expected all four real browser flows')
 provenance={'head':args.sha,'run':args.run,'job':args.job,'ciRun':args.ci_run,'url':f'https://github.com/novo34/cleanops-360/actions/runs/{args.run}'}
 report['provenance']=provenance
 (TARGET/'EXECUTION_REPORT.json').write_text(json.dumps(report,indent=2)+'\n')
 baseline=json.loads((ROOT/'docs/implementation/b1/real-browser/REQUIREMENTS.json').read_text())
 canonical=ROOT/'docs/implementation/b1/closure/requirements.json';raw=canonical.read_bytes();source=json.loads(raw)
 if len(source['requirements'])!=44:raise ValueError('Wrong requirement count')
 previous={r['id']:r for r in baseline['requirements']};rows=[]
 for source_row in source['requirements']:
  identifier=source_row['id'];old=previous[identifier]
  related=[c for c in cases if (identifier in BASIC and 'real UI password' in c['name']) or (identifier in ENROLL and ('real first enrollment' in c['name'] or 'real ACTIVE additional' in c['name'])) or identifier=='REQ-AUTH-002']
  complete=bool(related) and report.get('result')=='PASS' and report.get('cleanup')=='PASS' and all(c['status']=='PASS' for c in related)
  pending=REMAIN.get(identifier,old['remainingAcceptanceObligation'])
  if identifier.startswith('REQ-AUTHZ-'):pending='C-SCOPE aprobado: implementar matriz efectiva de permisos/deny/grants/ámbitos/vigencias y auditoría según RBAC_PERMISSIONS. Requiere contratos SQL/ACL concretos, no poderes heredados de B1-SELF.'
  if 'D4' in pending:pending='D4 arquitectura aprobada; faltan contratos persistentes de destinatario/generación/outbox/cuarentena, nueva instalación SQL/ACL autorizada y entrega operacional verificada. EMAIL sigue cerrado.'
  rows.append({'id':identifier,'requirement':source_row['requirement'],'implementation':'IMPLEMENTED_PRIVATE_TOTP_PORTION' if identifier in ENROLL else 'PARTIAL','realIntegration':'PARTIAL_PASS' if complete else 'PARTIAL_FAIL' if related else 'NO_NEW_E1_CASE','tests':{'status':'PASS' if complete else 'FAIL' if related else 'UNCHANGED_PREVIOUS_EVIDENCE','cases':related,'provenance':provenance if related else None},'acceptance':'OPEN','accepted':False,'priorIndividualEvidence':'../real-browser/REQUIREMENTS.json#'+identifier,'remaining':pending})
 result={'source':str(canonical.relative_to(ROOT)),'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceRows':44,'accepted':0,'newPartialEvidenceRows':sum(r['tests']['status']=='PASS' for r in rows),'architectureDecisions':{k:'APPROVED_BY_OWNER_2026_10_17' for k in ['D2','D3','D4','C-SCOPE','C-LOGIN']},'runtime':'closedBackend','b1':'OPEN','authGate05':'OPEN','browserProvenance':provenance,'requirements':rows}
 (TARGET/'REQUIREMENTS.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
 lines=['# B1 después de E1 —44 requisitos individualizados','','Aceptados completos: **0/44**. '+str(result['newPartialEvidenceRows'])+' requisitos con evidencia parcial E1 PASS. Decisiones E1 aprobadas; pendientes operativos y contratos SQL nuevos no equivalen a reabrir esas decisiones.','','| Requisito | Implementación | Integración real | Pruebas E1 | Aceptación | Pendiente exacto |','|---|---|---|---|---|---|']
 for r in rows:lines.append('| '+r['id']+' | '+r['implementation']+' | '+r['realIntegration']+' | '+r['tests']['status']+' | OPEN | '+r['remaining'].replace('|',' / ')+' |')
 (TARGET/'MATRIX.md').write_text('\n'.join(lines)+'\n')
 print('44 rows traced, '+str(result['newPartialEvidenceRows'])+' new partial PASS; no automatic requirement/gate acceptance')
if __name__=='__main__':main()
