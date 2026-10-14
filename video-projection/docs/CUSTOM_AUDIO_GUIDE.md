# Custom Audio Files Guide

The enhanced sound system now supports both generated tones and custom audio files, giving you complete flexibility over your sound effects.

## Features Added

### 🎵 Custom Audio File Support
- Load and cache custom audio files (MP3, WAV, OGG, etc.)
- Automatic fallback to generated tones if custom files aren't available
- Audio file caching for optimal performance
- Volume control for custom audio files

### 🔧 New Methods Available

```typescript
// Load a single audio file
await soundSystem.loadAudioFile('play', '/sounds/play-button.mp3');

// Load multiple audio files at once
const results = await soundSystem.loadAudioFiles({
  play: '/sounds/custom-play.mp3',
  pause: '/sounds/custom-pause.wav',
  stop: '/sounds/custom-stop.ogg',
  seek: '/sounds/whoosh.mp3'
});

// Check if a custom audio file is loaded
if (soundSystem.hasAudioFile('play')) {
  console.log('Custom play sound is loaded');
}

// Play custom audio with specific volume
soundSystem.playCustomAudio('play', 0.7);

// Remove a custom audio file
soundSystem.removeAudioFile('play');

// Clear all custom audio files
soundSystem.clearAudioFiles();

// Get list of loaded custom audio files
const loadedFiles = soundSystem.getLoadedAudioFiles();
```

## Usage Examples

### Example 1: Basic Custom Audio Loading

```typescript
import { soundSystem } from '@/utils/soundSystem';

// Initialize and load custom sounds
useEffect(() => {
  const loadCustomSounds = async () => {
    await soundSystem.initializeAudio();
    
    // Load custom video control sounds
    const audioFiles = {
      play: '/sounds/video-controls/play.mp3',
      pause: '/sounds/video-controls/pause.mp3',
      stop: '/sounds/video-controls/stop.mp3',
      seek: '/sounds/video-controls/seek.wav'
    };
    
    const results = await soundSystem.loadAudioFiles(audioFiles);
    console.log('Audio loading results:', results);
  };
  
  loadCustomSounds();
}, []);

// Use in your components - will automatically use custom files if loaded
const handlePlay = () => {
  soundSystem.play('play'); // Uses custom file if loaded, fallback to generated tone
};
```

### Example 2: Iron Man Themed Sound Pack

```typescript
// Load Iron Man inspired sound effects
const ironManSounds = {
  play: '/sounds/ironman/arc-reactor-charge.mp3',
  pause: '/sounds/ironman/suit-power-down.mp3',
  stop: '/sounds/ironman/repulsors-charge-down.mp3',
  seek: '/sounds/ironman/hud-beep.mp3',
  activate: '/sounds/ironman/jarvis-confirm.mp3',
  select: '/sounds/ironman/interface-click.mp3'
};

await soundSystem.loadAudioFiles(ironManSounds);
```

### Example 3: Conditional Loading with Error Handling

```typescript
const loadSoundsWithFallback = async () => {
  try {
    const customSounds = {
      play: '/sounds/custom/play.mp3',
      pause: '/sounds/custom/pause.mp3'
    };
    
    const results = await soundSystem.loadAudioFiles(customSounds);
    
    // Check which files loaded successfully
    Object.entries(results).forEach(([soundName, success]) => {
      if (success) {
        console.log(`✅ Custom sound loaded: ${soundName}`);
      } else {
        console.log(`❌ Failed to load ${soundName}, will use generated tone`);
      }
    });
    
  } catch (error) {
    console.error('Error loading custom sounds:', error);
    console.log('Using generated tones as fallback');
  }
};
```

## File Format Support

The system supports all audio formats that the Web Audio API can decode:
- **MP3** - Best compatibility, good compression
- **WAV** - High quality, larger file size
- **OGG** - Good compression, modern browsers
- **M4A/AAC** - Good quality and compression
- **FLAC** - Lossless, larger file size

## Recommended Audio Specifications

For optimal performance and user experience:
- **Sample Rate**: 44.1kHz or 48kHz
- **Bit Depth**: 16-bit or 24-bit
- **Duration**: 0.1s - 2s for UI sounds
- **File Size**: Under 100KB per sound for fast loading
- **Format**: MP3 or WAV for best browser compatibility

## Directory Structure

Organize your custom audio files like this:

```
public/
├── sounds/
│   ├── video-controls/
│   │   ├── play.mp3
│   │   ├── pause.mp3
│   │   ├── stop.mp3
│   │   └── seek.wav
│   ├── ui/
│   │   ├── select.mp3
│   │   ├── hover.wav
│   │   └── activate.mp3
│   └── themes/
│       ├── ironman/
│       └── cyberpunk/
```

## Integration with Video Controls

The video controls in ProductCarousel will automatically use your custom audio files:

```typescript
// In ProductCarousel component - no changes needed!
onClick={() => {
  soundSystem.play('play'); // Uses custom file if loaded, generated tone if not
  sendVideoCommand('play');
}}
```

## Performance Tips

1. **Preload Important Sounds**: Load frequently used sounds during app initialization
2. **Cache Management**: Use `clearAudioFiles()` to free memory when switching themes
3. **Lazy Loading**: Load sounds only when needed for better initial load times
4. **Error Handling**: Always have fallbacks for failed audio loads

## Troubleshooting

### Audio Files Not Playing
- Check browser console for loading errors
- Verify file paths are correct and accessible
- Ensure audio files are in supported formats
- Check if audio context is properly initialized

### Performance Issues
- Reduce file sizes or use more compressed formats
- Limit the number of cached audio files
- Use `removeAudioFile()` to clean up unused sounds

## Example: Complete Integration

```typescript
// Complete example for ProductCarousel
useEffect(() => {
  const setupCustomAudio = async () => {
    try {
      await soundSystem.initializeAudio();
      
      // Load custom video control sounds
      const videoSounds = {
        play: '/sounds/video/play.mp3',
        pause: '/sounds/video/pause.mp3',
        stop: '/sounds/video/stop.mp3',
        seek: '/sounds/video/seek.wav'
      };
      
      const results = await soundSystem.loadAudioFiles(videoSounds);
      
      // Log results
      const loaded = Object.entries(results).filter(([, success]) => success).length;
      console.log(`Loaded ${loaded}/${Object.keys(videoSounds).length} custom sounds`);
      
    } catch (error) {
      console.error('Custom audio setup failed:', error);
    }
  };
  
  setupCustomAudio();
}, []);
```

Now you have complete control over your sound effects - use custom audio files for a professional touch, with automatic fallback to generated tones for reliability!
