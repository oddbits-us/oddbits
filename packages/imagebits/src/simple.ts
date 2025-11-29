/**
 * Simple API for @oddbits/imagebits
 * Easy-to-use function for integrating into workflows, CMS, etc.
 */

import type { ImageFormat } from './types';
import { processImage } from './process';

export interface SimpleImageBitsOptions {
  /**
   * Maximum dimension (width or height) in pixels.
   * Image will be resized to fit within this dimension while maintaining aspect ratio.
   */
  maxDimension?: number;
  
  /**
   * Output format. If not specified, keeps original format.
   */
  format?: ImageFormat;
  
  /**
   * Quality (0-1). Default: 0.92
   */
  quality?: number;
}

export interface SimpleImageBitsResult {
  /**
   * Processed image as Blob
   */
  blob: Blob;
  
  /**
   * Image metadata
   */
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number; // bytes
    originalSize?: number;
  };
  
  /**
   * Get the processed image as a data URL
   */
  toDataURL(): Promise<string>;
  
  /**
   * Get the processed image as an ArrayBuffer
   */
  toArrayBuffer(): Promise<ArrayBuffer>;
  
  /**
   * Download the image (browser only)
   */
  download(filename?: string): void;
}

/**
 * Process an image with simple parameters
 * 
 * @param input - Image file, Blob, ArrayBuffer, or URL string
 * @param options - Processing options
 * @returns Processed image result
 * 
 * @example
 * ```typescript
 * // Simple resize and convert
 * const result = await processImageSimple(file, {
 *   maxDimension: 800,
 *   format: 'webp',
 *   quality: 0.9
 * });
 * 
 * // Use the result
 * const url = await result.toDataURL();
 * // or
 * result.download('processed.webp');
 * ```
 */
export async function processImageSimple(
  input: File | Blob | ArrayBuffer | string,
  options: SimpleImageBitsOptions = {}
): Promise<SimpleImageBitsResult> {
  const { maxDimension, format, quality = 0.92 } = options;

  // Convert input to BitInput format
  let bitInput: { type: 'file' | 'url' | 'buffer'; data: File | string | ArrayBuffer };
  
  if (input instanceof File) {
    bitInput = { type: 'file', data: input };
  } else if (input instanceof Blob) {
    // Convert Blob to File - create a File from Blob
    const file = new File([input], 'image', { type: input.type || 'image/png' });
    bitInput = { type: 'file', data: file };
  } else if (input instanceof ArrayBuffer) {
    bitInput = { type: 'buffer', data: input };
  } else if (typeof input === 'string') {
    bitInput = { type: 'url', data: input };
  } else {
    throw new Error('Invalid input type. Expected File, Blob, ArrayBuffer, or URL string.');
  }

  // Build options - maxDimension is handled directly in processImage
  const processOptions: any = {};
  
  if (format && format !== 'original') {
    processOptions.convert = {
      format,
      quality,
    };
  } else if (quality !== undefined) {
    processOptions.optimize = {
      quality,
    };
  }

  // Process the image
  const result = await processImage(bitInput, processOptions, maxDimension);

  const blob = result.data as Blob;
  const metadata = result.metadata as any;

  // Return simple result with helper methods
  return {
    blob,
    metadata,
    
    async toDataURL(): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
    
    async toArrayBuffer(): Promise<ArrayBuffer> {
      return blob.arrayBuffer();
    },
    
    download(filename?: string): void {
      if (typeof window === 'undefined') {
        throw new Error('Download is only available in browser environments');
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `image.${metadata.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

