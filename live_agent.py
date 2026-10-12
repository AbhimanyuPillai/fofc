import os
import sys
import time
import queue
import re
import io
import wave
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
from typing import Optional, Dict, Any, Union
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from faster_whisper import WhisperModel
import audio_feedback
import dashboard_server

# Windows CUDA / DLL directory configuration for ONNX Runtime GPU
if sys.platform.startswith("win"):
    torch_lib = os.path.join(sys.prefix, "Lib", "site-packages", "torch", "lib")
    cudnn_bin = os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "cudnn", "bin")
    for dll_dir in [torch_lib, cudnn_bin]:
        if os.path.exists(dll_dir):
            if dll_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = dll_dir + os.pathsep + os.environ.get("PATH", "")
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(dll_dir)
                except Exception:
                    pass

import onnxruntime as ort
from kokoro_onnx import Kokoro

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

ACTIVE_VOICE = "af_sarah"  # Fallback default anchor voice
VOICE_SPEED = 1.03         # Natural, relaxed conversational pace
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

def load_system_prompt(path: Optional[str] = None) -> str:
    """Load the agent's system instructions from the project Markdown file."""
    instructions_path = path or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), INSTRUCTIONS_FILE
    )
    try:
        with open(instructions_path, "r", encoding="utf-8") as instructions_file:
            prompt = instructions_file.read().strip()
    except OSError as exc:
        raise RuntimeError(
            f"Could not load agent instructions from {instructions_path}: {exc}"
        ) from exc
    if not prompt:
        raise RuntimeError(f"Agent instructions file is empty: {instructions_path}")
    return prompt

print("\n" + "=" * 60)
print(f"[INIT] Booting Noise-Hardened Hardware Agent ({sys.platform})...")
print("=" * 60)

system_prompt = load_system_prompt()
ensure_ollama_running()
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
if torch.cuda.is_available():
    print("[STT INIT] Loading Faster-Whisper on CUDA (FP16)...")
    whisper_model = WhisperModel(
        "small.en",
        device="cuda",
        compute_type="float16",
        download_root=os.path.join(os.path.expanduser("~"), ".cache", "whisper")
    )
else:
    print("[STT INIT] No GPU detected. Loading Faster-Whisper on CPU (int8, 4 threads)...")
    whisper_model = WhisperModel(
        "base.en",
        device="cpu",
        compute_type="int8",
        cpu_threads=4,
        download_root=os.path.join(os.path.expanduser("~"), ".cache", "whisper")
    )
stt_model = whisper_model

vad_model, utils = torch.hub.load(
    repo_or_dir="snakers4/silero-vad",
    model="silero_vad",
    onnx=False
)
(get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils

# Dynamic ONNX Provider Selection for Kokoro
available_providers = ort.get_available_providers()
selected_providers = (
    ['CUDAExecutionProvider', 'CPUExecutionProvider']
    if 'CUDAExecutionProvider' in available_providers
    else ['CPUExecutionProvider']
)

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(WORKSPACE_DIR, "kokoro-v0_19.onnx") if os.path.exists(os.path.join(WORKSPACE_DIR, "kokoro-v0_19.onnx")) else "kokoro-v0_19.onnx"
voices_path = os.path.join(WORKSPACE_DIR, "voices.bin") if os.path.exists(os.path.join(WORKSPACE_DIR, "voices.bin")) else (
    os.path.join(WORKSPACE_DIR, "voices.json") if os.path.exists(os.path.join(WORKSPACE_DIR, "voices.json")) else "voices.json"
)

kokoro = Kokoro(
    model_path=model_path,
    voices_path=voices_path
)
if not hasattr(kokoro, "session"):
    kokoro.session = kokoro.sess
kokoro.session.set_providers(selected_providers)
print(f"[TTS INIT] Kokoro-ONNX active providers: {kokoro.session.get_providers()}")

def get_natural_voice(kokoro_engine):
    try:
        v_sarah = kokoro_engine.get_voice_style("af_sarah")
        v_nicole = kokoro_engine.get_voice_style("af_nicole")
        # 75% Sarah (crisp articulation) + 25% Nicole (warmth, natural breath)
        blended = (v_sarah * 0.75) + (v_nicole * 0.25)
        return blended
    except Exception as e:
        print(f"[TTS WARN] Failed to blend voices ({e}), falling back to af_sarah.")
        return "af_sarah"

CUSTOM_VOICE = get_natural_voice(kokoro)
ACTIVE_VOICE = CUSTOM_VOICE

def synthesize_wav_bytes(text: str) -> bytes:
    """Synthesizes given text with Kokoro TTS and returns in-memory WAV bytes."""
    try:
        clean = clean_text_for_tts(text) if "clean_text_for_tts" in globals() else text
        if not clean:
            clean = text
        samples, sr = kokoro.create(clean, voice=CUSTOM_VOICE, speed=VOICE_SPEED, lang="en-us")
        if samples is None or len(samples) == 0:
            return b""
        audio_int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(audio_int16.tobytes())
        return buf.getvalue()
    except Exception as e:
        print(f"[TTS PREVIEW ERROR]: {e}")
        return b""

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
audio_stream_lock = threading.Lock()
active_audio_stream = None
capture_device = None

DEVICE_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "device_config.json")

