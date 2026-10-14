'use client';

import {Suspense, useRef, useState} from 'react';
import {useFrame, ThreeEvent} from '@react-three/fiber';
import {Mesh} from 'three';
import GLBModel from '@/components/ui/GLBModel';
import { getCurrentPerformanceConfig } from '@/config/performance';
import {Html, Text} from "@react-three/drei";
import {Model3DLoader} from "@/app/3d-demo/component/3d-model-loader";

// Get performance configuration based on system capabilities
const PERF_CONFIG = getCurrentPerformanceConfig();
const ANIMATION_THROTTLE = PERF_CONFIG.RENDERING.ANIMATION_THROTTLE;

interface Product3DProps {
    product: {
        id: number;
        name: string;
        category: string;
        description: string;
        modelPath: string;
        videoUrl: string;
        images: string[];
        specs: string[];
    };
    animationsEnabled?: boolean;
    position: [number, number, number];
    rotation: [number, number, number];
    isSelected: boolean;
    onSwipeUp?: () => void;
    // Size configuration options
    meshHoverScale?: number;
    selectionRingRadius?: number;
    selectionRingThickness?: number;
    selectionRingPosition?: [number, number, number];
    // 3D Model configuration options
    modelScale?: number;
    selectedModelScale?: number;
    modelPosition?: [number, number, number];
}

