#!/usr/bin/env python3
"""Non-mutating B1 web deployment readiness check on the staging Docker host.

No secret reads, SQL, network requests or container operations other than inspect.
This checks only observable infrastructure; it cannot authorize B1 activation.
"""
from __future__ import annotations

import json
import subprocess
import sys

PREFIX = "cleanops360-f4fxmd"
NAMES = {
    "postgres": f"{PREFIX}-postgres-1",
    "bao": f"{PREFIX}-openbao-1",
    "agent": f"{PREFIX}-openbao-agent-1",
    "web": f"{PREFIX}-web-1",
}
SINK = f"{PREFIX}_identity_agent_sink"


def inspect(*args: str) -> dict:
    result = subprocess.check_output(["docker", *args], text=True, stderr=subprocess.DEVNULL)
    objects = json.loads(result)
    if not isinstance(objects, list) or len(objects) != 1:
        raise ValueError("unexpected Docker inspect result")
    return objects[0]


def report(label: str, valid: bool) -> bool:
    print(f"{'PASS' if valid else 'BLOCKED'} | {label}")
    return valid


def at(container: dict, destination: str) -> list[dict]:
    return [m for m in container.get("Mounts", []) if m.get("Destination") == destination]


def healthy(container: dict) -> bool:
    return container.get("State", {}).get("Health", {}).get("Status") == "healthy"


def running(container: dict) -> bool:
    return container.get("State", {}).get("Running") is True


def evaluate(containers: dict[str, dict], volume: dict) -> bool:
    pg, bao, agent, web = (containers[k] for k in ("postgres", "bao", "agent", "web"))
    passed = True
    for label, c in (("PostgreSQL", pg), ("OpenBao Server", bao), ("OpenBao Agent", agent), ("Web", web)):
        passed &= report(f"{label} running", running(c))
    passed &= report("PostgreSQL healthy", healthy(pg))
    passed &= report("OpenBao healthy", healthy(bao))

    opts = volume.get("Options") or {}
    flags = set((opts.get("o") or "").split(","))
    required = {"nodev", "nosuid", "noexec", "size=1m", "mode=0700", "uid=999", "gid=999"}
    passed &= report("Shared sink tmpfs specification",
        volume.get("Name") == SINK and volume.get("Driver") == "local"
        and opts.get("type") == "tmpfs" and opts.get("device") == "tmpfs"
        and required.issubset(flags))

    writer = at(agent, "/run/cleanops-agent")
    passed &= report("Agent has sink writer",
        len(writer) == 1 and writer[0].get("Type") == "volume"
        and writer[0].get("Name") == SINK and writer[0].get("RW") is True)

    reader = at(web, "/run/cleanops-agent")
    passed &= report("Web has read-only sink",
        len(reader) == 1 and reader[0].get("Type") == "volume"
        and reader[0].get("Name") == SINK and reader[0].get("RW") is False)

    print("NOT VERIFIED | identity PostgreSQL secret; web mTLS; approved private-file paths; "
          "five KV versions; server-side binding; actual login/TOTP")
    print("NOT AUTHORIZED | deployment, SQL, credential changes, first-actor bootstrap")
    return passed


def main() -> int:
    print("B1 WEB READINESS — metadata only")
    try:
        containers = {key: inspect("inspect", name) for key, name in NAMES.items()}
        volume = inspect("volume", "inspect", SINK)
    except (subprocess.CalledProcessError, OSError, IndexError, ValueError, KeyError):
        print("BLOCKED | required Docker object unavailable")
        return 2
    return 0 if evaluate(containers, volume) else 1


if __name__ == "__main__":
    sys.exit(main())
