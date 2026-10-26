#!/usr/bin/env python3
"""Individual B1 acceptance assessment from canonical rows and real PG05 evidence.
Partial SQL/HTTP evidence never automatically accepts a full requirement or gate.
"""
import json
import hashlib
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'docs/implementation/b1/consolidated-test-05'


def matches(identifier,name):
    patterns={
        'REQ-AUTH-001':r'HTTP-real-PG-password|credential|preauth-verified',
        'REQ-AUTH-002':r'step-up|issue-session|full-authentication',
        'REQ-AUTH-003':r'TOTP|EMAIL|HTTP-real-PG-TOTP',
        'REQ-AUTH-004':r'TOTP|enrollment',
        'REQ-AUTH-010':r'TOTP|EMAIL.*(consume|replay)',
        'REQ-AUTH-011':r'EMAIL|expired',
        'REQ-AUTH-012':r'EMAIL',
        'REQ-AUTH-013':r'EMAIL|challenge',
        'REQ-AUTH-014':r'cooldown',
        'REQ-AUTH-015':r'rate_attempt|rate-limit',
        'REQ-AUTH-016':r'invalid-proof|expired|verify_challenge',
        'REQ-AUTH-017':r'password-login|denied|foreign',
        'REQ-AUTH-020':r'enrollment', 'REQ-AUTH-021':r'enrollment',
        'REQ-AUTH-022':r'enrollment|TOTP|HTTP-real-PG-TOTP',
        'REQ-AUTH-030':r'recovery', 'REQ-AUTH-031':r'recovery',
        'REQ-AUTH-032':r'recovery', 'REQ-AUTH-033':r'recovery',
        'REQ-AUTH-034':r'audit',
        'REQ-AUTH-040':r'own-sessions|identity|session',
        'REQ-AUTH-041':r'own-sessions|session',
        'REQ-AUTH-042':r'revoke-own|revoked-token|foreign-revoke',
        'REQ-AUTH-043':r'revoke|other-tenant',
        'REQ-AUTH-044':r'session|expiry|expired',
        'REQ-AUTH-045':r'session|expiry|expired',
        'REQ-AUTH-046':r'credential-version|revoked',
        'REQ-AUTH-047':r'step-up',
        'REQ-TEN-001':r'rls|tenant', 'REQ-TEN-002':r'tenant|foreign',
        'REQ-TEN-003':r'context|tenant|foreign|HTTP-real-PG-identity',
        'REQ-TEN-004':r'tenant|foreign|rls|cross-',
        'REQ-SEC-020':r'credential|TOTP|HTTP-real-PG|CAS',
        'REQ-SEC-021':r'session|expiry|expired',
        'REQ-AUD-001':r'audit|rollback|COMMIT|PG05-',
    }
    pattern=patterns.get(identifier,r'authorization|step-up|tenant' if identifier.startswith('REQ-AUTHZ-') else r'__NONE__')
    return bool(re.search(pattern,name,re.I))


MISSING = {'REQ-PR-006': 'Completar E0–E9, UI/API/PG real de todo B1 y aceptación PO; el runtime operativo sigue closedBackend.', 'REQ-PR-007': 'Mantener bloqueado el siguiente módulo hasta la aceptación formal completa de B1 y AUTH-GATE-05.', 'REQ-AUTH-001': 'Validar la UI de login contra el backend real y completar aceptación; HTTP/Argon2id/PG se evidencian separadamente.', 'REQ-AUTH-002': 'Resolver C-LOGIN y aprobar la política canónica de MFA por riesgo; no introducir bypass operativo.', 'REQ-AUTH-003': 'Completar D4 y el flujo EMAIL operativo verificado; TOTP privado real no acepta por sí solo ambos canales ni su UI.', 'REQ-AUTH-004': 'D3: verificar apps/plataformas/versiones requeridas con autenticadores reales; OTPAuth no demuestra interoperabilidad externa.', 'REQ-AUTH-010': 'D4: verificar el consumo de un solo uso por todos los recorridos EMAIL reales y sus reintentos de entrega.', 'REQ-AUTH-011': 'D4: destinatario verificado, TTL300s y reenvío/consumo/expiración de entrega integral, sin extensión de TTL.', 'REQ-AUTH-012': 'D2/D4: HMAC y claves reales de EMAIL, almacenamiento y canales de entrega completos; fixtures SQL no acreditan custodia.', 'REQ-AUTH-013': 'Completar el reenvío EMAIL público con invalidación atómica de retos/outbox anteriores y versiones de destinatario.', 'REQ-AUTH-014': 'Completar cooldown EMAIL en la UI/API/worker real; el cooldown TOTP nativo ya se ejecutó con espera real.', 'REQ-AUTH-015': 'Validar límites de las tres dimensiones con ingreso confiable, carga y flujos reales completos; perfil actual de ensayo.', 'REQ-AUTH-016': 'Cubrir presupuestos de intentos y bloqueo por todos los canales públicos, incluidos EMAIL y recuperación.', 'REQ-AUTH-017': 'Validar presentación UI y todos los errores reales seguros; pruebas HTTP de contraseña conocida/ausente se vinculan como evidencia parcial.', 'REQ-AUTH-020': 'D2/D3: enrolamiento público con QR y app real; la ruta de enrolamiento permanece cerrada.', 'REQ-AUTH-021': 'D2/D3: primer código real antes de activar método/sesión por UI/API; SQL de confirmación/CAS queda como evidencia parcial.', 'REQ-AUTH-022': 'D2: custodio/proveedor, aislamiento, rotación y recuperación de claves reales; envelope v2 se prueba solo con clave sintética efímera.', 'REQ-AUTH-030': 'Completar enrolamiento público y generación de recovery codes con proveedor/HMAC aprobados.', 'REQ-AUTH-031': 'Validar entrega única de recovery codes en UI/API e idempotencia integral; no inferirla del lote de digests SQL.', 'REQ-AUTH-032': 'Validar HMAC/custodia y ausencia de plaintext en todo el flujo real de recovery codes.', 'REQ-AUTH-033': 'Aprobar e integrar contrato público completo de recuperación; el consumidor interno sin grant público no satisface ese flujo.', 'REQ-AUTH-034': 'Resolver C-SCOPE y aprobar el contrato/ACL administrativo de reset MFA; no heredar permisos B1-SELF.', 'REQ-AUTH-040': 'Completar aceptación UI/API/PG de Account → Security → Active Sessions; el recorrido HTTP privado se evalúa aparte.', 'REQ-AUTH-041': 'Validar los cuatro campos de sesión en la UI con datos reales y aceptación PO.', 'REQ-AUTH-042': 'Completar E2E UI de revocación individual con respuestas reales y aceptación; comprobar la evidencia SQL/HTTP adjunta.', 'REQ-AUTH-043': 'Completar E2E UI de revocación bulk preservando la sesión actual y otras empresas; no promover el caso HTTP a aceptación UI.', 'REQ-AUTH-044': 'Validar caducidad por inactividad por riesgo en todos los recorridos UI/API y aceptar el perfil operativo.', 'REQ-AUTH-045': 'Validar caducidad absoluta independiente del idle en todos los recorridos y aceptar el perfil operativo.', 'REQ-AUTH-046': 'Resolver C-SCOPE y contrato real de trusted device y revocaciones; no trasladarlo a otra fase.', 'REQ-AUTH-047': 'Completar UI y todas las acciones sensibles según política aprobada; step-up privado/bulk HTTP se vincula como evidencia parcial.', 'REQ-SEC-020': 'Completar proveedor de claves, provisión, exposición en sinks y aceptación de seguridad de todo el flujo; las bibliotecas maduras ya se ejercitan.', 'REQ-SEC-021': 'Aceptar perfil operativo de expiración absoluta y probarlo integralmente, sin promover valores de ensayo a producción.', 'REQ-AUD-001': 'Completar auditoría Auth en todos los flujos pendientes, fallos, recuperación y sinks reales; no inferir cobertura total de unos casos atómicos.'}


