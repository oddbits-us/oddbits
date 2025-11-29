/**
 * Image format conversion processor
 */

import type { ImageFormat } from '../types';
import { formatToMimeType } from '../utils';

export async function convertImage(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number = 0.92
): Promise<Blob> {
  const mimeType = formatToMimeType(format);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Failed to convert image to ${format}`));
        }
      },
      mimeType,
      quality
    );
  });
}

