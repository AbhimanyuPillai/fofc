export interface VideoSource {
  id: string;
  type: 'local' | 'remote';
  path: string;
  title: string;
  duration?: string;
  fileSize?: string;
  tags?: string[];
  thumbnail?: string;
}

export interface VideoConfig {
  sources: VideoSource[];
  defaultType: 'local' | 'remote';
}

// Video source configuration
export const videoConfig: VideoConfig = {
  defaultType: 'local', // Change to 'remote' if you prefer API endpoints by default
  sources: [
    {
      id: '1',
      type: 'local',
      path: '/videos/sample-video-1.mp4',
      title: 'Neural Network Visualization',
      duration: '2:30',
      fileSize: '45MB',
      tags: ['AI', 'Visualization', 'Tech'],
      thumbnail: '/videos/thumbnails/sample-1.jpg'
    },
    {
      id: '2',
      type: 'local',
      path: '/videos/sample-video-2.mp4',
      title: 'Cyberpunk City Tour',
      duration: '3:15',
      fileSize: '67MB',
      tags: ['Cyberpunk', 'City', 'Future'],
      thumbnail: '/videos/thumbnails/sample-2.jpg'
    },
    {
      id: '3',
      type: 'remote',
      path: '/api/videos/3',
      title: 'Remote Data Stream',
      duration: '1:45',
      fileSize: '32MB',
      tags: ['Data', 'Stream', 'Remote'],
      thumbnail: '/api/thumbnails/3'
    },
    {
      id: '4',
      type: 'local',
      path: '/videos/sample-video-4.mp4',
      title: 'Holographic Interface',
      duration: '4:20',
      fileSize: '89MB',
      tags: ['Hologram', 'Interface', 'UI'],
      thumbnail: '/videos/thumbnails/sample-4.jpg'
    },
    {
      id: '5',
      type: 'remote',
      path: '/api/videos/5',
      title: 'Cloud Computing Demo',
      duration: '2:55',
      fileSize: '54MB',
      tags: ['Cloud', 'Computing', 'Demo'],
      thumbnail: '/api/thumbnails/5'
    }
  ]
};

/**
 * Get the video URL for a given project ID
 * Handles both local files and remote API endpoints
 */
export function getVideoUrl(projectId: string): string {
  const videoSource = videoConfig.sources.find(source => source.id === projectId);
  
  if (!videoSource) {
    console.warn(`Video source not found for project ID: ${projectId}`);
    return '';
  }
  
  if (videoSource.type === 'local') {
    // For local files, return the path directly (served from public directory)
    return videoSource.path;
  } else {
    // For remote files, return the API endpoint
    return videoSource.path;
  }
}

/**
 * Get the thumbnail URL for a given project ID
 */
export function getThumbnailUrl(projectId: string): string {
  const videoSource = videoConfig.sources.find(source => source.id === projectId);
  
  if (!videoSource || !videoSource.thumbnail) {
    // Return a default thumbnail if none specified
    return '/images/default-thumbnail.jpg';
  }
  
  return videoSource.thumbnail;
}

/**
 * Check if a video source is available locally
 */
export function isLocalVideo(projectId: string): boolean {
  const videoSource = videoConfig.sources.find(source => source.id === projectId);
  return videoSource?.type === 'local' || false;
}

/**
 * Get all video sources of a specific type
 */
export function getVideosByType(type: 'local' | 'remote'): VideoSource[] {
  return videoConfig.sources.filter(source => source.type === type);
}

/**
 * Add a new video source dynamically
 */
export function addVideoSource(source: VideoSource): void {
  videoConfig.sources.push(source);
}

/**
 * Remove a video source by ID
 */
export function removeVideoSource(projectId: string): boolean {
  const index = videoConfig.sources.findIndex(source => source.id === projectId);
  if (index !== -1) {
    videoConfig.sources.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Update video source configuration
 */
export function updateVideoSource(projectId: string, updates: Partial<VideoSource>): boolean {
  const index = videoConfig.sources.findIndex(source => source.id === projectId);
  if (index !== -1) {
    videoConfig.sources[index] = { ...videoConfig.sources[index], ...updates };
    return true;
  }
  return false;
}

/**
 * Get video metadata for display in the carousel
 */
export function getVideoMetadata(projectId: string) {
  const videoSource = videoConfig.sources.find(source => source.id === projectId);
  
  if (!videoSource) {
    return null;
  }
  
  return {
    id: videoSource.id,
    title: videoSource.title,
    duration: videoSource.duration || 'Unknown',
    fileSize: videoSource.fileSize || 'Unknown',
    tags: videoSource.tags || [],
    videoUrl: getVideoUrl(projectId),
    thumbnailUrl: getThumbnailUrl(projectId),
    isLocal: videoSource.type === 'local'
  };
}
