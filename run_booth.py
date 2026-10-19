#!/usr/bin/env python3
"""
JARVIS UNIFIED BOOTH ORCHESTRATOR
Author: Repos Jarvis Architecture
Description:
    End-to-end supervisor managing subprocesses for:
    - Port 5173: Static file server for fofc_point/dist (AeroFinger HUD)
    - Port 8088: dashboard_server.py (Camera 1 YuNet + SFace Face Detection & SSE Terminal Stream)
    - Port 8000: Master Dashboard Shell (master_dashboard.html)
    - Port 8765: live_agent.py (Dual-input voice & pointing agent runtime)
"""

import os
import sys
import time
import socket
import signal
import shutil
import urllib.request
import threading
import subprocess
import argparse
import mimetypes
import json
import logging
from logging.handlers import RotatingFileHandler
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from supervisor_core import RestartBackoff

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Workspace root
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
FOFC_DIST_DIR = os.path.join(WORKSPACE_DIR, "fofc_point", "dist")
MASTER_HTML_PATH = os.path.join(WORKSPACE_DIR, "master_dashboard.html")
DIAGNOSTICS_HTML_PATH = os.path.join(WORKSPACE_DIR, "diagnostics.html")
SUPERVISOR_LOG_PATH = os.path.join(WORKSPACE_DIR, "logs", "pipeline_supervisor.log")

# Ensure proper MIME types for WASM and JS assets
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/json", ".json")

# Process tracking
spawned_subprocesses = []
active_http_servers = []
active_http_server_threads = {}
ui_server_retry = {}
shutdown_event = threading.Event()
supervisor_status_lock = threading.Lock()
supervisor_status = {
    "state": "STARTING", "agent_pid": None, "restart_count": 0,
    "last_exit_code": None, "last_failure": None, "next_restart_at": None,
    "last_started_at": None, "last_healthy_at": None,
}

def update_supervisor_status(**values):
    with supervisor_status_lock:
        supervisor_status.update(values)

def log_supervisor(message: str, level: str = "info"):
    line = f"[SUPERVISOR] {message}"
    print(line)
    try:
        os.makedirs(os.path.dirname(SUPERVISOR_LOG_PATH), exist_ok=True)
        logger = logging.getLogger("repos_pipeline_supervisor")
        if not logger.handlers:
            handler = RotatingFileHandler(SUPERVISOR_LOG_PATH, maxBytes=2_000_000, backupCount=4, encoding="utf-8")
            handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        getattr(logger, "warning" if level == "warning" else "error" if level == "error" else "info")(message)
    except Exception as exc:
        print(f"[SUPERVISOR WARNING] Could not write supervisor log: {exc}")

def free_port(port: int):
    """Terminates any process holding the specified TCP port."""
    try:
        output = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode(errors="ignore")
        for line in output.strip().splitlines():
            parts = line.split()
            if len(parts) >= 5 and f":{port}" in parts[1]:
                pid = parts[-1]
                if pid.isdigit() and int(pid) != 0 and int(pid) != os.getpid():
                    subprocess.run(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def cleanup_ports():
    """Frees all required ports across the orchestrator ecosystem."""
    for port in [8000, 8088, 8765, 8766, 5173]:
        free_port(port)

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class FofcStaticRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FOFC_DIST_DIR, **kwargs)

    def log_message(self, format, *args):
        # Silence routine static file HTTP access logs
        return

    def end_headers(self):
        # Enable CORS and disable caching
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

class MasterShellRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        request_path = self.path.split("?", 1)[0]
        if request_path == "/api/supervisor/status":
            with supervisor_status_lock:
                payload = json.dumps(dict(supervisor_status)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(payload)
        elif request_path in ("/diagnostics", "/diagnostics.html"):
            if os.path.exists(DIAGNOSTICS_HTML_PATH):
                with open(DIAGNOSTICS_HTML_PATH, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, "diagnostics.html not found")
        elif request_path in ("/", "/index.html", "/master_dashboard.html"):
            if os.path.exists(MASTER_HTML_PATH):
                with open(MASTER_HTML_PATH, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, "master_dashboard.html not found")
        else:
            super().do_GET()

def _fofc_point_bundle_is_stale(dist_index: str, project_dir: str) -> bool:
    """Return true when point-app sources/config are newer than the served bundle."""
    if not os.path.exists(dist_index):
        return True

    bundle_mtime = os.path.getmtime(dist_index)
    source_paths = [
        os.path.join(project_dir, "src"),
        os.path.join(project_dir, "public"),
        os.path.join(project_dir, "index.html"),
        os.path.join(project_dir, "package.json"),
        os.path.join(project_dir, "package-lock.json"),
        os.path.join(project_dir, "vite.config.js"),
        os.path.join(project_dir, "vite.config.ts"),
    ]

    for source_path in source_paths:
        if not os.path.exists(source_path):
            continue
        if os.path.isfile(source_path):
            if os.path.getmtime(source_path) > bundle_mtime:
                return True
            continue
        for root, _, filenames in os.walk(source_path):
            for filename in filenames:
                try:
                    if os.path.getmtime(os.path.join(root, filename)) > bundle_mtime:
                        return True
                except OSError:
                    continue
    return False


def start_fofc_server(port: int = 5173):
    """Build stale point-app sources, then serve fofc_point/dist on port 5173."""
    project_dir = os.path.join(WORKSPACE_DIR, "fofc_point")
    dist_index = os.path.join(project_dir, "dist", "index.html")
    if not _fofc_point_bundle_is_stale(dist_index, project_dir):
        print("[ORCHESTRATOR] fofc_point dist bundle is current. Skipping build.")
    else:
        print("[ORCHESTRATOR] Point-app sources changed or dist is missing; rebuilding fofc_point...")
        try:
            subprocess.run(["npm", "run", "build"], cwd=project_dir, shell=True, check=True)
        except Exception as e:
            print(f"[ORCHESTRATOR WARNING] npm run build failed ({e}). Proceeding with available assets; point-app changes may not be active.")

    server = ThreadedHTTPServer(("127.0.0.1", port), FofcStaticRequestHandler)
    active_http_servers.append(server)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="FofcServerThread")
    active_http_server_threads[port] = (server, t)
    t.start()
    return server

