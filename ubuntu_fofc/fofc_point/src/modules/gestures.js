/**
 * High-performance 3D kinematic pointing posture classifier.
 * Optimized with static calculations and zero per-frame object allocations.
 */

function dist3DSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return dx * dx + dy * dy + dz * dz;
}

function checkFingerState(pts, tipIdx, pipIdx, mcpIdx, wrist) {
  const dTipMcpSq = dist3DSq(pts[tipIdx], pts[mcpIdx]);
  const dPipMcpSq = Math.max(1e-8, dist3DSq(pts[pipIdx], pts[mcpIdx]));
  const dTipWristSq = dist3DSq(pts[tipIdx], wrist);
  const dPipWristSq = Math.max(1e-8, dist3DSq(pts[pipIdx], wrist));

  // Square ratios comparison:
  // 1.30^2 = 1.69, 1.08^2 = 1.1664
  // 1.25^2 = 1.5625, 1.12^2 = 1.2544
  const isExtended = (dTipMcpSq / dPipMcpSq > 1.69) && (dTipWristSq / dPipWristSq > 1.1664);
  const isCurled = (dTipMcpSq / dPipMcpSq < 1.5625) || (dTipWristSq / dPipWristSq < 1.2544);

  return { isExtended, isCurled };
}

/**
 * Determines if a hand is specifically in the pointing position:
 * - Index finger extended
 * - Middle, ring, and pinky fingers curled/folded into palm
 *
 * @param {Array} landmarks - 21 normalized landmarks [{x, y, z}, ...]
 * @param {Array|null} worldLandmarks - 21 metric 3D landmarks [{x, y, z}, ...]
 * @returns {boolean} true if hand is in pointing posture
 */
export function isPointingPose(landmarks, worldLandmarks = null) {
  if (!landmarks || landmarks.length < 21) return false;

  const pts = worldLandmarks && worldLandmarks.length >= 21 ? worldLandmarks : landmarks;
  const wrist = pts[0];

  // 1. Index finger MUST be extended
  const index = checkFingerState(pts, 8, 6, 5, wrist);
  if (!index.isExtended) return false;

  // 2. Middle finger MUST NOT be extended and MUST be curled
  const middle = checkFingerState(pts, 12, 10, 9, wrist);
  if (middle.isExtended || !middle.isCurled) return false;

  // 3. Ring finger MUST NOT be extended and MUST be curled
  const ring = checkFingerState(pts, 16, 14, 13, wrist);
  if (ring.isExtended || !ring.isCurled) return false;

  // 4. Pinky finger MUST NOT be extended
  const pinky = checkFingerState(pts, 20, 18, 17, wrist);
  if (pinky.isExtended) return false;

  return true;
}
