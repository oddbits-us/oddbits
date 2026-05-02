# @oddbits/imagebits

Simple, flexible image processing: resize, optimize, and convert formats. Perfect for integrating into CMS workflows, build processes, or any project that needs image optimization.

## Installation

```bash
npm install @oddbits/imagebits
```

## CLI (`npx`)

From Node **18+**, you can run the **imagebits** command without installing globally. The CLI uses [sharp](https://sharp.pixelplumbing.com/) under the hood (resize / encode match the library options; browser builds still use Canvas).

```bash
npx @oddbits/imagebits --help
npx @oddbits/imagebits photo.png -o photo.webp -f webp -m 1200 -q 0.9
```

| Option | Description |
|--------|-------------|
| `-m, --max-dimension <px>` | Fit inside this box (aspect preserved; only shrinks larger images) |
| `-f, --format <fmt>` | `webp` \| `avif` \| `png` \| `jpg` \| `original` |
| `-q, --quality <0-1>` | Default `0.92` |
| `-o, --output <path>` | Output file (optional; default is same folder + new extension) |

After `npm install`, the binary is available as `imagebits` (or `pnpm exec imagebits`).

## Quick Start

```typescript
import { processImage } from '@oddbits/imagebits';

// Process an image with simple parameters
const result = await processImage(file, {
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

## API

The `processImage` function is designed for easy integration into workflows, CMS systems, and build processes.

### Parameters

```typescript
processImage(
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
import { processImage } from '@oddbits/imagebits';

// Process uploaded image in CMS
async function handleImageUpload(file: File) {
  const result = await processImage(file, {
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
import { processImage } from '@oddbits/imagebits';
import fs from 'fs';

// Process images during build
async function optimizeImages() {
  const files = fs.readdirSync('./src/images');
  
  for (const file of files) {
    const buffer = fs.readFileSync(`./src/images/${file}`);
    const result = await processImage(buffer, {
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
const result = await processImage('https://example.com/image.jpg', {
  maxDimension: 800,
  format: 'webp'
});
```

## Supported Formats

- **Input**: PNG, JPEG, WebP, AVIF
- **Output**: PNG, JPEG, WebP, AVIF

## Browser vs Node

- **Browser / bundlers**: import from `@oddbits/imagebits` or `@oddbits/imagebits/browser` — uses the Canvas API (`processImage`, drag-and-drop on the site, etc.).
- **Node scripts & CI**: use the **`imagebits` CLI** above (`npx @oddbits/imagebits …`). The programmatic `processImage` API targets browsers (Blob, `File`, DOM); it is not meant for raw filesystem use in Node without a Canvas polyfill.

## License

MIT
