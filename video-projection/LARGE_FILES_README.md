# Large Files Directory Structure

This project uses large media files that are excluded from Git tracking to prevent repository bloat and push failures.

## Required Directories

### `/public/videos/`
Place your video files here:
- `*.mp4`, `*.m4v`, `*.mov`, `*.avi` files
- Product demonstration videos
- Marketing content videos

### `/public/3dModels/`
Place your 3D model files here:
- `*.glb`, `*.fbx`, `*.obj` files
- Product 3D models for the carousel
- Interactive 3D content

### `/public/audio/` (optional)
Place audio files here:
- `*.mp3`, `*.wav`, `*.ogg` files
- Sound effects and background music

## File Size Limits

- Individual files should be under 100MB for Git compatibility
- For larger files, consider:
  - Using Git LFS (Large File Storage)
  - External CDN hosting
  - File compression
  - Video optimization

## Development Setup

1. Create the required directories:
   ```bash
   mkdir -p public/videos public/3dModels public/audio
   ```

2. Add your media files to the appropriate directories

3. The files will be served by Next.js but won't be tracked by Git

## Production Deployment

Ensure these directories and files are present on your production server:
- Copy files manually to the server
- Use deployment scripts to sync media files
- Consider using a CDN for better performance
