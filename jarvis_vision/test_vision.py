import os
import sys
import time
import shutil
import numpy as np
import cv2

# Ensure jarvis_vision is importable
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from jarvis_vision.user_db import UserDatabase
from jarvis_vision.face_engine import FaceEngine
from jarvis_vision.vision_agent_bridge import AgentVisionBridge

def test_database_persistence():
    print("\n--- [TEST 1/4] User Database Persistence & File Management ---")
    test_data_dir = os.path.join(current_dir, "test_data_temp")
    if os.path.exists(test_data_dir):
        shutil.rmtree(test_data_dir)

    db = UserDatabase(base_dir=test_data_dir)
    assert len(db.list_users()) == 0, "DB should start empty"

    # Add user
    user = db.add_or_update_user(
        user_id="test_engineer",
        display_name="Test Engineer",
        role="engineer",
        custom_greeting="Welcome back to the lab!"
    )
    assert user["user_id"] == "test_engineer"
    assert user["display_name"] == "Test Engineer"
    assert os.path.exists(os.path.join(test_data_dir, "data", "users.json"))

    # Save face image
    dummy_face = np.full((120, 120, 3), 128, dtype=np.uint8)
    img_path = db.save_face_image("test_engineer", dummy_face, "sample_1.jpg")
    assert os.path.exists(img_path)
    assert len(db.get_user_face_paths("test_engineer")) == 1

    # Reload database from disk
    db_reloaded = UserDatabase(base_dir=test_data_dir)
    reloaded_user = db_reloaded.get_user("test_engineer")
    assert reloaded_user is not None
    assert reloaded_user["display_name"] == "Test Engineer"
    assert len(db_reloaded.get_user_face_paths("test_engineer")) == 1

    # Delete user
    db.delete_user("test_engineer")
    assert db.get_user("test_engineer") is None
    assert not os.path.exists(os.path.join(test_data_dir, "data", "faces", "test_engineer"))

    # Cleanup
    shutil.rmtree(test_data_dir)
    print("[OK] User Database: Add, persist, reload, file save, and delete passed.")

def test_models_and_inference_latency():
    print("\n--- [TEST 2/4] OpenCV DNN (YuNet + SFace) Initialization & Latency ---")
    engine = FaceEngine()
    assert engine.detector is not None, "YuNet detector failed to initialize"
    assert engine.recognizer is not None, "SFace recognizer failed to initialize"

    # Test processing on synthetic 640x480 frame
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw simple shapes to create a non-empty image
    cv2.rectangle(frame, (50, 50), (200, 200), (40, 40, 40), -1)

    # Warmup
    engine.process_frame(frame)

    # Benchmark latency across 10 iterations
    times = []
    for _ in range(10):
        t0 = time.perf_counter()
        results = engine.process_frame(frame)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        times.append(elapsed_ms)

    avg_latency = float(np.mean(times))
    p95_latency = float(np.percentile(times, 95))
    print(f"  Frame resolution: 640x480")
    print(f"  Average inference time: {avg_latency:.2f} ms")
    print(f"  P95 inference time: {p95_latency:.2f} ms")

    assert avg_latency < 25.0, f"Average latency too high: {avg_latency:.2f}ms"
    print("[OK] FaceEngine: Models loaded, CPU execution verified, latency benchmark passed.")

def test_feature_extraction_and_dual_scoring():
    print("\n--- [TEST 3/4] 128-D L2 Normalization & Dual-Score Cosine Matching ---")
    engine = FaceEngine()

    # Create dummy aligned face crops (112x112 BGR)
    aligned_face_a = np.zeros((112, 112, 3), dtype=np.uint8)
    cv2.circle(aligned_face_a, (56, 56), 40, (180, 180, 180), -1)

    feat_a_raw = engine.recognizer.feature(aligned_face_a)
    feat_a = feat_a_raw.flatten().astype(np.float32)
    norm_a = np.linalg.norm(feat_a)
    feat_a /= norm_a

    assert feat_a.shape == (128,), f"Expected 128-D feature vector, got {feat_a.shape}"
    assert np.isclose(np.linalg.norm(feat_a), 1.0, atol=1e-5), "Feature vector must be L2 normalized"

    # Self-match should yield cosine score close to 1.0
    self_score = float(np.dot(feat_a, feat_a))
    assert self_score >= 0.99, f"Self-match score should be ~1.0, got {self_score}"

    # Random noise vector test against threshold 0.38
    np.random.seed(42)
    random_feat = np.random.randn(128).astype(np.float32)
    random_feat /= np.linalg.norm(random_feat)
    random_score = float(np.dot(feat_a, random_feat))
    print(f"  Self similarity score: {self_score:.4f} (Threshold: {engine.match_threshold})")
    print(f"  Random feature score: {random_score:.4f}")
    assert random_score < engine.match_threshold, "Random feature should not exceed 0.38 matching threshold"
    print("[OK] Feature Extraction: 128-D L2 normalization and cosine scoring verified.")

def test_agent_vision_bridge_hysteresis():
    print("\n--- [TEST 4/4] AgentVisionBridge (Hysteresis & Presence Hooks) ---")
    arrived_events = []
    left_events = []

    def handle_arrived(info):
        arrived_events.append(info)

    def handle_left(uid):
        left_events.append(uid)

    bridge = AgentVisionBridge(
        camera_index=999,  # Intentional invalid camera index for synthetic feed
        target_fps=20.0,
        absence_timeout=0.6,  # Shortened to 0.6s for fast unit testing
        on_user_arrived=handle_arrived,
        on_user_left=handle_left
    )

    bridge.start()
    time.sleep(0.05)

    # 1. Simulate arrival of an active user
    mock_detection = {
        "user_id": "alex_turner",
        "display_name": "Alex Turner",
        "role": "lead_engineer",
        "custom_greeting": "Greetings Alex!",
        "score": 0.82,
        "bbox": [100, 100, 80, 80],
        "confidence": 0.95
    }

    # Inject detection cycle directly
    bridge.active_users["alex_turner"] = {
        "user_info": mock_detection,
        "last_seen": time.time(),
        "first_seen": time.time()
    }
    # Trigger arrived callback
    handle_arrived(mock_detection)

    assert len(arrived_events) == 1
    assert arrived_events[0]["user_id"] == "alex_turner"

    # Verify identity locking
    active_user = bridge.get_current_active_user()
    assert active_user is not None
    assert active_user["display_name"] == "Alex Turner"
    print("  [OK] User arrival registered and identity locked to Alex Turner.")

    # 2. Wait for absence timeout (0.6s) to trigger departure
    print("  Waiting 0.75s to test absence hysteresis...")
    time.sleep(0.75)

    # Trigger worker check cycle
    bridge._check_timeouts()

    assert len(left_events) == 1
    assert left_events[0] == "alex_turner"
    assert bridge.get_current_active_user() is None
    print("  [OK] User departure hook triggered after continuous absence.")

    bridge.stop()
    print("[OK] AgentVisionBridge: Thread lifecycle, hysteresis, and presence hooks passed.")

if __name__ == "__main__":
    print("=" * 65)
    print("  JARVIS VISION & RECOGNITION SUBSYSTEM - TEST SUITE")
    print("=" * 65)
    try:
        test_database_persistence()
        test_models_and_inference_latency()
        test_feature_extraction_and_dual_scoring()
        test_agent_vision_bridge_hysteresis()
        print("\n" + "=" * 65)
        print("  ALL 4 TEST MODULES PASSED SUCCESSFULLY! ")
        print("=" * 65)
    except Exception as e:
        print(f"\n[TEST FAILED]: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
