/**
 * Node-side image processing core. Backed by sharp.
 *
 * Mirrors the public API surface used by the browser canvas core
 * (`process-core.ts`) so `processImage()` works identically in both
 * environments — devs can dogfood the package the same way the browser
 * UI does, without conditional code paths.
 */

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';

import type { ImageBitsOptions, ImageBitsResult, ImageMetadata } from './types';

/**
 * Anything we know how to turn into bytes for sharp on the Node side.
 *
 * - `string` is interpreted as a filesystem path or a URL (http/https/file).
 * - `Buffer`/`Uint8Array`/`ArrayBuffer` are passed straight to sharp.
 * - `Blob`/`File` (Node 18+ globals) are read via `arrayBuffer()`.
 */
export type NodeImageInput = string | Buffer | Uint8Array | ArrayBuffer | Blob | URL;

type NormalizedFormat = 'webp' | 'avif' | 'png' | 'jpg';

function normalizeRequestedFormat(
  fmt: ImageBitsOptions['format'],
): NormalizedFormat | 'original' {
  if (!fmt || fmt === 'original') return 'original';
  if (fmt === 'jpeg') return 'jpg';
  return fmt as NormalizedFormat;
}

function metaFormatToNormalized(fmt: string | undefined): NormalizedFormat {
  switch (fmt) {
    case 'jpeg':
    case 'jpg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'avif':
    case 'heif':
      return 'avif';
    default:
      return 'png';
  }
}

function formatFromExtension(filePath: string): NormalizedFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
  if (ext === '.png') return 'png';
  if (ext === '.webp') return 'webp';
  if (ext === '.avif') return 'avif';
  return undefined;
}

function applyEncoder(
  pipeline: ReturnType<typeof sharp>,
  format: NormalizedFormat,
  quality: number,
): ReturnType<typeof sharp> {
  const q = Math.round(quality * 100);
  switch (format) {
    case 'webp':
      return pipeline.webp({ quality: q });
    case 'avif':
      return pipeline.avif({ quality: q });
    case 'png':
      return pipeline.png({ compressionLevel: 9, quality: q });
    case 'jpg':
      return pipeline.jpeg({ quality: q, mozjpeg: true });
  }
}

function formatToMime(format: NormalizedFormat): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
  }
}

function looksLikeUrl(s: string): boolean {
  return /^(https?|file):\/\//i.test(s);
}

/**
 * Resolve any supported Node input to a `Buffer` that sharp can accept.
 * Also returns the source name (file basename, URL, or `<input>`) which
 * callers use for default output paths.
 */
async function inputToBuffer(
  input: NodeImageInput,
): Promise<{ buffer: Buffer; sourceName: string; sourcePath?: string }> {
  if (typeof input === 'string') {
    if (looksLikeUrl(input)) {
      const res = await fetch(input);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${input}: ${res.status} ${res.statusText}`);
      }
      const ab = await res.arrayBuffer();
      const url = new URL(input);
      const base = path.basename(url.pathname) || 'image';
      return { buffer: Buffer.from(ab), sourceName: base };
    }
    const resolved = path.resolve(input);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input not found: ${resolved}`);
    }
    return {
      buffer: fs.readFileSync(resolved),
      sourceName: path.basename(resolved),
      sourcePath: resolved,
    };
  }

  if (input instanceof URL) {
    return inputToBuffer(input.toString());
  }

  if (Buffer.isBuffer(input)) {
    return { buffer: input, sourceName: '<buffer>' };
  }

  if (input instanceof Uint8Array) {
    return { buffer: Buffer.from(input), sourceName: '<uint8array>' };
  }

  if (input instanceof ArrayBuffer) {
    return { buffer: Buffer.from(new Uint8Array(input)), sourceName: '<arraybuffer>' };
  }

  // `Blob` (and its subclass `File`) are globals in Node 18+.
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const ab = await input.arrayBuffer();
    const sourceName = (input as File).name || '<blob>';
    return { buffer: Buffer.from(ab), sourceName };
  }

  throw new Error(
    'Unsupported input type. Expected file path, URL, Buffer, Uint8Array, ArrayBuffer, Blob, or File.',
  );
}

/**
 * Process a single image with sharp. Public entry for Node consumers.
 *
 * Returns the same `ImageBitsResult` shape as the browser variant so calling
 * code is portable across environments.
 */
