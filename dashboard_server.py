import os
import sys
import json
import time
import queue
import threading
import asyncio
import collections
from typing import Optional, List
import requests
import uvicorn
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

# Import existing vision app (Camera 1 YuNet + SFace recognition engine & presence tracker)
try:
    from jarvis_vision.dashboard import app
except ImportError:
    # If running from inside jarvis_vision directory
    from dashboard import app

# Global state
_current_state = "SLEEPING"
_current_focus_board: Optional[str] = None
_subscribers_lock = threading.Lock()
_subscribers: List[queue.Queue] = []
_terminal_history_lock = threading.Lock()
_terminal_history = collections.deque(maxlen=150)
_is_server_active = False
_server_thread: Optional[threading.Thread] = None

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

def _dispatch_remote_event(ev_dict: dict):
    """If running in client process (e.g. live_agent.py subprocess), dispatch event to dashboard server."""
    def _post():
        try:
            requests.post("http://127.0.0.1:8088/api/event", json=ev_dict, timeout=0.2)
        except Exception:
            pass
    threading.Thread(target=_post, daemon=True).start()

def set_state(new_state: str):
    """Updates current agent state and notifies dashboard clients."""
    global _current_state
    _current_state = new_state
    ev = {"type": "state", "state": new_state, "timestamp": time.time()}
    _broadcast_event(ev)
    if not _is_server_active:
        _dispatch_remote_event(ev)

def set_hardware_focus(board: Optional[str]):
    """Highlights active hardware card on dashboard ('esp32', 'jetson', 'stm32', 'arduino', or None)."""
    global _current_focus_board
    _current_focus_board = board
    ev = {"type": "focus", "board": board, "timestamp": time.time()}
    _broadcast_event(ev)
    if not _is_server_active:
        _dispatch_remote_event(ev)

def broadcast_transcript(role: str, text: str):
    """Adds a full message to the dashboard live transcript."""
    ev = {"type": "transcript", "role": role, "text": text, "timestamp": time.time()}
    _broadcast_event(ev)
    with _terminal_history_lock:
        _terminal_history.append(ev)
    if not _is_server_active:
        _dispatch_remote_event(ev)

def broadcast_stream_chunk(role: str, chunk: str):
    """Streams a sentence/token chunk to the active agent bubble on the dashboard."""
    ev = {"type": "stream_chunk", "role": role, "chunk": chunk, "timestamp": time.time()}
    _broadcast_event(ev)
    if not _is_server_active:
        _dispatch_remote_event(ev)

import logging
# Silence uvicorn access logging and HTTP request noise
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("uvicorn.error").setLevel(logging.WARNING)

def log_terminal(line: str):
    """Filters noisy logs and pushes dialogue and status events to SSE."""
    if not line or not line.strip():
        return
    text = line.strip()

    # Reject HTTP status codes, socket handshakes, and POST notices
    noise_patterns = (
        "POST /api", "GET /api", "GET /", "OPTIONS /", "HTTP/1.", "200 OK", "404 Not Found",
        "terminal_log", "recognize_frame", "presence_state", "WebSocket", "connection_lost",
        "INFO:", "DEBUG:", "WARNING:", "heartbeat", "multipart/form-data", "piping", "Uvicorn running"
    )
    if any(n in text for n in noise_patterns) and not any(k in text for k in ("[YOU]:", "[AGENT]:", "[JARVIS]:", "[STATUS", "[HARDWARE]", "[FOCUS]", "[WAKE WORD")):
        return

    # Normalize to dialogue or status event
    if text.startswith("[YOU]:"):
        ev = {"type": "transcript", "role": "USER", "text": text[6:].strip(), "timestamp": time.time()}
    elif text.startswith("[AGENT]:") or text.startswith("[JARVIS]:") or text.startswith("[AGENT STREAMING]:"):
        content = text.split("]:", 1)[1].strip().strip('"')
        ev = {"type": "transcript", "role": "JARVIS", "text": content, "timestamp": time.time()}
    elif "[STATUS:" in text or text.startswith("[STATUS]"):
        ev = {"type": "status", "text": text, "timestamp": time.time()}
    elif "[HARDWARE]" in text or "[FOCUS]" in text:
        extracted = None
        if "to:" in text:
            extracted = text.split("to:", 1)[1].strip()
        elif ":" in text:
            extracted = text.split(":", 1)[1].strip()
        if extracted:
            _current_focus_board = extracted
        ev = {"type": "focus", "text": text, "board": extracted, "timestamp": time.time()}
    elif "[WAKE WORD" in text:
        ev = {"type": "status", "text": text, "timestamp": time.time()}
    else:
        ev = {"type": "log", "text": text, "timestamp": time.time()}

    with _terminal_history_lock:
        _terminal_history.append(ev)
    _broadcast_event(ev)
    if not _is_server_active:
        _dispatch_remote_event(ev)

