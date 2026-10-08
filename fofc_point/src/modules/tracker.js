import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export class EdgeHandTracker {
  constructor() {
    this.handLandmarker = null;
    this.isReady = false;
    this.isLoading = false;
    this.loadError = null;

    // Config defaults optimized for high-FPS edge tracking
    this.config = {
      delegate: 'GPU', // 'GPU' (WebGL) or 'CPU'
      numHands: 2,     // Track up to 2 hands to support isolating pointing hand from open hands
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };

    this.lastFrameTime = 0;
    this.fps = 0;
    // Reusable result container to eliminate per-frame object allocations
    this._result = {
      landmarks: [],
      worldLandmarks: [],
      handednesses: [],
      fps: 0,
    };
  }

  /**
   * Initializes MediaPipe HandLandmarker using LOCAL offline assets.
   */
  async init(userConfig = {}) {
    this.config = { ...this.config, ...userConfig };
    this.isLoading = true;
    this.loadError = null;

    try {
      const wasmBasePath = new URL('./wasm', window.location.origin).href;
      const vision = await FilesetResolver.forVisionTasks(wasmBasePath);
      const modelPath = new URL('./models/hand_landmarker.task', window.location.origin).href;

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: this.config.delegate,
        },
        runningMode: 'VIDEO',
        numHands: this.config.numHands,
        minHandDetectionConfidence: this.config.minHandDetectionConfidence,
        minHandPresenceConfidence: this.config.minHandPresenceConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
      });

      this.isReady = true;
      this.isLoading = false;
      return true;
    } catch (err) {
      if (this.config.delegate === 'GPU') {
        this.config.delegate = 'CPU';
        return this.init(this.config);
      }
      this.loadError = err.message || 'Initialization failed';
      this.isLoading = false;
      throw err;
    }
  }

  async updateOptions(newOptions = {}) {
    const delegateChanged = newOptions.delegate && newOptions.delegate !== this.config.delegate;
    this.config = { ...this.config, ...newOptions };

    if (!this.handLandmarker) return;

    if (delegateChanged) {
      await this.init(this.config);
    } else {
      await this.handLandmarker.setOptions({
        numHands: this.config.numHands,
        minHandDetectionConfidence: this.config.minHandDetectionConfidence,
        minHandPresenceConfidence: this.config.minHandPresenceConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
      });
    }
  }

  detect(videoElement, timestamp = performance.now()) {
    if (!this.isReady || !this.handLandmarker) {
      return null;
    }

    let result = null;
    try {
      result = this.handLandmarker.detectForVideo(videoElement, timestamp);
    } catch (e) {
      return null;
    }

    // Exponential moving average FPS (zero array allocation)
    if (this.lastFrameTime > 0) {
      const delta = timestamp - this.lastFrameTime;
      if (delta > 0) {
        const instantFps = 1000 / delta;
        this.fps = this.fps === 0 ? instantFps : this.fps * 0.85 + instantFps * 0.15;
      }
    }
    this.lastFrameTime = timestamp;

    this._result.landmarks = result.landmarks || [];
    this._result.worldLandmarks = result.worldLandmarks || [];
    this._result.handednesses = result.handedness || [];
    this._result.fps = Math.round(this.fps);

    return this._result;
  }
}
