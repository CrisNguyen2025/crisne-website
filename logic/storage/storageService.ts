export interface StorageFileInfo {
  filename: string;
  url: string;
  size: number;
  lastModified?: string;
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

export interface CleanupResult {
  deletedCount: number;
  freedBytes: number;
  remainingCount: number;
  remainingBytes: number;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

let cachedStorageScan: StorageScanResult | null = null;

export function getCachedStorageScan(): StorageScanResult | null {
  return cachedStorageScan;
}

export function setCachedStorageScan(data: StorageScanResult | null) {
  cachedStorageScan = data;
}

/**
 * Fetch detailed storage scan (used vs unused files) with in-memory caching
 */
export async function fetchStorageScan(): Promise<StorageScanResult> {
  const res = await fetch('/api/storage/cleanup', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch storage scan: ${res.statusText}`);
  }

  const data: StorageScanResult = await res.json();
  cachedStorageScan = data;
  return data;
}

/**
 * Trigger cleanup of unused files
 */
export async function triggerCleanupUnused(filenames?: string[]): Promise<CleanupResult> {
  const res = await fetch('/api/storage/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filenames ? { filenames } : {}),
  });

  if (!res.ok) {
    throw new Error(`Failed to cleanup unused files: ${res.statusText}`);
  }

  return res.json();
}
