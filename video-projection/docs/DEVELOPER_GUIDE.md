# Video Projection System - Developer Guide

This guide provides essential information for developers working on the Video Projection system, including common workflows, troubleshooting tips, and best practices.

## Project Overview

The Video Projection system is a Next.js application with an Electron wrapper for TV kiosk mode. It's designed to display videos on TVs in a kiosk mode, with the ability to control video playback remotely.

## Development Workflow

### Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd electron && npm install
   ```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js server and Electron app in development mode |
| `npm run dev:next-only` | Start only the Next.js server |
| `npm run tv:electron-dev` | Start Electron in development mode (requires Next.js server running) |
| `npm run tv:kiosk` | Start Electron in kiosk mode (production) |

### Development Tips

1. **Hot Reloading**: Changes to Next.js files will automatically reload in the browser and Electron
2. **Electron Debugging**: Use Chrome DevTools in the Electron window (Ctrl+Shift+I or Cmd+Option+I)
3. **Performance Testing**: Test on target hardware (especially Raspberry Pi) before deployment

## Architecture

### Key Components

1. **Next.js Application** (`/src`):
   - Main web application with React components
   - `/tv` route for TV display mode
   - Server-side rendering for performance

2. **Electron Wrapper** (`/electron`):
   - Provides kiosk mode functionality
   - Optimized for performance on TVs and Raspberry Pi
   - Auto-start and recovery features

3. **Communication**:
   - Server-Sent Events (SSE) for real-time video commands
   - WebSocket support for IoT controller notifications

## Common Tasks

### Adding a New Feature to TV Display

1. Modify `/src/app/tv/page.tsx` for UI changes
2. Test in development mode: `npm run dev`
3. Test in Electron: `npm run tv:electron-dev`
4. Test in kiosk mode: `npm run tv:kiosk`

### Optimizing Performance

1. Use hardware acceleration where possible
2. Minimize DOM updates during video playback
3. Use efficient CSS animations (transform, opacity)
4. Test on target hardware regularly

### Debugging

1. **Next.js Issues**:
   - Check browser console
   - Check server logs

2. **Electron Issues**:
   - Check Electron logs: `tail -f tv-kiosk.log`
   - Use Electron DevTools

3. **Kiosk Mode Issues**:
   - Check systemd logs: `journalctl --user -u video-projection-tv-kiosk@$(whoami).service -f`

## Deployment

### TV Kiosk Mode Deployment

1. Build the application: `npm run build`
2. Install kiosk mode: `npm run tv:install-kiosk`
3. Start the service: `systemctl --user start video-projection-tv-kiosk@$(whoami).service`
4. Check status: `systemctl --user status video-projection-tv-kiosk@$(whoami).service`

### Raspberry Pi Optimization

1. Set GPU memory to 128MB or higher
2. Use performance CPU governor
3. Ensure adequate cooling
4. Use Class 10 or better SD card

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**:
   - Run `npm install` in both root and `/electron` directories

2. **Black screen in Electron**:
   - Check if Next.js server is running
   - Check network connectivity
   - Check logs for errors

3. **Performance issues**:
   - Check CPU/GPU usage
   - Reduce animation complexity
   - Optimize video formats (H.264, lower resolution)

4. **Auto-start issues**:
   - Check systemd service status
   - Ensure user lingering is enabled
   - Check permissions on script files

## Best Practices

1. **Code Organization**:
   - Keep TV-specific code in dedicated components
   - Use TypeScript interfaces for video commands

2. **Performance**:
   - Optimize for target hardware
   - Test on actual devices
   - Monitor memory usage

3. **Error Handling**:
   - Implement graceful fallbacks
   - Log errors comprehensively
   - Add automatic recovery mechanisms

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Framer Motion Documentation](https://www.framer.com/motion/)
- [Raspberry Pi Performance Tuning](https://www.raspberrypi.org/documentation/computers/config_txt.html)

## Contributing

1. Follow the project's coding style
2. Test thoroughly before submitting changes
3. Document any new features or changes
4. Update this guide as needed