import os
import sys
import time
import queue
import re
import json
import threading
import subprocess
import collections
import asyncio
import websockets
import requests
import numpy as np
import sounddevice as sd
import torch
from typing import Optional, Dict, Any
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from faster_whisper import WhisperModel
import audio_feedback
import dashboard_server

# Platform-specific eSpeak NG setup for Kokoro
if sys.platform.startswith("win"):
    ESPEAK_PATH = r"C:\Program Files\eSpeak NG"
    if os.path.exists(ESPEAK_PATH) and ESPEAK_PATH not in os.environ.get("PATH", ""):
        os.environ["PATH"] += os.pathsep + ESPEAK_PATH
        os.environ["PHONEMIZER_ESPEAK_PATH"] = ESPEAK_PATH

    torch_lib = os.path.join(sys.prefix, "Lib", "site-packages", "torch", "lib")
    if os.path.exists(torch_lib):
        os.environ["PATH"] = torch_lib + os.pathsep + os.environ.get("PATH", "")
        if hasattr(os, "add_dll_directory"):
            try:
                os.add_dll_directory(torch_lib)
            except Exception:
                pass

from kokoro import KPipeline

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# ==========================================
# CONFIGURATION & CONSTANTS
# ==========================================
ACTIVE_VOICE = "af_sarah"  # Expressive, natural conversational female voice
VOICE_SPEED = 1.08         # Pacing optimized for breath pauses and sentence-ending inflections
INSTRUCTIONS_FILE = "agent_instructions.md"
INACTIVITY_TIMEOUT = 180.0

SAMPLE_RATE = 16000
CHUNK_SIZE = 512          # 32ms frames (Silero VAD requirement)

def get_realtek_mic_index() -> Optional[int]:
    """
    Resolves the input device index for 'Microphone Array (Realtek HD Audio Mic input)'.
    Checks device index 24 first. If not at 24, dynamically queries for Realtek Microphone Array,
    strictly excluding 'Stereo Mix' and 'video' / 'webcam' inputs.
    """
    try:
        devices = sd.query_devices()
        total = len(devices)

        # 1. Check preferred device index 24 first
        if 24 < total:
            d24 = devices[24]
            name_24 = d24.get("name", "").lower()
            if d24.get("max_input_channels", 0) > 0 and ("microphone array" in name_24 or "realtek" in name_24):
                if "stereo mix" not in name_24 and "video" not in name_24 and "webcam" not in name_24:
                    # Test if WDM-KS device 24 supports SAMPLE_RATE directly
                    try:
                        sd.check_input_settings(device=24, samplerate=SAMPLE_RATE, channels=1)
                        return 24
                    except Exception:
                        pass

        # 2. Dynamically query for matching 'microphone array' and 'realtek', strictly excluding stereo mix / video / webcam
        for idx, dev in enumerate(devices):
            if dev.get("max_input_channels", 0) <= 0:
                continue
            name = dev.get("name", "").lower()
            if "stereo mix" in name or "video" in name or "webcam" in name:
                continue
            if "microphone array" in name and "realtek" in name:
                try:
                    sd.check_input_settings(device=idx, samplerate=SAMPLE_RATE, channels=1)
                    return idx
                except Exception:
                    continue

        # 3. Direct index 24 fallback if query didn't find resampled alternative
        if 24 < total:
            d24 = devices[24]
            name_24 = d24.get("name", "").lower()
            if d24.get("max_input_channels", 0) > 0 and ("microphone array" in name_24 or "realtek" in name_24):
                return 24

    except Exception as e:
        print(f"[AUDIO DEVICE QUERY ERROR]: {e}")

    return None

# ==========================================
# AUTO-START OLLAMA SERVICE
# ==========================================
def ensure_ollama_running():
    url = "http://127.0.0.1:11434/"
    try:
        r = requests.get(url, timeout=1.0)
        if r.status_code == 200:
            print("[OLLAMA] Server is already active.")
            return
    except requests.exceptions.RequestException:
        pass

    print("[OLLAMA] Server not detected. Spawning 'ollama serve' in background...")

    if sys.platform.startswith("win"):
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=0x08000000
        )
    else:
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )

    for _ in range(20):
        time.sleep(0.5)
        try:
            r = requests.get(url, timeout=1.0)
            if r.status_code == 200:
                print("[OLLAMA] Server successfully started and responding.")
                return
        except requests.exceptions.RequestException:
            continue

    print("[WARNING] Could not confirm Ollama startup within 10s. Continuing anyway...")

def load_system_prompt(path: str) -> str:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Missing instruction file '{path}'.")
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()

print("\n" + "=" * 60)
print(f"[INIT] Booting Noise-Hardened Hardware Agent ({sys.platform})...")
print("=" * 60)

ensure_ollama_running()
system_prompt = load_system_prompt(INSTRUCTIONS_FILE)
dialog_turns = []

def check_hey_repos_wake(text: str) -> bool:
    """
    Triggers ONLY when 'hey' (or phonetic variants) is directly followed
    by 'repos' / 'repose' / variants.
    Ignores trailing punctuation, capitalization, and unrelated mentions.
    """
    if not text:
        return False

    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    words = cleaned.split()

    hey_variants = {"hey", "hay", "ay"}
    repos_variants = {"repos", "repose", "reposes", "raypos", "repo", "ripples", "rappos"}

    for i in range(len(words) - 1):
        if words[i] in hey_variants and words[i + 1] in repos_variants:
            return True

    # Fallback for concatenated token outputs (e.g., "heyrepos")
    if re.search(r"\b(hey|hay)(repos|repose|repo)\b", "".join(words)):
        return True

    return False

# ==========================================
# MODEL INITIALIZATION
# ==========================================
print("[1/2] Loading Speech-to-Text (Faster-Whisper small.en on GPU)...")
whisper_device = "cuda" if torch.cuda.is_available() else "cpu"
whisper_compute = "float16" if torch.cuda.is_available() else "int8"

