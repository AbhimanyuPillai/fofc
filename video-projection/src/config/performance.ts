/**
 * Performance configuration for the video projection app
 * Optimized for Ubuntu systems and resource-constrained environments
 * Now with GPU-based optimization
 */

import { getGPUOptimizationSettings, getGPUPerformanceTier } from '@/utils/gpuDetection';

// Get GPU-based settings (only on client side)
let gpuSettings: any = null;
let gpuTier: 'high' | 'medium' | 'low' = 'medium';

if (typeof window !== 'undefined') {
  try {
    gpuSettings = getGPUOptimizationSettings();
    gpuTier = getGPUPerformanceTier();
  } catch (e) {
    console.warn('GPU detection failed, using default settings');
  }
}

export const PERFORMANCE_CONFIG = {
    // 3D Rendering optimizations (GPU-aware)
    RENDERING: {
        // Frame rate limiting (GPU-based)
        TARGET_FPS: gpuSettings?.targetFPS || 30,
        ANIMATION_THROTTLE: 1000 / (gpuSettings?.targetFPS || 30),
        
        // 3D Model optimizations (GPU-aware)
        MAX_PARTICLES: gpuSettings?.maxParticles || 25,
        MAX_CIRCUIT_LINES: gpuTier === 'high' ? 15 : gpuTier === 'low' ? 3 : 5,
        GRID_SIZE: gpuTier === 'high' ? 50 : 100,
        
        // Spring animation parameters (optimized)
        SPRING_STRENGTH: gpuTier === 'high' ? 8.0 : 6.0,
        DAMPING: gpuTier === 'high' ? 0.9 : 0.85,
        
        // Model rotation speeds (GPU-aware)
        ROTATION_SPEED: gpuTier === 'high' ? 0.5 : 0.3,
        AUTO_ROTATE_SPEED: gpuTier === 'high' ? 2.0 : 1.0,
        
        // Floating animation (GPU-aware)
        FLOATING_SPEED: gpuTier === 'high' ? 2.0 : 1.5,
        FLOATING_AMPLITUDE: gpuTier === 'high' ? 0.3 : 0.2,
        
        // Shadow quality (GPU-aware)
        SHADOW_MAP_SIZE: gpuSettings?.shadowMapSize || 2048,
        SHADOW_QUALITY: gpuSettings?.shadowQuality || 'medium',
        
        // Lighting (GPU-aware)
        MAX_LIGHTS: gpuSettings?.maxLights || 8,
        
        // Anti-aliasing (GPU-aware)
        ANTIALIAS_SAMPLES: gpuSettings?.antialias || 2,
    },
    
    // Polling intervals (optimized for Ubuntu)
    POLLING: {
        // System status polling
        STATUS_CHECK: 10000,            // 10s (was 5s)
        STORAGE_CHECK: 60000,           // 1min (was 30s)
        MEMORY_CHECK: 2000,             // 2s (was 800ms)
        POWER_CHECK: 10000,             // 10s (was 5s)
        CPU_CHECK: 5000,                // 5s (was 2s)
        IP_CHECK: 60000,                // 1min (was 30s)
        
        // UI updates
        LOG_UPDATE: 500,                // 500ms (was 200ms)
        BINARY_UPDATE: 1000,            // 1s (was 300ms)
        METRICS_UPDATE: 1000,           // 1s
    },
    
    // Memory management
    MEMORY: {
        // Log line limits
        MAX_LOG_LINES: 8,               // Reduced from 10
        
        // Cache limits
        MAX_AUDIO_CACHE: 10,            // Max cached audio files
        MAX_MODEL_CACHE: 5,             // Max cached 3D models
        
        // Garbage collection hints
        GC_INTERVAL: 30000,             // 30s
        CLEANUP_THRESHOLD: 100,         // MB
    },
    
    // Canvas optimizations
    CANVAS: {
        // Animation throttling
        FRAME_THROTTLE: 1000 / 24,      // 24fps for canvas
        
        // Rendering optimizations
        USE_SINGLE_PATH: true,          // Use single path for grid lines
        REDUCE_SHADOW_BLUR: true,       // Reduce shadow blur for performance
        OPTIMIZE_PARTICLES: true,       // Enable particle optimizations
    },
    
    // Network optimizations
    NETWORK: {
        // WebSocket settings
        PING_INTERVAL: 10000,           // 10s
        HEALTH_CHECK: 5000,             // 5s
        RECONNECT_DELAY: 1000,          // 1s
        
        // HTTP timeouts
        FETCH_TIMEOUT: 5000,            // 5s
        API_RETRY_DELAY: 1000,          // 1s
    },
    
    // Ubuntu-specific optimizations
    UBUNTU: {
        // Browser-specific settings
        DISABLE_ANIMATIONS_ON_LOW_MEMORY: true,
        REDUCE_QUALITY_ON_LAG: true,
        ENABLE_HARDWARE_ACCELERATION: true,
        
        // System resource monitoring
        MONITOR_CPU_USAGE: true,
        MONITOR_MEMORY_USAGE: true,
        AUTO_OPTIMIZE: true,
        
        // Performance thresholds
        CPU_THRESHOLD: 80,              // % CPU usage
        MEMORY_THRESHOLD: 85,           // % Memory usage
        FPS_THRESHOLD: 20,              // Minimum acceptable FPS
    },
    
    // Development vs Production
    ENVIRONMENT: {
        // Enable performance monitoring in development
        ENABLE_FPS_MONITOR: process.env.NODE_ENV === 'development',
        ENABLE_MEMORY_MONITOR: process.env.NODE_ENV === 'development',
        ENABLE_PERFORMANCE_LOGS: process.env.NODE_ENV === 'development',
        
        // Production optimizations
        AGGRESSIVE_OPTIMIZATION: process.env.NODE_ENV === 'production',
        DISABLE_DEBUG_LOGS: process.env.NODE_ENV === 'production',
    }
} as const;

