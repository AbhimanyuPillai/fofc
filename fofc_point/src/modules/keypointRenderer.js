import { HandLandmarker } from '@mediapipe/tasks-vision';

const FINGER_COLORS = [
  '#10b981', // 0: wrist
  '#ffaa00', '#ffaa00', '#ffaa00', '#ffaa00', // 1-4: thumb
  '#00f5d4', '#00f5d4', '#00f5d4', '#00f5d4', // 5-8: index
  '#a855f7', '#a855f7', '#a855f7', '#a855f7', // 9-12: middle
  '#f43f5e', '#f43f5e', '#f43f5e', '#f43f5e', // 13-16: ring
  '#38bdf8', '#38bdf8', '#38bdf8', '#38bdf8', // 17-20: pinky
];

const CONNECTIONS = HandLandmarker.HAND_CONNECTIONS || [];

export class KeypointRenderer {
  constructor() {
    this.showBones = true;
    // Pre-allocated flat coordinate buffers to eliminate per-frame allocations
    this.px = new Float32Array(21);
    this.py = new Float32Array(21);
  }

  render(ctx, width, height, handsLandmarks, flipH = true, flipV = false, fitMode = 'contain', videoAspect = 640 / 480) {
    if (!handsLandmarks || handsLandmarks.length === 0) return;

    // Calculate viewport transform once per frame
    const screenAspect = width / height;
    let renderW = width;
    let renderH = height;
    let offsetX = 0;
    let offsetY = 0;

    if (fitMode === 'cover') {
      if (screenAspect > videoAspect) {
        renderH = width / videoAspect;
        offsetY = (height - renderH) * 0.5;
      } else {
        renderW = height * videoAspect;
        offsetX = (width - renderW) * 0.5;
      }
    } else {
      if (screenAspect > videoAspect) {
        renderW = height * videoAspect;
        offsetX = (width - renderW) * 0.5;
      } else {
        renderH = width / videoAspect;
        offsetY = (height - renderH) * 0.5;
      }
    }

    ctx.save();

    const px = this.px;
    const py = this.py;

    for (let h = 0; h < handsLandmarks.length; h++) {
      const landmarks = handsLandmarks[h];
      const count = Math.min(21, landmarks.length);

      // Fast coordinate transformation without object allocation
      for (let i = 0; i < count; i++) {
        const lm = landmarks[i];
        const normX = flipH ? 1 - lm.x : lm.x;
        const normY = flipV ? 1 - lm.y : lm.y;
        px[i] = offsetX + normX * renderW;
        py[i] = offsetY + normY * renderH;
      }

      // 1. Draw Bolder Skeleton Bones
      if (this.showBones) {
        ctx.lineWidth = 3.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let c = 0; c < CONNECTIONS.length; c++) {
          const conn = CONNECTIONS[c];
          const s = conn.start;
          const e = conn.end;
          ctx.strokeStyle = FINGER_COLORS[e];
          ctx.beginPath();
          ctx.moveTo(px[s], py[s]);
          ctx.lineTo(px[e], py[e]);
          ctx.stroke();
        }
      }

      // 2. Draw Bolder Keypoint Dots (Optimized to 2 canvas passes per point)
      for (let i = 0; i < count; i++) {
        const x = px[i];
        const y = py[i];
        const color = FINGER_COLORS[i];
        const isTip = (i === 4 || i === 8 || i === 12 || i === 16 || i === 20);
        const radius = isTip ? 7.5 : (i === 0 ? 8 : 5.5);

        // Core dot with white border
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Specular highlight
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
