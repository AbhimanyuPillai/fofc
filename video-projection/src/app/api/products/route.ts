// src/app/api/products/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Force dynamic rendering and disable all caching
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const productsFile = path.join(process.cwd(), 'data', 'products.json');

// Helper function to read products with error handling
function readProducts() {
    try {
        if (!fs.existsSync(productsFile)) {
            return [];
        }
        const raw = fs.readFileSync(productsFile, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('Error reading products:', e);
        return [];
    }
}

// Helper function to write products with error handling
function writeProducts(products: any) {
    try {
        const dir = path.dirname(productsFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(productsFile, JSON.stringify(products, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('Error writing products:', e);
        return false;
    }
}

export async function GET() {
    try {
        const products = readProducts();
        const response = NextResponse.json(products);

        // Add headers to prevent all forms of caching
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        response.headers.set('Surrogate-Control', 'no-store');

        return response;
    } catch (e: any) {
        console.error('GET error:', e);
        return NextResponse.json(
            { error: 'Failed to fetch products', details: e.message },
            {
                status: 500,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                }
            }
        );
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();

        if (!Array.isArray(body)) {
            return NextResponse.json(
                { error: 'Expected an array of products' },
                {
                    status: 400,
                    headers: {
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                    }
                }
            );
        }

        // Validate each product has required fields
        const isValid = body.every(p =>
            typeof p.id === 'number' &&
            typeof p.name === 'string' &&
            Array.isArray(p.images)
        );

        if (!isValid) {
            return NextResponse.json(
                { error: 'Invalid product data' },
                {
                    status: 400,
                    headers: {
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                    }
                }
            );
        }

        const success = writeProducts(body);

        if (!success) {
            throw new Error('Failed to write products to file');
        }

        // Invalidate the cache for the GET endpoint
        if (process.env.NODE_ENV === 'production') {
            try {
                await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/products`, {
                    method: 'HEAD',
                    cache: 'no-store'
                });
            } catch (e) {
                console.warn('Cache invalidation failed:', e);
            }
        }

        const response = NextResponse.json(
            { success: true, count: body.length },
            {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                }
            }
        );

        return response;

    } catch (e: any) {
        console.error('PUT error:', e);
        return NextResponse.json(
            {
                error: 'Failed to save products',
                details: e.message
            },
            {
                status: 500,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                }
            }
        );
    }
}