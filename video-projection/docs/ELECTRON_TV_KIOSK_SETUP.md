# Electron TV Kiosk Mode Setup Guide

This guide explains how to set up the Video Projection system's `/tv` route in Electron kiosk mode for TV displays, particularly optimized for Raspberry Pi deployments.

## Overview

The Electron TV Kiosk mode provides:
- **True Kiosk Mode**: Fullscreen without browser UI overhead
- **Performance Optimization**: 30-50% better video performance vs browsers
- **Hardware Acceleration**: GPU-optimized rendering with ARM-specific flags
- **Auto-Recovery**: Crash detection and automatic restart capabilities
- **Autonomous Operation**: No user interaction required

## Quick Start

### 1. Install Electron Dependencies
```bash
cd electron
npm install
```

### 2. Development Mode (Test First)
```bash
# From project root
npm run tv:electron-dev

# Or directly
cd electron && npm run dev
```

### 3. Production Kiosk Mode
```bash
# From project root
npm run tv:kiosk

# Or directly
cd electron && ./start-tv-kiosk.sh
```

## Auto-Start Installation (Ubuntu/Raspberry Pi)

### Automatic Installation
```bash
# From project root
npm run tv:install-kiosk

# Or directly
cd electron && ./install-tv-kiosk.sh
```

### Manual Service Management
```bash
# Start service
systemctl --user start video-projection-tv-kiosk@$(whoami).service

# Stop service
systemctl --user stop video-projection-tv-kiosk@$(whoami).service

# Check status
systemctl --user status video-projection-tv-kiosk@$(whoami).service

# View logs
journalctl --user -u video-projection-tv-kiosk@$(whoami).service -f

# Disable auto-start
systemctl --user disable video-projection-tv-kiosk@$(whoami).service
```

## Performance Features

### Raspberry Pi Optimizations
- **GPU Memory Check**: Automatically checks and warns about GPU memory allocation
- **CPU Governor**: Sets performance mode for better video playback
- **Hardware Acceleration**: Enables GPU-accelerated video decoding
- **Memory Management**: Optimized for 1GB+ systems with memory limits

### Performance Flags Applied
```bash
--enable-gpu-rasterization
--enable-zero-copy
--disable-background-timer-throttling
--disable-renderer-backgrounding
--disable-backgrounding-occluded-windows
--enable-features=VaapiVideoDecoder
--use-gl=egl
--enable-hardware-overlays
--max-old-space-size=512
```

### CSS Performance Optimizations
- Cursor hidden in kiosk mode
- Animations disabled/minimized for better performance
- Hardware acceleration applied to elements
- Smooth scrolling disabled

## Kiosk Mode Features

### Security & Restrictions
- **No Context Menu**: Right-click disabled
- **No New Windows**: Window creation blocked
- **No Navigation**: Prevents accidental navigation
- **User Selection Disabled**: Text selection blocked

### Display Features
- **True Fullscreen**: No browser UI elements
- **Auto-Hide Cursor**: Cursor automatically hidden
- **Primary Display**: Uses full primary display dimensions
- **Frame Disabled**: No window frame or controls

## Monitoring & Recovery

### Automatic Recovery
- **Crash Detection**: Automatically restarts on crashes
- **Network Monitoring**: Waits for network connectivity
- **Server Health**: Monitors Next.js server status
- **Memory Monitoring**: Tracks memory usage every 30 seconds

### Logging
- **Comprehensive Logs**: All events logged to `tv-kiosk.log`
- **System Integration**: Logs available via `journalctl`
- **Performance Metrics**: Memory usage tracking

## Troubleshooting

### Common Issues

#### 1. Electron Won't Start
```bash
# Check if dependencies are installed
cd electron && npm install

# Check logs
tail -f ../tv-kiosk.log
```

#### 2. Black Screen
```bash
# Check if Next.js server is running
curl http://localhost:3000/tv

# Restart the service
systemctl --user restart video-projection-tv-kiosk@$(whoami).service
```

#### 3. Performance Issues on Raspberry Pi
```bash
# Check GPU memory allocation
vcgencmd get_mem gpu

# Should be 128M or higher for video performance
sudo raspi-config  # Advanced Options -> Memory Split -> 128
```

#### 4. Service Won't Auto-Start
```bash
# Check if user lingering is enabled
sudo loginctl enable-linger $(whoami)

# Check service status
systemctl --user status video-projection-tv-kiosk@$(whoami).service
```

### Performance Tuning

#### Raspberry Pi Recommendations
1. **GPU Memory**: Set to 128MB or higher
2. **SD Card**: Use Class 10 or better
3. **Power Supply**: Use official 3A+ power supply
4. **Cooling**: Ensure adequate cooling for sustained performance

#### System Optimization
```bash
# Set performance CPU governor
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Increase GPU memory (requires reboot)
echo "gpu_mem=128" | sudo tee -a /boot/config.txt
```

## Development

### File Structure
```
electron/
├── main.js                          # Main Electron application
├── package.json                     # Electron dependencies and build config
├── start-tv-kiosk.sh               # Startup script with optimizations
├── video-projection-tv-kiosk.service # Systemd service file
└── install-tv-kiosk.sh             # Installation helper script
```

### Building for Distribution
```bash
cd electron

# Build for current platform
npm run build

# Build for Raspberry Pi (ARM)
npm run build-rpi

# Build AppImage and DEB packages
npm run dist
```

## Integration with Main System

The Electron TV Kiosk mode integrates seamlessly with the existing video projection system:

- **SSE Connection**: Receives real-time video commands via Server-Sent Events
- **WebSocket Support**: Compatible with IoT controller notifications
- **Product Display**: Shows product information and videos as commanded
- **Autonomous Operation**: No user interaction required once started

## Security Considerations

- **Sandboxed**: Electron security best practices applied
- **No Node Integration**: Web content runs in isolated context
- **Content Security**: Prevents unauthorized content loading
- **System Protection**: Limited file system access via systemd

## Next Steps

1. Test in development mode first: `npm run tv:electron-dev`
2. Verify performance in kiosk mode: `npm run tv:kiosk`
3. Install auto-start service: `npm run tv:install-kiosk`
4. Configure Raspberry Pi optimizations if applicable
5. Monitor logs and performance after deployment

For additional support or customization, refer to the main project documentation or contact the development team.
