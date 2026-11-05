#!/usr/bin/env python3
"""Read-only B1 account provenance indicators, no PII output.

Reports only aggregated account, MFA and recovery states.
Does NOT assert synthetic ownership; an email domain is not proof of provenance.
"""
import json
import os
import subprocess
import sys

PG="cleanops360-f4fxmd-postgres-1"
DB="cleanops_staging"
SQL="""
BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'db', current_database(),
  'gate_enabled', (
    SELECT deployment_enabled FROM identity_private.configuration WHERE singleton
  ),
  'active_accounts', count(*),
  'accounts_added_since_20261102', count(*) FILTER (
    WHERE u.created_at >= TIMESTAMPTZ '2026-11-02 00:00:00+00'
  ),
  'sensitive_accounts', count(*) FILTER (WHERE u.risk_class='SENSITIVE'),
  'operational_accounts', count(*) FILTER (WHERE u.risk_class='OPERATIONAL'),
  'totp_active', (
    SELECT count(*)
    FROM app.mfa_methods m
    JOIN app.users iu ON iu.tenant_id=m.tenant_id AND iu.id=m.user_id
    JOIN identity_private.principals ip ON ip.id=iu.principal_id
    JOIN identity_private.credentials ic ON ic.principal_id=ip.id
    JOIN app.organizations io ON io.id=iu.tenant_id
    WHERE iu.state='ACTIVE' AND ip.state='ACTIVE' AND io.state='ACTIVE'
      AND m.kind='TOTP' AND m.state='ACTIVE'
  ),
  'totp_pending', (
    SELECT count(*)
    FROM app.mfa_methods m
    JOIN app.users iu ON iu.tenant_id=m.tenant_id AND iu.id=m.user_id
    JOIN identity_private.principals ip ON ip.id=iu.principal_id
    JOIN identity_private.credentials ic ON ic.principal_id=ip.id
    JOIN app.organizations io ON io.id=iu.tenant_id
    WHERE iu.state='ACTIVE' AND ip.state='ACTIVE' AND io.state='ACTIVE'
      AND m.kind='TOTP' AND m.state='PENDING'
  ),
  'recovery_codes_unused', (
    SELECT count(*)
    FROM app.recovery_codes rc
    JOIN app.users iu ON iu.tenant_id=rc.tenant_id AND iu.id=rc.user_id
    JOIN identity_private.principals ip ON ip.id=iu.principal_id
    JOIN identity_private.credentials ic ON ic.principal_id=ip.id
    JOIN app.organizations io ON io.id=iu.tenant_id
    WHERE iu.state='ACTIVE' AND ip.state='ACTIVE' AND io.state='ACTIVE'
      AND rc.consumed_at IS NULL AND rc.revoked_at IS NULL
  )
)::text
FROM app.users u
JOIN identity_private.principals p ON p.id=u.principal_id
JOIN identity_private.credentials c ON c.principal_id=p.id
JOIN app.organizations o ON o.id=u.tenant_id
WHERE u.state='ACTIVE' AND p.state='ACTIVE' AND o.state='ACTIVE';
COMMIT;
"""

def main():
    if os.geteuid()!=0:
        raise RuntimeError("REQUIERE_ROOT")
    r=subprocess.run(
      ["docker","exec","-i",PG,"sh","-c",
       'exec psql -X -q -A -t -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
      input=SQL,text=True,capture_output=True,timeout=25)
    if r.returncode!=0:
        raise RuntimeError("SQL_READONLY_NO_DISPONIBLE")
    lines=[x for x in r.stdout.splitlines() if x.startswith("{") and x.endswith("}")]
    if len(lines)!=1:
        raise RuntimeError("SQL_RESULTADO_INESPERADO")
    d=json.loads(lines[0])
    if d.get("db")!=DB or type(d.get("gate_enabled")) is not bool:
        raise RuntimeError("ENTORNO_INESPERADO")
    for key in ("active_accounts","accounts_added_since_20261102",
                "sensitive_accounts","operational_accounts",
                "totp_active","totp_pending","recovery_codes_unused"):
        if type(d.get(key)) is not int or d[key]<0:
            raise RuntimeError("RESULTADO_INVALIDO")
    print("B1_GATE_SQL="+("ABIERTO_ATENCION" if d["gate_enabled"] else "CERRADO"))
    print("B1_CUENTAS_CON_CREDENCIAL="+str(d["active_accounts"]))
    print("B1_CUENTAS_CREADAS_DESDE_02NOV="+str(d["accounts_added_since_20261102"]))
    print("B1_CUENTAS_RIESGO_SENSIBLE="+str(d["sensitive_accounts"]))
    print("B1_CUENTAS_RIESGO_OPERATIVO="+str(d["operational_accounts"]))
    print("B1_TOTP_ACTIVOS="+str(d["totp_active"]))
    print("B1_TOTP_PENDIENTES="+str(d["totp_pending"]))
    print("B1_CODIGOS_RECUPERACION_DISPONIBLES="+str(d["recovery_codes_unused"]))
    print("B1_ORIGEN_SINTETICO=NO_ACREDITADO")

if __name__=="__main__":
    try: main()
    except Exception as e:
        print("B1_PROVENANCE_STOP="+str(e))
        sys.exit(1)
    finally:
        print("B1_OPERACION=SOLO_LECTURA")
        print("B1_IDENTIDADES_SECRETOS=NO_IMPRESOS")
