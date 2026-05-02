# @oddbits/imagebits

Image processing for both Node and the browser: resize, optimize, convert formats, and (optionally) generate alt text — all behind one tiny API. The Node build is backed by [sharp](https://sharp.pixelplumbing.com/); the browser build uses the Canvas API. **Same exports either way** — bundlers auto-pick the right one via the `browser` field in `package.json`.

```bash
npm install @oddbits/imagebits
# or
pnpm add @oddbits/imagebits
```

## Quick start (Node)

```ts
import fs from 'node:fs';
import { processImage } from '@oddbits/imagebits';

const result = await processImage('./photo.png', {
  maxDimension: 1200,
  format: 'webp',
  quality: 0.9,
});

fs.writeFileSync('./photo.webp', Buffer.from(await result.toArrayBuffer()));
console.log(result.metadata);
// { width: 1200, height: 800, format: 'webp', size: 84231, originalSize: 412903 }
```

## Quick start (browser)

```ts
import { processImage } from '@oddbits/imagebits';

const result = await processImage(file, {
  maxDimension: 1080,
  format: 'webp',
  quality: 0.9,
});

const url = await result.toDataURL();
result.download('photo.webp');
```

The two snippets call **the same `processImage` name with the same options**. The bundler (Vite, webpack, Rollup, esbuild, Parcel) sees the `browser` field in `package.json` and substitutes the canvas build automatically — no env-detect logic in your code, no sharp in the browser bundle.

## Bulk

```ts
import { processImages } from '@oddbits/imagebits';

const results = await processImages(['a.png', 'b.png', 'c.png'], {
  maxDimension: 1080,
  format: 'webp',
  concurrency: 4, // sequential by default; bump for parallelism
});
```

## CLI (`npx`)

The same `processImages` engine powers the CLI. Shell globs (`*.png`) work out of the box; pass a directory plus `-r` for recursive walks; combine with `--alt-text` for a manifest, and `--zip` to bundle the lot into one archive.

```bash
# single image
npx @oddbits/imagebits photo.png -o photo.webp -f webp -m 1200 -q 0.9

# bulk via shell glob, output to a directory
npx @oddbits/imagebits *.png -f webp -o ./out/

# walk a directory tree, preserving subfolder layout
npx @oddbits/imagebits ./src/images -r -f webp -o ./dist/images/

# bulk + local alt-text manifest
npx @oddbits/imagebits ./photos -r --alt-text local --alt-json ./photos/alt-text.json

# bulk + manifest, all packed into a single zip artifact
npx @oddbits/imagebits ./photos -r -f webp --alt-text local --zip ./photos.zip

# parallel, keep stdout quiet
npx @oddbits/imagebits ./photos -r -f webp --concurrency 8 --quiet
```

| Option | Description |
|--------|-------------|
| `-m, --max-dimension <px>` | Fit inside this box (aspect preserved; only shrinks larger images) |
| `-f, --format <fmt>` | `webp` \| `avif` \| `png` \| `jpg` \| `original` |
| `-q, --quality <0-1>` | Default `0.92` |
| `-r, --recursive` | Recurse into subdirectories when an input is a directory |
| `-o, --output <path>` | File (single input) or directory (multiple inputs); default writes next to source |
| `--alt-text <mode>` | `off` \| `local` (local captioning, no API keys) |
| `--alt-json <path>` | Combined manifest output path (default: `alt-text.json` next to first output) |
| `--alt-model <id>` | Override the local caption model |
| `--zip <path>` | Bundle outputs + manifest into a single `.zip` |
| `--concurrency <n>` | Parallelism (default `1`) |
| `--quiet` | Minimal output |
| `-v, --version` | Print the package version |

After `npm install` the binary is also available as `imagebits` (or `pnpm exec imagebits`).

## API

### `processImage(input, options?)`

```ts
processImage(
  input:
    | string         // file path (Node) or URL (Node + browser)
    | Buffer         // Node
    | Uint8Array     // Node
    | ArrayBuffer    // Node + browser
    | Blob           // Node 18+ + browser
    | File,          // browser
  options?: {
    maxDimension?: number;   // px; only shrinks larger images
    format?: 'webp' | 'avif' | 'png' | 'jpg' | 'original';
    quality?: number;        // 0-1, default 0.92
  },
): Promise<ImageBitsResult>
```

### `ImageBitsResult`

```ts
{
  blob: Blob;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;          // output bytes
    originalSize?: number; // input bytes (when known)
  };
  toDataURL(): Promise<string>;
  toArrayBuffer(): Promise<ArrayBuffer>;
  download(filename?: string): void; // browser only; throws in Node
}
```

### `processImages(inputs, options?)`

```ts
processImages(
  inputs: NodeImageInput[] | BrowserImageInput[],
  options?: ImageBitsOptions & { concurrency?: number },
): Promise<ImageBitsResult[]>
```

### Local alt text

```ts
import {
  buildAltTextManifest,
  generateLocalAltTextFromBlob,    // Node + browser
  generateLocalAltTextFromPath,    // Node only
  stringifyAltTextManifest,
} from '@oddbits/imagebits';

const local = await generateLocalAltTextFromBlob(result.blob);
const manifest = buildAltTextManifest(
  [
    {
      inputName: 'photo.png',
      outputName: 'photo.webp',
      width: result.metadata.width,
      height: result.metadata.height,
      altText: local.altText,
    },
  ],
  local.model,
);
```

The alt-text path is **local-only** — no API keys, no third-party endpoints. It uses [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) with the small `Xenova/vit-gpt2-image-captioning` model by default; pass `{ model: 'your/model-id' }` to override.

## Examples

### Build-step optimization

```ts
import fs from 'node:fs';
import path from 'node:path';
import { processImages } from '@oddbits/imagebits';

const inputs = fs
  .readdirSync('./src/images')
  .filter((f) => /\.(png|jpe?g)$/i.test(f))
  .map((f) => path.join('./src/images', f));

const results = await processImages(inputs, {
  maxDimension: 1920,
  format: 'webp',
  quality: 0.9,
  concurrency: 4,
});

fs.mkdirSync('./dist/images', { recursive: true });
for (let i = 0; i < inputs.length; i++) {
  const out = path.join('./dist/images', `${path.basename(inputs[i], path.extname(inputs[i]))}.webp`);
  fs.writeFileSync(out, Buffer.from(await results[i].toArrayBuffer()));
}
```

### CMS upload handler

```ts
import { processImage } from '@oddbits/imagebits';

async function handleUpload(file: File) {
  const result = await processImage(file, {
    maxDimension: 1200,
    format: 'webp',
    quality: 0.85,
  });
  await uploadToStorage(
    Buffer.from(await result.toArrayBuffer()),
    `images/${file.name}.webp`,
  );
  return result.metadata;
}
```

### URL processing

```ts
const result = await processImage('https://example.com/image.jpg', {
  maxDimension: 800,
  format: 'webp',
});
```

## Supported formats

| | Input | Output |
|-|-------|--------|
| **Node** (sharp) | PNG, JPEG, WebP, AVIF | PNG, JPEG, WebP, AVIF |
| **Browser** (canvas) | PNG, JPEG, WebP, AVIF | PNG, JPEG, WebP, AVIF\* |

\*AVIF encode in browsers is gated by the platform. Chrome/Firefox/Safari support varies; most modern engines work.

## Browser vs Node

- **Same import** (`import { processImage } from '@oddbits/imagebits'`) in both environments.
- **Bundler picks the build**: the `browser` field in `package.json` points web bundlers at the canvas build (no sharp); Node consumers get the sharp build.
- **Explicit subpaths** are also exposed if you need to bypass the bundler hint:
  - `@oddbits/imagebits/node` — force the sharp build
  - `@oddbits/imagebits/browser` — force the canvas build

## Versioning

The exported `VERSION` constant tracks `package.json` (kept in sync by release-please via `extra-files`). The browser web component reads it for the desktop window titlebar so a published version flows straight to the UI without a manual edit.

## License

MIT
