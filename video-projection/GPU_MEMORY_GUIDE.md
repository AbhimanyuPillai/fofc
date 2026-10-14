# GPU Memory Detection & Optimization Guide

## Overview

The video projection application now includes comprehensive GPU memory detection and automatic optimization. The system detects available GPU (NVIDIA, AMD, Intel, Apple) and adjusts animations, videos, and rendering quality based on GPU capabilities.

## Features

### 1. **Automatic GPU Detection**
- Detects GPU manufacturer (NVIDIA, AMD, Intel, Apple)
- Identifies GPU model and VRAM capacity
- Checks WebGL and WebGPU support
- Estimates available GPU memory

### 2. **Performance Tiers**
The system automatically assigns one of three performance tiers:

#### **HIGH Performance** (8GB+ VRAM)
- 60 FPS target
- 10,000 max particles
- Ultra texture quality
- High shadow quality (4096x4096)
- 16 simultaneous lights
- 4x anti-aliasing
- Post-processing effects enabled
- Bloom and SSAO enabled
- 1080p video quality
- 5M polygon models

#### **MEDIUM Performance** (2-8GB VRAM) - Default
- 30 FPS target
- 1,000 max particles
- Medium texture quality
- Medium shadow quality (2048x2048)
- 8 simultaneous lights
- 2x anti-aliasing
- Post-processing disabled
- 720p video quality
- 500K polygon models

#### **LOW Performance** (<2GB VRAM)
- 24 FPS target
- 100 max particles
- Low texture quality
- Low shadow quality (512x512)
- 2 simultaneous lights
- No anti-aliasing
- All effects disabled
- 360p video quality
- 100K polygon models

### 3. **GPU-Aware Rendering**

All animations and videos automatically adjust based on GPU capabilities:

**Canvas Animations (TechnoBackground)**
- Particle count scales with GPU VRAM
- Circuit line complexity adjusts
- Grid size optimizes for performance

**3D Model Rendering**
- Shadow map resolution adapts
- Lighting quality adjusts
- Model polygon complexity limits
- Animation frame rates throttle appropriately

**Video Playback**
- Resolution automatically selected
- Hardware acceleration enabled when available
- Memory-efficient codec selection

## Accessing GPU Information

### Monitor Dashboard
Navigate to `http://localhost:3000/monitor` to view:

1. **System Metrics Tab** - CPU, memory, and system info
2. **GPU Memory Tab** - Detailed GPU information and optimization settings

### GPU Memory Tab Shows:
- GPU renderer and vendor
- WebGL/WebGPU support
- Total VRAM and estimated available memory
- Performance tier classification
- GPU capability parameters
- Applied optimization settings
- Performance recommendations

## Implementation Details

### Files Created/Modified

**New Files:**
- `/src/utils/gpuDetection.ts` - GPU detection and optimization utilities
- `/src/components/GPUMemoryMonitor.tsx` - GPU monitoring UI component
- `/src/app/monitor/page.tsx` - Enhanced monitor page with GPU tab

**Modified Files:**
- `/src/config/performance.ts` - Integrated GPU-based performance presets

### GPU Detection API

```typescript
import {
  detectGPU,
  getGPUMemoryInfo,
  getGPUOptimizationSettings,
  getGPUPerformanceTier,
  logGPUInfo,
} from '@/utils/gpuDetection';

// Get detailed GPU information
const gpuInfo = detectGPU();
console.log(gpuInfo.renderer); // e.g., "NVIDIA GeForce RTX 4090"
console.log(gpuInfo.estimatedVRAM); // e.g., 24576 (24GB)

// Get memory information
const memoryInfo = getGPUMemoryInfo();
console.log(memoryInfo.totalVRAM); // Total VRAM in MB
console.log(memoryInfo.isHighEnd); // true/false

// Get optimization settings
const settings = getGPUOptimizationSettings();
console.log(settings.targetFPS); // 60, 30, or 24
console.log(settings.shadowQuality); // 'high', 'medium', 'low'

// Get performance tier
const tier = getGPUPerformanceTier(); // 'high', 'medium', 'low'

// Log all GPU info to console
logGPUInfo();
```

## GPU Memory Estimation

The system estimates VRAM based on GPU model:

### NVIDIA
- RTX 4090/6000: 24GB
- RTX 4080/4070 Ti/3090: 12GB
- RTX 4070/4060 Ti/3080/3070: 8GB
- RTX 4060/3060/GTX 1080/1070: 6GB
- GTX 1060/960/950: 3GB
- GTX 750/650: 1GB
- Default: 2GB

### AMD
- RX 7900 XTX/6900 XT: 24GB
- RX 7900 XT/6800 XT: 12GB
- RX 7800 XT/6700 XT: 8GB
- RX 6600 XT/5700 XT: 6GB
- RX 6600/5600: 3GB
- Default: 2GB

