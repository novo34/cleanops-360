#!/usr/bin/env python3
"""Read-only preflight: validate the verified web image UID/GID against Agent sink.
Never starts containers, reads secret files, or modifies Docker resources.
Run with a pre-existing image reference, not a build or a mutable tag.
"""
import json
import os
import subprocess
import sys

def fail(message):
    raise SystemExit("B1_IDENTITY_PREFLIGHT_FAILED: " + message)

def numeric(value, label):
    if not value or not value.isdecimal() or int(value) <= 0:
        fail(label + " must be an explicit positive numeric ID")
    return int(value)

def main():
    if len(sys.argv) != 2 or not sys.argv[1].startswith("sha256:"):
        fail("supply previously verified local image digest sha256:... as the only argument")
    uid = numeric(os.environ.get("CLEANOPS_IDENTITY_UID"), "CLEANOPS_IDENTITY_UID")
    gid = numeric(os.environ.get("CLEANOPS_IDENTITY_GID"), "CLEANOPS_IDENTITY_GID")
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{json .Config.User}}", sys.argv[1]],
            check=True, capture_output=True, text=True, timeout=10
        )
        user = json.loads(result.stdout.strip())
    except (OSError, subprocess.SubprocessError, ValueError):
        fail("cannot inspect verified local web image")
    if not isinstance(user, str) or not user:
        fail("web image runs with implicit root")
    if ":" not in user:
        fail("web image user/group must be explicit numeric IDs")
    actual_uid, actual_gid = user.split(":", 1)
    if not actual_uid.isdecimal() or not actual_gid.isdecimal():
        fail("web image uses unverified symbolic user/group; inspect passwd/group offline first")
    if (int(actual_uid), int(actual_gid)) != (uid, gid):
        fail("web image consumer identity differs from Agent sink owner")
    print("PASS B1 consumer numeric UID/GID match; no resources modified")

if __name__ == "__main__":
    main()
