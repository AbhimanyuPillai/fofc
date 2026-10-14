# Quick Start Guide

## Production Build & Run

### Build the application
```bash
npm run build
```

### Start with Browser Windows (Recommended)
Opens two fullscreen browser windows automatically:
```bash
npm start
```

This will:
1. Start the Next.js production server
2. Open `http://localhost:3000` (Main Experience Center)
3. Open `http://localhost:3000/tv` (TV Display)

### Alternative: Server Only
If you want to manage browser windows manually:
```bash
npm run start:server-only
```

Then open in your browser:
- Main: `http://localhost:3000`
- TV: `http://localhost:3000/tv`

## Development

### Start with hot reload
```bash
npm run dev:next-only
```

### Lint code
```bash
npm run lint
```

## Available Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Build for production |
| `npm start` | **Start server + open browser windows** |
| `npm run start:browser` | Same as `npm start` |
| `npm run start:server-only` | Start server only (no browser) |
| `npm run dev:next-only` | Development with hot reload |
| `npm run dev` | Development with Electron (legacy) |
| `npm run lint` | Check code style |

## System Requirements

- **Node.js** 14+ with npm
- **Google Chrome** or **Chromium** browser
- **Port 3000** available (or configure in scripts)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F11` | Toggle fullscreen |
| `Ctrl+W` | Close window |
| `Ctrl+Shift+M` | Open DevTools |
| `Ctrl+C` | Stop server |

## Troubleshooting

### Chrome not found
Install Google Chrome from https://www.google.com/chrome/

### Port 3000 in use
```bash
# Kill process using port 3000
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### Server not starting
Check if there are any error messages in the terminal. Common issues:
- Port already in use
- Missing dependencies (run `npm install`)
- Build errors (run `npm run build`)

## Monitoring

### System & GPU Metrics
Open `http://localhost:3000/monitor` to view:
- CPU usage and temperature
- Memory (JS Heap) usage
- GPU information and VRAM
- Applied optimizations

### Browser DevTools
Press `Ctrl+Shift+M` in any window to open DevTools for:
- Console (errors and logs)
- Network (API calls)
- Performance (profiling)
- Elements (DOM inspection)

## File Structure

```
project-root/
├── src/
│   ├── app/              # Next.js pages
│   ├── components/       # React components
│   ├── config/           # Configuration files
│   └── utils/            # Utility functions
├── public/               # Static assets
├── .next/                # Build output (generated)
├── package.json          # Dependencies and scripts
├── next.config.js        # Next.js configuration
└── tsconfig.json         # TypeScript configuration
```

## Documentation

- [Browser Windows Guide](./BROWSER_WINDOWS_GUIDE.md) - Fullscreen browser setup
- [System Monitor Guide](./SYSTEM_MONITOR_GUIDE.md) - CPU/GPU/Memory monitoring
- [GPU Memory Guide](./GPU_MEMORY_GUIDE.md) - GPU detection and optimization
- [Performance Optimization](./PERFORMANCE_OPTIMIZATION.md) - Performance tuning

## Next Steps

1. **Build**: `npm run build`
2. **Start**: `npm start`
3. **Monitor**: Open `http://localhost:3000/monitor`
4. **Develop**: Use `npm run dev:next-only` for hot reload

## Support

For detailed information, refer to the documentation files listed above.
