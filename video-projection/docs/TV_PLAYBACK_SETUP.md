# TV Playback Setup Guide

This guide explains how to set up video playback on your TV/Android TV/Smart TV from the video projection carousel.

## 🎯 Overview

The carousel sends video playback commands via WebSocket to a connected device. The system supports both local and remote video sources.

## 📡 WebSocket Communication Flow

```
[Carousel App] --WebSocket--> [Media Server] --HDMI/Network--> [TV/Display]
```

## 🔧 Setup Options

### Option 1: Android TV Direct Connection

**Requirements:**
- Android TV with network access
- WebSocket server app on Android TV

**Setup:**
1. Install a WebSocket media player app on your Android TV
2. Configure the WebSocket URL in the carousel:
   ```typescript
   const ws = new WebSocket('ws://YOUR_ANDROID_TV_IP:8080/video-control');
   ```

### Option 2: Raspberry Pi Media Server (Recommended)

**Requirements:**
- Raspberry Pi connected to TV
- Python WebSocket server
- Network access

**Setup:**
1. **Install dependencies on Raspberry Pi:**
   ```bash
   sudo apt update
   sudo apt install python3-pip vlc
   pip3 install websockets asyncio
   ```

2. **Create media server script:**
   ```python
   # media_server.py
   import asyncio
   import websockets
   import json
   import subprocess
   import os
   from http.server import HTTPServer, SimpleHTTPRequestHandler
   import threading
   
   class MediaServer:
       def __init__(self):
           self.current_process = None
           
       async def handle_command(self, websocket, path):
           async for message in websocket:
               try:
                   command = json.loads(message)
                   
                   if command['action'] == 'play_video':
                       await self.play_video(command['video'])
                   elif command['action'] == 'stop_video':
                       await self.stop_video()
                       
               except Exception as e:
                   print(f"Error: {e}")
       
       async def play_video(self, video_info):
           # Stop current video
           await self.stop_video()
           
           video_url = video_info['url']
           
           # Handle local vs remote videos
           if video_url.startswith('/videos/'):
               # Local video - serve from your computer
               video_url = f"http://YOUR_COMPUTER_IP:3000{video_url}"
           
           # Play with VLC
           self.current_process = subprocess.Popen([
               'vlc', '--intf', 'dummy', '--fullscreen', video_url
           ])
           
           print(f"Playing: {video_info['title']}")
       
       async def stop_video(self):
           if self.current_process:
               self.current_process.terminate()
               self.current_process = None
   
   # Start WebSocket server
   server = MediaServer()
   start_server = websockets.serve(server.handle_command, "0.0.0.0", 8080)
   
   print("Media server started on ws://0.0.0.0:8080")
   asyncio.get_event_loop().run_until_complete(start_server)
   asyncio.get_event_loop().run_forever()
   ```

3. **Run the server:**
   ```bash
   python3 media_server.py
   ```

### Option 3: Smart TV with DLNA/UPnP

**Requirements:**
- Smart TV with DLNA support
- DLNA server software

**Setup:**
1. Install DLNA server (like Plex, Jellyfin, or Minidlna)
2. Configure media directories
3. Use DLNA commands instead of direct video URLs

## 🌐 Network Configuration

### For Local Videos

**Problem:** TV can't access your computer's local files directly.

**Solutions:**

1. **HTTP File Server (Simple):**
   ```bash
   # In your project directory
   cd public
   python3 -m http.server 8000
   ```
   Then videos are accessible at: `http://YOUR_IP:8000/videos/video.mp4`

2. **Next.js Static Serving (Automatic):**
   Your Next.js app already serves files from `/public/videos/`
   Videos are accessible at: `http://YOUR_IP:3000/videos/video.mp4`

3. **Dedicated Media Server:**
   Set up a proper media server like Plex or Jellyfin

### For Remote Videos

**Direct Streaming:** TV can directly access remote URLs:
- `https://example.com/video.mp4`
- `https://cdn.example.com/videos/video.mp4`
- API endpoints that return video streams

## 🔧 Configuration

### Update WebSocket URL

Edit the carousel component to use your TV's IP:

```typescript
// In CircularProjectsCarousel.tsx
const ws = new WebSocket('ws://192.168.1.100:8080/video-control');
```

### Environment Variables

Create `.env.local`:
```env
NEXT_PUBLIC_ENABLE_WEBSOCKET=true
NEXT_PUBLIC_TV_WEBSOCKET_URL=ws://192.168.1.100:8080/video-control
NEXT_PUBLIC_MEDIA_SERVER_URL=http://192.168.1.50:3000
```

## 🎮 Usage

### From the Carousel

1. **Swipe Up** on any card (mobile)
2. **Long Press** any card (desktop)
3. **Click Cast Icon** on any card
4. **Use "Play on TV" button** in video details modal

### Command Structure

The carousel sends this JSON command:
```json
{
  "action": "play_video",
  "video": {
    "id": 1,
    "title": "Video Title",
    "url": "/videos/my-video.mp4",
    "metadata": {
      "duration": "3:45",
      "fileSize": "125MB",
      "tags": ["tag1", "tag2"]
    }
  }
}
```

## 🔍 Troubleshooting

### Common Issues

1. **WebSocket Connection Failed:**
   - Check TV/server IP address
   - Ensure port 8080 is open
   - Verify network connectivity

2. **Local Videos Not Playing:**
   - Ensure your computer is accessible on the network
   - Check if Next.js dev server is running
   - Verify video file paths

3. **Remote Videos Not Playing:**
   - Check internet connectivity on TV
   - Verify video URLs are accessible
   - Check video format compatibility

### Testing

1. **Test WebSocket Connection:**
   ```javascript
   const ws = new WebSocket('ws://YOUR_TV_IP:8080/video-control');
   ws.onopen = () => console.log('Connected!');
   ```

2. **Test Video Access:**
   Open in browser: `http://YOUR_IP:3000/videos/your-video.mp4`

3. **Test Command:**
   ```javascript
   ws.send(JSON.stringify({
     action: 'play_video',
     video: { url: '/videos/test.mp4', title: 'Test' }
   }));
   ```

## 🚀 Advanced Features

### Multi-Room Support
- Connect multiple TVs with different WebSocket endpoints
- Room selection in the carousel UI

### Playlist Support
- Queue multiple videos
- Auto-play next video

### Volume Control
- Send volume commands via WebSocket
- Integrate with TV remote control

### Subtitle Support
- Send subtitle files along with videos
- Multiple language support

## 📱 Mobile App Alternative

For simpler setup, consider using:
- **VLC Remote**: Control VLC on your TV
- **Plex**: Stream to any device
- **Chromecast**: Cast directly from browser
- **AirPlay**: For Apple ecosystem

## 🔐 Security Considerations

- Use secure WebSocket (WSS) in production
- Implement authentication for WebSocket connections
- Restrict network access to trusted devices
- Validate all incoming commands
