/**
 * Performance monitoring utility for the video projection app
 * Helps track frame rates and system performance without affecting UI
 */

export class PerformanceMonitor {
    private frameCount = 0;
    private lastTime = performance.now();
    private fps = 0;
    private isMonitoring = false;
    private rafId: number | null = null;
    private onFpsUpdate?: (fps: number) => void;

    constructor(onFpsUpdate?: (fps: number) => void) {
        this.onFpsUpdate = onFpsUpdate;
    }

    start() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.tick();
    }

    stop() {
        this.isMonitoring = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private tick = () => {
        if (!this.isMonitoring) return;

        this.frameCount++;
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;

        // Update FPS every second
        if (deltaTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / deltaTime);
            this.frameCount = 0;
            this.lastTime = currentTime;
            
            if (this.onFpsUpdate) {
                this.onFpsUpdate(this.fps);
            }
        }

        this.rafId = requestAnimationFrame(this.tick);
    };

    getFPS(): number {
        return this.fps;
    }

    // Get system performance metrics
    static getSystemMetrics() {
        const metrics: any = {};
        
        // Memory usage (Chrome/Edge)
        if ('memory' in performance) {
            const memory = (performance as any).memory;
            metrics.memory = {
                used: memory.usedJSHeapSize,
                total: memory.totalJSHeapSize,
                limit: memory.jsHeapSizeLimit,
                usagePercent: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100)
            };
        }

        // Hardware concurrency
        if ('hardwareConcurrency' in navigator) {
            metrics.cores = navigator.hardwareConcurrency;
        }

        // Device memory (Chrome/Edge)
        if ('deviceMemory' in navigator) {
            metrics.deviceMemory = (navigator as any).deviceMemory;
        }

        // Connection info
        if ('connection' in navigator) {
            const connection = (navigator as any).connection;
            metrics.connection = {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt
            };
        }

        return metrics;
    }

    // Throttle function for performance optimization
    static throttle<T extends (...args: any[]) => any>(
        func: T,
        limit: number
    ): (...args: Parameters<T>) => void {
        let inThrottle: boolean;
        return function(this: any, ...args: Parameters<T>) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Debounce function for performance optimization
    static debounce<T extends (...args: any[]) => any>(
        func: T,
        wait: number
    ): (...args: Parameters<T>) => void {
        let timeout: NodeJS.Timeout;
        return function(this: any, ...args: Parameters<T>) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
}

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();

// Performance optimization constants
export const PERFORMANCE_CONSTANTS = {
    // Frame rate limits
    FPS_30: 1000 / 30,
    FPS_24: 1000 / 24,
    FPS_15: 1000 / 15,
    
    // Polling intervals (optimized for Ubuntu systems)
    POLLING_FAST: 1000,      // 1 second
    POLLING_MEDIUM: 5000,    // 5 seconds  
    POLLING_SLOW: 10000,     // 10 seconds
    POLLING_VERY_SLOW: 60000, // 1 minute
    
    // Animation throttling
    ANIMATION_THROTTLE: 1000 / 30, // 30fps
    CANVAS_THROTTLE: 1000 / 24,    // 24fps for canvas animations
    
    // Memory thresholds (in MB)
    MEMORY_WARNING: 100,
    MEMORY_CRITICAL: 200,
} as const;

export default PerformanceMonitor;
