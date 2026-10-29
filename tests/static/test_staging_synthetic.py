"""Synthetic deployment tools: negative boundaries and actual merged Compose, no VPS."""
import copy
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


prepare = module("synthetic_prepare", "scripts/prepare-staging-synthetic.py")
install = module("synthetic_install", "scripts/staging-sql14.py")
maintenance = module("synthetic_maintenance", "scripts/staging-maintenance.py")


def fixture():
    record = json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())
    s = record["STAGING_SYNTHETIC"]
    s["capacity"] = dict(measuredAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                         availableMemoryMiB=8192, freeDiskMiB=20000, availableMillicpus=4000,
                         architecture="amd64", subnetConflictChecked=True, otherProjectsIsolated=True)
    s["privateNetwork"] = dict(subnet="10.249.88.0/24", openbaoIp="10.249.88.2")
    inputs = dict(environment="staging-synthetic", private_ipv4="10.249.88.2", api_dns="openbao",
                  node_id="staging-trial", token_ttl_seconds=60, token_max_ttl_seconds=300,
                  secret_id_ttl_seconds=60, workload_cidrs=["10.249.88.0/24"],
                  approved_key_reads=[dict(tenant="11111111-1111-1111-1111-111111111111",
                                          purpose="totp-aead", key_id="trial-key-v1", workload="identity-verifier")],
                  approved_key_creates=[])
    return record, inputs


