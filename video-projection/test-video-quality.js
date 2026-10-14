#!/usr/bin/env node

/**
 * Video Projection - Video Quality Test
 * 
 * This script tests video playback quality by sending test videos to the TV display.
 * Run with: node test-video-quality.js
 */

const http = require('http');
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
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Sample video URLs (replace with actual test videos)
const testVideos = [
  {
    name: "High Resolution Test",
    url: "/videos/high-res-test.mp4",
    description: "1080p high quality video"
  },
  {
    name: "Motion Test",
    url: "/videos/motion-test.mp4",
    description: "Video with fast motion to test smoothness"
  },
  {
    name: "Color Test",
    url: "/videos/color-test.mp4",
    description: "Video with color gradients to test clarity"
  }
];

// Function to send video command to the server
function sendVideoCommand(command) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/video-command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(JSON.stringify(command));
    req.end();
  });
}

// Function to play a test video
async function playTestVideo(video) {
  console.log(`${colors.bright}${colors.blue}Playing: ${video.name}${colors.reset}`);
  console.log(`Description: ${video.description}`);
  
  try {
    await sendVideoCommand({
      action: 'play',
      videoUrl: video.url,
      productName: `Test: ${video.name}`
    });
    console.log(`${colors.green}✓ Video command sent successfully${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error sending video command: ${error.message}${colors.reset}`);
  }
}

// Function to stop video playback
async function stopVideo() {
  try {
    await sendVideoCommand({ action: 'stop' });
    console.log(`${colors.green}✓ Video stopped${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error stopping video: ${error.message}${colors.reset}`);
  }
}

// Main test function
async function runVideoTest() {
  console.log(`\n${colors.bright}${colors.cyan}Video Projection - Video Quality Test${colors.reset}`);
  console.log(`This script will play test videos to verify playback quality.\n`);
  
  console.log(`${colors.yellow}Make sure the TV display is running and connected.${colors.reset}`);
  console.log(`The test will play each video for evaluation.\n`);
  
  for (let i = 0; i < testVideos.length; i++) {
    const video = testVideos[i];
    
    await playTestVideo(video);
    
    await new Promise(resolve => {
      rl.question(`\nPress Enter to continue to the next video (${i+1}/${testVideos.length})...`, () => {
        resolve();
      });
    });
    
    await stopVideo();
  }
  
  console.log(`\n${colors.bright}${colors.green}Test completed!${colors.reset}`);
  console.log(`All test videos have been played. Please evaluate the video quality.`);
  
  rl.close();
}

// Run the test
runVideoTest().catch(error => {
  console.error(`${colors.red}Error running test: ${error.message}${colors.reset}`);
  rl.close();
});