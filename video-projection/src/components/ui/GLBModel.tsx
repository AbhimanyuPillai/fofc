import {useGLTF} from "@react-three/drei";
import {useRef, useMemo} from "react";
import {Group} from "three";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";
import { getCurrentPerformanceConfig } from '@/config/performance';
import { getDynamicAssetPath } from '@/utils/dynamicAssetPath';

// Get performance configuration based on system capabilities
const PERF_CONFIG = getCurrentPerformanceConfig();
const FRAME_THROTTLE = PERF_CONFIG.RENDERING.ANIMATION_THROTTLE;

const GLBModel = ({
                             modelPath,
                             scale = 1,
                             position = [0, 0, 0],
                             rotation = [0, 0, 0],
                             autoRotate = false,
                             autoRotateSpeed = 1,
                             isUserInteracting = false
                         }: {
    modelPath: string;
    scale: number;
    position: [number, number, number];
    rotation: [number, number, number];
    autoRotate: boolean;
    autoRotateSpeed: number;
    isUserInteracting?: boolean;
}) => {
    // Use dynamic path for production to serve files added after build
    const dynamicModelPath = getDynamicAssetPath(modelPath);
    const { scene } = useGLTF(dynamicModelPath);
    const groupRef = useRef<Group>(null);
    const lastFrameTimeRef = useRef<number>(0);

    useFrame((state, delta) => {
        // Throttle frame updates to 30fps for better performance
        const currentTime = performance.now();
        if (currentTime - lastFrameTimeRef.current < FRAME_THROTTLE) {
            return;
        }
        lastFrameTimeRef.current = currentTime;
        
        if (autoRotate && !isUserInteracting && groupRef.current) {
            groupRef.current.rotation.y += delta * autoRotateSpeed;
        }
    });

    // Memoize scene cloning and optimization to avoid repeated work
    const optimizedScene = useMemo(() => {
        const clonedScene = scene.clone();
        
        // Only enable shadows without changing materials
        clonedScene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                // Enable shadow casting and receiving only
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Optimize geometry for better performance
                if (child.geometry) {
                    child.geometry.computeBoundingSphere();
                    child.geometry.computeBoundingBox();
                }
            }
        });
        
        return clonedScene;
    }, [scene]);

    return (
        <group
            ref={groupRef}
            scale={scale}
            position={position}
            rotation={rotation}
        >
            <primitive object={optimizedScene} />
        </group>
    );
};

export default GLBModel;