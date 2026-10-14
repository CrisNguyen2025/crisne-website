import * as fs from "fs/promises";
import * as path from "path";
import { isR2Configured, r2Client } from "@/lib/r2-client";

export function buildStorageKey(projectId: string, documentId: string): string {
  return `workflow-kb/${projectId}/${documentId}`;
}

export function getLocalStoragePath(storageKey: string): string {
  return path.join(process.cwd(), ".data", storageKey);
}

/**
 * Saves document buffer to Cloudflare R2 if configured, or local .data/workflow-kb/...
 */
export async function saveToStorage(
  storageKey: string,
  buffer: Buffer,
  mimeType?: string
): Promise<void> {
  if (isR2Configured && r2Client) {
    const { Upload } = await import("@aws-sdk/lib-storage");
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error("R2_BUCKET_NAME is not configured.");

    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType || "application/octet-stream",
      },
    });

    await upload.done();
    return;
  }

  // Fallback: save to local .data/ directory (not in public/uploads)
  const localPath = getLocalStoragePath(storageKey);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
}

/**
 * Reads document buffer from Cloudflare R2 if configured, or local .data/workflow-kb/...
 */
export async function readFromStorage(storageKey: string): Promise<Buffer> {
  if (isR2Configured && r2Client) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error("R2_BUCKET_NAME is not configured.");

    const res = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      })
    );

    const byteArray = await res.Body?.transformToByteArray();
    return Buffer.from(byteArray || []);
  }

  const localPath = getLocalStoragePath(storageKey);
  return fs.readFile(localPath);
}

/**
 * Deletes document file from Cloudflare R2 if configured, or local .data/workflow-kb/...
 */
export async function deleteFromStorage(storageKey: string): Promise<void> {
  if (isR2Configured && r2Client) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) return;

    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      })
    ).catch(() => {});
    return;
  }

  const localPath = getLocalStoragePath(storageKey);
  await fs.unlink(localPath).catch(() => {});
}
