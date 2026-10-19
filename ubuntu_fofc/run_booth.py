#!/usr/bin/env python3
"""Ubuntu supervisor for the Repos agent UI and pointing HUD.

The video-projection application is managed separately and is not started or
modified here. It is reached through VIDEO_PROJECTION_URL (default port 3000).
"""

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import json
import logging
from logging.handlers import RotatingFileHandler
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from supervisor_core import RestartBackoff


ROOT = os.path.dirname(os.path.abspath(__file__))
POINT_DIR = os.path.join(ROOT, "fofc_point")
POINT_DIST = os.path.join(POINT_DIR, "dist")
POINT_INDEX = os.path.join(POINT_DIST, "index.html")
shutdown_event = threading.Event()
servers = []
server_registry = {}
ui_server_retry = {}
processes = []
SUPERVISOR_LOG_PATH = os.path.join(ROOT, "logs", "pipeline_supervisor.log")
supervisor_status_lock = threading.Lock()
supervisor_status = {
    "state": "STARTING", "agent_pid": None, "restart_count": 0,
    "consecutive_failures": 0, "last_exit_code": None, "last_failure": None,
    "next_restart_at": None, "last_started_at": None, "last_healthy_at": None,
}


def update_supervisor_status(**values):
    with supervisor_status_lock:
        supervisor_status.update(values)


