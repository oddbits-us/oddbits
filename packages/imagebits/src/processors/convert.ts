/**
 * Image format conversion processor
 */

import type { ConvertOptions } from '../types';
import { formatToMimeType } from '../utils';

export async function convertImage(
  canvas: HTMLCanvasElement,
  options: ConvertOptions
): Promise<Blob> {
  const { format, quality = 0.92 } = options;
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

