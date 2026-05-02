/**
 * Node CLI for imagebits — resize, convert, optimize via sharp.
 * Browser/library code uses Canvas; CLI uses sharp for parity of options.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { buildAltTextManifest, generateLocalAltTextFromPath, stringifyAltTextManifest } from './alt-text';
import type { AltTextEntry, ImageFormat } from './types';

function readPackageVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(dir, '..', 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  return JSON.parse(raw).version as string;
}

type ParsedCli = {
  input: string;
  output?: string;
  maxDimension?: number;
  format?: ImageFormat;
  quality: number;
  altText: 'off' | 'local';
  altJson?: string;
  altModel?: string;
  quiet: boolean;
};

function printHelp(): void {
  console.log(`imagebits — CLI for @oddbits/imagebits (Node / sharp)

Usage:
  imagebits [options] <input> [output]

Arguments:
  input              Path to source image
  output             Output path (default: same folder, name + format extension)

Options:
  -m, --max-dimension <px>   Fit inside this width/height (maintains aspect ratio)
  -f, --format <fmt>        webp | avif | png | jpg | original (default: original)
  -q, --quality <0-1>       Lossy quality (default: 0.92)
  --alt-text <mode>         off | local (default: off)
  --alt-json <path>         Write local alt-text manifest JSON to this path
  --alt-model <name>        Local caption model id (default: Xenova/vit-gpt2-image-captioning)
  -o, --output <path>       Output file path (optional; default is derived from input)
  --quiet                   Minimal output
  -h, --help                Show help
  -v, --version             Print version

Examples:
  npx @oddbits/imagebits photo.png out.webp
  npx @oddbits/imagebits -m 1200 -f webp ./hero.jpg
`);
}

function parseQuality(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`Invalid quality "${s}". Use a number between 0 and 1.`);
  }
  return n;
}

function parseFormat(s: string): ImageFormat {
  const lower = s.toLowerCase();
  if (lower === 'jpeg') return 'jpg';
  if (['webp', 'avif', 'png', 'jpg', 'original'].includes(lower)) {
    return lower as ImageFormat;
  }
  throw new Error(`Unknown format "${s}". Use webp, avif, png, jpg, or original.`);
}

function parseArgs(argv: string[]): ParsedCli {
  const positional: string[] = [];
  let maxDimension: number | undefined;
  let format: ImageFormat | undefined;
  let quality = 0.92;
  let altText: 'off' | 'local' = 'off';
  let altJson: string | undefined;
  let altModel: string | undefined;
  let quiet = false;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
    if (a === '-v' || a === '--version') {
      console.log(readPackageVersion());
      process.exit(0);
    }
    if (a === '--quiet') {
      quiet = true;
      continue;
    }
    if (a === '-m' || a === '--max-dimension') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --max-dimension');
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid max-dimension "${v}"`);
      maxDimension = Math.round(n);
      continue;
    }
    if (a === '-f' || a === '--format') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --format');
      format = parseFormat(v);
      continue;
    }
    if (a === '-q' || a === '--quality') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --quality');
      quality = parseQuality(v);
      continue;
    }
    if (a === '-o' || a === '--output') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --output');
      output = v;
      continue;
    }
    if (a === '--alt-text') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --alt-text');
      if (v !== 'off' && v !== 'local') {
        throw new Error(`Invalid alt-text mode "${v}". Use "off" or "local".`);
      }
      altText = v;
      continue;
    }
    if (a === '--alt-json') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --alt-json');
      altJson = v;
      continue;
    }
    if (a === '--alt-model') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --alt-model');
      altModel = v;
      continue;
    }
    if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`);
    }
    positional.push(a);
  }

  if (positional.length < 1) {
    printHelp();
    process.exit(1);
  }

  const input = positional[0]!;
  if (positional.length > 2) {
    throw new Error('Too many arguments. Use: imagebits [options] <input> [output]');
  }
  const outputArg = output ?? positional[1];

  return {
    input,
    output: outputArg,
    maxDimension,
    format,
    quality,
    altText,
    altJson,
    altModel,
    quiet,
  };
}

type NormalizedFormat = 'webp' | 'avif' | 'png' | 'jpg';

function extForFormat(f: NormalizedFormat): string {
  switch (f) {
    case 'jpg':
      return '.jpg';
    case 'webp':
      return '.webp';
    case 'avif':
      return '.avif';
    case 'png':
      return '.png';
  }
}

function formatFromExtension(filePath: string): NormalizedFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
  if (ext === '.png') return 'png';
  if (ext === '.webp') return 'webp';
  if (ext === '.avif') return 'avif';
  return undefined;
}

function metaFormatToNormalized(fmt: string | undefined): NormalizedFormat {
  switch (fmt) {
    case 'jpeg':
    case 'jpg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'avif':
    case 'heif':
      return 'avif';
    default:
      return 'png';
  }
}

function normalizeRequestedFormat(f: ImageFormat | undefined): NormalizedFormat | 'original' {
  if (!f || f === 'original') return 'original';
  if (f === 'jpeg') return 'jpg';
  return f as NormalizedFormat;
}

function applyEncoder(
  pipeline: sharp.Sharp,
  format: NormalizedFormat,
  quality: number
): sharp.Sharp {
  const q = Math.round(quality * 100);
  switch (format) {
    case 'webp':
      return pipeline.webp({ quality: q });
    case 'avif':
      return pipeline.avif({ quality: q });
    case 'png':
      return pipeline.png({ compressionLevel: 9, quality: q });
    case 'jpg':
      return pipeline.jpeg({ quality: q, mozjpeg: true });
  }
}

function defaultOutputPath(inputPath: string, format: NormalizedFormat): string {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}${extForFormat(format)}`);
}

async function runCli(parsed: ParsedCli): Promise<void> {
  const inputPath = path.resolve(parsed.input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input not found: ${inputPath}`);
  }

  let pipeline = sharp(inputPath);
  const meta = await pipeline.metadata();

  if (
    parsed.maxDimension &&
    meta.width &&
    meta.height &&
    (meta.width > parsed.maxDimension || meta.height > parsed.maxDimension)
  ) {
    pipeline = pipeline.resize(parsed.maxDimension, parsed.maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const requested = normalizeRequestedFormat(parsed.format);
  let outFormat: NormalizedFormat;

  if (requested === 'original') {
    if (parsed.output) {
      const fromPath = formatFromExtension(parsed.output);
      outFormat = fromPath ?? metaFormatToNormalized(meta.format);
    } else {
      outFormat = metaFormatToNormalized(meta.format);
    }
  } else {
    outFormat = requested;
  }

  pipeline = applyEncoder(pipeline, outFormat, parsed.quality);

  let outPath: string;
  if (parsed.output) {
    outPath = path.resolve(parsed.output);
  } else {
    outPath = defaultOutputPath(inputPath, outFormat);
  }

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await pipeline.toFile(outPath);

  const st = fs.statSync(outPath);
  if (!parsed.quiet) {
    console.log(`Wrote ${outPath} (${st.size} bytes)`);
  }

  if (parsed.altText === 'local') {
    const alt = await generateLocalAltTextFromPath(outPath, { model: parsed.altModel });
    const outMeta = await sharp(outPath).metadata();
    const entry: AltTextEntry = {
      inputName: path.basename(inputPath),
      outputName: path.basename(outPath),
      width: outMeta.width ?? 0,
      height: outMeta.height ?? 0,
      altText: alt.altText,
      warnings: alt.warnings.length > 0 ? alt.warnings : undefined,
    };
    const manifest = buildAltTextManifest([entry], alt.model);
    const manifestPath = path.resolve(
      parsed.altJson ?? path.join(path.dirname(outPath), 'alt-text.json')
    );
    const manifestDir = path.dirname(manifestPath);
    if (!fs.existsSync(manifestDir)) {
      fs.mkdirSync(manifestDir, { recursive: true });
    }
    fs.writeFileSync(manifestPath, stringifyAltTextManifest(manifest), 'utf8');
    if (!parsed.quiet) {
      console.log(`Wrote ${manifestPath}`);
    }
  }
}

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const parsed = parseArgs(argv);
    await runCli(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`imagebits: ${msg}`);
    process.exit(1);
  }
}

void main();
