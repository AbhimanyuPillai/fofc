'use client';

import {useMemo, useRef} from 'react';
import {useFrame, useLoader} from '@react-three/fiber';
import {SRGBColorSpace, Sprite, TextureLoader, Vector2, Vector3} from 'three';
import {getDynamicAssetPath} from '@/utils/dynamicAssetPath';
import previewIndex from '../../public/images/carousel/previews.json';

type StillFrame = {angle: number; file: string};
export type CarouselPreview = {modelPath: string; folder: string; width: number; centersY: number[]};
export const carouselPreviews: Partial<Record<number, CarouselPreview>> = previewIndex.products;
const stillAngles = previewIndex.frames;

function closestFrame(stillAngles: StillFrame[], angle: number) {
    let nearest = 0;
    let nearestDistance = Infinity;
    for (const [index, frame] of stillAngles.entries()) {
        const delta = Math.abs(angle - frame.angle);
        const distance = Math.min(delta, 360 - delta);
        if (distance < nearestDistance) {
            nearest = index;
            nearestDistance = distance;
        }
    }
    return nearest;
}

export default function CarouselStillPreview({preview}: {preview: CarouselPreview}) {
    const {width: frameWidth, folder, centersY} = preview;
    const sprite = useRef<Sprite>(null);
    const localCamera = useMemo(() => new Vector3(), []);
    const initialCenter = useMemo(() => new Vector2(0.5, centersY[0]), [centersY]);
    const paths = useMemo(() => stillAngles.map(({file}) =>
        getDynamicAssetPath(`/images/carousel/${folder}/${file}`)
    ), [folder]);
    const frames = useLoader(TextureLoader, paths);
    useMemo(() => {
        for (const frame of frames) frame.colorSpace = SRGBColorSpace;
    }, [frames]);
    const {width, height} = frames[0].image;

    useFrame(({camera}) => {
        const preview = sprite.current;
        const orbitGroup = preview?.parent?.parent;
        if (!preview || !orbitGroup) return;

        // Use the carousel's current, interpolated angle. Ignore the GLB's idle spin.
        camera.getWorldPosition(localCamera);
        orbitGroup.worldToLocal(localCamera);
        // The baked angles are camera bearings in the model's own coordinates.
        const bearing = Math.atan2(localCamera.x, localCamera.z) * 180 / Math.PI;
        const index = closestFrame(stillAngles, (bearing + 180) % 360);
        const frame = frames[index];
        // Three.js sprite anchors measure from the bottom of the texture.
        preview.center.y = centersY[index];
        if (preview.material.map !== frame) preview.material.map = frame;
    });

    return (
        <sprite ref={sprite} center={initialCenter} scale={[frameWidth, frameWidth * height / width, 1]}>
            <spriteMaterial map={frames[0]} transparent depthWrite={false} toneMapped={false} />
        </sprite>
    );
}
