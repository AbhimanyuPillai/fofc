import importlib.util
import io
import json
import os
import time
import unittest
from unittest.mock import Mock, patch

import run_booth as windows_launcher


def load_ubuntu_launcher():
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ubuntu_fofc", "run_booth.py")
    spec = importlib.util.spec_from_file_location("ubuntu_run_booth_for_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def monotonic(self):
        return self.now


class FakeShutdownEvent:
    def __init__(self, clock):
        self.clock = clock
        self.stopped = False
        self.wait_calls = 0

    def is_set(self):
        return self.stopped

    def wait(self, seconds):
        self.wait_calls += 1
        self.clock.now += seconds
        if self.wait_calls >= 2:
            self.stopped = True
        return self.stopped


class FakeProcess:
    def __init__(self, exit_code=None):
        self.pid = 1234
        self.stdout = io.StringIO("")
        self.exit_code = exit_code

    def poll(self):
        return self.exit_code

    def terminate(self):
        self.exit_code = -15

    def wait(self, timeout=None):
        return self.exit_code

    def kill(self):
        self.exit_code = -9


class FakeHttpResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.payload


class LauncherRestartTests(unittest.TestCase):
    def assert_launcher_restarts_crashed_agent(self, launcher):
        original_processes = list(launcher.spawned_subprocesses if hasattr(launcher, "spawned_subprocesses")
                                  else launcher.processes)
        process_list = launcher.spawned_subprocesses if hasattr(launcher, "spawned_subprocesses") else launcher.processes
        process_list.clear()
        crashed, recovered = FakeProcess(exit_code=7), FakeProcess()
        clock = FakeClock()
        fake_event = FakeShutdownEvent(clock)
        browser_ready = Mock()
        with patch.object(launcher, "shutdown_event", fake_event), \
             patch.object(launcher.subprocess, "Popen", side_effect=[crashed, recovered]) as popen, \
             patch.object(launcher, "agent_services_ready", return_value=True), \
             patch.object(launcher, "maintain_local_http_servers"), \
             patch.object(launcher, "log_supervisor"), \
             patch.object(launcher, "pipe_agent_output"), \
             patch.object(launcher.time, "monotonic", side_effect=clock.monotonic), \
             patch.object(launcher.threading, "Thread"):
            if launcher is windows_launcher:
                launcher.supervise_agent("python", on_ready=browser_ready)
            else:
                launcher.supervise_agent(on_ready=browser_ready)
        self.assertEqual(popen.call_count, 2)
        self.assertEqual(browser_ready.call_count, 1)
        self.assertEqual(recovered.exit_code, -15)
        self.assertTrue(fake_event.is_set())
        process_list[:] = original_processes

    def test_windows_launcher_restarts_crashed_agent(self):
        self.assert_launcher_restarts_crashed_agent(windows_launcher)

    def test_ubuntu_launcher_restarts_crashed_agent(self):
        self.assert_launcher_restarts_crashed_agent(load_ubuntu_launcher())

    def assert_audio_health_is_required(self, launcher):
        endpoint_probe = "check_http_endpoint" if launcher is windows_launcher else "endpoint_is_ready"
        tcp_probe = "check_tcp_port" if launcher is windows_launcher else "port_is_open"
        with patch.object(launcher, endpoint_probe, return_value=True), \
             patch.object(launcher, tcp_probe, return_value=True), \
             patch.object(launcher.urllib.request, "urlopen",
                          return_value=FakeHttpResponse({"audio": {"updated_at": time.time()}})):
            self.assertTrue(launcher.agent_services_ready())
        with patch.object(launcher, endpoint_probe, return_value=True), \
             patch.object(launcher, tcp_probe, return_value=True), \
             patch.object(launcher.urllib.request, "urlopen",
                          return_value=FakeHttpResponse({"audio": {"updated_at": 1}})):
            self.assertFalse(launcher.agent_services_ready())

    def test_windows_launcher_requires_a_fresh_audio_heartbeat(self):
        self.assert_audio_health_is_required(windows_launcher)

    def test_ubuntu_launcher_requires_a_fresh_audio_heartbeat(self):
        self.assert_audio_health_is_required(load_ubuntu_launcher())


if __name__ == "__main__":
    unittest.main()
