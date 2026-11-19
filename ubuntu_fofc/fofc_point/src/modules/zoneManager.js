import { audioSynth } from './audio.js';

// Pre-allocated reusable hit object to eliminate per-frame allocations during raycasting
const sharedHit = {
  hitDistance: 0,
  hitPoint: { x: 0, y: 0 },
};

/**
 * Exact 2D Ray-Polygon intersection test in screen pixel space
 * Supports arbitrary N-gon convex and concave polygons
 * @param {{x: number, y: number}} origin - Ray start point in pixels
 * @param {{x: number, y: number}} dir - Ray direction unit vector in pixels
 * @param {Array<{x: number, y: number}>} points - Polygon vertices in pixels
 * @returns {null | {hitDistance: number, hitPoint: {x: number, y: number}}}
 */
export function intersectRayPolygon(origin, dir, points) {
  if (!points || points.length < 3) return null;

  // 1. Point in polygon test (fingertip already inside polygon)
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > origin.y) !== (yj > origin.y)) &&
      (origin.x < ((xj - xi) * (origin.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  if (inside) {
    sharedHit.hitDistance = 0;
    sharedHit.hitPoint.x = origin.x;
    sharedHit.hitPoint.y = origin.y;
    return sharedHit;
  }

  // 2. Test intersection with each edge segment
  let minDistance = Infinity;
  let found = false;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];

    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;

    const denom = dir.x * vy - dir.y * vx;
    if (Math.abs(denom) < 1e-6) continue;

    const dx = p1.x - origin.x;
    const dy = p1.y - origin.y;

    const t = (dx * vy - dy * vx) / denom;
    const u = (dx * dir.y - dy * dir.x) / denom;

    if (t >= 0 && u >= 0 && u <= 1 && t < minDistance) {
      minDistance = t;
      found = true;
    }
  }

  if (found) {
    sharedHit.hitDistance = minDistance;
    sharedHit.hitPoint.x = origin.x + minDistance * dir.x;
    sharedHit.hitPoint.y = origin.y + minDistance * dir.y;
    return sharedHit;
  }

  return null;
}

/**
 * Returns normalized vertices [{x, y}, ...] for any zone (both polygon and rect)
 */
