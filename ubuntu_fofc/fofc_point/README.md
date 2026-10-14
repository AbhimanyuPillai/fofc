# AeroFinger · Edge MediaPipe Finger & Gesture Tracking Web UI

A high-performance, 100% offline edge-ready Web application for real-time 3D hand, finger, and gesture tracking built using **Google MediaPipe HandLandmarker** (`@mediapipe/tasks-vision`) and modern Vanilla CSS / ES modules.

---

## ⚡ Key Highlights for Edge Devices

- **100% Offline & Air-Gapped Ready**:
  - No internet connection required after setup.
  - Zero CDN dependencies: MediaPipe WebAssembly binaries (`/wasm/vision_wasm_internal.wasm` & `.js`) and Google's neural model (`/models/hand_landmarker.task`) are bundled and served locally.
  - Offline Progressive Web App (PWA) with Service Worker precaching.
- **Optimized for Edge Hardware (Raspberry Pi, Kiosks, Tablets)**:
  - Configurable Compute Delegate: Hardware GPU (WebGL2) or CPU fallback.
  - Edge FPS limiter (15, 30, 60 FPS) to prevent thermal throttling on low-power devices.
  - Max hands selector (1 hand saves ~45% compute overhead; 2 hands for bi-manual tracking).
  - Video resolution switcher (240p ultra-low edge mode, 480p fast, 720p HD).
  - Built-in **Synthetic Camera Demo** for headless edge testing or devices without a webcam.

---

## 🖐️ Core Capabilities & Modes

### 1. Diagnostics & 3D Pose Studio
- **21 Anatomical Landmarks**: Real-time tracking of Wrist, Thumb (CMC, MCP, IP, Tip), Index, Middle, Ring, and Pinky joints.
- **Real-Time 3D Depth Visualizer**: Real-time rotating isometric 3D skeleton projection showing spatial depth coordinates ($Z$).
- **Finger Flexion Gauges**: Real-time flexion percentage for all 5 fingers.
- **Pinch Distance Matrix**: Euclidean distance and sub-millimeter contact detection between Thumb and Index, Middle, Ring, and Pinky.

### 2. Virtual Air Canvas
- Spatial finger painting directly in mid-air using index fingertip.
- Neon glow lines, variable brush size, dynamic color palette, and flowing rainbow brush mode.
- "Point to Draw" and "Pinch to Draw" trigger modes.
- Clear canvas and one-click PNG export.

### 3. Edge Controller & Touchless Automation
- **Touchless Virtual Buttons**: Hover fingertip to engage circular countdown trigger (Light relay, Fan status, Alarm buzzer).
- **Spatial Servo Slider**: Control virtual 180° servo angle with vertical finger gestures.
- **Robotic Gripper Simulation**: Clamps and opens dynamically matching your hand grip with millimeter jaw distance and clamp pressure readout.
- **Edge GPIO/MQTT Log Bus**: Live simulation stream of edge automation events.

### 4. Laser Synth (Optical Air Piano)
- 6 mid-air laser keys tuned to pentatonic/major scales (261Hz to 523Hz).
- Low-latency sound synthesis using browser-native Web Audio API (zero audio files needed).
- Fingertip collision detection with neon particle sparks.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) and npm installed.

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start local edge dev server
npm run dev

# 3. Open in your browser
http://localhost:5173
```

> **LAN Access on Edge Devices**: The server binds to `0.0.0.0`, so you can access it from any phone, tablet, or edge monitor on the same local network (e.g. `http://<EDGE_IP>:5173`).

---

## 📦 Production Offline Build

```bash
# Create production build
npm run build

# Preview locally
npm run preview
```

The output in `/dist` contains self-contained HTML, CSS, JS, WASM binaries, and the `.task` model file ready to be deployed to Nginx, Apache, or Python HTTP server on an edge device:
```bash
# Example serving on an isolated edge device with Python:
cd dist
python -m http.server 8080
```

---

## ⌨️ Keyboard Shortcuts
- `Space`: Pause / Resume tracking
- `M`: Cycle through modes (Diagnostics → Air Canvas → Edge Controller → Laser Synth)
- `F`: Toggle Fullscreen kiosk mode
- `C`: Clear air canvas drawings
