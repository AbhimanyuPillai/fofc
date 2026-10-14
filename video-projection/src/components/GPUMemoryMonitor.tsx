'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  detectGPU,
  getGPUMemoryInfo,
  getGPUOptimizationSettings,
  getGPUPerformanceTier,
  logGPUInfo,
  type GPUInfo,
  type GPUMemoryInfo,
} from '@/utils/gpuDetection';

export default function GPUMemoryMonitor() {
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<GPUMemoryInfo | null>(null);
  const [optimizations, setOptimizations] = useState<any>(null);
  const [performanceTier, setPerformanceTier] = useState<'high' | 'medium' | 'low'>('medium');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const gpu = detectGPU();
      const memory = getGPUMemoryInfo();
      const opts = getGPUOptimizationSettings();
      const tier = getGPUPerformanceTier();

      setGpuInfo(gpu);
      setMemoryInfo(memory);
      setOptimizations(opts);
      setPerformanceTier(tier);

      // Log GPU info to console
      logGPUInfo();
    } catch (error) {
      console.error('Error detecting GPU:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg border border-cyan-500/30">
        <div className="text-cyan-400 text-center">Detecting GPU...</div>
      </div>
    );
  }

  if (!gpuInfo || !memoryInfo || !optimizations) {
    return (
      <div className="p-6 bg-gradient-to-br from-red-900/20 to-red-800/20 rounded-lg border border-red-500/30">
        <div className="text-red-400 text-center">Unable to detect GPU information</div>
      </div>
    );
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'high':
        return 'text-green-400';
      case 'low':
        return 'text-red-400';
      default:
        return 'text-yellow-400';
    }
  };

  const getTierBg = (tier: string) => {
    switch (tier) {
      case 'high':
        return 'bg-green-500/20 border-green-500/30';
      case 'low':
        return 'bg-red-500/20 border-red-500/30';
      default:
        return 'bg-yellow-500/20 border-yellow-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* GPU Information */}
      <motion.div
        className="p-6 bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-lg border border-blue-500/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="text-xl font-bold text-cyan-400 mb-4">GPU Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Renderer</div>
            <div className="text-sm text-cyan-400 font-mono mt-1 break-words">{gpuInfo.renderer}</div>
          </div>

          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Vendor</div>
            <div className="text-sm text-cyan-400 font-mono mt-1">{gpuInfo.vendor}</div>
          </div>

          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <div className="text-xs text-gray-400">WebGL Version</div>
            <div className="text-sm text-cyan-400 font-mono mt-1">{gpuInfo.webglVersion}</div>
          </div>

          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <div className="text-xs text-gray-400">WebGPU Support</div>
            <div className="text-sm text-cyan-400 font-mono mt-1">
              {gpuInfo.supportsWebGPU ? '✓ Yes' : '✗ No'}
            </div>
          </div>
        </div>

        {/* GPU Manufacturer Badges */}
        <div className="flex flex-wrap gap-2">
          {gpuInfo.isNvidia && (
            <span className="px-3 py-1 bg-green-500/20 border border-green-500/50 rounded text-xs text-green-400">
              NVIDIA
            </span>
          )}
          {gpuInfo.isAMD && (
            <span className="px-3 py-1 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-400">
              AMD
            </span>
          )}
          {gpuInfo.isIntel && (
            <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/50 rounded text-xs text-blue-400">
              Intel
            </span>
          )}
          {gpuInfo.isApple && (
            <span className="px-3 py-1 bg-gray-500/20 border border-gray-500/50 rounded text-xs text-gray-400">
              Apple
            </span>
          )}
        </div>
      </motion.div>

      {/* GPU Memory Information */}
      <motion.div
        className="p-6 bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-lg border border-purple-500/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <h3 className="text-xl font-bold text-cyan-400 mb-4">GPU Memory</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Total VRAM</div>
            <div className="text-2xl font-bold text-cyan-400 mt-2">
              {memoryInfo.totalVRAM >= 1024
                ? `${(memoryInfo.totalVRAM / 1024).toFixed(1)} GB`
                : `${memoryInfo.totalVRAM} MB`}
            </div>
          </div>

          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Available (Est.)</div>
            <div className="text-2xl font-bold text-cyan-400 mt-2">
              {memoryInfo.estimatedAvailable >= 1024
                ? `${(memoryInfo.estimatedAvailable / 1024).toFixed(1)} GB`
                : `${memoryInfo.estimatedAvailable} MB`}
            </div>
          </div>

          <div className={`p-4 rounded border ${getTierBg(performanceTier)}`}>
            <div className="text-xs text-gray-400">Performance Tier</div>
            <div className={`text-2xl font-bold mt-2 ${getTierColor(performanceTier)} uppercase`}>
              {performanceTier}
            </div>
          </div>
        </div>

        {/* GPU Capability Indicators */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-center">
            <div className="text-xs text-gray-400">Max Texture</div>
            <div className="text-sm text-cyan-400 font-mono mt-1">{gpuInfo.maxTextureSize}</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-center">
            <div className="text-xs text-gray-400">Max RenderBuffer</div>
            <div className="text-sm text-cyan-400 font-mono mt-1">{gpuInfo.maxRenderbufferSize}</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-center">
            <div className="text-xs text-gray-400">Viewport Width</div>
            <div className="text-sm text-cyan-400 font-mono mt-1">{gpuInfo.maxViewportDims[0]}</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-center">
            <div className="text-xs text-gray-400">Viewport Height</div>
            <div className="text-sm text-cyan-400 font-mono mt-1">{gpuInfo.maxViewportDims[1]}</div>
          </div>
        </div>
      </motion.div>

      {/* Optimization Settings */}
      <motion.div
        className="p-6 bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg border border-green-500/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h3 className="text-xl font-bold text-cyan-400 mb-4">Applied Optimizations</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Target FPS</div>
            <div className="text-lg font-bold text-cyan-400 mt-1">{optimizations.targetFPS}</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Max Particles</div>
            <div className="text-lg font-bold text-cyan-400 mt-1">{optimizations.maxParticles.toLocaleString()}</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Texture Quality</div>
            <div className="text-lg font-bold text-cyan-400 mt-1 capitalize">{optimizations.textureQuality}</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Shadow Quality</div>
            <div className="text-lg font-bold text-cyan-400 mt-1 capitalize">{optimizations.shadowQuality}</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Shadow Map Size</div>
            <div className="text-lg font-bold text-cyan-400 mt-1">{optimizations.shadowMapSize}</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Max Lights</div>
            <div className="text-lg font-bold text-cyan-400 mt-1">{optimizations.maxLights}</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Anti-Aliasing</div>
            <div className="text-lg font-bold text-cyan-400 mt-1">{optimizations.antialias}x</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Max Polygons</div>
            <div className="text-lg font-bold text-cyan-400 mt-1">{(optimizations.maxPolygons / 1000000).toFixed(1)}M</div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Video Quality</div>
            <div className="text-lg font-bold text-cyan-400 mt-1">{optimizations.videoQuality}</div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className={`p-3 rounded border ${optimizations.enablePostProcessing ? 'bg-green-500/20 border-green-500/50' : 'bg-red-500/20 border-red-500/50'}`}>
            <div className={optimizations.enablePostProcessing ? 'text-green-400' : 'text-red-400'}>
              {optimizations.enablePostProcessing ? '✓' : '✗'} Post-Processing
            </div>
          </div>
          <div className={`p-3 rounded border ${optimizations.enableBloom ? 'bg-green-500/20 border-green-500/50' : 'bg-red-500/20 border-red-500/50'}`}>
            <div className={optimizations.enableBloom ? 'text-green-400' : 'text-red-400'}>
              {optimizations.enableBloom ? '✓' : '✗'} Bloom
            </div>
          </div>
          <div className={`p-3 rounded border ${optimizations.enableSSAO ? 'bg-green-500/20 border-green-500/50' : 'bg-red-500/20 border-red-500/50'}`}>
            <div className={optimizations.enableSSAO ? 'text-green-400' : 'text-red-400'}>
              {optimizations.enableSSAO ? '✓' : '✗'} SSAO
            </div>
          </div>
          <div className={`p-3 rounded border ${optimizations.enableEnvironmentMaps ? 'bg-green-500/20 border-green-500/50' : 'bg-red-500/20 border-red-500/50'}`}>
            <div className={optimizations.enableEnvironmentMaps ? 'text-green-400' : 'text-red-400'}>
              {optimizations.enableEnvironmentMaps ? '✓' : '✗'} Environment Maps
            </div>
          </div>
        </div>
      </motion.div>

      {/* Performance Recommendations */}
      <motion.div
        className="p-6 bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 rounded-lg border border-indigo-500/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h3 className="text-xl font-bold text-cyan-400 mb-4">Performance Recommendations</h3>

        <div className="space-y-3 text-sm text-gray-300">
          {performanceTier === 'high' && (
            <>
              <div className="flex items-start space-x-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>Your GPU is excellent for high-quality 3D rendering and animations</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>All visual effects and post-processing are enabled</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>Target frame rate: 60 FPS with high-quality rendering</span>
              </div>
            </>
          )}

          {performanceTier === 'medium' && (
            <>
              <div className="flex items-start space-x-3">
                <span className="text-yellow-400 mt-1">⚠</span>
                <span>Your GPU provides balanced performance for 3D rendering</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-yellow-400 mt-1">⚠</span>
                <span>Some advanced effects are optimized for stability</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-yellow-400 mt-1">⚠</span>
                <span>Target frame rate: 30 FPS with good visual quality</span>
              </div>
            </>
          )}

          {performanceTier === 'low' && (
            <>
              <div className="flex items-start space-x-3">
                <span className="text-red-400 mt-1">!</span>
                <span>Your GPU has limited VRAM for complex 3D rendering</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-red-400 mt-1">!</span>
                <span>Advanced visual effects are disabled for stability</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-red-400 mt-1">!</span>
                <span>Target frame rate: 24 FPS with reduced visual complexity</span>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
