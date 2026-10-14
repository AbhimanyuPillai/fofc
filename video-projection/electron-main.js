const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let serverProcess;
let memoryCheckInterval;
let isQuitting = false;

// Memory monitoring configuration
const MEMORY_CHECK_INTERVAL = 10000; // 10 seconds
const MAX_MEMORY_MB = 1500; // 1.5GB
const MAX_RESTARTS = 3;
let restartCount = 0;

// FIXED: Optimized performance flags (removed conflicts and duplicates)
const PERFORMANCE_FLAGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-software-rasterizer',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--no-first-run',
    '--autoplay-policy=no-user-gesture-required',
    // Memory optimization
    '--js-flags=--max-old-space-size=2048',
];

// Apply performance flags early
PERFORMANCE_FLAGS.forEach(flag => {
    const [flagName, flagValue] = flag.replace('--', '').split('=');
    app.commandLine.appendSwitch(flagName, flagValue || '');
});

function waitForServer(port = 3000, maxAttempts = 60) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const checkServer = () => {
            attempts++;

            const req = http.get(`http://localhost:${port}/tv`, (res) => {
                if (res.statusCode === 200) {
                    console.log('Server is ready on http://localhost:3000/tv');
                    resolve();
                } else if (attempts < maxAttempts) {
                    setTimeout(checkServer, 1000);
                } else {
                    reject(new Error('Server failed to start'));
                }
            });

            req.on('error', () => {
                if (attempts < maxAttempts) {
                    process.stdout.write('.');
                    setTimeout(checkServer, 1000);
                } else {
                    reject(new Error('Server failed to start'));
                }
            });
        };

        console.log('Waiting for server to be ready...');
        checkServer();
    });
}

function startProductionServer() {
    console.log('Starting production server...');

    const projectRoot = path.join(__dirname);

    // Start production server using your server.js
    serverProcess = spawn('node', ['server.js'], {
        cwd: projectRoot,
        stdio: 'inherit', // Changed to inherit for better logging
        env: { ...process.env, NODE_ENV: 'production' }
    });

    serverProcess.on('error', (error) => {
        console.error(`Failed to start server: ${error.message}`);
    });

    serverProcess.on('close', (code) => {
        console.log(`Server process exited with code ${code}`);
        if (code !== 0 && !isQuitting) {
            console.error('Server crashed, shutting down...');
            gracefulShutdown();
        }
    });
}

function createWindow() {
    // Get primary display dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Create optimized browser window
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        fullscreen: true,
        kiosk: true,
        frame: false,
        show: false,
        backgroundColor: '#000000',
        titleBarStyle: 'hidden',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webgl: true,
            accelerated2dCanvas: true,
            backgroundThrottling: false,
            autoplayPolicy: 'no-user-gesture-required',
            spellcheck: false,
            enableWebSQL: false,
            offscreen: false, // Important: keep this false for kiosk mode
        },
    });

    // Optimized CSS for production
    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.insertCSS(`
            * { 
                cursor: none !important; 
                -webkit-user-select: none !important;
                user-select: none !important;
            }
            
            video, canvas {
                transform: translateZ(0) !important;
                backface-visibility: hidden !important;
                will-change: transform !important;
            }
            
            video {
                object-fit: contain !important;
                image-rendering: high-quality !important;
            }
        `);

        console.log('Window ready, CSS applied');
    });

    // Load the TV page
    mainWindow.loadURL('http://localhost:3000/tv');

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log('Window displayed');
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Auto-restart on crash
    mainWindow.webContents.on('crashed', (event, killed) => {
        console.error('Renderer process crashed. Killed:', killed);
        if (!isQuitting && restartCount < MAX_RESTARTS) {
            restartCount++;
            console.log(`Attempting restart ${restartCount}/${MAX_RESTARTS}...`);
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.reload();
                }
            }, 2000);
        } else {
            gracefulShutdown();
        }
    });

    // Handle navigation errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        if (errorCode === -3) { // ERR_ABORTED, ignore
            return;
        }
        console.error('Failed to load:', errorDescription, 'Code:', errorCode);
        if (!isQuitting) {
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.reload();
                }
            }, 3000);
        }
    });

    // Prevent new window creation
    mainWindow.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });

    // Disable right-click context menu
    mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault();
    });

    // Memory monitoring (less frequent)
    setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const memoryUsage = process.memoryUsage();
            console.log(`Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
        }
    }, 60000); // Every minute
}

// Memory monitoring and cleanup
function setupMemoryMonitoring() {
    memoryCheckInterval = setInterval(() => {
        try {
            const memoryUsage = process.memoryUsage();
            const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

            console.log(`Memory - Used: ${usedMB}MB, RSS: ${rssMB}MB`);

            // Force garbage collection if memory is high
            if (usedMB > MAX_MEMORY_MB && !isQuitting) {
                console.warn('High memory usage detected, forcing garbage collection...');
                if (global.gc) {
                    global.gc();
                    console.log('Garbage collection forced');
                }

                // If still high after GC, consider reloading
                setTimeout(() => {
                    const newUsage = process.memoryUsage();
                    const newUsedMB = Math.round(newUsage.heapUsed / 1024 / 1024);
                    if (newUsedMB > MAX_MEMORY_MB * 0.9) {
                        console.warn('Memory still high after GC, reloading...');
                        if (mainWindow && !mainWindow.isDestroyed() && restartCount < MAX_RESTARTS) {
                            restartCount++;
                            mainWindow.reload();
                        } else if (restartCount >= MAX_RESTARTS) {
                            console.error('Max restarts reached, quitting...');
                            gracefulShutdown();
                        }
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('Memory monitoring error:', error);
        }
    }, MEMORY_CHECK_INTERVAL);
}

// Graceful shutdown function
function gracefulShutdown() {
    if (isQuitting) return;
    isQuitting = true;

    console.log('Starting graceful shutdown...');

    // Clear intervals
    if (memoryCheckInterval) {
        clearInterval(memoryCheckInterval);
        memoryCheckInterval = null;
    }

    // Close main window
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners();
        mainWindow.close();
        mainWindow = null;
    }

    // Kill server process
    if (serverProcess) {
        serverProcess.kill('SIGTERM');

        // Force kill after timeout
        setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
                console.log('Force killing server process...');
                serverProcess.kill('SIGKILL');
            }
        }, 5000);

        serverProcess = null;
    }

    // Quit app after cleanup
    setTimeout(() => {
        console.log('Quitting app...');
        app.quit();
    }, 1000);
}

// Setup process handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (!isQuitting) {
        gracefulShutdown();
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// App event handlers
app.whenReady().then(async () => {
    console.log('Electron app ready');

    // Enable garbage collection if not already enabled
    if (!global.gc) {
        console.warn('Garbage collection not exposed. Run with --expose-gc flag for better memory management');
    }

    // Start memory monitoring
    setupMemoryMonitoring();

    // Start production server
    startProductionServer();

    // Wait for server to be ready
    try {
        await waitForServer(3000);
        createWindow();
    } catch (error) {
        console.error('Failed to start server:', error);
        gracefulShutdown();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) {
            createWindow();
        }
    });
});

// Handle window closed
app.on('window-all-closed', () => {
    gracefulShutdown();
});

// Handle before quit
app.on('before-quit', (event) => {
    if (!isQuitting) {
        event.preventDefault();
        gracefulShutdown();
    }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
    contents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });
});