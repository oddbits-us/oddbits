/**
 * @oddbits/imagebits — browser entry
 *
 * Public API for browser consumers (web apps, web components, anything bundled
 * for `window`). Backed by Canvas/Image. The web component in `apps/web` and
 * any other browser bundler resolves this entry via the `browser` field in
 * package.json.
 *
 * Mirrors the Node entry's API surface (`processImage`, `processImages`,
 * `imageBits` plugin) so calling code is portable across environments.
 */

import type { BitInput, BitOutput, BitPlugin } from '@oddbits/core';

import { processImage as processImageCore } from './process-core';
import type { ImageBitsOptions, ImageBitsResult, ImageMetadata } from './types';
import { VERSION } from './version';

export { VERSION } from './version';
export {
  buildAltTextManifest,
  generateLocalAltTextFromBlob,
  stringifyAltTextManifest,
} from './alt-text';
export * from './types';

/**
 * Inputs accepted by the browser `processImage`. Mirrors the original
 * pre-Node API so existing browser callers keep working.
 */
export type BrowserImageInput = File | Blob | ArrayBuffer | string;

function buildResult(blob: Blob, metadata: ImageMetadata): ImageBitsResult {
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
        throw new Error('download() is only available in browser environments.');
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

/**
 * Process a single image in the browser using the Canvas API. Accepts a File,
 * Blob, ArrayBuffer, or URL string.
 */
export async function processImage(
  input: BrowserImageInput,
  options: ImageBitsOptions = {},
): Promise<ImageBitsResult> {
  let bitInput: BitInput;
  if (input instanceof File) {
    bitInput = { type: 'file', data: input };
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    bitInput = { type: 'file', data: new File([input], 'image', { type: input.type || 'image/png' }) };
  } else if (input instanceof ArrayBuffer) {
    bitInput = { type: 'buffer', data: input };
  } else if (typeof input === 'string') {
    bitInput = { type: 'url', data: input };
  } else {
    throw new Error('Invalid input type. Expected File, Blob, ArrayBuffer, or URL string.');
  }

  const out = await processImageCore(bitInput, options);
  return buildResult(out.data as Blob, out.metadata as ImageMetadata);
}

/**
 * Process many images with the same options. Sequential by default; pass
 * `{ concurrency: N }` to parallelize. Browser parity for the Node helper.
 */
export async function processImages(
  inputs: BrowserImageInput[],
  options: ImageBitsOptions & { concurrency?: number } = {},
): Promise<ImageBitsResult[]> {
  const { concurrency = 1, ...opts } = options;
  if (inputs.length === 0) return [];
  if (concurrency <= 1) {
    const results: ImageBitsResult[] = [];
    for (const input of inputs) {
      results.push(await processImage(input, opts));
    }
    return results;
  }

  const results: ImageBitsResult[] = new Array(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= inputs.length) return;
      results[i] = await processImage(inputs[i]!, opts);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * `BitPlugin` interface — browser variant. Uses the canvas pipeline so the
 * registered bit Just Works without dragging sharp into the bundle.
 */
export const imageBits: BitPlugin = {
  name: 'imagebits',
  version: VERSION,
  description:
    'Image processing: resize, optimize, and convert formats (webp, avif, png, jpg)',

  async process(input: BitInput, options?: ImageBitsOptions): Promise<BitOutput> {
    const out = await processImageCore(input, options ?? {});
    return { data: out.data as Blob, metadata: out.metadata };
  },
};

// Auto-register if running in a browser context (matches the original
// behavior so `apps/web` keeps picking up the bit on import).
if (typeof window !== 'undefined') {
  void import('@oddbits/core').then(({ registerBit }) => {
    registerBit(imageBits);
  });
}
