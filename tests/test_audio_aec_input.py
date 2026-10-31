import queue
import threading
from types import SimpleNamespace

import numpy as np

from audio_aec_input import AecAwareInputStream, AudioFrameAccumulator


def test_audio_frame_accumulator_emits_exact_fixed_size_frames():
    accumulator = AudioFrameAccumulator(frame_samples=512)

    assert accumulator.push(np.arange(320, dtype=np.float32)) == []
    frames = accumulator.push(np.arange(320, 640, dtype=np.float32))

    assert len(frames) == 1
    assert frames[0].shape == (512,)
    np.testing.assert_array_equal(frames[0], np.arange(512, dtype=np.float32))


def test_aec_48khz_blocks_are_resampled_and_queued_as_model_frames():
    stream = AecAwareInputStream.__new__(AecAwareInputStream)
    stream._closed = False
    stream.model_rate = 16_000
    stream.frame_samples = 512
    stream._accumulator = AudioFrameAccumulator(512)
    stream._accumulator_lock = threading.Lock()
    stream._frame_queue = queue.Queue(maxsize=16)
    stream._dropped_frames = 0
    stream._last_status = {}
    block = np.ones(960, dtype=np.float32)
    frame = SimpleNamespace(
        microphone_present=True,
        microphone_clean=block,
        state=None,
    )

    stream._on_aec_frame(frame)
    assert stream._frame_queue.empty()
    stream._on_aec_frame(frame)

    model_frame = stream._frame_queue.get_nowait()
    assert model_frame.shape == (512,)
    assert model_frame.dtype == np.float32
    assert stream._dropped_frames == 0


def test_aec_silence_or_missing_microphone_is_not_forwarded():
    stream = AecAwareInputStream.__new__(AecAwareInputStream)
    stream._closed = False
    stream.model_rate = 16_000
    stream.frame_samples = 512
    stream._accumulator = AudioFrameAccumulator(512)
    stream._accumulator_lock = threading.Lock()
    stream._frame_queue = queue.Queue(maxsize=16)
    stream._dropped_frames = 0
    stream._last_status = {}

    stream._on_aec_frame(SimpleNamespace(microphone_present=False))

    assert stream._frame_queue.empty()
