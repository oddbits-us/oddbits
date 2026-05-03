# @oddbits/gifbits

Crop a clip to **16:9**, **1:1**, or **9:16**, trim it, choose an output **frame rate**, and export **animated WebP** (default in the Oddbits browser workshop), **AVIF**, **GIF**, or a **PNG image sequence** zipped under `images/frame_0001.png`, … — planned so you can run the same filters in **ffmpeg.wasm** (Oddbits workshop) or **desktop ffmpeg** (CLI).

Frame rate is explicit (`fps` on the encode plan, default **12**). **`maxDimensionPx`** caps the longest side after crop (same idea as ImageBits `maxDimension` — `scale=WxH:force_original_aspect_ratio=decrease`). **`quality`** (1–100) controls output quality/file size tradeoff (WebP `-q:v`, GIF palette size, AV1 **`-crf`**) and does not change resolution by itself.

**Animated AVIF** needs ffmpeg built with **libaom-av1**. If your wasm/static build omits it, pick WebP or GIF in the workshop.

This package does **not** embed ffmpeg in Node; it exports filter graphs and argv builders you can pass to ffmpeg yourself.

## Oddbits desktop (browser workshop)

On the Oddbits site, open the **GifBits** window and use **How To** / **?** for the in-app guide. The workshop mirrors this README: **`h2` + `.docs-section`** layout (`apps/web/UI_THEME.md`). Encoding uses **ffmpeg.wasm** from `@ffmpeg/core`, bundled by Vite for the web app; nothing is uploaded.

## Install

```bash
npm install @oddbits/gifbits
```

## Library

```ts
import {
  buildVideoFilterChain,
  clampPlanFps,
  describeRecipe,
  resolveEncodeParams,
  type GifBitsEncodePlan,
} from '@oddbits/gifbits';

const plan: GifBitsEncodePlan = {
  cropRatio: '9:16',
  trimStart: 0,
  trimEnd: 6,
  quality: 75,
  maxDimensionPx: 1080,
  fps: 15,
  format: 'avif',
};

console.log(describeRecipe(plan, 'promo.mp4', 'hero.avif'));

const resolved = resolveEncodeParams(plan.quality);
const vf = buildVideoFilterChain(plan, resolved);
```

### Optional: raster Bodymovin JSON

For rare pipelines that need a minimal **Bodymovin** JSON over PNG assets, `buildRasterLottieJson()` remains exported from `./lottie-raster`. It is **not** used by the Oddbits workshop UI (which ships PNG-only zips for image sequence).

## CLI

CLI defaults: **`--format avif`**, **`--fps 12`** (the browser workshop defaults to **WebP** because AV1 is slow in wasm).

Print a shell-ready ffmpeg command (no local ffmpeg required):

```bash
npx @oddbits/gifbits recipe --ratio 9:16 --start 0 --end 4.5 --format avif --quality 80 --fps 12
```

PNG sequence recipe (no zip; bundle frames yourself or use the workshop):

```bash
npx @oddbits/gifbits recipe --format image-sequence --fps 12 --start 0 --end 3
```

Run ffmpeg if it is on your `PATH` (**AVIF**, **WebP**, or **GIF** — not PNG zip):

```bash
npx @oddbits/gifbits convert -i clip.mp4 -o out.avif --ratio 1:1 --start 1 --end 5 --format avif --fps 15
```

`gifbits convert` does **not** write PNG zip archives; use **`recipe --format image-sequence`** or the browser workshop for numbered PNGs.

## Privacy

Planning code only; ffmpeg runs wherever you invoke it (browser wasm or your machine). Oddbits does not upload your media.

## License

MIT. Bundled **ffmpeg.wasm** binaries used by the Oddbits web app are GPL-2.0-or-later (see project `CREDITS.md`).
