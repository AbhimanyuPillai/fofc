import os
import json
import time
import queue
import threading
from typing import Optional, List
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Global state
_current_state = "SLEEPING"
_current_focus_board: Optional[str] = None
_subscribers_lock = threading.Lock()
_subscribers: List[queue.Queue] = []
_server_instance: Optional[HTTPServer] = None

HTML_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")

def _broadcast_event(event_dict: dict):
    """Pushes an event payload to all connected SSE clients."""
    with _subscribers_lock:
        stale = []
        for q in _subscribers:
            try:
                q.put_nowait(event_dict)
            except Exception:
                stale.append(q)
        for s in stale:
            if s in _subscribers:
                _subscribers.remove(s)

def set_state(new_state: str):
    """Updates current agent state and notifies dashboard clients."""
    global _current_state
    _current_state = new_state
    _broadcast_event({"type": "state", "state": new_state})

def set_hardware_focus(board: Optional[str]):
    """Highlights active hardware card on dashboard ('esp32', 'jetson', 'stm32', 'arduino', or None)."""
    global _current_focus_board
    _current_focus_board = board
    _broadcast_event({"type": "focus", "board": board})

def broadcast_transcript(role: str, text: str):
    """Adds a full message to the dashboard live transcript."""
    _broadcast_event({"type": "transcript", "role": role, "text": text})

def broadcast_stream_chunk(role: str, chunk: str):
    """Streams a sentence/token chunk to the active agent bubble on the dashboard."""
    _broadcast_event({"type": "stream_chunk", "role": role, "chunk": chunk})

class DashboardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress noisy HTTP request logging in console
        return

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._serve_index()
        elif self.path == "/events":
            self._serve_events()
        elif self.path == "/status":
            self._serve_status()
        else:
            self.send_error(404, "Not Found")

    def _serve_index(self):
        if os.path.exists(HTML_FILE_PATH):
            with open(HTML_FILE_PATH, "r", encoding="utf-8") as f:
                content = f.read().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Dashboard index.html not found.")

    def _serve_status(self):
        data = {
            "state": _current_state,
            "focus_board": _current_focus_board,
            "timestamp": time.time()
        }
        encoded = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _serve_events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        client_queue = queue.Queue(maxsize=100)
        with _subscribers_lock:
            _subscribers.append(client_queue)

        # Send initial state snapshot immediately
        initial_events = [
            {"type": "state", "state": _current_state},
            {"type": "focus", "board": _current_focus_board}
        ]
        for ev in initial_events:
            client_queue.put(ev)

        try:
            while True:
                try:
                    event_data = client_queue.get(timeout=15.0)
                    msg = f"data: {json.dumps(event_data)}\n\n".encode("utf-8")
                    self.wfile.write(msg)
                    self.wfile.flush()
                except queue.Empty:
                    # Keep-alive heartbeat ping
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with _subscribers_lock:
                if client_queue in _subscribers:
                    _subscribers.remove(client_queue)

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

def start_dashboard_server(host: str = "0.0.0.0", port: int = 8080):
    """Starts the dashboard server in a background daemon thread."""
    global _server_instance

    def _run():
        global _server_instance
        try:
            _server_instance = ThreadedHTTPServer((host, port), DashboardHandler)
            print(f"[DASHBOARD] Live visual dashboard active at http://localhost:{port}")
            _server_instance.serve_forever()
        except Exception as e:
            print(f"[DASHBOARD ERROR] Failed to start server: {e}")

    t = threading.Thread(target=_run, daemon=True, name="DashboardServerThread")
    t.start()
    return t