stt_model = WhisperModel(
    "small.en",
    device=whisper_device,
    compute_type=whisper_compute,
    download_root=os.path.join(os.path.expanduser("~"), ".cache", "whisper")
)

vad_model, utils = torch.hub.load(
    repo_or_dir="snakers4/silero-vad",
    model="silero_vad",
    onnx=False
)
(get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils

# Force CUDA Provider for Kokoro / ONNX
import onnxruntime as ort
providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
session = None
try:
    onnx_sample = os.path.join(os.path.dirname(__file__), "archive", "Hey_Repos.onnx")
    if os.path.exists(onnx_sample):
        session = ort.InferenceSession(onnx_sample, providers=providers)
        print(f"[TTS GPU CHECK]: Kokoro active providers: {session.get_providers()}")
    else:
        avail = [p for p in providers if p in ort.get_available_providers()]
        print(f"[TTS GPU CHECK]: Kokoro active providers: {avail}")
except Exception as e:
    avail = [p for p in providers if p in ort.get_available_providers()]
    print(f"[TTS GPU CHECK]: Kokoro active providers: {avail}")

print("[2/2] Loading Conversational Voice Model (Kokoro)...")
tts_pipeline = KPipeline(lang_code="a", device="cuda" if torch.cuda.is_available() else "cpu")

audio_queue = queue.Queue()
text_input_queue = queue.Queue()
tts_text_queue = queue.Queue()
playback_queue = queue.Queue()
is_audio_playing = False

is_agent_speaking = False
interrupt_requested = False

# ==========================================
# AEROFINGER POINTING WEBSOCKET BRIDGE
# ==========================================
current_pointed_board = None
pointed_board_lock = threading.Lock()

async def pointing_ws_handler(websocket):
    global current_pointed_board
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "POINTING_UPDATE":
                    new_board = data.get("board")
                    if new_board is not None and str(new_board).strip():
                        board_str = str(new_board).strip()
                        with pointed_board_lock:
                            current_pointed_board = board_str
                        print(f"[HARDWARE] Latched active board to: {board_str}")
                        if "dashboard_server" in globals() and hasattr(dashboard_server, "set_hardware_focus"):
                            dashboard_server.set_hardware_focus(board_str)
                    # When board is None (hand pulled back), DO NOT reset; preserve latched state
            except Exception:
                pass
    except Exception:
        pass

def start_pointing_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    async def _serve():
        async with websockets.serve(pointing_ws_handler, "127.0.0.1", 8765):
            print("[FOFC POINTING BRIDGE] WebSocket server online at ws://127.0.0.1:8765")
            await asyncio.Future()

    try:
        loop.run_until_complete(_serve())
    except Exception as e:
        print(f"[FOFC POINTING BRIDGE ERROR]: {e}")

threading.Thread(target=start_pointing_server, daemon=True, name="AeroFingerPointingWSServer").start()

from scipy.signal import butter, sosfilt

# ----------------------------------------------------
# 1. BANDPASS FILTER FOR VOCAL TRACT (300 Hz - 3400 Hz)
# ----------------------------------------------------
# Discards low-end thumps/vibrations (<300Hz) & high-end hiss/clicks (>3400Hz)
SOS_BANDPASS = butter(4, [300, 3400], btype='bandpass', fs=SAMPLE_RATE, output='sos')

vad_iterator = None

# Interruption tracking state
consecutive_speech_frames = 0
# 5 frames * 32ms (CHUNK_SIZE 512 / 16000) = 160ms of sustained speech required
INTERRUPT_FRAME_REQUIREMENT = 5  

def is_vocal_energy_present(indata: np.ndarray) -> bool:
    """Calculates RMS energy strictly within human vocal frequencies."""
    filtered_audio = sosfilt(SOS_BANDPASS, indata.flatten())
    vocal_rms = float(np.sqrt(np.mean(filtered_audio**2)))
    # Vocal energy must stand out above typical background rumble
    return vocal_rms > 0.045

def audio_callback(indata, frames, time_info, status):
    global interrupt_requested, is_agent_speaking, consecutive_speech_frames

    audio_frame = indata.copy()
    audio_queue.put(audio_frame)

    if is_agent_speaking:
        # Check 1: Is there strong vocal-band energy?
        if is_vocal_energy_present(audio_frame):
            # Check 2: Run through Silero VAD tensor (neural vocal chord check)
            audio_tensor = torch.from_numpy(audio_frame.squeeze())
            with torch.no_grad():
                speech_prob = vad_model(audio_tensor, SAMPLE_RATE).item()

            # Requires high neural speech confidence (> 0.65)
            if speech_prob > 0.65:
                consecutive_speech_frames += 1
            else:
                consecutive_speech_frames = max(0, consecutive_speech_frames - 1)
        else:
            consecutive_speech_frames = max(0, consecutive_speech_frames - 1)

        # Only interrupt if speech was sustained across 5 consecutive frames (~160ms)
        if consecutive_speech_frames >= INTERRUPT_FRAME_REQUIREMENT:
            print("\n[VOICE INTERRUPT DETECTED: Speech barge-in confirmed]")
            interrupt_requested = True
            player.clear()
            consecutive_speech_frames = 0
    else:
        consecutive_speech_frames = 0

# Decoupled Audio Playback Worker
def audio_player_worker():
    global is_audio_playing, interrupt_requested
    while True:
        chunk = playback_queue.get()
        if chunk is None:
            playback_queue.task_done()
            break
        try:
            if not interrupt_requested:
                is_audio_playing = True
                if isinstance(chunk, tuple):
                    audio_data, sr = chunk
                else:
                    audio_data, sr = chunk, 24000
                if isinstance(audio_data, torch.Tensor):
                    audio_data = audio_data.detach().cpu().numpy()
                audio_arr = np.ascontiguousarray(audio_data, dtype=np.float32).squeeze()
                if audio_arr.size > 0:
                    sd.play(audio_arr, samplerate=sr)
                    sd.wait()
        except Exception as e:
            print(f"[AUDIO PLAYBACK ERROR]: {e}")
        finally:
            is_audio_playing = False
            playback_queue.task_done()

threading.Thread(target=audio_player_worker, daemon=True, name="AudioPlayerWorker").start()

def clear_playback_queue():
    global interrupt_requested
    try:
        sd.stop()
    except Exception:
        pass
    while not playback_queue.empty():
        try:
            playback_queue.get_nowait()
            playback_queue.task_done()
        except queue.Empty:
            break

class PlayerCompat:
    @property
    def busy(self) -> bool:
        return is_audio_playing or not playback_queue.empty()
    def enqueue(self, audio: np.ndarray, samplerate: int = 24000):
        playback_queue.put((audio, samplerate))
    def clear(self):
        clear_playback_queue()
    def stop(self):
        clear_playback_queue()

player = PlayerCompat()

def clean_text_for_tts(text: str) -> str:
    if not text:
        return ""

    replacements = [
        (r'\bESP32[-_]?S3\b', 'E S P thirty-two S three'),
        (r'\bESP32\b', 'E S P thirty-two'),
        (r'\bESP8266\b', 'E S P eighty-two sixty-six'),
        (r'\bSTM32\b', 'S T M thirty-two'),
        (r'\bRP2040\b', 'R P twenty forty'),
        (r'\bGPIO\b', 'G P I O'),
        (r'\bUART\b', 'U-art'),
        (r'\bI2C\b', 'I two C'),
        (r'\bSPI\b', 'S P I'),
        (r'\bUSB\b', 'U S B'),
        (r'\bPWM\b', 'P W M'),
        (r'\bADC\b', 'A D C'),
        (r'\bDAC\b', 'D A C'),
        (r'\bCPU\b', 'C P U'),
        (r'\bGPU\b', 'G P U'),
        (r'\bVRAM\b', 'V-RAM'),
        (r'\bAI\b', 'A I'),
        (r'\bLLM\b', 'L L M'),
        (r'\bTTS\b', 'T T S'),
        (r'\bSTT\b', 'S T T'),
        (r'\bONNX\b', 'O N N X'),
        (r'\bDNN\b', 'D N N'),
        (r'\bVAD\b', 'V A D'),
    ]

    cleaned = text
    for pattern, repl in replacements:
        cleaned = re.sub(pattern, repl, cleaned, flags=re.IGNORECASE)

    # Clean non-vocal markdown while preserving prosodic commas and sentence stops
    cleaned = re.sub(r'[*#_\"\[\]\(\)<>]', ' ', cleaned)
    cleaned = re.sub(r'[\!\?\.]{2,}', '.', cleaned)
    cleaned = re.sub(r',(?=[^\s])', ', ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def synthesize_and_queue(sentence: str):
    global interrupt_requested
    clean_sent = clean_text_for_tts(sentence)
    if not clean_sent or interrupt_requested:
        return
    try:
        generator = tts_pipeline(clean_sent, voice=ACTIVE_VOICE, speed=VOICE_SPEED)
        for _, _, audio in generator:
            if interrupt_requested:
                break
            if isinstance(audio, torch.Tensor):
                audio_arr = audio.detach().cpu().numpy()
            else:
                audio_arr = np.array(audio, dtype=np.float32)
            playback_queue.put(audio_arr)
    except Exception as e:
        print(f"[SYNTH ERROR]: {e}")

def tts_synthesizer_worker():
    global interrupt_requested
    while True:
        sentence = tts_text_queue.get()
        if sentence is None:
            break

        if not interrupt_requested and sentence.strip():
            synthesize_and_queue(sentence)

        tts_text_queue.task_done()

def console_input_worker():
    while True:
        try:
            typed_text = sys.stdin.readline()
            if typed_text:
                cleaned = typed_text.strip()
                if cleaned:
                    text_input_queue.put(cleaned)
        except Exception:
            break

threading.Thread(target=tts_synthesizer_worker, daemon=True).start()
threading.Thread(target=console_input_worker, daemon=True).start()

def clear_all_queues():
    clear_playback_queue()
    while not tts_text_queue.empty():
        try:
            tts_text_queue.get_nowait()
            tts_text_queue.task_done()
        except queue.Empty:
            break

def detect_and_broadcast_hardware(text: str):
    """Detects embedded board mentions in agent responses and highlights them on the dashboard."""
    t = text.lower()
    if "jetson" in t or "orin" in t:
        dashboard_server.set_hardware_focus("jetson")
    elif "esp32" in t:
        dashboard_server.set_hardware_focus("esp32")
    elif "stm32" in t or "nucleo" in t:
        dashboard_server.set_hardware_focus("stm32")
    elif "arduino" in t or "uno" in t:
        dashboard_server.set_hardware_focus("arduino")

def speak_direct(text: str):
    global is_agent_speaking, interrupt_requested
    is_agent_speaking = True
    clean_text = clean_text_for_tts(text)
    print(f"\n[AGENT]: \"{clean_text}\"")
    dashboard_server.set_state("SPEAKING")
    detect_and_broadcast_hardware(clean_text)
    dashboard_server.broadcast_transcript("JARVIS", clean_text)
    try:
        generator = tts_pipeline(clean_text, voice=ACTIVE_VOICE, speed=VOICE_SPEED)
        for _, _, audio in generator:
            if interrupt_requested:
                break
            playback_queue.put((audio, 24000))
        while (not playback_queue.empty() or is_audio_playing) and not interrupt_requested:
            time.sleep(0.02)
    finally:
        if interrupt_requested:
            clear_playback_queue()
        is_agent_speaking = False
        time.sleep(0.1)
        while not audio_queue.empty():
            try:
                audio_queue.get_nowait()
            except queue.Empty:
                break

# ==========================================
# AGENT-VISION PRESENCE STATE & IPC BRIDGE
# ==========================================
# Persistent per-boot greeted registry: Greet once per boot session only
boot_greeted_users: set = set()
currently_tracked_users: set = set()
_arrival_lock = threading.Lock()
_greeting_active = threading.Lock()

# Multi-user hierarchy
primary_user: Optional[Dict[str, Any]] = None
visitor_queue: collections.deque = collections.deque()

state: str = "SLEEPING"
last_interaction_time: float = time.time()

def is_user_present() -> bool:
    """Returns True only when an enrolled user is actively verified in front of the camera."""
    return bool(currently_tracked_users) or (primary_user is not None)

def on_new_user_arrived(new_user_name: str):
    """Triggers immediate conversational greetings upon visual entry with mid-sentence interruption."""
    global state, last_interaction_time, interrupt_requested, is_agent_speaking, vad_iterator

    print(f"\n[VISION ARRIVAL] First boot greeting for newcomer: {new_user_name}")

    # 1. Immediate Interruption Logic (Mid-Sentence)
    if player.busy or is_agent_speaking:
        print(f"[VISION INTERRUPT] Halting current playback mid-sentence for newcomer: {new_user_name}")
        interrupt_requested = True
        clear_all_queues()
        player.stop()
        time.sleep(0.08)
        interrupt_requested = False

        state = "ACTIVE"
        last_interaction_time = time.time()
        dashboard_server.set_state("ACTIVE")

        interjection = f"One moment... Hey {new_user_name}, welcome!"
        speak_direct(interjection)
    else:
        # 2. Idle / Standby Greeting (Not Speaking)
        print(f"[VISION GREETING] Speaking first-time arrival greeting for: {new_user_name}")
        audio_feedback.play_wake_chime()
        time.sleep(0.05)

        greeting = f"Hey {new_user_name}! Good to see you."
        speak_direct(greeting)

    state = "ACTIVE"
    last_interaction_time = time.time()
    dashboard_server.set_state("ACTIVE")

    # Clear audio queue so it is primed for incoming questions
    while not audio_queue.empty():
        try:
            audio_queue.get_nowait()
        except queue.Empty:
            break

    if vad_iterator is not None:
        vad_iterator.reset_states()

    print("[STATUS: ACTIVE] Conversational loop primed for incoming questions...\n")

def handle_presence_event(event_type: str, user_info: Optional[Dict[str, Any]]):
    """Thread-safe handler for ARRIVAL and DEPARTURE presence events."""
    global primary_user, visitor_queue, state, last_interaction_time

    if event_type == "ARRIVAL" and user_info:
        user_id = str(user_info.get("user_id", "unknown")).strip()
        display_name = str(user_info.get("display_name", user_id)).strip()
        user_key = (user_id or display_name).lower()

        currently_tracked_users.add(user_key)

        # Enroll as primary user if none active, or enqueue in visitor queue
        if primary_user is None:
            primary_user = user_info
        elif primary_user.get("user_id") != user_id and user_info not in visitor_queue:
            visitor_queue.append(user_info)

        # Check persistent per-boot greeted registry: greet once per boot only
        with _arrival_lock:
            already_greeted = (user_key in boot_greeted_users) or (display_name.lower() in boot_greeted_users)
            if not already_greeted:
                boot_greeted_users.add(user_key)
                boot_greeted_users.add(display_name.lower())

        if already_greeted:
            # Maintain presence tracking, but do NOT wake or greet if already greeted
            print(f"[VISION] User {display_name} already greeted this boot session. Visual presence active; state remains {state}.")
            return

        print(f"\n[VISION] First-time arrival detected for this boot session: {display_name}")

        def _dispatch_greeting():
            if not _greeting_active.acquire(blocking=False):
                time.sleep(0.2)
                if not _greeting_active.acquire(timeout=2.0):
                    return
            try:
                on_new_user_arrived(display_name)
            finally:
                _greeting_active.release()

        threading.Thread(target=_dispatch_greeting, daemon=True, name=f"ArrivalGreet-{display_name}").start()

    elif event_type == "DEPARTURE":
        departed_id = user_info.get("user_id") if user_info else None
        if departed_id:
            user_key = str(departed_id).strip().lower()
            currently_tracked_users.discard(user_key)

        if primary_user and primary_user.get("user_id") == departed_id:
            if visitor_queue:
                primary_user = visitor_queue.popleft()
                print(f"[VISION] Primary departed. Promoted {primary_user.get('display_name')} to primary speaker.")
            else:
                primary_user = None
                if not currently_tracked_users:
                    state = "SLEEPING"
                    dashboard_server.set_state("SLEEPING")
                    dashboard_server.set_hardware_focus(None)
        elif visitor_queue and departed_id:
            visitor_queue = collections.deque([u for u in visitor_queue if u.get("user_id") != departed_id])

class PresenceBridgeServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class PresenceBridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence routine request logging
        return

    def do_POST(self):
        if self.path == "/agent/presence":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                payload = json.loads(body.decode("utf-8"))
                event = payload.get("event")
                user = payload.get("user")
                if event in ("ARRIVAL", "DEPARTURE"):
                    handle_presence_event(event, user)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = {
                "active_user": primary_user,
                "is_present": is_user_present(),
                "agent_state": state
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
        else:
            self.send_error(404)

def start_presence_bridge(port: int = 8766):
    """Starts local HTTP presence endpoint and connects in-process callbacks if available."""
    def _run():
        try:
            server = PresenceBridgeServer(("127.0.0.1", port), PresenceBridgeHandler)
            print(f"[VISION BRIDGE] Agent presence IPC endpoint active at http://127.0.0.1:{port}/agent/presence")
            server.serve_forever()
        except Exception as e:
            print(f"[VISION BRIDGE ERROR] Could not bind port {port}: {e}")

    threading.Thread(target=_run, daemon=True, name="PresenceBridgeServerThread").start()

    # Try in-process registration if jarvis_vision.dashboard is already loaded
    try:
        from jarvis_vision import dashboard as vision_dash
        vision_dash.register_presence_callback(handle_presence_event)
        print("[VISION BRIDGE] In-process presence callback linked with jarvis_vision.dashboard")
    except Exception:
        pass

    # Query initial presence state from dashboard (port 8080) in case user is already in front of camera
    def _query_initial_presence():
        time.sleep(0.5)
        try:
            r = requests.get("http://127.0.0.1:8080/api/presence_state", timeout=1.0)
            if r.status_code == 200:
                data = r.json()
                if data.get("is_present") and data.get("active_user"):
                    print(f"[VISION BRIDGE] Syncing initial presence on startup: {data['active_user'].get('display_name')}")
                    handle_presence_event("ARRIVAL", data["active_user"])
        except Exception:
            pass

    threading.Thread(target=_query_initial_presence, daemon=True, name="InitialPresenceSync").start()


def stream_brain_to_voice(user_text: str):
    global dialog_turns, is_agent_speaking, interrupt_requested, primary_user, visitor_queue

    is_agent_speaking = True
    interrupt_requested = False
    clear_all_queues()
    dashboard_server.set_state("SPEAKING")

    primary_name = primary_user.get("display_name", "User") if primary_user else "User"
    primary_role = primary_user.get("role", "visitor") if primary_user else "visitor"

    recent_dialogue = ""
    for turn in dialog_turns[-4:]:
        role = primary_name if turn["role"] == "user" else "Jarvis"
        recent_dialogue += f"{role}: {turn['content']}\n"

    full_prompt = (
        f"{recent_dialogue}"
        f"{primary_name}: {user_text}\n"
        f"Jarvis:"
    )

    collected_tokens = []
    buffer = ""
    clause_end_pattern = re.compile(r'((?<!\d)[.?!,](?!\d)|\n+)')

    try:
        res = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={
                "model": "qwen2.5:3b",
                "system": system_prompt + f"\n- Speaking with {primary_name} ({primary_role}). Respond in natural conversational English. Max 2 concise sentences.",
                "prompt": full_prompt,
                "stream": True,
                "keep_alive": -1,
                "options": {
                    "temperature": 0.5,
                    "num_predict": 120,
                    "stop": [f"{primary_name}:", "Visitor:", "Jarvis:", "\n\n"]
                }
            },
            stream=True,
            timeout=(5.0, 35.0)
        )

        for line in res.iter_lines():
            if interrupt_requested:
                break

            if line:
                chunk = json.loads(line.decode("utf-8"))
                token = chunk.get("response", "")
                buffer += token
                collected_tokens.append(token)

                # Pipelined clause/sentence splitting on boundary (. ! ? or ,) with at least 3 words
                while True:
                    found_split = False
                    for m in clause_end_pattern.finditer(buffer):
                        pos = m.end()
                        cand = buffer[:pos].strip()
                        cand_clean = re.sub(r'[*#_\"\[\]\n]', ' ', cand).strip()
                        if cand_clean and len(cand_clean.split()) >= 3:
                            print(f"\n[AGENT STREAMING]: \"{cand_clean}\"")
                            detect_and_broadcast_hardware(cand_clean)
                            dashboard_server.broadcast_stream_chunk("JARVIS", cand_clean)
                            synthesize_and_queue(cand_clean)
                            buffer = buffer[pos:].lstrip()
                            found_split = True
                            break
                    if not found_split:
                        break

        # Flush any remaining trailing text in the buffer to Kokoro
        if buffer.strip() and not interrupt_requested:
            remaining = re.sub(r'[*#_\"\[\]\n]', ' ', buffer).strip()
            if remaining:
                print(f"\n[AGENT STREAMING]: \"{remaining}\"")
                detect_and_broadcast_hardware(remaining)
                dashboard_server.broadcast_stream_chunk("JARVIS", remaining)
                synthesize_and_queue(remaining)

        # Wait for decoupled audio player worker to finish playing all queued chunks
        while (not playback_queue.empty() or is_audio_playing) and not interrupt_requested:
            time.sleep(0.02)

        full_text = "".join(collected_tokens).strip()
        if full_text and not interrupt_requested:
            dialog_turns.append({"role": "user", "content": user_text})
            dialog_turns.append({"role": "assistant", "content": full_text})
            if len(dialog_turns) > 4:
                dialog_turns = dialog_turns[-4:]

    except Exception as e:
        print(f"[BRAIN ERROR]: {e}")
        speak_direct("I'm right here with you! Feel free to ask me anything about the boards on the table.")
    finally:
        if interrupt_requested:
            clear_all_queues()
        is_agent_speaking = False
        dashboard_server.set_state("ACTIVE")
        time.sleep(0.15)
        while not audio_queue.empty():
            try:
                audio_queue.get_nowait()
            except queue.Empty:
                break

def main():
    global is_agent_speaking, interrupt_requested, state, last_interaction_time

    try:
        try:
            import subprocess
            out = subprocess.check_output("netstat -ano | findstr :8088", shell=True).decode(errors="ignore")
            for line in out.strip().splitlines():
                parts = line.split()
                if len(parts) >= 5 and ":8088" in parts[1]:
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) != 0 and int(pid) != os.getpid():
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        dashboard_server.start_dashboard_server(port=8088)
    except Exception as e:
        print(f"[DASHBOARD SERVER NOTICE] Port 8088 managed externally: {e}")
    dashboard_server.set_state("SLEEPING")
    start_presence_bridge(port=8766)

    print("\n" + "=" * 60)
    print("  JARVIS VISION-GATED DUAL-INPUT AGENT")
    print(f"  • Voice Output: {ACTIVE_VOICE} (Expressive Conversational)")
    print("  • Speech-to-Text: Faster-Whisper small.en (CUDA FP16)")
    print("  • Vision Presence Gating: YuNet + SFace (Port 8080 <-> 8766)")
    print("  • AeroFinger Pointing Bridge: WebSocket (Port 8765)")
    mic_idx = get_realtek_mic_index()
    if mic_idx is not None:
        try:
            mic_info = sd.query_devices(mic_idx)
            mic_name = mic_info.get("name", f"Device #{mic_idx}")
            print(f"  • Audio Capture Device: [{mic_idx}] {mic_name}")
        except Exception:
            print(f"  • Audio Capture Device: [{mic_idx}]")
    else:
        print("  • Audio Capture Device: System Default")
    print("  • Background Noise Rejection: Vision Gate + RMS Energy Floor + Strict VAD")
    print("  • Hallucination Suppression: Repetition penalty + No-speech gating")
    print("  • Wake Word: Silero VAD + Faster-Whisper ('Hey Repos' / face arrival / typed text)")
    print("  Press Ctrl+C to exit.")
    print("=" * 60 + "\n")

    global state, last_interaction_time, vad_iterator
    state = "SLEEPING"
    last_interaction_time = time.time()

    # VAD threshold lowered to 0.20 for reliable natural spoken voice detection
    vad_iterator = VADIterator(vad_model, threshold=0.20, sampling_rate=SAMPLE_RATE)
    speech_buffer = []
    pre_buffer = collections.deque(maxlen=10)
    is_speaking_now = False
    silence_frames = 0

    SILENCE_LIMIT = int(0.85 * (SAMPLE_RATE / CHUNK_SIZE))
    MIN_SPEECH_FRAMES = int(0.30 * (SAMPLE_RATE / CHUNK_SIZE))

    # Minimum RMS voice threshold: 0.005 floor for speech
    MIN_AUDIO_RMS = 0.005
    ambient_noise_rms = 0.004

    capture_device = get_realtek_mic_index()
    if capture_device is not None:
        try:
            device_info = sd.query_devices(capture_device)
            device_name = device_info.get("name", f"Device #{capture_device}")
            print(f"[AUDIO CAPTURE] Confirmed active device: [{capture_device}] {device_name}")
        except Exception:
            print(f"[AUDIO CAPTURE] Confirmed active device index: [{capture_device}]")
    else:
        print("[AUDIO CAPTURE] Using default system audio input")

    print("[STATUS: SLEEPING] Waiting for recognized user arrival, speech, or typed text...\n")

    try:
        audio_stream = sd.InputStream(device=capture_device, samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                                      blocksize=CHUNK_SIZE, callback=audio_callback)
    except Exception as e:
        print(f"[AUDIO CAPTURE WARNING] Could not initialize device [{capture_device}]: {e}. Falling back to default system input.")
        capture_device = None
        audio_stream = sd.InputStream(device=None, samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                                      blocksize=CHUNK_SIZE, callback=audio_callback)

    with audio_stream:
        while True:
            current_time = time.time()

            # 1. Console Text Input Check
            if not text_input_queue.empty():
                typed_msg = text_input_queue.get_nowait()
                print(f"\n[TYPED PROMPT]: {typed_msg}")

                typed_clean = re.sub(r'[^a-zA-Z0-9\s]', '', typed_msg.lower()).strip()
                sleep_commands = [
                    "repos standby", "repers standby", "standby mode", "go into standby",
                    "repos stop", "repos go to sleep", "go to sleep", "stop listening"
                ]
                if any(cmd in typed_clean for cmd in sleep_commands):
                    print(f"[MANUAL SLEEP COMMAND VIA CONSOLE: '{typed_msg}']")
                    audio_feedback.play_sleep_chime()
                    dashboard_server.set_hardware_focus(None)
                    speak_direct("Standing by. Just say 'Hey Repos' when you need me.")
                    while not audio_queue.empty():
                        try:
                            audio_queue.get_nowait()
                        except queue.Empty:
                            break
                    state = "SLEEPING"
                    dashboard_server.set_state("SLEEPING")
                    vad_iterator.reset_states()
                    speech_buffer = []
                    pre_buffer.clear()
                    is_speaking_now = False
                    silence_frames = 0
                    print("\n[STATUS: SLEEPING] Listening for 'Hey Repos' or typed text...\n")
                    continue

                state = "ACTIVE"
                dashboard_server.set_state("THINKING")
                dashboard_server.broadcast_transcript("YOU", typed_msg)
                vad_iterator.reset_states()
                speech_buffer = []
                pre_buffer.clear()
                is_speaking_now = False
                silence_frames = 0

                with pointed_board_lock:
                    pointed_board = current_pointed_board

                if pointed_board:
                    prompt_with_context = (
                        f"{typed_msg}\n"
                        f"[Active Table Context: The user previously selected/pointed to the {pointed_board}. "
                        f"Unless they explicitly ask about a different board, ground your answer in this board.]"
                    )
                else:
                    prompt_with_context = typed_msg

                stream_brain_to_voice(prompt_with_context)
                last_interaction_time = time.time()
                vad_iterator.reset_states()
                pre_buffer.clear()
                dashboard_server.set_state("ACTIVE")
                print("\n[READY - Speak, type next question, or wait for standby...]")
                continue

            frame = audio_queue.get()

            # 2. Vision Presence Gate: Discard audio immediately when no authorized user is present
            if not is_user_present():
                speech_buffer = []
                pre_buffer.clear()
                is_speaking_now = False
                silence_frames = 0
                vad_iterator.reset_states()
                if state != "SLEEPING":
                    state = "SLEEPING"
                    dashboard_server.set_state("SLEEPING")
                time.sleep(0.005)
                continue

            # 3. Agent Audio Self-Suppression: Avoid feeding agent's own speech playback to VAD
            if is_agent_speaking:
                time.sleep(0.005)
                continue

            # 4. STATE: SLEEPING (Whisper-Powered Standby/Wake Loop)
            if state == "SLEEPING":
                if not is_speaking_now:
                    frame_rms = float(np.sqrt(np.mean(frame**2)))
                    ambient_noise_rms = max(0.002, 0.95 * ambient_noise_rms + 0.05 * frame_rms)
                    pre_buffer.append(frame)

                audio_tensor = torch.from_numpy(frame.squeeze())
                speech_dict = vad_iterator(audio_tensor, return_seconds=True)

                if speech_dict is not None and "start" in speech_dict:
                    is_speaking_now = True
                    silence_frames = 0
                    speech_buffer = list(pre_buffer)
                    pre_buffer.clear()
                elif is_speaking_now:
                    speech_buffer.append(frame)

                if is_speaking_now:
                    speech_prob = vad_model(audio_tensor, SAMPLE_RATE).item()
                    if speech_prob < 0.15:
                        silence_frames += 1
                    else:
                        silence_frames = 0

                    max_wake_frames = int(2.0 * (SAMPLE_RATE / CHUNK_SIZE))

                    if silence_frames > SILENCE_LIMIT or len(speech_buffer) >= max_wake_frames:
                        is_speaking_now = False
                        silence_frames = 0
                        vad_iterator.reset_states()

                        if len(speech_buffer) >= MIN_SPEECH_FRAMES:
                            wake_audio = np.concatenate(speech_buffer, axis=0).flatten()
                            wake_rms = float(np.sqrt(np.mean(wake_audio**2)))

                            if wake_rms > max(0.005, ambient_noise_rms * 1.3):
                                segments, _ = stt_model.transcribe(
                                    wake_audio,
                                    beam_size=1,                         # Greedy search for sub-100ms latency
                                    language="en",
                                    initial_prompt="Hey Repos. Repos standby. Repos stop.", # Phonetic acoustic bias
                                    condition_on_previous_text=False
                                )
                                raw_text = " ".join([s.text for s in segments]).strip()
                                triggered = check_hey_repos_wake(raw_text)
                                print(f"[WAKE AUDIT]: raw='{raw_text}' -> triggered={triggered}")

                                if triggered:
                                    print(f"\n[WAKE WORD TRIGGERED via Whisper! ('{raw_text}')]")
                                    audio_feedback.play_wake_chime()
                                    dashboard_server.set_state("ACTIVE")

                                    vis_name = primary_user.get("display_name", "") if primary_user else ""
                                    wake_msg = f"Hey {vis_name}! How can I help?" if vis_name else "Hey! I'm listening."
                                    speak_direct(wake_msg)

                                    state = "ACTIVE"
                                    last_interaction_time = time.time()
                                    vad_iterator.reset_states()
                                    speech_buffer = []
                                    pre_buffer.clear()
                                    is_speaking_now = False
                                    silence_frames = 0
                                    dashboard_server.set_state("ACTIVE")
                                    print("[STATUS: ACTIVE] Conversational loop engaged...\n")
                                    continue

                        # If no match, discard audio buffer, reset VAD states, and continue in SLEEPING
                        speech_buffer = []
                        pre_buffer.clear()
                        is_speaking_now = False
                        silence_frames = 0
                        vad_iterator.reset_states()

                continue

            # 5. STATE: ACTIVE (Conversational Loop)
            if state == "ACTIVE":
                if not is_speaking_now and (current_time - last_interaction_time > INACTIVITY_TIMEOUT):
                    print(f"\n[INACTIVITY TIMEOUT] No activity for {INACTIVITY_TIMEOUT}s.")
                    audio_feedback.play_sleep_chime()
                    dashboard_server.set_state("SLEEPING")
                    dashboard_server.set_hardware_focus(None)
                    vis_name = primary_user.get("display_name", "") if primary_user else ""
                    farewell = f"Going into standby, {vis_name}. Just say 'Hey Repos' or step up to wake me." if vis_name else "Going into standby. Just say 'Hey Repos' or type to wake me."
                    speak_direct(farewell)
                    while not audio_queue.empty():
                        try:
                            audio_queue.get_nowait()
                        except queue.Empty:
                            break
                    state = "SLEEPING"
                    vad_iterator.reset_states()
                    speech_buffer = []
                    pre_buffer.clear()
                    is_speaking_now = False
                    silence_frames = 0
                    dashboard_server.set_state("SLEEPING")
                    print("\n[STATUS: SLEEPING] Listening for 'Hey Repos' or typed text...\n")
                    continue

                if not is_speaking_now:
                    frame_rms = float(np.sqrt(np.mean(frame**2)))
                    ambient_noise_rms = max(0.002, 0.95 * ambient_noise_rms + 0.05 * frame_rms)
                    pre_buffer.append(frame)

                audio_tensor = torch.from_numpy(frame.squeeze())
                speech_dict = vad_iterator(audio_tensor, return_seconds=True)
                
                if speech_dict is not None and "start" in speech_dict:
                    is_speaking_now = True
                    silence_frames = 0
                    speech_buffer = list(pre_buffer)
                    pre_buffer.clear()
                    dashboard_server.set_state("LISTENING")
                    print("[LISTENING...]", end="\r", flush=True)
                elif is_speaking_now:
                    speech_buffer.append(frame)

                if is_speaking_now:
                    speech_prob = vad_model(audio_tensor, SAMPLE_RATE).item()

                    # Speech probability threshold for silence accumulation
                    if speech_prob < 0.15:
                        silence_frames += 1
                    else:
                        silence_frames = 0

                    if silence_frames > SILENCE_LIMIT:
                        is_speaking_now = False
                        silence_frames = 0
                        vad_iterator.reset_states()
                        audio_feedback.play_listening_tick()
                        dashboard_server.set_state("THINKING")

                        if len(speech_buffer) < MIN_SPEECH_FRAMES:
                            speech_buffer = []
                            pre_buffer.clear()
                            dashboard_server.set_state("ACTIVE")
                            continue

                        full_audio = np.concatenate(speech_buffer, axis=0).flatten()
                        speech_buffer = []
                        pre_buffer.clear()

                        speech_rms = float(np.sqrt(np.mean(full_audio**2)))

                        # Dynamic Signal-to-Noise Ratio (SNR) Gate:
                        # Must distinctly stand out above ambient hall noise floor and exceed minimum threshold
                        if speech_rms <= (ambient_noise_rms * 1.5) or speech_rms <= 0.005:
                            dashboard_server.set_state("ACTIVE")
                            continue

                        print("\n[TRANSCRIBING...]")
                        segments, info = stt_model.transcribe(
                            full_audio,
                            beam_size=2,
                            best_of=2,
                            temperature=0.0,
                            language="en",
                            initial_prompt="Hey Repos. Repos standby. Repos stop.",
                            vad_filter=True,
                            vad_parameters=dict(min_silence_duration_ms=300),
                            condition_on_previous_text=False,
                            repetition_penalty=1.15
                        )
                        segment_list = list(segments)
                        if not segment_list:
                            dashboard_server.set_state("ACTIVE")
                            continue

                        primary_seg = segment_list[0]

                        # Whisper Quality Gate 1: Reject non-speech audio
                        if primary_seg.no_speech_prob > 0.35:
                            dashboard_server.set_state("ACTIVE")
                            continue

                        # Whisper Quality Gate 2: Reject low-confidence acoustic murmurs
                        if primary_seg.avg_logprob < -0.60:
                            dashboard_server.set_state("ACTIVE")
                            continue

                        # Whisper Quality Gate 3: Reject repetitive hallucination loops
                        if primary_seg.compression_ratio > 2.2 or any(s.compression_ratio > 2.2 for s in segment_list):
                            dashboard_server.set_state("ACTIVE")
                            continue

                        user_text = " ".join([s.text for s in segment_list]).strip()
                        user_text_lower = user_text.lower().strip()
                        user_text_clean = re.sub(r'[^a-zA-Z0-9\s]', '', user_text_lower).strip()

                        # Manual Sleep Command Gate
                        sleep_commands = [
                            "repos standby", "repers standby", "standby mode", "go into standby",
                            "repos stop", "repos go to sleep", "go to sleep", "stop listening"
                        ]
                        if any(cmd in user_text_clean for cmd in sleep_commands):
                            print(f"\n[MANUAL SLEEP COMMAND DETECTED: '{user_text}']")
                            audio_feedback.play_sleep_chime()
                            dashboard_server.set_hardware_focus(None)
                            speak_direct("Standing by. Just say 'Hey Repos' when you need me.")
                            while not audio_queue.empty():
                                try:
                                    audio_queue.get_nowait()
                                except queue.Empty:
                                    break
                            state = "SLEEPING"
                            dashboard_server.set_state("SLEEPING")
                            vad_iterator.reset_states()
                            speech_buffer = []
                            pre_buffer.clear()
                            is_speaking_now = False
                            silence_frames = 0
                            print("\n[STATUS: SLEEPING] Listening for 'Hey Repos' or typed text...\n")
                            continue

                        # Rejection Gate 4: Whisper phantom watermark/hallucination phrases
                        phantom_phrases = [
                            "thank you for watching",
                            "thanks for watching",
                            "subtitles by",
                            "amara.org",
                            "please subscribe",
                            "subscribe to my channel",
                            "watching!",
                        ]
                        if any(phrase in user_text_lower for phrase in phantom_phrases):
                            dashboard_server.set_state("ACTIVE")
                            continue

                        # Rejection Gate 5: Common stray single-word acoustic fillers
                        stray_fillers = {
                            "thank you", "thank you.", "okay", "okay.", "you", "you.",
                            "uh", "um", "uh,", "um,", "bye", "bye."
                        }
                        if user_text_lower in stray_fillers:
                            dashboard_server.set_state("ACTIVE")
                            continue

                        # Rejection Gate 6: Incomplete whispers (< 2 distinct alphanumeric words)
                        words = re.sub(r'[^a-zA-Z0-9\s]', '', user_text_lower).split()
                        distinct_words = set(words)
                        allowed_single_tokens = {"yes", "no", "stop", "yeah", "nah"}
                        if len(distinct_words) < 2 and not (len(words) == 1 and words[0] in allowed_single_tokens):
                            dashboard_server.set_state("ACTIVE")
                            continue

                        # Rejection Gate 7: Eliminate repetitive single-word loops
                        if len(words) >= 3 and len(distinct_words) == 1:
                            dashboard_server.set_state("ACTIVE")
                            continue

                        print(f"\n[YOU]: {user_text}")
                        dashboard_server.broadcast_transcript("YOU", user_text)

                        with pointed_board_lock:
                            pointed_board = current_pointed_board

                        if pointed_board:
                            prompt_with_context = (
                                f"{user_text}\n"
                                f"[Active Table Context: The user previously selected/pointed to the {pointed_board}. "
                                f"Unless they explicitly ask about a different board, ground your answer in this board.]"
                            )
                        else:
                            prompt_with_context = user_text

                        stream_brain_to_voice(prompt_with_context)

                        last_interaction_time = time.time()
                        vad_iterator.reset_states()
                        pre_buffer.clear()
                        dashboard_server.set_state("ACTIVE")
                        print("\n[READY - Speak, type, or wait for standby...]")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nSession stopped.")
    except Exception as e:
        import traceback
        print("\n[CRASH DETECTED]:")
        traceback.print_exc()