def load_device_config() -> dict:
    if os.path.exists(DEVICE_CONFIG_FILE):
        try:
            with open(DEVICE_CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_device_config(cfg: dict):
    try:
        current = load_device_config()
        current.update(cfg)
        with open(DEVICE_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
    except Exception as e:
        print(f"[DEVICE CONFIG ERROR] Could not save config: {e}")

def resolve_mic_device(device_name: str = "", device_id: str = "") -> Optional[int]:
    try:
        devices = sd.query_devices()
        if device_name:
            clean = device_name.lower().strip()
            for idx, dev in enumerate(devices):
                if dev.get("max_input_channels", 0) > 0 and dev.get("name", "").lower().strip() == clean:
                    return idx
            for idx, dev in enumerate(devices):
                if dev.get("max_input_channels", 0) > 0 and clean in dev.get("name", "").lower():
                    return idx
            words = [w for w in clean.split() if len(w) > 3 and w not in ("microphone", "default")]
            if words:
                for idx, dev in enumerate(devices):
                    if dev.get("max_input_channels", 0) > 0:
                        dev_n = dev.get("name", "").lower()
                        if any(w in dev_n for w in words):
                            return idx
    except Exception as e:
        print(f"[AUDIO DEVICE RESOLVE ERROR]: {e}")
    return None

def switch_audio_device(device_name: str = "", device_id: str = ""):
    global capture_device, active_audio_stream
    target_idx = resolve_mic_device(device_name, device_id)
    if target_idx is None and not device_name:
        target_idx = get_realtek_mic_index()

    save_device_config({
        "agent_mic_name": device_name,
        "agent_mic_device": device_id,
        "agent_mic_index": target_idx
    })
    dashboard_server.save_camera_config({"audio_device_index": target_idx})

    with audio_stream_lock:
        try:
            if active_audio_stream:
                try:
                    active_audio_stream.stop()
                    active_audio_stream.close()
                except Exception:
                    pass
            capture_device = target_idx
            active_audio_stream = sd.InputStream(
                device=target_idx,
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=CHUNK_SIZE,
                callback=audio_callback
            )
            active_audio_stream.start()
            dname = device_name or "System Default"
            if target_idx is not None:
                try:
                    dname = sd.query_devices(target_idx).get("name", dname)
                except Exception:
                    pass
            print(f"[AUDIO CAPTURE] Switched microphone to: [{target_idx}] {dname}")
            dashboard_server.broadcast_transcript("SYSTEM", f"Switched microphone to: {dname}")
        except Exception as e:
            print(f"[AUDIO CAPTURE RESTART WARNING] Failed to switch to [{target_idx}]: {e}")

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
                elif data.get("event") == "set_audio_device" or data.get("type") == "SET_AUDIO_DEVICE":
                    dev_id = data.get("device_id", "")
                    dev_name = data.get("device_name", "")
                    switch_audio_device(device_name=dev_name, device_id=dev_id)
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
        # Pad 250ms of trailing silence to protect final phonemes from buffer clipping
        pad_samples = int(0.25 * samplerate)
        audio = np.pad(audio, (0, pad_samples), mode='constant')
        playback_queue.put((audio, samplerate))
    def clear(self):
        clear_playback_queue()
    def stop(self):
        clear_playback_queue()

player = PlayerCompat()

PHONETIC_REPLACEMENTS = {
    r"\bAI\b": "ay eye",
    r"\bA\.I\.(?!\w)": "ay eye",
    r"\bA\.I\.\b": "ay eye",
    r"\bIoT\b": "eye oh tea",
    r"\bNVIDIA\b": "envidia",
    r"\bRepos\b": "reepoze",
    r"\bESP32\b": "E S P thirty-two",
    r"\bSTM32\b": "S T M thirty-two",
}

def _normalize_speech_text(text: str) -> str:
    # Remove markdown formatting and harsh dashes.
    text = re.sub(r'[*_#`~—–-]', ' ', text)
    return ' '.join(text.split())

def clean_spoken_text(text: str) -> str:
    for pattern, replacement in PHONETIC_REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return _normalize_speech_text(text)

clean_text_for_tts = clean_spoken_text
clean_display_text = _normalize_speech_text

def synthesize_and_queue(sentence: str):
    global interrupt_requested
    clean_sent = clean_text_for_tts(apply_active_user_pronunciation(sentence))
    if not clean_sent or interrupt_requested:
        return
    try:
        samples, sr = kokoro.create(clean_sent, voice=CUSTOM_VOICE, speed=VOICE_SPEED, lang="en-us")
        if not interrupt_requested and samples is not None and len(samples) > 0:
            # Pad 250ms of trailing silence to protect final phonemes from buffer clipping
            pad_samples = int(0.25 * sr)
            samples = np.pad(samples, (0, pad_samples), mode='constant')
            playback_queue.put((samples, sr))
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

def speak_direct(text: str, spoken_text: Optional[str] = None):
    global is_agent_speaking, interrupt_requested
    is_agent_speaking = True
    clean_text = clean_display_text(text)
    speech_source = spoken_text if spoken_text is not None else text
    clean_speech_text = clean_text_for_tts(apply_active_user_pronunciation(speech_source))
    print(f"\n[AGENT]: \"{clean_text}\"")
    dashboard_server.set_state("SPEAKING")
    detect_and_broadcast_hardware(clean_text)
    dashboard_server.broadcast_transcript("JARVIS", clean_text)
    try:
        samples, sr = kokoro.create(clean_speech_text, voice=CUSTOM_VOICE, speed=VOICE_SPEED, lang="en-us")
        if not interrupt_requested and samples is not None and len(samples) > 0:
            # Pad 250ms of trailing silence to protect final phonemes from buffer clipping
            pad_samples = int(0.25 * sr)
            samples = np.pad(samples, (0, pad_samples), mode='constant')
            playback_queue.put((samples, sr))
        while (not playback_queue.empty() or is_audio_playing) and not interrupt_requested:
            time.sleep(0.02)
    except Exception as e:
        print(f"[TTS DIRECT ERROR]: {e}")
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


def apply_saved_name_pronunciation(text: str, display_name: str, pronunciation: str) -> str:
    """Use the saved phonetic spelling when the display name appears in spoken text."""
    if not text or not display_name or not pronunciation:
        return text

    name_pattern = re.compile(
        rf"(?<!\w){re.escape(display_name)}(?!\w)",
        flags=re.IGNORECASE,
    )
    return name_pattern.sub(lambda _: pronunciation, text)


def apply_active_user_pronunciation(text: str) -> str:
    """Apply the active user's saved pronunciation to audio text across speech paths."""
    user = primary_user
    if not isinstance(user, dict):
        return text

    display_name = str(user.get("display_name") or "").strip()
    pronunciation = str(user.get("pronunciation") or "").strip()
    return apply_saved_name_pronunciation(text, display_name, pronunciation)


def on_new_user_arrived(user_info: Union[str, Dict[str, Any]]):
    """Triggers immediate conversational greetings upon visual entry with mid-sentence interruption."""
    global state, last_interaction_time, interrupt_requested, is_agent_speaking, vad_iterator

    if isinstance(user_info, dict):
        display_name = str(user_info.get("display_name") or "there").strip()
        pronunciation = str(user_info.get("pronunciation") or "").strip()
        custom_greeting = str(user_info.get("custom_greeting") or "").strip()
    else:
        display_name = str(user_info).strip()
        pronunciation = ""
        custom_greeting = ""

    spoken_name = pronunciation if pronunciation else display_name
    spoken_custom_greeting = apply_saved_name_pronunciation(
        custom_greeting, display_name, pronunciation
    )
    print(f"\n[VISION ARRIVAL] First boot greeting for newcomer: {display_name} (Phonetic: {spoken_name})")

    # 1. Immediate Interruption Logic (Mid-Sentence)
    if player.busy or is_agent_speaking:
        print(f"[VISION INTERRUPT] Halting current playback mid-sentence for newcomer: {display_name}")
        interrupt_requested = True
        clear_all_queues()
        player.stop()
        time.sleep(0.08)
        interrupt_requested = False

        state = "ACTIVE"
        last_interaction_time = time.time()
        dashboard_server.set_state("ACTIVE")

        if custom_greeting:
            interjection = f"One moment... {custom_greeting}"
            spoken_interjection = f"One moment... {spoken_custom_greeting}"
        else:
            interjection = f"One moment... Hey {display_name}, welcome!"
            spoken_interjection = f"One moment... Hey {spoken_name}, welcome!"
        speak_direct(interjection, spoken_text=spoken_interjection)
    else:
        # 2. Idle / Standby Greeting (Not Speaking)
        print(f"[VISION GREETING] Speaking first-time arrival greeting for: {display_name}")
        audio_feedback.play_wake_chime()
        time.sleep(0.05)

        if custom_greeting:
            greeting = custom_greeting
            spoken_greeting = spoken_custom_greeting
        else:
            greeting = f"Hey {display_name}! Good to see you."
            spoken_greeting = f"Hey {spoken_name}! Good to see you."
        speak_direct(greeting, spoken_text=spoken_greeting)

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

    if event_type == "PROFILE_UPDATED" and user_info:
        updated_id = str(user_info.get("user_id", "")).strip().lower()
        if primary_user and str(primary_user.get("user_id", "")).strip().lower() == updated_id:
            primary_user = dict(user_info)
        visitor_queue = collections.deque(
            dict(user_info) if str(user.get("user_id", "")).strip().lower() == updated_id else user
            for user in visitor_queue
        )
        print(f"[VISION] Refreshed active profile details for {user_info.get('display_name', updated_id)}.")

    elif event_type == "ARRIVAL" and user_info:
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
                on_new_user_arrived(user_info)
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
    # Only split at true sentence ends: . ! ? or two consecutive newlines
    sentence_end_pattern = re.compile(r'((?<![.?!0-9])[.?!]+(?![.?!0-9])(?:\s+|$)|(?:\r?\n){2,})')

    try:
        res = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={
                "model": "qwen2.5:3b",
                "system": system_prompt + f"\n- Speaking with {primary_name} ({primary_role}).",
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

                # Split ONLY at true sentence boundaries (. ! ? or \n\n) - no comma or intra-clause splitting
                while True:
                    found_split = False
                    for m in sentence_end_pattern.finditer(buffer):
                        pos = m.end()
                        cand = buffer[:pos].strip()
                        cand_clean = clean_display_text(cand)
                        if cand_clean:
                            print(f"\n[AGENT STREAMING]: \"{cand_clean}\"")
                            detect_and_broadcast_hardware(cand_clean)
                            dashboard_server.broadcast_stream_chunk("JARVIS", cand_clean)
                            synthesize_and_queue(cand)
                            buffer = buffer[pos:].lstrip()
                            found_split = True
                            break
                    if not found_split:
                        break

        # Flush any remaining trailing text in the buffer to Kokoro
        if buffer.strip() and not interrupt_requested:
            remaining = clean_display_text(buffer)
            if remaining:
                print(f"\n[AGENT STREAMING]: \"{remaining}\"")
                detect_and_broadcast_hardware(remaining)
                dashboard_server.broadcast_stream_chunk("JARVIS", remaining)
                synthesize_and_queue(buffer)

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
    dashboard_server.register_tts_preview_func(synthesize_wav_bytes)
    dashboard_server.set_state("SLEEPING")
    start_presence_bridge(port=8766)

    print("\n" + "=" * 60)
    print("  JARVIS VISION-GATED DUAL-INPUT AGENT")
    print(f"  • Voice Output: Blended Sarah 75% + Nicole 25% (Speed {VOICE_SPEED})")
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

    global capture_device, active_audio_stream
    saved_cfg = load_device_config()
    saved_cam_cfg = dashboard_server.load_camera_config()
    saved_mic_name = saved_cfg.get("agent_mic_name")
    saved_mic_id = saved_cfg.get("agent_mic_device")
    saved_mic_idx = saved_cam_cfg.get("audio_device_index")
    capture_device = None
    if saved_mic_idx is not None:
        capture_device = saved_mic_idx
    elif saved_mic_name or saved_mic_id:
        capture_device = resolve_mic_device(saved_mic_name or "", saved_mic_id or "")

    if capture_device is None:
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
        active_audio_stream = sd.InputStream(device=capture_device, samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                                             blocksize=CHUNK_SIZE, callback=audio_callback)
    except Exception as e:
        print(f"[AUDIO CAPTURE WARNING] Could not initialize device [{capture_device}]: {e}. Falling back to default system input.")
        capture_device = None
        active_audio_stream = sd.InputStream(device=None, samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                                             blocksize=CHUNK_SIZE, callback=audio_callback)

    with active_audio_stream:
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
