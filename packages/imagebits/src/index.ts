/**
 * @oddbits/imagebits
 * Image processing tools: resize, optimize, and convert formats
 * 
 * Simple API for easy integration into workflows, CMS, etc.
 */

import type { BitPlugin, BitInput, BitOutput } from '@oddbits/core';
import type { ImageBitsOptions } from './types';
import { processImage } from './process';

// Export the simple API as the main export
export { processImageSimple } from './simple';
export type { SimpleImageBitsOptions, SimpleImageBitsResult } from './simple';

// Export types
export * from './types';

// BitPlugin interface (for internal use with oddbits ecosystem)
export const imageBits: BitPlugin = {
  name: 'imagebits',
  version: '0.1.0',
  description: 'Image processing: resize, optimize, and convert formats (webp, avif, png, jpg)',

  async process(input: BitInput, options?: ImageBitsOptions): Promise<BitOutput> {
    return processImage(input, options);
  },
};

// Auto-register if in browser context (for oddbits website)
if (typeof window !== 'undefined') {
  import('@oddbits/core').then(({ registerBit }) => {
    registerBit(imageBits);
  });
}

