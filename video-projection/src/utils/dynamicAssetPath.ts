// src/utils/dynamicAssetPath.ts
// Utility to convert static asset paths to dynamic API routes in production
// This allows files added after build to be served correctly

/**
 * Converts a static asset path (e.g., /3dModels/model.glb) to a dynamic API path
 * in production mode. In development, returns the original path.
 * 
 * @param staticPath - The original static path (e.g., /3dModels/model.glb)
 * @returns The path to use for fetching the asset
 */
export function getDynamicAssetPath(staticPath: string): string {
    // In development, static files work fine
    if (process.env.NODE_ENV === 'development') {
        return staticPath;
    }

    // In production, use the dynamic API route for files that might be added after build
    // Only convert paths that start with our allowed directories
    const dynamicPrefixes = ['/3dModels/', '/videos/', '/images/'];
    
    for (const prefix of dynamicPrefixes) {
        if (staticPath.startsWith(prefix)) {
            // Convert /3dModels/model.glb to /api/files/3dModels/model.glb
            return `/api/files${staticPath}`;
        }
    }

    // Return original path for other assets
    return staticPath;
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}
