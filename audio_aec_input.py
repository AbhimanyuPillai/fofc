"""AEC-aware Windows microphone input with a safe PortAudio fallback."""

from __future__ import annotations

import os
import queue
import re
import threading
from typing import Any, Callable, Optional

import numpy as np
import sounddevice as sd
from scipy.signal import resample_poly

try:
    from echoff import AecCapture, AecConfig
except Exception as import_error:  # Keep normal mic capture available if the optional AEC is absent.
    AecCapture = None  # type: ignore[assignment,misc]
    AecConfig = None  # type: ignore[assignment,misc]
    AEC_IMPORT_ERROR: Optional[BaseException] = import_error
else:
    AEC_IMPORT_ERROR = None


AEC_ENABLED = os.environ.get("REPOS_AEC_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
MODEL_RATE = 16_000
MODEL_FRAME_SAMPLES = 512
AEC_RATE = 48_000
AEC_BLOCK_SAMPLES = 960  # Echoff default: 20 ms at 48 kHz.


class AudioFrameAccumulator:
    """Convert arbitrary mono chunks into fixed-size model frames."""

    def __init__(self, frame_samples: int = MODEL_FRAME_SAMPLES):
        if frame_samples <= 0:
            raise ValueError("frame_samples must be positive")
        self.frame_samples = frame_samples
        self._pending = np.empty(0, dtype=np.float32)

    def push(self, samples: np.ndarray) -> list[np.ndarray]:
        samples = np.asarray(samples, dtype=np.float32).reshape(-1)
        if not samples.size:
            return []
        self._pending = np.concatenate((self._pending, samples))
        frame_count = len(self._pending) // self.frame_samples
        if not frame_count:
            return []
        usable = frame_count * self.frame_samples
        frames = [
            frame.copy()
            for frame in np.split(self._pending[:usable], frame_count)
        ]
        self._pending = self._pending[usable:].copy()
        return frames


def _normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


class AecAwareInputStream:
    """Use WASAPI loopback + WebRTC AEC, falling back to the selected raw mic."""

    def __init__(
        self,
        device_index: Optional[int],
        audio_callback: Callable[..., None],
        model_rate: int = MODEL_RATE,
        frame_samples: int = MODEL_FRAME_SAMPLES,
    ):
        self.device_index = device_index
        self.audio_callback = audio_callback
        self.model_rate = model_rate
        self.frame_samples = frame_samples
        try:
            self.device_name = str(sd.query_devices(device_index, "input").get("name", "")).strip()
        except Exception:
            self.device_name = ""

        self._capture: Any = None
        self._raw_stream: Any = None
        self._worker: Optional[threading.Thread] = None
        self._worker_stop = threading.Event()
        self._frame_queue: queue.Queue[Optional[np.ndarray]] = queue.Queue(maxsize=16)
        self._accumulator = AudioFrameAccumulator(frame_samples)
        self._accumulator_lock = threading.Lock()
        self._lifecycle_lock = threading.RLock()
        self._mode = "not_started"
        self._fallback_reason = ""
        self._last_error = ""
        self._last_status: dict[str, Any] = {}
        self._dropped_frames = 0
        self._closed = False

    @property
    def aec_active(self) -> bool:
        return self._mode == "aec"

    @property
    def mode(self) -> str:
        return self._mode

    def start(self) -> "AecAwareInputStream":
        with self._lifecycle_lock:
            if self._mode not in {"not_started", "stopped"}:
                return self
            self._closed = False
            if AEC_ENABLED and AecCapture is not None and AecConfig is not None:
                try:
                    self._start_aec()
                    return self
                except Exception as exc:
                    self._last_error = str(exc)
                    self._fallback_reason = f"AEC startup failed: {exc}"
                    self._stop_capture()
                    self._stop_worker()
                    print(f"[AEC WARNING] {self._fallback_reason}; using raw microphone capture.")
            elif AEC_ENABLED and AEC_IMPORT_ERROR is not None:
                self._fallback_reason = f"AEC package unavailable: {AEC_IMPORT_ERROR}"
                print(f"[AEC WARNING] {self._fallback_reason}; using raw microphone capture.")
            elif not AEC_ENABLED:
                self._fallback_reason = "AEC disabled by REPOS_AEC_ENABLED"

            self._start_raw()
            return self

    def _start_aec(self) -> None:
        self._start_worker()
        self._capture = AecCapture(
            AecConfig(
                backend="windows",
                sample_rate=AEC_RATE,
                channels=1,
                block_duration_s=0.020,
                stream_delay_ms=int(os.environ.get("REPOS_AEC_DELAY_MS", "50")),
                noise_suppression=False,
                high_pass_filter=True,
                automatic_gain_control=False,
            ),
            on_frame=self._on_aec_frame,
            on_event=self._on_aec_event,
            reference_device=None,
            microphone_device=self.device_name or None,
            console_diagnostics=False,
        )
        self._capture.start()
        self._capture.raise_if_failed()
        self._last_status = self._capture.status().to_dict()
        selected_name = str(self._last_status.get("microphone_device_name") or "").strip()
        requested = _normalized_name(self.device_name)
        selected = _normalized_name(selected_name)
        if requested and selected and requested not in selected and selected not in requested:
            raise RuntimeError(
                f"AEC opened '{selected_name}', not the selected microphone '{self.device_name}'"
            )
        self._mode = "aec"
        reference_name = self._last_status.get("reference_device_name") or "system default output"
        print(
            f"[AEC] Active: mic={selected_name or self.device_name or 'system default'}, "
            f"playback reference={reference_name}; awaiting echo-path readiness."
        )

    def _start_raw(self) -> None:
        try:
            info = sd.query_devices(self.device_index, "input")
            default_rate = int(round(float(info.get("default_samplerate") or self.model_rate)))
            candidates = list(dict.fromkeys((default_rate, 48_000, 44_100, 32_000, self.model_rate)))
            last_error: Optional[BaseException] = None
            for rate in candidates:
                try:
                    sd.check_input_settings(device=self.device_index, samplerate=rate, channels=1)
                    blocksize = max(1, int(round(self.frame_samples * rate / self.model_rate)))
                    self._raw_stream = sd.InputStream(
                        device=self.device_index,
                        samplerate=rate,
                        channels=1,
                        dtype="float32",
                        blocksize=blocksize,
                        callback=lambda data, frames, time_info, status, input_rate=rate:
                            self.audio_callback(
                                data, frames, time_info, status, input_sample_rate=input_rate
                            ),
                    )
                    self._raw_stream.start()
                    self._mode = "raw_fallback" if self._fallback_reason else "raw"
                    print(f"[AUDIO CAPTURE] Raw microphone active at {rate} Hz ({self.device_name or 'system default'}).")
                    return
                except Exception as exc:
                    last_error = exc
                    if self._raw_stream is not None:
                        try:
                            self._raw_stream.close()
                        except Exception:
                            pass
                        self._raw_stream = None
            raise RuntimeError(f"Could not open raw microphone: {last_error}") from last_error
        except Exception:
            self._mode = "stopped"
            raise

    def _start_worker(self) -> None:
        self._worker_stop.clear()
        self._worker = threading.Thread(
            target=self._dispatch_clean_audio,
            name="AecAudioDispatch",
            daemon=True,
        )
        self._worker.start()

    def _dispatch_clean_audio(self) -> None:
        while not self._worker_stop.is_set():
            try:
                frame = self._frame_queue.get(timeout=0.1)
            except queue.Empty:
                continue
            if frame is None:
                break
            try:
                self.audio_callback(
                    frame.reshape(-1, 1),
                    self.frame_samples,
                    None,
                    None,
                    input_sample_rate=self.model_rate,
                )
            except Exception as exc:
                self._last_error = f"AEC audio dispatch failed: {exc}"
                print(f"[AEC ERROR] {self._last_error}")

    def _on_aec_frame(self, frame: Any) -> None:
        if self._closed or not getattr(frame, "microphone_present", True):
            return
        clean_48k = np.asarray(frame.microphone_clean, dtype=np.float32).reshape(-1)
        clean_16k = resample_poly(clean_48k, self.model_rate, AEC_RATE).astype(np.float32, copy=False)
        with self._accumulator_lock:
            ready_frames = self._accumulator.push(clean_16k)
        for model_frame in ready_frames:
            try:
                self._frame_queue.put_nowait(model_frame)
            except queue.Full:
                self._dropped_frames += 1
                try:
                    self._frame_queue.get_nowait()
                except queue.Empty:
                    pass
                try:
                    self._frame_queue.put_nowait(model_frame)
                except queue.Full:
                    pass

        state = getattr(frame, "state", None)
        if state is not None:
            self._last_status.update({
                "echo_path_ready": bool(getattr(state, "echo_path_ready", False)),
                "echo_path_quality_ready": bool(getattr(state, "echo_path_quality_ready", False)),
                "echo_suppression_db": getattr(state, "echo_suppression_db", None),
                "alignment_mode": getattr(state, "alignment_mode", None),
            })

    def _on_aec_event(self, event: Any) -> None:
        kind = str(getattr(event, "kind", "") or "")
        if kind and any(token in kind.casefold() for token in ("failure", "degraded", "reset")):
            print(f"[AEC EVENT] {kind}")

    def get_diagnostics(self) -> dict[str, Any]:
        status = dict(self._last_status)
        return {
            "aec_active": self.aec_active,
            "aec_mode": self._mode,
            "aec_microphone_device": status.get("microphone_device_name") or self.device_name,
            "aec_path_ready": bool(status.get("echo_path_ready", False)),
            "aec_quality_ready": bool(status.get("echo_path_quality_ready", False)),
            "aec_suppression_db": status.get("echo_suppression_db"),
            "aec_reference_device": status.get("reference_device_name"),
            "aec_dropped_frames": self._dropped_frames,
            "aec_last_error": self._last_error or self._fallback_reason,
        }

    def check_health(self) -> None:
        capture = self._capture
        if self._mode != "aec" or capture is None:
            return
        try:
            capture.raise_if_failed()
            self._last_status = capture.status().to_dict() | {
                key: value for key, value in self._last_status.items()
                if key in {"echo_path_ready", "echo_path_quality_ready", "echo_suppression_db"}
            }
        except Exception as exc:
            self._last_error = str(exc)
            self._fallback_reason = f"AEC stream failed: {exc}"
            print(f"[AEC WARNING] {self._fallback_reason}; switching to raw microphone capture.")
            with self._lifecycle_lock:
                self._stop_capture()
                self._stop_worker()
                self._mode = "not_started"
                self._start_raw()

    def _stop_capture(self) -> None:
        capture, self._capture = self._capture, None
        if capture is not None:
            try:
                capture.stop()
            except Exception as exc:
                self._last_error = f"AEC shutdown: {exc}"

    def _stop_worker(self) -> None:
        self._worker_stop.set()
        while True:
            try:
                self._frame_queue.put_nowait(None)
                break
            except queue.Full:
                try:
                    self._frame_queue.get_nowait()
                except queue.Empty:
                    break
            except Exception:
                break
        worker, self._worker = self._worker, None
        if worker and worker is not threading.current_thread():
            worker.join(timeout=2.0)

    def stop(self) -> None:
        with self._lifecycle_lock:
            self._closed = True
            self._stop_capture()
            self._stop_worker()
            if self._raw_stream is not None:
                try:
                    self._raw_stream.stop()
                finally:
                    self._raw_stream.close()
                    self._raw_stream = None
            self._mode = "stopped"

    def close(self) -> None:
        self.stop()

    def __enter__(self) -> "AecAwareInputStream":
        return self.start()

    def __exit__(self, exc_type: Any, exc_value: Any, traceback: Any) -> None:
        self.stop()
