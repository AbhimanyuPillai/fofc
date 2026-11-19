export class EdgeCameraManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.devices = [];
    this.selectedDeviceId = null;
    this.flipH = false; // Show the table in its physical orientation by default.
    this.flipV = false;
    this.fitMode = 'contain'; // 'contain' = 100% uncropped view, 'cover' = full-bleed
    this.resolution = { width: 640, height: 480 };
    this.updateVideoStyle();
  }

  updateVideoStyle() {
    if (!this.video) return;
    const scaleX = this.flipH ? -1 : 1;
    const scaleY = this.flipV ? -1 : 1;
    this.video.style.transform = `scale(${scaleX}, ${scaleY})`;
    this.video.style.objectFit = this.fitMode;
  }

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter((d) => d.kind === 'videoinput');
      return this.devices;
    } catch (e) {
      console.warn('[Camera] Failed to enumerate devices:', e);
      return [];
    }
  }

  async startCamera(deviceId = null, resolution = null) {
    this.stopCamera();

    if (resolution) {
      this.resolution = resolution;
    }
    if (deviceId) {
      this.selectedDeviceId = deviceId;
    }

    const constraints = {
      audio: false,
      video: {
        width: { ideal: this.resolution.width },
        height: { ideal: this.resolution.height },
        frameRate: this.resolution.width >= 1920 ? { ideal: 30 } : { ideal: 60, min: 30 },
        facingMode: this.selectedDeviceId ? undefined : 'user',
        deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.updateVideoStyle();
          this.video.play();
          resolve();
        };
      });

      await this.getDevices();
      return { success: true };
    } catch (err) {
      console.error('[Camera] getUserMedia failed:', err);
      return { success: false, error: err.name || err.message };
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  toggleFlipH() {
    this.flipH = !this.flipH;
    this.updateVideoStyle();
    return this.flipH;
  }

  toggleFlipV() {
    this.flipV = !this.flipV;
    this.updateVideoStyle();
    return this.flipV;
  }

  toggleFitMode() {
    this.fitMode = this.fitMode === 'contain' ? 'cover' : 'contain';
    this.updateVideoStyle();
    return this.fitMode;
  }

  setResolution(width, height) {
    this.resolution = { width, height };
    if (this.stream) {
      return this.startCamera(this.selectedDeviceId, this.resolution);
    }
  }
}
