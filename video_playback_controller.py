"""
Video Playback Controller for Repos Booth Agent
Manages the partial standby state during video playback to prevent TV speaker audio feedback loops.
"""

import re
import threading
from typing import Optional, Callable, Dict, Any

# Wake phrase variants: 'hey repos', 'hay repos', 'ay repos', 'hey repose', 'repos'
WAKE_PREFIX = r"(?:\b(?:hey|hay|ay)\s+(?:repos|repose|raypos|repo|ripples|rappos)\b|\brepos\b)"

# Actions
PAUSE_ACTIONS = r"(?:pause\s+(?:the\s+)?(?:video|demo|playback)|pause|freeze|hold\s+on)"
STOP_ACTIONS = r"(?:stop\s+(?:the\s+)?(?:video|demo|playback)|stop|end\s+(?:the\s+)?(?:video|demo)|close\s+(?:the\s+)?(?:video|demo)|cancel\s+(?:the\s+)?(?:video|demo))"
RESUME_ACTIONS = r"(?:resume\s+(?:the\s+)?(?:video|demo|playback)|resume|continue\s+(?:the\s+)?(?:video|demo|playback)|continue|play\s+(?:the\s+)?(?:video|demo|playback)|unpause)"

RE_PAUSE = re.compile(
    rf"{WAKE_PREFIX}.*?\b{PAUSE_ACTIONS}\b|\b{PAUSE_ACTIONS}\b.*?\b(?:repos|repose)\b",
    re.IGNORECASE
)

RE_STOP = re.compile(
    rf"{WAKE_PREFIX}.*?\b{STOP_ACTIONS}\b|\b{STOP_ACTIONS}\b.*?\b(?:repos|repose)\b",
    re.IGNORECASE
)

RE_RESUME = re.compile(
    rf"{WAKE_PREFIX}.*?\b{RESUME_ACTIONS}\b|\b{RESUME_ACTIONS}\b.*?\b(?:repos|repose)\b",
    re.IGNORECASE
)

