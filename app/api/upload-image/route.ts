import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { uploadToStorage, generateFilename } from '@/lib/r2-client';
import { requireWriteAccess } from "@/lib/auth/write-access";

export const runtime = 'nodejs';

const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'] as const;
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

const UploadFileMetaSchema = z.object({
  type: z.enum(VALID_IMAGE_TYPES, {
    errorMap: () => ({ message: 'Invalid file type. Only images are allowed.' }),
  }),
  size: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES, 'File too large. Maximum size is 5MB.'),
});

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
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const formData = await req.formData();
    const fileEntry = formData.get('file');

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const parsedMeta = UploadFileMetaSchema.safeParse({ type: fileEntry.type, size: fileEntry.size });
    if (!parsedMeta.success) {
      return NextResponse.json(
        { error: parsedMeta.error.issues[0]?.message ?? 'Invalid file' },
        { status: 400 }
      );
    }

    const bytes = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!isValidImageSignature(buffer, fileEntry.type)) {
      return NextResponse.json(
        { error: 'Corrupted or invalid image file content.' },
        { status: 400 }
      );
    }

    const filename = generateFilename(fileEntry.name);
    const url = await uploadToStorage(buffer, filename, fileEntry.type);

    return NextResponse.json({
      url,
      size: fileEntry.size,
      type: fileEntry.type,
      filename,
    });
  } catch (error) {
    console.error('❌ Image upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
