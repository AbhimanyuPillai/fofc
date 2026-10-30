import os
import urllib.request
import threading
from typing import List, Dict, Tuple, Optional, Any
import numpy as np
import cv2

try:
    from .user_db import UserDatabase
except ImportError:
    from user_db import UserDatabase

YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"

class FaceEngine:
    """
    High-performance, CPU-only facial detection and recognition engine.
    Pipeline: YuNet (FaceDetectorYN) -> SFace (FaceRecognizerSF) -> L2-Normalized 128-D Cosine Matcher.
    """
    def __init__(
        self,
        db: Optional[UserDatabase] = None,
        models_dir: Optional[str] = None,
        match_threshold: float = 0.38,
        score_threshold: float = 0.7,
        nms_threshold: float = 0.3,
        initial_input_size: Tuple[int, int] = (640, 480)
    ):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if models_dir is None:
            models_dir = os.path.join(base_dir, "models")
        
        self.models_dir = models_dir
        self.db = db if db is not None else UserDatabase(base_dir=base_dir)
        self.match_threshold = match_threshold
        self.score_threshold = score_threshold
        self.nms_threshold = nms_threshold
        self._current_input_size = initial_input_size
        self._lock = threading.Lock()

        # Model file paths
        self.yunet_path = os.path.join(self.models_dir, "face_detection_yunet_2023mar.onnx")
        self.sface_path = os.path.join(self.models_dir, "face_recognition_sface_2021dec.onnx")

        # Ensure models exist
        self._ensure_models_exist()

        # Initialize detector: OpenCV DNN on CPU ONLY
        self.detector = cv2.FaceDetectorYN.create(
            model=self.yunet_path,
            config="",
            input_size=self._current_input_size,
            score_threshold=self.score_threshold,
            nms_threshold=self.nms_threshold,
            top_k=5000,
            backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
            target_id=cv2.dnn.DNN_TARGET_CPU
        )

        # Initialize recognizer: OpenCV DNN on CPU ONLY
        self.recognizer = cv2.FaceRecognizerSF.create(
            model=self.sface_path,
            config="",
            backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
            target_id=cv2.dnn.DNN_TARGET_CPU
        )

        # Build initial in-memory embeddings from enrolled user pictures
        self.reload_enrolled_embeddings()

    def _ensure_models_exist(self) -> None:
        """Downloads YuNet and SFace ONNX models if missing."""
        os.makedirs(self.models_dir, exist_ok=True)
        models = [
            (self.yunet_path, YUNET_URL, "YuNet face detector"),
            (self.sface_path, SFACE_URL, "SFace face recognizer")
        ]
        for path, url, label in models:
            if not os.path.exists(path) or os.path.getsize(path) == 0:
                print(f"[FaceEngine] Downloading {label}...")
                urllib.request.urlretrieve(url, path)
                print(f"[FaceEngine] Downloaded {label} ({os.path.getsize(path)} bytes).")

    def reload_enrolled_embeddings(self) -> Dict[str, int]:
        """
        Scans data/faces/<user_id>/ for all enrolled images.
        Detects, aligns, extracts 128-D vectors, L2-normalizes them,
        and computes unit-norm centroid vectors for each user.
        """
        with self._lock:
            self.db.clear_embeddings()
            users = self.db.list_users()
            enrollment_summary: Dict[str, int] = {}

            for u in users:
                user_id = u["user_id"]
                image_paths = self.db.get_user_face_paths(user_id)
                samples: List[np.ndarray] = []

                for img_path in image_paths:
                    img = cv2.imread(img_path)
                    if img is None:
                        continue

                    # Resize detector if needed for single sample image
                    h, w = img.shape[:2]
                    self.detector.setInputSize((w, h))
                    ret, faces = self.detector.detect(img)

                    if faces is not None and len(faces) > 0:
                        # Select face with highest confidence score (faces[i][14])
                        best_face = max(faces, key=lambda f: f[14])
                        aligned = self.recognizer.alignCrop(img, best_face)
                        raw_feat = self.recognizer.feature(aligned)
                        feat = raw_feat.flatten().astype(np.float32)
                        norm = np.linalg.norm(feat)
                        if norm > 1e-6:
                            feat /= norm
                            samples.append(feat)

                # Reset detector input size to default stream resolution
                self.detector.setInputSize(self._current_input_size)

                if samples:
                    mean_vec = np.mean(samples, axis=0)
                    centroid = mean_vec / np.linalg.norm(mean_vec)
                    self.db.set_user_embeddings(user_id, centroid, samples)
                    enrollment_summary[user_id] = len(samples)
                else:
                    enrollment_summary[user_id] = 0

            print(f"[FaceEngine] Enrolled embeddings reloaded for {len(enrollment_summary)} users: {enrollment_summary}")
            return enrollment_summary

    def process_frame(self, frame_bgr: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detects faces in frame_bgr, extracts 128-D vectors, and compares
        against enrolled user centroids and individual sample vectors.
        Returns list of matched or unknown face dicts.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        h, w = frame_bgr.shape[:2]

        with self._lock:
            # Dynamically update detector input shape if frame resolution changes
            if (w, h) != self._current_input_size:
                self.detector.setInputSize((w, h))
                self._current_input_size = (w, h)

            ret, faces = self.detector.detect(frame_bgr)

            if faces is None or len(faces) == 0:
                return []

            results: List[Dict[str, Any]] = []
            enrolled = self.db.get_embeddings()

            for face in faces:
                bbox = [int(face[0]), int(face[1]), int(face[2]), int(face[3])]
                confidence = float(face[14])
                if confidence < self.score_threshold:
                    continue

                # Extract aligned face crop and 128-D SFace feature
                aligned = self.recognizer.alignCrop(frame_bgr, face)
                raw_feat = self.recognizer.feature(aligned)
                probe_feat = raw_feat.flatten().astype(np.float32)
                norm = np.linalg.norm(probe_feat)
                if norm > 1e-6:
                    probe_feat /= norm

                best_user_id = "unknown"
                best_score = -1.0
                best_user_info = None

                # Compare against all enrolled users
                for uid, emb_data in enrolled.items():
                    centroid = emb_data["centroid"]
                    samples = emb_data["samples"]

                    # Cosine score against centroid
                    centroid_score = float(np.dot(centroid, probe_feat))

                    # Maximum cosine score against individual enrolled samples
                    if samples:
                        sample_scores = [float(np.dot(s, probe_feat)) for s in samples]
                        max_sample_score = max(sample_scores)
                    else:
                        max_sample_score = 0.0

                    # Dual score matching: max(centroid_score, max(individual_sample_scores))
                    dual_score = max(centroid_score, max_sample_score)

                    if dual_score > best_score:
                        best_score = dual_score
                        best_user_id = uid
                        best_user_info = self.db.get_user(uid)

                # Flag matches >= 0.38 as identified user, else unknown
                if best_score >= self.match_threshold and best_user_info is not None:
                    matched_id = best_user_id
                    display_name = best_user_info.get("display_name", best_user_id)
                    role = best_user_info.get("role", "visitor")
                    greeting = best_user_info.get("custom_greeting", "")
                else:
                    matched_id = "unknown"
                    display_name = "Unknown"
                    role = "unknown"
                    greeting = ""

                results.append({
                    "user_id": matched_id,
                    "display_name": display_name,
                    "role": role,
                    "custom_greeting": greeting,
                    "score": round(float(best_score), 4) if best_score >= 0 else 0.0,
                    "bbox": bbox,  # [x, y, w, h]
                    "confidence": round(confidence, 4)
                })

            return results
