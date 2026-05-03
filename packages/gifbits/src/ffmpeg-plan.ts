/**
 * Pure ffmpeg filter / argument builders — shared by the browser (wasm) workshop
 * and the Node CLI recipe printer.
 */

import type { AnimatedExportFormat, CropRatio, GifBitsEncodePlan, ResolvedEncodeParams } from './types';

/** Width / height ratio (w/h) for each crop preset. */
export function cropRatioToFraction(ratio: CropRatio): { rw: number; rh: number } {
  switch (ratio) {
    case '16:9':
      return { rw: 16, rh: 9 };
    case '1:1':
      return { rw: 1, rh: 1 };
    case '9:16':
      return { rw: 9, rh: 16 };
    default: {
      const _exhaustive: never = ratio;
      return _exhaustive;
    }
  }
}

/**
 * Center-crop to the largest rectangle with aspect rw:rh that fits inside the frame.
 * Uses even dimensions for codec friendliness.
 *
 * Uses `min()` for w/h (same geometry as center-crop `if(gt(iw/ih,ar)),…)` but fewer commas.
 * x/y center using output vars (`ow`/`oh`) instead of `w`/`h`; some ffmpeg builds do not
 * resolve `w`/`h` in x/y expressions and error with "Undefined constant ... in 'w/2'".
 *
 * Commas inside `min(a\,b)` must be `\,` or the top-level `-vf` / filter_complex parser
 * treats them as filter separators.
 */
export function buildCenterCropFilter(ratio: CropRatio): string {
  const { rw, rh } = cropRatioToFraction(ratio);
  const ar = rw / rh;
  return [
    `crop=w=trunc(min(iw\\,ih*${ar})/2)*2`,
    `h=trunc(min(ih\\,iw*${rh}/${rw})/2)*2`,
    `x=(iw-ow)/2`,
    `y=(ih-oh)/2`,
  ].join(':');
}

export function resolveEncodeParams(quality: number): ResolvedEncodeParams {
  const q = Math.min(100, Math.max(1, quality));
  const webpQ = Math.round(55 + (q / 100) * 40);
  const gifColors = q >= 75 ? 256 : q >= 45 ? 128 : 64;
  const avifCrf = Math.round(55 - ((q - 1) / 99) * 35);
  return { webpQ, gifColors, avifCrf };
}

/**
 * Fit cropped frame inside an `{maxDim}x{maxDim}` box (aspect preserved); matches ImageBits-style max dimension.
 */
export function buildScaleToMaxDimension(maxDimensionPx: number): string {
  const m = Math.max(64, Math.min(4096, Math.round(maxDimensionPx)));
  // Never upscale: clamp each axis to source-or-max before preserving aspect ratio.
  return `scale=w=min(iw\\,${m}):h=min(ih\\,${m}):force_original_aspect_ratio=decrease`;
}

/**
 * Percent positions (0–100) of the center-crop window over the **full video frame**, for UI overlays.
 * `videoWidthOverHeight` is intrinsic `video.videoWidth / video.videoHeight`.
 */
export function cropRegionPercentages(
  videoWidthOverHeight: number,
  ratio: CropRatio,
): { leftPct: number; topPct: number; widthPct: number; heightPct: number } {
  const { rw, rh } = cropRatioToFraction(ratio);
  const C = rw / rh;
  const V = videoWidthOverHeight;
  if (!Number.isFinite(V) || V <= 0) {
    return { leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 };
  }
  if (V >= C) {
    const widthPct = (C / V) * 100;
    return {
      leftPct: (100 - widthPct) / 2,
      topPct: 0,
      widthPct,
      heightPct: 100,
    };
  }
  const heightPct = (V / C) * 100;
  return {
    leftPct: 0,
    topPct: (100 - heightPct) / 2,
    widthPct: 100,
    heightPct,
  };
}

/** Clamp user-requested frame rate for the `fps` filter (1–30). */
export function clampPlanFps(fps: number): number {
  if (!Number.isFinite(fps)) return 12;
  return Math.min(30, Math.max(1, Math.round(fps)));
}

export function buildFpsFilter(fps: number): string {
  return `fps=${fps}`;
}

export function trimDurationSeconds(plan: GifBitsEncodePlan): number {
  return Math.max(0, plan.trimEnd - plan.trimStart);
}

export function buildVideoFilterChain(plan: GifBitsEncodePlan, _resolved: ResolvedEncodeParams): string {
  const crop = buildCenterCropFilter(plan.cropRatio);
  const scale = buildScaleToMaxDimension(plan.maxDimensionPx);
  const fpsFilter = buildFpsFilter(clampPlanFps(plan.fps));
  return [crop, scale, fpsFilter].join(',');
}