def log_supervisor(message, level="info"):
    print(f"[SUPERVISOR] {message}")
    try:
        os.makedirs(os.path.dirname(SUPERVISOR_LOG_PATH), exist_ok=True)
        logger = logging.getLogger("repos_pipeline_supervisor")
        if not logger.handlers:
            handler = RotatingFileHandler(SUPERVISOR_LOG_PATH, maxBytes=2_000_000,
                                          backupCount=4, encoding="utf-8")
            handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        getattr(logger, "warning" if level == "warning" else "error" if level == "error" else "info")(message)
    except Exception as exc:
        print(f"[SUPERVISOR WARNING] Could not write supervisor log: {exc}")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class PointHandler(QuietHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=POINT_DIST, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()


class MasterHandler(QuietHandler):
    def do_GET(self):
        request_path = self.path.split("?", 1)[0]
        if request_path == "/api/supervisor/status":
            with supervisor_status_lock:
                body = json.dumps(dict(supervisor_status)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(body)
            return
        if request_path in ("/diagnostics", "/diagnostics.html"):
            path = os.path.join(ROOT, "diagnostics.html")
            content_type = "text/html; charset=utf-8"
        elif request_path in ("/", "/index.html", "/master_dashboard.html"):
            path = os.path.join(ROOT, "master_dashboard.html")
            content_type = "text/html; charset=utf-8"
        else:
            self.send_error(404)
            return
        if os.path.isfile(path):
            with open(path, "rb") as html_file:
                body = html_file.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)


def port_is_open(port, host="127.0.0.1"):
    try:
        with socket.create_connection((host, port), timeout=0.3):
            return True
    except OSError:
        return False


def endpoint_is_ready(url, timeout=1.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            status = response.status
            # Consume the readiness response before closing, avoiding a reset
            # from the server when the body is left unread.
            response.read()
            return 200 <= status < 400
    except (OSError, urllib.error.URLError):
        return False


def build_point_app():
    if os.path.isfile(POINT_INDEX):
        newest_source = os.path.getmtime(os.path.join(POINT_DIR, "package.json"))
        for folder in ("src", "public"):
            folder_path = os.path.join(POINT_DIR, folder)
            for current, _dirs, files in os.walk(folder_path):
                for filename in files:
                    try:
                        newest_source = max(newest_source, os.path.getmtime(os.path.join(current, filename)))
                    except OSError:
                        pass
        if os.path.getmtime(POINT_INDEX) >= newest_source:
            print("[ORCHESTRATOR] Pointing HUD build is current.")
            return

    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm is required to build fofc_point; install Node.js and run npm ci in fofc_point.")
    print("[ORCHESTRATOR] Building the pointing HUD for Ubuntu...")
    subprocess.run([npm, "run", "build"], cwd=POINT_DIR, check=True)


def start_http_server(handler, port, label):
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True, name=label)
    thread.start()
    servers.append(server)
    server_registry[port] = (server, thread)
    print(f"[ORCHESTRATOR] {label} listening on http://127.0.0.1:{port}")


def maintain_local_http_servers():
    """Restart launcher-owned HTTP servers if their serving thread or port dies."""
    for port, handler, label in (
        (5173, PointHandler, "Pointing HUD"),
        (8000, MasterHandler, "Master dashboard"),
    ):
        retry = ui_server_retry.setdefault(port, {"failures": 0, "retry_at": 0.0})
        if time.monotonic() < retry["retry_at"]:
            continue
        entry = server_registry.get(port)
        if entry and entry[1].is_alive() and port_is_open(port):
            continue
        log_supervisor(f"Local HTTP service on port {port} is unavailable; restarting it.", "warning")
        if entry:
            server, thread = entry
            if thread.is_alive():
                try:
                    server.shutdown()
                except Exception:
                    pass
                thread.join(timeout=2)
            try:
                server.server_close()
            except Exception:
                pass
            if server in servers:
                servers.remove(server)
            server_registry.pop(port, None)
        try:
            start_http_server(handler, port, label)
            retry.update(failures=0, retry_at=0.0)
            update_supervisor_status(ui_services="running")
        except Exception as exc:
            retry["failures"] += 1
            delay = min(2 * (2 ** min(retry["failures"] - 1, 5)), 60)
            retry["retry_at"] = time.monotonic() + delay
            update_supervisor_status(ui_services="degraded", last_failure=f"UI service {port}: {exc}")
            log_supervisor(f"Could not restart local HTTP service on port {port}: {exc}; retrying in {delay}s.", "error")


def pipe_agent_output(proc):
    for line in iter(proc.stdout.readline, ""):
        if line:
            print(f"[AGENT CORE] {line.rstrip()}")


def agent_services_ready():
    if not endpoint_is_ready("http://127.0.0.1:8088/status", timeout=1.0) or not port_is_open(8765):
        return False
    try:
        request = urllib.request.Request("http://127.0.0.1:8088/api/diagnostics",
                                         headers={"User-Agent": "ReposSupervisor/1.0"})
        with urllib.request.urlopen(request, timeout=1.0) as response:
            audio_metrics = json.loads(response.read().decode("utf-8")).get("audio", {})
        last_audio_update = float(audio_metrics.get("updated_at") or 0)
        return last_audio_update > 0 and time.time() - last_audio_update <= 10
    except Exception:
        return False


def stop_agent_process(proc):
    if proc is None or proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def supervise_agent(on_ready=None):
    """Restart the agent after crashes or sustained loss of its core services."""
    policy = RestartBackoff(initial_seconds=2, maximum_seconds=60, stable_after_seconds=300)
    total_restarts = 0
    first_launch = True
    ready_callback_called = False
    while not shutdown_event.is_set():
        proc = None
        started = time.monotonic()
        failure_reason = None
        healthy_at = None
        unhealthy_since = None
        stable_reset_done = False
        log_supervisor("Launching live_agent.py under process supervision." if first_launch
                       else f"Restart attempt {total_restarts + 1}: launching live_agent.py.")
        first_launch = False
        try:
            proc = subprocess.Popen(
                [sys.executable, "-u", os.path.join(ROOT, "live_agent.py")],
                cwd=ROOT, env=os.environ.copy(), stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, bufsize=1,
            )
            processes.append(proc)
            threading.Thread(target=pipe_agent_output, args=(proc,), daemon=True,
                             name="AgentLogReader").start()
            started = time.monotonic()
            update_supervisor_status(state="STARTING", agent_pid=proc.pid,
                                     last_started_at=time.time(), last_failure=None,
                                     next_restart_at=None)
        except Exception as exc:
            failure_reason = f"Could not start live_agent.py: {exc}"

        while proc is not None and not shutdown_event.is_set():
            maintain_local_http_servers()
            return_code = proc.poll()
            if return_code is not None:
                failure_reason = f"live_agent.py exited with code {return_code}"
                break
            now = time.monotonic()
            if agent_services_ready():
                recovered = unhealthy_since is not None
                unhealthy_since = None
                if not ready_callback_called:
                    if on_ready:
                        try:
                            on_ready()
                        except Exception as exc:
                            log_supervisor(f"Could not launch the dashboard browser: {exc}", "error")
                    ready_callback_called = True
                if healthy_at is None:
                    healthy_at = now
                    log_supervisor("Agent audio, HTTP, and WebSocket health checks passed.")
                    update_supervisor_status(state="RUNNING", last_healthy_at=time.time(), last_failure=None)
                elif recovered:
                    log_supervisor("Agent services recovered without restarting the process.")
                    update_supervisor_status(state="RUNNING", last_healthy_at=time.time(), last_failure=None)
                if not stable_reset_done and now - started >= policy.stable_after_seconds:
                    policy.failures = 0
                    stable_reset_done = True
                    update_supervisor_status(consecutive_failures=0)
            elif healthy_at is None:
                if now - started >= 240:
                    failure_reason = "Agent did not bring up HTTP/WebSocket services within 240 seconds"
                    break
            else:
                if unhealthy_since is None:
                    unhealthy_since = now
                    update_supervisor_status(state="DEGRADED", last_failure="Agent service health check failed")
                elif now - unhealthy_since >= 15:
                    failure_reason = "Agent HTTP/WebSocket health checks failed for 15 seconds"
                    break
            shutdown_event.wait(2)

        if shutdown_event.is_set():
            stop_agent_process(proc)
            update_supervisor_status(state="STOPPED", agent_pid=None, next_restart_at=None)
            break

        runtime_seconds = max(0.0, time.monotonic() - started)
        stop_agent_process(proc)
        exit_code = proc.poll() if proc is not None else None
        total_restarts += 1
        delay = policy.delay_after_failure(runtime_seconds)
        update_supervisor_status(
            state="RESTART_WAIT", agent_pid=None, restart_count=total_restarts,
            consecutive_failures=policy.failures, last_exit_code=exit_code,
            last_failure=failure_reason or "Agent stopped unexpectedly",
            next_restart_at=time.time() + delay,
        )
        log_supervisor(
            f"{failure_reason or 'Agent stopped unexpectedly'}; retrying in {delay}s "
            f"(restart {total_restarts}, consecutive failures {policy.failures}).",
            "warning",
        )
        retry_deadline = time.monotonic() + delay
        while not shutdown_event.is_set() and time.monotonic() < retry_deadline:
            maintain_local_http_servers()
            shutdown_event.wait(min(2.0, max(0.0, retry_deadline - time.monotonic())))


def locate_browser():
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        executable = shutil.which(name)
        if executable:
            return executable
    return None


def launch_browser(kiosk):
    browser = locate_browser()
    if not browser:
        print("[INFO] Chromium/Chrome not found. Open http://127.0.0.1:8000 in the booth browser.")
        return
    command = [browser, "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"]
    if kiosk:
        command.append("--kiosk")
    command.append("http://127.0.0.1:8000")
    try:
        proc = subprocess.Popen(command, start_new_session=True)
        processes.append(proc)
    except OSError as exc:
        print(f"[WARNING] Could not launch the local dashboard browser: {exc}")


def cleanup():
    shutdown_event.set()
    for proc in reversed(processes):
        if proc.poll() is None:
            proc.terminate()
    for proc in reversed(processes):
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    for server in reversed(servers):
        server.shutdown()
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="Run the Ubuntu Repos agent pipeline.")
    parser.add_argument("--projection-url", default=os.environ.get("VIDEO_PROJECTION_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--no-browser", action="store_true", help="Do not open the local dashboard automatically.")
    parser.add_argument("--no-kiosk", action="store_true", help="Open Chromium in a regular window.")
    args = parser.parse_args()
    os.environ["VIDEO_PROJECTION_URL"] = args.projection_url.rstrip("/")

    def request_shutdown(_signum, _frame):
        shutdown_event.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    conflicts = [port for port in (8000, 8088, 8765, 8766, 5173) if port_is_open(port)]
    if conflicts:
        raise SystemExit(
            "These pipeline ports are already in use: " + ", ".join(map(str, conflicts))
            + ". Stop the owning service and retry; this launcher will not kill unrelated processes."
        )

    try:
        build_point_app()
        start_http_server(PointHandler, 5173, "Pointing HUD")
        start_http_server(MasterHandler, 8000, "Master dashboard")

        catalog_url = f"{os.environ['VIDEO_PROJECTION_URL']}/api/products"
        if endpoint_is_ready(catalog_url):
            print(f"[PROJECTION] Product API is available at {catalog_url}")
        else:
            print(f"[WARNING] Projection app is not responding at {catalog_url}; the agent will start, but product selection will be unavailable until it is running.")

        print("[READY] Dashboard: http://127.0.0.1:8000")
        print("[READY] Pointing HUD: http://127.0.0.1:5173")
        print("[READY] Projection app remains externally managed at " + os.environ["VIDEO_PROJECTION_URL"])
        print("[SUPERVISOR] Agent will restart automatically after crashes or critical service failures.")
        browser_ready_callback = None
        if not args.no_browser:
            browser_ready_callback = lambda: launch_browser(kiosk=not args.no_kiosk)
        else:
            print("[INFO] --no-browser specified. Browser launch skipped.")
        supervise_agent(on_ready=browser_ready_callback)
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
