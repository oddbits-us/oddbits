/**
 * @oddbits/imagebits
 * Image processing tools: resize, optimize, and convert formats
 * 
 * Simple API for easy integration into workflows, CMS, etc.
 */

import type { BitPlugin, BitInput, BitOutput } from '@oddbits/core';
import type { ImageBitsOptions, ImageBitsResult } from './types';
import { processImage as processImageCore } from './process-core';
export {
  buildAltTextManifest,
  generateLocalAltTextFromBlob,
  generateLocalAltTextFromPath,
  stringifyAltTextManifest,
} from './alt-text';

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
 * const result = await processImage(file, {
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
export async function processImage(
  input: File | Blob | ArrayBuffer | string,
  options: ImageBitsOptions = {}
): Promise<ImageBitsResult> {
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

  // Process the image
  const result = await processImageCore(bitInput, { maxDimension, format, quality });

  const blob = result.data as Blob;
  const metadata = result.metadata as any;

  // Return result with helper methods
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

// Export types
export * from './types';

// BitPlugin interface (for internal use with oddbits ecosystem)
export const imageBits: BitPlugin = {
  name: 'imagebits',
  version: '0.1.0',
  description: 'Image processing: resize, optimize, and convert formats (webp, avif, png, jpg)',

  async process(input: BitInput, options?: any): Promise<BitOutput> {
    // Convert BitInput to simple input format
    let simpleInput: File | Blob | ArrayBuffer | string;
    if (input.type === 'file') {
      simpleInput = input.data as File;
    } else if (input.type === 'buffer') {
      simpleInput = input.data as ArrayBuffer;
    } else if (input.type === 'url') {
      simpleInput = input.data as string;
    } else {
      throw new Error('Invalid input type');
    }

    const result = await processImage(simpleInput, options);
    return {
      data: result.blob,
      metadata: result.metadata,
    };
  },
};

// Auto-register if in browser context (for oddbits website)
if (typeof window !== 'undefined') {
  import('@oddbits/core').then(({ registerBit }) => {
    registerBit(imageBits);
  });
}
