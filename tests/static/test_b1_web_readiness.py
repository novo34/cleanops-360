"""Offline tests of the B1 readiness decision; never calls Docker or reads secrets."""
import importlib.util
import pathlib
import unittest
import subprocess
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "check-b1-web-readiness.py"
spec = importlib.util.spec_from_file_location("b1_web_readiness", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def container(*, live=True, healthy=False, mounts=()):
    return {"State": {"Running": live, "Health": {"Status": "healthy" if healthy else "unknown"}},
            "Mounts": list(mounts)}


def fixture(web_sink=False, wrong_writer=False, web_healthy=True):
    sink = mod.SINK
    mounts = [{"Destination": "/run/cleanops-agent", "Type": "volume",
               "Name": sink, "RW": False}] if web_sink else []
    return {
        "postgres": container(healthy=True),
        "bao": container(healthy=True),
        "agent": container(mounts=[{"Destination": "/run/cleanops-agent",
                                    "Type": "volume", "Name": sink,
                                    "RW": not wrong_writer}]),
        "web": container(healthy=web_healthy, mounts=mounts),
    }


def volume():
    return {"Name": mod.SINK, "Driver": "local", "Options": {
        "type": "tmpfs", "device": "tmpfs",
        "o": "nodev,nosuid,noexec,size=1m,mode=0700,uid=999,gid=999"}}


class WebReadinessTest(unittest.TestCase):
    def test_verified_metadata(self):
        self.assertTrue(mod.evaluate(fixture(web_sink=True), volume()))

    def test_current_web_without_sink_is_blocked(self):
        self.assertFalse(mod.evaluate(fixture(), volume()))

    def test_unhealthy_web_is_blocked(self):
        self.assertFalse(mod.evaluate(fixture(web_sink=True, web_healthy=False), volume()))

    def test_agent_must_have_rw_sink(self):
        self.assertFalse(mod.evaluate(fixture(web_sink=True, wrong_writer=True), volume()))

    def test_wrong_volume_properties_are_blocked(self):
        v = volume()
        v["Options"]["o"] = "nodev,nosuid,noexec,size=1m,mode=0755,uid=999,gid=999"
        self.assertFalse(mod.evaluate(fixture(web_sink=True), v))


    def test_docker_inspect_has_bounded_timeout(self):
        with patch.object(mod.subprocess, "check_output", return_value='[{}]') as call:
            self.assertEqual(mod.inspect("inspect", "test"), {})
        call.assert_called_once_with(["docker", "inspect", "test"],
                                     text=True, stderr=subprocess.DEVNULL, timeout=30)

    def test_docker_timeout_is_blocked_not_traceback(self):
        with patch.object(mod, "inspect",
                          side_effect=subprocess.TimeoutExpired(cmd=["docker", "inspect"], timeout=30)):
            output = StringIO()
            with redirect_stdout(output):
                self.assertEqual(mod.main(), 2)
        self.assertIn("BLOCKED | required Docker object unavailable", output.getvalue())


if __name__ == "__main__":
    unittest.main()
