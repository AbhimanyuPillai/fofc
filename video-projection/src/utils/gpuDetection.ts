/**
 * GPU Detection and Memory Management
 * Detects available GPU and optimizes rendering based on GPU capabilities
 */

export interface GPUInfo {
  renderer: string;
  vendor: string;
  webglVersion: string;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxViewportDims: [number, number];
  isNvidia: boolean;
  isAMD: boolean;
  isIntel: boolean;
  isApple: boolean;
  estimatedVRAM: number; // in MB
  supportsWebGL2: boolean;
  supportsWebGPU: boolean;
}

export interface GPUMemoryInfo {
  totalVRAM: number; // in MB
  estimatedAvailable: number; // in MB
  usagePercent: number;
  isHighEnd: boolean;
  isLowEnd: boolean;
}

let cachedGPUInfo: GPUInfo | null = null;

/**
 * Detect GPU capabilities and information
 */
export function detectGPU(): GPUInfo {
  if (cachedGPUInfo) return cachedGPUInfo;

  try {
    const canvas = document.createElement('canvas');
    
    // Try WebGL2 first, then WebGL1
    let gl = canvas.getContext('webgl2') as any;
    const supportsWebGL2 = !!gl;
    
    if (!gl) {
      gl = canvas.getContext('webgl') as any;
    }

    if (!gl) {
      return {
        renderer: 'WebGL not available',
        vendor: 'Unknown',
        webglVersion: 'None',
        maxTextureSize: 0,
        maxRenderbufferSize: 0,
        maxViewportDims: [0, 0],
        isNvidia: false,
        isAMD: false,
        isIntel: false,
        isApple: false,
        estimatedVRAM: 0,
        supportsWebGL2: false,
        supportsWebGPU: false,
      };
    }

    // Get debug info
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const vendor = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);

    // Get GPU memory limits
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as [number, number];

    // Detect GPU manufacturer
    const rendererLower = renderer.toLowerCase();
    const vendorLower = vendor.toLowerCase();
    const isNvidia = /nvidia|geforce|gtx|rtx|tesla/i.test(rendererLower) || /nvidia/i.test(vendorLower);
    const isAMD = /amd|radeon|rx|ryzen/i.test(rendererLower) || /amd/i.test(vendorLower);
    const isIntel = /intel|iris|arc/i.test(rendererLower) || /intel/i.test(vendorLower);
    const isApple = /apple|metal|m1|m2|m3/i.test(rendererLower) || /apple/i.test(vendorLower);

    // Estimate VRAM based on GPU type and max texture size
    const estimatedVRAM = estimateGPUMemory(renderer, isNvidia, isAMD, isIntel, isApple);

    // Check WebGPU support
    const supportsWebGPU = !!(navigator as any).gpu;

    const gpuInfo: GPUInfo = {
      renderer,
      vendor,
      webglVersion: supportsWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0',
      maxTextureSize,
      maxRenderbufferSize,
      maxViewportDims,
      isNvidia,
      isAMD,
      isIntel,
      isApple,
      estimatedVRAM,
      supportsWebGL2,
      supportsWebGPU,
    };

    cachedGPUInfo = gpuInfo;
    return gpuInfo;
  } catch (error) {
    console.error('Error detecting GPU:', error);
    return {
      renderer: 'Error detecting GPU',
      vendor: 'Unknown',
      webglVersion: 'Unknown',
      maxTextureSize: 0,
      maxRenderbufferSize: 0,
      maxViewportDims: [0, 0],
      isNvidia: false,
      isAMD: false,
      isIntel: false,
      isApple: false,
      estimatedVRAM: 0,
      supportsWebGL2: false,
      supportsWebGPU: false,
    };
  }
}

/**
 * Estimate GPU VRAM based on GPU model
 */
function estimateGPUMemory(
  renderer: string,
  isNvidia: boolean,
  isAMD: boolean,
  isIntel: boolean,
  isApple: boolean
): number {
  const rendererLower = renderer.toLowerCase();

  // NVIDIA estimation
  if (isNvidia) {
    if (/rtx 4090|rtx 6000/i.test(rendererLower)) return 24576; // 24GB
    if (/rtx 4080|rtx 4070 ti|rtx 3090/i.test(rendererLower)) return 12288; // 12GB
    if (/rtx 4070|rtx 4060 ti|rtx 3080|rtx 3070/i.test(rendererLower)) return 8192; // 8GB
    if (/rtx 4060|rtx 3060|gtx 1080|gtx 1070/i.test(rendererLower)) return 6144; // 6GB
    if (/gtx 1060|gtx 960|gtx 950/i.test(rendererLower)) return 3072; // 3GB
    if (/gtx 750|gtx 650/i.test(rendererLower)) return 1024; // 1GB
    return 2048; // Default NVIDIA
  }

  // AMD estimation
  if (isAMD) {
    if (/rx 7900 xtx|rx 6900 xt/i.test(rendererLower)) return 24576; // 24GB
    if (/rx 7900 xt|rx 6800 xt/i.test(rendererLower)) return 12288; // 12GB
    if (/rx 7800 xt|rx 6700 xt/i.test(rendererLower)) return 8192; // 8GB
    if (/rx 6600 xt|rx 5700 xt/i.test(rendererLower)) return 6144; // 6GB
    if (/rx 6600|rx 5600/i.test(rendererLower)) return 3072; // 3GB
    return 2048; // Default AMD
  }

  // Intel estimation
  if (isIntel) {
    if (/arc a770/i.test(rendererLower)) return 8192; // 8GB
    if (/arc a750/i.test(rendererLower)) return 4096; // 4GB
    if (/iris xe|iris pro/i.test(rendererLower)) return 1024; // 1GB (shared)
    if (/uhd graphics|hd graphics/i.test(rendererLower)) return 512; // 512MB (shared)
    return 512; // Default Intel
  }

  // Apple estimation
  if (isApple) {
    if (/m3 max|m2 max|m1 max/i.test(rendererLower)) return 8192; // 8GB
    if (/m3 pro|m2 pro|m1 pro/i.test(rendererLower)) return 4096; // 4GB
    if (/m3|m2|m1/i.test(rendererLower)) return 2048; // 2GB
    return 2048; // Default Apple
  }

  // Fallback estimation based on max texture size
  const maxTextureSize = parseInt(rendererLower.match(/\d+/)?.[0] || '0');
  if (maxTextureSize > 16384) return 8192;
  if (maxTextureSize > 8192) return 4096;
  if (maxTextureSize > 4096) return 2048;
  return 1024;
}

