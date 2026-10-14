'use client';

import React, {useState, useEffect, Suspense} from 'react';
import {Canvas} from '@react-three/fiber';
import {useGLTF, OrbitControls, Environment, ContactShadows} from '@react-three/drei';
import {useSearchParams} from 'next/navigation';
import FullscreenModelViewer from './FullscreenModelViewer';
import GLBModel from "@/components/ui/GLBModel";

interface GLBModelContainerProps {
    scale?: number;
    position?: [number, number, number];
    rotation?: [number, number, number];
    enableControls?: boolean;
    enableShadows?: boolean;
    enableEnvironment?: boolean;
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    containerSize?: {
        width: number;
        height: number;
    };
    className?: string;
}

export default function GLBModelContainer({
                                              scale = 1,
                                              position = [0, 0, 0],
                                              rotation = [0, 0, 0],
                                              enableControls = true,
                                              enableShadows = true,
                                              enableEnvironment = true,
                                              autoRotate = false,
                                              autoRotateSpeed = 0.5,
                                              containerSize = {width: 400, height: 400},
                                              className = ''
                                          }: GLBModelContainerProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const [isUserInteracting, setIsUserInteracting] = useState(false);
    const [envEnabled, setEnvEnabled] = useState(true);
    const [modelPath, setModelPath] = useState('/3dModels/graphics.glb');
    const searchParams = useSearchParams();

    class EnvErrorBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { hasError: boolean }> {
        constructor(props: any) {
            super(props);
            this.state = { hasError: false };
        }
        static getDerivedStateFromError() { return { hasError: true }; }
        componentDidCatch() { this.props.onError(); }
        render() { return this.state.hasError ? null : this.props.children; }
    }

    // Ensure Canvas only renders on client side and fetch model path from query params
    useEffect(() => {
        setIsClient(true);
        const path = searchParams.get('modelPath') || '/3dModels/graphics.glb';
        setModelPath(path);
    }, [searchParams]);

    return (
        <div
            className={`relative ${className}`}
            style={{
                width: containerSize.width,
                height: containerSize.height,
                border: '1px solid rgba(0, 255, 255, 0.3)',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'rgba(0, 0, 0, 0.1)'
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {isClient ? (
                <Canvas
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'block'
                    }}
                    gl={{
                        // Avoid MSAA requirement; some fallbacks (SwiftShader) don't expose it
                        antialias: false,
                        alpha: true,
                        powerPreference: "high-performance",
                        stencil: false,
                        depth: true,
                        // Allow context even if it falls back to software/low-perf
                        failIfMajorPerformanceCaveat: false
                    }}
                    dpr={[1, 2]}
                    shadows
                    camera={{position: [5, 5, 5], fov: 50}}
                >
                    {/* Enhanced lighting setup for better quality */}
                    <ambientLight intensity={0.3}/>
                    <directionalLight
                        position={[10, 10, 5]}
                        intensity={1.2}
                        castShadow={enableShadows}
                        shadow-mapSize={[2048, 2048]}
                        shadow-camera-far={50}
                        shadow-camera-left={-10}
                        shadow-camera-right={10}
                        shadow-camera-top={10}
                        shadow-camera-bottom={-10}
                    />
                    <pointLight position={[-10, -10, -10]} intensity={0.3}/>
                    <spotLight
                        position={[0, 10, 0]}
                        angle={0.3}
                        penumbra={1}
                        intensity={0.5}
                        castShadow={enableShadows}
                    />

                    {/* Environment lighting for realistic reflections (safe) */}
                    {enableEnvironment && envEnabled && (
                        <EnvErrorBoundary onError={() => setEnvEnabled(false)}>
                            <Suspense fallback={null}>
                                <Environment
                                    preset="studio"
                                    background={false}
                                    environmentIntensity={1}
                                />
                            </Suspense>
                        </EnvErrorBoundary>
                    )}
                    <Suspense fallback={null}>
                        {/* The GLB Model */}
                        <GLBModel
                            modelPath={modelPath}
                            scale={isHovered ? scale * 1.1 : scale}
                            position={position}
                            rotation={rotation}
                            autoRotate={autoRotate}
                            autoRotateSpeed={autoRotateSpeed}
                            isUserInteracting={isUserInteracting}
                        />
                    </Suspense>

                    {/* Enhanced shadows */}
                    {enableShadows && (
                        <ContactShadows
                            position={[0, -2, 0]}
                            opacity={0.4}
                            scale={10}
                            blur={2}
                            far={4}
                        />
                    )}

                    {/* Orbit controls with smooth damping */}
                    {enableControls && (
                        <OrbitControls
                            enablePan={true}
                            enableZoom={true}
                            enableRotate={true}
                            dampingFactor={0.05}
                            enableDamping={true}
                            minDistance={2}
                            maxDistance={20}
                            maxPolarAngle={Math.PI / 1.8}
                            onChange={() => setIsUserInteracting(true)}
                            onStart={() => setIsUserInteracting(true)}
                            onEnd={() => setIsUserInteracting(false)}
                        />
                    )}
                </Canvas>
            ) : (
                <div className="flex items-center justify-center h-full bg-gray-900 text-cyan-400">
                    <div className="text-center">
                        <div
                            className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-2"></div>
                        <div className="text-sm">Loading 3D Model...</div>
                    </div>
                </div>
            )}

            {/* Container info overlay */}
            <div className="absolute top-2 left-2 text-xs text-cyan-400 opacity-70">
                {containerSize.width}x{containerSize.height}
            </div>

            {/* Interaction hint */}
            {isHovered && enableControls && (
                <div className="absolute bottom-2 left-2 text-xs text-cyan-400 opacity-70">
                    Click & drag to rotate • Scroll to zoom
                </div>
            )}

            {/* Fullscreen button */}
            <button
                onClick={() => setIsFullscreen(true)}
                className="absolute top-2 right-2 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors duration-200 opacity-80 hover:opacity-100"
                title="Open in fullscreen for detailed inspection"
            >
                🔍 Fullscreen
            </button>

            {/* Fullscreen Model Viewer */}
            {isFullscreen && (
                <FullscreenModelViewer
                    modelPath={modelPath}
                    scale={scale}
                    position={position}
                    rotation={rotation}
                    autoRotate={autoRotate}
                    autoRotateSpeed={autoRotateSpeed}
                    onClose={() => setIsFullscreen(false)}
                />
            )}
        </div>
    );
}

// Preload the GLB model for better performance
useGLTF.preload('/3dModels/graphics.glb');