def start_master_shell_server(port: int = 8000):
    """Starts Master Dashboard Shell server on port 8000."""
    server = ThreadedHTTPServer(("127.0.0.1", port), MasterShellRequestHandler)
    active_http_servers.append(server)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="MasterShellThread")
    active_http_server_threads[port] = (server, t)
    t.start()
    return server

def maintain_local_http_servers():
    """Restart launcher-owned HTTP servers if their serving thread or port dies."""
    starters = {5173: start_fofc_server, 8000: start_master_shell_server}
    for port, starter in starters.items():
        retry = ui_server_retry.setdefault(port, {"failures": 0, "retry_at": 0.0})
        if time.monotonic() < retry["retry_at"]:
            continue
        entry = active_http_server_threads.get(port)
        server_alive = bool(entry and entry[1].is_alive())
        if server_alive and check_tcp_port(port):
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
            if server in active_http_servers:
                active_http_servers.remove(server)
            active_http_server_threads.pop(port, None)
        try:
            starter(port)
            retry.update(failures=0, retry_at=0.0)
            update_supervisor_status(ui_services="running")
        except Exception as exc:
            retry["failures"] += 1
            delay = min(2 * (2 ** min(retry["failures"] - 1, 5)), 60)
            retry["retry_at"] = time.monotonic() + delay
            update_supervisor_status(ui_services="degraded", last_failure=f"UI service {port}: {exc}")
            log_supervisor(f"Could not restart local HTTP service on port {port}: {exc}; retrying in {delay}s.", "error")

