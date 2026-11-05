#!/usr/bin/env python3
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

PG = "cleanops360-f4fxmd-postgres-1"
DB = "cleanops_staging"
EXPECTED = "3d582f5099611756473110c69fcddbd2ff76292d277bf01afc86ee854009147a"
RECEIPT = Path("/root/b1-gate-trial-20261105.receipt.json")


def query(sql):
    proc = subprocess.run(
        ["docker", "exec", "-i", PG, "sh", "-c",
         'exec psql -X -q -A -t -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        input=sql, text=True, capture_output=True, timeout=25,
    )
    if proc.returncode:
        raise RuntimeError("SQL_ERROR")
    return [x for x in proc.stdout.splitlines() if x.strip()]


def canonical_hash(value):
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf8")).hexdigest()


def record():
    rows = query("""
        SELECT row_to_json(r)::text FROM (
          SELECT current_database() AS db, version, deployment_enabled, values_json
          FROM identity_private.configuration WHERE singleton
        ) r;
    """)
    if len(rows) != 1:
        raise RuntimeError("FILA_INESPERADA")
    r = json.loads(rows[0])
    if r["db"] != DB or not isinstance(r["version"], int):
        raise RuntimeError("DB_NO_CORRESPONDE")
    return r


def transact(version, values, enabled):
    if not isinstance(version, int) or not (1 <= version < 9223372036854775807):
        raise RuntimeError("VERSION_INVALIDA")
    content = json.dumps(values, separators=(",", ":"), ensure_ascii=True)
    if "$b1json$" in content:
        raise RuntimeError("DELIMITADOR_INVALIDO")
    dest, source = ("true", "false") if enabled else ("false", "true")
    query(f"""
        BEGIN;
        SET LOCAL lock_timeout = '3s';
        SET LOCAL statement_timeout = '10s';
        DO $b1gate$
        DECLARE changed integer;
        BEGIN
          IF current_database() <> '{DB}' THEN
            RAISE EXCEPTION 'WRONG_DB';
          END IF;
          UPDATE identity_private.configuration
             SET deployment_enabled = {dest}
           WHERE singleton = true
             AND deployment_enabled = {source}
             AND version = {version}
             AND values_json = $b1json${content}$b1json$::jsonb;
          GET DIAGNOSTICS changed = ROW_COUNT;
          IF changed <> 1 THEN RAISE EXCEPTION 'CAS_MISMATCH'; END IF;
        END $b1gate$;
        COMMIT;
    """)


def close_if_ours(receipt):
    r = record()
    if (r["version"] != receipt["version"] or canonical_hash(r["values_json"]) != receipt["policy_sha256"]):
        return "NO_REVERSIBLE_POR_DERIVA"
    if not r["deployment_enabled"]:
        return "YA_CERRADO"
    transact(r["version"], r["values_json"], False)
    return "ROLLBACK_PASS" if not record()["deployment_enabled"] else "ROLLBACK_NO_CONFIRMADO"


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        print("B1_GATE_SQL=REQUIERE_ROOT")
        return
    action = sys.argv[1] if len(sys.argv) == 2 else ""
    if action == "rollback":
        try:
            receipt = json.loads(RECEIPT.read_text())
            print("B1_GATE_SQL=" + close_if_ours(receipt))
        except Exception:
            print("B1_GATE_SQL=ROLLBACK_NO_CONFIRMADO")
        return
    if action != "activate":
        print("B1_GATE_SQL=ACCION_INVALIDA")
        return
    if RECEIPT.exists():
        print("B1_GATE_SQL=RECIBO_EXISTENTE_NO_REPETIR")
        return
    try:
        r = record()
        if r["deployment_enabled"] is not False or canonical_hash(r["values_json"]) != EXPECTED or len(r["values_json"]) != 60:
            print("B1_GATE_SQL=PREFLIGHT_NO_COINCIDE")
            return
        receipt = {"database": DB, "version": r["version"], "policy_sha256": EXPECTED,
                   "before_enabled": False, "intent": "trial_b1_2026_11_05"}
        fd = os.open(RECEIPT, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as fp:
            json.dump(receipt, fp)
            fp.flush()
            os.fsync(fp.fileno())
        print("B1_ROLLBACK=RECIBO_PRIVADO_PREPARADO")
        try:
            transact(r["version"], r["values_json"], True)
            rows = query("SELECT row_to_json(x)::text FROM (SELECT current_database() db, auth_api.security_policy() values_json) x;")
            if len(rows) != 1:
                raise RuntimeError("POLITICA_NO_DEVUELTA")
            res = json.loads(rows[0])
            if res["db"] != DB or canonical_hash(res["values_json"]) != EXPECTED:
                raise RuntimeError("POLITICA_DIFERENTE")
            print("B1_GATE_SQL=HABILITADO_VERIFICADO")
        except Exception:
            try:
                print("B1_GATE_SQL=" + close_if_ours(receipt))
            except Exception:
                print("B1_GATE_SQL=REVISION_MANUAL_NECESARIA")
    except Exception:
        print("B1_GATE_SQL=ERROR_PREPARACION_O_ESTADO_INCIERTO")
    finally:
        print("B1_OTROS_CAMBIOS=NINGUNO_SOLICITADO")
        print("B1_SECRETOS=NO_IMPRESOS")


if __name__ == "__main__":
    main()
