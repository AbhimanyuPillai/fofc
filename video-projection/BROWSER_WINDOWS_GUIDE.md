# Browser Windows Fullscreen Mode Guide

## Overview

The application now supports launching two browser windows in fullscreen mode when running `npm start`:
- **Window 1**: Main Experience Center (`localhost:3000`)
- **Window 2**: TV Display (`localhost:3000/tv`)

This replaces the Electron-based approach with native browser windows, making it easier to manage and maintain.

## Quick Start

### macOS & Linux
```bash
npm start
```

### Windows
```cmd
npm start
```

Both commands will:
1. Start the Next.js production server
2. Wait for the server to be ready
3. Open two Chrome windows in fullscreen mode
4. Display helpful tips in the terminal

## Available Commands

### `npm start` (Recommended)
Starts the server and opens both browser windows in fullscreen mode.
```bash
npm start
```

### `npm run start:browser`
Alias for `npm start` - explicitly opens browser windows.
```bash
npm run start:browser
```

### `npm run start:server-only`
Starts the server without opening browser windows (useful for manual browser control).
```bash
npm run start:server-only
```

## How It Works

### 1. **Server Startup**
- Starts Next.js production server on `http://localhost:3000`
- Waits for server to respond before opening browsers

### 2. **Browser Detection**
- **macOS**: Uses `open -a "Google Chrome"`
- **Linux**: Uses `google-chrome` or `chromium`
- **Windows**: Searches for Chrome in standard installation paths

### 3. **Window Management**
- Opens first window (Main) in fullscreen
- Waits 1 second
- Opens second window (TV) in fullscreen
- Both windows run independently

## System Requirements

### Required
- **Google Chrome** or **Chromium** browser installed
- **Node.js** 14+ with npm

### Installation

#### macOS
```bash
# Install Chrome if not already installed
brew install --cask google-chrome
```

#### Linux (Ubuntu/Debian)
```bash
# Install Chrome
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt-get update
sudo apt-get install google-chrome-stable
```

#### Windows
Download and install from: https://www.google.com/chrome/

## File Structure

```
project-root/
├── start-browser-windows.js      # Node.js script (cross-platform)
├── start-browser-windows.sh      # Shell script (macOS/Linux)
├── start-browser-windows.bat     # Batch script (Windows)
└── package.json                  # Updated with new scripts
```

## Features

### ✅ Fullscreen Mode
Both windows open in fullscreen automatically:
- No browser UI visible
- Maximizes content area
- Professional kiosk-like appearance

### ✅ Automatic Server Wait
Script waits for server to be ready before opening browsers:
- Prevents "connection refused" errors
- Configurable timeout (default: 30 seconds)
- Shows progress in terminal

### ✅ Cross-Platform Support
Works on macOS, Linux, and Windows with appropriate commands

### ✅ Graceful Degradation
If Chrome is not found:
- Shows helpful error message
- Suggests installation steps
- Exits cleanly

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F11` | Toggle fullscreen mode |
| `Ctrl+W` / `Cmd+W` | Close current window |
| `Ctrl+Shift+M` | Open DevTools |
| `Ctrl+C` | Stop server (in terminal) |
| `Ctrl+Tab` | Switch between windows |
| `Alt+Tab` | Switch between applications |

## Troubleshooting

### Chrome Not Found
**Error**: `❌ Google Chrome not found`

**Solution**:
1. Install Google Chrome from https://www.google.com/chrome/
2. Ensure Chrome is in the default installation path
3. Restart the terminal

### Server Not Starting
**Error**: `⚠️ Server check timeout`

**Solution**:
1. Check if port 3000 is already in use: `lsof -i :3000`
2. Kill existing process: `kill -9 <PID>`
3. Try again: `npm start`

### Windows Not Opening
**Issue**: Server starts but no browser windows appear

**Solution**:
1. Check if Chrome is installed: `where chrome` (Windows) or `which google-chrome` (Linux)
2. Try opening manually: `http://localhost:3000`
3. Check terminal for error messages

### Port Already in Use
**Error**: `EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# macOS/Linux
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## Advanced Usage

### Manual Server Start
If you want to start the server without opening browsers:

```bash
npm run start:server-only
```

Then manually open:
- `http://localhost:3000` in one window
- `http://localhost:3000/tv` in another window

### Custom Port
To use a different port, modify the scripts:

1. Edit `start-browser-windows.js`:
```javascript
const PORT = 3001; // Change from 3000
```

2. Edit `start-browser-windows.sh`:
```bash
PORT=3001  # Change from 3000
```

3. Edit `start-browser-windows.bat`:
```batch
set PORT=3001
```

### Disable Fullscreen
To open windows in normal windowed mode:

1. Remove `--start-fullscreen` flag from all scripts
2. Restart: `npm start`

## Performance Considerations

### Memory Usage
- Two browser windows = approximately 300-500 MB RAM
- GPU acceleration enabled for smooth rendering
- Hardware acceleration recommended

### CPU Usage
- Idle: < 5% CPU per window
- Active rendering: 10-30% CPU per window
- Depends on GPU and animation complexity

### Network
- Both windows share the same server
- Bandwidth usage: ~1-5 Mbps per window during video playback
- WebSocket connections for real-time updates

## Migration from Electron

### Before (Electron)
```bash
npm run tv:electron
```

### After (Browser Windows)
```bash
npm start
```

**Benefits of Browser Windows**:
- ✅ Simpler to maintain
- ✅ Smaller memory footprint
- ✅ Faster startup time
- ✅ Better browser compatibility
- ✅ Easier debugging with DevTools
- ✅ No Electron build complexity

## Stopping the Application

### Method 1: Terminal
Press `Ctrl+C` in the terminal where `npm start` is running

### Method 2: Browser
Close both browser windows, then press `Ctrl+C` in terminal

### Method 3: Task Manager (Windows)
1. Open Task Manager
2. Find "node.exe" or "npm"
3. Click "End Task"

## Logs and Debugging

### Server Logs
Check the terminal output for server messages:
```
🌐 Starting browser windows in fullscreen mode...
📍 Main window: http://localhost:3000
📺 TV window: http://localhost:3000/tv

⏳ Waiting for server to start...
✅ Server is ready!

🔄 Opening Main window: http://localhost:3000
✅ Main window opened

🔄 Opening TV Display window: http://localhost:3000/tv
✅ TV Display window opened

✨ Both browser windows opened in fullscreen mode!
```

### Browser DevTools
Open DevTools in each window:
- Press `Ctrl+Shift+M` (or `Cmd+Option+M` on Mac)
- Check Console for JavaScript errors
- Monitor Network tab for API calls
- Use Performance tab to profile rendering

## Future Enhancements

- [ ] Window positioning (left/right split)
- [ ] Custom window sizes
- [ ] Automatic window refresh on code changes
- [ ] Multi-monitor support
- [ ] Window state persistence
- [ ] Graceful restart on server crash

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review terminal output for error messages
3. Open browser DevTools for client-side errors
4. Check server logs for backend issues

## Related Documentation

- [System Monitor Guide](./SYSTEM_MONITOR_GUIDE.md)
- [GPU Memory Guide](./GPU_MEMORY_GUIDE.md)
- [Performance Optimization](./PERFORMANCE_OPTIMIZATION.md)