def check_tcp_port(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    """Checks if a TCP socket port is responding."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def check_http_endpoint(url: str, timeout: float = 0.8) -> bool:
    """Checks if an HTTP GET endpoint returns an OK status code."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "JarvisOrchestrator/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            # Drain the small readiness response before closing its socket. If
            # the body is unread, Windows may reset the connection and Uvicorn
            # logs a harmless WinError 10054 from the server side.
            resp.read()
            return status in (200, 204, 301, 302)
    except Exception:
        return False

def agent_services_ready() -> bool:
    if not check_http_endpoint("http://127.0.0.1:8088/status", timeout=1.0) or not check_tcp_port(8765):
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

def supervise_agent(python_exec: str, on_ready=None):
    """Keep the agent and its critical HTTP/WebSocket services available."""
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
        if not first_launch:
            log_supervisor(f"Restart attempt {total_restarts + 1}: launching live_agent.py.")
        else:
            log_supervisor("Launching live_agent.py under process supervision.")
        first_launch = False

        try:
            proc = subprocess.Popen(
                [python_exec, "-u", os.path.join(WORKSPACE_DIR, "live_agent.py")],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            spawned_subprocesses.append(proc)
            threading.Thread(target=pipe_agent_output, args=(proc, "[AGENT CORE]"), daemon=True).start()
            started = time.monotonic()
            update_supervisor_status(state="STARTING", agent_pid=proc.pid, last_started_at=time.time(),
                                     last_failure=None, next_restart_at=None)
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
        next_restart = time.time() + delay
        update_supervisor_status(
            state="RESTART_WAIT", agent_pid=None, restart_count=total_restarts,
            consecutive_failures=policy.failures, last_exit_code=exit_code,
            last_failure=failure_reason or "Agent stopped unexpectedly",
            next_restart_at=next_restart,
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

def pipe_stdout_only(proc: subprocess.Popen, prefix: str):
    """Prints subprocess output to console without forwarding to HTTP endpoints."""
    for line in iter(proc.stdout.readline, b""):
        if shutdown_event.is_set():
            break
        text = line.decode("utf-8", errors="replace").rstrip()
        if text:
            try:
                print(f"{prefix} {text}")
            except Exception:
                pass

def pipe_agent_output(proc: subprocess.Popen, prefix: str):
    """Reads stdout lines from live_agent, prints to console, and forwards dialogue & status events."""
    import json
    def _forward_line(line_text: str):
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:8088/api/terminal_log",
                data=f'{{"text": {json.dumps(line_text)}}}'.encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=0.2)
        except Exception:
            pass

    dialogue_triggers = (
        "[YOU]:", "[AGENT]:", "[AGENT STREAMING]:", "[JARVIS]:",
        "[STATUS", "[HARDWARE]", "[WAKE WORD"
    )
    noise_patterns = (
        "POST /api", "GET /api", "HTTP/1.", "200 OK", "connection_lost"
    )

    for line in iter(proc.stdout.readline, b""):
        if shutdown_event.is_set():
            break
        text = line.decode("utf-8", errors="replace").rstrip()
        if text:
            try:
                print(f"{prefix} {text}")
            except Exception:
                pass
            if any(t in text for t in dialogue_triggers) and not any(n in text for n in noise_patterns):
                _forward_line(text)

def locate_browser_executable():
    """Finds available Google Chrome or Microsoft Edge executable path."""
    candidates = [
        # Chrome paths
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        shutil.which("chrome"),
        shutil.which("google-chrome"),
        # Edge paths
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        shutil.which("msedge"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None

def launch_kiosk_browser(url: str = "http://127.0.0.1:8000", kiosk: bool = True):
    """Launches Chrome or Edge pointing to the master dashboard with required flags."""
    browser_exe = locate_browser_executable()
    if not browser_exe:
        print("[WARNING] Chrome or Edge not found in standard paths. Please open http://127.0.0.1:8000 manually.")
        return None

    cmd = [
        browser_exe,
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
    ]
    if kiosk:
        cmd.append("--kiosk")
    cmd.append(url)

    print(f"[ORCHESTRATOR] Launching browser ({os.path.basename(browser_exe)})...")
    proc = subprocess.Popen(cmd)
    spawned_subprocesses.append(proc)
    return proc

def cleanup_all():
    """Cleanly terminates all child subprocesses, servers, and releases resources."""
    print("\n" + "=" * 60)
    print("[ORCHESTRATOR] Initiating clean teardown sequence...")
    print("=" * 60)
    shutdown_event.set()

    # 1. Terminate subprocesses
    for proc in spawned_subprocesses:
        try:
            if proc.poll() is None:
                proc.terminate()
        except Exception:
            pass

    # Wait up to 2 seconds for graceful exit
    time.sleep(0.5)
    for proc in spawned_subprocesses:
        try:
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass

    # 2. Shutdown HTTP servers
    for s in active_http_servers:
        try:
            s.shutdown()
        except Exception:
            pass

    # 3. Release lingering ports
    cleanup_ports()

    print("[ORCHESTRATOR] All services stopped. Shutdown complete.")

def main():
    parser = argparse.ArgumentParser(description="JARVIS Master Booth Orchestrator")
    parser.add_argument("--no-browser", action="store_true", help="Do not launch browser automatically")
    parser.add_argument("--no-kiosk", action="store_true", help="Launch browser in normal window mode rather than kiosk")
    args = parser.parse_args()

    # Register signal handlers for clean teardown
    signal.signal(signal.SIGINT, lambda sig, frame: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda sig, frame: sys.exit(0))

    print("\n" + "=" * 65)
    print("  JARVIS UNIFIED BOOTH ORCHESTRATOR (v2.0)")
    print("  • Master Dashboard Shell:    http://127.0.0.1:8000")
    print("  • Camera 1 Face Cam Server:  http://127.0.0.1:8088")
    print("  • Camera 2 AeroFinger HUD:   http://127.0.0.1:5173")
    print("  • Live Agent Telemetry Bridge: ws://127.0.0.1:8765")
    print("=" * 65 + "\n")

    # Pre-flight port cleanup
    print("[PRE-FLIGHT] Checking and freeing ports (8000, 8088, 8765, 8766, 5173)...")
    cleanup_ports()
    time.sleep(0.5)

    try:
        # 1. Start Static File Server for fofc_point/dist (Port 5173)
        print("[1/3] Starting AeroFinger Static HUD Server on port 5173...")
        start_fofc_server(port=5173)

        # 2. Start Master Shell Server (Port 8000)
        print("[2/3] Starting Master Dashboard Shell Server on port 8000...")
        start_master_shell_server(port=8000)

        # Prefer voice_env while testing, otherwise use the current interpreter.
        voice_py = os.path.join(WORKSPACE_DIR, "voice_env", "Scripts", "python.exe")
        python_exec = voice_py if os.path.exists(voice_py) else sys.executable

        print("\n[READY] Dashboard shell: http://127.0.0.1:8000")
        print("[READY] Pointing HUD: http://127.0.0.1:5173")
        print("[SUPERVISOR] Agent will restart automatically after crashes or critical service failures.")
        browser_ready_callback = None
        if not args.no_browser:
            browser_ready_callback = lambda: launch_kiosk_browser(
                "http://127.0.0.1:8000", kiosk=not args.no_kiosk
            )
        else:
            print("[INFO] --no-browser specified. Browser launch skipped.")
        supervise_agent(python_exec, on_ready=browser_ready_callback)

    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        cleanup_all()

if __name__ == "__main__":
    main()
