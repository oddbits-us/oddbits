/**
 * Shared types for crop / trim / encode planning (browser workshop + Node CLI recipes).
 */

/** Target aspect for center-crop before scaling. */
export type CropRatio = '16:9' | '1:1' | '9:16';

/** Animated raster formats supported by the workshop and CLI (ffmpeg). */
export type AnimatedExportFormat = 'avif' | 'webp' | 'gif' | 'image-sequence';

export type GifBitsEncodePlan = {
  cropRatio: CropRatio;
  /** Seconds from start of source file. */
  trimStart: number;
  /** Seconds from start of source file (exclusive end). */
  trimEnd: number;
  /** 1–100; drives resolution + lossy encoder settings (not frame rate). */
  quality: number;
  /** Frames per second after crop/scale (`fps` filter). Typically 8–24; clamped 1–60. */
  fps: number;
  format: AnimatedExportFormat;
};

/** Resolved numeric encoding parameters derived from quality (resolution / codecs only). */
export type ResolvedEncodeParams = {
  shortSide: number;
  /** libwebp -q:v roughly 0–100 */
  webpQ: number;
  /** GIF palette size (power of 2, capped) */
  gifColors: number;
  /** libaom-av1 -crf (lower = better quality; typical ~20–55) */
  avifCrf: number;
};
