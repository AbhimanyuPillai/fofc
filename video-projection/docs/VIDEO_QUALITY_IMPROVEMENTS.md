# Video Quality Improvements

This document outlines the improvements made to address video quality issues (blurriness and lag) in the Video Projection system, particularly when running in Electron on Raspberry Pi devices.

## Issues Addressed

1. **Video Blurriness**: Videos appeared blurry and lacked clarity
2. **Playback Lag**: Video playback was not smooth, showing stuttering and frame drops
3. **Inconsistent Rendering**: Different rendering settings between CSS and React component

## Implemented Solutions

### 1. Video Rendering Quality Improvements

#### CSS Rendering Settings
```css
video {
  object-fit: contain !important;
  image-rendering: auto !important;
  filter: none !important;
  -webkit-filter: none !important;
}
```

- Changed `object-fit` from `cover` to `contain` to preserve aspect ratio and prevent cropping
- Updated `image-rendering` to prioritize quality over speed
- Removed any filters that might reduce quality

#### React Component Styling
```jsx
<video
  style={{
    imageRendering: 'auto',
    filter: 'none',
    WebkitFilter: 'none'
  }}
/>
```

- Aligned React component styles with injected CSS
- Ensured consistent rendering behavior across the application

### 2. Electron Performance Optimizations

#### Enhanced Performance Flags
```javascript
const PERFORMANCE_FLAGS = [
  // Video-specific optimizations
  '--enable-features=VaapiVideoDecoder,CanvasOopRasterization,RawDraw,VideoToolboxVP9Decoding',
  '--use-gl=desktop',
  '--force-gpu-mem-available-mb=384',
  '--enable-high-resolution-time',
  '--enable-begin-frame-scheduling',
  '--enable-surface-synchronization',
  '--enable-checker-imaging',
  '--video-image-texture-target=0x8D41',
  '--enable-accelerated-mjpeg-decode',
  '--enable-accelerated-video-encode'
];
```

- Added video-specific feature flags
- Switched from `egl` to `desktop` GL implementation for higher quality rendering
- Increased GPU memory allocation for better video processing
- Added frame scheduling and synchronization flags for smoother playback
- Enabled high-resolution timing for better frame pacing

#### BrowserWindow Configuration
```javascript
mainWindow = new BrowserWindow({
  backgroundColor: '#000000',
  paintWhenInitiallyHidden: true,
  webPreferences: {
    acceleratedVideoDecode: true,
    backgroundThrottling: false,
    preferredFrameRate: 60
  }
});
```

- Set black background for better video contrast
- Enabled pre-rendering before window is shown
- Disabled background throttling to maintain performance
- Set target frame rate to 60fps for smooth playback

### 3. Memory Allocation Adjustments

- Increased memory allocations to support higher quality video processing:
  ```javascript
  '--force-gpu-mem-available-mb=384',  // Increased memory allocation
  '--max_old_space_size=768'  // Increased memory allocation
  ```

- Balanced memory usage to avoid pressure on low-end devices while providing enough resources for quality rendering

## Testing

A test script (`test-video-quality.js`) has been created to verify the improvements:

```bash
# Make the script executable
chmod +x test-video-quality.js

# Run the test
./test-video-quality.js
```

The script plays test videos to evaluate:
1. Resolution and clarity
2. Motion smoothness
3. Color accuracy

## Raspberry Pi Specific Recommendations

For optimal video quality on Raspberry Pi:

1. **GPU Memory**: Allocate at least 256MB to GPU
   ```bash
   sudo raspi-config
   # Navigate to: Advanced Options -> Memory Split -> 256
   ```

2. **Video Format**: Use H.264 encoded videos at appropriate resolution
   - Raspberry Pi 3 and below: 720p recommended
   - Raspberry Pi 4: 1080p supported

3. **Power Supply**: Use official 3A+ power supply to prevent throttling

4. **Cooling**: Ensure adequate cooling to prevent thermal throttling

## Future Considerations

1. **Adaptive Quality**: Implement detection of device capabilities to adjust video quality settings automatically
2. **Video Transcoding**: Consider server-side transcoding for optimal format delivery
3. **WebGL Rendering**: Explore WebGL-based video rendering for even better performance
4. **Hardware Decoding Monitoring**: Add tools to monitor hardware decoding usage