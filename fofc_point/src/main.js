import './style.css';
import { createIcons, icons } from 'lucide';
import { EdgeHandTracker } from './modules/tracker.js';
import { EdgeCameraManager } from './modules/camera.js';
import { KeypointRenderer } from './modules/keypointRenderer.js';
import { ZoneManager, intersectRayPolygon } from './modules/zoneManager.js';
import { isPointingPose } from './modules/gestures.js';

function refreshIcons() {
  createIcons({ icons });
}

// Register Offline Edge Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => console.log('[SW] Edge Service Worker ready:', reg.scope))
      .catch((err) => console.warn('[SW] Registration notice:', err));
  });
}

class AgentBridge {
  constructor(url = 'ws://127.0.0.1:8765') {
    this.url = url;
    this.connect();
  }
  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => console.log('[AeroFinger Bridge] Connected to Jarvis Live Agent');
    this.ws.onclose = () => setTimeout(() => this.connect(), 1500);
    this.ws.onerror = () => {};
  }
  sendTargetUpdate(boardName, isStable) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'POINTING_UPDATE',
        board: boardName,
        stable: isStable,
        timestamp: Date.now()
      }));
    }
  }
}

class AeroFingerApp {
  constructor() {
    // DOM Elements
    this.video = document.getElementById('webcam-video');
    this.canvas = document.getElementById('output-canvas');
    // High-performance desynchronized 2D rendering context
    this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.viewportWrapper = document.getElementById('viewport-wrapper');

    // Telemetry Elements
    this.valFps = document.getElementById('val-fps');
    this.lastFpsDomUpdate = 0;
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingDetails = document.getElementById('loading-details');

    // Reusable pointing ray container to eliminate per-frame allocations
    this._pointingRay = {
      origin: { x: 0, y: 0 },
      dir: { x: 0, y: -1 },
      isExtended: false,
      tipScreen: { x: 0, y: 0 },
    };

    // Area & Prompt Elements
    this.btnAddArea = document.getElementById('btn-add-area');
    this.dwellSelect = document.getElementById('dwell-select');
    this.btnManageAreas = document.getElementById('btn-manage-areas');
    this.btnToggleSpeech = document.getElementById('btn-toggle-speech');
    this.drawModeBanner = document.getElementById('draw-mode-banner');
    this.drawGuidanceText = document.getElementById('draw-guidance-text');
    this.btnCancelDraw = document.getElementById('btn-cancel-draw');
    this.btnModeRect = document.getElementById('btn-mode-rect');
    this.btnModePoly = document.getElementById('btn-mode-poly');
    this.btnFinishPoly = document.getElementById('btn-finish-poly');
    this.btnUndoPoly = document.getElementById('btn-undo-poly');
    this.polyCount = document.getElementById('poly-count');
    this.pointingPromptBanner = document.getElementById('pointing-prompt-banner');
    this.adjustModeBanner = document.getElementById('adjust-mode-banner');
    this.promptAreaName = document.getElementById('prompt-area-name');
    this.promptAreaMeta = document.getElementById('prompt-area-meta');

    // Modals
    this.nameAreaModal = document.getElementById('name-area-modal');
    this.inputAreaName = document.getElementById('input-area-name');
    this.inputAreaVoice = document.getElementById('input-area-voice');
    this.btnPreviewVoice = document.getElementById('btn-preview-voice');
    this.btnSaveNameArea = document.getElementById('btn-save-name-area');
    this.btnCancelNameArea = document.getElementById('btn-cancel-name-area');

    this.manageAreasModal = document.getElementById('manage-areas-modal');
    this.areasList = document.getElementById('areas-list');
    this.btnCloseManageAreas = document.getElementById('btn-close-manage-areas');
    this.btnDoneManageAreas = document.getElementById('btn-done-manage-areas');
    this.btnClearAllAreas = document.getElementById('btn-clear-all-areas');

    // Camera & Controls
    this.cameraSelect = document.getElementById('camera-select');
    this.resolutionSelect = document.getElementById('resolution-select');
    this.handsSelect = document.getElementById('hands-select');
    this.btnToggleFlipH = document.getElementById('btn-toggle-flip-h');
    this.btnToggleFlipV = document.getElementById('btn-toggle-flip-v');
    this.btnToggleFit = document.getElementById('btn-toggle-fit');
    this.btnFullscreen = document.getElementById('btn-fullscreen');

    // State
    this.speechEnabled = true;
    this.promptTimer = null;
    this.pendingAreaCallback = null;

    // WebSocket Telemetry Bridge to Jarvis Live Agent
    this.bridge = new AgentBridge();
    this.lastReportedBoard = null;

    // Modules
    this.tracker = new EdgeHandTracker();
    this.camera = new EdgeCameraManager(this.video);
    this.renderer = new KeypointRenderer();
    this.zoneManager = new ZoneManager();

    this.isRunning = false;
    this.lastVideoTime = -1;
    this.latestLandmarks = [];
  }

