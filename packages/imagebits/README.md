# @oddbits/imagebits

Simple, flexible image processing: resize, optimize, and convert formats. Perfect for integrating into CMS workflows, build processes, or any project that needs image optimization.

## Installation

```bash
npm install @oddbits/imagebits
```

## Quick Start

```typescript
import { processImageSimple } from '@oddbits/imagebits';

// Process an image with simple parameters
const result = await processImageSimple(file, {
  maxDimension: 800,  // Max width or height in pixels
  format: 'webp',     // Output format
  quality: 0.9        // Quality (0-1)
});

// Use the result
const dataUrl = await result.toDataURL();
// or
const buffer = await result.toArrayBuffer();
// or download (browser only)
result.download('optimized.webp');
```

## Simple API

The `processImageSimple` function is designed for easy integration into workflows, CMS systems, and build processes.

### Parameters

```typescript
processImageSimple(
  input: File | Blob | ArrayBuffer | string,  // Image input
  options?: {
    maxDimension?: number;    // Max width/height in pixels (maintains aspect ratio)
    format?: 'webp' | 'avif' | 'png' | 'jpg' | 'original';
    quality?: number;         // 0-1, default: 0.92
  }
)
```

### Return Value

```typescript
{
  blob: Blob;                    // Processed image
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;                // Size in bytes
    originalSize?: number;
  };
  toDataURL(): Promise<string>;  // Get as data URL
  toArrayBuffer(): Promise<ArrayBuffer>;  // Get as buffer
  download(filename?: string): void;  // Download (browser only)
}
```

## Examples

### CMS Integration

```typescript
import { processImageSimple } from '@oddbits/imagebits';

// Process uploaded image in CMS
async function handleImageUpload(file: File) {
  const result = await processImageSimple(file, {
    maxDimension: 1200,
    format: 'webp',
    quality: 0.85
  });
  
  // Upload to your storage
  const buffer = await result.toArrayBuffer();
  await uploadToStorage(buffer, `images/${file.name}.webp`);
  
  return {
    url: await result.toDataURL(),
    metadata: result.metadata
  };
}
```

### Build Process

```typescript
import { processImageSimple } from '@oddbits/imagebits';
import fs from 'fs';

// Process images during build
async function optimizeImages() {
  const files = fs.readdirSync('./src/images');
  
  for (const file of files) {
    const buffer = fs.readFileSync(`./src/images/${file}`);
    const result = await processImageSimple(buffer, {
      maxDimension: 1920,
      format: 'webp',
      quality: 0.9
    });
    
    const outputBuffer = await result.toArrayBuffer();
    fs.writeFileSync(`./dist/images/${file}.webp`, Buffer.from(outputBuffer));
  }
}
```

### URL Processing

```typescript
// Process image from URL
const result = await processImageSimple('https://example.com/image.jpg', {
  maxDimension: 800,
  format: 'webp'
});
```

## Advanced API

For more control, you can use the full `ImageBitsOptions` interface:

```typescript
import { imageBits } from '@oddbits/imagebits';

const result = await imageBits.process(
  { type: 'file', data: file },
  {
    resize: {
      width: 800,
      height: 600,
      fit: 'contain',  // 'contain' | 'cover' | 'fill' | 'inside' | 'outside'
      withoutEnlargement: true
    },
    convert: {
      format: 'webp',
      quality: 0.9
    }
  }
);
```

## Supported Formats

- **Input**: PNG, JPEG, WebP, AVIF
- **Output**: PNG, JPEG, WebP, AVIF

## Browser Support

Requires a modern browser with Canvas API support. For Node.js environments, consider using a headless browser or a Node.js-specific image processing library.

## License

MIT
