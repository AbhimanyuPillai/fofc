import time
import threading
from typing import Optional, Callable, Dict, Any, List
import numpy as np
import cv2

try:
    from .face_engine import FaceEngine
except ImportError:
    from face_engine import FaceEngine

class AgentVisionBridge:
    """
    Asynchronous vision bridge connecting FaceEngine to the voice agent.
    Runs a continuous camera polling loop with a 2.0s sliding hysteresis window,
    emitting arrival/departure hooks and providing identity locking.
    """
    def __init__(
        self,
        engine: Optional[FaceEngine] = None,
        camera_index: int = 0,
        target_fps: float = 18.0,
        absence_timeout: float = 2.0,
        on_user_arrived: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_user_left: Optional[Callable[[str], None]] = None
    ):
        self.engine = engine if engine is not None else FaceEngine()
        self.camera_index = camera_index
        self.target_fps = target_fps
        self.absence_timeout = absence_timeout
        self.poll_interval = 1.0 / max(1.0, target_fps)

        # Callbacks
        self.on_user_arrived = on_user_arrived
        self.on_user_left = on_user_left

        # Threading state
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()

        # Camera capture
        self._cap: Optional[cv2.VideoCapture] = None
        self._external_frame: Optional[np.ndarray] = None
        self._external_frame_consumed = True

        # Presence tracking state:
        # {user_id: {"user_info": dict, "last_seen": float, "first_seen": float}}
        self.active_users: Dict[str, Dict[str, Any]] = {}
        self.last_detection_result: List[Dict[str, Any]] = []

    def start(self) -> None:
        """Starts the background camera acquisition and tracking thread."""
        with self._lock:
            if self._running:
                return

            self._running = True
            # Attempt opening camera
            try:
                self._cap = cv2.VideoCapture(self.camera_index)
                if not self._cap.isOpened():
                    print(f"[AgentVisionBridge] Warning: Camera {self.camera_index} not accessible. Ready for feed_frame() input.")
                    self._cap = None
                else:
                    self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            except Exception as e:
                print(f"[AgentVisionBridge] Camera init exception: {e}")
                self._cap = None

            self._thread = threading.Thread(target=self._worker_loop, daemon=True, name="VisionBridgeThread")
            self._thread.start()
            print(f"[AgentVisionBridge] Vision tracking loop started (Target: {self.target_fps} FPS, Hysteresis: {self.absence_timeout}s)")

    def stop(self) -> None:
        """Stops the tracking thread and releases camera resources."""
        with self._lock:
            self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)

        with self._lock:
            if self._cap:
                self._cap.release()
                self._cap = None
            self.active_users.clear()
            print("[AgentVisionBridge] Vision tracking loop stopped.")

    def feed_frame(self, frame_bgr: np.ndarray) -> None:
        """Allows feeding frames manually (e.g., from test scripts, web streams, or RTSP)."""
        with self._lock:
            self._external_frame = frame_bgr
            self._external_frame_consumed = False

    def get_current_active_user(self) -> Optional[Dict[str, Any]]:
        """
        Returns identity of the primary active user for agent locking.
        Selects the user with the most recent detection within the hysteresis window.
        """
        with self._lock:
            now = time.time()
            valid_users = [
                u for u in self.active_users.values()
                if (now - u["last_seen"]) <= self.absence_timeout
            ]
            if not valid_users:
                return None

            # Sort by most recently seen
            valid_users.sort(key=lambda u: u["last_seen"], reverse=True)
            return valid_users[0]["user_info"]

    def get_present_users(self) -> List[Dict[str, Any]]:
        """Returns list of all recognized users currently within the hysteresis window."""
        with self._lock:
            now = time.time()
            return [
                u["user_info"] for u in self.active_users.values()
                if (now - u["last_seen"]) <= self.absence_timeout
            ]

    def _worker_loop(self) -> None:
        while self._running:
            start_time = time.time()
            frame = None

            with self._lock:
                if not self._external_frame_consumed and self._external_frame is not None:
                    frame = self._external_frame
                    self._external_frame_consumed = True
                elif self._cap is not None:
                    ret, cam_frame = self._cap.read()
                    if ret:
                        frame = cam_frame

            if frame is not None:
                self._process_cycle(frame)
            else:
                # Check for timeouts even if no frame arrived
                self._check_timeouts()

            elapsed = time.time() - start_time
            sleep_duration = max(0.005, self.poll_interval - elapsed)
            time.sleep(sleep_duration)

    def _process_cycle(self, frame: np.ndarray) -> None:
        now = time.time()
        detections = self.engine.process_frame(frame)

        with self._lock:
            self.last_detection_result = detections

            for d in detections:
                uid = d.get("user_id")
                if uid and uid != "unknown":
                    if uid not in self.active_users:
                        # User arrived hook
                        self.active_users[uid] = {
                            "user_info": d,
                            "last_seen": now,
                            "first_seen": now
                        }
                        print(f"[AgentVisionBridge] >>> USER ARRIVED: {d.get('display_name')} (ID: {uid}, Score: {d.get('score')})")
                        if self.on_user_arrived:
                            try:
                                self.on_user_arrived(d)
                            except Exception as e:
                                print(f"[AgentVisionBridge ERROR] in on_user_arrived: {e}")
                    else:
                        # Update presence timestamp
                        self.active_users[uid]["last_seen"] = now
                        self.active_users[uid]["user_info"] = d

            self._check_timeouts()

    def _check_timeouts(self) -> None:
        now = time.time()
        departed_uids = []

        for uid, data in list(self.active_users.items()):
            if (now - data["last_seen"]) > self.absence_timeout:
                departed_uids.append(uid)

        for uid in departed_uids:
            del self.active_users[uid]
            print(f"[AgentVisionBridge] <<< USER LEFT: {uid} (Exceeded {self.absence_timeout}s absence)")
            if self.on_user_left:
                try:
                    self.on_user_left(uid)
                except Exception as e:
                    print(f"[AgentVisionBridge ERROR] in on_user_left: {e}")

if __name__ == "__main__":
    print("=" * 65)
    print("  JARVIS VISION AGENT BRIDGE - STANDALONE MONITOR")
    print("  Tracking active faces with 2.0s arrival/departure hysteresis")
    print("  Press Ctrl+C to stop.")
    print("=" * 65 + "\n")

    def on_arrive(user_info):
        print(f"\n[EVENT: ARRIVAL] {user_info.get('display_name')} (ID: {user_info.get('user_id')}, Role: {user_info.get('role')})")
        greeting = user_info.get('custom_greeting')
        if greeting:
            print(f"  Voice Greeting Trigger: \"{greeting}\"")

    def on_leave(uid):
        print(f"\n[EVENT: DEPARTURE] User {uid} left.")

    bridge = AgentVisionBridge(
        camera_index=0,
        target_fps=18.0,
        absence_timeout=2.0,
        on_user_arrived=on_arrive,
        on_user_left=on_leave
    )
    bridge.start()

    try:
        while True:
            time.sleep(1.0)
            active = bridge.get_current_active_user()
            if active:
                print(f"[STATUS] Active locked user: {active.get('display_name')} (Score: {active.get('score')})", end="\r", flush=True)
            else:
                print("[STATUS] No recognized user in frame...                        ", end="\r", flush=True)
    except KeyboardInterrupt:
        print("\nStopping vision bridge...")
    finally:
        bridge.stop()

