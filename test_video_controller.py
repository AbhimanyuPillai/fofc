import sys
import os

# Add workspace to path
sys.path.insert(0, os.path.abspath("."))
from video_playback_controller import video_controller

class MockBridge:
    def __init__(self):
        self.paused = False
        self.stopped = False
        self.callback = None
    def set_playback_callback(self, cb):
        self.callback = cb
    def pause_video(self):
        self.paused = True
    def stop_video(self):
        self.stopped = True

class MockDashboard:
    def __init__(self):
        self.state = None
    def set_state(self, s):
        self.state = s

mock_bridge = MockBridge()
mock_dashboard = MockDashboard()
video_controller.init(mock_bridge, mock_dashboard)

# Test 1: Regex intent detection
test_cases = [
    ("hey repos pause the video", "pause"),
    ("hey repos pause", "pause"),
    ("hey repos please pause the demo", "pause"),
    ("hey repos stop the video", "stop"),
    ("hey repos stop", "stop"),
    ("hey repos stop playback", "stop"),
    ("repos pause", "pause"),
    ("repos stop", "stop"),
    ("can you explain to me what one sync does?", None),
    ("the smart c throttle controller prevents runaway", None),
    ("what is the price of this board", None),
]

for phrase, expected in test_cases:
    actual = video_controller.evaluate_standby_speech(phrase)
    assert actual == expected, f"Failed on '{phrase}': expected {expected}, got {actual}"
print("[TEST 1 PASSED] Regex intent detection works for all test phrases.")

# Test 2: Inactive state returns False
assert not video_controller.is_active()
assert video_controller.handle_if_active("tell me about one sync") == False
print("[TEST 2 PASSED] Inactive state passes normal speech through.")

# Test 3: Play event enters video partial standby
mock_bridge.callback("play", {"productId": 1})
assert video_controller.is_active() == True
assert mock_dashboard.state == "VIDEO_PLAYING"
print("[TEST 3 PASSED] Video play event enters VIDEO_PLAYING standby.")

# Test 4: Background speech is discarded during video standby
spoken = []
def mock_speak(text):
    spoken.append(text)

assert video_controller.handle_if_active("audio playing from the television speaker", mock_speak) == True
assert len(spoken) == 0, "Should not speak for background noise"
assert video_controller.is_active() == True
print("[TEST 4 PASSED] TV audio successfully discarded without calling LLM or speaking.")

# Test 5: 'Hey Repos pause the video' pauses and restores active state
assert video_controller.handle_if_active("hey repos pause the video", mock_speak) == True
assert mock_bridge.paused == True
assert video_controller.is_active() == False
assert "Pausing the video." in spoken
print("[TEST 5 PASSED] Pause command executed, confirmation spoken, normal mode restored.")

# Test 6: Normal speech flows again without needing 'Hey Repos'
assert video_controller.handle_if_active("what is smart c?", mock_speak) == False
print("[TEST 6 PASSED] Normal speech now processed without 'Hey Repos'.")

# Test 7: Video finishes naturally on TV (stop broadcast)
mock_bridge.callback("play", {"productId": 3})
assert video_controller.is_active() == True
mock_bridge.callback("stop", {})
assert video_controller.is_active() == False
print("[TEST 7 PASSED] Video natural finish (stop event) restores normal mode automatically.")

print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")
