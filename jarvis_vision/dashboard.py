import os
import io
import cv2
import time
import threading
import requests
import numpy as np
from typing import List, Optional, Callable, Dict, Any
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

try:
    from .user_db import UserDatabase
    from .face_engine import FaceEngine
except ImportError:
    from user_db import UserDatabase
    from face_engine import FaceEngine

base_dir = os.path.dirname(os.path.abspath(__file__))
db = UserDatabase(base_dir=base_dir)
engine = FaceEngine(db=db)

app = FastAPI(title="Jarvis Vision & Agent Presence Hub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Presence State Machine (Tracks user identity and handles 2.0s hysteresis)
class PresenceTracker:
    def __init__(self, hysteresis_sec=2.0):
        self.hysteresis_sec = hysteresis_sec
        self.current_user_id = None
        self.last_seen_ts = 0.0

    def update(self, detected_user_id: Optional[str]):
        now = time.time()
        event = None

        if detected_user_id and detected_user_id != "unknown":
            if self.current_user_id != detected_user_id:
                # Arrival Event
                self.current_user_id = detected_user_id
                event = "ARRIVAL"
            self.last_seen_ts = now
        else:
            if self.current_user_id and (now - self.last_seen_ts > self.hysteresis_sec):
                # Departure Event
                event = "DEPARTURE"
                self.current_user_id = None

        return event, self.current_user_id

    def is_user_present(self) -> bool:
        return self.current_user_id is not None

presence_tracker = PresenceTracker(hysteresis_sec=2.0)

# Thread-safe callback registry & IPC dispatcher for agent integration
_presence_callbacks: List[Callable[[str, Optional[Dict[str, Any]]], None]] = []

def register_presence_callback(cb: Callable[[str, Optional[Dict[str, Any]]], None]):
    """Registers a thread-safe callback cb(event_type: str, user_info: Optional[dict])."""
    if cb not in _presence_callbacks:
        _presence_callbacks.append(cb)

def notify_presence_event(event_type: str, user_info: Optional[Dict[str, Any]]):
    """Notifies all registered in-process callbacks and sends local IPC HTTP webhook to live_agent.py."""
    # 1. In-process direct callbacks
    for cb in _presence_callbacks:
        try:
            cb(event_type, user_info)
        except Exception as e:
            print(f"[PresenceTracker Callback ERROR]: {e}")

    # 2. Local HTTP IPC Hook to live_agent.py (runs on port 8766, fallback 8765)
    def _dispatch_ipc():
        for port in (8766, 8765):
            try:
                requests.post(
                    f"http://127.0.0.1:{port}/agent/presence",
                    json={"event": event_type, "user": user_info},
                    timeout=0.5
                )
                break
            except Exception:
                pass

    threading.Thread(target=_dispatch_ipc, daemon=True).start()

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JARVIS Vision - Unified Agent Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(16, 23, 38, 0.85);
      --border: rgba(255, 255, 255, 0.08);
      --cyan: #06b6d4;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: 
        radial-gradient(circle at 10% 10%, rgba(6, 182, 212, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 90% 90%, rgba(99, 102, 241, 0.07) 0%, transparent 40%);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 1rem 2rem;
      border-bottom: 1px solid var(--border);
      background: rgba(9, 13, 22, 0.9);
      backdrop-filter: blur(12px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand { display: flex; align-items: center; gap: 0.85rem; }
    .brand-icon {
      width: 38px; height: 38px; border-radius: 10px;
      background: linear-gradient(135deg, #0ea5e9, #6366f1);
      display: flex; align-items: center; justify-content: center;
    }
    .brand h1 { font-family: 'Outfit', sans-serif; font-size: 1.25rem; font-weight: 700; }
    .status-pill {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.35rem 0.9rem; border-radius: 9999px;
      background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35);
      color: #34d399; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }

    /* Nav Tabs */
    .tab-bar {
      display: flex; gap: 0.5rem; background: rgba(16, 23, 38, 0.7);
      padding: 0.3rem; border-radius: 10px; border: 1px solid var(--border);
    }
    .tab-btn {
      background: transparent; border: none; color: var(--text-muted);
      padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem;
      cursor: pointer; transition: all 0.2s ease;
    }
    .tab-btn.active { background: var(--cyan); color: #000; }

    main {
      flex: 1; padding: 1.5rem 2rem; max-width: 1400px; margin: 0 auto; width: 100%;
      display: grid; grid-template-columns: 1.3fr 1fr; gap: 1.5rem;
    }
    @media (max-width: 980px) { main { grid-template-columns: 1fr; } }

    .panel {
      background: var(--card-bg); border: 1px solid var(--border);
      border-radius: 16px; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;
    }
    .panel-header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;
    }
    .panel-title { font-family: 'Outfit', sans-serif; font-size: 1.1rem; font-weight: 600; }

    /* Video area */
    .video-container {
      position: relative; width: 100%; aspect-ratio: 4/3; max-height: 420px;
      background: #000; border-radius: 12px; overflow: hidden; border: 1px solid var(--border);
    }
    video, canvas.overlay { position: absolute; width: 100%; height: 100%; object-fit: cover; }
    
    .hud-overlay-text {
      position: absolute; bottom: 10px; left: 10px;
      font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
      background: rgba(0,0,0,0.65); padding: 4px 8px; border-radius: 4px; color: #38bdf8;
    }

    button {
      cursor: pointer; font-family: 'Inter', sans-serif; font-weight: 600;
      border-radius: 8px; border: none; padding: 0.65rem 1.1rem; display: inline-flex;
      align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.2s ease;
    }
    .btn-primary { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; }
    .btn-success { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
    .btn-secondary { background: rgba(255, 255, 255, 0.08); color: var(--text); border: 1px solid var(--border); }

    /* Thumbnails */
    .thumbnail-strip { display: flex; gap: 0.5rem; overflow-x: auto; padding: 0.4rem 0; min-height: 80px; }
    .thumb-card {
      position: relative; width: 70px; height: 70px; border-radius: 8px;
      border: 1px solid var(--cyan); overflow: hidden; flex-shrink: 0; background: #000;
    }
    .thumb-card img { width: 100%; height: 100%; object-fit: cover; }
    .thumb-del {
      position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.7);
      color: #fff; border: none; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; cursor: pointer;
    }

    /* Forms & Controls */
    .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
    label { font-size: 0.8rem; font-weight: 500; color: var(--text-muted); }
    input, select {
      background: rgba(9, 13, 22, 0.8); border: 1px solid var(--border); border-radius: 8px;
      padding: 0.65rem 0.85rem; color: #fff; font-size: 0.9rem; outline: none;
    }
    input:focus, select:focus { border-color: var(--cyan); }

    /* Presence Log Console */
    .event-log {
      background: rgba(0, 0, 0, 0.6); border: 1px solid var(--border); border-radius: 8px;
      padding: 0.75rem; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
      max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem;
    }
    .log-entry { display: flex; gap: 0.5rem; line-height: 1.3; }
    .log-arrival { color: #34d399; }
    .log-departure { color: #fb7185; }

    /* Toast */
    .toast {
      position: fixed; bottom: 2rem; right: 2rem; padding: 0.85rem 1.25rem;
      border-radius: 10px; background: rgba(16, 23, 38, 0.95); border: 1px solid var(--border);
      color: #fff; font-size: 0.85rem; z-index: 100; transform: translateY(100px); opacity: 0; transition: all 0.3s ease;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.success { border-color: rgba(16, 185, 129, 0.6); color: #34d399; }
    .toast.error { border-color: rgba(244, 63, 94, 0.6); color: #fb7185; }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <div class="brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <circle cx="12" cy="8" r="5"></circle>
          <path d="M20 21a8 8 0 1 0-16 0"></path>
        </svg>
      </div>
      <div>
        <h1>JARVIS CONTROL HUB</h1>
        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">Vision Presence & Face Registration</div>
      </div>
    </div>
    
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchView('monitor')">Live Agent Monitor</button>
      <button class="tab-btn" onclick="switchView('enroll')">Enroll New Face</button>
    </div>

    <div class="status-pill">
      <span class="dot"></span>
      <span id="agentStateText">AGENT STANDBY</span>
    </div>
  </header>

  <main>
    <!-- Left Column: Unified Camera Feed & HUD -->
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">Active Camera HUD</h2>
        <div style="font-size: 0.8rem; font-family: 'JetBrains Mono', monospace; color: var(--cyan);">
          Cosine Threshold: 0.38
        </div>
      </div>

      <div class="video-container">
        <video id="webcam" autoplay playsinline muted></video>
        <canvas id="overlayCanvas" class="overlay"></canvas>
        <div class="hud-overlay-text" id="hudFps">FPS: -- | Engine: YuNet + SFace</div>
      </div>

      <!-- Controls below camera -->
      <div id="enrollCameraCtrls" style="display: none; gap: 0.75rem;">
        <button id="snapBtn" class="btn-primary" style="flex: 1;">📸 Capture Snapshot (Need 3-5)</button>
        <button id="clearSnapsBtn" class="btn-secondary">Clear</button>
      </div>

      <div id="enrollThumbsArea" style="display: none;">
        <div class="thumbnail-strip" id="thumbStrip"></div>
      </div>

      <!-- Live Presence Activity Log -->
      <div>
        <label>PRESENCE EVENT LOG</label>
        <div class="event-log" id="eventLog">
          <div class="log-entry" style="color: var(--text-muted);">System initialized. Waiting for users...</div>
        </div>
      </div>
    </section>

    <!-- Right Column: Context Tabs -->
    <section class="panel">
      <!-- VIEW 1: AGENT MONITOR -->
      <div id="view-monitor">
        <div class="panel-header">
          <h2 class="panel-title">Active Agent State</h2>
        </div>
        <div style="margin: 1rem 0; display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="padding: 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; border: 1px solid var(--border);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">CURRENT ACTIVE USER</div>
            <div id="activeUserName" style="font-size: 1.4rem; font-weight: 700; color: #fff; margin-top: 4px;">None (No Face Detected)</div>
            <div id="activeUserMeta" style="font-size: 0.85rem; color: var(--cyan); margin-top: 2px;">Identity Lock: Standby</div>
          </div>
        </div>

        <div class="panel-header" style="margin-top: 1rem;">
          <h2 class="panel-title">Enrolled Gallery</h2>
          <span id="userCount" style="font-size: 0.75rem; font-family: 'JetBrains Mono', monospace; color: var(--text-muted);">0 users</span>
        </div>
        <div id="userGallery" style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 280px; overflow-y: auto; margin-top: 0.5rem;"></div>
      </div>

      <!-- VIEW 2: ENROLLMENT FORM -->
      <div id="view-enroll" style="display: none;">
        <div class="panel-header">
          <h2 class="panel-title">Enroll New Identity</h2>
        </div>
        <form id="regForm" style="display: flex; flex-direction: column; gap: 0.85rem; margin-top: 0.5rem;">
          <div class="form-group">
            <label>User ID (Alphanumeric identifier)</label>
            <input type="text" id="userId" placeholder="e.g. abhi" required>
          </div>
          <div class="form-group">
            <label>Display Name</label>
            <input type="text" id="displayName" placeholder="e.g. Abhi" required>
          </div>
          <div class="form-group">
            <label>Role</label>
            <select id="role">
              <option value="admin">Administrator</option>
              <option value="lead_engineer">Lead Engineer</option>
              <option value="engineer">Engineer</option>
              <option value="visitor" selected>Visitor</option>
            </select>
          </div>
          <div class="form-group">
            <label>Custom Spoken Greeting</label>
            <input type="text" id="customGreeting" placeholder="e.g. Hey Abhi!, What's up!!">
          </div>
          <button type="submit" class="btn-success" style="margin-top: 0.5rem;">Save & Enroll Face Embeddings</button>
        </form>
      </div>
    </section>
  </main>

  <div id="toast" class="toast"></div>

  <script>
    const webcam = document.getElementById('webcam');
    const overlayCanvas = document.getElementById('overlayCanvas');
    const overlayCtx = overlayCanvas.getContext('2d');
    const hudFps = document.getElementById('hudFps');
    const snapBtn = document.getElementById('snapBtn');
    const clearSnapsBtn = document.getElementById('clearSnapsBtn');
    const thumbStrip = document.getElementById('thumbStrip');
    const regForm = document.getElementById('regForm');
    const userGallery = document.getElementById('userGallery');
    const userCount = document.getElementById('userCount');
    const toast = document.getElementById('toast');
    const eventLog = document.getElementById('eventLog');
    const activeUserName = document.getElementById('activeUserName');
    const activeUserMeta = document.getElementById('activeUserMeta');
    const agentStateText = document.getElementById('agentStateText');

    let capturedBlobs = [];
    let isTracking = true;
    let lastFrameTime = performance.now();
    let currentLockedId = null;

    function switchView(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      if (tab === 'monitor') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('view-monitor').style.display = 'block';
        document.getElementById('view-enroll').style.display = 'none';
        document.getElementById('enrollCameraCtrls').style.display = 'none';
        document.getElementById('enrollThumbsArea').style.display = 'none';
      } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('view-monitor').style.display = 'none';
        document.getElementById('view-enroll').style.display = 'block';
        document.getElementById('enrollCameraCtrls').style.display = 'flex';
        document.getElementById('enrollThumbsArea').style.display = 'block';
      }
    }

    // Start WebRTC camera stream
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        webcam.srcObject = stream;
        webcam.onloadedmetadata = () => {
          overlayCanvas.width = webcam.videoWidth;
          overlayCanvas.height = webcam.videoHeight;
          startInferenceLoop();
        };
      } catch (err) {
        showToast('Camera access failed: ' + err.message, 'error');
      }
    }

    // Real-Time Detection and Recognition Loop
    let isProcessing = false;
    function startInferenceLoop() {
      setInterval(async () => {
        if (!isTracking || isProcessing || !webcam.videoWidth) return;
        isProcessing = true;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = webcam.videoWidth;
        tempCanvas.height = webcam.videoHeight;
        tempCanvas.getContext('2d').drawImage(webcam, 0, 0);

        tempCanvas.toBlob(async blob => {
          if (!blob) { isProcessing = false; return; }
          const fd = new FormData();
          fd.append('frame', blob, 'frame.jpg');

          try {
            const t0 = performance.now();
            const res = await fetch('/api/recognize_frame', { method: 'POST', body: fd });
            const data = await res.json();
            const t1 = performance.now();
            
            // FPS calculation
            const fps = (1000 / (t1 - lastFrameTime)).toFixed(1);
            lastFrameTime = t1;
            hudFps.textContent = `FPS: ${fps} | Infer: ${(t1 - t0).toFixed(0)}ms | SFace ONNX`;

            drawDetections(data.detections || []);
            handlePresenceState(data.presence_event, data.active_user);
          } catch (e) {
          } finally {
            isProcessing = false;
          }
        }, 'image/jpeg', 0.75);
      }, 120); // ~8-10 FPS inference rate
    }

    function drawDetections(detections) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      detections.forEach(d => {
        const [x, y, w, h] = d.bbox;
        const isKnown = d.user_id !== 'unknown';
        const color = isKnown ? '#10b981' : '#f43f5e';

        overlayCtx.strokeStyle = color;
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(x, y, w, h);

        overlayCtx.fillStyle = color;
        overlayCtx.fillRect(x, Math.max(0, y - 24), w, 24);

        overlayCtx.fillStyle = '#ffffff';
        overlayCtx.font = '600 12px Inter';
        const label = isKnown ? `${d.display_name} (${(d.score*100).toFixed(0)}%)` : 'Unknown Face';
        overlayCtx.fillText(label, x + 6, Math.max(16, y - 7));
      });
    }

    function handlePresenceState(event, user) {
      if (event === "ARRIVAL" && user) {
        addLog(`ARRIVAL: ${user.display_name} (${user.role}) - Match: ${(user.score*100).toFixed(0)}%`, 'log-arrival');
        activeUserName.textContent = user.display_name;
        activeUserMeta.textContent = `Role: ${user.role} | Score: ${(user.score*100).toFixed(1)}%`;
        agentStateText.textContent = `SESSION LOCKED: ${user.display_name.toUpperCase()}`;
        agentStateText.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.8)';
      } else if (event === "DEPARTURE") {
        addLog(`DEPARTURE: User session cleared. Session reset.`, 'log-departure');
        activeUserName.textContent = "None (No Face Detected)";
        activeUserMeta.textContent = "Identity Lock: Standby";
        agentStateText.textContent = "AGENT STANDBY";
        agentStateText.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      }
    }

    function addLog(msg, cssClass = '') {
      const time = new Date().toLocaleTimeString();
      const div = document.createElement('div');
      div.className = `log-entry ${cssClass}`;
      div.innerHTML = `<span style="color: #64748b;">[${time}]</span> ${msg}`;
      eventLog.prepend(div);
    }

    // Snapshot Capture
    snapBtn.addEventListener('click', () => {
      if (!webcam.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = webcam.videoWidth;
      c.height = webcam.videoHeight;
      c.getContext('2d').drawImage(webcam, 0, 0);

      c.toBlob(blob => {
        if (!blob) return;
        capturedBlobs.push(blob);
        renderThumbnails();
      }, 'image/jpeg', 0.95);
    });

    clearSnapsBtn.addEventListener('click', () => {
      capturedBlobs = [];
      renderThumbnails();
    });

    function renderThumbnails() {
      thumbStrip.innerHTML = '';
      if (capturedBlobs.length === 0) {
        thumbStrip.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); display:flex; align-items:center;">No snapshots. Click Capture 3-5 times.</div>`;
        return;
      }
      capturedBlobs.forEach((blob, idx) => {
        const card = document.createElement('div');
        card.className = 'thumb-card';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        const delBtn = document.createElement('button');
        delBtn.className = 'thumb-del';
        delBtn.innerHTML = '×';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          capturedBlobs.splice(idx, 1);
          renderThumbnails();
        };
        card.appendChild(img);
        card.appendChild(delBtn);
        thumbStrip.appendChild(card);
      });
    }

    // Register Form Handler
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('userId').value.trim();
      const displayName = document.getElementById('displayName').value.trim();
      const role = document.getElementById('role').value;
      const customGreeting = document.getElementById('customGreeting').value.trim();

      if (capturedBlobs.length === 0) {
        showToast('Please capture at least 2-3 snapshots!', 'error');
        return;
      }

      const fd = new FormData();
      fd.append('user_id', userId);
      fd.append('display_name', displayName);
      fd.append('role', role);
      fd.append('custom_greeting', customGreeting);
      capturedBlobs.forEach((b, i) => fd.append('files', b, `snap_${i}.jpg`));

      try {
        const res = await fetch('/api/register', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok) {
          showToast(`Enrolled ${displayName} successfully!`, 'success');
          capturedBlobs = [];
          renderThumbnails();
          regForm.reset();
          loadGallery();
          switchView('monitor');
        } else {
          showToast(data.detail || 'Enrollment failed', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    async function loadGallery() {
      try {
        const res = await fetch('/api/users');
        const users = await res.json();
        userCount.textContent = `${users.length} enrolled`;
        userGallery.innerHTML = '';
        users.forEach(u => {
          const item = document.createElement('div');
          item.style.cssText = 'padding: 0.6rem; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;';
          item.innerHTML = `
            <div>
              <div style="font-weight: 600; font-size: 0.85rem;">${u.display_name} <span style="color: var(--cyan); font-size: 0.75rem;">[${u.role}]</span></div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-family: 'JetBrains Mono';">ID: ${u.user_id} • Samples: ${u.sample_count}</div>
            </div>
            <button onclick="deleteUser('${u.user_id}')" style="background: rgba(244,63,94,0.2); color: #fb7185; border: 1px solid rgba(244,63,94,0.4); padding: 2px 8px; font-size: 0.7rem; border-radius: 4px;">Del</button>
          `;
          userGallery.appendChild(item);
        });
      } catch (e) {}
    }

    async function deleteUser(id) {
      if (!confirm(`Delete user ${id}?`)) return;
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      loadGallery();
    }

    function showToast(msg, type = 'info') {
      toast.textContent = msg;
      toast.className = `toast show ${type}`;
      setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    initCamera();
    loadGallery();
    renderThumbnails();
  </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    return HTMLResponse(content=DASHBOARD_HTML)

@app.get("/api/users")
async def list_users():
    users = db.list_users()
    results = []
    for u in users:
        sample_paths = db.get_user_face_paths(u["user_id"])
        results.append({
            "user_id": u["user_id"],
            "display_name": u.get("display_name", u["user_id"]),
            "role": u.get("role", "visitor"),
            "custom_greeting": u.get("custom_greeting", ""),
            "registered_at": u.get("registered_at", ""),
            "sample_count": len(sample_paths)
        })
    return sorted(results, key=lambda x: x["display_name"].lower())

@app.post("/api/register")
async def register_user(
    user_id: str = Form(...),
    display_name: str = Form(...),
    role: str = Form("visitor"),
    custom_greeting: str = Form(""),
    files: List[UploadFile] = File(...)
):
    clean_uid = user_id.strip().lower()
    if not clean_uid:
        raise HTTPException(status_code=400, detail="User ID is required.")

    user_record = db.add_or_update_user(
        user_id=clean_uid,
        display_name=display_name,
        role=role,
        custom_greeting=custom_greeting
    )

    saved_count = 0
    for idx, f in enumerate(files):
        try:
            content = await f.read()
            if len(content) > 0:
                db.save_face_image(clean_uid, content, filename=f"enroll_{idx}_{f.filename}")
                saved_count += 1
        except Exception as e:
            print(f"[Dashboard ERROR] Failed saving upload {f.filename}: {e}")

    summary = engine.reload_enrolled_embeddings()
    enrolled_samples = summary.get(clean_uid, saved_count)

    return {
        "status": "success",
        "user_id": clean_uid,
        "display_name": user_record["display_name"],
        "samples_enrolled": enrolled_samples
    }

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str):
    clean_uid = user_id.strip().lower()
    deleted = db.delete_user(clean_uid)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"User {clean_uid} not found.")

    engine.reload_enrolled_embeddings()
    return {"status": "success", "deleted_user_id": clean_uid}

@app.post("/api/recognize_frame")
async def recognize_frame(frame: UploadFile = File(...)):
    """Receives camera frame, runs YuNet + SFace, and handles presence hysteresis."""
    try:
        content = await frame.read()
        nparr = np.frombuffer(content, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image data"})

        detections = engine.process_frame(img_bgr)

        # Find best detected recognized user
        known_matches = [d for d in detections if d.get("user_id") != "unknown"]
        best_user = max(known_matches, key=lambda x: x["score"]) if known_matches else None
        best_uid = best_user["user_id"] if best_user else None

        # Update presence state
        event, current_id = presence_tracker.update(best_uid)

        active_user_data = None
        if current_id:
            user_record = db.get_user(current_id)
            if user_record:
                active_user_data = {
                    "user_id": current_id,
                    "display_name": user_record.get("display_name", current_id),
                    "role": user_record.get("role", "visitor"),
                    "custom_greeting": user_record.get("custom_greeting", ""),
                    "score": float(best_user["score"]) if best_user else 0.0
                }

        # Dispatch event to voice agent runtime (in-process callback + local HTTP IPC)
        if event in ("ARRIVAL", "DEPARTURE"):
            notify_presence_event(event, active_user_data)

        return {
            "detections": detections,
            "presence_event": event,
            "active_user": active_user_data
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/presence_state")
async def get_presence_state():
    """Returns current active presence state for agent synchronization."""
    user_data = None
    if presence_tracker.current_user_id:
        user_record = db.get_user(presence_tracker.current_user_id)
        if user_record:
            user_data = {
                "user_id": user_record["user_id"],
                "display_name": user_record.get("display_name", user_record["user_id"]),
                "role": user_record.get("role", "visitor"),
                "custom_greeting": user_record.get("custom_greeting", "")
            }
    return {
        "is_present": presence_tracker.is_user_present(),
        "current_user_id": presence_tracker.current_user_id,
        "active_user": user_data
    }

def run_dashboard(host: str = "0.0.0.0", port: int = 8080):
    print(f"[JARVIS VISION] Hub starting on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    run_dashboard(port=8080)