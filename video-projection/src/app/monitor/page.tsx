'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SystemMonitor from '@/components/SystemMonitor';
import GPUMemoryMonitor from '@/components/GPUMemoryMonitor';
import { motion } from 'framer-motion';

export default function MonitorPage() {
  const router = useRouter();
  const [fullscreen, setFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'system' | 'gpu'>('system');

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-900 via-black to-purple-900 ${fullscreen ? 'p-4' : 'p-8'}`}>
      {/* Header */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              Performance Monitor
            </h1>
            <p className="text-cyan-300 mt-2">Real-time System, GPU, and Memory Metrics</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors duration-200 font-medium"
            >
              {fullscreen ? '📦 Compact' : '🖥️ Fullscreen'}
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200 font-medium"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-cyan-500/30">
          <button
            onClick={() => setActiveTab('system')}
            className={`px-6 py-3 font-medium transition-all duration-200 border-b-2 ${
              activeTab === 'system'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-cyan-300'
            }`}
          >
            📊 System Metrics
          </button>
          <button
            onClick={() => setActiveTab('gpu')}
            className={`px-6 py-3 font-medium transition-all duration-200 border-b-2 ${
              activeTab === 'gpu'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-cyan-300'
            }`}
          >
            🎮 GPU Memory
          </button>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className={fullscreen ? 'max-w-full' : 'max-w-6xl mx-auto'}>
        {activeTab === 'system' && <SystemMonitor />}
        {activeTab === 'gpu' && <GPUMemoryMonitor />}
      </div>

      {/* Footer */}
      <motion.div
        className="mt-12 text-center text-cyan-400/60 text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <p>Updates every 2 seconds • Real-time monitoring active</p>
      </motion.div>
    </div>
  );
}
