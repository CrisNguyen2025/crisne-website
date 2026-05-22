/**
 * Image Upload Service
 * Handles image uploads to avoid storing large base64 in Notion
 */

export interface UploadResult {
  url: string;
  size: number;
  type: string;
}

/**
 * Convert base64 to blob
 */
function base64ToBlob(base64: string): { blob: Blob; type: string } {
  const parts = base64.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  
  return {
    blob: new Blob([u8arr], { type: mime }),
    type: mime,
  };
}

/**
 * Save base64 image to public folder
 * Returns public URL
 */
export async function uploadBase64Image(base64: string): Promise<UploadResult> {
  try {
    const { blob, type } = base64ToBlob(base64);
    
    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = type.split('/')[1] || 'png';
    const filename = `upload-${timestamp}-${random}.${ext}`;
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', blob, filename);
    
    // Upload to API route
    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    const data = await response.json();
    
    return {
      url: data.url,
      size: blob.size,
      type,
    };
  } catch (error) {
    console.error('Image upload failed:', error);
    throw error;
  }
}

/**
 * Check if content contains base64 images
 */
export function hasBase64Images(html: string): boolean {
  return html.includes('data:image/');
}

/**
 * Extract all base64 images from HTML
 */
export function extractBase64Images(html: string): string[] {
  const regex = /src="(data:image\/[^"]+)"/g;
  const matches: string[] = [];
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    matches.push(match[1]);
  }
  
  return matches;
}

/**
 * Replace base64 images with uploaded URLs
 */
export async function replaceBase64WithUrls(html: string): Promise<string> {
  const base64Images = extractBase64Images(html);
  
  if (base64Images.length === 0) {
    return html;
  }
  
  console.log(`Found ${base64Images.length} base64 images, uploading...`);
  
  let updatedHtml = html;
  
  for (const base64 of base64Images) {
    try {
      const result = await uploadBase64Image(base64);
      updatedHtml = updatedHtml.replace(base64, result.url);
      console.log(`Uploaded image: ${result.url} (${(result.size / 1024).toFixed(2)}KB)`);
    } catch (error) {
      console.error('Failed to upload image:', error);
      // Keep base64 if upload fails
    }
  }
  
  return updatedHtml;
}

/**
 * Estimate content size after base64 conversion
 */
export function estimateContentSize(html: string): {
  totalSize: number;
  base64Size: number;
  textSize: number;
  imageCount: number;
} {
  const base64Images = extractBase64Images(html);
  const base64Size = base64Images.reduce((sum, img) => sum + img.length, 0);
  const textSize = html.length - base64Size;
  
  return {
    totalSize: html.length,
    base64Size,
    textSize,
    imageCount: base64Images.length,
  };
}
