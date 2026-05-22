import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2, generateFilename } from '@/lib/r2-client';

export const runtime = 'nodejs';

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
    
    // Generate unique filename
    const filename = generateFilename(file.name);
    
    // Upload to R2
    const url = await uploadToR2(buffer, filename, file.type);
    
    console.log(`✅ Uploaded to R2: ${url} (${(file.size / 1024).toFixed(2)}KB)`);
    
    return NextResponse.json({
      url,
      size: file.size,
      type: file.type,
      filename,
    });
  } catch (error) {
    console.error('❌ R2 upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
