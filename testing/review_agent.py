"""Review the real booth agent's spoken answers and pronunciations."""

import argparse
import json
import os
from pathlib import Path
from queue import Empty, Queue
import socket
import subprocess
import sys
import threading
import time
from urllib.request import Request, urlopen
import wave


TESTING = Path(__file__).resolve().parent
REPO = TESTING.parent


def read_cases(filename):
    return json.loads((TESTING / filename).read_text(encoding="utf-8"))


def wait_for_output(lines, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Timed out waiting for the agent.")
    try:
        line = lines.get(timeout=remaining)
    except Empty as exc:
        raise TimeoutError("Timed out waiting for the agent.") from exc
    if line is None:
        raise RuntimeError("The agent exited. See agent.log in the run folder.")
    return line


def collect_output(pipe, log, lines):
    with pipe:
        for line in pipe:
            log.write(line)
            log.flush()
            lines.put(line.rstrip())
    lines.put(None)


def ask(agent, lines, question, timeout):
    agent.stdin.write(question + "\n")
    agent.stdin.flush()
    deadline = time.monotonic() + timeout
    while f"[TYPED PROMPT]: {question}" not in wait_for_output(lines, deadline):
        pass
    chunks = []
    while True:
        line = wait_for_output(lines, deadline)
        if line.startswith(("[AGENT STREAMING]:", "[AGENT]:")):
            chunks.append(line.split(":", 1)[1].strip().strip('"'))
        elif "[BOOTH GATE] Ignored typed input" in line:
            return " ".join(chunks)
        elif "[READY - Speak, type next question" in line:
            return " ".join(chunks)


def run_questions(args, output):
    cases = read_cases("questions.json")
    if args.board:
        cases = [case for case in cases if case["board"].casefold() == args.board.casefold()]
        if not cases:
            raise ValueError(f"No questions found for board {args.board!r}. See questions.json.")

    for port in (8088, 8765, 8766):
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError(f"Port {port} is in use. Stop run_booth.py before the answer review.")
    projection = os.environ.get("VIDEO_PROJECTION_URL", "http://127.0.0.1:3000").rstrip("/")
    with urlopen(f"{projection}/api/products", timeout=5) as response:
        if not json.load(response):
            raise RuntimeError("The projection product catalog is empty.")

    platform = args.platform or ("windows" if os.name == "nt" else "ubuntu")
    agent_dir = REPO if platform == "windows" else REPO / "ubuntu_fofc"
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    lines = Queue()
    with (output / "agent.log").open("w", encoding="utf-8") as log:
        agent = subprocess.Popen(
            [sys.executable, "-u", str(agent_dir / "live_agent.py")],
            cwd=agent_dir, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
        )
        reader = threading.Thread(target=collect_output, args=(agent.stdout, log, lines), daemon=True)
        reader.start()
        try:
            print(f"Starting the {platform} agent. Startup log: {output / 'agent.log'}", flush=True)
            deadline = time.monotonic() + args.startup_timeout
            while "Waiting for recognized user arrival, speech, or typed text" not in wait_for_output(lines, deadline):
                pass
            with (output / "answers.jsonl").open("w", encoding="utf-8") as report:
                for number, case in enumerate(cases, 1):
                    print(f"\n[{number}/{len(cases)}] {case['board']} | {case['question']}", flush=True)
                    answer = ask(agent, lines, case["question"], args.timeout)
                    expected_silence = case.get("expect_silence", False)
                    if expected_silence:
                        result = "silence_pass" if not answer else "unexpected_answer"
                    else:
                        result = "needs_review" if answer else "unexpected_silence"
                    row = {**case, "answer": answer, "result": result}
                    report.write(json.dumps(row, ensure_ascii=False) + "\n")
                    report.flush()
                    print(answer or "(silence)")
                    print(f"Review: {case['review']}")
                    if args.step and number < len(cases):
                        input("Press Enter for the next question. ")
        finally:
            if agent.poll() is None:
                agent.terminate()
                try:
                    agent.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    agent.kill()
                    agent.wait()
            agent.stdin.close()
            reader.join()


def play_wav(path):
    import sounddevice as sd

    with wave.open(str(path), "rb") as audio:
        with sd.RawOutputStream(samplerate=audio.getframerate(), channels=audio.getnchannels(), dtype="int16") as speaker:
            while block := audio.readframes(4096):
                speaker.write(block)


def run_pronunciation(args, output):
    cases = read_cases("pronunciations.json")
    if args.term:
        cases = [case for case in cases if case["label"].casefold() == args.term.casefold()]
        if not cases:
            raise ValueError(f"No pronunciation case named {args.term!r}. See pronunciations.json.")
    for case in cases:
        request = Request(
            f"{args.agent_url.rstrip('/')}/api/tts_preview",
            data=json.dumps({"text": case["text"]}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        destination = output / f"{case['label']}.wav"
        with urlopen(request, timeout=60) as response:
            destination.write_bytes(response.read())
        print(f"\n{case['label']} | {case['text']}", flush=True)
        if not args.save_only:
            play_wav(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="mode", required=True)
    questions = commands.add_parser("questions", help="Start the agent and review its answers")
    questions.add_argument("--platform", choices=("windows", "ubuntu"))
    questions.add_argument("--board", help="Run one board by its catalog name")
    questions.add_argument("--step", action="store_true", help="Wait for Enter between questions")
    questions.add_argument("--startup-timeout", type=float, default=240)
    questions.add_argument("--timeout", type=float, default=90, help="Seconds allowed per answer")
    pronunciation = commands.add_parser("pronunciation", help="Render fixed samples using a running agent")
    pronunciation.add_argument("--agent-url", default="http://127.0.0.1:8088")
    pronunciation.add_argument("--term", help="Run one case by its label, such as atg")
    pronunciation.add_argument("--save-only", action="store_true", help="Save WAV files without playing them")
    args = parser.parse_args()
    output = TESTING / "runs" / f"{time.strftime('%Y%m%d-%H%M%S')}-{args.mode}-{os.getpid()}"
    output.mkdir(parents=True)
    try:
        if args.mode == "questions":
            run_questions(args, output)
        else:
            run_pronunciation(args, output)
    except (OSError, RuntimeError, ValueError, ImportError) as exc:
        parser.exit(1, f"Review failed: {exc}\nRun folder: {output}\n")
    print(f"\nSaved results to {output}")


if __name__ == "__main__":
    main()
