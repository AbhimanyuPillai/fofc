import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicDir = path.join(process.cwd(), 'public');

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const kind = String(form.get('kind') || 'video'); // 'video' | 'model' | 'image'

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Decide destination subfolder
    let sub = 'uploads';
    if (kind === 'video') sub = 'videos';
    else if (kind === 'model') sub = '3dModels';
    else if (kind === 'image') sub = 'images';

    const destDir = path.join(publicDir, sub);
    ensureDir(destDir);

    const orig = safeFilename(file.name || `upload-${Date.now()}`);
    const ext = path.extname(orig) || '';
    const base = path.basename(orig, ext);
    const filename = `${base}-${Date.now()}${ext}`;
    const destPath = path.join(destDir, filename);

    fs.writeFileSync(destPath, buffer);

    const publicUrl = `/${sub}/${filename}`;
    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Upload failed' }, { status: 500 });
  }
}
