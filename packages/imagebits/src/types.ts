/**
 * ImageBits types and options
 */

export type ImageFormat = 'webp' | 'avif' | 'png' | 'jpg' | 'jpeg' | 'original';

export interface ImageBitsOptions {
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

export interface ImageBitsResult {
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

export interface ImageMetadata extends Record<string, unknown> {
  width: number;
  height: number;
  format: string;
  size: number; // bytes
  originalSize?: number;
}

export type AltTextMode = 'off' | 'local';

export interface LocalAltTextOptions {
  /**
   * Caption model identifier for local inference.
   */
  model?: string;
  /**
   * Hard cap for output length.
   */
  maxLength?: number;
}

export interface AltTextResult {
  altText: string;
  warnings: string[];
  model: string;
}

export interface AltTextEntry {
  inputName: string;
  outputName: string;
  width: number;
  height: number;
  altText: string;
  warnings?: string[];
}

export interface AltTextManifest {
  version: 1;
  generatedAt: string;
  generator: {
    mode: 'local';
    provider: 'transformersjs';
    model: string;
  };
  images: AltTextEntry[];
}