# ==========================================
# FASTAPI ENDPOINTS
# ==========================================

class TerminalLogPayload(BaseModel):
    text: str

@app.post("/api/terminal_log")
async def post_terminal_log(payload: TerminalLogPayload):
    log_terminal(payload.text)
    return {"status": "ok"}

@app.post("/api/event")
async def post_event(payload: dict):
    ev_type = payload.get("type")
    if ev_type == "state":
        global _current_state
        _current_state = payload.get("state", "SLEEPING")
        _broadcast_event(payload)
    elif ev_type == "focus":
        global _current_focus_board
        _current_focus_board = payload.get("board")
        _broadcast_event(payload)
    elif ev_type == "transcript":
        with _terminal_history_lock:
            _terminal_history.append(payload)
        _broadcast_event(payload)
    elif ev_type == "stream_chunk":
        _broadcast_event(payload)
    elif ev_type == "log":
        with _terminal_history_lock:
            _terminal_history.append(payload)
        _broadcast_event(payload)
    return {"status": "ok"}

@app.get("/status")
async def get_dashboard_status():
    return {
        "state": _current_state,
        "focus_board": _current_focus_board,
        "timestamp": time.time()
    }

@app.get("/terminal_stream")
async def get_terminal_stream():
    """Real-time SSE stream piping terminal logs, transcriptions, and state transitions."""
    async def event_generator():
        client_q = queue.Queue(maxsize=200)
        with _subscribers_lock:
            _subscribers.append(client_q)

        # Initial state payload
        yield f"data: {json.dumps({'type': 'state', 'state': _current_state})}\n\n"
        yield f"data: {json.dumps({'type': 'focus', 'board': _current_focus_board})}\n\n"

        # Replay recent history
        with _terminal_history_lock:
            history_snapshot = list(_terminal_history)
        for item in history_snapshot:
            yield f"data: {json.dumps(item)}\n\n"

        try:
            while True:
                try:
                    # Non-blocking async queue extraction
                    ev = await asyncio.get_event_loop().run_in_executor(None, lambda: client_q.get(timeout=10.0))
                    yield f"data: {json.dumps(ev)}\n\n"
                except queue.Empty:
                    # Keep-alive heartbeat
                    yield ": ping\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            with _subscribers_lock:
                if client_q in _subscribers:
                    _subscribers.remove(client_q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )

@app.get("/events")
async def get_events_compat():
    """Backwards-compatibility route for /events."""
    return await get_terminal_stream()

def start_dashboard_server(host: str = "0.0.0.0", port: int = 8088):
    """Starts the unified dashboard server in a background daemon thread."""
    global _is_server_active, _server_thread
    _is_server_active = True

    def _run():
        try:
            config = uvicorn.Config(app, host=host, port=port, log_level="warning", access_log=False)
            server = uvicorn.Server(config)
            print(f"[DASHBOARD] Unified Face Cam & Terminal Server active at http://{host}:{port}")
            server.run()
        except Exception as e:
            print(f"[DASHBOARD NOTICE] Port {port} binding message: {e}")

    _server_thread = threading.Thread(target=_run, daemon=True, name="DashboardServerThread")
    _server_thread.start()
    return _server_thread

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Unified Face Cam & Terminal Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface")
    parser.add_argument("--port", type=int, default=8088, help="Port to bind (default: 8088)")
    args = parser.parse_args()

    _is_server_active = True
    print(f"[DASHBOARD] Starting standalone Face Cam & Terminal Server on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning", access_log=False)
