/**
 * Utility functions for image processing
 */

import type { BitInput } from '@oddbits/core';

/**
 * Convert various input types to a File or ImageBitmap
 */
export async function inputToImage(input: BitInput): Promise<HTMLImageElement> {
  let imageUrl: string;

  if (input.type === 'file' && input.data instanceof File) {
    imageUrl = URL.createObjectURL(input.data);
  } else if (input.type === 'url' && typeof input.data === 'string') {
    imageUrl = input.data;
  } else if (input.type === 'base64' && typeof input.data === 'string') {
    imageUrl = input.data.startsWith('data:') 
      ? input.data 
      : `data:image/png;base64,${input.data}`;
  } else if (input.type === 'buffer' && input.data instanceof ArrayBuffer) {
    const blob = new Blob([input.data]);
    imageUrl = URL.createObjectURL(blob);
  } else {
    throw new Error(`Unsupported input type: ${input.type}`);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (input.type === 'file' || input.type === 'buffer') {
        URL.revokeObjectURL(imageUrl);
      }
      resolve(img);
    };
    img.onerror = () => {
      if (input.type === 'file' || input.type === 'buffer') {
        URL.revokeObjectURL(imageUrl);
      }
      reject(new Error('Failed to load image'));
    };
    img.src = imageUrl;
  });
}

/**
 * Get image format from MIME type or file extension
 */
export function getImageFormat(mimeType?: string, filename?: string): string {
  if (mimeType) {
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('avif')) return 'avif';
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  }
  
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'webp') return 'webp';
    if (ext === 'avif') return 'avif';
    if (ext === 'png') return 'png';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  }
  
  return 'png'; // default
}

/**
 * Get MIME type from format
 */
export function formatToMimeType(format: string): string {
  switch (format.toLowerCase()) {
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'image/png';
  }
}

