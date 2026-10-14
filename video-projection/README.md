# Video Projection System

A Next.js application with Electron integration for TV kiosk mode, designed to display videos on TVs with remote control capabilities.

## Features

- **TV Kiosk Mode**: Fullscreen Electron application optimized for TV displays
- **Remote Control**: Control video playback remotely via Server-Sent Events
- **Performance Optimized**: Hardware acceleration and performance optimizations for smooth video playback
- **Auto-Recovery**: Automatic crash detection and recovery
- **Raspberry Pi Support**: Optimized for deployment on Raspberry Pi devices

## Getting Started

### Development

Start the development environment (Next.js + Electron):

```bash
npm run dev
```

This will start both the Next.js server and the Electron application in development mode.

### Development Helper

Use the development helper script for common tasks:

```bash
# Interactive mode
npm run helper

# Or with specific commands
npm run helper -- install  # Install all dependencies
npm run helper -- build    # Build the project
npm run helper -- health   # Check system health
```

Available helper commands:
- `dev`: Start development environment
- `kiosk`: Start TV kiosk mode
- `install`: Install all dependencies
- `build`: Build the project
- `install-kiosk`: Install TV kiosk service for auto-start
- `health`: Check system health
- `help`: Show help message

### TV Kiosk Mode

Start the TV kiosk mode:

```bash
npm run tv:kiosk
```

Install the TV kiosk service for auto-start:

```bash
npm run tv:install-kiosk
```

## Documentation

Detailed documentation is available in the `docs` directory:

- [Electron TV Kiosk Setup Guide](docs/ELECTRON_TV_KIOSK_SETUP.md): Detailed setup instructions for TV kiosk mode
- [Developer Guide](docs/DEVELOPER_GUIDE.md): Comprehensive guide for developers working on the project

## Project Structure

- `/src`: Next.js application source code
- `/electron`: Electron application for TV kiosk mode
- `/docs`: Project documentation
- `/public`: Static assets

## Scripts

- `npm run dev`: Start development environment (Next.js + Electron)
- `npm run dev:next-only`: Start only the Next.js server
- `npm run build`: Build the Next.js application
- `npm run start`: Start the production Next.js server
- `npm run tv:electron`: Start Electron in production mode
- `npm run tv:electron-dev`: Start Electron in development mode
- `npm run tv:kiosk`: Start TV kiosk mode
- `npm run tv:install-kiosk`: Install TV kiosk service for auto-start
- `npm run helper`: Run the development helper script

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Framer Motion Documentation](https://www.framer.com/motion/)
