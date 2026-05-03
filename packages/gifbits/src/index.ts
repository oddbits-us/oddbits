/**
 * @oddbits/gifbits — crop / trim / animated encode planning helpers and CLI recipes.
 * Actual ffmpeg (desktop or wasm) runs in the workshop or your own pipeline.
 */

import type { BitInput, BitOutput, BitPlugin } from '@oddbits/core';

import { VERSION } from './version';

export { VERSION } from './version';
export * from './types';
export * from './ffmpeg-plan';
export { buildRasterLottieJson } from './lottie-raster';
export type { RasterLottieFrame } from './lottie-raster';

/**
 * Throwing placeholder — video encode needs ffmpeg (CLI or wasm), not a Blob transform.
 */
export const gifBits: BitPlugin = {
  name: 'gifbits',
  version: VERSION,
  description: 'Plan animated AVIF, WebP, GIF, or PNG-sequence exports from video (ffmpeg)',

  async process(_input: BitInput, options?: unknown): Promise<BitOutput> {
    void options;
    throw new Error(
      'GifBits does not process BitInput blobs directly. Use the browser workshop, run `gifbits recipe` for a desktop ffmpeg command, or wire `describeRecipe()` into your own ffmpeg pipeline.',
    );
  },
};
