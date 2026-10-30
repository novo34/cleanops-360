#!/usr/bin/env python3
"""B1 deployment preflight: metadata only. Never reads credentials or changes Docker.

Run on the staging VPS (with Docker access) before authorizing a web deploy.
A PASS is an infrastructure observation, NOT B1 activation authorization.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

PREFIX = "cleanops360-f4fxmd"
AGENT = f"{PREFIX}-openbao-agent-1"
WEB = f"{PREFIX}-web-1"
PG = f"{PREFIX}-postgres-1"
BAO = f"{PREFIX}-openbao-1"
SINK = f"{PREFIX}_identity_agent_sink"
EXPECTED_ID = (999, 999)

def docker(*args: str):
    return json.loads(subprocess.check_output(
        ["docker", *args], text=True, stderr=subprocess.DEVNULL
    ))[0]

def check(label: str, ok: bool, explanation: str = "") -> bool:
    print(f"{'PASS' if ok else 'BLOCKED'} | {label}" + (f" | {explanation}" if explanation else ""))
    return ok

def mounts(c: dict, target: str) -> list[dict]:
    return [m for m in c.get("Mounts", []) if m.get("Destination") == target]

def running(c: dict) -> bool:
    return c.get("State", {}).get("Running") is True

def main() -> int:
    print("B1 STAGING READINESS — METADATA ONLY (no secrets, SQL or changes)")
    try:
        pg, bao, agent, web = [docker("inspect", name) for name in (PG, BAO, AGENT, WEB)]
        vol = docker("volume", "inspect", SINK)
    except (subprocess.CalledProcessError, OSError, IndexError, json.JSONDecodeError):
        print("BLOCKED | Docker object unavailable; no changes attempted")
        return 2
    ok = True
    for name, container in (("PostgreSQL", pg), ("OpenBao Server", bao), ("OpenBao Agent", agent), ("Web", web)):
        ok &= check(f"{name} running", running(container))
    ok &= check("PostgreSQL healthy", pg.get("State", {}).get("Health", {}).get("Status") == "healthy")
    ok &= check("OpenBao healthy", bao.get("State", {}).get("Health", {}).get("Status") == "healthy")

    opts = vol.get("Options") or {}
    pieces = set((opts.get("o") or "").split(","))
    expected = {"nodev", "nosuid", "noexec", "size=1m", "mode=0700", "uid=999", "gid=999"}
    ok &= check("Shared sink tmpfs options", opts.get("type") == "tmpfs" and opts.get("device") == "tmpfs" and expected <= pieces)
    agent_mount = mounts(agent, "/run/cleanops-agent")
    ok &= check("Agent writer mounted to expected sink",
        len(agent_mount) == 1 and agent_mount[0].get("Type") == "volume"
        and agent_mount[0].get("Name") == SINK and agent_mount[0].get("RW") is True)
    web_mount = mounts(web, "/run/cleanops-agent")
    ok &= check("Web read-only sink mounted",
        len(web_mount) == 1 and web_mount[0].get("Type") == "volume"
        and web_mount[0].get("Name") == SINK and web_mount[0].get("RW") is False)
    ok &= check("Web has private file mounts",
        bool(mounts(web, "/run/cleanops-b1-private")),
        "expected dedicated web private sources; exact target subject to approved Compose binding")
    # Do not inspect tokens/certs, print env or run SQL.
    print("NOT CHECKED | actual KV key versions, site binding, PG service secret, web mTLS identity, TOTP login")
    print("NOT AUTHORIZED | Deploy, admin bootstrap, SQL, credential/certificate changes")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
