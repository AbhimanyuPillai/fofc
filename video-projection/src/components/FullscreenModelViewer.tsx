'use client';

import React from 'react';
import { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows, Grid, Stats } from '@react-three/drei';
import { Group } from 'three';
import * as THREE from 'three';
import { getDynamicAssetPath } from '@/utils/dynamicAssetPath';

interface FullscreenModelViewerProps {
  modelPath: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  onClose: () => void;
}

const FullscreenGLBModel = ({ 
  modelPath,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  autoRotate = false,
  autoRotateSpeed = 1
}: {
  modelPath: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  autoRotate?: boolean;
  autoRotateSpeed?: number;
}) => {
  // Use dynamic path for production to serve files added after build
  const dynamicModelPath = getDynamicAssetPath(modelPath);
  const { scene } = useGLTF(dynamicModelPath);
  const groupRef = useRef<Group>(null);

  useFrame((state, delta) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * autoRotateSpeed;
    }
  });

  // Clone the scene to avoid issues with multiple instances
  const clonedScene = scene.clone();
  
  // Enable shadows without changing materials
  clonedScene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return (
    <group 
      ref={groupRef} 
      scale={scale}
      position={position}
      rotation={rotation}
    >
      <primitive object={clonedScene} />
    </group>
  );
};

export default function FullscreenModelViewer({
  modelPath,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  autoRotate = false,
  autoRotateSpeed = 1,
  onClose
}: FullscreenModelViewerProps) {
  const [showGrid, setShowGrid] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [lightIntensity, setLightIntensity] = useState(1);
  const [environmentPreset, setEnvironmentPreset] = useState<string>('studio');
  const [isClient, setIsClient] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(autoRotate);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [envEnabled, setEnvEnabled] = useState(true);

  class EnvErrorBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
      super(props);
      this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch() { this.props.onError(); }
    render() { return this.state.hasError ? null : this.props.children; }
  }

  // Ensure Canvas only renders on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Only add event listener if we're on the client side
    if (typeof window !== 'undefined' && document) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      // Only remove event listener if we're on the client side
      if (typeof window !== 'undefined' && document) {
        document.removeEventListener('keydown', handleEscape);
      }
    };
  }, [onClose]);

  if (!modelPath) return null;

  const environmentPresets = [
    'studio', 'sunset', 'dawn', 'night', 'warehouse', 'forest', 'apartment', 'city', 'park', 'lobby'
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-95 flex">
      {/* Sidebar */}
      <div className={`fixed top-0 left-0 h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 border-r border-cyan-500/20 backdrop-blur-sm transition-all duration-300 z-60 ${
        sidebarOpen ? 'w-80' : 'w-16'
      }`}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-cyan-500/20">
          {sidebarOpen && (
            <div>
              <h2 className="text-lg font-bold text-cyan-400 tracking-wide">3D VIEWER</h2>
              <p className="text-xs text-gray-400 mt-1">Advanced Controls</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg bg-gray-800/50 hover:bg-cyan-600/20 text-cyan-400 hover:text-cyan-300 transition-all duration-200 border border-cyan-500/20"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Sidebar Content */}
        {sidebarOpen && (
          <div className="p-4 space-y-6 overflow-y-auto h-full pb-20">
            {/* Lighting Controls */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider border-b border-cyan-500/20 pb-2">
                Lighting
              </h3>
              <div className="space-y-3">
                <div className="flex flex-col space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-gray-300 text-sm">Intensity</label>
                    <span className="text-cyan-400 text-sm font-mono bg-gray-800/50 px-2 py-1 rounded">
                      {lightIntensity.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={lightIntensity}
                    onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                  />
                </div>
              </div>
            </div>

            {/* Environment Controls */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider border-b border-cyan-500/20 pb-2">
                Environment
              </h3>
              <select
                value={environmentPreset}
                onChange={(e) => setEnvironmentPreset(e.target.value)}
                className="w-full bg-gray-800/50 text-white px-3 py-2 rounded-lg text-sm border border-cyan-500/20 focus:border-cyan-400 focus:outline-none transition-colors"
              >
                {environmentPresets.map(preset => (
                  <option key={preset} value={preset} className="bg-gray-800">
                    {preset.charAt(0).toUpperCase() + preset.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* View Controls */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider border-b border-cyan-500/20 pb-2">
                View Options
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    showGrid 
                      ? 'bg-cyan-600/20 text-cyan-400 border-cyan-500/50 shadow-lg shadow-cyan-500/20' 
                      : 'bg-gray-800/50 text-gray-300 border-gray-600/50 hover:border-cyan-500/30'
                  }`}
                >
                  Grid
                </button>

                <button
                  onClick={() => setShowStats(!showStats)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    showStats 
                      ? 'bg-cyan-600/20 text-cyan-400 border-cyan-500/50 shadow-lg shadow-cyan-500/20' 
                      : 'bg-gray-800/50 text-gray-300 border-gray-600/50 hover:border-cyan-500/30'
                  }`}
                >
                  Stats
                </button>
              </div>
            </div>

            {/* Animation Controls */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider border-b border-cyan-500/20 pb-2">
                Animation
              </h3>
              <button
                onClick={() => setIsAutoRotating(!isAutoRotating)}
                className={`w-full px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 border ${
                  isAutoRotating 
                    ? 'bg-cyan-600/20 text-cyan-400 border-cyan-500/50 shadow-lg shadow-cyan-500/20' 
                    : 'bg-gray-800/50 text-gray-300 border-gray-600/50 hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <span>{isAutoRotating ? '⏸' : '▶'}</span>
                  <span>Auto Rotate</span>
                </div>
              </button>
            </div>

            {/* Instructions */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider border-b border-cyan-500/20 pb-2">
                Controls
              </h3>
              <div className="text-xs text-gray-400 space-y-2 bg-gray-800/30 p-3 rounded-lg border border-gray-700/50">
                <div className="flex justify-between">
                  <span>Rotate:</span>
                  <span className="text-cyan-400">Left Mouse</span>
                </div>
                <div className="flex justify-between">
                  <span>Pan:</span>
                  <span className="text-cyan-400">Right Mouse</span>
                </div>
                <div className="flex justify-between">
                  <span>Zoom:</span>
                  <span className="text-cyan-400">Scroll Wheel</span>
                </div>
                <div className="flex justify-between">
                  <span>Exit:</span>
                  <span className="text-cyan-400">ESC Key</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Close Button */}
        <div className="absolute bottom-4 left-4 right-4">
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-4 py-3 rounded-lg transition-all duration-200 font-medium shadow-lg shadow-red-500/20 border border-red-500/30"
          >
            {sidebarOpen ? '✕ Close Viewer' : '✕'}
          </button>
        </div>
      </div>

      {/* 3D Viewer */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-80' : 'ml-16'}`}>
        {isClient && (
          <Canvas
            gl={{ 
              antialias: true,
              alpha: true,
              powerPreference: "high-performance",
              stencil: false,
              depth: true
            }}
            dpr={[1, 2]}
            shadows
            camera={{ position: [5, 5, 5], fov: 50 }}
          >
            {/* Performance Stats */}
            {showStats && <Stats />}

            {/* Enhanced lighting setup */}
            <ambientLight intensity={0.3 * lightIntensity} />
            <directionalLight 
              position={[10, 10, 5]} 
              intensity={1.2 * lightIntensity}
              castShadow
              shadow-mapSize={[4096, 4096]}
              shadow-camera-far={50}
              shadow-camera-left={-20}
              shadow-camera-right={20}
              shadow-camera-top={20}
              shadow-camera-bottom={-20}
            />
            <pointLight position={[-10, -10, -10]} intensity={0.3 * lightIntensity} />
            <spotLight
              position={[0, 15, 0]}
              angle={0.3}
              penumbra={1}
              intensity={0.5 * lightIntensity}
              castShadow
            />

            {/* Environment lighting (safe) */}
            {envEnabled && (
              <EnvErrorBoundary onError={() => setEnvEnabled(false)}>
                <React.Suspense fallback={null}>
                  <Environment 
                    preset={environmentPreset as any}
                    background={false}
                    environmentIntensity={lightIntensity}
                  />
                </React.Suspense>
              </EnvErrorBoundary>
            )}

            {/* Grid for reference */}
            {showGrid && (
              <Grid
                position={[0, -5, 0]}
                args={[50, 50]}
                cellSize={1}
                cellThickness={0.5}
                cellColor="#444444"
                sectionSize={5}
                sectionThickness={1}
                sectionColor="#666666"
                fadeDistance={30}
                fadeStrength={1}
                infiniteGrid
              />
            )}

            {/* The GLB Model */}
            <FullscreenGLBModel
              modelPath={modelPath}
              scale={scale}
              position={position}
              rotation={rotation}
              autoRotate={isAutoRotating}
              autoRotateSpeed={autoRotateSpeed}
            />

            {/* Enhanced shadows */}
            <ContactShadows
              position={[0, -5, 0]}
              opacity={0.3}
              scale={20}
              blur={2}
              far={8}
            />

            {/* Advanced orbit controls */}
            <OrbitControls
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              dampingFactor={0.05}
              enableDamping={true}
              minDistance={1}
              maxDistance={50}
              maxPolarAngle={Math.PI}
              minPolarAngle={0}
              panSpeed={1}
              rotateSpeed={1}
              zoomSpeed={1}
              mouseButtons={{
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN
              }}
              touches={{
                ONE: THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN
              }}
            />
          </Canvas>
        )}
      </div>
    </div>
  );
}

// Preload the GLB model for better performance
useGLTF.preload('/3dModels/graphics.glb');
