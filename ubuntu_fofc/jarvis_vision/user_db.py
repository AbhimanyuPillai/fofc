import os
import json
import shutil
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any
import numpy as np
import cv2

class UserDatabase:
    """
    Persistent JSON & filesystem-backed database for user profiles and face samples.
    Maintains an in-memory cache of L2-normalized 128-D embeddings and centroids.
    """
    def __init__(self, base_dir: Optional[str] = None):
        if base_dir is None:
            # Default to jarvis_vision directory
            base_dir = os.path.dirname(os.path.abspath(__file__))
        
        self.base_dir = base_dir
        self.data_dir = os.path.join(base_dir, "data")
        self.faces_dir = os.path.join(self.data_dir, "faces")
        self.users_file = os.path.join(self.data_dir, "users.json")
        
        # Ensure directories exist
        os.makedirs(self.faces_dir, exist_ok=True)
        
        self._lock = threading.RLock()
        self.users: Dict[str, Dict[str, Any]] = {}
        # In-memory embeddings: {user_id: {"centroid": ndarray, "samples": [ndarray]}}
        self.embeddings: Dict[str, Dict[str, Any]] = {}
        
        self.load_users()

    def load_users(self) -> None:
        """Loads users from JSON file, initializing if not present."""
        with self._lock:
            if os.path.exists(self.users_file):
                try:
                    with open(self.users_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            self.users = {u["user_id"]: u for u in data if "user_id" in u}
                        elif isinstance(data, dict):
                            self.users = data
                        else:
                            self.users = {}
                except Exception as e:
                    print(f"[UserDB WARNING] Could not parse {self.users_file}: {e}. Initializing empty.")
                    self.users = {}
            else:
                self.users = {}
                self.save_users()

    def save_users(self) -> None:
        """Atomically saves users dictionary to JSON file."""
        with self._lock:
            temp_file = self.users_file + ".tmp"
            try:
                with open(temp_file, "w", encoding="utf-8") as f:
                    json.dump(self.users, f, indent=2, ensure_ascii=False)
                if os.path.exists(self.users_file):
                    os.replace(temp_file, self.users_file)
                else:
                    os.rename(temp_file, self.users_file)
            except Exception as e:
                print(f"[UserDB ERROR] Failed saving users: {e}")
                if os.path.exists(temp_file):
                    os.remove(temp_file)

    def add_or_update_user(
        self,
        user_id: str,
        display_name: str,
        role: str = "visitor",
        custom_greeting: str = "",
        pronunciation: str = ""
    ) -> Dict[str, Any]:
        """Registers or updates a user profile and prepares their face sample directory."""
        user_id = user_id.strip().lower()
        if not user_id:
            raise ValueError("user_id cannot be empty")

        with self._lock:
            existing = self.users.get(user_id, {})
            registered_at = existing.get("registered_at", datetime.utcnow().isoformat() + "Z")

            user_record = {
                "user_id": user_id,
                "display_name": display_name.strip() or user_id,
                "role": role.strip() or "visitor",
                "pronunciation": pronunciation.strip(),
                "custom_greeting": custom_greeting.strip(),
                "registered_at": registered_at,
                "updated_at": datetime.utcnow().isoformat() + "Z"
            }
            self.users[user_id] = user_record

            # Ensure user's face directory exists
            user_dir = os.path.join(self.faces_dir, user_id)
            os.makedirs(user_dir, exist_ok=True)

            self.save_users()
            return user_record

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a user profile by ID."""
        with self._lock:
            return self.users.get(user_id.strip().lower())

    def list_users(self) -> List[Dict[str, Any]]:
        """Returns a list of all registered users."""
        with self._lock:
            return list(self.users.values())

    def delete_user(self, user_id: str) -> bool:
        """Deletes a user profile, their face files, and in-memory embeddings."""
        user_id = user_id.strip().lower()
        with self._lock:
            if user_id not in self.users:
                return False

            del self.users[user_id]
            self.embeddings.pop(user_id, None)
            self.save_users()

            user_dir = os.path.join(self.faces_dir, user_id)
            if os.path.exists(user_dir):
                try:
                    shutil.rmtree(user_dir)
                except Exception as e:
                    print(f"[UserDB WARNING] Failed to delete face dir {user_dir}: {e}")
            return True

    def save_face_image(self, user_id: str, image_data: Any, filename: Optional[str] = None) -> str:
        """
        Saves a face image for user.
        image_data can be raw JPEG/PNG bytes or a numpy BGR ndarray.
        """
        user_id = user_id.strip().lower()
        with self._lock:
            user_dir = os.path.join(self.faces_dir, user_id)
            os.makedirs(user_dir, exist_ok=True)

            if filename is None:
                timestamp = int(datetime.utcnow().timestamp() * 1000)
                filename = f"face_{timestamp}.jpg"

            filepath = os.path.join(user_dir, filename)

            if isinstance(image_data, bytes):
                with open(filepath, "wb") as f:
                    f.write(image_data)
            elif isinstance(image_data, np.ndarray):
                cv2.imwrite(filepath, image_data)
            else:
                raise TypeError("image_data must be bytes or numpy ndarray")

            return filepath

    def get_user_face_paths(self, user_id: str) -> List[str]:
        """Returns all image file paths stored under data/faces/<user_id>/."""
        user_id = user_id.strip().lower()
        user_dir = os.path.join(self.faces_dir, user_id)
        if not os.path.exists(user_dir):
            return []

        valid_exts = {".jpg", ".jpeg", ".png", ".bmp"}
        paths = []
        for fname in os.listdir(user_dir):
            ext = os.path.splitext(fname)[1].lower()
            if ext in valid_exts:
                paths.append(os.path.join(user_dir, fname))
        return sorted(paths)

    def set_user_embeddings(self, user_id: str, centroid: np.ndarray, samples: List[np.ndarray]) -> None:
        """Updates the in-memory embeddings dictionary for the given user."""
        user_id = user_id.strip().lower()
        with self._lock:
            self.embeddings[user_id] = {
                "centroid": centroid,
                "samples": samples
            }

    def clear_embeddings(self) -> None:
        """Clears all in-memory embeddings."""
        with self._lock:
            self.embeddings.clear()

    def get_embeddings(self) -> Dict[str, Dict[str, Any]]:
        """Returns the in-memory embeddings dictionary."""
        with self._lock:
            return self.embeddings
