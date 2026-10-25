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
        self.assertIsNone(json.loads((ROOT / "docs/implementation/b1/operational-acceptance/staging-candidate/RESOURCE_RECORD.json").read_text())["custody"]["chosenScheme"])

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
                    return json.dumps([dict(Config=dict(Labels={"com.docker.compose.project": "cleanops360-staging", "com.docker.compose.service": "postgres"}), HostConfig=dict(PortBindings={}))])
                if "ps" in args: return "fixture-owned-container"
                if "SHOW server_version_num;" in args: return "160013"
                if "-c" in args: return fresh
                installed.append(data)
                return ""
            if expected:
                install.install(r, True, run)
                self.assertEqual(installed, [install.SQL.read_bytes()])
            else:
                with self.assertRaises(ValueError): install.install(r, True, run)
                self.assertFalse(installed)

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
                                     "deploy/staging/compose.openbao.yaml", "-f", "deploy/staging/compose.ingress.yaml",
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



class OfflineAuthorization(unittest.TestCase):
    # Interpret actual workflow predicates without eval, shell or network.
    def setUp(self):
        import ast
        import re
        self.ast = ast
        self.workflow = (ROOT/'.github/workflows/b1-staging-synthetic.yml').read_text()
        scope = re.search(r'^  scope:\n(.*?)^  offline:', self.workflow, re.M | re.S).group(1)
        self.scope_expression = re.search(r'    if: >-\n(.*?)    runs-on:', scope, re.S).group(1)
        self.native_expression = re.search(r'NATIVE_AUTHORIZED: \$\{\{ (.*?) \}\}', scope).group(1)
        self.sha = '1'*40
        self.github = dict(repository='novo34/cleanops-360', repository_owner='novo34',
            event_name='pull_request_review', actor='novo34', run_attempt=1,
            event=dict(pull_request=dict(head=dict(repo=dict(full_name='novo34/cleanops-360'), sha=self.sha),
                base=dict(ref='main'), state='open'),
                review=dict(user=dict(login='novo34'), commit_id=self.sha, body='')))
        self.offline_body = f'Validate owner-authorized R2 offline CI {self.sha}; B1/B2 unit tests only; no SQL, services, migrations, build or deployment.'
        self.native_body = f'Execute owner-authorized R2 isolated CI {self.sha}; foundation migration, unit/build/browser, synthetic PG16 and OpenBao only; no deployment or production.'

    def evaluate(self, expression):
        ast = self.ast
        tree = ast.parse(' '.join(expression.split()).replace('&&', ' and ').replace('||', ' or '), mode='eval')
        def visit(node):
            if isinstance(node, ast.Expression): return visit(node.body)
            if isinstance(node, ast.Constant): return node.value
            if isinstance(node, ast.Name) and node.id == 'github': return self.github
            if isinstance(node, ast.Attribute): return visit(node.value)[node.attr]
            if isinstance(node, ast.Compare) and len(node.ops)==1 and isinstance(node.ops[0], ast.Eq):
                return visit(node.left)==visit(node.comparators[0])
            if isinstance(node, ast.BoolOp):
                if isinstance(node.op, ast.And): return all(visit(v) for v in node.values)
                if isinstance(node.op, ast.Or): return any(visit(v) for v in node.values)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id=='format' and not node.keywords:
                args=[visit(v) for v in node.args]
                return args[0].format(*args[1:])
            raise AssertionError('Unsupported authorization expression')
        return visit(tree)

    def test_offline_exact_body_never_authorizes_native(self):
        self.github['event']['review']['body']=self.offline_body
        self.assertTrue(self.evaluate(self.scope_expression))
        self.assertFalse(self.evaluate(self.native_expression))
        self.github['event']['review']['body']=self.native_body
        self.assertTrue(self.evaluate(self.scope_expression))
        self.assertTrue(self.evaluate(self.native_expression))

    def test_stale_sha_other_actor_event_attempt_and_scope_fail_closed(self):
        for path,value in [
            (('event_name',),'pull_request'),(('event_name',),'push'),(('event_name',),'workflow_dispatch'),
            (('actor',),'review-bot'),(('run_attempt',),2),(('repository',),'foreign/repository'),
            (('event','review','commit_id'),'2'*40),(('event','review','user','login'),'review-bot'),
            (('event','pull_request','base','ref'),'other'),(('event','pull_request','state'),'closed'),
            (('event','pull_request','head','repo','full_name'),'foreign/repository')]:
            self.setUp()
            self.github['event']['review']['body']=self.offline_body
            target=self.github
            for key in path[:-1]: target=target[key]
            target[path[-1]]=value
            self.assertFalse(self.evaluate(self.scope_expression),path)
        for body in ['',self.offline_body+' ',self.native_body+' extra',self.offline_body.replace(self.sha,'2'*40)]:
            self.setUp()
            self.github['event']['review']['body']=body
            self.assertFalse(self.evaluate(self.scope_expression),'body mismatch')

    def test_offline_has_no_protected_commands_and_natives_require_offline_success(self):
        section=self.workflow.split('  offline:\n',1)[1].split('  foundation-native:\n',1)[0]
        self.assertNotIn('    services:',section)
        for command in ['docker ','psql ','db:migrate','next start','playwright ','test-staging-postgres','test-staging-openbao']:
            self.assertNotIn(command,section)
        self.assertIn('run: npm ci --ignore-scripts',section)
        self.assertEqual(section.count('run: npm run test:b1:offline'),1)
        self.assertEqual(section.count('run: npm run test:b2'),1)
        self.assertIn('ref: ${{ github.event.review.commit_id }}',section)
        self.assertNotIn('continue-on-error',section)
        self.assertEqual(self.workflow.count('needs: [scope, offline]'),2)
        self.assertEqual(self.workflow.count("if: needs.scope.outputs.authorized == 'true' && needs.offline.result == 'success'"),2)
        self.assertIn('failure) result=FAIL',section)
        self.assertIn('*) result=SKIP',section)

    def test_offline_and_native_partition_preserves_every_b1_file_and_single_b2_command(self):
        import shlex
        scripts=json.loads((ROOT/'package.json').read_text())['scripts']
        offline={p for p in shlex.split(scripts['test:b1:offline']) if p.startswith('tests/b1/')}
        native={'tests/b1/browser-server-cleanup.test.ts','tests/b1/custody-deadline.test.ts','tests/b1/openbao-keys.test.ts'}
        all_files={p.relative_to(ROOT).as_posix() for p in (ROOT/'tests/b1').glob('*.test.ts')}
        self.assertFalse(offline & native)
        self.assertEqual(offline | native,all_files)
        self.assertEqual(len(offline),44)
        for path in native: self.assertIn(path,self.workflow.split('  foundation-native:\n',1)[1])
        self.assertIn('node --experimental-strip-types --test --test-isolation=none tests/b2/*.test.ts',scripts['test:b2'])
        self.assertEqual((ROOT/'.github/workflows/b2-no-db.yml').read_text().count('run: npm run test:b2'),1)
        self.assertIn('"tests/b2/**"',(ROOT/'vitest.config.ts').read_text())


if __name__ == "__main__":
    unittest.main()
