/**
 * ImageBits types and options
 */

export type ImageFormat = 'webp' | 'avif' | 'png' | 'jpg' | 'jpeg' | 'original';

export type FitMode = 'contain' | 'cover' | 'fill' | 'inside' | 'outside';

export interface ResizeOptions {
  width?: number;
  height?: number;
  fit?: FitMode;
  withoutEnlargement?: boolean;
}

export interface OptimizeOptions {
  quality?: number; // 0-100
  progressive?: boolean; // For JPEG
  compressionLevel?: number; // For PNG, 0-9
}

export interface ConvertOptions {
  format: ImageFormat;
  quality?: number;
}

export interface ImageBitsOptions {
  resize?: ResizeOptions;
  optimize?: OptimizeOptions;
  convert?: ConvertOptions;
}

export interface ImageMetadata extends Record<string, unknown> {
  width: number;
  height: number;
  format: string;
  size: number; // bytes
  originalSize?: number;
}

