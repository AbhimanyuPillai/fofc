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
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


ROOT = os.path.dirname(os.path.abspath(__file__))
POINT_DIR = os.path.join(ROOT, "fofc_point")
POINT_DIST = os.path.join(POINT_DIR, "dist")
POINT_INDEX = os.path.join(POINT_DIST, "index.html")
shutdown_event = threading.Event()
servers = []
processes = []


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
        if self.path in ("/", "/index.html", "/master_dashboard.html"):
            path = os.path.join(ROOT, "master_dashboard.html")
            with open(path, "rb") as html_file:
                body = html_file.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
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
            return 200 <= response.status < 400
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
    print(f"[ORCHESTRATOR] {label} listening on http://127.0.0.1:{port}")


def pipe_agent_output(proc):
    for line in iter(proc.stdout.readline, ""):
        if line:
            print(f"[AGENT CORE] {line.rstrip()}")


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

        agent = subprocess.Popen(
            [sys.executable, "-u", os.path.join(ROOT, "live_agent.py")],
            cwd=ROOT,
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        processes.append(agent)
        threading.Thread(target=pipe_agent_output, args=(agent,), daemon=True, name="AgentLogReader").start()

        print("[ORCHESTRATOR] Waiting for agent camera and pointing services...")
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline and not shutdown_event.is_set():
            if agent.poll() is not None:
                raise RuntimeError(f"Agent exited during startup (code {agent.returncode}).")
            if all(port_is_open(port) for port in (8088, 8765)):
                print("[ORCHESTRATOR] Agent services are accepting connections.")
                break
            time.sleep(1)
        else:
            if not shutdown_event.is_set():
                print("[WARNING] Timed out waiting for agent service ports; inspect the agent log above.")

        print("[READY] Dashboard: http://127.0.0.1:8000")
        print("[READY] Face/admin API: http://127.0.0.1:8088")
        print("[READY] Pointing HUD: http://127.0.0.1:5173")
        print("[READY] Projection app remains externally managed at " + os.environ["VIDEO_PROJECTION_URL"])
        if not args.no_browser:
            launch_browser(kiosk=not args.no_kiosk)

        while not shutdown_event.wait(1):
            if agent.poll() is not None:
                raise RuntimeError(f"Agent stopped (code {agent.returncode}).")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
