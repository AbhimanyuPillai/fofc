'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface CPUMetrics {
  percent: number;
  perCore: number[];
  cores: number;
  temperatureC: number;
  temperatureSource: string;
  loadavg: { '1m': number; '5m': number; '15m': number };
}

interface MemoryMetrics {
  used: number;
  total: number;
  usagePercent: number;
}

interface SystemMetrics {
  cpu?: CPUMetrics;
  memory?: MemoryMetrics;
  timestamp: number;
}

export default function SystemMonitor() {
  const [metrics, setMetrics] = useState<SystemMetrics>({ timestamp: Date.now() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch CPU metrics
        const cpuRes = await fetch('/api/cpu');
        const cpuData = await cpuRes.json();

        // Get memory metrics from browser
        const memory = (performance as any).memory;
        const memoryMetrics: MemoryMetrics | undefined = memory ? {
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          usagePercent: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100),
        } : undefined;

        setMetrics({
          cpu: cpuData.ok ? cpuData.cpu : undefined,
          memory: memoryMetrics,
          timestamp: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading && !metrics.cpu) {
    return (
      <div className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg border border-cyan-500/30">
        <div className="text-cyan-400 text-center">Loading system metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-gradient-to-br from-red-900/20 to-red-800/20 rounded-lg border border-red-500/30">
        <div className="text-red-400 text-center">Error: {error}</div>
      </div>
    );
  }

  const cpuPercent = metrics.cpu?.percent || 0;
  const memPercent = metrics.memory?.usagePercent || 0;

  return (
    <div className="space-y-6">
      {/* CPU Metrics */}
      {metrics.cpu && (
        <motion.div
          className="p-6 bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-lg border border-blue-500/30"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h3 className="text-xl font-bold text-cyan-400 mb-4">CPU Usage</h3>
          
          {/* Overall CPU Usage */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-cyan-300">Overall Usage</span>
              <span className="text-2xl font-bold text-cyan-400">{cpuPercent}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${cpuPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Per-Core Usage */}
          <div className="mb-6">
            <p className="text-cyan-300 mb-3">Per-Core Usage ({metrics.cpu.cores} cores)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {metrics.cpu.perCore.map((core, idx) => (
                <div key={idx} className="text-center">
                  <div className="text-xs text-gray-400 mb-1">Core {idx}</div>
                  <div className="w-full bg-gray-800 rounded h-20 flex items-end justify-center p-1">
                    <motion.div
                      className="w-full bg-gradient-to-t from-green-500 to-cyan-500 rounded"
                      initial={{ height: 0 }}
                      animate={{ height: `${core}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="text-xs text-cyan-400 mt-1 font-semibold">{core}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Load Average */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
              <div className="text-xs text-gray-400">1m Load</div>
              <div className="text-lg font-bold text-cyan-400">{metrics.cpu.loadavg['1m'].toFixed(2)}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
              <div className="text-xs text-gray-400">5m Load</div>
              <div className="text-lg font-bold text-cyan-400">{metrics.cpu.loadavg['5m'].toFixed(2)}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
              <div className="text-xs text-gray-400">15m Load</div>
              <div className="text-lg font-bold text-cyan-400">{metrics.cpu.loadavg['15m'].toFixed(2)}</div>
            </div>
          </div>

          {/* Temperature */}
          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-400">CPU Temperature</div>
                <div className="text-2xl font-bold text-cyan-400">{metrics.cpu.temperatureC}°C</div>
                <div className="text-xs text-gray-500 mt-1">Source: {metrics.cpu.temperatureSource}</div>
              </div>
              <div className="text-right">
                {metrics.cpu.temperatureC < 50 && <div className="text-green-400 text-sm">✓ Cool</div>}
                {metrics.cpu.temperatureC >= 50 && metrics.cpu.temperatureC < 75 && <div className="text-yellow-400 text-sm">⚠ Warm</div>}
                {metrics.cpu.temperatureC >= 75 && <div className="text-red-400 text-sm">🔥 Hot</div>}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Memory Metrics */}
      {metrics.memory && (
        <motion.div
          className="p-6 bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-lg border border-purple-500/30"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h3 className="text-xl font-bold text-cyan-400 mb-4">Memory Usage (JS Heap)</h3>
          
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-cyan-300">Heap Usage</span>
              <span className="text-2xl font-bold text-cyan-400">{memPercent}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${memPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
              <div className="text-xs text-gray-400">Used</div>
              <div className="text-2xl font-bold text-cyan-400">{metrics.memory.used} MB</div>
            </div>
            <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
              <div className="text-xs text-gray-400">Total</div>
              <div className="text-2xl font-bold text-cyan-400">{metrics.memory.total} MB</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* GPU Info */}
      <motion.div
        className="p-6 bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg border border-green-500/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h3 className="text-xl font-bold text-cyan-400 mb-4">GPU Information</h3>
        
        <div className="space-y-3">
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Renderer</div>
            <div className="text-sm text-cyan-400 font-mono">{getGPUInfo().renderer}</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Vendor</div>
            <div className="text-sm text-cyan-400 font-mono">{getGPUInfo().vendor}</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">WebGL Version</div>
            <div className="text-sm text-cyan-400 font-mono">{getGPUInfo().webglVersion}</div>
          </div>
        </div>
      </motion.div>

      {/* System Info */}
      <motion.div
        className="p-6 bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 rounded-lg border border-indigo-500/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h3 className="text-xl font-bold text-cyan-400 mb-4">System Information</h3>
        
        <div className="space-y-3">
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">CPU Cores</div>
            <div className="text-sm text-cyan-400">{metrics.cpu?.cores || 'N/A'} cores</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Device Memory</div>
            <div className="text-sm text-cyan-400">{getDeviceMemory()} GB</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
            <div className="text-xs text-gray-400">Last Updated</div>
            <div className="text-sm text-cyan-400">{new Date(metrics.timestamp).toLocaleTimeString()}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function getGPUInfo() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) {
      return {
        renderer: 'WebGL not available',
        vendor: 'N/A',
        webglVersion: 'N/A',
      };
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : 'Unknown',
      vendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : 'Unknown',
      webglVersion: gl instanceof WebGL2RenderingContext ? 'WebGL 2.0' : 'WebGL 1.0',
    };
  } catch {
    return {
      renderer: 'Error detecting GPU',
      vendor: 'N/A',
      webglVersion: 'N/A',
    };
  }
}

function getDeviceMemory() {
  if (typeof navigator === 'undefined') return 'N/A';
  const deviceMemory = (navigator as any).deviceMemory;
  return deviceMemory ? `${deviceMemory}` : 'N/A';
}
