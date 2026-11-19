"""Sample projection server and renderer memory for a before/after comparison."""

import argparse
from contextlib import contextmanager
import csv
import json
from pathlib import Path
from statistics import median
import subprocess
import tempfile
import time
from urllib.request import urlopen

import psutil


MIB = 1024 * 1024
METRICS = ("rss", "uss", "pss", "private_commit")


def find_listener(port):
    pids = {
        connection.pid
        for connection in psutil.net_connections(kind="tcp")
        if connection.status == psutil.CONN_LISTEN
        and connection.laddr.port == port and connection.pid is not None
    }
    if len(pids) != 1:
        raise ValueError(f"Expected one server listening on port {port}; found {sorted(pids)}. "
                         "Start video-projection or supply --server-pid.")
    return pids.pop()


def process_tree(root):
    if not root.is_running():
        raise RuntimeError(f"Process {root.pid} exited during the capture.")
    return {process.pid: process for process in [root, *root.children(recursive=True)]}


def sample_tree(processes):
    totals = {metric: 0 for metric in METRICS}
    for process in processes.values():
        try:
            info = process.memory_full_info()
        except psutil.AccessDenied:
            try:
                info = process.memory_info()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                return {metric: None for metric in METRICS}
        except psutil.NoSuchProcess:
            continue
        metrics = {"rss": info.rss, "uss": getattr(info, "uss", None),
                   "pss": getattr(info, "pss", None), "private_commit": getattr(info, "private", None)}
        for metric, value in metrics.items():
            totals[metric] = None if totals[metric] is None or value is None else totals[metric] + value
    return {metric: round(value / MIB, 1) if value is not None else None for metric, value in totals.items()}


def take_sample(server, browser, start):
    server_tree = process_tree(server)
    browser_tree = process_tree(browser) if browser else {}
    # Electron can start the Node server as a child. Count each PID once.
    renderer_tree = {pid: proc for pid, proc in browser_tree.items() if pid not in server_tree}
    sample = {"elapsed_seconds": round(time.monotonic() - start, 1),
              "system_available_mib": round(psutil.virtual_memory().available / MIB, 1)}
    groups = {"server": server_tree}
    if browser:
        groups.update(renderer=renderer_tree, combined={**server_tree, **renderer_tree})
    for label, processes in groups.items():
        sample[f"{label}_processes"] = len(processes)
        sample.update({f"{label}_{key}_mib": value for key, value in sample_tree(processes).items()})
    return sample


