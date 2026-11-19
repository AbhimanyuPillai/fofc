'use client';

import {useEffect, useState, type ReactNode} from 'react';
import {Html} from '@react-three/drei';
import {Box3, BufferGeometry, Material, Mesh, Texture, Vector3} from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {getDynamicAssetPath} from '@/utils/dynamicAssetPath';

function releaseModel(model: GLTF) {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    const bitmaps = new Set<ImageBitmap>();
    for (const scene of model.scenes) {
        scene.traverse(object => {
            if (!(object instanceof Mesh)) return;
            geometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                materials.add(material);
                for (const value of Object.values(material)) {
                    if (value instanceof Texture) textures.add(value);
                }
            }
        });
    }
    for (const texture of textures) {
        if (texture.image instanceof ImageBitmap) bitmaps.add(texture.image);
        texture.dispose();
    }
    for (const bitmap of bitmaps) bitmap.close();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
}

export default function SelectedCarouselModel({modelPath, scale, preview}: {
    modelPath: string; scale: number; preview: ReactNode;
}) {
    const [model, setModel] = useState<GLTF | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const url = new URL(getDynamicAssetPath(modelPath), window.location.href);
        // Load exclusively for this selection so a loader cache doesn't retain past boards.
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        let ownedModel: GLTF | undefined;

        async function loadModel() {
            try {
                const response = await fetch(url, {signal: controller.signal});
                if (!response.ok) throw new Error(`Model request failed (${response.status})`);
                const bytes = await response.arrayBuffer();
                if (controller.signal.aborted) return;
                const loaded = await loader.parseAsync(bytes, new URL('.', url).href);
                if (controller.signal.aborted) {
                    releaseModel(loaded);
                    return;
                }
                ownedModel = loaded;
                const bounds = new Box3().setFromObject(loaded.scene);
                loaded.scene.position.y -= bounds.getCenter(new Vector3()).y;
                loaded.scene.traverse(object => {
                    if (object instanceof Mesh) {
                        object.castShadow = true;
                        object.receiveShadow = true;
                    }
                });
                setModel(loaded);
            } catch (error) {
                if (controller.signal.aborted) return;
                console.error('Could not load the selected carousel model', error);
                setFailed(true);
            }
        }

        void loadModel();
        return () => {
            controller.abort();
            if (ownedModel) releaseModel(ownedModel);
        };
    }, [modelPath]);

    if (model) return <primitive object={model.scene} scale={scale} dispose={null} />;
    return failed ? <Html center>3D model unavailable</Html> : preview;
}