def build(report):
    canonical=json.loads((ROOT/'docs/implementation/b1/closure/requirements.json').read_text())
    rows=canonical['requirements']
    if len(rows)!=44 or len({r['id'] for r in rows})!=44:raise ValueError('Canonical requirement count mismatch')
    assessments=[]
    for row in rows:
        relevant=[{'name':c['name'],'status':c['status']} for c in report['checks'] if matches(row['id'],c['name'])]
        assessments.append({'id':row['id'],'requirement':row['requirement'],'status':'BLOCKED','accepted':False,
                            'partialExecutedEvidenceStatus':'FAIL' if any(c['status']=='FAIL' for c in relevant) else 'PASS' if relevant and all(c['status']=='PASS' for c in relevant) else 'BLOCKED',
                            'originalClosureObligation':row['pending'],
                            'remainingAcceptanceObligation':MISSING.get(row['id'], 'Resolver C-SCOPE y aprobar/implementar los contratos AUTHZ completos, más allá de las ocho reglas B1-SELF.' if row['id'].startswith('REQ-AUTHZ-') else 'Completar los casos V4 de aislamiento mediante UI/API/PG para el alcance aprobado; revisar evidencia parcial nativa, roles y pool real antes de aceptación.'),
                            'evidence':{'report':'EXECUTION_REPORT.json','provenance':report.get('provenance'),
                                        'partialExecutedChecks':relevant,'existingCodeAndContractReferences':row.get('evidence',[]),
                                        'requiredAcceptanceCases':row.get('tests',[])},
                            'reason':'Partial isolated SQL/HTTP execution does not complete the canonical implementation/integration/UI/operational and owner-acceptance obligations. See the specific remaining obligation for this row.'})
    return {'source':'docs/implementation/b1/closure/requirements.json','sourceRows':44,'sourceSha256':hashlib.sha256((ROOT/'docs/implementation/b1/closure/requirements.json').read_bytes()).hexdigest(),'accepted':0,
            'rule':'PASS requires complete requirement evidence and acceptance; no inheritance of SQL check PASS.',
            'postgresScopeResult':report['result'],'runtime':'closedBackend','b1':'OPEN','authGate05':'OPEN',
            'requirements':assessments}


def main():
    report=json.loads((TARGET/'EXECUTION_REPORT.json').read_text())
    result=build(report)
    (TARGET/'REQUIREMENTS.json').write_text(json.dumps(result,indent=2)+'\n')
    lines=['# Individual B1 acceptance — 0/44 accepted','',
           'All 44 canonical rows remain individually BLOCKED for full acceptance. Partial executed cases and exact source/run are retained per row in REQUIREMENTS.json; these are not unexecuted cases marked PASS.', '',
           '| Requirement | Acceptance | Specific remaining obligation |','| --- | --- | --- |']
    for row in result['requirements']:
        lines.append('| '+row['id']+' | BLOCKED | '+row['remainingAcceptanceObligation'].replace('|',' / ').replace('\n',' ')+' |')
    (TARGET/'REQUIREMENTS.md').write_text('\n'.join(lines)+'\n')
    print('44 individually traced acceptance rows; 0 silently promoted from partial PG results')

if __name__=='__main__':main()