/** Animated AVIF via libaom-av1. Requires ffmpeg built with libaom. */
export function buildAnimatedAvifArgs(
  vf: string,
  trimStart: number,
  duration: number,
  avifCrf: number,
  outputName: string,
): string[] {
  return [
    '-i',
    'input',
    '-ss',
    String(trimStart),
    '-t',
    String(duration),
    '-an',
    '-vf',
    vf,
    '-c:v',
    'libaom-av1',
    '-crf',
    String(avifCrf),
    '-b:v',
    '0',
    '-cpu-used',
    '8',
    '-pix_fmt',
    'yuv420p',
    outputName,
  ];
}

/** ffmpeg/libwebp flag varies by build; wasm typically accepts `-q:v` for webp. */
export function buildAnimatedWebpArgs(
  vf: string,
  trimStart: number,
  duration: number,
  webpQ: number,
  outputName: string,
): string[] {
  return [
    '-i',
    'input',
    '-ss',
    String(trimStart),
    '-t',
    String(duration),
    '-an',
    '-vf',
    vf,
    '-c:v',
    'libwebp',
    '-loop',
    '0',
    '-preset',
    'picture',
    '-q:v',
    String(webpQ),
    '-compression_level',
    '6',
    '-pix_fmt',
    'yuva420p',
    outputName,
  ];
}

export function buildGifArgs(vfPalette: string, trimStart: number, duration: number, outputName: string): string[] {
  return [
    '-i',
    'input',
    '-ss',
    String(trimStart),
    '-t',
    String(duration),
    '-an',
    '-filter_complex',
    vfPalette,
    '-gifflags',
    '+transdiff',
    '-y',
    outputName,
  ];
}

export function buildGifFilterComplex(plan: GifBitsEncodePlan, resolved: ResolvedEncodeParams): string {
  const base = buildVideoFilterChain(plan, resolved);
  const split = `${base},split[s0][s1];[s0]palettegen=reserve_transparent=1:max_colors=${resolved.gifColors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
  return split;
}

/** PNG sequence (`frame_%04d.png`); pair with a zip step for download. */
export function buildPngSequenceArgs(vf: string, trimStart: number, duration: number, pattern: string): string[] {
  return [
    '-i',
    'input',
    '-ss',
    String(trimStart),
    '-t',
    String(duration),
    '-an',
    '-vf',
    vf,
    '-vsync',
    '0',
    pattern,
  ];
}

export function outputExtensionForFormat(format: AnimatedExportFormat): string {
  switch (format) {
    case 'avif':
      return 'avif';
    case 'webp':
      return 'webp';
    case 'gif':
      return 'gif';
    case 'image-sequence':
      return 'zip';
    default: {
      const _e: never = format;
      return _e;
    }
  }
}

export function formatRequiresFilterComplex(format: AnimatedExportFormat): boolean {
  return format === 'gif';
}

function shellQuoteArg(s: string): string {
  if (/[\s"'\\]/.test(s)) return `'${s.replace(/'/g, `'\\''`)}'`;
  return s;
}

/** Join ffmpeg argv for shell display; replaces virtual input name `input`. */
export function argvToShell(argv: string[], inputLabel: string): string {
  return ['ffmpeg', ...argv.map((x) => (x === 'input' ? shellQuoteArg(inputLabel) : shellQuoteArg(x)))].join(' ');
}

export function describeRecipe(plan: GifBitsEncodePlan, inputLabel = 'input.mp4', outputLabel?: string): string {
  const resolved = resolveEncodeParams(plan.quality);
  const dur = trimDurationSeconds(plan);
  const ext = outputExtensionForFormat(plan.format);
  const out = outputLabel ?? `out.${ext}`;
  const vf = buildVideoFilterChain(plan, resolved);

  const inputArg = shellQuoteArg(inputLabel);
  const outArg = shellQuoteArg(out);

  if (plan.format === 'gif') {
    const fc = buildGifFilterComplex(plan, resolved);
    return `ffmpeg -i ${inputArg} -ss ${plan.trimStart} -t ${dur} -an -filter_complex ${shellQuoteArg(fc)} -gifflags +transdiff -y ${outArg}`;
  }

  if (plan.format === 'webp') {
    const a = buildAnimatedWebpArgs(vf, plan.trimStart, dur, resolved.webpQ, out);
    return argvToShell(a, inputLabel);
  }

  if (plan.format === 'avif') {
    const a = buildAnimatedAvifArgs(vf, plan.trimStart, dur, resolved.avifCrf, out);
    return argvToShell(a, inputLabel);
  }

  return [
    `# PNG sequence (${clampPlanFps(plan.fps)} fps); zip frames yourself or use the Oddbits GifBits workshop`,
    `ffmpeg -i ${inputArg} -ss ${plan.trimStart} -t ${dur} -an -vf ${shellQuoteArg(vf)} frame_%04d.png`,
  ].join('\n');
}
