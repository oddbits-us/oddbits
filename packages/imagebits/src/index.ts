/**
 * @oddbits/imagebits — Node entry
 *
 * Public API for Node consumers (build scripts, CMS workers, CLIs, server-side
 * processors). Backed by sharp.
 *
 * Browser consumers receive `src/browser.ts` automatically via the `browser`
 * field in package.json. Both entries expose the same names so calling code
 * is portable.
 */

import type { BitInput, BitOutput, BitPlugin } from '@oddbits/core';

import {
  type NodeImageInput,
  processImageNode,
  processImagesNode,
} from './process-core-node';
import type { ImageBitsOptions, ImageBitsResult } from './types';
import { VERSION } from './version';

export { VERSION } from './version';
export {
  buildAltTextManifest,
  generateLocalAltTextFromBlob,
  generateLocalAltTextFromPath,
  stringifyAltTextManifest,
} from './alt-text';
export * from './types';
export type { NodeImageInput } from './process-core-node';
export { nodeFormatHelpers } from './process-core-node';

/**
 * Process a single image. Accepts a file path, URL, Buffer, Uint8Array,
 * ArrayBuffer, Blob, or File.
 *
 * @example
 * ```ts
 * import fs from 'node:fs';
 * import { processImage } from '@oddbits/imagebits';
 *
 * const result = await processImage('./photo.png', {
 *   maxDimension: 1200,
 *   format: 'webp',
 *   quality: 0.9,
 * });
 * fs.writeFileSync('./photo.webp', Buffer.from(await result.toArrayBuffer()));
 * ```
 */
export async function processImage(
  input: NodeImageInput,
  options: ImageBitsOptions = {},
): Promise<ImageBitsResult> {
  return processImageNode(input, options);
}

/**
 * Process many images with the same options. Sequential by default; pass
 * `{ concurrency: N }` to parallelize. Returns results in input order.
 *
 * @example
 * ```ts
 * const results = await processImages(['a.png', 'b.png', 'c.png'], {
 *   maxDimension: 1080, format: 'webp', concurrency: 4,
 * });
 * ```
 */
export async function processImages(
  inputs: NodeImageInput[],
  options: ImageBitsOptions & { concurrency?: number } = {},
): Promise<ImageBitsResult[]> {
  return processImagesNode(inputs, options);
}

/**
 * `BitPlugin` interface (used by the `@oddbits/core` plugin registry). Works
 * in both Node and browser; this entry uses the Node sharp pipeline.
 */
export const imageBits: BitPlugin = {
  name: 'imagebits',
  version: VERSION,
  description:
    'Image processing: resize, optimize, and convert formats (webp, avif, png, jpg)',

  async process(input: BitInput, options?: ImageBitsOptions): Promise<BitOutput> {
    let nodeInput: NodeImageInput;
    if (input.type === 'file') {
      nodeInput = input.data as Blob | File;
    } else if (input.type === 'buffer') {
      nodeInput = input.data as ArrayBuffer;
    } else if (input.type === 'url') {
      nodeInput = input.data as string;
    } else {
      throw new Error(`Unsupported input type for imagebits Node plugin: ${input.type}`);
    }

    const result = await processImageNode(nodeInput, options ?? {});
    return {
      data: result.blob,
      metadata: result.metadata,
    };
  },
};

// Note: no `if (typeof window !== 'undefined')` auto-register here; the Node
// entry is for server-side use. The browser entry handles registration with
// the BitRegistry on its own.
