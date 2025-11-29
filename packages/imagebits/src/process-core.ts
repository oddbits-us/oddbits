/**
 * Core image processing function
 * Used by both the public API and the BitPlugin interface
 */

import type { BitInput, BitOutput } from '@oddbits/core';
import type { ImageBitsOptions, ImageMetadata } from './types';
import { inputToImage, getImageFormat, formatToMimeType } from './utils';
import { resizeImage, calculateDimensions } from './processors/resize';
import { optimizeImage } from './processors/optimize';
import { convertImage } from './processors/convert';

/**
 * Process an image with the given options
 */
export async function processImage(
  input: BitInput,
  options: ImageBitsOptions = {}
): Promise<BitOutput> {
  const { maxDimension, format, quality = 0.92 } = options;
  const logs: string[] = [];
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    // Load image
    const image = await inputToImage(input);
    const originalWidth = image.width;
    const originalHeight = image.height;
    const originalFormat = input.data instanceof File
      ? getImageFormat(input.data.type, input.data.name)
      : getImageFormat();

    logs.push(`Loaded image: ${originalWidth}x${originalHeight} (${originalFormat})`);

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not supported');
    }

    // Handle maxDimension - resize if image is larger
    if (maxDimension && (originalWidth > maxDimension || originalHeight > maxDimension)) {
      if (originalWidth > originalHeight) {
        resizeImage(image, canvas, { width: maxDimension, fit: 'inside', withoutEnlargement: true });
      } else {
        resizeImage(image, canvas, { height: maxDimension, fit: 'inside', withoutEnlargement: true });
      }
      logs.push(`Resized to: ${canvas.width}x${canvas.height}`);
    } else {
      canvas.width = originalWidth;
      canvas.height = originalHeight;
      ctx.drawImage(image, 0, 0);
    }

    // Determine output format
    const outputFormat = format && format !== 'original' ? format : originalFormat;

    // Convert/optimize
    let blob: Blob;
    if (format && format !== 'original') {
      blob = await convertImage(canvas, outputFormat as any, quality);
      logs.push(`Converted to: ${outputFormat}`);
    } else {
      blob = await optimizeImage(canvas, outputFormat, { quality });
      logs.push(`Optimized: ${outputFormat}`);
    }

    const processingTime = typeof performance !== 'undefined'
      ? ((performance.now() - startTime) / 1000).toFixed(2)
      : ((Date.now() - startTime) / 1000).toFixed(2);
    logs.push(`Processing completed in ${processingTime}s`);

    const metadata: ImageMetadata = {
      width: canvas.width,
      height: canvas.height,
      format: outputFormat,
      size: blob.size,
      originalSize: input.data instanceof File ? input.data.size : undefined,
    };

    return {
      data: blob,
      metadata,
      logs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`Error: ${errorMessage}`);
    throw new Error(`ImageBits processing failed: ${errorMessage}`);
  }
}

