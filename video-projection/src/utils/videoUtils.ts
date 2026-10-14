/**
 * Video utilities for handling local and remote video sources
 */

export interface VideoSource {
  type: 'local' | 'remote';
  path: string;
}

/**
 * Get the full video URL based on type and path
 */
export function getVideoUrl(videoType?: 'local' | 'remote', videoPath?: string): string {
  if (!videoType || !videoPath) {
    console.warn('Video type or path not specified');
    return '';
  }

  if (videoType === 'local') {
    // For local files, ensure the path starts with / for public directory
    return videoPath.startsWith('/') ? videoPath : `/${videoPath}`;
  } else {
    // For remote files, return the full URL or API endpoint
    return videoPath;
  }
}

/**
 * Check if a video file exists locally (client-side check)
 */
export async function checkVideoExists(videoPath: string): Promise<boolean> {
  try {
    const response = await fetch(videoPath, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.warn(`Video file not found: ${videoPath}`);
    return false;
  }
}

/**
 * Get video metadata using the HTML5 video element
 */
export function getVideoMetadata(videoUrl: string): Promise<{
  duration: number;
  width: number;
  height: number;
  size?: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      });
    };
    
    video.onerror = () => {
      reject(new Error(`Failed to load video metadata for: ${videoUrl}`));
    };
    
    video.src = videoUrl;
  });
}

/**
 * Format video duration from seconds to MM:SS format
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format file size from bytes to human readable format
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate video file extension
 */
export function isValidVideoFile(filename: string): boolean {
  const validExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return validExtensions.includes(extension);
}

/**
 * Generate thumbnail URL for local videos
 */
export function getThumbnailUrl(videoPath: string): string {
  if (videoPath.startsWith('/videos/')) {
    // Replace /videos/ with /videos/thumbnails/ and change extension to .jpg
    const thumbnailPath = videoPath
      .replace('/videos/', '/videos/thumbnails/')
      .replace(/\.[^/.]+$/, '.jpg');
    return thumbnailPath;
  }
  
  // Default thumbnail for remote videos or unknown paths
  return '/images/default-video-thumbnail.jpg';
}

/**
 * Create a video source configuration
 */
export function createVideoSource(
  type: 'local' | 'remote',
  path: string,
  title: string,
  options?: {
    duration?: string;
    fileSize?: string;
    tags?: string[];
    description?: string;
  }
): VideoSource & {
  title: string;
  duration?: string;
  fileSize?: string;
  tags?: string[];
  description?: string;
} {
  return {
    type,
    path,
    title,
    ...options
  };
}
