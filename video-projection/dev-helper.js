#!/usr/bin/env node

/**
 * Video Projection Development Helper
 * 
 * A utility script to simplify common development tasks for the Video Projection system.
 * Run with: node dev-helper.js <command>
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Define colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Helper functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  console.error(`${colors.red}ERROR: ${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️ ${message}`, colors.blue);
}

function warning(message) {
  log(`⚠️ ${message}`, colors.yellow);
}

function executeCommand(command, args, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: 'inherit',
      cwd
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

function checkPort(port) {
  return new Promise((resolve) => {
    exec(`lsof -i:${port}`, (error, stdout) => {
      resolve(!error && stdout.trim() !== '');
    });
  });
}

// Command implementations
async function startDev() {
  info('Starting development environment...');
  try {
    await executeCommand('node', ['start-dev-with-electron.js']);
  } catch (err) {
    error(`Failed to start development environment: ${err.message}`);
  }
}

async function startTvKiosk() {
  info('Starting TV kiosk mode...');
  try {
    await executeCommand('npm', ['run', 'tv:kiosk']);
  } catch (err) {
    error(`Failed to start TV kiosk: ${err.message}`);
  }
}

async function installDependencies() {
  info('Installing dependencies...');
  try {
    log('Installing main project dependencies...', colors.cyan);
    await executeCommand('npm', ['install']);
    
    log('Installing Electron dependencies...', colors.cyan);
    await executeCommand('npm', ['install'], path.join(__dirname, 'electron'));
    
    success('All dependencies installed successfully');
  } catch (err) {
    error(`Failed to install dependencies: ${err.message}`);
  }
}

async function buildProject() {
  info('Building project...');
  try {
    await executeCommand('npm', ['run', 'build']);
    success('Project built successfully');
  } catch (err) {
    error(`Failed to build project: ${err.message}`);
  }
}

async function installTvKiosk() {
  info('Installing TV kiosk service...');
  try {
    await executeCommand('npm', ['run', 'tv:install-kiosk']);
  } catch (err) {
    error(`Failed to install TV kiosk service: ${err.message}`);
  }
}

async function checkHealth() {
  info('Checking system health...');
  
  // Check if Next.js server is running
  const isNextRunning = await checkPort(3000);
  if (isNextRunning) {
    success('Next.js server is running on port 3000');
  } else {
    warning('Next.js server is not running');
  }
  
  // Check dependencies
  const mainPackageJson = path.join(__dirname, 'package.json');
  const electronPackageJson = path.join(__dirname, 'electron', 'package.json');
  
  if (fs.existsSync(path.join(__dirname, 'node_modules'))) {
    success('Main project dependencies are installed');
  } else {
    warning('Main project dependencies are not installed');
  }
  
  if (fs.existsSync(path.join(__dirname, 'electron', 'node_modules'))) {
    success('Electron dependencies are installed');
  } else {
    warning('Electron dependencies are not installed');
  }
  
  // Check build
  if (fs.existsSync(path.join(__dirname, '.next'))) {
    success('Next.js build exists');
  } else {
    warning('Next.js build not found');
  }
  
  // Check TV kiosk service
  exec('systemctl --user status video-projection-tv-kiosk@$(whoami).service', (error, stdout) => {
    if (!error) {
      if (stdout.includes('Active: active (running)')) {
        success('TV kiosk service is running');
      } else if (stdout.includes('Active: inactive')) {
        warning('TV kiosk service is installed but not running');
      } else {
        warning('TV kiosk service status: ' + stdout.split('\n').find(line => line.includes('Active:')));
      }
    } else {
      warning('TV kiosk service is not installed or not accessible');
    }
  });
}

async function showHelp() {
  log('\n📺 Video Projection Development Helper', colors.bright + colors.cyan);
  log('A utility script to simplify common development tasks\n');
  
  log('Available commands:', colors.bright);
  log('  dev           Start development environment (Next.js + Electron)');
  log('  kiosk         Start TV kiosk mode');
  log('  install       Install all dependencies');
  log('  build         Build the project');
  log('  install-kiosk Install TV kiosk service for auto-start');
  log('  health        Check system health');
  log('  help          Show this help message');
  
  log('\nExamples:', colors.bright);
  log('  node dev-helper.js dev');
  log('  node dev-helper.js install');
  log('  node dev-helper.js health');
}

async function interactive() {
  log('\n📺 Video Projection Development Helper', colors.bright + colors.cyan);
  log('Please select an option:\n');
  
  log('1. Start development environment (Next.js + Electron)');
  log('2. Start TV kiosk mode');
  log('3. Install all dependencies');
  log('4. Build the project');
  log('5. Install TV kiosk service for auto-start');
  log('6. Check system health');
  log('7. Exit');
  
  rl.question('\nEnter option number: ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        await startDev();
        break;
      case '2':
        await startTvKiosk();
        break;
      case '3':
        await installDependencies();
        rl.close();
        break;
      case '4':
        await buildProject();
        rl.close();
        break;
      case '5':
        await installTvKiosk();
        break;
      case '6':
        await checkHealth();
        rl.close();
        break;
      case '7':
        log('Exiting...', colors.dim);
        rl.close();
        break;
      default:
        error('Invalid option');
        await interactive();
        break;
    }
  });
}

// Main function
async function main() {
  const command = process.argv[2];
  
  if (!command) {
    // No command provided, run in interactive mode
    await interactive();
    return;
  }
  
  switch (command) {
    case 'dev':
      await startDev();
      break;
    case 'kiosk':
      await startTvKiosk();
      break;
    case 'install':
      await installDependencies();
      break;
    case 'build':
      await buildProject();
      break;
    case 'install-kiosk':
      await installTvKiosk();
      break;
    case 'health':
      await checkHealth();
      break;
    case 'help':
      await showHelp();
      break;
    default:
      error(`Unknown command: ${command}`);
      await showHelp();
      process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  error(err.message);
  process.exit(1);
});