export default function Product3D({
                                      product,
                                      position,
                                      rotation,
                                      isSelected,
                                      onSwipeUp,
                                      animationsEnabled,
                                      // Default size values
                                      meshHoverScale = 1.1,
                                      // Default 3D model values
                                      modelScale = 1.5,
                                      selectedModelScale = 2.0,
                                      modelPosition = [0, 0, 0]
                                  }: Product3DProps) {
    const meshRef = useRef<Mesh>(null);
    const groupRef = useRef<any>(null);
    const hasInitializedTransformRef = useRef(false);
    const lastFrameTimeRef = useRef<number>(0);
    const [hovered, setHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);

    const handlePointerOver = (event: ThreeEvent<PointerEvent>) => setHovered(true);
    const handlePointerOut = (event: ThreeEvent<PointerEvent>) => setHovered(false);

    const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
        if (!isSelected) return;

        setIsDragging(true);
        setDragStart({x: event.clientX, y: event.clientY});
        event.stopPropagation();

        // Add global pointer up listener to catch the event even if it's outside the mesh
        const handleGlobalPointerUp = (globalEvent: PointerEvent) => {
            if (!dragStart) return;
            const deltaY = globalEvent.clientY - dragStart.y;

            // Check for upward swipe (negative Y direction, at least 50px)
            if (Math.abs(deltaY) > 50 && deltaY < 0) {
                setIsAnimating(true);
                setTimeout(() => {
                    setIsAnimating(false);
                    onSwipeUp?.();
                }, 1000);
            }

            setIsDragging(false);
            setDragStart(null);

            // Remove the global listener
            window.removeEventListener('pointerup', handleGlobalPointerUp);
        };

        // Add global listener
        window.addEventListener('pointerup', handleGlobalPointerUp);
    };

    const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
        if (!isSelected || !isDragging || !dragStart) {
            setIsDragging(false);
            setDragStart(null);
            return;
        }

        const deltaY = event.clientY - dragStart.y;

        // Check for upward swipe (negative Y direction, at least 50px)
        if (Math.abs(deltaY) > 50 && deltaY < 0) {
            setIsAnimating(true);
            setTimeout(() => {
                console.log('Animation complete, opening video...');
                setIsAnimating(false);
                onSwipeUp?.();
            }, 1000);
        }

        setIsDragging(false);
        setDragStart(null);
    };

    const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
        if (!isSelected || !isDragging || !dragStart) return;

        const deltaX = event.clientX - dragStart.x;
        const deltaY = event.clientY - dragStart.y;

        console.log('Delta movement - X:', deltaX, 'Y:', deltaY);
    };

    // Continuous rotation animation with throttling
    useFrame((state, delta) => {
        // Throttle frame updates to 30fps for better performance
        const currentTime = performance.now();
        if (currentTime - lastFrameTimeRef.current < ANIMATION_THROTTLE) {
            return;
        }
        lastFrameTimeRef.current = currentTime;

        if (meshRef.current && groupRef.current) {
            // Reduce rotation speed for smoother performance
            meshRef.current.rotation.y += delta * 0.3;

            // Smooth position interpolation with spring-like animation
            const targetX = position[0];
            const targetY = position[1];
            const targetZ = position[2];

            if (!hasInitializedTransformRef.current) {
                groupRef.current.position.set(targetX, targetY, targetZ);
                groupRef.current.rotation.set(rotation[0], rotation[1], rotation[2]);
                hasInitializedTransformRef.current = true;
            }

            const currentX = groupRef.current.position.x;
            const currentY = groupRef.current.position.y;
            const currentZ = groupRef.current.position.z;

            // Optimized spring animation parameters
            const springStrength = PERF_CONFIG.RENDERING.SPRING_STRENGTH;
            const damping = PERF_CONFIG.RENDERING.DAMPING;

            // Calculate smooth movement with spring physics
            const deltaX = (targetX - currentX) * springStrength * delta;
            const deltaZ = (targetZ - currentZ) * springStrength * delta;

            // Apply smooth movement
            groupRef.current.position.x += deltaX * damping;
            groupRef.current.position.z += deltaZ * damping;

            // Add floating animation for selected item
            if (isSelected && !isAnimating) {
                groupRef.current.position.y = targetY + Math.sin(state.clock.elapsedTime * 2) * 0.3;
            } else if (!isAnimating) {
                groupRef.current.position.y += (targetY - currentY) * springStrength * delta * damping;
            }

            // Smooth rotation interpolation
            const targetRotationY = rotation[1];
            const currentRotationY = groupRef.current.rotation.y;
            const rawRotationDelta = targetRotationY - currentRotationY;
            const rotationDelta = Math.atan2(Math.sin(rawRotationDelta), Math.cos(rawRotationDelta)) * springStrength * delta;
            groupRef.current.rotation.y += rotationDelta * damping;

            // Swipe-up animation
            if (isAnimating) {
                console.log('Animating - current position Y:', meshRef.current.position.y, 'target:', position[1] + 10);

                // Lift the model upward
                meshRef.current.position.y += delta * 8;

                // Scale the model up
                const currentScale = meshRef.current.scale.x;
                const newScale = currentScale + delta * 2;
                meshRef.current.scale.set(newScale, newScale, newScale);

                // Add rotation during animation
                meshRef.current.rotation.x += delta * 2;
                meshRef.current.rotation.z += delta * 1.5;
            }

            if(!animationsEnabled){
                // Smooth reverse animation to restore mesh to original state
                const targetY = 0;
                const targetRotationX = 0;
                const targetRotationZ = 0;
                const targetScale = hovered ? meshHoverScale : 1;

                // Smooth interpolation parameters
                const reverseSpeed = 5.0; // Speed of reverse animation
                const reverseDamping = 0.8; // Damping for smooth transition

                // Gradually move position back to original
                const deltaY = (targetY - meshRef.current.position.y) * reverseSpeed * delta;
                meshRef.current.position.y += deltaY * reverseDamping;

                // Gradually rotate back to original orientation
                const deltaRotX = (targetRotationX - meshRef.current.rotation.x) * reverseSpeed * delta;
                const deltaRotZ = (targetRotationZ - meshRef.current.rotation.z) * reverseSpeed * delta;
                meshRef.current.rotation.x += deltaRotX * reverseDamping;
                meshRef.current.rotation.z += deltaRotZ * reverseDamping;

                // Gradually scale back to original size
                const currentScale = meshRef.current.scale.x;
                const deltaScale = (targetScale - currentScale) * reverseSpeed * delta;
                const newScale = currentScale + deltaScale * reverseDamping;
                meshRef.current.scale.set(newScale, newScale, newScale);
            }
        }
    });

    return (
        <group ref={groupRef}>
            {/* Main 3D Model with gesture detection */}
            <mesh
                ref={meshRef}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerMove={handlePointerMove}
                scale={hovered ? meshHoverScale : 1}
                position={modelPosition}
            >
                {product.modelPath ? (
                    <Suspense fallback={
                        <Html center>
                        <Model3DLoader />
                        </Html>
                    }>
                        <GLBModel
                            modelPath={product.modelPath}
                            scale={isSelected ? selectedModelScale : modelScale}
                            position={[0, 0, 0]}
                            rotation={[0, 0, 0]}
                            autoRotate={false}
                            autoRotateSpeed={1}
                        />
                    </Suspense>
                ) : (
                    <group position={[0, 0, 0]}>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[2, 2, 0.1]} />
                            <meshStandardMaterial color="#2d3748" />
                        </mesh>
                        <group position={[0, 0, 0.06]}>
                            <Text
                                position={[0, 0.3, 0]}
                                fontSize={0.2}
                                color="white"
                                anchorX="center"
                                anchorY="middle"
                            >
                                3D Model
                            </Text>
                            <Text
                                position={[0, -0.3, 0]}
                                fontSize={0.15}
                                color="#a0aec0"
                                maxWidth={1.8}
                                lineHeight={1.2}
                                letterSpacing={0.02}
                                textAlign="center"
                                anchorX="center"
                                anchorY="middle"
                            >
                                Not Available
                            </Text>
                        </group>
                    </group>
                )}
            </mesh>
        </group>
    );
}
