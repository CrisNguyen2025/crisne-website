import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as fs from 'fs/promises';
import * as path from 'path';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || (R2_ACCOUNT_ID ? `https://pub-${R2_ACCOUNT_ID}.r2.dev` : '');

export const isR2Configured = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME
);

// Create S3-compatible client for Cloudflare R2 only if configured
export const r2Client = isR2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

/**
 * Upload file to Cloudflare R2 (or fallback to public/uploads directory if R2 is not configured)
 * @param buffer File buffer
 * @param filename Filename with extension
 * @param contentType MIME type
 * @returns Public URL of uploaded file
 */
export async function uploadToStorage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  // 1. If R2 is properly configured, upload to Cloudflare R2
  if (isR2Configured && r2Client) {
    const key = `uploads/${filename}`;
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      },
    });

    await upload.done();
    return `${R2_PUBLIC_URL}/${key}`;
  }

  // 2. Fallback: Save directly to Next.js public/uploads directory
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return `/uploads/${filename}`;
}

/** Legacy alias for backward compatibility */
export const uploadToR2 = uploadToStorage;

/**
 * Delete file from Storage (R2 or local)
 * @param url Public URL of file to delete
 */
export async function deleteFromStorage(url: string): Promise<void> {
  if (isR2Configured && r2Client && url.startsWith(R2_PUBLIC_URL)) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const key = url.replace(`${R2_PUBLIC_URL}/`, '');
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME!,
        Key: key,
      })
    );
    return;
  }

  // If local file
  if (url.startsWith('/uploads/')) {
    const localFilename = path.basename(url);
    const filePath = path.join(process.cwd(), 'public', 'uploads', localFilename);
    await fs.unlink(filePath).catch(() => {});
  }
}

/** Legacy alias for backward compatibility */
export const deleteFromR2 = deleteFromStorage;

/**
 * Generate unique filename
 * @param originalName Original filename
 * @returns Sanitized unique filename
 */
export function generateFilename(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const ext = originalName.split('.').pop() || 'png';
  const sanitized = originalName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-z0-9]/gi, '-') // Replace special chars
    .toLowerCase()
    .substring(0, 50); // Limit length

  return `${sanitized}-${timestamp}-${random}.${ext}`;
}
