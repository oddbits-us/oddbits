/**
 * Browser entry — same surface as Node (`src/index.ts`) without pulling Node-only CLI code.
 */

export { VERSION } from './version';
export * from './types';
export * from './ffmpeg-plan';
export { buildRasterLottieJson } from './lottie-raster';
export type { RasterLottieFrame } from './lottie-raster';
