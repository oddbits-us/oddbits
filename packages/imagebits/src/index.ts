/**
 * @oddbits/imagebits
 * Image processing tools: resize, optimize, and convert formats
 */

import type { BitPlugin, BitInput, BitOutput } from '@oddbits/core';
import type { ImageBitsOptions, ImageMetadata } from './types';
import { inputToImage, getImageFormat, formatToMimeType } from './utils';
import { resizeImage } from './processors/resize';
import { optimizeImage } from './processors/optimize';
import { convertImage } from './processors/convert';

export const imageBits: BitPlugin = {
  name: 'imagebits',
  version: '0.1.0',
  description: 'Image processing: resize, optimize, and convert formats (webp, avif, png, jpg)',

  async process(input: BitInput, options?: ImageBitsOptions): Promise<BitOutput> {
    const logs: string[] = [];
    const startTime = performance.now();

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

      // Resize if needed
      if (options?.resize) {
        resizeImage(image, canvas, options.resize);
        logs.push(`Resized to: ${canvas.width}x${canvas.height}`);
      } else {
        canvas.width = originalWidth;
        canvas.height = originalHeight;
        ctx.drawImage(image, 0, 0);
      }

      // Determine output format
      const outputFormat = options?.convert?.format || originalFormat;
      const finalFormat = outputFormat === 'original' ? originalFormat : outputFormat;

      // Convert/optimize
      let blob: Blob;
      if (options?.convert && outputFormat !== 'original') {
        blob = await convertImage(canvas, {
          format: finalFormat as any,
          quality: options.convert.quality || options.optimize?.quality,
        });
        logs.push(`Converted to: ${finalFormat}`);
      } else if (options?.optimize) {
        blob = await optimizeImage(canvas, finalFormat, options.optimize);
        logs.push(`Optimized: ${finalFormat}`);
      } else {
        blob = await optimizeImage(canvas, finalFormat, { quality: 1.0 });
      }

      const processingTime = ((performance.now() - startTime) / 1000).toFixed(2);
      logs.push(`Processing completed in ${processingTime}s`);

      const metadata: ImageMetadata = {
        width: canvas.width,
        height: canvas.height,
        format: finalFormat,
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
  },
};

// Auto-register if in browser context
if (typeof window !== 'undefined') {
  import('@oddbits/core').then(({ registerBit }) => {
    registerBit(imageBits);
  });
}

export * from './types';
export { inputToImage, getImageFormat, formatToMimeType } from './utils';