### Intel
- Arc A770: 8GB
- Arc A750: 4GB
- Iris Xe/Pro: 1GB (shared)
- UHD/HD Graphics: 512MB (shared)
- Default: 512MB

### Apple
- M3 Max/M2 Max/M1 Max: 8GB
- M3 Pro/M2 Pro/M1 Pro: 4GB
- M3/M2/M1: 2GB

## Performance Optimization Examples

### High-End GPU (NVIDIA RTX 4090)
```
✓ 60 FPS target
✓ 10,000 particles
✓ 4096x4096 shadow maps
✓ 16 lights
✓ 4x MSAA
✓ Bloom + SSAO enabled
✓ 1080p video
```

### Mid-Range GPU (NVIDIA RTX 3060)
```
⚠ 30 FPS target
⚠ 1,000 particles
⚠ 2048x2048 shadow maps
⚠ 8 lights
⚠ 2x MSAA
⚠ Post-processing disabled
⚠ 720p video
```

### Low-End GPU (Intel UHD Graphics)
```
! 24 FPS target
! 100 particles
! 512x512 shadow maps
! 2 lights
! No MSAA
! All effects disabled
! 360p video
```

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| GPU Detection | ✅ | ✅ | ✅ | ✅ |
| WebGL 2.0 | ✅ | ✅ | ✅ | ✅ |
| WebGPU | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Debug Info | ✅ | ✅ | ✅ | ✅ |

## Troubleshooting

### GPU Not Detected
- **Cause**: WebGL not available or disabled
- **Solution**: Enable WebGL in browser settings, try different browser

### Incorrect VRAM Estimation
- **Cause**: GPU model not in database
- **Solution**: System falls back to conservative estimate based on max texture size

### Low Performance Despite High-End GPU
- **Cause**: GPU drivers outdated or hardware acceleration disabled
- **Solution**: Update GPU drivers, enable hardware acceleration in browser

### High Memory Usage
- **Cause**: GPU memory leak or excessive particle count
- **Solution**: Check browser console for errors, reduce particle count manually

## Advanced Configuration

### Manual Performance Override

Edit `/src/config/performance.ts` to override GPU-based settings:

```typescript
// Force specific performance tier
export const FORCE_PERFORMANCE_TIER = 'high'; // 'high', 'medium', 'low', or null

// Override specific settings
export const OVERRIDE_SETTINGS = {
  targetFPS: 60,
  maxParticles: 5000,
  shadowMapSize: 4096,
};
```

### Custom GPU Detection

Extend GPU detection in `/src/utils/gpuDetection.ts`:

```typescript
// Add custom GPU model detection
function estimateGPUMemory(renderer: string, ...): number {
  // Add your custom logic here
  if (/your-gpu-model/i.test(renderer)) {
    return 16384; // 16GB
  }
  // ... rest of function
}
```

## Performance Monitoring

### Real-Time Monitoring
1. Open `/monitor` page
2. Click "GPU Memory" tab
3. View real-time GPU information and applied optimizations

### Console Logging
```typescript
import { logGPUInfo } from '@/utils/gpuDetection';

// Log all GPU info to browser console
logGPUInfo();
```

## Integration with Animations & Videos

### Animations
All canvas and Three.js animations automatically use GPU-optimized settings:
- Frame rate throttling
- Particle count limits
- Animation complexity reduction

### Videos
Video playback automatically selects quality:
- High-end: 1080p with hardware acceleration
- Mid-range: 720p with standard acceleration
- Low-end: 360p with minimal effects

### 3D Models
Model rendering adapts to GPU:
- Shadow quality and resolution
- Lighting complexity
- Polygon count limits
- Material complexity

## Future Enhancements

- [ ] Real-time GPU memory usage tracking
- [ ] Dynamic quality adjustment during runtime
- [ ] GPU temperature monitoring
- [ ] VRAM usage per component
- [ ] WebGPU integration for better performance
- [ ] GPU-specific shader optimizations
- [ ] Predictive quality adjustment based on frame time

## Support

For GPU detection issues or feature requests, check:
1. Browser console for error messages
2. Monitor page for GPU information
3. GPU driver version and browser version
4. WebGL support status

## References

- [WebGL Specification](https://www.khronos.org/webgl/)
- [WebGL Debug Info Extension](https://www.khronos.org/registry/webgl/extensions/WEBGL_debug_renderer_info/)
- [GPU Detection Libraries](https://github.com/pmndrs/detect-gpu)
- [Three.js GPU Optimization](https://threejs.org/docs/index.html#manual/en/introduction/WebGL-compatibility)
