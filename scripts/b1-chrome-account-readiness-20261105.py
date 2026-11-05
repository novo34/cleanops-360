#!/usr/bin/env python3
"""Read-only: verify staging auth gate and presence of usable account records.

A credential-backed account is NOT proof of synthetic ownership or TOTP readiness.
Never prints email, IDs, password hashes, configuration policy or secrets.
"""
import json
import os
import subprocess
import sys

PG = "cleanops360-f4fxmd-postgres-1"
DB = "cleanops_staging"

SQL = """
BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'database', current_database(),
  'config_rows', (SELECT count(*) FROM identity_private.configuration WHERE singleton),
  'gate_enabled', (SELECT deployment_enabled FROM identity_private.configuration WHERE singleton),
  'users_active', (SELECT count(*) FROM app.users WHERE state = 'ACTIVE'),
  'users_with_credentials', (
    SELECT count(*)
    FROM app.users u
    JOIN identity_private.principals p ON p.id = u.principal_id
    JOIN identity_private.credentials c ON c.principal_id = p.id
    JOIN app.organizations o ON o.id = u.tenant_id
    WHERE u.state = 'ACTIVE' AND p.state = 'ACTIVE' AND o.state = 'ACTIVE'
  )
)::text;
COMMIT;
"""

def main():
    if os.geteuid() != 0:
        raise RuntimeError("REQUIERE_ROOT")
    p = subprocess.run([
        "docker", "exec", "-i", PG, "sh", "-c",
        'exec psql -X -q -A -t -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    ], input=SQL, capture_output=True, text=True, timeout=25)
    if p.returncode != 0:
        raise RuntimeError("CONSULTA_READONLY_NO_DISPONIBLE")
    rows = [r for r in p.stdout.splitlines() if r.startswith("{") and r.endswith("}")]
    if len(rows) != 1:
        raise RuntimeError("RESULTADO_NO_UNICO")
    d = json.loads(rows[0])
    if d.get("database") != DB or d.get("config_rows") != 1 or \
       type(d.get("gate_enabled")) is not bool:
        raise RuntimeError("ENTORNO_O_CONFIG_INESPERADA")
    for key in ("users_active", "users_with_credentials"):
        if type(d.get(key)) is not int or d[key] < 0:
            raise RuntimeError("CONTADORES_INVALIDOS")
    print("B1_BASE=STAGING_VERIFICADA")
    print("B1_GATE_SQL=" + ("ABIERTO_ATENCION" if d["gate_enabled"] else "CERRADO"))
    print("B1_USUARIOS_ACTIVOS=" + str(d["users_active"]))
    print("B1_CUENTAS_CON_CREDENCIAL=" + str(d["users_with_credentials"]))
    print("B1_USUARIO_SINTETICO=NO_ACREDITADO")
    print("B1_PRUEBA_LOGIN=NO_EJECUTADA")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("B1_PREFLIGHT_STOP=" + str(error))
        sys.exit(1)
    finally:
        print("B1_OPERACION=SOLO_LECTURA")
        print("B1_IDENTIDADES_Y_SECRETOS=NO_IMPRESOS")
