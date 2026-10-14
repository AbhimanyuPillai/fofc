// src/app/api/files/[...path]/route.ts
// Dynamic file serving API to bypass Next.js static file caching in production
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// MIME types for common file extensions
const MIME_TYPES: Record<string, string> = {
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path: pathSegments } = await params;
        const relativePath = pathSegments.join('/');
        
        // Security: Prevent directory traversal attacks
        if (relativePath.includes('..') || relativePath.startsWith('/')) {
            return NextResponse.json(
                { error: 'Invalid path' },
                { status: 400 }
            );
        }

        // Only allow specific directories
        const allowedPrefixes = ['3dModels', 'videos', 'images'];
        const firstSegment = pathSegments[0];
        
        if (!allowedPrefixes.includes(firstSegment)) {
            return NextResponse.json(
                { error: 'Access denied' },
                { status: 403 }
            );
        }

        const filePath = path.join(process.cwd(), 'public', relativePath);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return NextResponse.json(
                { error: 'File not found', path: relativePath },
                { status: 404 }
            );
        }

        // Get file stats
        const stats = fs.statSync(filePath);
        
        if (!stats.isFile()) {
            return NextResponse.json(
                { error: 'Not a file' },
                { status: 400 }
            );
        }

        // Determine MIME type
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Read file
        const fileBuffer = fs.readFileSync(filePath);

        // Return file with appropriate headers
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': stats.size.toString(),
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Access-Control-Allow-Origin': '*',
            },
        });

    } catch (error: any) {
        console.error('File serving error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}
