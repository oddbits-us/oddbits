/**
 * Node CLI for imagebits — resize, convert, optimize, and generate alt text
 * for one or many images via the same `processImages` helper the public API
 * uses. Backed by sharp; no headless browser.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { zipSync } from 'fflate';

import {
  buildAltTextManifest,
  generateLocalAltTextFromPath,
  nodeFormatHelpers,
  processImages,
  stringifyAltTextManifest,
  VERSION,
} from './index';
import type { AltTextEntry, ImageBitsResult, ImageFormat } from './types';

const SUPPORTED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

type ParsedCli = {
  inputs: string[];
  output?: string;
  recursive: boolean;
  maxDimension?: number;
  format?: ImageFormat;
  quality: number;
  altText: 'off' | 'local';
  altJson?: string;
  altModel?: string;
  zip?: string;
  concurrency: number;
  quiet: boolean;
};

function printHelp(): void {
  console.log(`imagebits — CLI for @oddbits/imagebits (Node / sharp)

Usage:
  imagebits [options] <input...> [output]

Arguments:
  input...           One or more file paths or directories. Shell globs
                     (e.g. *.png) are expanded by your shell.
  output             Output file (single input) or directory (multiple inputs).
                     If omitted, outputs are written next to source files.

Options:
  -m, --max-dimension <px>   Fit inside this width/height (maintains aspect ratio)
  -f, --format <fmt>         webp | avif | png | jpg | original (default: original)
  -q, --quality <0-1>        Lossy quality (default: 0.92)
  -r, --recursive            Recurse into subdirectories when an input is a directory
  --alt-text <mode>          off | local (default: off)
  --alt-json <path>          Write combined alt-text manifest JSON to this path
                             (default: alt-text.json next to the first output)
  --alt-model <name>         Local caption model id (default: Xenova/vit-gpt2-image-captioning)
  --zip <path>               Bundle all outputs (and the alt-text manifest if any)
                             into a single .zip archive at this path
  --concurrency <n>          Parallelism (default: 1 — sequential)
  -o, --output <path>        Output file (single input) or directory (multiple inputs)
  --quiet                    Minimal output
  -h, --help                 Show help
  -v, --version              Print version

Examples:
  imagebits photo.png -o photo.webp -f webp -m 1200 -q 0.9
  imagebits *.png -f webp -o ./out/
  imagebits ./src/images -r -f webp -o ./dist/images/
  imagebits ./photos -r --alt-text local --alt-json ./photos/alt-text.json
  imagebits ./photos -r -f webp --zip ./photos.zip
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

function parseInt1Plus(label: string, s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid ${label} "${s}". Use an integer >= 1.`);
  }
  return Math.round(n);
}

function parseArgs(argv: string[]): ParsedCli {
  const positional: string[] = [];
  let maxDimension: number | undefined;
  let format: ImageFormat | undefined;
  let quality = 0.92;
  let altText: 'off' | 'local' = 'off';
  let altJson: string | undefined;
  let altModel: string | undefined;
  let output: string | undefined;
  let recursive = false;
  let zip: string | undefined;
  let concurrency = 1;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
    if (a === '-v' || a === '--version') {
      console.log(VERSION);
      process.exit(0);
    }
    if (a === '--quiet') {
      quiet = true;
      continue;
    }
    if (a === '-r' || a === '--recursive') {
      recursive = true;
      continue;
    }
    if (a === '-m' || a === '--max-dimension') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --max-dimension');
      maxDimension = parseInt1Plus('max-dimension', v);
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
    if (a === '--zip') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --zip');
      zip = v;
      continue;
    }
    if (a === '--concurrency') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --concurrency');
      concurrency = parseInt1Plus('concurrency', v);
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

  return {
    inputs: positional,
    output,
    recursive,
    maxDimension,
    format,
    quality,
    altText,
    altJson,
    altModel,
    zip,
    concurrency,
    quiet,
  };
}

/**
 * Expand positional args into a flat list of file paths. Directories are
 * walked (with `--recursive` for nested traversal). Unsupported extensions
 * are skipped silently inside directory walks but error out for explicit
 * file args so users notice typos.
 */