// Performance presets for different system capabilities
export const PERFORMANCE_PRESETS = {
    // High-end systems (8GB+ RAM, modern GPU)
    HIGH_PERFORMANCE: {
        ...PERFORMANCE_CONFIG,
        RENDERING: {
            ...PERFORMANCE_CONFIG.RENDERING,
            TARGET_FPS: 60,
            ANIMATION_THROTTLE: 1000 / 60,
            MAX_PARTICLES: 50,
            MAX_CIRCUIT_LINES: 10,
        }
    },
    
    // Mid-range systems (4-8GB RAM)
    BALANCED: {
        ...PERFORMANCE_CONFIG,
        // Use default config (already optimized for mid-range)
    },
    
    // Low-end systems (2-4GB RAM, integrated graphics)
    LOW_PERFORMANCE: {
        ...PERFORMANCE_CONFIG,
        RENDERING: {
            ...PERFORMANCE_CONFIG.RENDERING,
            TARGET_FPS: 24,
            ANIMATION_THROTTLE: 1000 / 24,
            MAX_PARTICLES: 15,
            MAX_CIRCUIT_LINES: 3,
            GRID_SIZE: 150,
        },
        POLLING: {
            ...PERFORMANCE_CONFIG.POLLING,
            STATUS_CHECK: 15000,
            MEMORY_CHECK: 3000,
            LOG_UPDATE: 1000,
        }
    },
    
    // Raspberry Pi / Very low-end systems
    MINIMAL: {
        ...PERFORMANCE_CONFIG,
        RENDERING: {
            ...PERFORMANCE_CONFIG.RENDERING,
            TARGET_FPS: 15,
            ANIMATION_THROTTLE: 1000 / 15,
            MAX_PARTICLES: 10,
            MAX_CIRCUIT_LINES: 2,
            GRID_SIZE: 200,
            SPRING_STRENGTH: 4.0,
            DAMPING: 0.7,
        },
        POLLING: {
            ...PERFORMANCE_CONFIG.POLLING,
            STATUS_CHECK: 20000,
            MEMORY_CHECK: 5000,
            LOG_UPDATE: 2000,
            BINARY_UPDATE: 2000,
        }
    }
} as const;

// Auto-detect system performance level
export function detectPerformanceLevel(): keyof typeof PERFORMANCE_PRESETS {
    // Only run on client side
    if (typeof navigator === 'undefined') {
        return 'BALANCED';
    }
    
    // Check available memory
    const deviceMemory = (navigator as any).deviceMemory;
    const hardwareConcurrency = navigator.hardwareConcurrency || 1;
    
    // Check if running on mobile/tablet
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Raspberry Pi detection (common user agents)
    const isRaspberryPi = /Raspberry Pi|armv/i.test(navigator.userAgent) || 
                         (hardwareConcurrency <= 4 && deviceMemory && deviceMemory <= 1);
    
    if (isRaspberryPi) {
        return 'MINIMAL';
    }
    
    if (isMobile || (deviceMemory && deviceMemory <= 2)) {
        return 'LOW_PERFORMANCE';
    }
    
    if (deviceMemory && deviceMemory >= 8 && hardwareConcurrency >= 8) {
        return 'HIGH_PERFORMANCE';
    }
    
    // Default to balanced for most systems
    return 'BALANCED';
}

// Get current performance configuration
export function getCurrentPerformanceConfig() {
    const level = detectPerformanceLevel();
    return PERFORMANCE_PRESETS[level];
}

export default PERFORMANCE_CONFIG;
