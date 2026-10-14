#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const path = require('path');

console.log('🚀 Starting Video Projection Development with Electron TV...\n');

// Function to kill processes on port 3000
function killExistingProcesses() {
  return new Promise((resolve) => {
    console.log('🧹 Cleaning up existing processes on port 3000...');
    exec('lsof -ti:3000 | xargs kill -9', (error) => {
      if (error) {
        console.log('No existing processes found on port 3000');
      } else {
        console.log('✅ Cleaned up existing processes');
      }
      // Wait a moment for processes to fully terminate
      setTimeout(resolve, 1000);
    });
  });
}

// Start the development workflow
async function startDevelopment() {
  // Clean up any existing processes first
  await killExistingProcesses();

  // Start Next.js development server
  console.log('📡 Starting Next.js development server...');
  const nextProcess = spawn('node', ['server.js'], {
    stdio: 'pipe',
    cwd: __dirname
  });

  nextProcess.stdout.on('data', (data) => {
    process.stdout.write(`[Next.js] ${data}`);
  });

  nextProcess.stderr.on('data', (data) => {
    process.stderr.write(`[Next.js] ${data}`);
  });

  // Wait for Next.js server to be ready, then start Electron
  let electronProcess;
  let serverReady = false;

  nextProcess.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Check if server is ready (look for common Next.js ready messages)
    if ((output.includes('Ready') || output.includes('started server') || output.includes('Local:')) && !serverReady) {
      serverReady = true;
      
      // Wait a bit more to ensure server is fully ready
      setTimeout(() => {
        console.log('\n📺 Starting Electron TV (single window)...');

        // Start Electron single-screen app (electron-main.js) that shows /tv
        // Enhanced GPU and display handling for better stability
        const electronArgs = [
          '.',
          '--dev',
          '--no-sandbox',
          '--disable-gpu',  // Disable GPU hardware acceleration
          '--disable-software-rasterizer',
          '--disable-gpu-compositing',
          '--disable-software-compositing',
          '--disable-gpu-vsync',
          '--disable-frame-rate-limit',
          '--disable-threaded-animation',
          '--disable-threaded-scrolling',
          '--in-process-gpu',
          '--disable-accelerated-2d-canvas',
          '--disable-accelerated-video-decode',
          '--disable-accelerated-mjpeg-decode',
          '--disable-accelerated-video-encode',
          '--disable-partial-raster',
          '--disable-zero-copy',
          '--disable-software-rasterizer',
          '--disable-gpu-early-init',
          '--no-zygote',
          '--single-process'
        ];

        electronProcess = spawn('npx', ['electron', ...electronArgs], {
          stdio: 'pipe',
          cwd: __dirname,
          env: {
            ...process.env,
            ELECTRON_OZONE_PLATFORM_HINT: 'auto',  // Let Electron choose the best platform
            ELECTRON_ANGLE: 'swiftshader',  // Use SwiftShader for better compatibility
            ELECTRON_GL_MODE: 'swiftshader',
            NODE_ENV: 'development',
            // Additional environment variables for stability
            ELECTRON_FORCE_WINDOW_MENU_BAR: '1',
            ELECTRON_NO_ASAR: '1',
            // Disable GPU blacklist
            IGNORE_GPU_BLACKLIST: '1',
            // Disable GPU process sandboxing
            ELECTRON_NO_SANDBOX: '1',
            // Disable GPU blacklist
            ELECTRON_ENABLE_LOGGING: '1',
            // Disable GPU process sandboxing
            ELECTRON_NO_ATTACH_CONSOLE: '1',
            // Disable GPU process sandboxing
            ELECTRON_RUN_AS_NODE: '0'
          }
        });

        electronProcess.stdout.on('data', (data) => {
          process.stdout.write(`[Electron] ${data}`);
        });

        electronProcess.stderr.on('data', (data) => {
          process.stderr.write(`[Electron] ${data}`);
        });

        electronProcess.on('close', (code) => {
          console.log(`\n📺 Electron TV Display exited with code ${code}`);
        });

      }, 2000); // Wait 2 seconds after server ready message
    }
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development servers...');
    
    if (electronProcess) {
      electronProcess.kill('SIGTERM');
    }
    
    nextProcess.kill('SIGTERM');
    
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', () => {
    if (electronProcess) {
      electronProcess.kill('SIGTERM');
    }
    nextProcess.kill('SIGTERM');
    process.exit(0);
  });

  nextProcess.on('close', (code) => {
    console.log(`\n📡 Next.js development server exited with code ${code}`);
    if (electronProcess) {
      electronProcess.kill('SIGTERM');
    }
    process.exit(code);
  });
}

// Start the development workflow
startDevelopment().catch(console.error);
