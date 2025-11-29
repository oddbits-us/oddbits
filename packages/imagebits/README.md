# @oddbits/imagebits

Image processing tools: resize, optimize, and convert formats (webp, avif, png, jpg).

## Installation

```bash
npm install @oddbits/imagebits
```

## Usage

### Basic Example

```typescript
import { imageBits } from '@oddbits/imagebits';

const file = document.querySelector('input[type="file"]').files[0];
const result = await imageBits.process(
  { type: 'file', data: file },
  {
    resize: { width: 800, height: 600, fit: 'contain' },
    convert: { format: 'webp', quality: 0.9 }
  }
);

// result.data is a Blob
const url = URL.createObjectURL(result.data);
```

### Options

```typescript
interface ImageBitsOptions {
  resize?: {
    width?: number;
    height?: number;
    fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
    withoutEnlargement?: boolean;
  };
  optimize?: {
    quality?: number; // 0-1
    progressive?: boolean; // JPEG only
    compressionLevel?: number; // PNG only, 0-9
  };
  convert?: {
    format: 'webp' | 'avif' | 'png' | 'jpg' | 'original';
    quality?: number; // 0-1
  };
}
```

### Supported Formats

- Input: PNG, JPEG, WebP, AVIF
- Output: PNG, JPEG, WebP, AVIF

### Fit Modes

- `contain`: Fit inside dimensions, maintain aspect ratio
- `cover`: Cover entire area, may crop, maintain aspect ratio
- `fill`: Stretch to fill dimensions
- `inside`: Fit inside, don't enlarge
- `outside`: Fit outside, may exceed dimensions

## Web Component

```html
<odd-imagebits></odd-imagebits>
```

The web component provides a drag-and-drop interface with controls for resize, format conversion, and quality adjustment.