export async function processImageNode(
  input: NodeImageInput,
  options: ImageBitsOptions = {},
): Promise<ImageBitsResult> {
  const { maxDimension, format, quality = 0.92 } = options;
  const { buffer: srcBuffer, sourceName } = await inputToBuffer(input);

  // Privacy guarantee — every output is re-encoded from raw pixels with no
  // metadata copied through:
  //   - sharp's default behavior strips EXIF/IPTC/XMP and the source ICC
  //     profile unless `withMetadata()`/`keepExif()`/`keepIccProfile()` is
  //     called. We never call those.
  //   - `.rotate()` (no arg) reads the EXIF orientation tag, applies the
  //     rotation to the pixel data, then drops the orientation tag itself —
  //     so portraits stay upright but the EXIF bytes still get stripped.
  //   - Anything that could leak (camera model, GPS coordinates, original
  //     capture timestamps, photographer copyright) is gone after this pass.
  // This matches the browser canvas pipeline, which can't preserve metadata
  // by definition.
  let pipeline = sharp(srcBuffer).rotate();
  const meta = await pipeline.metadata();

  if (
    maxDimension &&
    meta.width &&
    meta.height &&
    (meta.width > maxDimension || meta.height > maxDimension)
  ) {
    pipeline = pipeline.resize(maxDimension, maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const requested = normalizeRequestedFormat(format);
  const outFormat: NormalizedFormat =
    requested === 'original' ? metaFormatToNormalized(meta.format) : requested;

  pipeline = applyEncoder(pipeline, outFormat, quality);

  const { data: outBuffer, info } = await pipeline.toBuffer({ resolveWithObject: true });

  const mime = formatToMime(outFormat);
  // Buffer's underlying `.buffer` is typed `ArrayBufferLike` (could be a
  // SharedArrayBuffer slice) which DOM's BlobPart rejects. Slice to a fresh
  // standalone ArrayBuffer once and reuse it for both `blob` and
  // `toArrayBuffer()` so we never allocate twice.
  const arrayBuffer = outBuffer.buffer.slice(
    outBuffer.byteOffset,
    outBuffer.byteOffset + outBuffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mime });
  const base64 = outBuffer.toString('base64');

  const metadata: ImageMetadata = {
    width: info.width,
    height: info.height,
    format: outFormat,
    size: info.size,
    originalSize: srcBuffer.byteLength,
  };

  const result: ImageBitsResult = {
    blob,
    metadata,

    async toDataURL(): Promise<string> {
      return `data:${mime};base64,${base64}`;
    },

    async toArrayBuffer(): Promise<ArrayBuffer> {
      return arrayBuffer;
    },

    download(_filename?: string): void {
      throw new Error(
        'download() is only available in browser environments. ' +
          'In Node, use `result.toArrayBuffer()` + `fs.writeFileSync(...)` or call `processImage(input).then(r => fs.writeFileSync(out, Buffer.from(await r.toArrayBuffer())))`.',
      );
    },
  };

  // Carry the source name as a non-enumerable hint so batch helpers can
  // derive sensible default output paths without changing the public shape.
  Object.defineProperty(result, '__sourceName', {
    value: sourceName,
    enumerable: false,
  });

  return result;
}

/**
 * Concurrency-controlled batch helper. Sequential by default to keep memory
 * predictable; pass `{ concurrency: N }` to parallelize.
 */
export async function processImagesNode(
  inputs: NodeImageInput[],
  options: ImageBitsOptions & { concurrency?: number } = {},
): Promise<ImageBitsResult[]> {
  const { concurrency = 1, ...opts } = options;
  if (inputs.length === 0) return [];
  if (concurrency <= 1) {
    const results: ImageBitsResult[] = [];
    for (const input of inputs) {
      results.push(await processImageNode(input, opts));
    }
    return results;
  }

  const results: ImageBitsResult[] = new Array(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= inputs.length) return;
      results[i] = await processImageNode(inputs[i]!, opts);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Helpers exposed for the CLI and other Node-side callers that need to
 * derive output filenames the same way the lib does.
 */
export const nodeFormatHelpers = {
  formatFromExtension,
  metaFormatToNormalized,
  normalizeRequestedFormat,
  toMime: formatToMime,
  toExtension(format: NormalizedFormat): string {
    return format === 'jpg' ? '.jpg' : `.${format}`;
  },
  /** Convenience for callers that want a file:// URL from a path. */
  pathToFileUrl(p: string): string {
    return pathToFileURL(p).toString();
  },
};

export type { NormalizedFormat };