  async init() {
    refreshIcons();
    this.setupEventListeners();
    if (this.dwellSelect) {
      this.dwellSelect.value = String(this.zoneManager.dwellDurationMs);
    }

    // Setup Zone Pointing Trigger Callback
    this.zoneManager.onTrigger = (zone) => this.handleZonePointingTrigger(zone);

    // 1. Initialize MediaPipe Tracker (Offline local WASM & Model)
    try {
      this.loadingDetails.innerText = 'Loading MediaPipe HandLandmarker...';
      await this.tracker.init();
    } catch (err) {
      console.error('[App] MediaPipe init error:', err);
      this.loadingDetails.innerHTML = `<span style="color:#f43f5e;">Init error: ${err.message}</span>`;
    }

    // 2. Start Live Webcam
    this.loadingDetails.innerText = 'Connecting camera feed...';
    const camRes = await this.camera.startCamera();

    if (!camRes.success) {
      this.loadingDetails.innerHTML = `<span style="color:#ffaa00;">Please grant webcam permission.</span>`;
    } else {
      await this.populateCameraDevices();
      this.setupVideoFrameCallback();
      setTimeout(() => {
        this.loadingOverlay.classList.add('hidden');
      }, 300);
    }

    // 3. Start High-Performance Render Loop
    this.isRunning = true;
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  setupVideoFrameCallback() {
    if ('requestVideoFrameCallback' in this.video) {
      this.hasVideoFrameCallback = true;
      const callback = (now) => {
        if (!this.isRunning) return;
        this.onNewCameraFrame(now);
        this.video.requestVideoFrameCallback(callback);
      };
      this.video.requestVideoFrameCallback(callback);
    } else {
      this.hasVideoFrameCallback = false;
    }
  }

  async populateCameraDevices() {
    const devices = await this.camera.getDevices();
    this.cameraSelect.innerHTML = '';
    if (devices.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.text = 'Default Camera';
      this.cameraSelect.appendChild(opt);
    } else {
      devices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.text = dev.label || `Camera ${idx + 1}`;
        this.cameraSelect.appendChild(opt);
      });
    }
  }

  handleZonePointingTrigger(zone) {
    this.promptAreaName.innerText = zone.name.toUpperCase();
    const dwellSeconds = (this.zoneManager.dwellDurationMs / 1000).toFixed(1);
    this.promptAreaMeta.innerText = `Pointed for ${dwellSeconds}s`;

    this.pointingPromptBanner.classList.remove('hidden');

    // Stream stable target update to Jarvis live agent
    if (this.bridge) {
      this.bridge.sendTargetUpdate(zone.name, true);
      this.lastReportedBoard = zone.name;
    }

    // Offline native Voice Announcement with Customizable Message
    if (this.speechEnabled && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const textToSpeak = (zone.voiceMessage && zone.voiceMessage.trim()) 
          ? zone.voiceMessage.trim() 
          : `Pointing to ${zone.name}`;
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('[Speech] Voice error:', e);
      }
    }

    if (this.promptTimer) clearTimeout(this.promptTimer);
    this.promptTimer = setTimeout(() => {
      this.pointingPromptBanner.classList.add('hidden');
    }, 2400);
  }

  onNewCameraFrame(timestamp) {
    if (this.video.readyState < 2 || this.video.paused) return;

    const detection = this.tracker.detect(this.video, timestamp);
    if (detection) {
      const rawLandmarks = detection.landmarks;
      const rawWorld = detection.worldLandmarks;
      const pointingHands = [];

      for (let i = 0; i < rawLandmarks.length; i++) {
        if (isPointingPose(rawLandmarks[i], rawWorld[i] || null)) {
          pointingHands.push(rawLandmarks[i]);
        }
      }

      this.latestLandmarks = pointingHands;

      // Throttle DOM text updates to every 300ms to avoid layout thrashing
      if (timestamp - this.lastFpsDomUpdate > 300) {
        this.valFps.textContent = detection.fps;
        this.lastFpsDomUpdate = timestamp;
      }
    } else {
      this.latestLandmarks = [];
    }
  }

  renderLoop(timestamp) {
    if (!this.isRunning) return;

    // Fallback detection pass if browser doesn't support requestVideoFrameCallback
    if (!this.hasVideoFrameCallback) {
      if (this.video.readyState >= 2 && !this.video.paused) {
        if (this.video.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = this.video.currentTime;
          this.onNewCameraFrame(timestamp);
        }
      }
    }

    this.syncCanvasSize();
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    // Compute viewport layout parameters once per frame
    const flipH = this.camera.flipH;
    const flipV = this.camera.flipV;
    const fitMode = this.camera.fitMode;
    const videoAspect = (this.video.videoWidth || 640) / (this.video.videoHeight || 480);
    const screenAspect = w / h;

    let renderW = w;
    let renderH = h;
    let offsetX = 0;
    let offsetY = 0;

    if (fitMode === 'cover') {
      if (screenAspect > videoAspect) {
        renderH = w / videoAspect;
        offsetY = (h - renderH) * 0.5;
      } else {
        renderW = h * videoAspect;
        offsetX = (w - renderW) * 0.5;
      }
    } else {
      if (screenAspect > videoAspect) {
        renderW = h * videoAspect;
        offsetX = (w - renderW) * 0.5;
      } else {
        renderH = w / videoAspect;
        offsetY = (h - renderH) * 0.5;
      }
    }

    // Sync zone screen pixel coordinates (cached, zero allocations)
    this.zoneManager.syncScreenPoints(w, h);

    // Extract Index Finger landmarks for Laser Ray Pointing
    let pointingRay = null;

    if (this.latestLandmarks && this.latestLandmarks.length > 0) {
      let chosenHand = this.latestLandmarks[0];

      // If multiple pointing hands exist, check if one is actively intersecting a zone
      if (this.latestLandmarks.length > 1) {
        for (let i = 0; i < this.latestLandmarks.length; i++) {
          const testRay = this.calculatePointingRay(
            this.latestLandmarks[i], w, h, renderW, renderH, offsetX, offsetY, flipH, flipV
          );
          if (testRay) {
            for (let z = 0; z < this.zoneManager.zones.length; z++) {
              const zone = this.zoneManager.zones[z];
              if (zone._screenPts && intersectRayPolygon(testRay.tipScreen, testRay.dir, zone._screenPts)) {
                chosenHand = this.latestLandmarks[i];
                break;
              }
            }
          }
        }
      }

      pointingRay = this.calculatePointingRay(
        chosenHand, w, h, renderW, renderH, offsetX, offsetY, flipH, flipV
      );
    }

    // Check Pointing Beam Intersection & Render Areas in screen pixels
    const dwellState = this.zoneManager.update(pointingRay, w, h, timestamp);
    this.zoneManager.render(this.ctx, w, h, dwellState);

    // WebSocket Telemetry: when pointing ray leaves all zones or no pointing posture is active
    if ((!pointingRay || !dwellState || !dwellState.zone) && this.lastReportedBoard !== null) {
      if (this.bridge) {
        this.bridge.sendTargetUpdate(null, false);
      }
      this.lastReportedBoard = null;
    }

    // Render Clean Finger Skeleton and Keypoints
    if (this.video.readyState >= 2 && !this.video.paused && this.latestLandmarks && this.latestLandmarks.length > 0) {
      this.renderer.render(
        this.ctx,
        w,
        h,
        this.latestLandmarks,
        flipH,
        flipV,
        fitMode,
        videoAspect
      );
    }

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  calculatePointingRay(hand, w, h, renderW, renderH, offsetX, offsetY, flipH, flipV) {
    if (!hand || hand.length < 21) return null;

    const tipLm = hand[8]; // Index Fingertip
    const pipLm = hand[6]; // Index PIP joint
    const mcpLm = hand[5]; // Index MCP base

    const normTipX = flipH ? 1 - tipLm.x : tipLm.x;
    const normTipY = flipV ? 1 - tipLm.y : tipLm.y;
    const screenTipX = offsetX + normTipX * renderW;
    const screenTipY = offsetY + normTipY * renderH;

    const normPipX = flipH ? 1 - pipLm.x : pipLm.x;
    const normPipY = flipV ? 1 - pipLm.y : pipLm.y;
    const screenPipX = offsetX + normPipX * renderW;
    const screenPipY = offsetY + normPipY * renderH;

    const normMcpX = flipH ? 1 - mcpLm.x : mcpLm.x;
    const normMcpY = flipV ? 1 - mcpLm.y : mcpLm.y;
    const screenMcpX = offsetX + normMcpX * renderW;
    const screenMcpY = offsetY + normMcpY * renderH;

    let dirX = screenTipX - screenPipX;
    let dirY = screenTipY - screenPipY;
    const dirLenSq = dirX * dirX + dirY * dirY;

    if (dirLenSq > 1) {
      const invLen = 1 / Math.sqrt(dirLenSq);
      dirX *= invLen;
      dirY *= invLen;
    } else {
      dirX = 0;
      dirY = -1;
    }

    const distTipMcpSq = (screenTipX - screenMcpX) ** 2 + (screenTipY - screenMcpY) ** 2;
    const distPipMcpSq = (screenPipX - screenMcpX) ** 2 + (screenPipY - screenMcpY) ** 2;
    const isExtended = distTipMcpSq > distPipMcpSq * 1.3225; // 1.15^2

    const ray = this._pointingRay;
    ray.origin.x = screenTipX / w;
    ray.origin.y = screenTipY / h;
    ray.dir.x = dirX;
    ray.dir.y = dirY;
    ray.isExtended = isExtended;
    ray.tipScreen.x = screenTipX;
    ray.tipScreen.y = screenTipY;

    return ray;
  }

  syncCanvasSize() {
    const width = this.viewportWrapper.clientWidth || window.innerWidth;
    const height = this.viewportWrapper.clientHeight || window.innerHeight;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.syncCanvasSize());

    // 1. Add Area Button
    this.btnAddArea.addEventListener('click', () => {
      this.zoneManager.startDrawing('rect');
      this.updateDrawBannerUI();
      this.drawModeBanner.classList.remove('hidden');
      this.viewportWrapper.classList.add('drawing-active');
      this.btnAddArea.classList.add('active');
    });

    if (this.btnModeRect) {
      this.btnModeRect.addEventListener('click', () => {
        this.zoneManager.setDrawMode('rect');
        this.updateDrawBannerUI();
      });
    }

    if (this.btnModePoly) {
      this.btnModePoly.addEventListener('click', () => {
        this.zoneManager.setDrawMode('polygon');
        this.updateDrawBannerUI();
      });
    }

    if (this.btnUndoPoly) {
      this.btnUndoPoly.addEventListener('click', () => {
        this.zoneManager.undoPolygonPoint();
        this.updateDrawBannerUI();
      });
    }

    if (this.btnFinishPoly) {
      this.btnFinishPoly.addEventListener('click', () => {
        this.finishPolygonCreation();
      });
    }

    this.btnCancelDraw.addEventListener('click', () => {
      this.exitDrawingMode();
    });

    // 2. Mouse Drag & Click to Define or Adjust Areas
    this.viewportWrapper.addEventListener('mousedown', (e) => {
      if (this.zoneManager.isAdjustMode) {
        const rect = this.viewportWrapper.getBoundingClientRect();
        const handled = this.zoneManager.onAdjustMouseDown(e, rect);
        this.updateAdjustCursor();
        if (handled) return;
      }
      if (!this.zoneManager.isDrawingMode) return;
      if (e.target.closest('#draw-mode-banner') || e.target.closest('#adjust-mode-banner')) return;
      const rect = this.viewportWrapper.getBoundingClientRect();
      this.zoneManager.onMouseDown(e, rect);
      this.updateDrawBannerUI();
    });

    window.addEventListener('mousemove', (e) => {
      if (this.zoneManager.isAdjustMode) {
        const rect = this.viewportWrapper.getBoundingClientRect();
        this.zoneManager.onAdjustMouseMove(e, rect);
        this.updateAdjustCursor();
        return;
      }
      if (!this.zoneManager.isDrawingMode) return;
      const rect = this.viewportWrapper.getBoundingClientRect();
      this.zoneManager.onMouseMove(e, rect);
    });

    window.addEventListener('mouseup', (e) => {
      if (this.zoneManager.isAdjustMode) {
        this.zoneManager.onAdjustMouseUp();
        this.updateAdjustCursor();
        return;
      }
      if (!this.zoneManager.isDrawingMode) return;
      if (e.target && e.target.closest && (e.target.closest('#draw-mode-banner') || e.target.closest('#adjust-mode-banner'))) return;
      const rect = this.viewportWrapper.getBoundingClientRect();

      this.zoneManager.onMouseUp(rect, (newZone, saveCallback) => {
        this.openNameAreaModal(newZone, saveCallback);
      });
      this.updateDrawBannerUI();
    });

    this.viewportWrapper.addEventListener('dblclick', (e) => {
      if (!this.zoneManager.isDrawingMode || this.zoneManager.drawMode !== 'polygon') return;
      this.finishPolygonCreation();
    });

    // Save Area Dialog (Custom Label + Custom Voice Message)
    this.btnSaveNameArea.addEventListener('click', () => {
      const name = this.inputAreaName.value.trim() || 'Custom Area';
      const voice = this.inputAreaVoice ? this.inputAreaVoice.value.trim() : '';
      if (this.pendingAreaCallback) {
        this.pendingAreaCallback(name, voice);
        this.pendingAreaCallback = null;
      }
      this.nameAreaModal.classList.add('hidden');
    });

    this.btnCancelNameArea.addEventListener('click', () => {
      this.pendingAreaCallback = null;
      this.nameAreaModal.classList.add('hidden');
    });

    if (this.btnPreviewVoice) {
      this.btnPreviewVoice.addEventListener('click', () => {
        const name = this.inputAreaName.value.trim() || 'Custom Area';
        const voice = this.inputAreaVoice ? this.inputAreaVoice.value.trim() : '';
        const textToSpeak = voice || `Pointed to ${name}`;
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 1.05;
          window.speechSynthesis.speak(utterance);
        }
      });
    }

    const handleInputEnter = (e) => {
      if (e.key === 'Enter') {
        this.btnSaveNameArea.click();
      } else if (e.key === 'Escape') {
        this.btnCancelNameArea.click();
      }
    };
    this.inputAreaName.addEventListener('keydown', handleInputEnter);
    if (this.inputAreaVoice) {
      this.inputAreaVoice.addEventListener('keydown', handleInputEnter);
    }

    // 3. Dwell Trigger Time
    this.dwellSelect.addEventListener('change', (e) => {
      this.zoneManager.dwellDurationMs = Number(e.target.value);
    });

    // 4. Voice Prompt Toggle
    this.btnToggleSpeech.addEventListener('click', () => {
      this.speechEnabled = !this.speechEnabled;
      this.btnToggleSpeech.classList.toggle('active', this.speechEnabled);
      this.btnToggleSpeech.innerHTML = this.speechEnabled
        ? '<i data-lucide="volume-2"></i>'
        : '<i data-lucide="volume-x"></i>';
      refreshIcons();
    });

    // 5. Manage Areas Modal
    this.btnManageAreas.addEventListener('click', () => {
      this.renderManageAreasList();
      this.manageAreasModal.classList.remove('hidden');
    });

    this.btnCloseManageAreas.addEventListener('click', () => {
      this.manageAreasModal.classList.add('hidden');
    });

    this.btnDoneManageAreas.addEventListener('click', () => {
      this.manageAreasModal.classList.add('hidden');
    });

    this.btnClearAllAreas.addEventListener('click', () => {
      if (confirm('Delete all defined areas?')) {
        this.zoneManager.clearAllZones();
        this.renderManageAreasList();
      }
    });

    // 6. Camera Flip & Fit Controls
    this.btnToggleFlipH.addEventListener('click', () => {
      const flipped = this.camera.toggleFlipH();
      this.btnToggleFlipH.classList.toggle('active', flipped);
    });

    this.btnToggleFlipV.addEventListener('click', () => {
      const flipped = this.camera.toggleFlipV();
      this.btnToggleFlipV.classList.toggle('active', flipped);
    });

    this.btnToggleFit.addEventListener('click', () => {
      const fitMode = this.camera.toggleFitMode();
      this.btnToggleFit.classList.toggle('active', fitMode === 'contain');
      this.btnToggleFit.title = fitMode === 'contain'
        ? 'Uncropped Full Camera (Contain)'
        : 'Full-Bleed Fill (Cover)';
    });

    this.handsSelect.addEventListener('change', async (e) => {
      const numHands = Number(e.target.value);
      await this.tracker.updateOptions({ numHands });
    });

    this.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });

    this.cameraSelect.addEventListener('change', (e) => {
      this.camera.startCamera(e.target.value);
    });

    this.resolutionSelect.addEventListener('change', (e) => {
      const [w, h] = e.target.value.split('x').map(Number);
      this.camera.setResolution(w, h);
    });

    // Spacebar Hold to Adjust Polygons
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        const activeEl = document.activeElement;
        const isInput = activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable
        );

        if (!isInput && !this.zoneManager.isDrawingMode) {
          e.preventDefault();
          if (!this.zoneManager.isAdjustMode) {
            this.zoneManager.setAdjustMode(true);
            if (this.adjustModeBanner) this.adjustModeBanner.classList.remove('hidden');
            this.viewportWrapper.classList.add('adjust-active');
            this.updateAdjustCursor();
          }
        }
      } else if (e.key === 'Escape') {
        if (this.zoneManager.isDrawingMode) this.exitDrawingMode();
        if (this.zoneManager.isAdjustMode) {
          this.zoneManager.setAdjustMode(false);
          if (this.adjustModeBanner) this.adjustModeBanner.classList.add('hidden');
          this.viewportWrapper.classList.remove('adjust-active');
          this.viewportWrapper.style.cursor = '';
        }
        this.nameAreaModal.classList.add('hidden');
        this.manageAreasModal.classList.add('hidden');
      } else if (e.key === 'a' || e.key === 'A') {
        if (!this.nameAreaModal.classList.contains('hidden')) return;
        this.btnAddArea.click();
      } else if (e.key === 'h' || e.key === 'H') {
        this.btnToggleFlipH.click();
      } else if (e.key === 'v' || e.key === 'V') {
        this.btnToggleFlipV.click();
      } else if (e.key === 'u' || e.key === 'U') {
        this.btnToggleFit.click();
      } else if (e.key === 'f' || e.key === 'F') {
        this.btnFullscreen.click();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        if (this.zoneManager.isAdjustMode) {
          e.preventDefault();
          this.zoneManager.setAdjustMode(false);
          if (this.adjustModeBanner) this.adjustModeBanner.classList.add('hidden');
          this.viewportWrapper.classList.remove('adjust-active');
          this.viewportWrapper.style.cursor = '';
        }
      }
    });

    window.addEventListener('blur', () => {
      if (this.zoneManager.isAdjustMode) {
        this.zoneManager.setAdjustMode(false);
        if (this.adjustModeBanner) this.adjustModeBanner.classList.add('hidden');
        this.viewportWrapper.classList.remove('adjust-active');
        this.viewportWrapper.style.cursor = '';
      }
    });
  }

  updateAdjustCursor() {
    if (!this.zoneManager.isAdjustMode) {
      this.viewportWrapper.style.cursor = '';
      return;
    }
    const cursor = this.zoneManager.getAdjustCursor();
    this.viewportWrapper.style.cursor = cursor;
  }

  exitDrawingMode() {
    this.zoneManager.cancelDrawing();
    this.drawModeBanner.classList.add('hidden');
    this.viewportWrapper.classList.remove('drawing-active');
    this.btnAddArea.classList.remove('active');
  }

  finishPolygonCreation() {
    if (this.zoneManager.polygonPoints.length < 3) return;
    this.zoneManager.finishPolygon((newZone, saveCallback) => {
      this.openNameAreaModal(newZone, saveCallback);
    });
  }

  openNameAreaModal(newZone, saveCallback) {
    this.exitDrawingMode();
    this.pendingAreaCallback = saveCallback;
    this.inputAreaName.value = newZone.name || '';
    if (this.inputAreaVoice) {
      this.inputAreaVoice.value = newZone.voiceMessage || '';
    }
    this.nameAreaModal.classList.remove('hidden');
    setTimeout(() => this.inputAreaName.focus(), 100);
  }

  updateDrawBannerUI() {
    const isPoly = this.zoneManager.drawMode === 'polygon';
    if (this.btnModeRect) this.btnModeRect.classList.toggle('active', !isPoly);
    if (this.btnModePoly) this.btnModePoly.classList.toggle('active', isPoly);

    if (isPoly) {
      const count = this.zoneManager.polygonPoints.length;
      if (this.polyCount) this.polyCount.innerText = count;
      if (this.drawGuidanceText) {
        this.drawGuidanceText.innerText = count < 3
          ? `Click points on camera to build polygon (${count}/3 minimum)`
          : `Click to add points, or click Complete / double-click to finish`;
      }
      if (this.btnFinishPoly) this.btnFinishPoly.classList.toggle('hidden', count < 3);
      if (this.btnUndoPoly) this.btnUndoPoly.classList.toggle('hidden', count === 0);
    } else {
      if (this.drawGuidanceText) {
        this.drawGuidanceText.innerText = '📐 Drag anywhere on camera feed to create box';
      }
      if (this.btnFinishPoly) this.btnFinishPoly.classList.add('hidden');
      if (this.btnUndoPoly) this.btnUndoPoly.classList.add('hidden');
    }
    refreshIcons();
  }

  renderManageAreasList() {
    this.areasList.innerHTML = '';
    if (this.zoneManager.zones.length === 0) {
      this.areasList.innerHTML = '<p class="modal-desc" style="text-align:center; padding: 14px 0;">No areas created yet. Click "+ Add Area" to create one.</p>';
      return;
    }

    this.zoneManager.zones.forEach((z) => {
      const item = document.createElement('div');
      item.className = 'area-list-item';
      const shapeType = (z.points && z.points.length > 4) || z.type === 'polygon' ? '⬡ Polygon' : '🔲 Box';
      const voiceDisplay = z.voiceMessage && z.voiceMessage.trim()
        ? `"${z.voiceMessage.trim()}"`
        : `Default ("Pointed to ${z.name}")`;

      item.innerHTML = `
        <div class="area-item-info">
          <span class="area-color-dot" style="background: ${z.color};"></span>
          <div class="area-item-texts">
            <div class="area-item-name-row">
              <span class="area-item-name">${z.name}</span>
              <span class="area-type-tag">${shapeType}</span>
            </div>
            <div class="area-voice-preview" title="Voice Announcement">
              <i data-lucide="volume-2" style="width: 12px; height: 12px; vertical-align: middle;"></i>
              <span>${voiceDisplay}</span>
            </div>
          </div>
        </div>
        <div class="area-item-actions">
          <button class="btn-icon btn-speak-area" data-id="${z.id}" title="Test Voice Announcement">
            <i data-lucide="volume-2"></i>
          </button>
          <button class="btn-icon btn-edit-area" data-id="${z.id}" title="Edit Name & Voice Message">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="btn-delete-area" data-id="${z.id}" title="Delete Area">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;

      // Speak voice test button
      item.querySelector('.btn-speak-area').addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const zone = this.zoneManager.zones.find((itemZone) => itemZone.id === id);
        if (zone && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const text = zone.voiceMessage && zone.voiceMessage.trim() ? zone.voiceMessage.trim() : `Pointed to ${zone.name}`;
          const utt = new SpeechSynthesisUtterance(text);
          utt.rate = 1.05;
          window.speechSynthesis.speak(utt);
        }
      });

      // Edit name and voice button
      item.querySelector('.btn-edit-area').addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const zone = this.zoneManager.zones.find((itemZone) => itemZone.id === id);
        if (zone) {
          this.manageAreasModal.classList.add('hidden');
          this.openNameAreaModal(zone, (newName, newVoice) => {
            zone.name = newName;
            zone.voiceMessage = newVoice;
            this.zoneManager.saveToStorage();
            this.manageAreasModal.classList.remove('hidden');
            this.renderManageAreasList();
          });
        }
      });

      // Delete area button
      item.querySelector('.btn-delete-area').addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.zoneManager.deleteZone(id);
        this.renderManageAreasList();
      });

      this.areasList.appendChild(item);
    });

    refreshIcons();
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const app = new AeroFingerApp();
  app.init();
});