class VideoPlaybackController:
    def __init__(self):
        self._lock = threading.Lock()
        self._is_playing = False
        self._current_product_id: Optional[int] = None
        self._last_product_id: Optional[int] = None
        self._bridge = None
        self._dashboard = None

    def init(self, projection_bridge, dashboard_server=None):
        """Initialize with projection bridge and dashboard server."""
        self._bridge = projection_bridge
        self._dashboard = dashboard_server
        if self._bridge and hasattr(self._bridge, "set_playback_callback"):
            self._bridge.set_playback_callback(self.on_projection_playback_event)
            print("[VIDEO CONTROLLER] Registered playback callback with projection_bridge")

    def is_active(self) -> bool:
        """Returns True if video is currently playing and agent is in video partial standby."""
        with self._lock:
            return self._is_playing

    def has_video_session(self) -> bool:
        """Return whether a playing or paused product video is still controllable."""
        with self._lock:
            return self._current_product_id is not None or self._last_product_id is not None

    def _restore_dashboard_state(self):
        if self._dashboard and hasattr(self._dashboard, "set_state"):
            self._dashboard.set_state("VIDEO_PLAYING" if self.is_active() else "ACTIVE")

    def set_playing(self, playing: bool, product_id: Optional[int] = None):
        """Update video playing state."""
        with self._lock:
            prev = self._is_playing
            self._is_playing = playing
            if product_id is not None:
                self._current_product_id = product_id
                self._last_product_id = product_id
            elif not playing:
                self._current_product_id = None

        if prev != playing:
            state_label = "VIDEO_PLAYING" if playing else "ACTIVE"
            print(f"[VIDEO CONTROLLER] Video state changed: playing={playing} -> Agent state: {state_label}")
            if self._dashboard and hasattr(self._dashboard, "set_state"):
                self._dashboard.set_state(state_label)

    def on_projection_playback_event(self, action: str, state: Dict[str, Any]):
        """
        Callback invoked by projection_bridge when video-projection broadcasts an action
        over WebSocket (e.g., play, pause, stop, or video finished onended).
        """
        action = str(action or "").lower().strip()
        raw_product_id = state.get("productId") if isinstance(state, dict) else None
        try:
            prod_id = int(raw_product_id) if raw_product_id is not None else None
        except (ValueError, TypeError):
            prod_id = None

        if action == "play":
            print(f"[VIDEO CONTROLLER] Video started playing (Product ID: {prod_id}). Entering partial standby.")
            self.set_playing(True, prod_id)
        elif action in ("pause", "stop"):
            reason = "paused" if action == "pause" else "stopped or finished"
            print(f"[VIDEO CONTROLLER] Video {reason}. Exiting partial standby -> Normal conversation mode.")
            if action == "pause" and prod_id is not None:
                with self._lock:
                    self._last_product_id = prod_id
            self.set_playing(False)
            if action == "stop":
                with self._lock:
                    self._last_product_id = None

    def evaluate_standby_speech(self, text: str) -> Optional[str]:
        """
        Checks if the utterance is a wake + pause/stop/resume command.
        Returns 'pause', 'stop', 'resume', or None.
        """
        if not text:
            return None
        cleaned = re.sub(r"[^\w\s]", " ", text.lower()).strip()
        cleaned = " ".join(cleaned.split())

        # Check pause first, then stop, then resume
        if RE_PAUSE.search(cleaned):
            return "pause"
        if RE_STOP.search(cleaned):
            return "stop"
        if RE_RESUME.search(cleaned):
            return "resume"
        return None

    def execute_pause(self, speak_fn: Optional[Callable[[str], None]] = None) -> bool:
        """Executes pause on TV and restores agent to active conversation."""
        print("[VIDEO CONTROLLER] Executing video PAUSE command...")
        with self._lock:
            prod_id = self._current_product_id or self._last_product_id
        success = bool(self._bridge and hasattr(self._bridge, "pause_video") and
                       self._bridge.pause_video(prod_id))
        if not success:
            if speak_fn:
                speak_fn("I couldn't reach the TV to pause the video.")
            self._restore_dashboard_state()
            return False
        self.set_playing(False)
        if speak_fn:
            try:
                speak_fn("Pausing the video.")
            except Exception as e:
                print(f"[VIDEO CONTROLLER] Speech confirmation error: {e}")
        self._restore_dashboard_state()
        return True

    def execute_stop(self, speak_fn: Optional[Callable[[str], None]] = None) -> bool:
        """Executes stop on TV and restores agent to active conversation."""
        print("[VIDEO CONTROLLER] Executing video STOP command...")
        with self._lock:
            prod_id = self._current_product_id or self._last_product_id
        success = bool(self._bridge and hasattr(self._bridge, "stop_video") and
                       self._bridge.stop_video(prod_id))
        if not success:
            if speak_fn:
                speak_fn("I couldn't reach the TV to stop the video.")
            self._restore_dashboard_state()
            return False
        self.set_playing(False)
        with self._lock:
            self._current_product_id = None
            self._last_product_id = None
        if speak_fn:
            try:
                speak_fn("Stopping the video.")
            except Exception as e:
                print(f"[VIDEO CONTROLLER] Speech confirmation error: {e}")
        self._restore_dashboard_state()
        return True

    def execute_resume(self, speak_fn: Optional[Callable[[str], None]] = None) -> bool:
        """Executes resume on TV and re-enters video partial standby."""
        print("[VIDEO CONTROLLER] Executing video RESUME command...")
        if self.is_active():
            if speak_fn:
                speak_fn("The video is already playing.")
            self._restore_dashboard_state()
            return True
        with self._lock:
            prod_id = self._last_product_id
        if prod_id is None:
            if speak_fn:
                speak_fn("There isn't a paused demo video to resume.")
            self._restore_dashboard_state()
            return False
        success = bool(self._bridge and hasattr(self._bridge, "resume_video") and
                       self._bridge.resume_video(prod_id))
        if not success:
            if speak_fn:
                speak_fn("I couldn't reach the TV to resume the video.")
            self._restore_dashboard_state()
            return False
        self.set_playing(True, prod_id)
        if speak_fn:
            try:
                speak_fn("Resuming the video.")
            except Exception as e:
                print(f"[VIDEO CONTROLLER] Speech confirmation error: {e}")
        self._restore_dashboard_state()
        return True

    def handle_if_active(self, user_text: str, speak_fn: Optional[Callable[[str], None]] = None) -> bool:
        """
        Call this in live_agent.py after speech transcription.
        If video is playing (partial standby):
          - If user says 'hey repos pause [video]' -> pauses, speaks confirmation, reverts to ACTIVE, returns True.
          - If user says 'hey repos stop [video]' -> stops, speaks confirmation, reverts to ACTIVE, returns True.
          - If user says 'hey repos resume [video]' -> resumes, speaks confirmation, keeps standby, returns True.
          - Otherwise -> silently ignores background / TV speaker audio, returns True.
        If video is NOT playing:
          - Returns False (proceed with normal conversation / LLM handling).
        """
        if not self.is_active():
            return False

        intent = self.evaluate_standby_speech(user_text)
        if intent == "pause":
            self.execute_pause(speak_fn)
            return True
        elif intent == "stop":
            self.execute_stop(speak_fn)
            return True
        elif intent == "resume":
            self.execute_resume(speak_fn)
            return True
        else:
            print(f"[VIDEO STANDBY GATE] TV playback active. Discarded overheard audio: \"{user_text}\"")
            if self._dashboard and hasattr(self._dashboard, "set_state"):
                self._dashboard.set_state("VIDEO_PLAYING")
            return True

# Global singleton
video_controller = VideoPlaybackController()