function expandInputs(positionals: string[], recursive: boolean): string[] {
  const out: string[] = [];

  const isImagePath = (p: string) =>
    SUPPORTED_EXTS.has(path.extname(p).toLowerCase());

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (recursive) walk(full);
      } else if (e.isFile() && isImagePath(full)) {
        out.push(full);
      }
    }
  };

  for (const p of positionals) {
    const resolved = path.resolve(p);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input not found: ${p}`);
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      walk(resolved);
    } else if (stat.isFile()) {
      if (!isImagePath(resolved)) {
        throw new Error(
          `Unsupported input "${p}". Expected one of: ${[...SUPPORTED_EXTS].join(', ')}`,
        );
      }
      out.push(resolved);
    }
  }

  if (out.length === 0) {
    throw new Error(
      'No image files found. Pass file paths, a directory, or use --recursive for nested directories.',
    );
  }
  return out;
}

/**
 * Decide the output path for each input. Mirrors what a human would expect:
 *
 * - 1 input + `-o file`     -> write to that exact file
 * - 1 input + no `-o`       -> next to source, new extension
 * - N inputs + `-o dir`     -> write into that directory
 * - N inputs + no `-o`      -> next to each source file, new extension
 */
function planOutputs(
  inputs: string[],
  rawOutput: string | undefined,
  format: ImageFormat | undefined,
  rootForBase?: string,
): { input: string; output: string; outFormat: ReturnType<typeof nodeFormatHelpers.normalizeRequestedFormat> }[] {
  const requested = nodeFormatHelpers.normalizeRequestedFormat(format);
  const plans: ReturnType<typeof planOutputs> = [];

  const forSingle = (input: string): string => {
    if (rawOutput) return path.resolve(rawOutput);
    const formatForName =
      requested === 'original'
        ? nodeFormatHelpers.formatFromExtension(input) ?? 'png'
        : requested;
    const ext = nodeFormatHelpers.toExtension(formatForName);
    const dir = path.dirname(input);
    const base = path.basename(input, path.extname(input));
    return path.join(dir, `${base}${ext}`);
  };

  if (inputs.length === 1) {
    const input = inputs[0]!;
    plans.push({ input, output: forSingle(input), outFormat: requested });
    return plans;
  }

  // N inputs: -o is treated as a directory (created if missing).
  const outputDir = rawOutput ? path.resolve(rawOutput) : null;
  for (const input of inputs) {
    const formatForName =
      requested === 'original'
        ? nodeFormatHelpers.formatFromExtension(input) ?? 'png'
        : requested;
    const ext = nodeFormatHelpers.toExtension(formatForName);

    if (outputDir) {
      // Preserve relative path under the input root so directory structure
      // survives (e.g. ./src/a/b.png -> ./out/a/b.webp).
      const rel = rootForBase
        ? path.relative(rootForBase, input)
        : path.basename(input);
      const base = path.basename(rel, path.extname(rel));
      const subdir = path.dirname(rel);
      plans.push({
        input,
        output: path.join(outputDir, subdir, `${base}${ext}`),
        outFormat: requested,
      });
    } else {
      const dir = path.dirname(input);
      const base = path.basename(input, path.extname(input));
      plans.push({
        input,
        output: path.join(dir, `${base}${ext}`),
        outFormat: requested,
      });
    }
  }
  return plans;
}

function commonRoot(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  if (paths.length === 1) return path.dirname(paths[0]!);
  const split = paths.map((p) => p.split(path.sep));
  const first = split[0]!;
  let i = 0;
  outer: for (; i < first.length; i++) {
    for (const s of split) {
      if (s[i] !== first[i]) break outer;
    }
  }
  const root = first.slice(0, i).join(path.sep);
  return root || undefined;
}

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function writeResultToDisk(
  result: ImageBitsResult,
  outPath: string,
): Promise<number> {
  ensureDirFor(outPath);
  const ab = await result.toArrayBuffer();
  const buf = Buffer.from(new Uint8Array(ab));
  fs.writeFileSync(outPath, buf);
  return buf.byteLength;
}

async function runCli(parsed: ParsedCli): Promise<void> {
  const expanded = expandInputs(parsed.inputs, parsed.recursive);
  // Pick a root so directory layout is preserved when writing into -o <dir>.
  const root =
    parsed.inputs.length === 1 && fs.statSync(path.resolve(parsed.inputs[0]!)).isDirectory()
      ? path.resolve(parsed.inputs[0]!)
      : commonRoot(expanded);

  const plans = planOutputs(expanded, parsed.output, parsed.format, root);

  if (!parsed.quiet) {
    console.log(`imagebits: processing ${plans.length} file(s)...`);
  }

  const results = await processImages(
    plans.map((p) => p.input),
    {
      maxDimension: parsed.maxDimension,
      format: parsed.format,
      quality: parsed.quality,
      concurrency: parsed.concurrency,
    },
  );

  // Either write to disk (default) or collect into a zip archive.
  const zipEntries: Record<string, Uint8Array> = {};
  const written: { input: string; output: string; size: number; result: ImageBitsResult }[] = [];

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]!;
    const result = results[i]!;
    if (parsed.zip) {
      const ab = await result.toArrayBuffer();
      const archiveName =
        root && plan.input.startsWith(root)
          ? path.relative(root, plan.output) || path.basename(plan.output)
          : path.basename(plan.output);
      zipEntries[archiveName.split(path.sep).join('/')] = new Uint8Array(ab);
      written.push({ input: plan.input, output: archiveName, size: ab.byteLength, result });
      if (!parsed.quiet) console.log(`  + ${archiveName} (${ab.byteLength} bytes)`);
    } else {
      const size = await writeResultToDisk(result, plan.output);
      written.push({ input: plan.input, output: plan.output, size, result });
      if (!parsed.quiet) console.log(`  ${plan.output} (${size} bytes)`);
    }
  }

  // Optional alt-text pass — runs on the *output* files (or buffers, when zipping).
  let manifestJson: string | null = null;
  if (parsed.altText === 'local') {
    const entries: AltTextEntry[] = [];
    let usedModel = '';
    for (const w of written) {
      // For zip mode the file isn't on disk; write a temp file so the
      // existing path-based caption helper can read it. We delete it after.
      const tmpForCaption = parsed.zip
        ? path.join(
            fs.mkdtempSync(path.join(os.tmpdir(), 'imagebits-')),
            path.basename(w.output),
          )
        : null;
      const captionPath = tmpForCaption ?? w.output;
      if (tmpForCaption) {
        const ab = await w.result.toArrayBuffer();
        fs.writeFileSync(tmpForCaption, Buffer.from(new Uint8Array(ab)));
      }
      try {
        const alt = await generateLocalAltTextFromPath(captionPath, {
          model: parsed.altModel,
        });
        usedModel = alt.model;
        entries.push({
          inputName: path.basename(w.input),
          outputName: path.basename(w.output),
          width: w.result.metadata.width,
          height: w.result.metadata.height,
          altText: alt.altText,
          warnings: alt.warnings.length > 0 ? alt.warnings : undefined,
        });
      } finally {
        if (tmpForCaption) {
          try {
            fs.unlinkSync(tmpForCaption);
            fs.rmdirSync(path.dirname(tmpForCaption));
          } catch {
            /* best-effort cleanup */
          }
        }
      }
    }
    const manifest = buildAltTextManifest(entries, usedModel);
    manifestJson = stringifyAltTextManifest(manifest);
  }

  if (parsed.zip) {
    if (manifestJson) {
      zipEntries['alt-text.json'] = new TextEncoder().encode(manifestJson);
    }
    const zipPath = path.resolve(parsed.zip);
    ensureDirFor(zipPath);
    const archive = zipSync(zipEntries);
    fs.writeFileSync(zipPath, Buffer.from(archive));
    if (!parsed.quiet) {
      console.log(`Wrote ${zipPath} (${archive.byteLength} bytes, ${Object.keys(zipEntries).length} entries)`);
    }
  } else if (manifestJson) {
    const firstOutput = written[0]?.output;
    const defaultManifestPath = firstOutput
      ? path.join(path.dirname(firstOutput), 'alt-text.json')
      : path.resolve('alt-text.json');
    const manifestPath = path.resolve(parsed.altJson ?? defaultManifestPath);
    ensureDirFor(manifestPath);
    fs.writeFileSync(manifestPath, manifestJson);
    if (!parsed.quiet) console.log(`Wrote ${manifestPath}`);
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
