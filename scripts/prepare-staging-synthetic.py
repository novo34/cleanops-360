#!/usr/bin/env python3
"""Offline only: evaluate measured headroom, reuse approved renderer, freeze files."""
import argparse
import datetime as dt
import hashlib
import importlib.util
import ipaddress
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate_scope(record):
    s = record["STAGING_SYNTHETIC"]
    if (record["id"] != "B1-HOSTINGER-SYNTHETIC-01" or s["provider"] != "Hostinger"
        or s["branch"] != "staging" or s["syntheticOnly"] is not True
        or any(s[k] is not False for k in ["realPersonalData", "productionDatabaseCopies",
                                         "externalCommunications", "incrementalCostAuthorized"])
        or s["productionQuorumApproved"] is not False):
        raise ValueError("SYNTHETIC_BOUNDARY_REQUIRED")
    return s


def capacity(record, now=None):
    s = validate_scope(record)
    c, b = s["capacity"], s["budget"]
    failures = []
    for name in ["webMiB", "postgresMiB", "openbaoMiB", "hostReserveMiB", "diskReserveMiB", "millicpus"]:
        if type(b[name]) is not int or b[name] <= 0:
            raise ValueError("EXPLICIT_RESOURCE_BUDGET_REQUIRED")
    if s.get("imageMode", "HOST_BUILD") == "PREBUILT":
        images = s.get("prebuiltImages", {})
        if b["buildReserveMiB"] != 0 or any(not re.fullmatch(r"[a-zA-Z0-9._/:-]+@sha256:[a-f0-9]{64}", images.get(k) or "") for k in ["web", "openbao"]):
            raise ValueError("EXACT_PREBUILT_DIGESTS_REQUIRED")
    elif s.get("imageMode", "HOST_BUILD") != "HOST_BUILD" or type(b["buildReserveMiB"]) is not int or b["buildReserveMiB"] <= 0:
        raise ValueError("HOST_BUILD_HEADROOM_REQUIRED")
    needed = sum(b[k] for k in ["webMiB", "postgresMiB", "openbaoMiB", "hostReserveMiB", "buildReserveMiB"])
    for key, minimum in [("availableMemoryMiB", needed), ("freeDiskMiB", b["diskReserveMiB"]),
                         ("availableMillicpus", b["millicpus"])]:
        if type(c.get(key)) is not int or c[key] < minimum:
            failures.append(key)
    try:
        measured = dt.datetime.fromisoformat(c["measuredAt"].replace("Z", "+00:00"))
        age = ((now or dt.datetime.now(dt.timezone.utc)) - measured).total_seconds()
        if not 0 <= age <= 86400:
            failures.append("staleOrFutureMeasurement")
    except (AttributeError, TypeError, ValueError):
        failures.append("measurementTime")
    if c.get("architecture") != "amd64":
        failures.append("architecture")
    for key in ["subnetConflictChecked", "otherProjectsIsolated"]:
        if c.get(key) is not True:
            failures.append(key)
    return {"status": "BLOCKED" if failures else "PASS_HEADROOM_ONLY",
            "requiredAvailableMemoryMiB": needed, "blockers": failures,
            "deploymentAuthorized": s.get("deploymentAuthorized") is True,
            "productionAcceptance": False}


def render(record, inputs):
    s = validate_scope(record)
    if inputs["environment"] != "staging-synthetic":
        raise ValueError("STAGING_NAMESPACE_REQUIRED")
    net = ipaddress.ip_network(s["privateNetwork"]["subnet"], strict=True)
    addr = ipaddress.ip_address(s["privateNetwork"]["openbaoIp"])
    if (net.version != 4 or net.prefixlen != 24 or addr not in net
        or addr in [net.network_address, net.broadcast_address, net.network_address + 1]
        or inputs["private_ipv4"] != str(addr) or inputs["api_dns"] != "openbao"
        or inputs["workload_cidrs"] != [str(net)]):
        raise ValueError("CUSTODY_NETWORK_MISMATCH")
    spec = importlib.util.spec_from_file_location("existing_bao_renderer", ROOT / "scripts/prepare-b1-openbao.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    pack = module.prepare(inputs)
    # Existing TLS/ACL contracts unchanged; only clarify the non-Swiss synthetic audit description.
    pack["server.json"]["audit"][0]["file"]["b1-private"]["description"] = "Synthetic staging audit; no production acceptance"
    return pack


def consolidated_compose(prebuilt=False, ingress=False):
    files = ["compose.yaml", "compose.openbao.yaml"]
    if ingress: files.append("compose.ingress.yaml")
    if prebuilt: files.append("compose.prebuilt.yaml")
    command = ["docker", "compose"]
    for name in files:
        command.extend(["-f", str(ROOT / "deploy/staging" / name)])
    command.extend(["--profile", "synthetic-custody", "config", "--no-interpolate",
                    "--no-path-resolution", "--format", "json"])
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError("OFFLINE_COMPOSE_MERGE_FAILED")
    merged = json.loads(result.stdout)
    for service in merged["services"].values():
        if service.get("build"):
            service["build"]["context"] = "../.."
    # JSON is valid YAML/Compose. Variables stay unexpanded; no private paths/values leak.
    return merged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", type=Path, default=ROOT / "deploy/staging/RESOURCE_RECORD.json")
    parser.add_argument("--inputs", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--compose-out", type=Path, help="NEW offline consolidated Compose artifact, never deployed")
    parser.add_argument("--include-ingress", action="store_true")
    args = parser.parse_args()
    record = json.loads(args.record.read_text())
    result = capacity(record)
    if args.compose_out:
        merged = consolidated_compose(record["STAGING_SYNTHETIC"].get("imageMode") == "PREBUILT", args.include_ingress)
        with args.compose_out.open("x") as output:
            output.write(json.dumps(merged, indent=2) + "\n")
    if args.inputs is not None or args.out is not None:
        if args.inputs is None or args.out is None:
            raise ValueError("INPUT_AND_OUTPUT_REQUIRED")
        pack = render(record, json.loads(args.inputs.read_text()))
        args.out.mkdir(mode=0o700, parents=True, exist_ok=False)
        hashes = {}
        for name, content in pack.items():
            raw = (json.dumps(content, indent=2) + "\n").encode()
            (args.out / name).write_bytes(raw)
            hashes[name] = hashlib.sha256(raw).hexdigest()
        (args.out / "manifest.json").write_text(json.dumps({
            "scope": "STAGING_SYNTHETIC", "capacity": result, "sha256": hashes,
            "applied": False, "productionCustody": False,
        }, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 2 if result["status"] == "BLOCKED" else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError):
        raise SystemExit("STAGING_PREPARATION_REJECTED: no runtime operation attempted")
