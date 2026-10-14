# Performance Optimizations for Video Playback

This document outlines the performance optimizations implemented to improve video playback on Raspberry Pi and other low-powered devices, particularly when using Electron for the `/tv` route.

## Issue

Video playback was lagging on Raspberry Pi when using Electron, while working perfectly in web browsers. The issue was identified as improper management of animations and insufficient hardware acceleration optimizations.

## Implemented Solutions

### 1. Animation Management

- **Complete Animation Disabling**: Added a `shouldRenderAnimations` variable that ensures animations are completely disabled during video playback
- **CSS Class Optimization**: Replaced hardcoded animation classes with conditional classes that are only applied when animations should be running
- **DOM Hiding**: Added explicit `display: none` style to animation containers during video playback to reduce DOM rendering overhead

### 2. Video Element Optimizations

- **Hardware Acceleration Attributes**: Added `playsInline`, `disablePictureInPicture`, and `disableRemotePlayback` attributes to the video element
- **Hardware Acceleration Styles**: Applied transform and rendering optimizations directly to the video element:
  ```jsx
  style={{
    transform: 'translateZ(0)',
    WebkitTransform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    willChange: 'transform',
    imageRendering: 'optimizeSpeed'
  }}
  ```
- **Event Handler Optimization**: Ensured animations are disabled immediately when video starts playing

### 3. Framer Motion Optimizations

- **Reduced Animation Duration**: Shortened animation durations from 0.5s to 0.2-0.3s for better performance
- **Hardware Acceleration**: Added `willChange` and `backfaceVisibility` properties to motion elements
- **Transition End Handling**: Added `transitionEnd` property to hide elements after animations complete

### 4. Electron Configuration

- **Raspberry Pi Specific Flags**: Updated Electron flags for better performance on Raspberry Pi:
  - Changed GL implementation from desktop to EGL (`--use-gl=egl`)
  - Reduced memory allocations to avoid memory pressure
  - Disabled smooth scrolling and antialiasing
  - Added low-end device optimizations

- **Memory Management**: Reduced memory allocations to better fit Raspberry Pi constraints:
  ```js
  '--force-gpu-mem-available-mb=256', // Reduced from 512
  '--max_old_space_size=512', // Reduced from 1024
  ```

- **Additional Performance Flags**:
  ```js
  '--disable-smooth-scrolling',
  '--disable-composited-antialiasing',
  '--disable-frame-rate-limit',
  '--disable-software-rasterizer',
  '--ignore-gpu-blocklist',
  '--enable-low-end-device-mode'
  ```

### 5. React Optimization

- **useEffect Dependency Array**: Fixed missing dependency array in useEffect hook to prevent unnecessary re-renders

## Recommended Raspberry Pi Configuration

For optimal performance on Raspberry Pi:

1. **GPU Memory Split**: Allocate at least 128MB to GPU
   ```bash
   sudo raspi-config
   # Navigate to: Advanced Options -> Memory Split -> 128
   ```

2. **CPU Governor**: Set to performance mode
   ```bash
   echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
   ```

3. **Video Format**: Use H.264 encoded videos at appropriate resolution (720p recommended for Raspberry Pi 3 and below, 1080p for Raspberry Pi 4)

4. **Cooling**: Ensure adequate cooling to prevent thermal throttling

## Testing

To verify the optimizations:

1. Run the application in Electron kiosk mode:
   ```bash
   npm run tv:kiosk
   ```

2. Monitor performance using the built-in memory usage logging (outputs every 30 seconds)

3. Check for smooth video playback without stuttering or frame drops

## Future Considerations

- Consider implementing video transcoding for optimal playback on target devices
- Explore WebGL-based video rendering for even better performance
- Implement adaptive quality based on device capabilities