export function getZonePoints(zone) {
  if (zone.points && Array.isArray(zone.points) && zone.points.length >= 3) {
    return zone.points;
  }
  const x = zone.x || 0;
  const y = zone.y || 0;
  const w = zone.w || 0.1;
  const h = zone.h || 0.1;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/**
 * Ensures a zone has an explicit points array of normalized {x, y} coordinates
 */
export function ensureZonePoints(zone) {
  if (!zone.points || !Array.isArray(zone.points) || zone.points.length < 3) {
    zone.points = getZonePoints(zone).map((p) => ({ ...p }));
    zone._dirty = true;
  }
  return zone.points;
}

/**
 * 2D Point-in-Polygon containment test
 */
export function isPointInPolygon(px, py, points) {
  if (!points || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export class ZoneManager {
  constructor() {
    this.zones = [];
    this.mirrored = false;
    this.isDrawingMode = false;
    this.drawMode = 'rect'; // 'rect' or 'polygon'
    this.drawStart = null;
    this.currentDragRect = null;
    this.polygonPoints = [];
    this.currentMousePos = null;
    this.dwellDurationMs = 500; // 500ms default pointing dwell

    // Caching viewport dimensions for zero-allocation screen point sync
    this._cachedW = 0;
    this._cachedH = 0;

    // Pre-allocated update/dwell return container
    this._dwellResult = {
      zone: null,
      hitPoint: { x: 0, y: 0 },
      hitDistance: 0,
      progress: 0,
      isTriggered: false,
      ray: null,
    };

    // Spacebar Adjust Mode State
    this.isAdjustMode = false;
    this.hoveredVertex = null;
    this.hoveredAdjustZone = null;
    this.activeDragVertex = null;
    this.activeDragBody = null;

    // Hover state tracking
    this.hoveredZoneId = null;
    this.hoverStartTime = 0;
    this.triggeredZoneId = null;

    // Callbacks
    this.onTrigger = null;

    // Preset zone colors
    this.colors = ['#00f5d4', '#f72585', '#ffaa00', '#a855f7', '#38bdf8', '#10b981'];
    this.colorIndex = 0;

    this.loadFromStorage();
  }

  getDefaultExhibitionZones() {
    // Product areas are created and assigned through the admin panel.
    // Never seed example targets that could be mistaken for catalog products.
    return [];
  }

  loadFromStorage() {
    try {
      // Use a catalog-specific key so stale demo targets from older versions
      // cannot reappear after an upgrade. The admin API supplies saved zones.
      const saved = localStorage.getItem('repos_product_zones_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Old sample data is not a catalog; start with no targets and let the
        // admin define areas for the products returned by the live catalog.
        if (!Array.isArray(parsed) || parsed.length === 0 || (parsed.length === 1 && parsed[0].name === 'Control Panel')) {
          this.zones = this.getDefaultExhibitionZones();
          this.saveToStorage();
        } else {
          this.replaceZones(parsed);
        }
      } else {
        this.zones = this.getDefaultExhibitionZones();
        this.saveToStorage();
      }
    } catch (e) {
      this.zones = this.getDefaultExhibitionZones();
    }
  }

  replaceZones(zones) {
    this.zones = zones.map(zone => {
      // Targets saved before orientation was recorded used the mirrored default.
      const wasMirrored = zone.mirrored ?? true;
      const target = { ...zone, mirrored: this.mirrored, _dirty: true };
      if (wasMirrored !== this.mirrored) {
        target.points = getZonePoints(zone).map(({ x, y }) => ({ x: 1 - x, y }));
        this.recomputeBoundingBox(target);
      }
      return target;
    });
  }

  setMirrored(mirrored) {
    this.mirrored = mirrored;
    if (this.isDrawingMode) this.setDrawMode(this.drawMode);
    this.setAdjustMode(false);
    this.replaceZones(this.zones);
    this.saveToStorage();
  }

  saveToStorage() {
    try {
      // Clean internal caching flags before storing
      const toSave = this.zones.map((z) => {
        const { _screenPts, _dirty, ...rest } = z;
        return rest;
      });
      localStorage.setItem('repos_product_zones_v2', JSON.stringify(toSave));
    } catch (e) {
      console.warn('[ZoneManager] Failed to save zones:', e);
    }
  }

  /**
   * Synchronizes normalized zone points into screen pixel coordinates with zero per-frame object allocations
   */
  syncScreenPoints(width, height) {
    const sizeChanged = width !== this._cachedW || height !== this._cachedH;
    if (sizeChanged) {
      this._cachedW = width;
      this._cachedH = height;
    }

    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (sizeChanged || !z._screenPts || z._dirty) {
        const pts = ensureZonePoints(z);
        if (!z._screenPts || z._screenPts.length !== pts.length) {
          z._screenPts = new Array(pts.length);
          for (let k = 0; k < pts.length; k++) {
            z._screenPts[k] = { x: 0, y: 0 };
          }
        }
        for (let k = 0; k < pts.length; k++) {
          z._screenPts[k].x = pts[k].x * width;
          z._screenPts[k].y = pts[k].y * height;
        }
        z._dirty = false;
      }
    }
  }

  startDrawing(mode = 'rect') {
    this.isDrawingMode = true;
    this.drawMode = mode;
    this.drawStart = null;
    this.currentDragRect = null;
    this.polygonPoints = [];
    this.currentMousePos = null;
  }

  setDrawMode(mode) {
    this.drawMode = mode;
    this.drawStart = null;
    this.currentDragRect = null;
    this.polygonPoints = [];
    this.currentMousePos = null;
  }

  cancelDrawing() {
    this.isDrawingMode = false;
    this.drawStart = null;
    this.currentDragRect = null;
    this.polygonPoints = [];
    this.currentMousePos = null;
  }

  addPolygonPoint(x, y) {
    const pt = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
    this.polygonPoints.push(pt);
    audioSynth.playPinchSound(640);
    return this.polygonPoints.length;
  }

  undoPolygonPoint() {
    if (this.polygonPoints.length > 0) {
      this.polygonPoints.pop();
      audioSynth.playPinchSound(400);
    }
    return this.polygonPoints.length;
  }

  finishPolygon(promptCallback) {
    if (this.polygonPoints.length < 3) return false;

    const pts = [...this.polygonPoints];
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));

    const color = this.colors[this.colorIndex % this.colors.length];
    this.colorIndex++;

    const newZone = {
      id: `zone_${Date.now()}`,
      name: `Area ${this.zones.length + 1}`,
      voiceMessage: '',
      color,
      type: 'polygon',
      mirrored: this.mirrored,
      points: pts,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      _dirty: true,
    };

    this.isDrawingMode = false;
    this.polygonPoints = [];
    this.currentMousePos = null;

    if (promptCallback) {
      promptCallback(newZone, (name, voiceMessage) => {
        newZone.name = name && name.trim() ? name.trim() : newZone.name;
        newZone.voiceMessage = voiceMessage && voiceMessage.trim() ? voiceMessage.trim() : '';
        this.zones.push(newZone);
        this.saveToStorage();
      });
    } else {
      this.zones.push(newZone);
      this.saveToStorage();
    }

    return true;
  }

  onMouseDown(e, canvasRect) {
    if (!this.isDrawingMode) return;
    const x = (e.clientX - canvasRect.left) / canvasRect.width;
    const y = (e.clientY - canvasRect.top) / canvasRect.height;

    if (this.drawMode === 'rect') {
      this.drawStart = { x, y };
      this.currentDragRect = { x, y, w: 0, h: 0 };
    } else if (this.drawMode === 'polygon') {
      if (this.polygonPoints.length >= 3) {
        const first = this.polygonPoints[0];
        const distToFirst = Math.hypot(x - first.x, y - first.y);
        if (distToFirst < 0.035) return;
      }
      this.addPolygonPoint(x, y);
    }
  }

  onMouseMove(e, canvasRect) {
    if (!this.isDrawingMode) return;
    const currentX = Math.max(0, Math.min(1, (e.clientX - canvasRect.left) / canvasRect.width));
    const currentY = Math.max(0, Math.min(1, (e.clientY - canvasRect.top) / canvasRect.height));
    this.currentMousePos = { x: currentX, y: currentY };

    if (this.drawMode === 'rect') {
      if (!this.drawStart) return;
      const x = Math.min(this.drawStart.x, currentX);
      const y = Math.min(this.drawStart.y, currentY);
      const w = Math.abs(currentX - this.drawStart.x);
      const h = Math.abs(currentY - this.drawStart.y);
      this.currentDragRect = { x, y, w, h };
    }
  }

  onMouseUp(canvasRect, promptCallback) {
    if (!this.isDrawingMode) return;

    if (this.drawMode === 'rect') {
      if (!this.currentDragRect) return;
      const rect = { ...this.currentDragRect };
      this.isDrawingMode = false;
      this.drawStart = null;
      this.currentDragRect = null;

      if (rect.w < 0.03 || rect.h < 0.03) return;

      const color = this.colors[this.colorIndex % this.colors.length];
      this.colorIndex++;

      const minX = Math.max(0, Math.min(1 - rect.w, rect.x));
      const minY = Math.max(0, Math.min(1 - rect.h, rect.y));
      const w = rect.w;
      const h = rect.h;

      const newZone = {
        id: `zone_${Date.now()}`,
        name: `Area ${this.zones.length + 1}`,
        voiceMessage: '',
        color,
        type: 'rect',
        mirrored: this.mirrored,
        x: minX,
        y: minY,
        w,
        h,
        points: [
          { x: minX, y: minY },
          { x: minX + w, y: minY },
          { x: minX + w, y: minY + h },
          { x: minX, y: minY + h },
        ],
        _dirty: true,
      };

      if (promptCallback) {
        promptCallback(newZone, (name, voiceMessage) => {
          newZone.name = name && name.trim() ? name.trim() : newZone.name;
          newZone.voiceMessage = voiceMessage && voiceMessage.trim() ? voiceMessage.trim() : '';
          this.zones.push(newZone);
          this.saveToStorage();
        });
      } else {
        this.zones.push(newZone);
        this.saveToStorage();
      }
    } else if (this.drawMode === 'polygon') {
      if (this.polygonPoints.length >= 3 && this.currentMousePos) {
        const first = this.polygonPoints[0];
        const dist = Math.hypot(this.currentMousePos.x - first.x, this.currentMousePos.y - first.y);
        if (dist < 0.035) {
          this.finishPolygon(promptCallback);
        }
      }
    }
  }

  deleteZone(zoneId) {
    this.zones = this.zones.filter((z) => z.id !== zoneId);
    if (this.hoveredZoneId === zoneId) {
      this.hoveredZoneId = null;
    }
    this.saveToStorage();
  }

  clearAllZones() {
    this.zones = [];
    this.hoveredZoneId = null;
    this.hoveredVertex = null;
    this.hoveredAdjustZone = null;
    this.activeDragVertex = null;
    this.activeDragBody = null;
    this.saveToStorage();
  }

  setAdjustMode(enabled) {
    this.isAdjustMode = enabled;
    if (!enabled) {
      if (this.activeDragVertex || this.activeDragBody) {
        this.saveToStorage();
      }
      this.hoveredVertex = null;
      this.hoveredAdjustZone = null;
      this.activeDragVertex = null;
      this.activeDragBody = null;
    } else {
      this.hoveredZoneId = null;
      this.triggeredZoneId = null;
      this.zones.forEach((z) => ensureZonePoints(z));
    }
  }

  recomputeBoundingBox(zone) {
    if (!zone.points || zone.points.length === 0) return;
    const pts = zone.points;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    zone.x = minX;
    zone.y = minY;
    zone.w = maxX - minX;
    zone.h = maxY - minY;
    zone._dirty = true;
  }

  getAdjustCursor() {
    if (!this.isAdjustMode) return '';
    if (this.activeDragVertex) return 'crosshair';
    if (this.activeDragBody) return 'grabbing';
    if (this.hoveredVertex) return 'crosshair';
    if (this.hoveredAdjustZone) return 'grab';
    return 'default';
  }

  onAdjustMouseDown(e, canvasRect) {
    if (!this.isAdjustMode) return false;
    const pixelX = e.clientX - canvasRect.left;
    const pixelY = e.clientY - canvasRect.top;
    const normX = Math.max(0, Math.min(1, pixelX / canvasRect.width));
    const normY = Math.max(0, Math.min(1, pixelY / canvasRect.height));

    const HANDLE_RADIUS = 16;
    let closestDist = Infinity;
    let bestVertex = null;

    // Check vertex handles first
    for (let zIdx = this.zones.length - 1; zIdx >= 0; zIdx--) {
      const zone = this.zones[zIdx];
      const pts = ensureZonePoints(zone);
      for (let i = 0; i < pts.length; i++) {
        const vx = pts[i].x * canvasRect.width;
        const vy = pts[i].y * canvasRect.height;
        const dist = Math.hypot(pixelX - vx, pixelY - vy);
        if (dist <= HANDLE_RADIUS && dist < closestDist) {
          closestDist = dist;
          bestVertex = { zone, index: i };
        }
      }
      if (bestVertex) break;
    }

    if (bestVertex) {
      this.activeDragVertex = bestVertex;
      this.hoveredVertex = bestVertex;
      audioSynth.playPinchSound(640);
      return true;
    }

    // Check clicking inside polygon body to translate the entire shape
    for (let zIdx = this.zones.length - 1; zIdx >= 0; zIdx--) {
      const zone = this.zones[zIdx];
      const pts = ensureZonePoints(zone);
      if (isPointInPolygon(normX, normY, pts)) {
        this.activeDragBody = {
          zone,
          startMouseX: normX,
          startMouseY: normY,
          initialPoints: pts.map((p) => ({ ...p })),
        };
        this.hoveredAdjustZone = zone;
        audioSynth.playPinchSound(520);
        return true;
      }
    }

    return false;
  }

  onAdjustMouseMove(e, canvasRect) {
    if (!this.isAdjustMode) return;
    const pixelX = e.clientX - canvasRect.left;
    const pixelY = e.clientY - canvasRect.top;
    const normX = Math.max(0, Math.min(1, pixelX / canvasRect.width));
    const normY = Math.max(0, Math.min(1, pixelY / canvasRect.height));

    // 1. Actively dragging a vertex
    if (this.activeDragVertex) {
      const { zone, index } = this.activeDragVertex;
      zone.points[index].x = normX;
      zone.points[index].y = normY;
      zone.type = 'polygon';
      zone._dirty = true;
      this.recomputeBoundingBox(zone);
      return;
    }

    // 2. Actively dragging an entire polygon body
    if (this.activeDragBody) {
      const { zone, startMouseX, startMouseY, initialPoints } = this.activeDragBody;
      const dx = normX - startMouseX;
      const dy = normY - startMouseY;

      let clampedDx = dx;
      let clampedDy = dy;
      for (const p of initialPoints) {
        if (p.x + clampedDx < 0) clampedDx = -p.x;
        if (p.x + clampedDx > 1) clampedDx = 1 - p.x;
        if (p.y + clampedDy < 0) clampedDy = -p.y;
        if (p.y + clampedDy > 1) clampedDy = 1 - p.y;
      }

      for (let i = 0; i < zone.points.length; i++) {
        zone.points[i].x = initialPoints[i].x + clampedDx;
        zone.points[i].y = initialPoints[i].y + clampedDy;
      }
      zone._dirty = true;
      this.recomputeBoundingBox(zone);
      return;
    }

    // 3. Hover detection (vertices take priority, then polygon body)
    this.hoveredVertex = null;
    this.hoveredAdjustZone = null;

    const HANDLE_RADIUS = 16;
    let closestDist = Infinity;
    let bestVertex = null;

    for (let zIdx = this.zones.length - 1; zIdx >= 0; zIdx--) {
      const zone = this.zones[zIdx];
      const pts = ensureZonePoints(zone);
      for (let i = 0; i < pts.length; i++) {
        const vx = pts[i].x * canvasRect.width;
        const vy = pts[i].y * canvasRect.height;
        const dist = Math.hypot(pixelX - vx, pixelY - vy);
        if (dist <= HANDLE_RADIUS && dist < closestDist) {
          closestDist = dist;
          bestVertex = { zone, index: i, x: vx, y: vy };
        }
      }
      if (bestVertex) break;
    }

    if (bestVertex) {
      this.hoveredVertex = bestVertex;
      return;
    }

    for (let zIdx = this.zones.length - 1; zIdx >= 0; zIdx--) {
      const zone = this.zones[zIdx];
      const pts = ensureZonePoints(zone);
      if (isPointInPolygon(normX, normY, pts)) {
        this.hoveredAdjustZone = zone;
        break;
      }
    }
  }

  onAdjustMouseUp() {
    if (!this.isAdjustMode) return;
    if (this.activeDragVertex || this.activeDragBody) {
      this.saveToStorage();
      audioSynth.playPinchSound(480);
      this.activeDragVertex = null;
      this.activeDragBody = null;
    }
  }

  /**
   * Ray-based pointing evaluation: shoots a beam from index fingertip along finger pointing direction
   * Tested in uniform screen pixel space for both polygons and boxes
   * Zero per-frame allocations
   */
  update(pointingRay, width = window.innerWidth, height = window.innerHeight, timestamp = performance.now()) {
    if (this.isAdjustMode) {
      this.hoveredZoneId = null;
      this.triggeredZoneId = null;
      return null;
    }

    if (!pointingRay || !pointingRay.isExtended || !pointingRay.tipScreen) {
      this.hoveredZoneId = null;
      this.triggeredZoneId = null;
      return null;
    }

    this.syncScreenPoints(width, height);

    const origin = pointingRay.tipScreen;
    const dir = pointingRay.dir;

    let closestZone = null;
    let closestHitDistance = Infinity;
    let hitX = 0;
    let hitY = 0;

    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (!z._screenPts) continue;
      const hit = intersectRayPolygon(origin, dir, z._screenPts);
      if (hit && hit.hitDistance < closestHitDistance) {
        closestHitDistance = hit.hitDistance;
        closestZone = z;
        hitX = hit.hitPoint.x;
        hitY = hit.hitPoint.y;
      }
    }

    if (closestZone) {
      if (this.hoveredZoneId !== closestZone.id) {
        this.hoveredZoneId = closestZone.id;
        this.hoverStartTime = timestamp;
        this.triggeredZoneId = null;
        // Audio chime disabled - voice & earcons route exclusively through Jarvis
      }

      const elapsed = timestamp - this.hoverStartTime;
      const progress = Math.min(1.0, elapsed / this.dwellDurationMs);

      if (progress >= 1.0 && this.triggeredZoneId !== closestZone.id) {
        this.triggeredZoneId = closestZone.id;
        // Audio trigger chime disabled - voice & earcons route exclusively through Jarvis
        if (this.onTrigger) this.onTrigger(closestZone);
      }

      this._dwellResult.zone = closestZone;
      this._dwellResult.hitPoint.x = hitX;
      this._dwellResult.hitPoint.y = hitY;
      this._dwellResult.hitDistance = closestHitDistance;
      this._dwellResult.progress = progress;
      this._dwellResult.isTriggered = this.triggeredZoneId === closestZone.id;
      this._dwellResult.ray = pointingRay;
      return this._dwellResult;
    } else {
      this.hoveredZoneId = null;
      this.triggeredZoneId = null;
      this._dwellResult.zone = null;
      this._dwellResult.ray = pointingRay;
      return this._dwellResult;
    }
  }

  /**
   * Renders interactive areas (boxes & polygons), imaginary laser line, impact reticle, and dwell countdown
   * Zero per-frame object allocations
   */
  render(ctx, width, height, dwellState) {
    this.syncScreenPoints(width, height);
    ctx.save();

    // 1. Render Defined Areas (Both Polygons and Rectangles)
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const pts = z._screenPts;
      if (!pts || pts.length < 3) continue;

      const isHovered = !this.isAdjustMode && dwellState && dwellState.zone && dwellState.zone.id === z.id;
      const isTriggered = !this.isAdjustMode && isHovered && dwellState.isTriggered;
      const isAdjustZoneHovered = this.isAdjustMode && (
        (this.hoveredAdjustZone && this.hoveredAdjustZone.id === z.id) ||
        (this.activeDragBody && this.activeDragBody.zone.id === z.id)
      );

      // Area Fill
      if (this.isAdjustMode) {
        ctx.fillStyle = isAdjustZoneHovered
          ? 'rgba(255, 170, 0, 0.22)'
          : 'rgba(10, 15, 30, 0.45)';
      } else {
        ctx.fillStyle = isTriggered
          ? 'rgba(0, 245, 212, 0.25)'
          : isHovered
          ? 'rgba(10, 15, 30, 0.65)'
          : 'rgba(10, 15, 30, 0.35)';
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo(pts[k].x, pts[k].y);
      }
      ctx.closePath();
      ctx.fill();

      // Area Border
      if (this.isAdjustMode) {
        ctx.strokeStyle = isAdjustZoneHovered ? '#ffaa00' : z.color;
        ctx.lineWidth = isAdjustZoneHovered ? 2.5 : 1.8;
        if (isAdjustZoneHovered) {
          ctx.setLineDash([6, 4]);
        }
        ctx.stroke();
        if (isAdjustZoneHovered) {
          ctx.setLineDash([]);
        }
      } else {
        ctx.strokeStyle = isTriggered ? '#ffffff' : z.color;
        ctx.lineWidth = isTriggered ? 2.5 : isHovered ? 2.2 : 1.4;
        ctx.stroke();
      }

      // Corner Vertex Dots / Interactive Handles
      for (let idx = 0; idx < pts.length; idx++) {
        const pt = pts[idx];
        if (this.isAdjustMode) {
          const isDraggingThis = this.activeDragVertex &&
            this.activeDragVertex.zone.id === z.id &&
            this.activeDragVertex.index === idx;
          const isHoveredThis = this.hoveredVertex &&
            this.hoveredVertex.zone.id === z.id &&
            this.hoveredVertex.index === idx;

          if (isDraggingThis || isHoveredThis) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 170, 0, 0.4)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffaa00';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = z.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#05070d';
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isHovered ? 3.5 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isTriggered ? '#ffffff' : z.color;
          ctx.fill();
        }
      }

      // Area Header Badge
      let minX = pts[0].x;
      let minY = pts[0].y;
      for (let k = 1; k < pts.length; k++) {
        if (pts[k].x < minX) minX = pts[k].x;
        if (pts[k].y < minY) minY = pts[k].y;
      }

      const badgeText = this.isAdjustMode
        ? `⚙️ ${z.name.toUpperCase()}`
        : `📍 ${z.name.toUpperCase()}`;
      ctx.font = '600 9px system-ui, sans-serif';
      const tw = ctx.measureText(badgeText).width;
      const bh = 16;
      const bw = tw + 12;

      ctx.fillStyle = isTriggered
        ? z.color
        : this.isAdjustMode && isAdjustZoneHovered
        ? '#ffaa00'
        : 'rgba(6, 10, 20, 0.88)';
      ctx.strokeStyle = this.isAdjustMode && isAdjustZoneHovered ? '#ffaa00' : z.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(minX + 5, minY + 5, bw, bh, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = (isTriggered || (this.isAdjustMode && isAdjustZoneHovered)) ? '#05070d' : '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, minX + 11, minY + 5 + bh / 2);

      if (isTriggered) {
        ctx.fillStyle = '#00f5d4';
        ctx.font = 'bold 8.5px monospace';
        ctx.fillText('✓ POINTED!', minX + 8, minY + bh + 14);
      } else if (this.isAdjustMode && isAdjustZoneHovered && !this.activeDragVertex) {
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 8.5px monospace';
        ctx.fillText('✥ DRAG TO MOVE', minX + 8, minY + bh + 14);
      }
    }

    // 2. Render In-Progress Drag-to-Draw Preview
    if (this.isDrawingMode) {
      if (this.drawMode === 'rect' && this.currentDragRect) {
        const rx = this.currentDragRect.x * width;
        const ry = this.currentDragRect.y * height;
        const rw = this.currentDragRect.w * width;
        const rh = this.currentDragRect.h * height;

        ctx.fillStyle = 'rgba(0, 245, 212, 0.12)';
        ctx.strokeStyle = '#00f5d4';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 5);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#00f5d4';
        ctx.font = '9px monospace';
        ctx.fillText('RELEASE TO NAME AREA', rx + 6, ry + 14);
      } else if (this.drawMode === 'polygon') {
        const count = this.polygonPoints.length;
        if (count > 0) {
          ctx.strokeStyle = '#00f5d4';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(this.polygonPoints[0].x * width, this.polygonPoints[0].y * height);
          for (let i = 1; i < count; i++) {
            ctx.lineTo(this.polygonPoints[i].x * width, this.polygonPoints[i].y * height);
          }

          if (this.currentMousePos) {
            ctx.setLineDash([4, 3]);
            ctx.lineTo(this.currentMousePos.x * width, this.currentMousePos.y * height);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          for (let idx = 0; idx < count; idx++) {
            const px = this.polygonPoints[idx].x * width;
            const py = this.polygonPoints[idx].y * height;
            ctx.beginPath();
            ctx.arc(px, py, idx === 0 ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = idx === 0 ? '#10b981' : '#00f5d4';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            if (idx === 0 && count >= 3) {
              ctx.font = 'bold 8.5px monospace';
              ctx.fillStyle = '#10b981';
              ctx.fillText('CLICK TO CLOSE', px + 9, py - 2);
            }
          }
        }
      }
    }

    // 3. Render Imaginary Pointing Laser Beam coming out from Index Finger
    if (!this.isAdjustMode && dwellState && dwellState.ray && dwellState.ray.tipScreen) {
      const ray = dwellState.ray;
      const startX = ray.tipScreen.x;
      const startY = ray.tipScreen.y;

      let endX, endY;
      const hitZone = dwellState.zone;
      const isTargetHit = !!(hitZone && dwellState.hitPoint);

      if (isTargetHit) {
        endX = dwellState.hitPoint.x;
        endY = dwellState.hitPoint.y;
      } else {
        const maxDist = Math.max(width, height) * 0.85;
        endX = startX + ray.dir.x * maxDist;
        endY = startY + ray.dir.y * maxDist;
      }

      const beamColor = isTargetHit ? hitZone.color : 'rgba(0, 245, 212, 0.6)';

      ctx.strokeStyle = beamColor;
      ctx.lineWidth = isTargetHit ? 2.5 : 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(startX, startY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      if (isTargetHit) {
        ctx.beginPath();
        ctx.arc(endX, endY, 14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(
          endX,
          endY,
          14,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * dwellState.progress
        );
        ctx.strokeStyle = dwellState.isTriggered ? '#10b981' : beamColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(endX, endY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        const percent = Math.round(dwellState.progress * 100);
        ctx.font = 'bold 8.5px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(
          dwellState.isTriggered ? 'POINTED!' : `${percent}%`,
          endX,
          endY + 24
        );
      }
    }

    ctx.restore();
  }
}
