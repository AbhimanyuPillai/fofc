"""
Jarvis Vision & Facial Recognition Subsystem
Modules:
- UserDatabase: Persistent JSON and face sample storage
- FaceEngine: OpenCV DNN YuNet + SFace CPU-only pipeline
- AgentVisionBridge: Hysteresis presence bridge for voice agent
- run_dashboard: WebRTC enrollment dashboard
"""

from .user_db import UserDatabase
from .face_engine import FaceEngine
from .vision_agent_bridge import AgentVisionBridge

__all__ = ["UserDatabase", "FaceEngine", "AgentVisionBridge"]
