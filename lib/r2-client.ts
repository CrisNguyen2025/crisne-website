import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://pub-${R2_ACCOUNT_ID}.r2.dev`;

// Create S3-compatible client for Cloudflare R2
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload file to Cloudflare R2
 * @param buffer File buffer
 * @param filename Filename with extension
 * @param contentType MIME type
 * @returns Public URL of uploaded file
 */
export async function uploadToR2(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const key = `uploads/${filename}`;
  
  const upload = new Upload({
    client: r2Client,
    params: {
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Cache headers for better performance
      CacheControl: 'public, max-age=31536000, immutable',
    },
  });

  await upload.done();
  
  // Return public URL
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Delete file from R2
 * @param url Public URL of file to delete
 */
export async function deleteFromR2(url: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  
  // Extract key from URL
  const key = url.replace(`${R2_PUBLIC_URL}/`, '');
  
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

/**
 * Generate unique filename
 * @param originalName Original filename
 * @returns Sanitized unique filename
 */
export function generateFilename(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const ext = originalName.split('.').pop() || 'png';
  const sanitized = originalName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-z0-9]/gi, '-') // Replace special chars
    .toLowerCase()
    .substring(0, 50); // Limit length
  
  return `${sanitized}-${timestamp}-${random}.${ext}`;
}
