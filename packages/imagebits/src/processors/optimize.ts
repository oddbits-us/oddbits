/**
 * Image optimization processor
 */

import type { OptimizeOptions } from '../types';

export async function optimizeImage(
  canvas: HTMLCanvasElement,
  format: string,
  options: OptimizeOptions = {}
): Promise<Blob> {
  const {
    quality = 0.92,
    progressive = false,
    compressionLevel = 6,
  } = options;

  const mimeType = format === 'jpg' || format === 'jpeg' 
    ? 'image/jpeg' 
    : format === 'png'
    ? 'image/png'
    : format === 'webp'
    ? 'image/webp'
    : format === 'avif'
    ? 'image/avif'
    : 'image/png';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      mimeType,
      quality
    );
  });
}

