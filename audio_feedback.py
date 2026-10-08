import numpy as np
import sounddevice as sd
import threading

SAMPLE_RATE = 24000

def _generate_tone(freq: float, duration_s: float, amplitude: float = 0.28) -> np.ndarray:
    """Generates a sine tone with a smooth Hann envelope to prevent clicking."""
    n_samples = int(duration_s * SAMPLE_RATE)
    if n_samples <= 0:
        return np.array([], dtype=np.float32)
    t = np.linspace(0, duration_s, n_samples, endpoint=False, dtype=np.float32)
    sine_wave = np.sin(2.0 * np.pi * freq * t)
    # Hann window for completely click-free attack and release
    window = 0.5 * (1.0 - np.cos(2.0 * np.pi * np.linspace(0, 1, n_samples, endpoint=False, dtype=np.float32)))
    return (sine_wave * window * amplitude).astype(np.float32)

def _build_wake_chime() -> np.ndarray:
    # Ascending two-tone major third: 523.25 Hz (C5) -> 659.25 Hz (E5), 70ms each
    t1 = _generate_tone(523.25, 0.070, amplitude=0.30)
    t2 = _generate_tone(659.25, 0.070, amplitude=0.32)
    return np.concatenate([t1, t2]).astype(np.float32)

def _build_listening_tick() -> np.ndarray:
    # Subtle, ultra-short 35ms blip (880 Hz)
    return _generate_tone(880.0, 0.035, amplitude=0.22).astype(np.float32)

def _build_sleep_chime() -> np.ndarray:
    # Gentle descending dual-tone: 587.33 Hz (D5) -> 440.00 Hz (A4), 90ms each
    t1 = _generate_tone(587.33, 0.090, amplitude=0.26)
    t2 = _generate_tone(440.00, 0.090, amplitude=0.24)
    return np.concatenate([t1, t2]).astype(np.float32)

# Pre-render earcons at import time for zero-latency instant playback
_WAKE_CHIME = _build_wake_chime()
_LISTENING_TICK = _build_listening_tick()
_SLEEP_CHIME = _build_sleep_chime()

def _play_async(audio_data: np.ndarray):
    """Plays audio array in a fire-and-forget daemon thread."""
    def _worker():
        try:
            sd.play(audio_data, samplerate=SAMPLE_RATE)
            sd.wait()
        except Exception:
            pass
    threading.Thread(target=_worker, daemon=True).start()

def play_wake_chime():
    """Ascending two-tone chime when wake word triggers."""
    _play_async(_WAKE_CHIME)

def play_listening_tick():
    """Short subtle blip when user finishes speaking and processing begins."""
    _play_async(_LISTENING_TICK)

def play_sleep_chime():
    """Descending chime when agent enters standby sleep mode."""
    _play_async(_SLEEP_CHIME)
