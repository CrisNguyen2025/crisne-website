import { NextRequest, NextResponse } from 'next/server';
import { uploadToStorage, generateFilename } from '@/lib/r2-client';

export const runtime = 'nodejs';

/**
 * Validates actual binary signature (magic bytes) against expected MIME type
 */
function isValidImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  // JPEG: FF D8 FF
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // GIF: GIF87a / GIF89a (47 49 46)
  if (mimeType === 'image/gif') {
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
  }

  // WebP: RIFF ... WEBP (52 49 46 46 ... 57 45 42 50)
  if (mimeType === 'image/webp') {
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  return false;
}

/**
 * POST /api/upload-image
 * Upload image to Cloudflare R2
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images are allowed.' },
        { status: 400 }
      );
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }
    
    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate actual file magic bytes (prevent spoofed file extensions / MIME)
    if (!isValidImageSignature(buffer, file.type)) {
      return NextResponse.json(
        { error: 'Corrupted or invalid image file content.' },
        { status: 400 }
      );
    }
    
    // Generate unique filename
    const filename = generateFilename(file.name);
    
    // Upload to Storage (Cloudflare R2 if configured, otherwise local public/uploads)
    const url = await uploadToStorage(buffer, filename, file.type);
    
    console.log(`✅ Uploaded image: ${url} (${(file.size / 1024).toFixed(2)}KB)`);
    
    return NextResponse.json({
      url,
      size: file.size,
      type: file.type,
      filename,
    });
  } catch (error: any) {
    console.error('❌ Image upload error:', error);
    return NextResponse.json(
      { error: error?.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
