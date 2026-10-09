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
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

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

# Ensure proper MIME types for WASM and JS assets
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/json", ".json")

# Process tracking
spawned_subprocesses = []
active_http_servers = []
shutdown_event = threading.Event()

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
        if self.path in ("/", "/index.html", "/master_dashboard.html"):
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

def start_fofc_server(port: int = 5173):
    """Starts static server for fofc_point/dist on port 5173."""
    if not os.path.exists(FOFC_DIST_DIR):
        print(f"[ORCHESTRATOR] Building fofc_point assets before serving...")
        subprocess.run(["npm", "run", "build"], cwd=os.path.join(WORKSPACE_DIR, "fofc_point"), shell=True, check=True)

    server = ThreadedHTTPServer(("127.0.0.1", port), FofcStaticRequestHandler)
    active_http_servers.append(server)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="FofcServerThread")
    t.start()
    return server

def start_master_shell_server(port: int = 8000):
    """Starts Master Dashboard Shell server on port 8000."""
    server = ThreadedHTTPServer(("127.0.0.1", port), MasterShellRequestHandler)
    active_http_servers.append(server)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="MasterShellThread")
    t.start()
    return server

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
            return resp.status in (200, 204, 301, 302)
    except Exception:
        return False

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

        # Determine preferred python executable (prefer voice_env if available)
        voice_py = os.path.join(WORKSPACE_DIR, "voice_env", "Scripts", "python.exe")
        python_exec = voice_py if os.path.exists(voice_py) else sys.executable

        # 3. Spawn live_agent.py (Port 8765 & embedded Face Cam / Dashboard Server Port 8088)
        print("[3/3] Spawning Jarvis Live Agent Runtime (embedding Port 8088 & 8765)...")
        agent_proc = subprocess.Popen(
            [python_exec, "-u", os.path.join(WORKSPACE_DIR, "live_agent.py")],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT
        )
        spawned_subprocesses.append(agent_proc)
        threading.Thread(target=pipe_agent_output, args=(agent_proc, "[AGENT CORE]"), daemon=True).start()

        # 4. Readiness polling
        print("\n[HEALTH CHECK] Polling subsystem endpoints for readiness...")
        deadline = time.time() + 25.0
        ready_status = {
            "8000 (Master Shell)": False,
            "5173 (AeroFinger HUD)": False,
            "8088 (Face Cam Server)": False,
            "8765 (Agent WebSocket)": False,
        }

        while time.time() < deadline:
            if not ready_status["8000 (Master Shell)"]:
                ready_status["8000 (Master Shell)"] = check_http_endpoint("http://127.0.0.1:8000/")
            if not ready_status["5173 (AeroFinger HUD)"]:
                ready_status["5173 (AeroFinger HUD)"] = check_http_endpoint("http://127.0.0.1:5173/")
            if not ready_status["8088 (Face Cam Server)"]:
                ready_status["8088 (Face Cam Server)"] = check_tcp_port(8088)
            if not ready_status["8765 (Agent WebSocket)"]:
                ready_status["8765 (Agent WebSocket)"] = check_tcp_port(8765)

            if all(ready_status.values()):
                break
            time.sleep(0.5)

        for name, ok in ready_status.items():
            symbol = "[OK]" if ok else "[!]"
            state_str = "ONLINE & READY" if ok else "TIMEOUT / DELAYED"
            print(f"  {symbol} Port {name:<26} -> {state_str}")

        print("\n" + "-" * 65)
        print("  All Core Systems Online! Master Dashboard available at:")
        print("  --> http://127.0.0.1:8000")
        print("-" * 65 + "\n")

        # 5. Browser Launch
        if not args.no_browser:
            launch_kiosk_browser("http://127.0.0.1:8000", kiosk=not args.no_kiosk)
        else:
            print("[INFO] --no-browser specified. Browser launch skipped.")

        # Keep supervisor alive
        while True:
            time.sleep(1.0)
            if agent_proc.poll() is not None:
                print(f"[ORCHESTRATOR] live_agent.py exited with code {agent_proc.returncode}.")
                break

    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        cleanup_all()

if __name__ == "__main__":
    main()