class Synthetic(unittest.TestCase):
    def setUp(self):
        self.private = tempfile.TemporaryDirectory(prefix="migration-env-offline-")
        self.addCleanup(self.private.cleanup)
        self.compose_env = Path(self.private.name) / "staging.env"
        self.compose_env.write_text("COMPOSE_OFFLINE_FIXTURE_ONLY=yes\n")
        self.compose_env.chmod(0o600)

    def test_push_preflight_uses_its_actual_fixture_and_preserves_required_inputs(self):
        workflow = (ROOT / ".github/workflows/staging-preflight.yml").read_text()
        def run_block(name):
            section = workflow.split("      - name: " + name + "\n", 1)[1]
            section = section.split("        run: |\n", 1)[1]
            lines = []
            for line in section.splitlines():
                if line.strip() and not line.startswith("          "): break
                lines.append(line[10:] if line.strip() else "")
            return "\n".join(lines) + "\n"
        setup = run_block("Generate synthetic Compose-only secret")
        cleanup = run_block("Clean owned synthetic secret")
        with tempfile.TemporaryDirectory() as directory:
            runner = Path(directory); exports = runner / "github-env"
            env = dict(os.environ, RUNNER_TEMP=str(runner), TMPDIR=str(runner), GITHUB_ENV=str(exports),
                       CLEANOPS_AUTH_ORIGIN="https://staging.invalid")
            for key in ["COMPOSE_PROFILES", "CLEANOPS_PG_PASSWORD_FILE", "CLEANOPS_BAO_CONFIG_FILE",
                        "CLEANOPS_BAO_TLS_DIR", "CLEANOPS_BAO_SUBNET", "CLEANOPS_BAO_PRIVATE_IPV4"]:
                env.pop(key, None)
            subprocess.run(["bash", "-c", setup], cwd=ROOT, env=env, check=True, capture_output=True, text=True)
            fixture_env = dict(line.split("=", 1) for line in exports.read_text().splitlines())
            env.update(fixture_env)
            self.assertEqual(json.loads(Path(env["CLEANOPS_BAO_CONFIG_FILE"]).read_text()), {})
            self.assertTrue(Path(env["CLEANOPS_BAO_TLS_DIR"]).is_dir())
            command = ["docker", "compose", "-f", "deploy/staging/compose.yaml", "config"]
            result = subprocess.run(command + ["--format", "json"], cwd=ROOT, env=env,
                                    capture_output=True, text=True, check=True)
            config = json.loads(result.stdout)
            self.assertEqual(set(config["services"]), {"web", "postgres"})
            for key in ["CLEANOPS_BAO_CONFIG_FILE", "CLEANOPS_BAO_TLS_DIR",
                        "CLEANOPS_BAO_SUBNET", "CLEANOPS_BAO_PRIVATE_IPV4"]:
                missing = dict(env); missing.pop(key)
                rejected = subprocess.run(command + ["-q"], cwd=ROOT, env=missing,
                                          capture_output=True, text=True)
                self.assertNotEqual(rejected.returncode, 0, key)
                self.assertIn(key, rejected.stderr)
            marker = runner / "cleanops-fixture-path"
            fixture = Path(marker.read_text().strip())
            unowned = runner / "unowned"; unowned.mkdir(); (unowned / "keep").write_text("keep")
            marker.write_text(str(fixture / ".." / "unowned") + "\n")
            refused = subprocess.run(["bash", "-c", cleanup], cwd=ROOT, env=env,
                                     capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertTrue((unowned / "keep").is_file())
            marker.write_text(str(fixture) + "\n")
            subprocess.run(["bash", "-c", cleanup], cwd=ROOT, env=env,
                           check=True, capture_output=True, text=True)
            self.assertFalse(fixture.exists())
            self.assertFalse(marker.exists())
            self.assertTrue((unowned / "keep").is_file())

    def test_cli_selective_rejects_all_artifact_options_before_io(self):
        from unittest.mock import patch
        import contextlib, io
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "must-not-exist"
            cases = [["--compose-out", str(target)], ["--inputs", str(target)],
                     ["--out", str(target)], ["--inputs", str(target), "--out", str(target)],
                     ["--include-ingress"], ["--compose-out", str(target), "--inputs", str(target), "--out", str(target)]]
            for options in cases:
                argv = ["prepare-staging-synthetic.py", "--capacity-scope", "openbao-sealed-addition",
                        "--record", str(target), *options]
                with self.subTest(options=options), patch("sys.argv", argv), patch.object(Path, "read_text", side_effect=AssertionError("No reads before rejection")), patch.object(prepare, "render", side_effect=AssertionError("No workload render")), patch.object(prepare, "consolidated_compose", side_effect=AssertionError("No Compose render")), contextlib.redirect_stderr(io.StringIO()) as error:
                    with self.assertRaises(SystemExit) as rejected: prepare.main()
                    self.assertEqual(rejected.exception.code, 2)
                    self.assertIn("SELECTIVE_CAPACITY_EVALUATION_ONLY", error.getvalue())
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_cli_default_full_stack_labels_workload_and_compose_artifacts(self):
        from unittest.mock import patch
        import contextlib, io
        record, inputs = fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); record_file = root / "record.json"; inputs_file = root / "inputs.json"
            record_file.write_text(json.dumps(record)); inputs_file.write_text(json.dumps(inputs))
            argv = ["prepare-staging-synthetic.py", "--record", str(record_file), "--inputs", str(inputs_file),
                    "--out", str(root / "package"), "--compose-out", str(root / "compose.json")]
            with patch("sys.argv", argv), patch.object(prepare, "consolidated_compose", return_value={"services": {}}) as compose, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(prepare.main(), 0)
                compose.assert_called_once()
            manifest = json.loads((root / "package/manifest.json").read_text())
            self.assertEqual(manifest["capacity"]["scope"], "full-stack")
            self.assertEqual(manifest["capacity"]["requiredAvailableMillicpus"], 2000)
            self.assertEqual(manifest["capacity"]["requiredAvailableMemoryMiB"], 4608)

    def test_cli_selective_evaluation_only_retains_blocked_result_without_writes(self):
        from unittest.mock import patch
        import contextlib, io
        record, _ = fixture()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "record.json"; path.write_text(json.dumps(record))
            with patch("sys.argv", ["prepare-staging-synthetic.py", "--record", str(path), "--capacity-scope", "openbao-sealed-addition"]), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(prepare.main(), 2)
            self.assertEqual(json.loads(output.getvalue())["scope"], "openbao-sealed-addition")
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_staging_image_pins_authenticated_272_without_changing_boundary(self):
        image = (ROOT / "deploy/staging/openbao/Dockerfile").read_text()
        self.assertIn("--checksum=sha256:582b1f3c2fdc5afd443b2d57a225ef654de75adea609fdb66731fd582a9cbc96", image)
        self.assertIn("/v2.7.2/openbao_2.7.2_linux_amd64.tar.gz", image)
        self.assertNotIn("2.7.1", image)
        self.assertIn("USER node", image)
        self.assertIn('CMD ["server", "-config=/etc/openbao/server.json"]', image)

    def test_selective_capacity_keeps_full_stack_gate_and_counts_build(self):
        r, _ = fixture(); s = r["STAGING_SYNTHETIC"]
        s["capacity"].update(availableMemoryMiB=5687, availableMillicpus=1000)
        s["selectiveOpenbao"].update(webPostgresUnchanged=True, buildOpenbaoOnly=True,
                                    buildEnvelopeVerified=True, buildMillicpus=1000)
        full = prepare.capacity(r)
        self.assertEqual(full["status"], "BLOCKED")
        self.assertEqual(full["requiredAvailableMillicpus"], 2000)
        self.assertEqual(full["requiredAvailableMemoryMiB"], 4608)
        result = prepare.capacity(r, scope="openbao-sealed-addition")
        self.assertEqual(result["status"], "PASS_HEADROOM_ONLY")
        self.assertEqual(result["requiredAvailableMemoryMiB"], 2816)
        self.assertEqual(result["requiredAvailableMillicpus"], 1000)
        self.assertFalse(result["cpuReservationGuaranteed"])
        s["capacity"]["availableMemoryMiB"] = 2815
        self.assertIn("availableMemoryMiB", prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])
        s["capacity"].update(availableMemoryMiB=5687, availableMillicpus=999)
        self.assertIn("availableMillicpus", prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])

    def test_selective_capacity_rejects_unknown_build_cpu_scope_and_stale_data(self):
        r, _ = fixture(); s = r["STAGING_SYNTHETIC"]
        for field in ["webPostgresUnchanged", "buildOpenbaoOnly", "buildEnvelopeVerified", "buildMillicpus"]:
            self.assertIn(field, prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])
        s["selectiveOpenbao"].update(webPostgresUnchanged=True, buildOpenbaoOnly=True,
                                    buildEnvelopeVerified=True, buildMillicpus=500)
        s["capacity"]["availableMillicpus"] = None
        s["observedOpenbaoPreparation"]["vmstatIdlePercent"] = [99]*5
        self.assertIn("availableMillicpus", prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])
        s["capacity"].update(availableMillicpus=500, measuredAt="2001-01-01T00:00:00Z")
        self.assertIn("staleOrFutureMeasurement", prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])
        for unknown in [None, 0, -1, True]:
            s["selectiveOpenbao"]["buildMillicpus"] = unknown
            self.assertIn("buildMillicpus", prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])
        s["selectiveOpenbao"]["buildMillicpus"] = 500
        s["capacity"]["measuredAt"] = "2999-01-01T00:00:00Z"
        self.assertIn("staleOrFutureMeasurement", prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])
        with self.assertRaisesRegex(ValueError, "UNKNOWN_CAPACITY_SCOPE"):
            prepare.capacity(r, scope="arbitrary")
        s["capacity"]["availableMemoryMiB"] = None
        self.assertIn("availableMemoryMiB", prepare.capacity(r, scope="openbao-sealed-addition")["blockers"])

    def test_canonical_include_is_used_once_by_every_command_producer(self):
        from unittest.mock import patch
        entry = (ROOT / "deploy/staging/compose.yaml").read_text()
        self.assertEqual(entry.count("  - compose.openbao.yaml"), 1)
        with patch.object(prepare.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = '{"services": {}}'
            prepare.consolidated_compose()
            command = run.call_args.args[0]
        self.assertEqual(command.count("-f"), 1)
        self.assertFalse(any(str(x).endswith("compose.openbao.yaml") for x in command))
        record, _ = fixture()
        calls = []
        def docker(args):
            calls.append(args)
            return json.dumps({"name": record["STAGING_SYNTHETIC"]["composeProject"],
                               "services": {"postgres": {}, "openbao": {}}}).encode()
        base, _ = maintenance.maintenance_base(record, docker)
        self.assertEqual(base.count("-f"), 1)
        self.assertEqual(base[base.index("-f")+1], str(ROOT / "deploy/staging/compose.yaml"))
        self.assertEqual(calls, [[*base, "config", "--format", "json"]])
        self.assertFalse(any(str(x).endswith("compose.openbao.yaml") for x in base))

    def test_maintenance_rejects_wrong_project_path_and_ownership(self):
        record, _ = fixture()
        expected = record["STAGING_SYNTHETIC"]["composeProject"]
        self.assertEqual(expected, "cleanops360-f4fxmd")
        for field, value in [("composeProject", "cleanops360-staging"),
                             ("composeProject", None), ("composePath", "another/compose.yaml")]:
            bad = copy.deepcopy(record); bad["STAGING_SYNTHETIC"][field] = value
            with self.assertRaises(ValueError):
                maintenance.maintenance_base(bad, lambda *_: self.fail("Must reject before Docker"))
        def meta(project=expected, service="postgres", ports=None):
            return dict(Config=dict(Labels={"com.docker.compose.project": project,
                                            "com.docker.compose.service": service}),
                        HostConfig=dict(PortBindings=ports or {}))
        maintenance.require_owned_service(meta(), expected, "postgres")
        for bad in [meta(project="cleanops360-staging"), meta(project="other"),
                    meta(service="web"), meta(ports={"5432/tcp": [{}]})]:
            with self.assertRaisesRegex(ValueError, "OWNERSHIP_REQUIRED"):
                maintenance.require_owned_service(bad, expected, "postgres")

    def test_maintenance_validates_its_exact_compose_before_discovery(self):
        record, _ = fixture(); project = record["STAGING_SYNTHETIC"]["composeProject"]
        configs = [{"name": "wrong", "services": {"postgres": {}, "openbao": {}}},
                   {"name": project, "services": {"postgres": {}}},
                   {"name": project, "services": {"postgres": {}, "openbao": {"ports": [8200]}}}]
        for config in configs:
            calls = []
            def docker(args):
                calls.append(args)
                self.assertEqual(args[-3:], ["config", "--format", "json"])
                return json.dumps(config).encode()
            with self.assertRaises(ValueError): maintenance.maintenance_base(record, docker)
            self.assertEqual(len(calls), 1)
        def invalid_compose(args):
            self.assertEqual(args[-3:], ["config", "--format", "json"])
            raise ValueError("REDACTED_BACKUP_DEPENDENCY_FAILURE")
        with self.assertRaisesRegex(ValueError, "DEPENDENCY_FAILURE"):
            maintenance.maintenance_base(record, invalid_compose)

    def test_offline_consolidation_keeps_variables_relative_paths_and_fixed_deploy_path(self):
        merged = prepare.consolidated_compose(ingress=True)
        self.assertEqual(merged["services"]["web"]["build"]["context"], "../..")
        self.assertIn("CLEANOPS_PG_PASSWORD_FILE", json.dumps(merged))
        self.assertNotIn("/workspace/", json.dumps(merged))
        prebuilt = prepare.consolidated_compose(prebuilt=True)
        self.assertFalse(prebuilt["services"]["web"].get("build"))
        self.assertIn("CLEANOPS_STAGING_WEB_IMAGE", prebuilt["services"]["web"]["image"])
    def test_hostinger_non_swiss_is_allowed_without_productive_acceptance(self):
        r, i = fixture()
        self.assertEqual(prepare.capacity(r)["status"], "PASS_HEADROOM_ONLY")
        self.assertEqual(prepare.render(r, i)["server.json"]["api_addr"], "https://openbao:8200")
        self.assertFalse(r["PRODUCTION_SWISS"]["custodiansApproved"])

    def test_unknown_low_stale_capacity_and_other_projects_block(self):
        original = json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())
        self.assertEqual(prepare.capacity(original)["status"], "BLOCKED")
        for name, value in [("availableMemoryMiB", 100), ("freeDiskMiB", 1),
                            ("availableMillicpus", 500), ("otherProjectsIsolated", False),
                            ("measuredAt", "2001-01-01T00:00:00Z"), ("architecture", "arm64")]:
            r, _ = fixture()
            r["STAGING_SYNTHETIC"]["capacity"][name] = value
            self.assertEqual(prepare.capacity(r)["status"], "BLOCKED", name)

    def test_non_synthetic_data_smtp_cost_and_quorum_are_rejected(self):
        for key, value in [("syntheticOnly", False), ("realPersonalData", True),
                           ("productionDatabaseCopies", True), ("externalCommunications", True),
                           ("incrementalCostAuthorized", True), ("productionQuorumApproved", True)]:
            r, _ = fixture()
            r["STAGING_SYNTHETIC"][key] = value
            with self.assertRaises(ValueError):
                prepare.capacity(r)

    def test_prebuilt_alternative_requires_both_digests_and_zero_build_budget(self):
        r, _ = fixture()
        s = r["STAGING_SYNTHETIC"]
        s.update(imageMode="PREBUILT", prebuiltImages={"web": "web:latest", "openbao": None})
        s["budget"]["buildReserveMiB"] = 0
        with self.assertRaises(ValueError): prepare.capacity(r)
        s["prebuiltImages"] = {"web": "local/web@sha256:" + "a" * 64, "openbao": "local/bao@sha256:" + "b" * 64}
        s["capacity"]["availableMemoryMiB"] = 3072
        self.assertEqual(prepare.capacity(r)["status"], "PASS_HEADROOM_ONLY")

    def test_network_scope_and_production_renderer_cannot_be_reinterpreted(self):
        r, i = fixture()
        for key, value in [("environment", "production"), ("private_ipv4", "10.249.88.3"),
                           ("api_dns", "external.invalid"), ("workload_cidrs", ["10.0.0.0/8"])]:
            with self.assertRaises(ValueError):
                prepare.render(r, {**i, key: value})
        # Staging keeps its own unaccepted production boundary; do not import
        # pending development-branch operational-acceptance records into staging.
        production = json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())["PRODUCTION_SWISS"]
        self.assertFalse(production["custodiansApproved"])
        self.assertIsNone(production["quorum"])
        self.assertEqual(production["operationalAcceptance"], "PENDING")
        self.assertEqual(production["AUTH_GATE_05"], "OPEN")

    def test_sql_verify_only_and_reject_unapproved_apply_before_docker(self):
        r, _ = fixture()
        def denied(*_):
            self.fail("No Docker operation authorized")
        self.assertEqual(install.install(r, False, denied), "VERIFIED_ONLY_NOT_INSTALLED")
        with self.assertRaises(ValueError):
            install.install(r, True, denied)

    def test_sql_installer_checks_ownership_freshness_and_exact_bytes(self):
        r, _ = fixture()
        r["STAGING_SYNTHETIC"].update(deploymentAuthorized=True, deploymentApprovalReference="SYNTHETIC_TEST_ONLY", sql14FreshInstallAuthorized=True)
        for fresh, expected in [("0", False), ("1", True)]:
            installed = []
            def run(args, data=None):
                if "inspect" in args:
                    return json.dumps([dict(Config=dict(Labels={"com.docker.compose.project": r["STAGING_SYNTHETIC"]["composeProject"], "com.docker.compose.service": "postgres"}), HostConfig=dict(PortBindings={}))])
                if "ps" in args: return "fixture-owned-container"
                if "SHOW server_version_num;" in args: return "160013"
                if "-c" in args: return fresh
                installed.append(data)
                return ""
            if expected:
                install.install(r, True, run, lambda _: b"offline-envelope;\n" + install.SQL.read_bytes(), compose_env_file=self.compose_env)
                self.assertEqual(installed, [b"offline-envelope;\n" + install.SQL.read_bytes()])
            else:
                with self.assertRaises(ValueError): install.install(r, True, run, lambda _: b"offline-envelope;\n" + install.SQL.read_bytes(), compose_env_file=self.compose_env)
                self.assertFalse(installed)

    def test_sql_installer_rejects_wrong_project_and_existing_registry(self):
        r, _ = fixture()
        r["STAGING_SYNTHETIC"].update(deploymentAuthorized=True, deploymentApprovalReference="TEST_ONLY", sql14FreshInstallAuthorized=True)
        bad = copy.deepcopy(r); bad["STAGING_SYNTHETIC"]["composeProject"] = "cleanops360-staging"
        with self.assertRaisesRegex(ValueError, "STAGING_TARGET_MISMATCH"):
            install.install(bad, True, lambda *_: self.fail("No Docker after target mismatch"))
        def wrong_owner(args, data=None):
            if "ps" in args: return "owned-candidate"
            return json.dumps([dict(Config=dict(Labels={"com.docker.compose.project":"other", "com.docker.compose.service":"postgres"}),HostConfig=dict(PortBindings={}))])
        with self.assertRaisesRegex(ValueError, "OWNERSHIP"):
            install.install(r, True, wrong_owner, compose_env_file=self.compose_env)
        def occupied(args, data=None):
            if "ps" in args: return "owned-candidate"
            if "inspect" in args: return json.dumps([dict(Config=dict(Labels={"com.docker.compose.project":r["STAGING_SYNTHETIC"]["composeProject"], "com.docker.compose.service":"postgres"}),HostConfig=dict(PortBindings={}))])
            if "SHOW server_version_num;" in args: return "160015"
            if "-c" in args: return "0"
            self.fail("No install on occupied cluster")
        with self.assertRaisesRegex(ValueError, "EMPTY_CLUSTER_REQUIRED"):
            install.install(r, True, occupied, lambda _: self.fail("Do not render after failed freshness"), compose_env_file=self.compose_env)

    def test_sql_installer_propagates_private_compose_env_without_reading_values(self):
        from unittest.mock import patch
        r, _ = fixture()
        r["STAGING_SYNTHETIC"].update(deploymentAuthorized=True, deploymentApprovalReference="OFFLINE_ONLY", sql14FreshInstallAuthorized=True)
        calls = []
        def runner(args, data=None):
            calls.append(args)
            if args[0] == "compose":
                self.assertEqual(args.count("--env-file"), 1)
                self.assertEqual(args[args.index("--env-file")+1], str(self.compose_env))
                self.assertEqual(args[args.index("-p")+1], "cleanops360-f4fxmd")
            if "ps" in args: return "owned-offline-container"
            if "inspect" in args: return json.dumps([dict(Config=dict(Labels={"com.docker.compose.project":"cleanops360-f4fxmd", "com.docker.compose.service":"postgres"}), HostConfig=dict(PortBindings={}))])
            if "SHOW server_version_num;" in args: return "160015"
            return "1"
        original = Path.open
        def read(path, *args, **kwargs):
            self.assertNotEqual(path, self.compose_env, "Installer must not open secret values")
            return original(path, *args, **kwargs)
        with patch.object(Path, "open", read):
            install.install(r, True, runner, lambda _: b"offline-envelope;\n" + install.SQL.read_bytes(), compose_env_file=self.compose_env)
        self.assertEqual(sum(args[0] == "compose" for args in calls), 4)

    def test_sql_installer_rejects_missing_relative_checkout_or_symlink_env_before_docker(self):
        r, _ = fixture()
        r["STAGING_SYNTHETIC"].update(deploymentAuthorized=True, deploymentApprovalReference="OFFLINE_ONLY", sql14FreshInstallAuthorized=True)
        link = Path(self.private.name) / "link.env"; link.symlink_to(self.compose_env)
        for path in [None, Path("staging.env"), Path(self.private.name)/"missing", ROOT/"package.json", link]:
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "PRIVATE_COMPOSE_ENV_FILE_REQUIRED"):
                install.install(r, True, lambda *_: self.fail("No Docker before env validation"), compose_env_file=path)
        # Verify-only does not require a deployment file or inspect it.
        self.assertEqual(install.install(r), "VERIFIED_ONLY_NOT_INSTALLED")

    def test_migration_offline_clis_never_resolve_pg_or_require_a_dsn(self):
        hook = Path(self.private.name) / "deny-pg.mjs"
        hook.write_text("""import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'pg') throw Error('PG_MUST_NOT_BE_RESOLVED_OFFLINE');
  return next(specifier, context);
} });
""")
        env = {k: v for k, v in os.environ.items() if not k.startswith("PG") and not k.endswith("DATABASE_URL")}
        def run(*args, data=None):
            return subprocess.run(["node", "--import", str(hook), str(ROOT / "scripts/migrate-postgres.mjs"), *args],
                                  input=data, text=True, capture_output=True, env=env, check=False)
        for profile in ["foundation", "b1"]:
            result = run("--offline-plan", "--profile=" + profile)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["registry"], "UNKNOWN_NOT_CONNECTED")
        record, _ = fixture()
        record["STAGING_SYNTHETIC"].update(deploymentAuthorized=True, sql14FreshInstallAuthorized=True,
                                         deploymentApprovalReference="OFFLINE_ONLY")
        result = run("--emit-sql14-batch", data=json.dumps(record))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.encode().endswith(install.SQL.read_bytes()))
        self.assertNotIn("$1::boolean", result.stdout)
        self.assertIn("NOT TRUE OR NOT EXISTS", result.stdout)
        online = run("--plan")
        self.assertEqual(online.returncode, 1)
        self.assertEqual(online.stderr.strip(), "MIGRATION_DATABASE_URL_REQUIRED")

    def test_native_migration_harness_discards_operational_connection_hints(self):
        from unittest.mock import patch
        with patch("subprocess.run", side_effect=AssertionError("No native execution on import")):
            native = module("native_migration_packaging_review", "scripts/test-staging-postgres.py")
            values = {k: "operational-fixture-not-a-credential" for k in ["DATABASE_URL", "CLEANOPS_TEST_DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGSSLMODE", "PGOPTIONS", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]}
            values["PATH"] = "/offline-fixture/bin"
            isolated = native.isolated_environment(values)
        self.assertEqual(isolated, {"PATH": "/offline-fixture/bin"})
        self.assertIn("host: socket", native.NATIVE_MIGRATION_CHECKS)
        self.assertNotIn("connectionString", native.NATIVE_MIGRATION_CHECKS)

    def test_first_actor_native_preparation_is_explicit_owned_and_offline_on_import(self):
        from unittest.mock import patch
        with patch("subprocess.run", side_effect=AssertionError("Native execution forbidden")):
            native = module("first_actor_native_preparation", "scripts/test-staging-postgres.py")
            for args in [["--first-actor"], ["--authorization", "FIRST-ACTOR-NATIVE-01"], ["--first-actor", "--authorization", "OTHER"]]:
                with self.assertRaises(SystemExit) as error:
                    native.main(args)
                self.assertEqual(error.exception.code, 2)
        source = (ROOT / "scripts/test-staging-postgres.py").read_text()
        self.assertIn('if not options.first_actor:', source)
        self.assertIn('FIRST_ACTOR_NATIVE_CHECKS if options.first_actor', source)
        self.assertIn('timeout=300 if options.first_actor else 120', source)
        self.assertIn('first-actor-native.json', source)
        body = native.FIRST_ACTOR_NATIVE_CHECKS
        self.assertIn("host:socket", body)
        self.assertNotIn('connectionString', body)
        for contract in ['proposal.sql', 'pg_blocking_pids', 'first_actor_history', 'SYNTHETIC_ACK_LOST_AFTER_REAL_COMMIT',
                         'fa_fail_audit', 'relforcerowsecurity', 'openEnrollmentSecret', 'ATTEMPTS_EXHAUSTED',
                         'cleanops_first_actor_reader', 'deployment_enabled', 'app.sessions']:
            self.assertIn(contract, body)
        self.assertNotIn('INSERT INTO app.users', body)
        self.assertNotIn('INSERT INTO identity_private.credentials', body)

    def test_backup_is_blocked_without_signed_synthetic_scope(self):
        r, _ = fixture()
        with self.assertRaises(ValueError):
            maintenance.backup(r, Path("/not-created"), Path("/not-created-key"), Path("/not-created-output"))

    def test_direct_tools_cannot_bypass_the_synthetic_data_or_backup_directory_boundary(self):
        for field in ["realPersonalData", "productionDatabaseCopies", "externalCommunications"]:
            r, _ = fixture()
            s = r["STAGING_SYNTHETIC"]
            s.update(deploymentAuthorized=True, backupAuthorized=True, sql14FreshInstallAuthorized=True,
                     deploymentApprovalReference="TEST_ONLY")
            s[field] = True
            with self.assertRaisesRegex(ValueError, "AUTHORIZATION_REQUIRED"):
                install.install(r, True, lambda *_: self.fail("No Docker allowed"))
            with self.assertRaisesRegex(ValueError, "AUTHORIZATION_REQUIRED"):
                maintenance.backup(r, Path("/not-created"), Path("/not-created-key"), Path("/other-project/file"))
        r, _ = fixture()
        s = r["STAGING_SYNTHETIC"]
        s.update(deploymentAuthorized=True, backupAuthorized=True, deploymentApprovalReference="TEST_ONLY")
        s["backup"]["destinationDirectory"] = "/owned-cleanops-backups"
        with self.assertRaisesRegex(ValueError, "DEDICATED_STAGING_BACKUP_DIRECTORY_REQUIRED"):
            maintenance.backup(r, Path("/not-created"), Path("/not-created-key"), Path("/other-project/file"))

    def test_merged_compose_has_only_web_ingress_and_persistent_private_bao(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d); (p / "pw").write_text("synthetic-config-only")
            (p / "server.json").write_text("{}"); (p / "tls").mkdir()
            env = dict(os.environ, CLEANOPS_AUTH_ORIGIN="https://cleanops.nuvurent.com",
                       CLEANOPS_PG_PASSWORD_FILE=str(p / "pw"), CLEANOPS_BAO_CONFIG_FILE=str(p / "server.json"),
                       CLEANOPS_BAO_TLS_DIR=str(p / "tls"), CLEANOPS_BAO_PRIVATE_IPV4="10.249.88.2",
                       CLEANOPS_BAO_SUBNET="10.249.88.0/24", CLEANOPS_TRAEFIK_NETWORK="synthetic-ingress",
                       CLEANOPS_TRAEFIK_ENTRYPOINT="websecure", CLEANOPS_TRAEFIK_CERTRESOLVER="synthetic")
            result = subprocess.run(["docker", "compose", "-f", "deploy/staging/compose.yaml", "-f",
                                     "deploy/staging/compose.ingress.yaml",
                                     "--profile", "synthetic-custody", "config", "--format", "json"],
                                    cwd=ROOT, env=env, capture_output=True, text=True, check=True)
            config = json.loads(result.stdout)
            for name, service in config["services"].items():
                self.assertFalse(service.get("ports"), name)
                self.assertFalse(service.get("privileged", False), name)
            self.assertEqual(set(config["services"]["web"]["networks"]), {"private", "ingress"})
            self.assertEqual(set(config["services"]["postgres"]["networks"]), {"private"})
            self.assertEqual(config["services"]["postgres"]["user"], "postgres")
            self.assertEqual(config["services"]["postgres"]["healthcheck"]["test"][-2:], ["-c", "SELECT 1"])
            bao = config["services"]["openbao"]
            self.assertEqual(set(bao["networks"]), {"custody"})
            self.assertTrue(config["networks"]["custody"]["internal"])
            self.assertEqual(bao["labels"]["traefik.enable"], "false")
            self.assertEqual(len([v for v in bao["volumes"] if v["type"] == "volume"]), 2)


if __name__ == "__main__":
    unittest.main()

