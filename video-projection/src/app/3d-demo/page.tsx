'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import GLBModelContainer from '@/components/GLBModelContainer';

function ThreeDDemoContent() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 border border-cyan-500/30 rounded-lg transition-all duration-200 text-cyan-400 hover:text-cyan-300"
          >
            <span className="text-lg">←</span>
            <span>Back to Main</span>
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-cyan-400 mb-4">
            3D Model Demo - GLB Container System
          </h1>
          <p className="text-xl text-cyan-200 max-w-3xl mx-auto">
            Interactive containers for your graphics.glb model with full 3D feature access, 
            including orbit controls, lighting, shadows, and environment effects.
          </p>
        </div>

        {/* Loading fallback */}
        <Suspense fallback={
          <div className="flex justify-center items-center h-64">
            <div className="text-cyan-400 text-xl">Loading 3D Models...</div>
          </div>
        }>
          {/* Individual Container Examples */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-cyan-400 mb-6 text-center">
              Interactive 3D Model Container
            </h2>
            
            <div className="flex justify-center">
              <div className="flex flex-col items-center space-y-3">
                <h3 className="text-lg font-semibold text-cyan-300">Main Display</h3>
                <GLBModelContainer
                  scale={2}
                  enableControls={true}
                  enableShadows={true}
                  enableEnvironment={true}
                  autoRotate={true}
                  autoRotateSpeed={0.8}
                  containerSize={{ width: 400, height: 400 }}
                  className="shadow-lg shadow-cyan-500/20"
                />
              </div>
            </div>
          </div>

          {/* Feature Showcase */}
          <div className="bg-gray-900 bg-opacity-60 rounded-xl p-8 border border-cyan-500 border-opacity-30">
            <h2 className="text-2xl font-bold text-cyan-400 mb-6 text-center">
              Available 3D Features
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-gray-800 bg-opacity-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-cyan-300 mb-3">🎮 Interactive Controls</h3>
                <ul className="text-sm text-cyan-200 space-y-1">
                  <li>• Orbit controls (rotate, zoom, pan)</li>
                  <li>• Mouse and touch support</li>
                  <li>• Configurable interaction limits</li>
                  <li>• Auto-rotation with speed control</li>
                </ul>
              </div>

              <div className="bg-gray-800 bg-opacity-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-cyan-300 mb-3">💡 Advanced Lighting</h3>
                <ul className="text-sm text-cyan-200 space-y-1">
                  <li>• Ambient + directional lighting</li>
                  <li>• Dynamic shadows</li>
                  <li>• Environment reflections</li>
                  <li>• Contact shadows for realism</li>
                </ul>
              </div>

              <div className="bg-gray-800 bg-opacity-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-cyan-300 mb-3">⚙️ Customization</h3>
                <ul className="text-sm text-cyan-200 space-y-1">
                  <li>• Flexible container sizes</li>
                  <li>• Scalable model display</li>
                  <li>• Hover effects</li>
                  <li>• Multiple viewing presets</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Usage Instructions */}
          <div className="mt-8 bg-blue-900 bg-opacity-30 rounded-xl p-6 border border-blue-500 border-opacity-30">
            <h3 className="text-xl font-semibold text-cyan-300 mb-4">How to Use</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-cyan-200">
              <div>
                <h4 className="font-semibold text-cyan-400 mb-2">Mouse Controls:</h4>
                <ul className="space-y-1">
                  <li>• <strong>Left Click + Drag:</strong> Rotate the model</li>
                  <li>• <strong>Right Click + Drag:</strong> Pan the view</li>
                  <li>• <strong>Scroll Wheel:</strong> Zoom in/out</li>
                  <li>• <strong>Hover:</strong> Scale up effect</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-cyan-400 mb-2">Container Features:</h4>
                <ul className="space-y-1">
                  <li>• <strong>Auto-rotate:</strong> Continuous rotation</li>
                  <li>• <strong>Environment:</strong> Studio lighting preset</li>
                  <li>• <strong>Shadows:</strong> Contact shadows for depth</li>
                  <li>• <strong>Responsive:</strong> Adapts to container size</li>
                </ul>
              </div>
            </div>
          </div>
        </Suspense>
      </div>
    </div>
  );
}

export default function ThreeDDemoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black text-white flex items-center justify-center">
        <div className="text-cyan-400 text-xl">Loading 3D Demo...</div>
      </div>
    }>
      <ThreeDDemoContent />
    </Suspense>
  );
}
