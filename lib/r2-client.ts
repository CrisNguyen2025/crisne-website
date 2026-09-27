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

export interface StorageFileInfo {
  filename: string;
  url: string;
  size: number;
  lastModified?: Date;
}

export interface StorageScanResult {
  totalFiles: StorageFileInfo[];
  usedFiles: StorageFileInfo[];
  unusedFiles: StorageFileInfo[];
  usedBytes: number;
  unusedBytes: number;
  totalLimitBytes: number;
  maxFileSizeBytes: number;
  isR2: boolean;
}

/**
 * List all files in storage (R2 or local) with pagination support
 */
export async function listAllStorageFiles(): Promise<StorageFileInfo[]> {
  const files: StorageFileInfo[] = [];

  try {
    if (isR2Configured && r2Client) {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      let continuationToken: string | undefined = undefined;

      do {
        const response: any = await r2Client.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME!,
            Prefix: 'uploads/',
            ContinuationToken: continuationToken,
          })
        );

        if (response.Contents) {
          for (const item of response.Contents) {
            if (!item.Key) continue;
            const filename = item.Key.replace(/^uploads\//, '');
            if (!filename) continue;
            files.push({
              filename,
              url: `${R2_PUBLIC_URL}/${item.Key}`,
              size: item.Size || 0,
              lastModified: item.LastModified,
            });
          }
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);

      return files;
    }

    // Local uploads directory
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    try {
      const fileNames = await fs.readdir(uploadsDir);
      for (const file of fileNames) {
        if (file.startsWith('.')) continue;
        const filePath = path.join(uploadsDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          files.push({
            filename: file,
            url: `/uploads/${file}`,
            size: stat.size,
            lastModified: stat.mtime,
          });
        }
      }
    } catch {
      // Directory may not exist yet
    }

    return files;
  } catch (error) {
    console.error('Failed to list storage files:', error);
    return [];
  }
}

/**
 * Scan database to detect used vs unused (orphaned) files in storage
 */
export async function findUnusedStorageFiles(): Promise<StorageScanResult> {
  const maxFileSizeBytes = 5 * 1024 * 1024; // 5MB
  const totalLimitBytes = 10 * 1024 * 1024 * 1024; // 10 GB

  const allStorageFiles = await listAllStorageFiles();

  try {
    const { prisma } = await import('@/lib/prisma');

    // Fetch all contents from RoadmapItem, Roadmap, and Note
    const [items, roadmaps, notes] = await Promise.all([
      prisma.roadmapItem.findMany({
        select: { content: true, description: true },
      }),
      prisma.roadmap.findMany({
        select: { description: true },
      }),
      prisma.note.findMany({
        select: { description: true, link: true },
      }),
    ]);

    // Build combined text haystack
    let haystack = '';
    for (const item of items) {
      if (item.content) haystack += ` ${item.content}`;
      if (item.description) haystack += ` ${item.description}`;
    }
    for (const r of roadmaps) {
      if (r.description) haystack += ` ${r.description}`;
    }
    for (const n of notes) {
      if (n.description) haystack += ` ${n.description}`;
      if (n.link) haystack += ` ${n.link}`;
    }

    const usedFiles: StorageFileInfo[] = [];
    const unusedFiles: StorageFileInfo[] = [];
    let usedBytes = 0;
    let unusedBytes = 0;

    for (const file of allStorageFiles) {
      if (haystack.includes(file.filename)) {
        usedFiles.push(file);
        usedBytes += file.size;
      } else {
        unusedFiles.push(file);
        unusedBytes += file.size;
      }
    }

    return {
      totalFiles: allStorageFiles,
      usedFiles,
      unusedFiles,
      usedBytes,
      unusedBytes,
      totalLimitBytes,
      maxFileSizeBytes,
      isR2: Boolean(isR2Configured),
    };
  } catch (error) {
    console.error('Failed to scan database for unused files:', error);
    return {
      totalFiles: allStorageFiles,
      usedFiles: allStorageFiles,
      unusedFiles: [],
      usedBytes: allStorageFiles.reduce((acc, f) => acc + f.size, 0),
      unusedBytes: 0,
      totalLimitBytes,
      maxFileSizeBytes,
      isR2: Boolean(isR2Configured),
    };
  }
}

/**
 * Delete unused storage files (permanent cleanup)
 */
export async function cleanupUnusedStorageFiles(targetFilenames?: string[]): Promise<{
  deletedCount: number;
  freedBytes: number;
  remainingCount: number;
  remainingBytes: number;
}> {
  const scanResult = await findUnusedStorageFiles();
  const filesToDelete = targetFilenames
    ? scanResult.unusedFiles.filter((f) => targetFilenames.includes(f.filename))
    : scanResult.unusedFiles;

  let deletedCount = 0;
  let freedBytes = 0;

  for (const file of filesToDelete) {
    try {
      await deleteFromStorage(file.url);
      deletedCount += 1;
      freedBytes += file.size;
    } catch (err) {
      console.error(`Failed to delete file ${file.filename}:`, err);
    }
  }

  const remainingFiles = scanResult.totalFiles.filter(
    (f) => !filesToDelete.some((del) => del.filename === f.filename)
  );
  const remainingBytes = remainingFiles.reduce((acc, f) => acc + f.size, 0);

  return {
    deletedCount,
    freedBytes,
    remainingCount: remainingFiles.length,
    remainingBytes,
  };
}

/**
 * Legacy stats getter
 */
export async function getStorageStats() {
  const scan = await findUnusedStorageFiles();
  return {
    usedBytes: scan.usedBytes + scan.unusedBytes,
    fileCount: scan.totalFiles.length,
    unusedCount: scan.unusedFiles.length,
    unusedBytes: scan.unusedBytes,
    maxFileSizeBytes: scan.maxFileSizeBytes,
    totalLimitBytes: scan.totalLimitBytes,
    isR2: scan.isR2,
  };
}
