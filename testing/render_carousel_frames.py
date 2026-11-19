"""Render transparent carousel WebPs directly from a GLB using local Three.js."""

import argparse
import base64
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from itertools import count
import json
import math
from pathlib import Path
from shutil import copyfileobj
import subprocess
import tempfile
from threading import Thread
import time
from urllib.parse import urlsplit
from urllib.request import urlopen

from PIL import Image
from websockets.sync.client import connect


TESTING = Path(__file__).resolve().parent
THREE = TESTING.parent / "video-projection" / "node_modules" / "three"


class RenderFiles(BaseHTTPRequestHandler):
    def __init__(self, *args, model, **kwargs):
        self.model = model
        super().__init__(*args, **kwargs)

    def do_GET(self):
        route = urlsplit(self.path).path
        mime = "application/octet-stream"
        if route == "/":
            path, mime = TESTING / "render_carousel_frames.html", "text/html"
        elif route == "/model.glb":
            path = self.model
        elif route.startswith("/three/"):
            path = (THREE / route.removeprefix("/three/")).resolve()
            if not path.is_relative_to(THREE.resolve()):
                self.send_error(404)
                return
            mime = {".js": "text/javascript", ".wasm": "application/wasm"}.get(path.suffix, mime)
        else:
            self.send_error(404)
            return
        if not path.is_file():
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(path.stat().st_size))
        self.end_headers()
        with path.open("rb") as stream:
            copyfileobj(stream, self.wfile)

    def log_message(self, *_):
        pass


def camera_turn(orbit, radius, distance):
    sightline = math.atan2(-radius * math.sin(orbit), distance - radius * math.cos(orbit))
    return orbit - sightline


def orbit_at_turn(angle, radius, distance):
    target = math.radians(angle)
    low, high = 0.0, math.tau
    for _ in range(45):
        middle = (low + high) / 2
        if camera_turn(middle, radius, distance) < target:
            low = middle
        else:
            high = middle
    return (low + high) / 2


def render(args, client):
    request_ids = count(1)

    def evaluate(expression):
        identifier = next(request_ids)
        client.send(json.dumps({"id": identifier, "method": "Runtime.evaluate", "params": {
            "expression": expression, "awaitPromise": True, "returnByValue": True,
        }}))
        while True:
            message = json.loads(client.recv(timeout=60))
            if message.get("id") == identifier:
                result = message["result"]
                if "exceptionDetails" in result:
                    raise RuntimeError(result["result"].get("description", "GLB render failed."))
                return result["result"].get("value")

    deadline = time.monotonic() + 30
    while not evaluate("typeof window.prepareFrames === 'function'"):
        if time.monotonic() >= deadline:
            raise RuntimeError("Three.js render page did not initialize.")
        time.sleep(0.25)
    settings = {"size": args.size, "modelScale": 5, "radius": args.ring_radius,
                "cameraZ": args.camera_distance, "cameraY": 30}
    settings["frameWidth"] = evaluate(f"window.prepareFrames({json.dumps(settings)})")
    turns = {round(360 * i / args.count, 4) for i in range(args.count)}
    for slot in range(args.slots):
        orbit = math.tau * slot / args.slots
        turns.add(round(math.degrees(camera_turn(orbit, args.ring_radius, args.camera_distance)), 4))
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {"width": settings["frameWidth"], "frames": []}
    for index, turn in enumerate(sorted(turns)):
        settings["orbit"] = orbit_at_turn(turn, args.ring_radius, args.camera_distance)
        png = evaluate(f"window.renderFrame({json.dumps(settings)})")
        filename = f"angle-{index:02d}.webp"
        with Image.open(BytesIO(base64.b64decode(png))) as frame:
            alpha = frame.getchannel("A")
            if not alpha.getbbox() or alpha.getextrema()[0] == 255:
                raise RuntimeError(f"Frame {index} is empty or lacks transparency.")
            frame.save(args.output / filename, format="WEBP", quality=94, method=6)
        # Runtime looks up the camera bearing. The orbit turn has the opposite sign.
        manifest["frames"].append({"angle": round(-turn % 360, 4), "file": filename})
    (args.output / "frames.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered {len(manifest['frames'])} transparent {args.size} × {args.size} WebPs to {args.output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--chrome-exe", required=True)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--slots", type=int, default=10)
    parser.add_argument("--count", type=int, default=24)
    parser.add_argument("--ring-radius", type=float, default=300)
    parser.add_argument("--camera-distance", type=float, default=400)
    args = parser.parse_args()
    if not args.model.is_file() or not (THREE / "build/three.module.js").is_file():
        parser.error("Provide a GLB and install video-projection dependencies first.")
    if min(args.size, args.slots, args.count) <= 0 or not 0 < args.ring_radius < args.camera_distance:
        parser.error("Use positive dimensions and a camera distance larger than the ring radius.")
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(RenderFiles, model=args.model)) as server:
        url = f"http://127.0.0.1:{server.server_port}/"
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with tempfile.TemporaryDirectory(prefix="carousel-render-", ignore_cleanup_errors=True) as profile:
                chrome = subprocess.Popen(
                    [args.chrome_exe, "--headless", f"--user-data-dir={profile}", "--remote-debugging-port=0",
                     "--no-first-run", "--no-default-browser-check", url],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                try:
                    port_file = Path(profile) / "DevToolsActivePort"
                    deadline = time.monotonic() + 30
                    while not port_file.exists():
                        if chrome.poll() is not None or time.monotonic() >= deadline:
                            raise RuntimeError("Chrome did not expose its debugging port.")
                        time.sleep(0.2)
                    port = port_file.read_text().splitlines()[0]
                    with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5) as response:
                        pages = json.load(response)
                    page = next(page for page in pages if page["type"] == "page")
                    with connect(page["webSocketDebuggerUrl"], max_size=None, open_timeout=5) as client:
                        render(args, client)
                        try:
                            client.send(json.dumps({"id": 1, "method": "Browser.close"}))
                            chrome.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            pass
                finally:
                    if chrome.poll() is None:
                        chrome.terminate()
                        chrome.wait(timeout=10)
        finally:
            server.shutdown()
            worker.join()


if __name__ == "__main__":
    main()