/**
 * Get GPU memory information
 */
export function getGPUMemoryInfo(): GPUMemoryInfo {
  const gpuInfo = detectGPU();
  
  // Estimate available VRAM (assume 70% is available for rendering)
  const estimatedAvailable = Math.round(gpuInfo.estimatedVRAM * 0.7);
  
  // Determine if high-end or low-end GPU
  const isHighEnd = gpuInfo.estimatedVRAM >= 8192; // 8GB+
  const isLowEnd = gpuInfo.estimatedVRAM < 1024; // < 1GB

  return {
    totalVRAM: gpuInfo.estimatedVRAM,
    estimatedAvailable,
    usagePercent: 0, // Can't directly measure in browser
    isHighEnd,
    isLowEnd,
  };
}

/**
 * Get rendering optimization settings based on GPU
 */
export function getGPUOptimizationSettings() {
  const gpuInfo = detectGPU();
  const memoryInfo = getGPUMemoryInfo();

  return {
    // Texture quality settings
    textureQuality: memoryInfo.isHighEnd ? 'ultra' : memoryInfo.isLowEnd ? 'low' : 'medium',
    
    // Shadow settings
    shadowQuality: memoryInfo.isHighEnd ? 'high' : memoryInfo.isLowEnd ? 'low' : 'medium',
    shadowMapSize: memoryInfo.isHighEnd ? 4096 : memoryInfo.isLowEnd ? 512 : 2048,
    
    // Lighting
    maxLights: memoryInfo.isHighEnd ? 16 : memoryInfo.isLowEnd ? 2 : 8,
    
    // Particle effects
    maxParticles: memoryInfo.isHighEnd ? 10000 : memoryInfo.isLowEnd ? 100 : 1000,
    
    // Anti-aliasing
    antialias: memoryInfo.isHighEnd ? 4 : memoryInfo.isLowEnd ? 0 : 2,
    
    // Post-processing
    enablePostProcessing: memoryInfo.isHighEnd,
    enableBloom: memoryInfo.isHighEnd,
    enableSSAO: memoryInfo.isHighEnd,
    
    // Animation frame rate
    targetFPS: memoryInfo.isHighEnd ? 60 : memoryInfo.isLowEnd ? 24 : 30,
    
    // Model complexity
    maxPolygons: memoryInfo.isHighEnd ? 5000000 : memoryInfo.isLowEnd ? 100000 : 500000,
    
    // Video quality
    videoQuality: memoryInfo.isHighEnd ? '1080p' : memoryInfo.isLowEnd ? '360p' : '720p',
    
    // Environment maps
    enableEnvironmentMaps: memoryInfo.isHighEnd,
    environmentMapResolution: memoryInfo.isHighEnd ? 2048 : 512,
  };
}

/**
 * Check if GPU is suitable for high-performance rendering
 */
export function isGPUSuitable(minVRAM: number = 2048): boolean {
  const memoryInfo = getGPUMemoryInfo();
  return memoryInfo.totalVRAM >= minVRAM;
}

/**
 * Get GPU performance tier
 */
export function getGPUPerformanceTier(): 'high' | 'medium' | 'low' {
  const memoryInfo = getGPUMemoryInfo();
  
  if (memoryInfo.isHighEnd) return 'high';
  if (memoryInfo.isLowEnd) return 'low';
  return 'medium';
}

/**
 * Log GPU information for debugging
 */
export function logGPUInfo(): void {
  const gpuInfo = detectGPU();
  const memoryInfo = getGPUMemoryInfo();
  const optimizations = getGPUOptimizationSettings();

  console.group('🎮 GPU Information');
  console.log('Renderer:', gpuInfo.renderer);
  console.log('Vendor:', gpuInfo.vendor);
  console.log('WebGL Version:', gpuInfo.webglVersion);
  console.log('WebGPU Support:', gpuInfo.supportsWebGPU ? '✓' : '✗');
  console.log('Max Texture Size:', gpuInfo.maxTextureSize);
  console.log('Max Renderbuffer Size:', gpuInfo.maxRenderbufferSize);
  console.log('Max Viewport Dims:', gpuInfo.maxViewportDims);
  console.groupEnd();

  console.group('💾 GPU Memory');
  console.log('Estimated Total VRAM:', memoryInfo.totalVRAM, 'MB');
  console.log('Estimated Available:', memoryInfo.estimatedAvailable, 'MB');
  console.log('Performance Tier:', getGPUPerformanceTier());
  console.groupEnd();

  console.group('⚙️ Optimization Settings');
  console.log('Texture Quality:', optimizations.textureQuality);
  console.log('Shadow Quality:', optimizations.shadowQuality);
  console.log('Target FPS:', optimizations.targetFPS);
  console.log('Max Particles:', optimizations.maxParticles);
  console.log('Video Quality:', optimizations.videoQuality);
  console.groupEnd();
}