@contextmanager
def isolated_chrome(executable, url):
    """Open a fresh headless Chrome and wait for the carousel page to settle."""
    from websockets.sync.client import connect

    with tempfile.TemporaryDirectory(prefix="projection-memory-") as profile:
        chrome = subprocess.Popen(
            [executable, "--headless", f"--user-data-dir={profile}", "--remote-debugging-port=0",
             "--no-first-run", "--no-default-browser-check", "--window-size=1920,1080",
             "--disable-background-timer-throttling", url],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        root = psutil.Process(chrome.pid)
        try:
            port_file = Path(profile) / "DevToolsActivePort"
            deadline = time.monotonic() + 90
            while not port_file.exists():
                if chrome.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("Headless Chrome did not start.")
                time.sleep(0.25)
            port = port_file.read_text().splitlines()[0]
            wait_for_carousel(port, url, connect, deadline)
            yield root
        finally:
            if root.is_running():
                processes = [*root.children(recursive=True), root]
                for process in processes:
                    try:
                        process.terminate()
                    except psutil.NoSuchProcess:
                        pass
                _, alive = psutil.wait_procs(processes, timeout=5)
                for process in alive:
                    process.kill()
                psutil.wait_procs(alive, timeout=5)
            chrome.wait(timeout=5)


def wait_for_carousel(port, url, connect, deadline):
    expression = r"""(() => {
      const resources = performance.getEntriesByType('resource');
      const models = resources.filter(e => /\.glb(?:[?#]|$)/i.test(e.name));
      const canvas = [...document.querySelectorAll('canvas')].find(c => c.dataset.engine?.startsWith('three.js'));
      const gl = canvas?.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {ready: document.readyState, title: document.title,
              models: models.length, modelErrors: models.filter(e => e.responseStatus >= 400).length,
              renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null};
    })()"""
    while time.monotonic() < deadline:
        with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5) as response:
            pages = json.load(response)
        page = next((page for page in pages if page.get("url") == url), None)
        if page:
            with connect(page["webSocketDebuggerUrl"], open_timeout=5) as client:
                client.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                                        "params": {"expression": expression, "returnByValue": True}}))
                state = json.loads(client.recv(timeout=5)).get("result", {}).get("result", {}).get("value", {})
                if state.get("ready") == "complete" and state.get("title"):
                    # Give model downloads and GPU uploads time to settle before sampling.
                    time.sleep(12)
                    client.send(json.dumps({"id": 2, "method": "Runtime.evaluate",
                                            "params": {"expression": expression, "returnByValue": True}}))
                    state = json.loads(client.recv(timeout=5))["result"]["result"]["value"]
                    print(f"Headless Chrome page: {state}", flush=True)
                    return
        time.sleep(0.5)
    raise RuntimeError(f"Headless Chrome did not finish loading {url}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--server-pid", type=int, help="Override port detection")
    browser_group = parser.add_mutually_exclusive_group()
    browser_group.add_argument("--browser-pid", type=int, help="Root PID of a dedicated browser or Electron instance")
    browser_group.add_argument("--chrome-exe", help="Launch a fresh headless Chrome and include its memory")
    parser.add_argument("--seconds", type=float, default=20)
    parser.add_argument("--interval", type=float, default=1)
    parser.add_argument("--label", default="baseline", help="Name to include in the output file")
    args = parser.parse_args()
    if args.seconds <= 0 or args.interval <= 0:
        parser.error("--seconds and --interval must be positive.")
    if not args.label or not all(char.isascii() and (char.isalnum() or char in "-_") for char in args.label):
        parser.error("--label must contain only ASCII letters, digits, hyphens or underscores.")

    try:
        server = psutil.Process(args.server_pid or find_listener(args.port))
        output = Path(__file__).resolve().parent / "runs" / (
            f"{time.strftime('%Y%m%d-%H%M%S')}-projection-{args.label}.csv"
        )
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.chrome_exe:
            with isolated_chrome(args.chrome_exe, f"http://127.0.0.1:{args.port}/") as browser:
                samples = capture(server, browser, args, output)
        else:
            browser = psutil.Process(args.browser_pid) if args.browser_pid else None
            samples = capture(server, browser, args, output)
    except (ValueError, RuntimeError, OSError, ImportError, psutil.Error) as exc:
        parser.exit(1, f"Capture failed: {exc}\n")

    for field in samples[0]:
        if not field.endswith("_mib"):
            continue
        values = [sample[field] for sample in samples if sample[field] is not None]
        if values:
            print(f"{field}: median {median(values):.1f}, peak {max(values):.1f}")
    print(f"Saved {len(samples)} samples to {output}")


def capture(server, browser, args, output):
    print(f"Server PID {server.pid}. " + (f"Browser root PID {browser.pid}." if browser
                                          else "Server-only capture; browser memory is excluded."), flush=True)
    start = time.monotonic()
    samples = [take_sample(server, browser, start)]
    with output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(samples[0]))
        writer.writeheader()
        writer.writerow(samples[0])
        while time.monotonic() - start < args.seconds:
            time.sleep(min(args.interval, max(0, args.seconds - (time.monotonic() - start))))
            sample = take_sample(server, browser, start)
            samples.append(sample)
            writer.writerow(sample)
            stream.flush()
    return samples


if __name__ == "__main__":
    main()
