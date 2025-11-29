/**
 * Image resizing processor
 */

import type { ResizeOptions } from '../types';

export function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  options: ResizeOptions
): { width: number; height: number } {
  const { width, height, fit = 'contain', withoutEnlargement = false } = options;

  // If no dimensions specified, return original
  if (!width && !height) {
    return { width: originalWidth, height: originalHeight };
  }

  // If only one dimension specified, maintain aspect ratio
  if (width && !height) {
    const aspectRatio = originalHeight / originalWidth;
    return {
      width: withoutEnlargement ? Math.min(width, originalWidth) : width,
      height: Math.round((withoutEnlargement ? Math.min(width, originalWidth) : width) * aspectRatio),
    };
  }

  if (height && !width) {
    const aspectRatio = originalWidth / originalHeight;
    return {
      width: Math.round((withoutEnlargement ? Math.min(height, originalHeight) : height) * aspectRatio),
      height: withoutEnlargement ? Math.min(height, originalHeight) : height,
    };
  }

  // Both dimensions specified - apply fit mode
  const aspectRatio = originalWidth / originalHeight;
  const targetAspectRatio = width! / height!;

  switch (fit) {
    case 'cover':
      // Cover entire area, may crop
      if (aspectRatio > targetAspectRatio) {
        return {
          width: width!,
          height: Math.round(width! / aspectRatio),
        };
      } else {
        return {
          width: Math.round(height! * aspectRatio),
          height: height!,
        };
      }

    case 'contain':
      // Fit inside, maintain aspect ratio
      if (aspectRatio > targetAspectRatio) {
        return {
          width: width!,
          height: Math.round(width! / aspectRatio),
        };
      } else {
        return {
          width: Math.round(height! * aspectRatio),
          height: height!,
        };
      }

    case 'fill':
      // Stretch to fill
      return {
        width: width!,
        height: height!,
      };

    case 'inside':
      // Fit inside, don't enlarge
      const maxWidth = withoutEnlargement ? Math.min(width!, originalWidth) : width!;
      const maxHeight = withoutEnlargement ? Math.min(height!, originalHeight) : height!;
      if (aspectRatio > maxWidth / maxHeight) {
        return {
          width: maxWidth,
          height: Math.round(maxWidth / aspectRatio),
        };
      } else {
        return {
          width: Math.round(maxHeight * aspectRatio),
          height: maxHeight,
        };
      }

    case 'outside':
      // Fit outside, may exceed dimensions
      if (aspectRatio > targetAspectRatio) {
        return {
          width: Math.round(height! * aspectRatio),
          height: height!,
        };
      } else {
        return {
          width: width!,
          height: Math.round(width! / aspectRatio),
        };
      }

    default:
      return { width: width!, height: height! };
  }
}

export function resizeImage(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  options: ResizeOptions
): void {
  const { width: originalWidth, height: originalHeight } = image;
  const { width, height } = calculateDimensions(originalWidth, originalHeight, options);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // For 'cover' mode, we need to crop
  if (options.fit === 'cover' && options.width && options.height) {
    const scale = Math.max(
      options.width / originalWidth,
      options.height / originalHeight
    );
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;
    const x = (options.width - scaledWidth) / 2;
    const y = (options.height - scaledHeight) / 2;

    ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
  } else {
    ctx.drawImage(image, 0, 0, width, height);
  }
}

